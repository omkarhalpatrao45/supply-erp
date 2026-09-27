const express = require('express');
const pool = require('../config/db');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', authorizeRoles('ADMIN', 'SALES_USER'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.product_id, i.physical_qty, i.reserved_qty,
        i.physical_qty - i.reserved_qty AS available_qty,
        p.product_code, p.product_name, p.category, p.unit, p.base_price
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       ORDER BY p.product_code`
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load inventory.' });
  }
});

router.post('/products', authorizeRoles('ADMIN'), async (req, res) => {
  const { product_code, product_name, category, unit, base_price, physical_qty } = req.body;

  if (!product_code || !String(product_code).trim()) {
    return res.status(400).json({ message: 'Product code is required.' });
  }
  if (!product_name || !String(product_name).trim()) {
    return res.status(400).json({ message: 'Product name is required.' });
  }
  if (!category || !String(category).trim()) {
    return res.status(400).json({ message: 'Category is required.' });
  }
  if (!unit || !String(unit).trim()) {
    return res.status(400).json({ message: 'Unit is required.' });
  }
  const price = Number(base_price);
  if (isNaN(price) || price < 0) {
    return res.status(400).json({ message: 'Base price must be a non-negative number.' });
  }
  const qty = Number(physical_qty);
  if (!Number.isInteger(qty) || qty < 0) {
    return res.status(400).json({ message: 'Initial quantity must be a non-negative integer.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productResult = await client.query(
      `INSERT INTO products (product_code, product_name, category, unit, base_price)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, product_code, product_name, category, unit, base_price`,
      [product_code.trim(), product_name.trim(), category.trim(), unit.trim(), price]
    );
    const product = productResult.rows[0];

    await client.query(
      `INSERT INTO inventory (product_id, physical_qty, reserved_qty)
       VALUES ($1, $2, 0)`,
      [product.id, qty]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      product_id: product.id,
      product_code: product.product_code,
      product_name: product.product_name,
      category: product.category,
      unit: product.unit,
      base_price: product.base_price,
      physical_qty: qty,
      reserved_qty: 0,
      available_qty: qty,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A product with this code already exists.' });
    }
    return res.status(500).json({ message: 'Unable to create product.' });
  } finally {
    client.release();
  }
});

router.patch('/:productId', authorizeRoles('ADMIN'), async (req, res) => {
  const productId = Number(req.params.productId);
  const { physical_qty } = req.body;

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: 'A valid product is required.' });
  }

  if (!Number.isInteger(physical_qty) || physical_qty < 0) {
    return res.status(400).json({ message: 'Physical quantity must be a non-negative integer.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inventoryResult = await client.query(
      'SELECT product_id, reserved_qty FROM inventory WHERE product_id = $1 FOR UPDATE',
      [productId]
    );

    if (inventoryResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Inventory record does not exist for this product.' });
    }

    const inventory = inventoryResult.rows[0];

    if (physical_qty < inventory.reserved_qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Physical quantity cannot be lower than the ${inventory.reserved_qty} reserved units.`,
      });
    }

    const result = await client.query(
      `UPDATE inventory
       SET physical_qty = $1, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $2
       RETURNING product_id, physical_qty, reserved_qty, physical_qty - reserved_qty AS available_qty`,
      [physical_qty, productId]
    );

    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ message: 'Unable to update inventory.' });
  } finally {
    client.release();
  }
});

module.exports = router;
