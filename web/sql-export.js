/**
 * Export / import faktur jako SQL INSERT (PostgreSQL).
 * Použitelné v prohlížeči (FakturaSql) i na serveru (require).
 */

function parseAmount(value) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseIsoDate(isoDate) {
  if (!isoDate) return null;
  const str = String(isoDate).slice(0, 10);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatLocalTimestamp(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    const h = String(value.getHours()).padStart(2, "0");
    const min = String(value.getMinutes()).padStart(2, "0");
    const s = String(value.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str.slice(0, 10))) return `${str.slice(0, 10)} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return formatLocalTimestamp(new Date(str));
  if (/^\d{4}-\d{2}-\d{2} /.test(str)) return str.slice(0, 19);
  return str;
}

function sqlTimestampLiteral(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${formatLocalTimestamp(value).replace(/'/g, "''")}'`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (value === "") return "''";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return sqlTimestampLiteral(value);
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  const num = typeof value === "number" ? value : parseAmount(value);
  return Number.isFinite(num) ? num.toFixed(4) : "0.0000";
}

const INVOICE_UPDATE_SET = `
  invoice_number = EXCLUDED.invoice_number,
  resolved = EXCLUDED.resolved,
  variable_symbol_manual = EXCLUDED.variable_symbol_manual,
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
  updated_at = EXCLUDED.updated_at`.trim();

function invoiceToSqlStatements(invoice, dataVersion = 1) {
  const supplier = invoice.supplier || {};
  const customer = invoice.customer || {};
  const dates = invoice.dates || {};
  const payment = invoice.payment || {};
  const id = invoice.id;
  const now = invoice.updatedAt || invoice.savedAt || new Date().toISOString();
  const createdAt = invoice.createdAt || now;
  const lines = [];

  lines.push(`-- Faktura: ${invoice.invoiceNumber || id}`);
  lines.push(
    `INSERT INTO invoices (
  id, invoice_number, resolved, variable_symbol_manual, data_version,
  supplier_name, supplier_address, supplier_city, supplier_country, supplier_ico, supplier_email, supplier_phone,
  customer_name, customer_address, customer_city, customer_country, customer_ico, customer_dic,
  issue_date, due_date, order_number,
  payment_account_number, payment_iban, payment_swift, payment_variable_symbol, payment_constant_symbol, payment_method,
  created_at, saved_at, updated_at
) VALUES (
  ${sqlLiteral(id)},
  ${sqlLiteral(invoice.invoiceNumber || "")},
  ${sqlLiteral(Boolean(invoice.resolved))},
  ${sqlLiteral(Boolean(invoice.variableSymbolManual))},
  ${dataVersion},
  ${sqlLiteral(supplier.name || "")},
  ${sqlLiteral(supplier.address || "")},
  ${sqlLiteral(supplier.city || "")},
  ${sqlLiteral(supplier.country || "Česká republika")},
  ${sqlLiteral(supplier.ico || "")},
  ${sqlLiteral(supplier.email || "")},
  ${sqlLiteral(supplier.phone || "")},
  ${sqlLiteral(customer.name || "")},
  ${sqlLiteral(customer.address || "")},
  ${sqlLiteral(customer.city || "")},
  ${sqlLiteral(customer.country || "Česká republika")},
  ${sqlLiteral(customer.ico || "")},
  ${sqlLiteral(customer.dic || "")},
  ${sqlTimestampLiteral(dates.issue)},
  ${sqlTimestampLiteral(dates.due)},
  ${sqlLiteral(dates.orderNumber || "")},
  ${sqlLiteral(payment.accountNumber || "")},
  ${sqlLiteral(payment.iban || "")},
  ${sqlLiteral(payment.swift || "")},
  ${sqlLiteral(payment.variableSymbol || "")},
  ${sqlLiteral(payment.constantSymbol || "")},
  ${sqlLiteral(payment.method || "Převodem")},
  ${sqlTimestampLiteral(createdAt)},
  ${sqlTimestampLiteral(now)},
  ${sqlTimestampLiteral(now)}
) ON CONFLICT (id) DO UPDATE SET ${INVOICE_UPDATE_SET};`
  );

  lines.push(`DELETE FROM invoice_items WHERE invoice_id = ${sqlLiteral(id)};`);

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  if (items.length) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      lines.push(
        `INSERT INTO invoice_items (invoice_id, position, description, qty, unit, unit_price) VALUES (
  ${sqlLiteral(id)}, ${i}, ${sqlLiteral(item.desc || "")}, ${sqlNumber(item.qty)}, ${sqlLiteral(item.unit || "ks")}, ${sqlNumber(item.unitPrice)}
);`
      );
    }
  }

  return lines;
}

function invoicesToSqlScript(invoices, dataVersion = 1) {
  const header = [
    "-- Faktura-app SQL export",
    `-- Generated: ${new Date().toISOString()}`,
    `-- Invoices: ${invoices.length}`,
    "BEGIN;",
    "",
  ];
  const body = invoices.flatMap((inv) => invoiceToSqlStatements(inv, dataVersion));
  const footer = ["", "COMMIT;", ""];
  return [...header, ...body, ...footer].join("\n");
}

function stripSqlComments(sql) {
  return sql.replace(/--[^\n\r]*/g, "");
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" && sql[i + 1] === "'") {
      current += "''";
      i += 1;
      continue;
    }
    if (ch === "'") {
      inString = !inString;
      current += ch;
      continue;
    }
    if (ch === ";" && !inString) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function validateImportSql(sql) {
  const statements = splitSqlStatements(stripSqlComments(sql));
  if (!statements.length) {
    throw new Error("Soubor neobsahuje žádné SQL příkazy.");
  }

  for (const stmt of statements) {
    const upper = stmt.trim().toUpperCase();
    if (upper === "BEGIN" || upper === "COMMIT" || upper === "ROLLBACK") continue;
    if (/^INSERT INTO INVOICES\b/.test(upper)) continue;
    if (/^INSERT INTO INVOICE_ITEMS\b/.test(upper)) continue;
    if (/^DELETE FROM INVOICE_ITEMS\b/.test(upper)) continue;
    throw new Error(`Nepovolený SQL příkaz: ${stmt.slice(0, 100)}…`);
  }

  return statements;
}

const api = {
  parseAmount,
  invoicesToSqlScript,
  validateImportSql,
  splitSqlStatements,
  stripSqlComments,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}

if (typeof window !== "undefined") {
  window.FakturaSql = api;
}
