require('dotenv').config();

const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ── Token helpers ─────────────────────────────────────────────────────────────

function tokenFor(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// ── Database cleanup ──────────────────────────────────────────────────────────
// Truncate all tables in dependency order and restart sequences so each test
// starts from a clean, predictable state.

async function cleanDb() {
  await pool.query(`
    TRUNCATE
      dispatch_items,
      dispatches,
      sales_order_items,
      sales_orders,
      quotation_items,
      quotations,
      enquiry_items,
      enquiries,
      inventory,
      products,
      customers,
      users
    RESTART IDENTITY CASCADE
  `);
}

// ── Minimal fixture factory ───────────────────────────────────────────────────
// Creates the minimum rows needed for a test and returns their IDs.

async function createFixtures({ physicalQty = 100, physicalQty2 = null } = {}) {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('Password@123', 4); // low cost for speed

  const { rows: [admin] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Test Admin', 'admin@test.local', $1, 'ADMIN') RETURNING id`,
    [hash]
  );
  const { rows: [sales] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Test Sales', 'sales@test.local', $1, 'SALES_USER') RETURNING id`,
    [hash]
  );

  const { rows: [customer] } = await pool.query(
    `INSERT INTO customers (company_name, contact_person, mobile)
     VALUES ('Test Co', 'Test Person', '9999999999') RETURNING id`
  );

  const { rows: [product] } = await pool.query(
    `INSERT INTO products (product_code, product_name, category, unit, base_price)
     VALUES ('TEST-001', 'Test Product', 'Test Category', 'Unit', 1000) RETURNING id`
  );
  await pool.query(
    `INSERT INTO inventory (product_id, physical_qty, reserved_qty)
     VALUES ($1, $2, 0)`,
    [product.id, physicalQty]
  );

  let product2 = null;
  if (physicalQty2 !== null) {
    const { rows: [p2] } = await pool.query(
      `INSERT INTO products (product_code, product_name, category, unit, base_price)
       VALUES ('TEST-002', 'Test Product 2', 'Test Category', 'Unit', 2000) RETURNING id`
    );
    await pool.query(
      `INSERT INTO inventory (product_id, physical_qty, reserved_qty)
       VALUES ($1, $2, 0)`,
      [p2.id, physicalQty2]
    );
    product2 = p2;
  }

  const adminToken = tokenFor(admin.id, 'ADMIN');
  const salesToken = tokenFor(sales.id, 'SALES_USER');

  return { admin, sales, customer, product, product2, adminToken, salesToken };
}

// ── Workflow helpers ──────────────────────────────────────────────────────────
// Build up workflow state directly in the DB (bypassing HTTP) so individual
// tests can start at any point in the pipeline without repeating HTTP calls.

async function dbCreateEnquiry(customerId, productId, quantity, createdBy) {
  const { rows: [{ id }] } = await pool.query(
    `INSERT INTO enquiries (enquiry_number, customer_id, required_date, status, created_by)
     VALUES ('ENQ-TEST-' || nextval(pg_get_serial_sequence('enquiries','id'))::text,
             $1, CURRENT_DATE + 30, 'OPEN', $2)
     RETURNING id`,
    [customerId, createdBy]
  );
  await pool.query(
    `INSERT INTO enquiry_items (enquiry_id, product_id, quantity) VALUES ($1, $2, $3)`,
    [id, productId, quantity]
  );
  return id;
}

async function dbCreateQuotation(enquiryId, customerId, productId, quantity, unitPrice, status, createdBy) {
  const discountPercent = 0;
  const gstPercent = 18;
  const lineAmount = Number((quantity * unitPrice * (1 + gstPercent / 100)).toFixed(2));
  const totalAmount = lineAmount;

  const { rows: [q] } = await pool.query(
    `INSERT INTO quotations
       (quotation_number, enquiry_id, customer_id, valid_until, discount_percent, gst_percent, total_amount, status, created_by)
     VALUES ('QUO-TEST-' || nextval(pg_get_serial_sequence('quotations','id'))::text,
             $1, $2, CURRENT_DATE + 30, $3, $4, $5, $6, $7)
     RETURNING id`,
    [enquiryId, customerId, discountPercent, gstPercent, totalAmount, status, createdBy]
  );
  await pool.query(
    `INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, discount_percent, gst_percent, line_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [q.id, productId, quantity, unitPrice, discountPercent, gstPercent, lineAmount]
  );
  await pool.query(`UPDATE enquiries SET status = 'QUOTED' WHERE id = $1`, [enquiryId]);
  return { quotationId: q.id, lineAmount, totalAmount };
}

async function dbCreateSalesOrder(quotationId, customerId, productId, quantity, unitPrice, lineAmount, totalAmount) {
  const { rows: [so] } = await pool.query(
    `INSERT INTO sales_orders (order_number, quotation_id, customer_id, total_amount, status)
     VALUES ('SO-TEST-' || nextval(pg_get_serial_sequence('sales_orders','id'))::text,
             $1, $2, $3, 'PENDING')
     RETURNING id`,
    [quotationId, customerId, totalAmount]
  );
  await pool.query(
    `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price, line_amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [so.id, productId, quantity, unitPrice, lineAmount]
  );
  return so.id;
}

module.exports = {
  pool,
  tokenFor,
  cleanDb,
  createFixtures,
  dbCreateEnquiry,
  dbCreateQuotation,
  dbCreateSalesOrder,
};
