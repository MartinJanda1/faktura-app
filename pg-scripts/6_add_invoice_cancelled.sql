-- Přidá stav stornováno (cancelled) k fakturám
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT FALSE;
