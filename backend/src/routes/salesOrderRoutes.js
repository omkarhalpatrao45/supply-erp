const express = require('express');
const pool = require('../config/db');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', authorizeRoles('ADMIN', 'SALES_USER'), async (req, res) => {
  try {
    const orderResult = await pool.query(
      `SELECT so.id, so.order_number, so.quotation_id, so.order_date, so.total_amount, so.status,
        c.id AS customer_id, c.company_name
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id
       ORDER BY so.id DESC`
    );
    const orders = orderResult.rows;

    if (orders.length === 0) {
      return res.json([]);
    }

    const itemResult = await pool.query(
      `SELECT soi.sales_order_id, soi.product_id, soi.quantity, soi.unit_price, soi.line_amount,
        p.product_code, p.product_name, p.unit,
        i.physical_qty, i.reserved_qty,
        COALESCE(i.physical_qty - i.reserved_qty, 0) AS available_qty
       FROM sales_order_items soi
       JOIN products p ON p.id = soi.product_id
       LEFT JOIN inventory i ON i.product_id = soi.product_id
       WHERE soi.sales_order_id = ANY($1::int[])
       ORDER BY soi.id`,
      [orders.map((order) => order.id)]
    );
    const itemsByOrder = new Map();

    for (const item of itemResult.rows) {
      const items = itemsByOrder.get(item.sales_order_id) || [];
      items.push(item);
      itemsByOrder.set(item.sales_order_id, items);
    }

    return res.json(
      orders.map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) || [],
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load Sales Orders.' });
  }
});

router.post('/:id/confirm', authorizeRoles('ADMIN'), async (req, res) => {
  const orderId = Number(req.params.id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: 'A valid Sales Order is required.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT id, status FROM sales_orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Sales Order does not exist.' });
    }

    const order = orderResult.rows[0];

    if (order.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Order cannot be confirmed. It has been cancelled.' });
    }

    if (order.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Order cannot be confirmed. Its status is ${order.status}.` });
    }

    const itemResult = await client.query(
      `SELECT soi.product_id, soi.quantity, p.product_name
       FROM sales_order_items soi
       JOIN products p ON p.id = soi.product_id
       WHERE soi.sales_order_id = $1
       ORDER BY soi.product_id`,
      [orderId]
    );
    const items = itemResult.rows;

    const inventoryResult = await client.query(
      `SELECT product_id, physical_qty, reserved_qty
       FROM inventory
       WHERE product_id = ANY($1::int[])
       ORDER BY product_id
       FOR UPDATE`,
      [items.map((item) => item.product_id)]
    );
    const inventoryByProduct = new Map(
      inventoryResult.rows.map((inventory) => [inventory.product_id, inventory])
    );

    for (const item of items) {
      const inventory = inventoryByProduct.get(item.product_id);

      if (!inventory) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Order cannot be confirmed. Inventory is not configured for ${item.product_name}.`,
        });
      }

      const availableQty = inventory.physical_qty - inventory.reserved_qty;

      if (item.quantity > availableQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Order cannot be confirmed. Only ${availableQty} units are available, but ${item.quantity} units were requested.`,
        });
      }
    }

    for (const item of items) {
      await client.query(
        `UPDATE inventory
         SET reserved_qty = reserved_qty + $1, updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    await client.query("UPDATE sales_orders SET status = 'CONFIRMED' WHERE id = $1", [orderId]);
    await client.query('COMMIT');

    return res.json({ id: orderId, status: 'CONFIRMED' });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ message: 'Unable to confirm Sales Order.' });
  } finally {
    client.release();
  }
});

router.post('/:id/dispatch', authorizeRoles('ADMIN'), async (req, res) => {
  const orderId = Number(req.params.id);
  const { dispatch_date, vehicle_number, driver_name } = req.body;

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: 'A valid Sales Order is required.' });
  }

  if (!vehicle_number || typeof vehicle_number !== 'string' || !vehicle_number.trim()) {
    return res.status(400).json({ message: 'Vehicle number is required.' });
  }

  if (!driver_name || typeof driver_name !== 'string' || !driver_name.trim()) {
    return res.status(400).json({ message: 'Driver name is required.' });
  }

  if (dispatch_date && typeof dispatch_date !== 'string') {
    return res.status(400).json({ message: 'Dispatch date must be a valid date.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT id, status FROM sales_orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Sales Order does not exist.' });
    }

    const order = orderResult.rows[0];

    if (order.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Dispatch cannot be processed. The Sales Order is cancelled.' });
    }

    if (order.status === 'DISPATCHED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Dispatch has already been processed for this Sales Order.' });
    }

    if (order.status !== 'CONFIRMED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Dispatch can only be processed for a confirmed Sales Order.' });
    }

    const existingDispatch = await client.query(
      'SELECT id FROM dispatches WHERE sales_order_id = $1',
      [orderId]
    );

    if (existingDispatch.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Dispatch has already been processed for this Sales Order.' });
    }

    const itemResult = await client.query(
      `SELECT soi.product_id, soi.quantity, p.product_name
       FROM sales_order_items soi
       JOIN products p ON p.id = soi.product_id
       WHERE soi.sales_order_id = $1
       ORDER BY soi.product_id`,
      [orderId]
    );
    const items = itemResult.rows;

    const inventoryResult = await client.query(
      `SELECT product_id, physical_qty, reserved_qty
       FROM inventory
       WHERE product_id = ANY($1::int[])
       ORDER BY product_id
       FOR UPDATE`,
      [items.map((item) => item.product_id)]
    );
    const inventoryByProduct = new Map(
      inventoryResult.rows.map((inventory) => [inventory.product_id, inventory])
    );

    for (const item of items) {
      const inventory = inventoryByProduct.get(item.product_id);

      if (!inventory) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Dispatch cannot be processed. Inventory is not configured for ${item.product_name}.`,
        });
      }

      if (item.quantity > inventory.reserved_qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Dispatch cannot be processed. Only ${inventory.reserved_qty} units are reserved, but ${item.quantity} units were requested.`,
        });
      }

      if (item.quantity > inventory.physical_qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Dispatch cannot be processed. Only ${inventory.physical_qty} physical units are available.`,
        });
      }
    }

    const sequenceResult = await client.query(
      "SELECT nextval(pg_get_serial_sequence('dispatches', 'id')) AS id"
    );
    const id = Number(sequenceResult.rows[0].id);
    const dispatchNumber = `DSP-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;

    const dispatchResult = await client.query(
      `INSERT INTO dispatches (
        id, dispatch_number, sales_order_id, dispatch_date, vehicle_number, driver_name
      )
      VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
      RETURNING id, dispatch_number, sales_order_id, dispatch_date, vehicle_number, driver_name`,
      [id, dispatchNumber, orderId, dispatch_date || null, vehicle_number.trim(), driver_name.trim()]
    );

    for (const item of items) {
      await client.query(
        'INSERT INTO dispatch_items (dispatch_id, product_id, quantity) VALUES ($1, $2, $3)',
        [id, item.product_id, item.quantity]
      );
      await client.query(
        `UPDATE inventory
         SET physical_qty = physical_qty - $1,
           reserved_qty = reserved_qty - $1,
           updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    await client.query("UPDATE sales_orders SET status = 'DISPATCHED' WHERE id = $1", [orderId]);
    await client.query('COMMIT');

    return res.status(201).json({ ...dispatchResult.rows[0], items });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ message: 'Unable to process dispatch.' });
  } finally {
    client.release();
  }
});

module.exports = router;
