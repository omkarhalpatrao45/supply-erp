const express = require('express');
const pool = require('../config/db');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', authorizeRoles('SALES_USER'), async (req, res) => {
  const { customer_id, enquiry_date, required_date, products, notes } = req.body;

  if (!Number.isInteger(customer_id) || customer_id <= 0) {
    return res.status(400).json({ message: 'A valid customer is required.' });
  }

  if (!required_date || typeof required_date !== 'string') {
    return res.status(400).json({ message: 'Required date is required.' });
  }

  if (enquiry_date && typeof enquiry_date !== 'string') {
    return res.status(400).json({ message: 'Enquiry date must be a valid date.' });
  }

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ message: 'At least one product is required.' });
  }

  if (
    products.some(
      (item) => !Number.isInteger(item.product_id) || item.product_id <= 0 ||
        !Number.isInteger(item.quantity) || item.quantity <= 0
    )
  ) {
    return res.status(400).json({ message: 'Each product must have a valid product ID and quantity.' });
  }

  const productIds = products.map((item) => item.product_id);

  if (new Set(productIds).size !== productIds.length) {
    return res.status(400).json({ message: 'A product can only be added once to an enquiry.' });
  }

  if (notes && typeof notes !== 'string') {
    return res.status(400).json({ message: 'Notes must be text.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const customerResult = await client.query('SELECT id FROM customers WHERE id = $1', [customer_id]);

    if (customerResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Customer does not exist.' });
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
      "SELECT nextval(pg_get_serial_sequence('enquiries', 'id')) AS id"
    );
    const id = Number(sequenceResult.rows[0].id);
    const enquiryNumber = `ENQ-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;

    const enquiryResult = await client.query(
      `INSERT INTO enquiries (
        id, enquiry_number, customer_id, enquiry_date, required_date, notes, created_by
      )
      VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5::date, $6, $7)
      RETURNING id, enquiry_number, customer_id, enquiry_date, required_date, status, notes, created_by`,
      [id, enquiryNumber, customer_id, enquiry_date || null, required_date, notes || null, req.user.userId]
    );

    for (const item of products) {
      await client.query(
        'INSERT INTO enquiry_items (enquiry_id, product_id, quantity) VALUES ($1, $2, $3)',
        [id, item.product_id, item.quantity]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      ...enquiryResult.rows[0],
      products,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ message: 'Unable to create enquiry.' });
  } finally {
    client.release();
  }
});

router.get('/', authorizeRoles('ADMIN', 'SALES_USER'), async (req, res) => {
  try {
    const enquiryResult = await pool.query(
      `SELECT e.id, e.enquiry_number, e.enquiry_date, e.required_date, e.status, e.notes,
        c.id AS customer_id, c.company_name, c.contact_person, c.mobile, c.email, c.city
       FROM enquiries e
       JOIN customers c ON c.id = e.customer_id
       ORDER BY e.id DESC`
    );

    const enquiries = enquiryResult.rows;

    if (enquiries.length === 0) {
      return res.json([]);
    }

    const itemResult = await pool.query(
      `SELECT ei.enquiry_id, ei.product_id, ei.quantity, p.product_code, p.product_name, p.unit
       FROM enquiry_items ei
       JOIN products p ON p.id = ei.product_id
       WHERE ei.enquiry_id = ANY($1::int[])
       ORDER BY ei.id`,
      [enquiries.map((enquiry) => enquiry.id)]
    );

    const itemsByEnquiry = new Map();

    for (const item of itemResult.rows) {
      const items = itemsByEnquiry.get(item.enquiry_id) || [];
      items.push(item);
      itemsByEnquiry.set(item.enquiry_id, items);
    }

    return res.json(
      enquiries.map((enquiry) => ({
        ...enquiry,
        products: itemsByEnquiry.get(enquiry.id) || [],
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load enquiries.' });
  }
});

module.exports = router;
