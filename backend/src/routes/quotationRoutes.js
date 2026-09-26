const express = require('express');
const pool = require('../config/db');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

function roundAmount(value) {
  return Number(value.toFixed(2));
}

router.use(authenticate);

router.post('/', authorizeRoles('SALES_USER'), async (req, res) => {
  const { enquiry_id, valid_until, items, discount_percent = 0, gst_percent = 0 } = req.body;

  if (!Number.isInteger(enquiry_id) || enquiry_id <= 0) {
    return res.status(400).json({ message: 'A valid enquiry is required.' });
  }

  if (!valid_until || typeof valid_until !== 'string') {
    return res.status(400).json({ message: 'Valid until date is required.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'At least one quotation item is required.' });
  }

  if (
    !Number.isFinite(discount_percent) || discount_percent < 0 || discount_percent > 100 ||
    !Number.isFinite(gst_percent) || gst_percent < 0
  ) {
    return res.status(400).json({ message: 'Discount and GST percentages are invalid.' });
  }

  if (
    items.some(
      (item) => !Number.isInteger(item.product_id) || item.product_id <= 0 ||
        !Number.isInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.unit_price) || item.unit_price < 0
    )
  ) {
    return res.status(400).json({ message: 'Each item must have a valid product, quantity and unit price.' });
  }

  const productIds = items.map((item) => item.product_id);

  if (new Set(productIds).size !== productIds.length) {
    return res.status(400).json({ message: 'A product can only be added once to a quotation.' });
  }

  const calculatedItems = items.map((item) => {
    const baseAmount = item.quantity * item.unit_price;
    const discountedAmount = baseAmount * (1 - discount_percent / 100);

    return {
      ...item,
      line_amount: roundAmount(discountedAmount * (1 + gst_percent / 100)),
    };
  });
  const totalAmount = roundAmount(
    calculatedItems.reduce((total, item) => total + item.line_amount, 0)
  );

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const enquiryResult = await client.query(
      'SELECT id, customer_id FROM enquiries WHERE id = $1 FOR UPDATE',
      [enquiry_id]
    );

    if (enquiryResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Enquiry does not exist.' });
    }

    const existingQuotation = await client.query(
      'SELECT id FROM quotations WHERE enquiry_id = $1',
      [enquiry_id]
    );

    if (existingQuotation.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Quotation already exists for this enquiry.' });
    }

    const productResult = await client.query(
      'SELECT id FROM products WHERE id = ANY($1::int[])',
      [productIds]
    );

    if (productResult.rowCount !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'One or more products do not exist.' });
    }

    const sequenceResult = await client.query(
      "SELECT nextval(pg_get_serial_sequence('quotations', 'id')) AS id"
    );
    const id = Number(sequenceResult.rows[0].id);
    const quotationNumber = `QUO-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
    const customerId = enquiryResult.rows[0].customer_id;

    const quotationResult = await client.query(
      `INSERT INTO quotations (
        id, quotation_number, enquiry_id, customer_id, valid_until,
        discount_percent, gst_percent, total_amount, created_by
      )
      VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9)
      RETURNING id, quotation_number, enquiry_id, customer_id, valid_until,
        discount_percent, gst_percent, total_amount, status, created_at`,
      [
        id, quotationNumber, enquiry_id, customerId, valid_until,
        discount_percent, gst_percent, totalAmount, req.user.userId,
      ]
    );

    for (const item of calculatedItems) {
      await client.query(
        `INSERT INTO quotation_items (
          quotation_id, product_id, quantity, unit_price, discount_percent, gst_percent, line_amount
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id, item.product_id, item.quantity, item.unit_price,
          discount_percent, gst_percent, item.line_amount,
        ]
      );
    }

    await client.query("UPDATE enquiries SET status = 'QUOTED' WHERE id = $1", [enquiry_id]);
    await client.query('COMMIT');

    return res.status(201).json({ ...quotationResult.rows[0], items: calculatedItems });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      return res.status(409).json({ message: 'Quotation already exists for this enquiry.' });
    }

    return res.status(500).json({ message: 'Unable to create quotation.' });
  } finally {
    client.release();
  }
});

router.patch('/:id/status', authorizeRoles('SALES_USER'), async (req, res) => {
  const quotationId = Number(req.params.id);
  const { status } = req.body;

  if (!Number.isInteger(quotationId) || quotationId <= 0) {
    return res.status(400).json({ message: 'A valid quotation is required.' });
  }

  if (!['SENT', 'ACCEPTED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ message: 'Quotation status must be SENT, ACCEPTED or REJECTED.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const quotationResult = await client.query(
      'SELECT id, enquiry_id, status FROM quotations WHERE id = $1 FOR UPDATE',
      [quotationId]
    );

    if (quotationResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Quotation does not exist.' });
    }

    const quotation = quotationResult.rows[0];

    if (['ACCEPTED', 'REJECTED'].includes(quotation.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Finalized quotations cannot change status.' });
    }

    await client.query('UPDATE quotations SET status = $1 WHERE id = $2', [status, quotationId]);

    if (status === 'ACCEPTED') {
      await client.query("UPDATE enquiries SET status = 'WON' WHERE id = $1", [quotation.enquiry_id]);
    }

    if (status === 'REJECTED') {
      await client.query("UPDATE enquiries SET status = 'LOST' WHERE id = $1", [quotation.enquiry_id]);
    }

    await client.query('COMMIT');
    return res.json({ id: quotationId, status });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ message: 'Unable to update quotation status.' });
  } finally {
    client.release();
  }
});

router.post('/:id/convert', authorizeRoles('SALES_USER'), async (req, res) => {
  const quotationId = Number(req.params.id);

  if (!Number.isInteger(quotationId) || quotationId <= 0) {
    return res.status(400).json({ message: 'A valid quotation is required.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const quotationResult = await client.query(
      `SELECT id, customer_id, total_amount, status
       FROM quotations
       WHERE id = $1
       FOR UPDATE`,
      [quotationId]
    );

    if (quotationResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Quotation does not exist.' });
    }

    const quotation = quotationResult.rows[0];

    if (quotation.status === 'DRAFT') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Sales Order cannot be created. The quotation is still in DRAFT status.',
      });
    }

    if (quotation.status === 'REJECTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Sales Order cannot be created. This quotation has been rejected.',
      });
    }

    if (quotation.status !== 'ACCEPTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Sales Order cannot be created. The quotation must be ACCEPTED.',
      });
    }

    const existingOrder = await client.query(
      'SELECT id FROM sales_orders WHERE quotation_id = $1',
      [quotationId]
    );

    if (existingOrder.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Sales Order already exists for this quotation.' });
    }

    const sequenceResult = await client.query(
      "SELECT nextval(pg_get_serial_sequence('sales_orders', 'id')) AS id"
    );
    const id = Number(sequenceResult.rows[0].id);
    const orderNumber = `SO-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;

    const orderResult = await client.query(
      `INSERT INTO sales_orders (id, order_number, quotation_id, customer_id, total_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, order_number, quotation_id, customer_id, order_date, total_amount, status`,
      [id, orderNumber, quotationId, quotation.customer_id, quotation.total_amount]
    );

    await client.query(
      `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price, line_amount)
       SELECT $1, product_id, quantity, unit_price, line_amount
       FROM quotation_items
       WHERE quotation_id = $2`,
      [id, quotationId]
    );

    await client.query('COMMIT');
    return res.status(201).json(orderResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      return res.status(409).json({ message: 'Sales Order already exists for this quotation.' });
    }

    return res.status(500).json({ message: 'Unable to create Sales Order.' });
  } finally {
    client.release();
  }
});

router.get('/', authorizeRoles('ADMIN', 'SALES_USER'), async (req, res) => {
  try {
    const quotationResult = await pool.query(
      `SELECT q.id, q.quotation_number, q.enquiry_id, q.valid_until, q.discount_percent,
        q.gst_percent, q.total_amount, q.status, q.created_at,
        c.id AS customer_id, c.company_name
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       ORDER BY q.id DESC`
    );
    const quotations = quotationResult.rows;

    if (quotations.length === 0) {
      return res.json([]);
    }

    const itemResult = await pool.query(
      `SELECT qi.quotation_id, qi.product_id, qi.quantity, qi.unit_price,
        qi.discount_percent, qi.gst_percent, qi.line_amount,
        p.product_code, p.product_name, p.unit
       FROM quotation_items qi
       JOIN products p ON p.id = qi.product_id
       WHERE qi.quotation_id = ANY($1::int[])
       ORDER BY qi.id`,
      [quotations.map((quotation) => quotation.id)]
    );
    const itemsByQuotation = new Map();

    for (const item of itemResult.rows) {
      const items = itemsByQuotation.get(item.quotation_id) || [];
      items.push(item);
      itemsByQuotation.set(item.quotation_id, items);
    }

    return res.json(
      quotations.map((quotation) => ({
        ...quotation,
        items: itemsByQuotation.get(quotation.id) || [],
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load quotations.' });
  }
});

module.exports = router;
