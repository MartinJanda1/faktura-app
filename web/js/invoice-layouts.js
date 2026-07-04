const InvoiceLayouts = (() => {
  const DEFAULT_LAYOUT = "classic";

  const layouts = {
    classic: {
      id: "classic",
      name: "Klasická",
      description: "Pruhy s bočními popisky sekcí, tyrkysové platební lišty.",
    },
    idoklad: {
      id: "idoklad",
      name: "iDoklad",
      description: "Čistý vzhled podle iDoklad — černobílý, bez barevných pruhů.",
    },
  };

  function normalizeLayoutId(layoutId) {
    return layouts[layoutId] ? layoutId : DEFAULT_LAYOUT;
  }

  function listLayouts() {
    return Object.values(layouts);
  }

  function getLayout(layoutId) {
    return layouts[normalizeLayoutId(layoutId)];
  }

  function mountField(inputId, classicSelector, idokladSelector, layoutId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const target = document.querySelector(layoutId === "idoklad" ? idokladSelector : classicSelector);
    if (target && input.parentElement !== target) {
      target.appendChild(input);
    }
  }

  function mountPaymentSection(layoutId) {
    const inner = document.getElementById("payment-section-inner");
    const classicMount = document.getElementById("payment-mount-classic");
    const idokladMount = document.getElementById("payment-mount-idoklad");
    if (!inner) return;

    const target = layoutId === "idoklad" ? idokladMount : classicMount;
    if (target && inner.parentElement !== target) {
      target.appendChild(inner);
    }
  }

  function mountLayoutFields(layoutId) {
    const id = normalizeLayoutId(layoutId);

    mountPaymentSection(id);
    mountField(
      "payment-method",
      "#payment-method-slot-classic",
      "#payment-method-slot-idoklad",
      id
    );

    mountField(
      "variable-symbol",
      ".payment-line-variable.layout-classic-only",
      ".payment-line-variable.layout-idoklad-only",
      id
    );

    mountField(
      "constant-symbol",
      ".payment-line-constant.layout-classic-only",
      ".payment-line-constant.layout-idoklad-only",
      id
    );

    mountField("date-issue", ".inv-dates-row.layout-classic-only .date-item:nth-child(1)", ".date-item-issue", id);
    mountField("date-due", ".inv-dates-row.layout-classic-only .date-item:nth-child(2)", ".date-item-due", id);

    const paymentMethod = document.getElementById("payment-method");
    if (paymentMethod) {
      paymentMethod.classList.toggle("payment-select-idoklad", id === "idoklad");
    }
  }

  function applyLayout(layoutId) {
    const id = normalizeLayoutId(layoutId);
    const invoice = document.getElementById("invoice");
    const root = document.getElementById("invoice-root");
    if (!invoice) return id;

    invoice.dataset.layout = id;
    invoice.classList.remove("layout-classic", "layout-idoklad");
    invoice.classList.add(`layout-${id}`);

    if (root) root.dataset.layout = id;

    const select = document.getElementById("layout-select");
    if (select) select.value = id;

    mountLayoutFields(id);

    return id;
  }

  function getCurrentLayout() {
    const invoice = document.getElementById("invoice");
    return normalizeLayoutId(invoice?.dataset.layout || DEFAULT_LAYOUT);
  }

  function getDefaultFieldValues(layoutId) {
    if (normalizeLayoutId(layoutId) !== "idoklad") {
      return {};
    }
    return {
      supplier: { vatNote: "Nejsme plátci DPH" },
      footerNote: "Podnikatel je zapsán v živnostenském rejstříku",
    };
  }

  return {
    DEFAULT_LAYOUT,
    listLayouts,
    getLayout,
    normalizeLayoutId,
    applyLayout,
    getCurrentLayout,
    getDefaultFieldValues,
    mountLayoutFields,
  };
})();
