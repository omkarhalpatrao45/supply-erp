# FundsWeb ERP API Documentation

This document provides a Swagger-style API reference for the current FundsWeb ERP backend.

Base URL:

```text
http://localhost:5000
```

Authentication:

- All routes except `/auth/login` require a bearer token in the `Authorization` header.
- Token is returned by the login endpoint and expires after 8 hours.

```http
Authorization: Bearer <jwt_token>
```

---

## Swagger/OpenAPI Overview

```yaml
openapi: 3.0.3
info:
  title: FundsWeb ERP API
  version: 1.0.0
  description: ERP backend for customers, enquiries, quotations, sales orders, and inventory.
servers:
  - url: http://localhost:5000
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

---

## 1. Health Check

### GET /health

Returns backend availability.

#### Sample response

```json
{
  "message": "Supply ERP backend is running"
}
```

---

## 2. Authentication

### POST /auth/login

Public endpoint for login.

#### Request body

```json
{
  "email": "admin@supplyerp.local",
  "password": "Password@123"
}
```

#### Successful response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "System Administrator",
    "email": "admin@supplyerp.local",
    "role": "ADMIN"
  }
}
```

#### Error response

```json
{
  "message": "Invalid email or password."
}
```

---

## 3. Customers

### GET /customers

List customers.

Required role: `ADMIN`, `SALES_USER`

#### Sample response

```json
[
  {
    "id": 1,
    "company_name": "Apex Fabrication Pvt Ltd",
    "contact_person": "Ravi Shah",
    "mobile": "9876500001",
    "email": "ravi@apex.in",
    "city": "Mumbai",
    "created_at": "2026-09-27T10:00:00.000Z"
  }
]
```

### POST /customers

Create a new customer.

Required role: `SALES_USER`

#### Request body

```json
{
  "company_name": "Apex Industries",
  "contact_person": "Ravi Shah",
  "mobile": "9876500001",
  "email": "ravi@apex.in",
  "city": "Mumbai"
}
```

#### Successful response

```json
{
  "id": 9,
  "company_name": "Apex Industries",
  "contact_person": "Ravi Shah",
  "mobile": "9876500001",
  "email": "ravi@apex.in",
  "city": "Mumbai",
  "created_at": "2026-09-27T12:15:00.000Z"
}
```

#### Validation error example

```json
{
  "message": "Company name, contact person and mobile are required."
}
```

---

## 4. Enquiries

### POST /enquiries

Create a new enquiry.

Required role: `SALES_USER`

#### Request body

```json
{
  "customer_id": 1,
  "enquiry_date": "2026-09-27",
  "required_date": "2026-10-05",
  "notes": "Urgent requirement for production line upgrade.",
  "products": [
    { "product_id": 3, "quantity": 10 },
    { "product_id": 4, "quantity": 25 }
  ]
}
```

#### Successful response

```json
{
  "id": 5,
  "enquiry_number": "ENQ-2026-0005",
  "customer_id": 1,
  "enquiry_date": "2026-09-27",
  "required_date": "2026-10-05",
  "status": "OPEN",
  "notes": "Urgent requirement for production line upgrade.",
  "created_by": 2,
  "products": [
    { "product_id": 3, "quantity": 10 },
    { "product_id": 4, "quantity": 25 }
  ]
}
```

### GET /enquiries

Fetch all enquiries with nested products.

Required role: `ADMIN`, `SALES_USER`

#### Sample response

```json
[
  {
    "id": 1,
    "enquiry_number": "ENQ-2026-0001",
    "enquiry_date": "2026-09-20",
    "required_date": "2026-09-30",
    "status": "QUOTED",
    "notes": "Material for line 2",
    "customer_id": 1,
    "company_name": "Apex Fabrication Pvt Ltd",
    "contact_person": "Ravi Shah",
    "mobile": "9876500001",
    "email": "ravi@apex.in",
    "city": "Mumbai",
    "products": [
      {
        "enquiry_id": 1,
        "product_id": 1,
        "quantity": 12,
        "product_code": "PROD-001",
        "product_name": "Industrial Gearbox",
        "unit": "Unit"
      }
    ]
  }
]
```

---

## 5. Quotations

### POST /quotations

Create a quotation for an enquiry.

Required role: `SALES_USER`

#### Request body

```json
{
  "enquiry_id": 2,
  "valid_until": "2026-10-31",
  "discount_percent": 5,
  "gst_percent": 18,
  "items": [
    {
      "product_id": 3,
      "quantity": 10,
      "unit_price": 325000
    },
    {
      "product_id": 4,
      "quantity": 25,
      "unit_price": 8500
    }
  ]
}
```

#### Successful response

```json
{
  "id": 3,
  "quotation_number": "QUO-2026-0003",
  "enquiry_id": 2,
  "customer_id": 1,
  "valid_until": "2026-10-31",
  "discount_percent": 5,
  "gst_percent": 18,
  "total_amount": 4424000,
  "status": "DRAFT",
  "created_at": "2026-09-27T12:30:00.000Z",
  "items": [
    {
      "product_id": 3,
      "quantity": 10,
      "unit_price": 325000,
      "line_amount": 3875000,
      "discount_percent": 5,
      "gst_percent": 18
    },
    {
      "product_id": 4,
      "quantity": 25,
      "unit_price": 8500,
      "line_amount": 548500,
      "discount_percent": 5,
      "gst_percent": 18
    }
  ]
}
```

### GET /quotations

Fetch all quotations.

Required role: `ADMIN`, `SALES_USER`

#### Sample response

```json
[
  {
    "id": 1,
    "quotation_number": "QUO-2026-0001",
    "enquiry_id": 1,
    "valid_until": "2026-09-30",
    "discount_percent": 0,
    "gst_percent": 18,
    "total_amount": 752500,
    "status": "ACCEPTED",
    "created_at": "2026-09-21T11:00:00.000Z",
    "customer_id": 1,
    "company_name": "Apex Fabrication Pvt Ltd",
    "items": [
      {
        "quotation_id": 1,
        "product_id": 1,
        "quantity": 12,
        "unit_price": 42000,
        "discount_percent": 0,
        "gst_percent": 18,
        "line_amount": 594000,
        "product_code": "PROD-001",
        "product_name": "Industrial Gearbox",
        "unit": "Unit"
      }
    ]
  }
]
```

### PATCH /quotations/:id/status

Update the quotation status.

Required role: `SALES_USER`

Allowed statuses:

- `SENT`
- `ACCEPTED`
- `REJECTED`

#### Request body

```json
{
  "status": "ACCEPTED"
}
```

#### Successful response

```json
{
  "id": 1,
  "status": "ACCEPTED"
}
```

#### Error response

```json
{
  "message": "Finalized quotations cannot change status."
}
```

### POST /quotations/:id/convert

Convert an accepted quotation into a sales order.

Required role: `SALES_USER`

#### Sample response

```json
{
  "id": 2,
  "order_number": "SO-2026-0002",
  "quotation_id": 2,
  "customer_id": 1,
  "order_date": "2026-09-27",
  "total_amount": 980000,
  "status": "PENDING"
}
```

---

## 6. Sales Orders

### GET /sales-orders

Fetch all sales orders, including nested items.

Required role: `ADMIN`, `SALES_USER`

#### Sample response

```json
[
  {
    "id": 1,
    "order_number": "SO-2026-0001",
    "quotation_id": 1,
    "order_date": "2026-09-27",
    "total_amount": 1250000,
    "status": "DISPATCHED",
    "customer_id": 1,
    "company_name": "Apex Fabrication Pvt Ltd",
    "items": [
      {
        "sales_order_id": 1,
        "product_id": 3,
        "quantity": 8,
        "unit_price": 150000,
        "line_amount": 1200000,
        "product_code": "PROD-003",
        "product_name": "Precision Valve",
        "unit": "Unit",
        "physical_qty": 100,
        "reserved_qty": 0,
        "available_qty": 100
      }
    ]
  }
]
```

### POST /sales-orders/:id/confirm

Confirm an order and reserve inventory.

Required role: `ADMIN`

#### Successful response

```json
{
  "id": 2,
  "status": "CONFIRMED"
}
```

#### Error response

```json
{
  "message": "Order cannot be confirmed. Only 5 units are available, but 12 units were requested."
}
```

### POST /sales-orders/:id/dispatch

Dispatch a confirmed order.

Required role: `ADMIN`

#### Request body

```json
{
  "dispatch_date": "2026-10-02",
  "vehicle_number": "MH12AB1234",
  "driver_name": "Ravi Kumar"
}
```

#### Successful response

```json
{
  "id": 1,
  "dispatch_number": "DSP-2026-0001",
  "sales_order_id": 2,
  "dispatch_date": "2026-10-02",
  "vehicle_number": "MH12AB1234",
  "driver_name": "Ravi Kumar",
  "items": [
    {
      "product_id": 3,
      "quantity": 8
    }
  ]
}
```

---

## 7. Inventory

### GET /inventory

Returns current product inventory with stock and availability.

Required role: `ADMIN`, `SALES_USER`

#### Sample response

```json
[
  {
    "product_id": 1,
    "physical_qty": 120,
    "reserved_qty": 5,
    "available_qty": 115,
    "product_code": "PROD-001",
    "product_name": "Industrial Gearbox",
    "category": "Mechanical",
    "unit": "Unit",
    "base_price": 42000
  }
]
```

### POST /inventory/products

Create a new product and initial inventory row.

Required role: `ADMIN`

#### Request body

```json
{
  "product_code": "PROD-021",
  "product_name": "Hydraulic Pump",
  "category": "Automation",
  "unit": "Unit",
  "base_price": 32000,
  "physical_qty": 50
}
```

#### Successful response

```json
{
  "product_id": 21,
  "product_code": "PROD-021",
  "product_name": "Hydraulic Pump",
  "category": "Automation",
  "unit": "Unit",
  "base_price": 32000,
  "physical_qty": 50,
  "reserved_qty": 0,
  "available_qty": 50
}
```

### PATCH /inventory/:productId

Update the physical quantity of an existing product.

Required role: `ADMIN`

#### Request body

```json
{
  "physical_qty": 150
}
```

#### Successful response

```json
{
  "product_id": 3,
  "physical_qty": 150,
  "reserved_qty": 15,
  "available_qty": 135
}
```

#### Error example

```json
{
  "message": "Physical quantity cannot be lower than the 15 reserved units."
}
```

---

## 8. Role Permissions Summary

| Role | Access |
| --- | --- |
| `ADMIN` | Full access to all inventory, sales order, and customer data; can confirm and dispatch orders; can update inventory |
| `SALES_USER` | Can view records and create customers, enquiries, quotations, and convert quotations to orders |

---

## 9. Common Error Responses

```json
{
  "message": "Authentication is required."
}
```

```json
{
  "message": "Invalid or expired token."
}
```

```json
{
  "message": "You are not authorized to perform this operation."
}
```

```json
{
  "message": "Unable to load inventory."
}
```

---

## 10. Sample Data Reference

Example seeded values used by the project:

```json
{
  "users": [
    {
      "id": 1,
      "name": "System Administrator",
      "email": "admin@supplyerp.local",
      "role": "ADMIN"
    },
    {
      "id": 2,
      "name": "Sales User",
      "email": "sales@supplyerp.local",
      "role": "SALES_USER"
    }
  ],
  "customer": {
    "id": 1,
    "company_name": "Apex Fabrication Pvt Ltd",
    "contact_person": "Ravi Shah",
    "mobile": "9876500001",
    "email": "ravi@apex.in",
    "city": "Mumbai"
  },
  "product": {
    "id": 3,
    "product_code": "PROD-003",
    "product_name": "Precision Valve",
    "category": "Mechanical",
    "unit": "Unit",
    "base_price": 150000
  }
}
```

---

## 11. Notes

- The backend uses PostgreSQL and JWT authentication.
- Inventory values are tracked as `physical_qty`, `reserved_qty`, and `available_qty`.
- Quotation totals are calculated on the backend before the record is saved.
- All non-public API calls require a valid Bearer token.
