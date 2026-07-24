function safeId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function parseAmount(value) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function formatAmount(value) {
  const num = typeof value === "number" ? value : parseAmount(value);
  return num.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseIsoDate(isoDate) {
  if (!isoDate) return null;
  const str = String(isoDate).slice(0, 10);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toLocalIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Lokální čas bez timezone — pro TIMESTAMP WITHOUT TIME ZONE v PostgreSQL */
function toLocalTimestamp(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${toLocalIsoDate(d)} ${h}:${min}:${s}`;
}

function isoDateToTimestamp(isoDate) {
  const d = parseIsoDate(isoDate);
  if (!d) return null;
  return `${toLocalIsoDate(d)} 00:00:00`;
}

function formatDate(value) {
  if (!value) return "";
  if (value instanceof Date) return toLocalIsoDate(value);
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2} /.test(str)) return str.slice(0, 10);
  return str.slice(0, 10);
}

function toIsoString(value) {
  if (!value) return undefined;
  if (value instanceof Date) return toLocalTimestamp(value).replace(" ", "T");
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2} /.test(str)) return str.replace(" ", "T");
  return str;
}

function partyKey(party) {
  const p = party || {};
  const ico = String(p.ico || "").replace(/\D/g, "");
  if (ico) return `ico:${ico}`;
  const name = String(p.name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return name ? `name:${name}` : "";
}

function parseSeriesYearNumber(value) {
  const match = String(value || "").trim().match(/^(\d+)\/(\d{2,4})$/);
  if (!match) return null;
  const yStr = match[2];
  const n = parseInt(yStr, 10);
  const year = yStr.length === 2 ? (n >= 70 ? 1900 + n : 2000 + n) : n;
  return { sequence: parseInt(match[1], 10), year };
}

function assertInvoiceDeletable(invoice, allInvoices = []) {
  if (!invoice) {
    const err = new Error("Faktura nenalezena.");
    err.code = "ENOENT";
    throw err;
  }
  if (invoice.cancelled) throw new Error("Stornovanou fakturu nelze smazat.");
  if (invoice.resolved) throw new Error("Vyřízenou fakturu nelze smazat.");

  const key = partyKey(invoice.supplier);
  const scoped = key
    ? allInvoices.filter((inv) => partyKey(inv.supplier) === key)
    : allInvoices;

  const parsed = parseSeriesYearNumber(invoice.invoiceNumber);
  if (parsed) {
    let maxSeq = 0;
    for (const inv of scoped) {
      const p = parseSeriesYearNumber(inv.invoiceNumber);
      if (p && p.year === parsed.year) maxSeq = Math.max(maxSeq, p.sequence);
    }
    if (parsed.sequence !== maxSeq) {
      throw new Error("Smazat lze jen poslední nevyřízenou fakturu v číselné řadě.");
    }
    return;
  }

  const numbers = scoped.map((inv) => String(inv.invoiceNumber || "").trim()).filter(Boolean);
  const sorted = [...numbers].sort((a, b) => a.localeCompare(b, "cs", { numeric: true }));
  if (sorted.length && sorted[sorted.length - 1] !== String(invoice.invoiceNumber || "").trim()) {
    throw new Error("Smazat lze jen poslední nevyřízenou fakturu v číselné řadě.");
  }
}

module.exports = {
  safeId,
  parseAmount,
  formatAmount,
  formatDate,
  toIsoString,
  toLocalIsoDate,
  parseIsoDate,
  toLocalTimestamp,
  isoDateToTimestamp,
  assertInvoiceDeletable,
};
