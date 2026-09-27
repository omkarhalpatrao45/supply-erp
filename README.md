# FundsWeb ERP

A full-stack supply and manufacturing ERP built to cover the sales-to-dispatch workflow for industrial operations.

```text
Customer -> Enquiry -> Quotation -> Sales Order -> Inventory Reservation -> Dispatch
```

## Overview

This workspace contains a Node.js + Express API and a React + Vite frontend for managing:

- customers
- product enquiries
- quotations
- sales orders
- inventory reservation and confirmation
- dispatch tracking
- role-based access control

## Tech stack

- Backend: Node.js, Express 5, PostgreSQL, pg, JWT, bcryptjs
- Frontend: React 19, Vite 8, lucide-react
- Testing: Jest, Supertest

## Roles

| Role | Permissions |
| --- | --- |
| `SALES_USER` | Create customers, enquiries, quotations; view records; convert accepted quotations to sales orders |
| `ADMIN` | View all records; confirm orders; reserve stock; dispatch orders; update physical inventory |

## Prerequisites

- PostgreSQL 14+
- Node.js 18+
- npm 9+

## Quick start

1. Create the database named `supply_erp` in PostgreSQL.
2. Apply the schema from `backend/schema.sql`.
3. In `backend`, create `.env` from `.env.example` and add your DB password and JWT secret.
4. Run:

```powershell
cd backend
npm install
npm run seed
node src/server.js
```

5. In another terminal, start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

The backend runs on `http://localhost:5000` and the frontend typically runs on `http://localhost:5173`.

## Seed credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@supplyerp.local` | `Password@123` |
| Sales User | `sales@supplyerp.local` | `Password@123` |

The seed script creates demo users, customers, products, inventory, enquiries, quotations, sales orders, and a dispatch record.

## Main API endpoints

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/auth/login` | Public |
| `GET`,`POST` | `/customers` | Admin / Sales |
| `GET`,`POST` | `/enquiries` | Admin / Sales |
| `GET`,`POST` | `/quotations` | Admin / Sales |
| `PATCH` | `/quotations/:id/status` | Sales |
| `POST` | `/quotations/:id/convert` | Sales |
| `GET` | `/sales-orders` | Admin / Sales |
| `POST` | `/sales-orders/:id/confirm` | Admin |
| `POST` | `/sales-orders/:id/dispatch` | Admin |
| `GET` | `/inventory` | Admin / Sales |
| `PATCH` | `/inventory/:productId` | Admin |

## Application flow

- Customer records are created first.
- Sales creates enquiries with required product quantities.
- Quotation is raised and priced on the backend.
- Accepted quotations convert into sales orders.
- Admin confirms the order to reserve inventory.
- Admin dispatches the confirmed order and updates stock.

## Business rules

- Only accepted quotations can become sales orders.
- One quotation per enquiry and one sales order per quotation are enforced.
- Inventory checks are done before any reserve update to avoid partial reservation.
- Dispatch reduces both physical and reserved quantities in the same transaction.
- Protected routes enforce JWT authentication and role checks.

## Notes

- All monetary calculations are handled by the backend.
- Frontend values are displayed in INR with the ₹ format.
- This project is currently structured as a working ERP demo with real PostgreSQL-backed logic and a Vite frontend.

## Useful commands

```powershell
cd backend
npm test
npm run seed
node src/server.js

cd frontend
npm install
npm run dev
npm run build
```
