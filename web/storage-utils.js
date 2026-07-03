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
};
