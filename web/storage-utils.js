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

function formatDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIsoString(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

module.exports = { safeId, parseAmount, formatAmount, formatDate, toIsoString };
