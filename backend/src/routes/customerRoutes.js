const express = require('express');
const pool = require('../config/db');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorizeRoles('ADMIN', 'SALES_USER'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, company_name, contact_person, mobile, email, city, created_at
       FROM customers
       ORDER BY company_name`
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load customers.' });
  }
});

router.post('/', authenticate, authorizeRoles('SALES_USER'), async (req, res) => {
  const { company_name, contact_person, mobile, email, city } = req.body;

  if (
    ![company_name, contact_person, mobile].every(
      (value) => typeof value === 'string' && value.trim()
    )
  ) {
    return res.status(400).json({
      message: 'Company name, contact person and mobile are required.',
    });
  }

  if (email && (typeof email !== 'string' || !email.includes('@'))) {
    return res.status(400).json({ message: 'A valid email address is required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO customers (company_name, contact_person, mobile, email, city)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, company_name, contact_person, mobile, email, city, created_at`,
      [
        company_name.trim(),
        contact_person.trim(),
        mobile.trim(),
        email ? email.trim() : null,
        city ? city.trim() : null,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create customer.' });
  }
});

module.exports = router;
