const FakturaParties = (() => {
  const API_BASE = "/api";

  class PartiesError extends Error {
    constructor(message) {
      super(message);
      this.name = "PartiesError";
    }
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new PartiesError(payload.error || `Chyba serveru (${res.status}).`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async function listParties() {
    return apiFetch("/parties");
  }

  async function lookupAres(ico) {
    const normalized = String(ico || "").replace(/\D/g, "").slice(0, 8);
    return apiFetch(`/ares/${encodeURIComponent(normalized)}`);
  }

  async function saveSupplier(profile) {
    return apiFetch("/parties/suppliers", {
      method: "POST",
      body: JSON.stringify(profile),
    });
  }

  async function saveCustomer(profile) {
    return apiFetch("/parties/customers", {
      method: "POST",
      body: JSON.stringify(profile),
    });
  }

  async function loadSupplierFromAres(ico, extras = {}) {
    const ares = await lookupAres(ico);
    return saveSupplier({
      ico: ares.ico,
      supplier: {
        name: ares.name,
        address: ares.address,
        city: ares.city,
        country: ares.country,
        ico: ares.ico,
        email: extras.email || "",
        phone: extras.phone || "",
        vatNote: ares.vatNote || "",
      },
      payment: {
        constantSymbol: BankUtils.DEFAULT_CONSTANT_SYMBOL,
        method: "Převodem",
        ...(extras.payment || {}),
      },
    });
  }

  async function loadCustomerFromAres(ico) {
    const ares = await lookupAres(ico);
    return saveCustomer({
      ico: ares.ico,
      customer: {
        name: ares.name,
        address: ares.address,
        city: ares.city,
        country: ares.country,
        ico: ares.ico,
        dic: ares.dic || "",
      },
    });
  }

  function supplierToInvoiceFields(record) {
    if (!record) return {};
    return {
      supplierPartyId: record.id,
      supplier: { ...record.supplier },
      payment: {
        constantSymbol: BankUtils.DEFAULT_CONSTANT_SYMBOL,
        method: "Převodem",
        ...record.payment,
      },
    };
  }

  function customerToInvoiceFields(record) {
    if (!record) return {};
    return {
      customerPartyId: record.id,
      customer: { ...record.customer },
    };
  }

  async function syncFromInvoice(invoice, partyIds = {}) {
    const result = {
      supplierPartyId: partyIds.supplierPartyId || "",
      customerPartyId: partyIds.customerPartyId || "",
    };

    const ico = String(invoice.supplier?.ico || "").replace(/\D/g, "");
    if (ico || result.supplierPartyId) {
      const saved = await saveSupplier({
        id: result.supplierPartyId || undefined,
        ico,
        supplier: { ...invoice.supplier },
        payment: {
          constantSymbol: BankUtils.DEFAULT_CONSTANT_SYMBOL,
          ...invoice.payment,
        },
      });
      result.supplierPartyId = saved.id;
    }

    const customerIco = String(invoice.customer?.ico || "").replace(/\D/g, "");
    if (customerIco || result.customerPartyId) {
      const saved = await saveCustomer({
        id: result.customerPartyId || undefined,
        ico: customerIco,
        customer: { ...invoice.customer },
      });
      result.customerPartyId = saved.id;
    }

    return result;
  }

  return {
    listParties,
    lookupAres,
    saveSupplier,
    saveCustomer,
    loadSupplierFromAres,
    loadCustomerFromAres,
    supplierToInvoiceFields,
    customerToInvoiceFields,
    syncFromInvoice,
  };
})();
