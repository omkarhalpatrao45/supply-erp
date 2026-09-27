# FundsWeb ERP — Project Information

A full-stack ERP for supply and manufacturing operations with a real PostgreSQL-backed backend and a React dashboard frontend.

The system follows this operational flow:

```text
Customer → Enquiry → Quotation → Sales Order → Inventory Reservation → Dispatch
```

## 1. Project summary

This application is designed for a small to mid-sized industrial business that needs to manage:

- customer records
- sales enquiries
- quotations with pricing logic
- accepted orders and confirmation flow
- physical and reserved inventory
- dispatch and stock updates
- role-based access for sales and admin staff

## 2. Technology stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js, Express, PostgreSQL |
| Database driver | `pg` |
| Auth | JWT + `bcryptjs` |
| Frontend | React + Vite |
| UI icons | `lucide-react` |
| Testing | Jest + Supertest |

## 3. Workspace structure

```text
ERP/
├── README.md
├── PROJECT_INFO.md
├── seed.txt
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── schema.sql
│   └── src/
│       ├── app.js
│       ├── server.js
│       ├── config/
│       │   └── db.js
│       ├── middleware/
│       │   └── auth.js
│       ├── routes/
│       │   ├── authRoutes.js
│       │   ├── customerRoutes.js
│       │   ├── enquiryRoutes.js
│       │   ├── quotationRoutes.js
│       │   ├── salesOrderRoutes.js
│       │   └── inventoryRoutes.js
│       ├── scripts/
│       │   └── seed.js
│       └── tests/
│           ├── erp.test.js
│           └── helpers.js
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── App.jsx
│       ├── App.css
│       ├── index.css
│       └── main.jsx
└── postman/
    ├── collections/
    ├── environments/
    ├── flows/
    ├── globals/
    └── specs/
```

## 4. Current app behavior

The current codebase implements a working ERP flow with the following modules:

- login and session management
- sales user and admin roles
- customer creation
- enquiry creation
- quotation creation and status updates
- conversion of accepted quotations into sales orders
- inventory viewing and stock updates
- order confirmation and dispatch logic

## 5. Required environment setup

### Backend configuration

Create a `.env` file inside `backend` using the values from `.env.example`:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=supply_erp
DB_USER=postgres
DB_PASSWORD=your_postgres_password
JWT_SECRET=your_long_random_secret
```

The backend uses these values in `backend/src/config/db.js` and JWT middleware.

### Frontend configuration

The frontend is configured to use:

```text
http://localhost:5000
```

unless `VITE_API_URL` is set in an environment file.

## 6. Local startup

### Backend

```powershell
cd backend
npm install
npm run seed
node src/server.js
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Typical local URLs:

- backend: `http://localhost:5000`
- frontend: `http://localhost:5173`

## 7. Seed users

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@supplyerp.local` | `Password@123` |
| Sales User | `sales@supplyerp.local` | `Password@123` |

The seed script populates the database with demo inventory, customers, enquiries, quotations, and orders.

## 8. Role permissions

### SALES_USER

- create customers
- create enquiries
- create quotations
- accept or reject quotations
- convert accepted quotations into sales orders
- view records and inventory

### ADMIN

- view all records
- confirm sales orders and reserve stock
- dispatch confirmed orders
- update physical inventory

## 9. API surface

All non-public routes expect a bearer token in the Authorization header:

```http
Authorization: Bearer <jwt_token>
```

### Authentication

| Method | Route | Access |
| --- | --- | --- |
| `POST` | `/auth/login` | Public |

### Customers

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/customers` | Admin, Sales |
| `POST` | `/customers` | Sales |

### Enquiries

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/enquiries` | Admin, Sales |
| `POST` | `/enquiries` | Sales |

### Quotations

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/quotations` | Admin, Sales |
| `POST` | `/quotations` | Sales |
| `PATCH` | `/quotations/:id/status` | Sales |
| `POST` | `/quotations/:id/convert` | Sales |

### Sales orders

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/sales-orders` | Admin, Sales |
| `POST` | `/sales-orders/:id/confirm` | Admin |
| `POST` | `/sales-orders/:id/dispatch` | Admin |

### Inventory

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/inventory` | Admin, Sales |
| `PATCH` | `/inventory/:productId` | Admin |

## 10. Core business rules

- only accepted quotations can be converted into sales orders
- only one quotation may exist per enquiry
- only one sales order may exist per quotation
- inventory reservation happens only after validating all required items
- no partial reservation is allowed if one item fails stock validation
- order dispatch is restricted to admin users
- dispatch updates stock and reserved quantities in a transaction

## 11. Data model summary

The database includes tables for:

- `users`
- `customers`
- `products`
- `inventory`
- `enquiries`
- `enquiry_items`
- `quotations`
- `quotation_items`
- `sales_orders`
- `sales_order_items`
- `dispatches`
- `dispatch_items`

## 12. Current project status

This repo is a working ERP demo that is set up for local development. The backend API and frontend application are aligned to the same workflow and use the same seeded demo data and roles.

The current implementation includes:

- real database-backed API routes
- JWT auth and RBAC
- inventory reservation logic
- sales order confirmation
- dispatch flow
- React dashboard-style UI for ERP operations

## 13. Useful project commands

```powershell
cd backend
npm test
npm run seed
node src/server.js

cd frontend
npm run dev
npm run build
npm run lint
```

cd backend
npm test
```

Each test truncates all tables before running and cleans up after itself. Tests do not depend on seed data.

### Test scenarios covered

| # | Scenario                              |
|---|---------------------------------------|
| 1 | Quotation calculation (qty × price, discount, GST, totals) |
| 2 | DRAFT quotation cannot create Sales Order |
| 3 | REJECTED quotation cannot create Sales Order |
| 4 | Duplicate Sales Order from same quotation is rejected |
| 5 | Cannot reserve more inventory than available |
| 6 | Unauthorized role cannot perform restricted operations |
| 7 | Concurrent reservation does not over-reserve stock |
| 8 | Cannot dispatch more than reserved quantity |
| 9 | Cannot dispatch a cancelled Sales Order |
| 10| Multi-product reservation rolls back entirely if one item fails |

---

## Health Check

```
GET http://localhost:5000/health
→ { "message": "Supply ERP backend is running" }
```
