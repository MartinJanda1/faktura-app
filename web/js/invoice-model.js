const InvoiceModel = (() => {
  function toLocalIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function todayIso() {
    return toLocalIsoDate(new Date());
  }

  function dueDateIso(days = 20) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return toLocalIsoDate(d);
  }

  function incrementInvoiceNumber(value) {
    const parsed = typeof InvoiceNumbering !== "undefined" ? InvoiceNumbering.parse(value) : null;
    if (parsed?.kind === "series-year") {
      return InvoiceNumbering.formatSeriesYear(
        parsed.sequence + 1,
        parsed.year,
        parsed.seqPad
      );
    }
    const str = String(value || "").trim();
    const match = str.match(/^(.*?)(\d+)(\s*)$/);
    if (!match) return str ? `${str}-2` : "1";
    const [, prefix, digits, suffix] = match;
    const next = String(parseInt(digits, 10) + 1).padStart(digits.length, "0");
    return `${prefix}${next}${suffix}`;
  }

  function findUniqueInvoiceNumber(baseNumber, existingNumbers = []) {
    if (typeof InvoiceNumbering !== "undefined") {
      return InvoiceNumbering.findUnique(baseNumber, existingNumbers);
    }
    const taken = new Set(
      existingNumbers.map((n) => String(n || "").trim().toLowerCase()).filter(Boolean)
    );
    let candidate = String(baseNumber || "").trim() || "1";
    let guard = 0;
    while (taken.has(candidate.toLowerCase()) && guard < 10000) {
      candidate = incrementInvoiceNumber(candidate);
      guard += 1;
    }
    return candidate;
  }

  function daysBetweenIsoDates(fromIso, toIso) {
    if (!fromIso || !toIso) return null;
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
  }

  function prepareCopyFromInvoice(source, { existingInvoices = [], existingInvoiceNumbers = [] } = {}) {
    const invoice = JSON.parse(JSON.stringify(source));
    delete invoice.id;
    delete invoice.savedAt;
    delete invoice.updatedAt;
    invoice.resolved = false;
    invoice.cancelled = false;

    const invoices =
      existingInvoices.length > 0
        ? existingInvoices
        : existingInvoiceNumbers.map((invoiceNumber) => ({ invoiceNumber }));

    const numbering =
      typeof InvoiceNumbering !== "undefined"
        ? InvoiceNumbering.suggestForCopy(source, invoices, { supplier: source.supplier })
        : {
            number: findUniqueInvoiceNumber(
              incrementInvoiceNumber(source.invoiceNumber),
              invoices.map((inv) => inv.invoiceNumber).filter((n) => n !== source.invoiceNumber)
            ),
          };
    const nextNumber = numbering.number;

    invoice.invoiceNumber = nextNumber;

    const dueOffset = daysBetweenIsoDates(source.dates?.issue, source.dates?.due) ?? 20;
    invoice.dates = {
      ...(invoice.dates || {}),
      issue: todayIso(),
      due: dueDateIso(dueOffset),
    };

    invoice.payment = {
      ...(invoice.payment || {}),
      variableSymbol:
        typeof InvoiceNumbering !== "undefined"
          ? InvoiceNumbering.variableSymbolFromNumber(nextNumber)
          : nextNumber.replace(/\D/g, "").slice(0, 10),
    };
    invoice.variableSymbolManual = false;

    const sourceItems = Array.isArray(source.items) ? source.items : [];
    invoice.items = sourceItems.length
      ? sourceItems.map((item) => ({
          desc: item.desc || "",
          qty: "0,00",
          unit: item.unit || "ks",
          unitPrice: item.unitPrice || "0,00",
        }))
      : [{ desc: "", qty: "0,00", unit: "ks", unitPrice: "0,00" }];

    return invoice;
  }

  function defaultEmptyInvoice() {
    return {
      invoiceNumber: "",
      layout: InvoiceLayouts.DEFAULT_LAYOUT,
      footerNote: "",
      supplier: {
        name: "",
        address: "",
        city: "",
        country: "Česká republika",
        ico: "",
        email: "",
        phone: "",
        vatNote: "",
      },
      customer: {
        name: "",
        address: "",
        city: "",
        country: "Česká republika",
        ico: "",
        dic: "",
      },
      dates: {
        issue: todayIso(),
        due: dueDateIso(),
        orderNumber: "",
      },
      payment: {
        accountNumber: "",
        iban: "",
        swift: "",
        bankName: "",
        variableSymbol: "",
        constantSymbol: typeof BankUtils !== "undefined" ? BankUtils.DEFAULT_CONSTANT_SYMBOL : "0308",
        method: "Převodem",
      },
      variableSymbolManual: false,
      resolved: false,
      cancelled: false,
      items: [{ desc: "", qty: "1,00", unit: "ks", unitPrice: "0,00" }],
    };
  }

  function collectFromForm() {
    const vs = document.getElementById("variable-symbol");
    const items = Array.from(document.querySelectorAll(".item-row")).map((row) => ({
      desc: row.querySelector(".desc")?.value || "",
      qty: row.querySelector(".qty")?.value || "0,00",
      unit: row.querySelector(".unit")?.value || "",
      unitPrice: row.querySelector(".unit-price")?.value || "0,00",
    }));

    return {
      id: document.getElementById("invoice-root")?.dataset.invoiceId || "",
      invoiceNumber: document.getElementById("invoice-number")?.value || "",
      layout: InvoiceLayouts.getCurrentLayout(),
      footerNote: document.getElementById("footer-note")?.value || "",
      supplier: {
        name: document.getElementById("supplier-name")?.value || "",
        address: document.getElementById("supplier-address")?.value || "",
        city: document.getElementById("supplier-city")?.value || "",
        country: document.getElementById("supplier-country")?.value || "",
        ico: document.getElementById("supplier-ico")?.value || "",
        email: document.getElementById("supplier-email")?.value || "",
        phone: document.getElementById("supplier-phone")?.value || "",
        vatNote: document.getElementById("supplier-vat-note")?.value || "",
      },
      customer: {
        name: document.getElementById("customer-name")?.value || "",
        address: document.getElementById("customer-address")?.value || "",
        city: document.getElementById("customer-city")?.value || "",
        country: document.getElementById("customer-country")?.value || "",
        ico: document.getElementById("customer-ico")?.value || "",
        dic: document.getElementById("customer-dic")?.value || "",
      },
      dates: {
        issue: document.getElementById("date-issue")?.value || "",
        due: document.getElementById("date-due")?.value || "",
        orderNumber: document.getElementById("order-number")?.value || "",
      },
      payment: {
        accountNumber: document.getElementById("account-number")?.value || "",
        iban: document.getElementById("iban")?.value || "",
        swift: document.getElementById("swift")?.value || "",
        bankName: document.getElementById("bank-name")?.value || "",
        variableSymbol: vs?.value || "",
        constantSymbol: document.getElementById("constant-symbol")?.value || "",
        method: document.getElementById("payment-method")?.value || "Převodem",
      },
      variableSymbolManual: Boolean(vs?.dataset.manual),
      items,
    };
  }

  function setField(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  }

  function applyToForm(invoice, { rebuildRows } = {}) {
    const root = document.getElementById("invoice-root");
    if (root && invoice.id) {
      root.dataset.invoiceId = invoice.id;
    }

    setField("invoice-number", invoice.invoiceNumber);
    setField("supplier-name", invoice.supplier?.name);
    setField("supplier-address", invoice.supplier?.address);
    setField("supplier-city", invoice.supplier?.city);
    setField("supplier-country", invoice.supplier?.country);
    setField("supplier-ico", invoice.supplier?.ico);
    setField("supplier-email", invoice.supplier?.email);
    setField("supplier-phone", invoice.supplier?.phone);
    setField("supplier-vat-note", invoice.supplier?.vatNote);
    setField("footer-note", invoice.footerNote);

    setField("customer-name", invoice.customer?.name);
    setField("customer-address", invoice.customer?.address);
    setField("customer-city", invoice.customer?.city);
    setField("customer-country", invoice.customer?.country);
    setField("customer-ico", invoice.customer?.ico);
    setField("customer-dic", invoice.customer?.dic);

    setField("date-issue", invoice.dates?.issue);
    setField("date-due", invoice.dates?.due);
    setField("order-number", invoice.dates?.orderNumber);

    setField("account-number", invoice.payment?.accountNumber);
    setField("iban", invoice.payment?.iban);
    setField("swift", invoice.payment?.swift);
    setField("bank-name", invoice.payment?.bankName);
    setField("variable-symbol", invoice.payment?.variableSymbol);
    setField(
      "constant-symbol",
      invoice.payment?.constantSymbol ||
        (typeof BankUtils !== "undefined" ? BankUtils.DEFAULT_CONSTANT_SYMBOL : "0308")
    );

    const method = document.getElementById("payment-method");
    if (method) method.value = invoice.payment?.method || "Převodem";

    const vs = document.getElementById("variable-symbol");
    if (vs) {
      if (invoice.variableSymbolManual) {
        vs.dataset.manual = "1";
      } else {
        delete vs.dataset.manual;
      }
    }

    if (rebuildRows && invoice.items?.length) {
      rebuildRows(invoice.items);
    }

    InvoiceLayouts.applyLayout(invoice.layout || InvoiceLayouts.DEFAULT_LAYOUT);
  }

  function applyTemplateToInvoice(invoice, template) {
    if (!template) return invoice;
    return {
      ...invoice,
      supplier: { ...invoice.supplier, ...template.supplier },
      customer: { ...invoice.customer, ...template.customer },
      payment: { ...invoice.payment, ...template.payment },
      items: template.items?.length ? template.items.map((item) => ({ ...item })) : invoice.items,
    };
  }

  function extractTemplateFromInvoice(invoice) {
    return {
      sourceInvoiceNumber: invoice.invoiceNumber || "",
      supplier: { ...invoice.supplier },
      customer: { ...invoice.customer },
      payment: {
        accountNumber: invoice.payment?.accountNumber || "",
        iban: invoice.payment?.iban || "",
        swift: invoice.payment?.swift || "",
        bankName: invoice.payment?.bankName || "",
        constantSymbol: invoice.payment?.constantSymbol || "",
        method: invoice.payment?.method || "Převodem",
      },
      items: (invoice.items || []).map((item) => ({ ...item })),
    };
  }

  function calculateTotal(invoice) {
    const parseNumber = (value) => {
      const cleaned = String(value).trim().replace(/\s/g, "").replace(",", ".");
      const num = parseFloat(cleaned);
      return Number.isFinite(num) ? num : 0;
    };
    return (invoice.items || []).reduce(
      (sum, item) => sum + parseNumber(item.qty) * parseNumber(item.unitPrice),
      0
    );
  }

  function formatDateCs(isoDate) {
    if (!isoDate) return "—";
    const [y, m, d] = isoDate.split("-");
    return `${d}.${m}.${y}`;
  }

  function formatSavedAt(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getSummary(invoice) {
    const total = calculateTotal(invoice);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber || "—",
      customerName: invoice.customer?.name || "—",
      issueDate: formatDateCs(invoice.dates?.issue),
      total: total.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      savedAt: formatSavedAt(invoice.savedAt || invoice.updatedAt),
      resolved: Boolean(invoice.resolved),
      cancelled: Boolean(invoice.cancelled),
    };
  }

  return {
    defaultEmptyInvoice,
    collectFromForm,
    applyToForm,
    applyTemplateToInvoice,
    extractTemplateFromInvoice,
    prepareCopyFromInvoice,
    incrementInvoiceNumber,
    calculateTotal,
    getSummary,
    formatDateCs,
  };
})();
