-- Volitelný vizuální layout faktury + poznámky pro iDoklad šablonu

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS layout VARCHAR(20) NOT NULL DEFAULT 'classic';

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS supplier_vat_note VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS footer_note VARCHAR(500) NOT NULL DEFAULT '';
