require('dotenv').config();

const request = require('supertest');
const app = require('../app');
const {
  pool,
  cleanDb,
  createFixtures,
  dbCreateEnquiry,
  dbCreateQuotation,
  dbCreateSalesOrder,
} = require('./helpers');

beforeEach(async () => { await cleanDb(); });

afterAll(async () => {
  await cleanDb();
  await pool.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Quotation calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('Quotation calculation', () => {
  test('line_amount = qty × unit_price (no discount, no GST)', async () => {
    const { customer, product, salesToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 5, sales.id);

    const res = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiry_id: enquiryId,
        valid_until: '2099-12-31',
        discount_percent: 0,
        gst_percent: 0,
        items: [{ product_id: product.id, quantity: 5, unit_price: 1000 }],
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.items[0].line_amount)).toBe(5000);
    expect(Number(res.body.total_amount)).toBe(5000);
  });

  test('line_amount applies discount correctly', async () => {
    const { customer, product, salesToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 10, sales.id);

    // 10 × 1000 = 10000, 10% discount → 9000
    const res = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiry_id: enquiryId,
        valid_until: '2099-12-31',
        discount_percent: 10,
        gst_percent: 0,
        items: [{ product_id: product.id, quantity: 10, unit_price: 1000 }],
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.items[0].line_amount)).toBe(9000);
    expect(Number(res.body.total_amount)).toBe(9000);
  });

  test('line_amount applies GST correctly', async () => {
    const { customer, product, salesToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 2, sales.id);

    // 2 × 1000 = 2000, 18% GST → 2360
    const res = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiry_id: enquiryId,
        valid_until: '2099-12-31',
        discount_percent: 0,
        gst_percent: 18,
        items: [{ product_id: product.id, quantity: 2, unit_price: 1000 }],
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.items[0].line_amount)).toBe(2360);
    expect(Number(res.body.total_amount)).toBe(2360);
  });

  test('line_amount applies discount then GST correctly', async () => {
    const { customer, product, salesToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 4, sales.id);

    // 4 × 500 = 2000, 5% discount → 1900, 18% GST → 2242
    const res = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiry_id: enquiryId,
        valid_until: '2099-12-31',
        discount_percent: 5,
        gst_percent: 18,
        items: [{ product_id: product.id, quantity: 4, unit_price: 500 }],
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.items[0].line_amount)).toBe(2242);
    expect(Number(res.body.total_amount)).toBe(2242);
  });

  test('total_amount is sum of all line_amounts', async () => {
    const { customer, product, product2, salesToken, sales } = await createFixtures({ physicalQty: 100, physicalQty2: 100 });
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 2, sales.id);
    await pool.query(
      `INSERT INTO enquiry_items (enquiry_id, product_id, quantity) VALUES ($1, $2, $3)`,
      [enquiryId, product2.id, 3]
    );

    // item1: 2 × 1000 = 2000; item2: 3 × 2000 = 6000; total = 8000
    const res = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiry_id: enquiryId,
        valid_until: '2099-12-31',
        discount_percent: 0,
        gst_percent: 0,
        items: [
          { product_id: product.id, quantity: 2, unit_price: 1000 },
          { product_id: product2.id, quantity: 3, unit_price: 2000 },
        ],
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.total_amount)).toBe(8000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DRAFT quotation cannot create a Sales Order
// ─────────────────────────────────────────────────────────────────────────────

describe('Draft quotation cannot create Sales Order', () => {
  test('returns 400 when quotation status is DRAFT', async () => {
    const { customer, product, salesToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 5, sales.id);
    const { quotationId } = await dbCreateQuotation(
      enquiryId, customer.id, product.id, 5, 1000, 'DRAFT', sales.id
    );

    const res = await request(app)
      .post(`/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/DRAFT/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. REJECTED quotation cannot create a Sales Order
// ─────────────────────────────────────────────────────────────────────────────

describe('Rejected quotation cannot create Sales Order', () => {
  test('returns 400 when quotation status is REJECTED', async () => {
    const { customer, product, salesToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 5, sales.id);
    const { quotationId } = await dbCreateQuotation(
      enquiryId, customer.id, product.id, 5, 1000, 'REJECTED', sales.id
    );

    const res = await request(app)
      .post(`/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/rejected/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Duplicate Sales Order from same quotation is rejected
// ─────────────────────────────────────────────────────────────────────────────

describe('Duplicate Sales Order prevention', () => {
  test('second convert on same accepted quotation returns 409', async () => {
    const { customer, product, salesToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 5, sales.id);
    const { quotationId, lineAmount, totalAmount } = await dbCreateQuotation(
      enquiryId, customer.id, product.id, 5, 1000, 'ACCEPTED', sales.id
    );

    // First convert — must succeed
    const first = await request(app)
      .post(`/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({});
    expect(first.status).toBe(201);

    // Second convert — must be rejected
    const second = await request(app)
      .post(`/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({});
    expect(second.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cannot reserve more inventory than available
// ─────────────────────────────────────────────────────────────────────────────

describe('Inventory reservation limit', () => {
  test('confirm order returns 400 when requested qty exceeds available', async () => {
    // Only 3 units in stock, order wants 10
    const { customer, product, adminToken, salesToken, sales } = await createFixtures({ physicalQty: 3 });
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 10, sales.id);
    const { quotationId, lineAmount, totalAmount } = await dbCreateQuotation(
      enquiryId, customer.id, product.id, 10, 1000, 'ACCEPTED', sales.id
    );
    const orderId = await dbCreateSalesOrder(
      quotationId, customer.id, product.id, 10, 1000, lineAmount, totalAmount
    );

    const res = await request(app)
      .post(`/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/available/i);
  });

  test('confirm order succeeds when qty equals available', async () => {
    const { customer, product, adminToken, salesToken, sales } = await createFixtures({ physicalQty: 10 });
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 10, sales.id);
    const { quotationId, lineAmount, totalAmount } = await dbCreateQuotation(
      enquiryId, customer.id, product.id, 10, 1000, 'ACCEPTED', sales.id
    );
    const orderId = await dbCreateSalesOrder(
      quotationId, customer.id, product.id, 10, 1000, lineAmount, totalAmount
    );

    const res = await request(app)
      .post(`/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');

    const { rows: [inv] } = await pool.query(
      `SELECT reserved_qty FROM inventory WHERE product_id = $1`, [product.id]
    );
    expect(Number(inv.reserved_qty)).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Unauthorized role cannot perform restricted operations
// ─────────────────────────────────────────────────────────────────────────────

describe('Role-based authorization', () => {
  test('SALES_USER cannot confirm a Sales Order (Admin only)', async () => {
    const { customer, product, salesToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 5, sales.id);
    const { quotationId, lineAmount, totalAmount } = await dbCreateQuotation(
      enquiryId, customer.id, product.id, 5, 1000, 'ACCEPTED', sales.id
    );
    const orderId = await dbCreateSalesOrder(
      quotationId, customer.id, product.id, 5, 1000, lineAmount, totalAmount
    );

    const res = await request(app)
      .post(`/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  test('SALES_USER cannot dispatch an order (Admin only)', async () => {
    const { customer, product, salesToken, adminToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 5, sales.id);
    const { quotationId, lineAmount, totalAmount } = await dbCreateQuotation(
      enquiryId, customer.id, product.id, 5, 1000, 'ACCEPTED', sales.id
    );
    const orderId = await dbCreateSalesOrder(
      quotationId, customer.id, product.id, 5, 1000, lineAmount, totalAmount
    );
    await request(app)
      .post(`/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    const res = await request(app)
      .post(`/sales-orders/${orderId}/dispatch`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ vehicle_number: 'MH01AA0001', driver_name: 'Test Driver' });

    expect(res.status).toBe(403);
  });

  test('ADMIN cannot create a quotation (Sales only)', async () => {
    const { customer, product, adminToken, sales } = await createFixtures();
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 5, sales.id);

    const res = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enquiry_id: enquiryId,
        valid_until: '2099-12-31',
        discount_percent: 0,
        gst_percent: 0,
        items: [{ product_id: product.id, quantity: 5, unit_price: 1000 }],
      });

    expect(res.status).toBe(403);
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/sales-orders');
    expect(res.status).toBe(401);
  });

  test('SALES_USER cannot update inventory (Admin only)', async () => {
    const { product, salesToken } = await createFixtures();

    const res = await request(app)
      .patch(`/inventory/${product.id}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ physical_qty: 999 });

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Concurrent inventory reservation — no over-reservation
// ─────────────────────────────────────────────────────────────────────────────

describe('Concurrent inventory reservation', () => {
  test('two simultaneous confirms for the same stock cannot both succeed when combined qty exceeds stock', async () => {
    // 10 units available; two orders each want 8 — only one can succeed
    const { customer, product, adminToken, salesToken, sales } = await createFixtures({ physicalQty: 10 });

    // Create two separate enquiries → quotations → orders, each wanting 8 units
    const enq1 = await dbCreateEnquiry(customer.id, product.id, 8, sales.id);
    const { quotationId: q1, lineAmount: la1, totalAmount: ta1 } = await dbCreateQuotation(
      enq1, customer.id, product.id, 8, 1000, 'ACCEPTED', sales.id
    );
    const order1 = await dbCreateSalesOrder(q1, customer.id, product.id, 8, 1000, la1, ta1);

    const enq2 = await dbCreateEnquiry(customer.id, product.id, 8, sales.id);
    const { quotationId: q2, lineAmount: la2, totalAmount: ta2 } = await dbCreateQuotation(
      enq2, customer.id, product.id, 8, 1000, 'ACCEPTED', sales.id
    );
    const order2 = await dbCreateSalesOrder(q2, customer.id, product.id, 8, 1000, la2, ta2);

    // Fire both confirms simultaneously
    const [res1, res2] = await Promise.all([
      request(app).post(`/sales-orders/${order1}/confirm`).set('Authorization', `Bearer ${adminToken}`).send({}),
      request(app).post(`/sales-orders/${order2}/confirm`).set('Authorization', `Bearer ${adminToken}`).send({}),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one must succeed (200) and one must fail (400)
    expect(statuses).toEqual([200, 400]);

    // Reserved qty must not exceed physical qty
    const { rows: [inv] } = await pool.query(
      `SELECT physical_qty, reserved_qty FROM inventory WHERE product_id = $1`, [product.id]
    );
    expect(Number(inv.reserved_qty)).toBeLessThanOrEqual(Number(inv.physical_qty));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Cannot dispatch more than reserved quantity
// ─────────────────────────────────────────────────────────────────────────────

describe('Dispatch beyond reservation', () => {
  test('dispatch is rejected when reserved_qty is manually reduced below order qty', async () => {
    const { customer, product, adminToken, salesToken, sales } = await createFixtures({ physicalQty: 10 });
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 5, sales.id);
    const { quotationId, lineAmount, totalAmount } = await dbCreateQuotation(
      enquiryId, customer.id, product.id, 5, 1000, 'ACCEPTED', sales.id
    );
    const orderId = await dbCreateSalesOrder(
      quotationId, customer.id, product.id, 5, 1000, lineAmount, totalAmount
    );

    // Confirm — reserves 5 units
    await request(app)
      .post(`/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    // Manually reduce reserved_qty to 2 to simulate the edge case
    await pool.query(`UPDATE inventory SET reserved_qty = 2 WHERE product_id = $1`, [product.id]);

    const res = await request(app)
      .post(`/sales-orders/${orderId}/dispatch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicle_number: 'MH01AA0001', driver_name: 'Test Driver' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reserved/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Cannot dispatch a cancelled Sales Order
// ─────────────────────────────────────────────────────────────────────────────

describe('Dispatch of cancelled order', () => {
  test('dispatch returns 400 for a CANCELLED order', async () => {
    const { customer, product, adminToken, salesToken, sales } = await createFixtures({ physicalQty: 10 });
    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 5, sales.id);
    const { quotationId, lineAmount, totalAmount } = await dbCreateQuotation(
      enquiryId, customer.id, product.id, 5, 1000, 'ACCEPTED', sales.id
    );
    const orderId = await dbCreateSalesOrder(
      quotationId, customer.id, product.id, 5, 1000, lineAmount, totalAmount
    );

    // Manually cancel the order
    await pool.query(`UPDATE sales_orders SET status = 'CANCELLED' WHERE id = $1`, [orderId]);

    const res = await request(app)
      .post(`/sales-orders/${orderId}/dispatch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicle_number: 'MH01AA0001', driver_name: 'Test Driver' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cancel/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Multi-product reservation rollback
// ─────────────────────────────────────────────────────────────────────────────

describe('Multi-product reservation rollback', () => {
  test('if one product has insufficient stock, no product is reserved', async () => {
    // product1: 50 units available; product2: 2 units available
    // Order wants 10 of each — product2 will fail, product1 must NOT be reserved
    const { customer, product, product2, adminToken, salesToken, sales } = await createFixtures({
      physicalQty: 50,
      physicalQty2: 2,
    });

    const enquiryId = await dbCreateEnquiry(customer.id, product.id, 10, sales.id);
    await pool.query(
      `INSERT INTO enquiry_items (enquiry_id, product_id, quantity) VALUES ($1, $2, $3)`,
      [enquiryId, product2.id, 10]
    );

    // Build quotation with two items
    const discountPercent = 0;
    const gstPercent = 0;
    const line1 = 10 * 1000;
    const line2 = 10 * 2000;
    const total = line1 + line2;

    const { rows: [q] } = await pool.query(
      `INSERT INTO quotations
         (quotation_number, enquiry_id, customer_id, valid_until, discount_percent, gst_percent, total_amount, status, created_by)
       VALUES ('QUO-MULTI-1', $1, $2, CURRENT_DATE + 30, $3, $4, $5, 'ACCEPTED', $6)
       RETURNING id`,
      [enquiryId, customer.id, discountPercent, gstPercent, total, sales.id]
    );
    await pool.query(
      `INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, discount_percent, gst_percent, line_amount)
       VALUES ($1, $2, 10, 1000, 0, 0, $3), ($1, $4, 10, 2000, 0, 0, $5)`,
      [q.id, product.id, line1, product2.id, line2]
    );
    await pool.query(`UPDATE enquiries SET status = 'QUOTED' WHERE id = $1`, [enquiryId]);

    const { rows: [so] } = await pool.query(
      `INSERT INTO sales_orders (order_number, quotation_id, customer_id, total_amount, status)
       VALUES ('SO-MULTI-1', $1, $2, $3, 'PENDING') RETURNING id`,
      [q.id, customer.id, total]
    );
    await pool.query(
      `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price, line_amount)
       VALUES ($1, $2, 10, 1000, $3), ($1, $4, 10, 2000, $5)`,
      [so.id, product.id, line1, product2.id, line2]
    );

    const res = await request(app)
      .post(`/sales-orders/${so.id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/available/i);

    // Neither product should have any reserved qty
    const { rows } = await pool.query(
      `SELECT product_id, reserved_qty FROM inventory WHERE product_id = ANY($1::int[]) ORDER BY product_id`,
      [[product.id, product2.id]]
    );
    for (const row of rows) {
      expect(Number(row.reserved_qty)).toBe(0);
    }
  });
});
