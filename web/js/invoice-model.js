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

  function defaultEmptyInvoice() {
    return {
      invoiceNumber: "",
      supplier: {
        name: "",
        address: "",
        city: "",
        country: "Česká republika",
        ico: "",
        email: "",
        phone: "",
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
        variableSymbol: "",
        constantSymbol: "",
        method: "Převodem",
      },
      variableSymbolManual: false,
      resolved: false,
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
      supplier: {
        name: document.getElementById("supplier-name")?.value || "",
        address: document.getElementById("supplier-address")?.value || "",
        city: document.getElementById("supplier-city")?.value || "",
        country: document.getElementById("supplier-country")?.value || "",
        ico: document.getElementById("supplier-ico")?.value || "",
        email: document.getElementById("supplier-email")?.value || "",
        phone: document.getElementById("supplier-phone")?.value || "",
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
    setField("variable-symbol", invoice.payment?.variableSymbol);
    setField("constant-symbol", invoice.payment?.constantSymbol);

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
    };
  }

  return {
    defaultEmptyInvoice,
    collectFromForm,
    applyToForm,
    applyTemplateToInvoice,
    extractTemplateFromInvoice,
    calculateTotal,
    getSummary,
    formatDateCs,
  };
})();
