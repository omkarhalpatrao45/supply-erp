require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function createEnquiry(client, data) {
  const enquiry = await client.query(
    `INSERT INTO enquiries (
      enquiry_number, customer_id, enquiry_date, required_date, status, notes, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id`,
    [
      data.enquiryNumber,
      data.customerId,
      data.enquiryDate,
      data.requiredDate,
      data.status,
      data.notes,
      data.createdBy,
    ]
  );

  for (const item of data.items) {
    await client.query(
      'INSERT INTO enquiry_items (enquiry_id, product_id, quantity) VALUES ($1, $2, $3)',
      [enquiry.rows[0].id, item.productId, item.quantity]
    );
  }

  return enquiry.rows[0].id;
}

async function createQuotation(client, data) {
  const quotation = await client.query(
    `INSERT INTO quotations (
      quotation_number, enquiry_id, customer_id, valid_until, discount_percent,
      gst_percent, total_amount, status, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`,
    [
      data.quotationNumber,
      data.enquiryId,
      data.customerId,
      data.validUntil,
      data.discountPercent,
      data.gstPercent,
      data.totalAmount,
      data.status,
      data.createdBy,
    ]
  );

  for (const item of data.items) {
    await client.query(
      `INSERT INTO quotation_items (
        quotation_id, product_id, quantity, unit_price, discount_percent, gst_percent, line_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        quotation.rows[0].id,
        item.productId,
        item.quantity,
        item.unitPrice,
        data.discountPercent,
        data.gstPercent,
        item.lineAmount,
      ]
    );
  }

  return quotation.rows[0].id;
}

async function createSalesOrder(client, data) {
  const order = await client.query(
    `INSERT INTO sales_orders (
      order_number, quotation_id, customer_id, order_date, total_amount, status
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id`,
    [
      data.orderNumber,
      data.quotationId,
      data.customerId,
      data.orderDate,
      data.totalAmount,
      data.status,
    ]
  );

  for (const item of data.items) {
    await client.query(
      `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price, line_amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [order.rows[0].id, item.productId, item.quantity, item.unitPrice, item.lineAmount]
    );
  }

  return order.rows[0].id;
}

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT EXISTS (
        SELECT 1 FROM users
        UNION ALL SELECT 1 FROM customers
        UNION ALL SELECT 1 FROM products
      ) AS has_data`
    );

    if (check.rows[0].has_data) {
      throw new Error('Seed data already exists. The seed script will not overwrite existing records.');
    }

    const passwordHash = await bcrypt.hash('Password@123', 12);
    const users = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES
        ('System Administrator', 'admin@supplyerp.local', $1, 'ADMIN'),
        ('Sales Executive', 'sales@supplyerp.local', $1, 'SALES_USER')
       RETURNING id, role`,
      [passwordHash]
    );
    const userByRole = new Map(users.rows.map((user) => [user.role, user.id]));

    const productResult = await client.query(
      `INSERT INTO products (product_code, product_name, category, unit, base_price)
       VALUES
        ('PROD-001', 'CNC Turning Center', 'Machine Tools', 'Unit', 1850000),
        ('PROD-002', 'Industrial Gearbox', 'Power Transmission', 'Unit', 85000),
        ('PROD-003', 'Hydraulic Power Pack', 'Hydraulics', 'Unit', 325000),
        ('PROD-004', 'Pneumatic Control Valve', 'Pneumatics', 'Unit', 8500),
        ('PROD-005', 'Conveyor Drive Motor', 'Material Handling', 'Unit', 68000),
        ('PROD-006', 'PLC Control Panel', 'Automation', 'Unit', 245000),
        ('PROD-007', 'Servo Motor Drive', 'Automation', 'Unit', 120000),
        ('PROD-008', 'Variable Frequency Drive', 'Electrical', 'Unit', 45000),
        ('PROD-009', 'Rotary Screw Air Compressor', 'Utilities', 'Unit', 780000),
        ('PROD-010', 'Industrial Water Chiller', 'Cooling Systems', 'Unit', 450000),
        ('PROD-011', 'Belt Conveyor Module', 'Material Handling', 'Meter', 22000),
        ('PROD-012', 'Stainless Steel Mixing Tank', 'Process Equipment', 'Unit', 275000),
        ('PROD-013', 'Centrifugal Process Pump', 'Pumps', 'Unit', 55000),
        ('PROD-014', 'Industrial Boiler Burner', 'Thermal Systems', 'Unit', 380000),
        ('PROD-015', 'Shell and Tube Heat Exchanger', 'Process Equipment', 'Unit', 195000),
        ('PROD-016', 'Sheet Metal Bending Press', 'Machine Tools', 'Unit', 1250000),
        ('PROD-017', 'Welding Robot Cell', 'Automation', 'Unit', 2200000),
        ('PROD-018', 'Safety Light Curtain', 'Industrial Safety', 'Unit', 35000),
        ('PROD-019', 'Load Cell Weighing System', 'Instrumentation', 'Unit', 95000),
        ('PROD-020', 'Industrial Sensor Kit', 'Instrumentation', 'Set', 18000)
       RETURNING id, product_code`
    );
    const productByCode = new Map(productResult.rows.map((product) => [product.product_code, product.id]));

    await client.query(
      `INSERT INTO inventory (product_id, physical_qty, reserved_qty)
       VALUES
        ($1, 80, 0),
        ($2, 90, 0),
        ($3, 100, 0),
        ($4, 130, 0),
        ($5, 75, 0),
        ($6, 60, 0),
        ($7, 50, 0),
        ($8, 65, 0),
        ($9, 12, 0),
        ($10, 18, 0),
        ($11, 150, 0),
        ($12, 20, 0),
        ($13, 45, 0),
        ($14, 10, 0),
        ($15, 22, 0),
        ($16, 8, 0),
        ($17, 6, 0),
        ($18, 75, 0),
        ($19, 30, 0),
        ($20, 100, 0)`,
      [
        productByCode.get('PROD-001'),
        productByCode.get('PROD-002'),
        productByCode.get('PROD-003'),
        productByCode.get('PROD-004'),
        productByCode.get('PROD-005'),
        productByCode.get('PROD-006'),
        productByCode.get('PROD-007'),
        productByCode.get('PROD-008'),
        productByCode.get('PROD-009'),
        productByCode.get('PROD-010'),
        productByCode.get('PROD-011'),
        productByCode.get('PROD-012'),
        productByCode.get('PROD-013'),
        productByCode.get('PROD-014'),
        productByCode.get('PROD-015'),
        productByCode.get('PROD-016'),
        productByCode.get('PROD-017'),
        productByCode.get('PROD-018'),
        productByCode.get('PROD-019'),
        productByCode.get('PROD-020'),
      ]
    );

    const customerResult = await client.query(
      `INSERT INTO customers (company_name, contact_person, mobile, email, city)
       VALUES
        ('Apex Fabrication Pvt Ltd', 'Priya Nair', '9876501001', 'priya@apexfabrication.in', 'Pune'),
        ('Vertex Process Systems', 'Rohan Mehta', '9876501002', 'rohan@vertexprocess.in', 'Nashik')
       RETURNING id, company_name`
    );
    const customerByName = new Map(customerResult.rows.map((customer) => [customer.company_name, customer.id]));
    const salesUserId = userByRole.get('SALES_USER');

    const dispatchedEnquiryId = await createEnquiry(client, {
      enquiryNumber: 'ENQ-2026-0001',
      customerId: customerByName.get('Apex Fabrication Pvt Ltd'),
      enquiryDate: '2026-01-10',
      requiredDate: '2026-02-15',
      status: 'WON',
      notes: 'Replacement equipment for fabrication line.',
      createdBy: salesUserId,
      items: [
        { productId: productByCode.get('PROD-001'), quantity: 20 },
        { productId: productByCode.get('PROD-002'), quantity: 10 },
      ],
    });

    const dispatchedQuotationId = await createQuotation(client, {
      quotationNumber: 'QUO-2026-0001',
      enquiryId: dispatchedEnquiryId,
      customerId: customerByName.get('Apex Fabrication Pvt Ltd'),
      validUntil: '2026-01-31',
      discountPercent: 5,
      gstPercent: 18,
      totalAmount: 42429850,
      status: 'ACCEPTED',
      createdBy: salesUserId,
      items: [
        { productId: productByCode.get('PROD-001'), quantity: 20, unitPrice: 1850000, lineAmount: 41477000 },
        { productId: productByCode.get('PROD-002'), quantity: 10, unitPrice: 85000, lineAmount: 952850 },
      ],
    });

    const dispatchedOrderId = await createSalesOrder(client, {
      orderNumber: 'SO-2026-0001',
      quotationId: dispatchedQuotationId,
      customerId: customerByName.get('Apex Fabrication Pvt Ltd'),
      orderDate: '2026-01-15',
      totalAmount: 42429850,
      status: 'DISPATCHED',
      items: [
        { productId: productByCode.get('PROD-001'), quantity: 20, unitPrice: 1850000, lineAmount: 41477000 },
        { productId: productByCode.get('PROD-002'), quantity: 10, unitPrice: 85000, lineAmount: 952850 },
      ],
    });

    const dispatch = await client.query(
      `INSERT INTO dispatches (dispatch_number, sales_order_id, dispatch_date, vehicle_number, driver_name)
       VALUES ('DSP-2026-0001', $1, '2026-01-18', 'MH12AB1234', 'Ravi Kumar')
       RETURNING id`,
      [dispatchedOrderId]
    );

    await client.query(
      `INSERT INTO dispatch_items (dispatch_id, product_id, quantity)
       VALUES ($1, $2, 20), ($1, $3, 10)`,
      [dispatch.rows[0].id, productByCode.get('PROD-001'), productByCode.get('PROD-002')]
    );

    const pendingEnquiryId = await createEnquiry(client, {
      enquiryNumber: 'ENQ-2026-0002',
      customerId: customerByName.get('Vertex Process Systems'),
      enquiryDate: '2026-02-05',
      requiredDate: '2026-03-20',
      status: 'WON',
      notes: 'New process line expansion.',
      createdBy: salesUserId,
      items: [
        { productId: productByCode.get('PROD-003'), quantity: 15 },
        { productId: productByCode.get('PROD-004'), quantity: 25 },
      ],
    });

    const pendingQuotationId = await createQuotation(client, {
      quotationNumber: 'QUO-2026-0002',
      enquiryId: pendingEnquiryId,
      customerId: customerByName.get('Vertex Process Systems'),
      validUntil: '2026-02-28',
      discountPercent: 0,
      gstPercent: 18,
      totalAmount: 6003250,
      status: 'ACCEPTED',
      createdBy: salesUserId,
      items: [
        { productId: productByCode.get('PROD-003'), quantity: 15, unitPrice: 325000, lineAmount: 5752500 },
        { productId: productByCode.get('PROD-004'), quantity: 25, unitPrice: 8500, lineAmount: 250750 },
      ],
    });

    await createSalesOrder(client, {
      orderNumber: 'SO-2026-0002',
      quotationId: pendingQuotationId,
      customerId: customerByName.get('Vertex Process Systems'),
      orderDate: '2026-02-08',
      totalAmount: 6003250,
      status: 'PENDING',
      items: [
        { productId: productByCode.get('PROD-003'), quantity: 15, unitPrice: 325000, lineAmount: 5752500 },
        { productId: productByCode.get('PROD-004'), quantity: 25, unitPrice: 8500, lineAmount: 250750 },
      ],
    });

    const quotedEnquiryId = await createEnquiry(client, {
      enquiryNumber: 'ENQ-2026-0003',
      customerId: customerByName.get('Apex Fabrication Pvt Ltd'),
      enquiryDate: '2026-03-01',
      requiredDate: '2026-04-10',
      status: 'QUOTED',
      notes: 'Automation upgrade request.',
      createdBy: salesUserId,
      items: [{ productId: productByCode.get('PROD-006'), quantity: 5 }],
    });

    await createQuotation(client, {
      quotationNumber: 'QUO-2026-0003',
      enquiryId: quotedEnquiryId,
      customerId: customerByName.get('Apex Fabrication Pvt Ltd'),
      validUntil: '2026-03-31',
      discountPercent: 0,
      gstPercent: 18,
      totalAmount: 1445500,
      status: 'SENT',
      createdBy: salesUserId,
      items: [{ productId: productByCode.get('PROD-006'), quantity: 5, unitPrice: 245000, lineAmount: 1445500 }],
    });

    await client.query('COMMIT');
    console.log('Seed data created successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
