-- Supply / Manufacturing ERP
-- PostgreSQL schema — apply once against an empty database before running the seed script.
-- Run: psql -U postgres -d supply_erp -f schema.sql

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
    id            SERIAL          PRIMARY KEY,
    name          VARCHAR(255)    NOT NULL,
    email         VARCHAR(255)    NOT NULL UNIQUE,
    password_hash VARCHAR(255)    NOT NULL,
    role          VARCHAR(20)     NOT NULL CHECK (role IN ('ADMIN', 'SALES_USER')),
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Customers ────────────────────────────────────────────────────────────────

CREATE TABLE customers (
    id             SERIAL          PRIMARY KEY,
    company_name   VARCHAR(255)    NOT NULL,
    contact_person VARCHAR(255)    NOT NULL,
    mobile         VARCHAR(20)     NOT NULL,
    email          VARCHAR(255),
    city           VARCHAR(100),
    created_at     TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Products ─────────────────────────────────────────────────────────────────

CREATE TABLE products (
    id           SERIAL           PRIMARY KEY,
    product_code VARCHAR(50)      NOT NULL UNIQUE,
    product_name VARCHAR(255)     NOT NULL,
    category     VARCHAR(100)     NOT NULL,
    unit         VARCHAR(50)      NOT NULL,
    base_price   NUMERIC(15, 2)   NOT NULL CHECK (base_price >= 0)
);

-- ─── Inventory ────────────────────────────────────────────────────────────────

CREATE TABLE inventory (
    product_id   INTEGER          PRIMARY KEY REFERENCES products (id),
    physical_qty INTEGER          NOT NULL DEFAULT 0 CHECK (physical_qty >= 0),
    reserved_qty INTEGER          NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
    updated_at   TIMESTAMPTZ      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Enquiries ────────────────────────────────────────────────────────────────

CREATE TABLE enquiries (
    id              SERIAL          PRIMARY KEY,
    enquiry_number  VARCHAR(50)     NOT NULL UNIQUE,
    customer_id     INTEGER         NOT NULL REFERENCES customers (id),
    enquiry_date    DATE            NOT NULL DEFAULT CURRENT_DATE,
    required_date   DATE            NOT NULL,
    status          VARCHAR(20)     NOT NULL DEFAULT 'OPEN'
                                    CHECK (status IN ('OPEN', 'QUOTED', 'WON', 'LOST')),
    notes           TEXT,
    created_by      INTEGER         NOT NULL REFERENCES users (id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE enquiry_items (
    id          SERIAL      PRIMARY KEY,
    enquiry_id  INTEGER     NOT NULL REFERENCES enquiries (id),
    product_id  INTEGER     NOT NULL REFERENCES products (id),
    quantity    INTEGER     NOT NULL CHECK (quantity > 0)
);

-- ─── Quotations ───────────────────────────────────────────────────────────────

CREATE TABLE quotations (
    id               SERIAL           PRIMARY KEY,
    quotation_number VARCHAR(50)      NOT NULL UNIQUE,
    enquiry_id       INTEGER          NOT NULL UNIQUE REFERENCES enquiries (id),
    customer_id      INTEGER          NOT NULL REFERENCES customers (id),
    valid_until      DATE             NOT NULL,
    discount_percent NUMERIC(5, 2)    NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
    gst_percent      NUMERIC(5, 2)    NOT NULL DEFAULT 0 CHECK (gst_percent >= 0),
    total_amount     NUMERIC(15, 2)   NOT NULL DEFAULT 0,
    status           VARCHAR(20)      NOT NULL DEFAULT 'DRAFT'
                                      CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED')),
    created_by       INTEGER          NOT NULL REFERENCES users (id),
    created_at       TIMESTAMPTZ      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quotation_items (
    id               SERIAL           PRIMARY KEY,
    quotation_id     INTEGER          NOT NULL REFERENCES quotations (id),
    product_id       INTEGER          NOT NULL REFERENCES products (id),
    quantity         INTEGER          NOT NULL CHECK (quantity > 0),
    unit_price       NUMERIC(15, 2)   NOT NULL CHECK (unit_price >= 0),
    discount_percent NUMERIC(5, 2)    NOT NULL DEFAULT 0,
    gst_percent      NUMERIC(5, 2)    NOT NULL DEFAULT 0,
    line_amount      NUMERIC(15, 2)   NOT NULL DEFAULT 0
);

-- ─── Sales Orders ─────────────────────────────────────────────────────────────

CREATE TABLE sales_orders (
    id           SERIAL           PRIMARY KEY,
    order_number VARCHAR(50)      NOT NULL UNIQUE,
    quotation_id INTEGER          NOT NULL UNIQUE REFERENCES quotations (id),
    customer_id  INTEGER          NOT NULL REFERENCES customers (id),
    order_date   DATE             NOT NULL DEFAULT CURRENT_DATE,
    total_amount NUMERIC(15, 2)   NOT NULL DEFAULT 0,
    status       VARCHAR(20)      NOT NULL DEFAULT 'PENDING'
                                  CHECK (status IN ('PENDING', 'CONFIRMED', 'DISPATCHED', 'CANCELLED'))
);

CREATE TABLE sales_order_items (
    id             SERIAL           PRIMARY KEY,
    sales_order_id INTEGER          NOT NULL REFERENCES sales_orders (id),
    product_id     INTEGER          NOT NULL REFERENCES products (id),
    quantity       INTEGER          NOT NULL CHECK (quantity > 0),
    unit_price     NUMERIC(15, 2)   NOT NULL CHECK (unit_price >= 0),
    line_amount    NUMERIC(15, 2)   NOT NULL DEFAULT 0
);

-- ─── Dispatches ───────────────────────────────────────────────────────────────

CREATE TABLE dispatches (
    id              SERIAL       PRIMARY KEY,
    dispatch_number VARCHAR(50)  NOT NULL UNIQUE,
    sales_order_id  INTEGER      NOT NULL UNIQUE REFERENCES sales_orders (id),
    dispatch_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
    vehicle_number  VARCHAR(50)  NOT NULL,
    driver_name     VARCHAR(255) NOT NULL
);

CREATE TABLE dispatch_items (
    id          SERIAL      PRIMARY KEY,
    dispatch_id INTEGER     NOT NULL REFERENCES dispatches (id),
    product_id  INTEGER     NOT NULL REFERENCES products (id),
    quantity    INTEGER     NOT NULL CHECK (quantity > 0)
);
