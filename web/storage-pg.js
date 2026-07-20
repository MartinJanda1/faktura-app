const { Pool } = require("pg");
const { getPgConfig } = require("./env-loader");
const { validateImportSql } = require("./sql-export");
const { safeId, parseAmount, formatAmount, formatDate, toIsoString, isoDateToTimestamp, toLocalTimestamp, assertInvoiceDeletable } = require("./storage-utils");

const TEMPLATE_ID = 1;

function rowToInvoice(row, items) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    resolved: row.resolved,
    cancelled: Boolean(row.cancelled),
    variableSymbolManual: row.variable_symbol_manual,
    version: row.data_version,
    layout: row.layout || "classic",
    footerNote: row.footer_note || "",
    supplier: {
      name: row.supplier_name || "",
      address: row.supplier_address || "",
      city: row.supplier_city || "",
      country: row.supplier_country || "",
      ico: row.supplier_ico || "",
      email: row.supplier_email || "",
      phone: row.supplier_phone || "",
      vatNote: row.supplier_vat_note || "",
    },
    customer: {
      name: row.customer_name || "",
      address: row.customer_address || "",
      city: row.customer_city || "",
      country: row.customer_country || "",
      ico: row.customer_ico || "",
      dic: row.customer_dic || "",
    },
    dates: {
      issue: formatDate(row.issue_date),
      due: formatDate(row.due_date),
      orderNumber: row.order_number || "",
    },
    payment: {
      accountNumber: row.payment_account_number || "",
      iban: row.payment_iban || "",
      swift: row.payment_swift || "",
      variableSymbol: row.payment_variable_symbol || "",
      constantSymbol: row.payment_constant_symbol || "",
      method: row.payment_method || "Převodem",
    },
    items: (items || []).map((item) => ({
      desc: item.description || "",
      qty: formatAmount(item.qty),
      unit: item.unit || "ks",
      unitPrice: formatAmount(item.unit_price),
    })),
    createdAt: toIsoString(row.created_at),
    savedAt: toIsoString(row.saved_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function rowToTemplate(row, items) {
  return {
    sourceInvoiceNumber: row.source_invoice_number || "",
    version: row.data_version,
    savedAt: toIsoString(row.saved_at),
    supplier: {
      name: row.supplier_name || "",
      address: row.supplier_address || "",
      city: row.supplier_city || "",
      country: row.supplier_country || "",
      ico: row.supplier_ico || "",
      email: row.supplier_email || "",
      phone: row.supplier_phone || "",
    },
    customer: {
      name: row.customer_name || "",
      address: row.customer_address || "",
      city: row.customer_city || "",
      country: row.customer_country || "",
      ico: row.customer_ico || "",
      dic: row.customer_dic || "",
    },
    payment: {
      accountNumber: row.payment_account_number || "",
      iban: row.payment_iban || "",
      swift: row.payment_swift || "",
      constantSymbol: row.payment_constant_symbol || "",
      method: row.payment_method || "Převodem",
    },
    items: (items || []).map((item) => ({
      desc: item.description || "",
      qty: formatAmount(item.qty),
      unit: item.unit || "ks",
      unitPrice: formatAmount(item.unit_price),
    })),
  };
}

function templateHasData(row, items) {
  if (!row) return false;
  if (row.source_invoice_number) return true;
  if (row.supplier_name || row.customer_name || row.payment_account_number) return true;
  return (items || []).some(
    (item) =>
      item.description ||
      parseAmount(item.qty) > 0 ||
      parseAmount(item.unit_price) > 0
  );
}

function createPgStorage({ dataVersion }) {
  const pool = new Pool(getPgConfig());
  let databaseName = "";

  async function loadInvoiceItems(client, invoiceId) {
    const { rows } = await client.query(
      `SELECT description, qty, unit, unit_price, position
       FROM invoice_items
       WHERE invoice_id = $1
       ORDER BY position ASC`,
      [invoiceId]
    );
    return rows;
  }

  async function loadTemplateItems(client) {
    const { rows } = await client.query(
      `SELECT description, qty, unit, unit_price, position
       FROM template_items
       WHERE template_id = $1
       ORDER BY position ASC`,
      [TEMPLATE_ID]
    );
    return rows;
  }

  async function listInvoices() {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT * FROM invoices ORDER BY updated_at DESC`
      );
      const invoices = [];
      for (const row of rows) {
        const items = await loadInvoiceItems(client, row.id);
        invoices.push(rowToInvoice(row, items));
      }
      return invoices;
    } finally {
      client.release();
    }
  }

  async function readInvoiceById(id) {
    const safe = safeId(id);
    if (!safe) throw new Error("Chybí ID faktury.");

    const client = await pool.connect();
    try {
      const { rows } = await client.query(`SELECT * FROM invoices WHERE id = $1`, [safe]);
      if (!rows.length) {
        const err = new Error("Faktura nenalezena.");
        err.code = "ENOENT";
        throw err;
      }
      const items = await loadInvoiceItems(client, safe);
      return rowToInvoice(rows[0], items);
    } finally {
      client.release();
    }
  }

  async function saveInvoiceItems(client, invoiceId, items) {
    await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoiceId]);
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      await client.query(
        `INSERT INTO invoice_items (invoice_id, position, description, qty, unit, unit_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          invoiceId,
          i,
          item.desc || "",
          parseAmount(item.qty),
          item.unit || "ks",
          parseAmount(item.unitPrice),
        ]
      );
    }
  }

  async function saveInvoiceRecord(invoice) {
    const now = new Date();
    const id = safeId(invoice.id) || `inv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let createdAt = now;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query(`SELECT created_at FROM invoices WHERE id = $1`, [id]);
      if (existing.rows.length) {
        createdAt = existing.rows[0].created_at || now;
      }

      const supplier = invoice.supplier || {};
      const customer = invoice.customer || {};
      const dates = invoice.dates || {};
      const payment = invoice.payment || {};

      await client.query(
        `INSERT INTO invoices (
          id, invoice_number, resolved, cancelled, variable_symbol_manual, data_version,
          layout, supplier_vat_note, footer_note,
          supplier_name, supplier_address, supplier_city, supplier_country, supplier_ico, supplier_email, supplier_phone,
          customer_name, customer_address, customer_city, customer_country, customer_ico, customer_dic,
          issue_date, due_date, order_number,
          payment_account_number, payment_iban, payment_swift, payment_variable_symbol, payment_constant_symbol, payment_method,
          created_at, saved_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22,
          $23, $24, $25,
          $26, $27, $28, $29, $30, $31,
          $32, $33, $34
        )
        ON CONFLICT (id) DO UPDATE SET
          invoice_number = EXCLUDED.invoice_number,
          resolved = EXCLUDED.resolved,
          cancelled = EXCLUDED.cancelled,
          variable_symbol_manual = EXCLUDED.variable_symbol_manual,
          data_version = EXCLUDED.data_version,
          layout = EXCLUDED.layout,
          supplier_vat_note = EXCLUDED.supplier_vat_note,
          footer_note = EXCLUDED.footer_note,
          supplier_name = EXCLUDED.supplier_name,
          supplier_address = EXCLUDED.supplier_address,
          supplier_city = EXCLUDED.supplier_city,
          supplier_country = EXCLUDED.supplier_country,
          supplier_ico = EXCLUDED.supplier_ico,
          supplier_email = EXCLUDED.supplier_email,
          supplier_phone = EXCLUDED.supplier_phone,
          customer_name = EXCLUDED.customer_name,
          customer_address = EXCLUDED.customer_address,
          customer_city = EXCLUDED.customer_city,
          customer_country = EXCLUDED.customer_country,
          customer_ico = EXCLUDED.customer_ico,
          customer_dic = EXCLUDED.customer_dic,
          issue_date = EXCLUDED.issue_date,
          due_date = EXCLUDED.due_date,
          order_number = EXCLUDED.order_number,
          payment_account_number = EXCLUDED.payment_account_number,
          payment_iban = EXCLUDED.payment_iban,
          payment_swift = EXCLUDED.payment_swift,
          payment_variable_symbol = EXCLUDED.payment_variable_symbol,
          payment_constant_symbol = EXCLUDED.payment_constant_symbol,
          payment_method = EXCLUDED.payment_method,
          saved_at = EXCLUDED.saved_at,
          updated_at = EXCLUDED.updated_at`,
        [
          id,
          invoice.invoiceNumber || "",
          Boolean(invoice.resolved),
          Boolean(invoice.cancelled),
          Boolean(invoice.variableSymbolManual),
          dataVersion,
          invoice.layout || "classic",
          supplier.vatNote || "",
          invoice.footerNote || "",
          supplier.name || "",
          supplier.address || "",
          supplier.city || "",
          supplier.country || "Česká republika",
          supplier.ico || "",
          supplier.email || "",
          supplier.phone || "",
          customer.name || "",
          customer.address || "",
          customer.city || "",
          customer.country || "Česká republika",
          customer.ico || "",
          customer.dic || "",
          isoDateToTimestamp(dates.issue),
          isoDateToTimestamp(dates.due),
          dates.orderNumber || "",
          payment.accountNumber || "",
          payment.iban || "",
          payment.swift || "",
          payment.variableSymbol || "",
          payment.constantSymbol || "",
          payment.method || "Převodem",
          toLocalTimestamp(createdAt),
          toLocalTimestamp(now),
          toLocalTimestamp(now),
        ]
      );

      await saveInvoiceItems(client, id, invoice.items);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23505") {
        throw new Error(`Faktura s číslem ${invoice.invoiceNumber || ""} už existuje.`);
      }
      throw err;
    } finally {
      client.release();
    }

    return readInvoiceById(id);
  }

  async function deleteInvoiceById(id) {
    const safe = safeId(id);
    if (!safe) throw new Error("Chybí ID faktury.");

    const invoice = await readInvoiceById(safe).catch((err) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
    if (!invoice) {
      const err = new Error("Faktura nenalezena.");
      err.code = "ENOENT";
      throw err;
    }

    const all = await listInvoices();
    assertInvoiceDeletable(invoice, all);

    await pool.query(`DELETE FROM invoices WHERE id = $1`, [safe]);
  }

  async function readTemplate() {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`SELECT * FROM templates WHERE id = $1`, [TEMPLATE_ID]);
      if (!rows.length) return null;
      const items = await loadTemplateItems(client);
      if (!templateHasData(rows[0], items)) return null;
      return rowToTemplate(rows[0], items);
    } finally {
      client.release();
    }
  }

  async function saveTemplateItems(client, items) {
    await client.query(`DELETE FROM template_items WHERE template_id = $1`, [TEMPLATE_ID]);
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      await client.query(
        `INSERT INTO template_items (template_id, position, description, qty, unit, unit_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          TEMPLATE_ID,
          i,
          item.desc || "",
          parseAmount(item.qty),
          item.unit || "ks",
          parseAmount(item.unitPrice),
        ]
      );
    }
  }

  async function saveTemplateRecord(template) {
    const now = new Date();
    const supplier = template.supplier || {};
    const customer = template.customer || {};
    const payment = template.payment || {};

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO templates (
          id, source_invoice_number, data_version,
          supplier_name, supplier_address, supplier_city, supplier_country, supplier_ico, supplier_email, supplier_phone,
          customer_name, customer_address, customer_city, customer_country, customer_ico, customer_dic,
          payment_account_number, payment_iban, payment_swift, payment_constant_symbol, payment_method,
          saved_at
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22
        )
        ON CONFLICT (id) DO UPDATE SET
          source_invoice_number = EXCLUDED.source_invoice_number,
          data_version = EXCLUDED.data_version,
          supplier_name = EXCLUDED.supplier_name,
          supplier_address = EXCLUDED.supplier_address,
          supplier_city = EXCLUDED.supplier_city,
          supplier_country = EXCLUDED.supplier_country,
          supplier_ico = EXCLUDED.supplier_ico,
          supplier_email = EXCLUDED.supplier_email,
          supplier_phone = EXCLUDED.supplier_phone,
          customer_name = EXCLUDED.customer_name,
          customer_address = EXCLUDED.customer_address,
          customer_city = EXCLUDED.customer_city,
          customer_country = EXCLUDED.customer_country,
          customer_ico = EXCLUDED.customer_ico,
          customer_dic = EXCLUDED.customer_dic,
          payment_account_number = EXCLUDED.payment_account_number,
          payment_iban = EXCLUDED.payment_iban,
          payment_swift = EXCLUDED.payment_swift,
          payment_constant_symbol = EXCLUDED.payment_constant_symbol,
          payment_method = EXCLUDED.payment_method,
          saved_at = EXCLUDED.saved_at`,
        [
          TEMPLATE_ID,
          template.sourceInvoiceNumber || "",
          dataVersion,
          supplier.name || "",
          supplier.address || "",
          supplier.city || "",
          supplier.country || "Česká republika",
          supplier.ico || "",
          supplier.email || "",
          supplier.phone || "",
          customer.name || "",
          customer.address || "",
          customer.city || "",
          customer.country || "Česká republika",
          customer.ico || "",
          customer.dic || "",
          payment.accountNumber || "",
          payment.iban || "",
          payment.swift || "",
          payment.constantSymbol || "",
          payment.method || "Převodem",
          now,
        ]
      );

      await saveTemplateItems(client, template.items);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return readTemplate();
  }

  async function deleteTemplateRecord() {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM template_items WHERE template_id = $1`, [TEMPLATE_ID]);
      await client.query(
        `UPDATE templates SET
          source_invoice_number = '',
          data_version = $2,
          supplier_name = '', supplier_address = '', supplier_city = '',
          supplier_country = 'Česká republika', supplier_ico = '', supplier_email = '', supplier_phone = '',
          customer_name = '', customer_address = '', customer_city = '',
          customer_country = 'Česká republika', customer_ico = '', customer_dic = '',
          payment_account_number = '', payment_iban = '', payment_swift = '',
          payment_constant_symbol = '', payment_method = 'Převodem',
          saved_at = NOW()
         WHERE id = $1`,
        [TEMPLATE_ID, dataVersion]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async function importSqlScript(sql) {
    const statements = validateImportSql(sql);
    const client = await pool.connect();
    let importedCount = 0;

    try {
      await client.query("BEGIN");
      for (const stmt of statements) {
        const upper = stmt.trim().toUpperCase();
        if (upper === "BEGIN" || upper === "COMMIT" || upper === "ROLLBACK") continue;
        if (/^INSERT INTO INVOICES\b/.test(upper)) importedCount += 1;
        await client.query(stmt);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return { importedCount };
  }

  return {
    kind: "postgres",
    async ensureReady() {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
        databaseName = client.database || getPgConfig().database || "postgresql";
      } finally {
        client.release();
      }
    },
    async shutdown() {
      await pool.end();
    },
    getStatus() {
      const cfg = getPgConfig();
      const host = cfg.host || (cfg.connectionString ? "DATABASE_URL" : "localhost");
      const database = cfg.database || databaseName || "postgresql";
      return {
        storage: "postgres",
        description: `PostgreSQL (${database} @ ${host})`,
        database,
        host,
      };
    },
    listInvoices,
    readInvoiceById,
    saveInvoiceRecord,
    deleteInvoiceById,
    readTemplate,
    saveTemplateRecord,
    deleteTemplateRecord,
    importSqlScript,
  };
}

module.exports = { createPgStorage };
