const PaymentQr = (() => {
  const BANK_TRANSFER_METHOD = "Převodem";

  function isBankTransferPayment() {
    const method = document.getElementById("payment-method")?.value || "";
    return method === BANK_TRANSFER_METHOD;
  }

  function shouldShowQr() {
    return isBankTransferPayment();
  }

  function parseCzechBankAccount(raw) {
    const value = String(raw || "").replace(/\s/g, "");
    if (!value) return null;

    const slash = value.lastIndexOf("/");
    if (slash === -1) return null;

    const bankCode = value.slice(slash + 1).replace(/\D/g, "");
    const accountPart = value.slice(0, slash);
    if (!bankCode || !accountPart) return null;

    let prefix = "000000";
    let account = accountPart.replace(/\D/g, "");
    const dash = accountPart.indexOf("-");

    if (dash !== -1) {
      prefix = accountPart.slice(0, dash).replace(/\D/g, "");
      account = accountPart.slice(dash + 1).replace(/\D/g, "");
    }

    if (!account) return null;

    return {
      bankCode: bankCode.padStart(4, "0").slice(-4),
      prefix: prefix.padStart(6, "0").slice(-6),
      account: account.padStart(10, "0").slice(-10),
    };
  }

  function czechAccountToIban(parsed) {
    const bban = `${parsed.bankCode}${parsed.prefix}${parsed.account}`;
    let remainder = 0;

    for (const ch of `${bban}123500`) {
      remainder = (remainder * 10 + Number(ch)) % 97;
    }

    const check = String(98 - remainder).padStart(2, "0");
    return `CZ${check}${bban}`;
  }

  function normalizeIban(value) {
    const iban = String(value || "").replace(/\s/g, "").toUpperCase();
    return /^CZ\d{22}$/.test(iban) ? iban : null;
  }

  function resolveIban(accountNumber, iban) {
    const direct = normalizeIban(iban);
    if (direct) return direct;

    const parsed = parseCzechBankAccount(accountNumber);
    if (!parsed) return null;

    return czechAccountToIban(parsed);
  }

  function parseAmount(value) {
    const normalized = String(value || "").replace(/\s/g, "").replace(",", ".");
    const amount = Number.parseFloat(normalized);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }

  function sanitizeSpaydMessage(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9 +.:,-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  }

  function buildSpaydString({ iban, amount, variableSymbol, constantSymbol, message, dueDate }) {
    if (!iban) return null;

    const parts = ["SPD*1.0", `ACC:${iban}`];

    if (amount > 0) {
      parts.push(`AM:${amount.toFixed(2)}`);
    }

    parts.push("CC:CZK");

    const vs = String(variableSymbol || "").replace(/\D/g, "").slice(0, 10);
    if (vs) parts.push(`X-VS:${vs}`);

    const ks = String(constantSymbol || "").replace(/\D/g, "").slice(0, 4);
    if (ks) parts.push(`X-KS:${ks}`);

    if (dueDate) {
      const dt = String(dueDate).replace(/-/g, "");
      if (/^\d{8}$/.test(dt)) parts.push(`DT:${dt}`);
    }

    const msg = sanitizeSpaydMessage(message);
    if (msg) parts.push(`MSG:${msg}`);

    return parts.join("*");
  }

  function collectPaymentData() {
    const accountNumber = document.getElementById("account-number")?.value || "";
    const ibanInput = document.getElementById("iban")?.value || "";
    const variableSymbol = document.getElementById("variable-symbol")?.value || "";
    const constantSymbol = document.getElementById("constant-symbol")?.value || "";
    const dueDate = document.getElementById("date-due")?.value || "";
    const invoiceNumber = document.getElementById("invoice-number")?.value.trim() || "";
    const amount = parseAmount(document.getElementById("grand-total")?.textContent);

    const iban = resolveIban(accountNumber, ibanInput);
    const spayd = buildSpaydString({
      iban,
      amount,
      variableSymbol,
      constantSymbol,
      dueDate,
      message: invoiceNumber ? `Faktura ${invoiceNumber}` : "Faktura",
    });

    return { iban, spayd, amount };
  }

  let lastRendered = "";

  async function updatePaymentQr() {
    const wrap = document.getElementById("payment-qr-wrap");
    const canvas = document.getElementById("payment-qr-canvas");
    if (!wrap || !canvas || typeof QRCode === "undefined") return;

    if (!shouldShowQr()) {
      wrap.classList.add("hidden");
      lastRendered = "";
      return;
    }

    const { spayd, amount } = collectPaymentData();

    if (!spayd || amount <= 0) {
      wrap.classList.add("hidden");
      lastRendered = "";
      return;
    }

    if (spayd === lastRendered) {
      wrap.classList.remove("hidden");
      return;
    }

    try {
      await QRCode.toCanvas(canvas, spayd, {
        width: 120,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      lastRendered = spayd;
      wrap.classList.remove("hidden");
    } catch {
      wrap.classList.add("hidden");
      lastRendered = "";
    }
  }

  function bindPaymentQrUpdates() {
    const selectors = [
      "#account-number",
      "#iban",
      "#payment-method",
      "#variable-symbol",
      "#constant-symbol",
      "#date-due",
      "#invoice-number",
    ];

    selectors.forEach((selector) => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.addEventListener("input", () => {
        lastRendered = "";
        updatePaymentQr();
      });
      el.addEventListener("change", () => {
        lastRendered = "";
        updatePaymentQr();
      });
    });
  }

  return {
    buildSpaydString,
    collectPaymentData,
    resolveIban,
    shouldShowQr,
    updatePaymentQr,
    bindPaymentQrUpdates,
  };
})();
