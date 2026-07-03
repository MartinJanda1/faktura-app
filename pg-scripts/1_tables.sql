-- Faktura-app: základní tabulky (faktury, položky, šablona)
-- Odpovídá struktuře web/data/invoices/*.json a web/data/sablona.json

CREATE TABLE IF NOT EXISTS invoices (
    id                      VARCHAR(64) PRIMARY KEY,
    invoice_number          VARCHAR(50)  NOT NULL,
    resolved                BOOLEAN      NOT NULL DEFAULT FALSE,
    variable_symbol_manual  BOOLEAN      NOT NULL DEFAULT FALSE,
    data_version            INTEGER      NOT NULL DEFAULT 1,

    -- Dodavatel (supplier)
    supplier_name           VARCHAR(255) NOT NULL DEFAULT '',
    supplier_address        VARCHAR(255) NOT NULL DEFAULT '',
    supplier_city           VARCHAR(120) NOT NULL DEFAULT '',
    supplier_country        VARCHAR(120) NOT NULL DEFAULT 'Česká republika',
    supplier_ico            VARCHAR(20)  NOT NULL DEFAULT '',
    supplier_email          VARCHAR(255) NOT NULL DEFAULT '',
    supplier_phone          VARCHAR(50)  NOT NULL DEFAULT '',

    -- Odběratel (customer)
    customer_name           VARCHAR(255) NOT NULL DEFAULT '',
    customer_address        VARCHAR(255) NOT NULL DEFAULT '',
    customer_city           VARCHAR(120) NOT NULL DEFAULT '',
    customer_country        VARCHAR(120) NOT NULL DEFAULT 'Česká republika',
    customer_ico            VARCHAR(20)  NOT NULL DEFAULT '',
    customer_dic            VARCHAR(20)  NOT NULL DEFAULT '',

    -- Datumy (dates)
    issue_date              TIMESTAMP WITHOUT TIME ZONE,
    due_date                TIMESTAMP WITHOUT TIME ZONE,
    order_number            VARCHAR(100) NOT NULL DEFAULT '',

    -- Platba (payment)
    payment_account_number  VARCHAR(50)  NOT NULL DEFAULT '',
    payment_iban            VARCHAR(34)  NOT NULL DEFAULT '',
    payment_swift           VARCHAR(11)  NOT NULL DEFAULT '',
    payment_variable_symbol VARCHAR(20)  NOT NULL DEFAULT '',
    payment_constant_symbol VARCHAR(10)  NOT NULL DEFAULT '',
    payment_method          VARCHAR(50)  NOT NULL DEFAULT 'Převodem',

    created_at              TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    saved_at                TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at              TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),

    CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number),
    CONSTRAINT invoices_data_version_positive CHECK (data_version >= 1)
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id              BIGSERIAL PRIMARY KEY,
    invoice_id      VARCHAR(64)  NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    position        SMALLINT     NOT NULL DEFAULT 0,
    description     TEXT         NOT NULL DEFAULT '',
    qty             NUMERIC(14, 4) NOT NULL DEFAULT 0,
    unit            VARCHAR(20)  NOT NULL DEFAULT 'ks',
    unit_price      NUMERIC(14, 4) NOT NULL DEFAULT 0,

    CONSTRAINT invoice_items_invoice_position_unique UNIQUE (invoice_id, position),
    CONSTRAINT invoice_items_position_non_negative CHECK (position >= 0),
    CONSTRAINT invoice_items_qty_non_negative CHECK (qty >= 0),
    CONSTRAINT invoice_items_unit_price_non_negative CHECK (unit_price >= 0)
);

-- Aplikace drží jednu aktivní šablonu (soubor sablona.json) — id = 1
CREATE TABLE IF NOT EXISTS templates (
    id                      INTEGER PRIMARY KEY DEFAULT 1,
    source_invoice_number   VARCHAR(50)  NOT NULL DEFAULT '',
    data_version            INTEGER      NOT NULL DEFAULT 1,

    supplier_name           VARCHAR(255) NOT NULL DEFAULT '',
    supplier_address        VARCHAR(255) NOT NULL DEFAULT '',
    supplier_city           VARCHAR(120) NOT NULL DEFAULT '',
    supplier_country        VARCHAR(120) NOT NULL DEFAULT 'Česká republika',
    supplier_ico            VARCHAR(20)  NOT NULL DEFAULT '',
    supplier_email          VARCHAR(255) NOT NULL DEFAULT '',
    supplier_phone          VARCHAR(50)  NOT NULL DEFAULT '',

    customer_name           VARCHAR(255) NOT NULL DEFAULT '',
    customer_address        VARCHAR(255) NOT NULL DEFAULT '',
    customer_city           VARCHAR(120) NOT NULL DEFAULT '',
    customer_country        VARCHAR(120) NOT NULL DEFAULT 'Česká republika',
    customer_ico            VARCHAR(20)  NOT NULL DEFAULT '',
    customer_dic            VARCHAR(20)  NOT NULL DEFAULT '',

    payment_account_number  VARCHAR(50)  NOT NULL DEFAULT '',
    payment_iban            VARCHAR(34)  NOT NULL DEFAULT '',
    payment_swift           VARCHAR(11)  NOT NULL DEFAULT '',
    payment_constant_symbol VARCHAR(10)  NOT NULL DEFAULT '',
    payment_method          VARCHAR(50)  NOT NULL DEFAULT 'Převodem',

    saved_at                TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),

    CONSTRAINT templates_singleton CHECK (id = 1),
    CONSTRAINT templates_data_version_positive CHECK (data_version >= 1)
);

CREATE TABLE IF NOT EXISTS template_items (
    id              BIGSERIAL PRIMARY KEY,
    template_id     INTEGER      NOT NULL DEFAULT 1 REFERENCES templates (id) ON DELETE CASCADE,
    position        SMALLINT     NOT NULL DEFAULT 0,
    description     TEXT         NOT NULL DEFAULT '',
    qty             NUMERIC(14, 4) NOT NULL DEFAULT 0,
    unit            VARCHAR(20)  NOT NULL DEFAULT 'ks',
    unit_price      NUMERIC(14, 4) NOT NULL DEFAULT 0,

    CONSTRAINT template_items_template_position_unique UNIQUE (template_id, position),
    CONSTRAINT template_items_position_non_negative CHECK (position >= 0),
    CONSTRAINT template_items_qty_non_negative CHECK (qty >= 0),
    CONSTRAINT template_items_unit_price_non_negative CHECK (unit_price >= 0)
);

-- Prázdný řádek šablony (aplikace očekává jednu aktivní šablonu)
INSERT INTO templates (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
