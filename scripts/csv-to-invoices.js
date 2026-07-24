/**
 * Konverze CSV exportu (iDoklad / seznam vydaných faktur) → faktura-app JSON.
 *
 * Usage:
 *   node scripts/csv-to-invoices.js [csvDir] [outJson]
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const csvDir = path.resolve(process.argv[2] || "c:/Develop/faktury");
const outJson = path.resolve(
  process.argv[3] || path.join(__dirname, "../web/data/import-from-csv.json")
);
const writeDir = path.resolve(process.argv[4] || path.join(__dirname, "../web/data/invoices"));

/** Výchozí dodavatel – CSV ho neobsahuje (je to seznam Martin Janda). */
const SUPPLIER = {
  name: "Martin Janda",
  address: "Chuchelská 595/37",
  city: "143 00 Praha 4",
  country: "Česká republika",
  ico: "40782310",
  email: "martin.janda1@gmail.com",
  phone: "604881484",
  vatNote: "Nejsme plátci DPH",
};

const SUPPLIER_PAYMENT = {
  accountNumber: "2100132288/2010",
  iban: "CZ8420100000002100132288",
  swift: "FIOBCZPPXXX",
  bankName: "Fio banka",
  constantSymbol: "0308",
  method: "Převodem",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseUsDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const month = m[1].padStart(2, "0");
  const day = m[2].padStart(2, "0");
  return `${m[3]}-${month}-${day}`;
}

function formatAmountCs(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return "0,00";
  return n.toFixed(2).replace(".", ",");
}

/** Hodiny tak, aby hodiny × sazba daly přesně původní částku. */
function formatHoursCs(total, rate) {
  const target = Math.round(Number(total) * 100) / 100;
  if (!Number.isFinite(target) || !rate) return "0,00";
  for (let decimals = 2; decimals <= 6; decimals++) {
    const hours = Number((target / rate).toFixed(decimals));
    if (Math.round(hours * rate * 100) / 100 === target) {
      return hours.toFixed(decimals).replace(".", ",");
    }
  }
  return (target / rate).toFixed(4).replace(".", ",");
}

function normalizeInvoiceNumber(raw) {
  return String(raw || "")
    .trim()
    .replace(/^VF\s+/i, "")
    .trim();
}

function isResolved(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "uhrazeno" || s.startsWith("uhrazeno");
}

function rowToInvoice(header, cells, sourceFile) {
  const get = (name) => {
    const idx = header.indexOf(name);
    return idx >= 0 ? String(cells[idx] ?? "").trim() : "";
  };

  const invoiceNumber = normalizeInvoiceNumber(get("Číslo dokladu"));
  if (!invoiceNumber) return null;

  const issue = parseUsDate(get("Vystaveno"));
  const due = parseUsDate(get("Splatnost"));
  const total = Number(String(get("Celkem")).replace(/\s/g, "").replace(",", "."));
  const desc = get("Popis") || "Fakturované práce";
  const vs = get("Variabilní symbol") || invoiceNumber.replace(/\D/g, "").slice(0, 10);
  const status = get("Stav úhrady");
  const paidAt = parseUsDate(get("Datum platby"));
  const hourlyRate = 500;

  const id = `csv-${invoiceNumber.replace(/[^\w-]+/g, "_").toLowerCase()}-${crypto
    .createHash("sha1")
    .update(`${invoiceNumber}|${issue}|${get("IČ")}|${total}`)
    .digest("hex")
    .slice(0, 10)}`;

  return {
    id,
    invoiceNumber,
    layout: "classic",
    footerNote: "",
    resolved: isResolved(status),
    cancelled: false,
    variableSymbolManual: Boolean(get("Variabilní symbol")),
    supplier: { ...SUPPLIER },
    customer: {
      name: get("Název/Jméno"),
      address: "",
      city: "",
      country: "Česká republika",
      ico: get("IČ"),
      dic: get("DIČ"),
    },
    dates: {
      issue,
      due,
      orderNumber: get("Číslo objednávky"),
    },
    payment: {
      ...SUPPLIER_PAYMENT,
      variableSymbol: vs,
    },
    items: [
      {
        desc,
        qty: formatHoursCs(total, hourlyRate),
        unit: "hod",
        unitPrice: formatAmountCs(hourlyRate),
      },
    ],
    importedFrom: {
      source: "csv",
      file: path.basename(sourceFile),
      paymentStatus: status,
      paidAt: paidAt || null,
      paidAmount: get("Uhrazená částka") || null,
    },
  };
}

function main() {
  if (!fs.existsSync(csvDir)) {
    console.error("CSV složka neexistuje:", csvDir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(csvDir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort();

  if (!files.length) {
    console.error("Ve složce nejsou žádné CSV soubory:", csvDir);
    process.exit(1);
  }

  const invoices = [];
  const seen = new Set();

  for (const file of files) {
    const full = path.join(csvDir, file);
    let text = fs.readFileSync(full, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = parseCsv(text);
    if (!rows.length) continue;
    const header = rows[0];

    for (const cells of rows.slice(1)) {
      if (!cells.some((c) => String(c || "").trim())) continue;
      const invoice = rowToInvoice(header, cells, full);
      if (!invoice) continue;
      const key = invoice.invoiceNumber.toLowerCase();
      if (seen.has(key)) {
        console.warn("Přeskakuji duplicitní číslo:", invoice.invoiceNumber);
        continue;
      }
      seen.add(key);
      invoices.push(invoice);
    }
  }

  invoices.sort((a, b) => {
    const ai = a.dates.issue || "";
    const bi = b.dates.issue || "";
    if (ai !== bi) return ai.localeCompare(bi);
    return String(a.invoiceNumber).localeCompare(String(b.invoiceNumber), "cs", { numeric: true });
  });

  const payload = {
    type: "faktura-app-invoices",
    version: 1,
    exportedAt: new Date().toISOString(),
    count: invoices.length,
    data: invoices,
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2), "utf8");

  const now = new Date().toISOString();
  fs.mkdirSync(writeDir, { recursive: true });
  let written = 0;
  for (const invoice of invoices) {
    invoice.savedAt = now;
    invoice.updatedAt = now;
    const filePath = path.join(writeDir, `${invoice.id}.json`);
    const wrapped = {
      type: "faktura-app-invoice",
      version: 1,
      exportedAt: now,
      data: invoice,
    };
    fs.writeFileSync(filePath, JSON.stringify(wrapped, null, 2), "utf8");
    written += 1;
  }

  const resolved = invoices.filter((i) => i.resolved).length;
  const open = invoices.length - resolved;
  const customers = new Set(invoices.map((i) => i.customer.name).filter(Boolean));

  console.log(`CSV souborů: ${files.length}`);
  console.log(`Faktur: ${invoices.length} (vyřízených ${resolved}, otevřených ${open})`);
  console.log(`Odběratelů: ${customers.size}`);
  console.log(`JSON export: ${outJson}`);
  console.log(`Zapsáno do: ${writeDir} (${written} souborů)`);
}

main();
