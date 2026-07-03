-- Indexy pro běžné dotazy v seznamu faktur

CREATE INDEX IF NOT EXISTS idx_invoices_issue_date
    ON invoices (issue_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_name
    ON invoices (customer_name);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_ico
    ON invoices (customer_ico);

CREATE INDEX IF NOT EXISTS idx_invoices_resolved
    ON invoices (resolved);

CREATE INDEX IF NOT EXISTS idx_invoices_updated_at
    ON invoices (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id
    ON invoice_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_template_items_template_id
    ON template_items (template_id);
