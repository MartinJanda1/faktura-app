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

  function normalizeSupplierRecord(record) {
    if (!record) return null;
    if (record.supplier && typeof record.supplier === "object") {
      return {
        ...record,
        ico: record.ico || record.supplier.ico || "",
        payment: record.payment || {},
      };
    }
    return {
      id: record.id,
      ico: record.ico || "",
      label: record.label || "",
      savedAt: record.savedAt,
      updatedAt: record.updatedAt,
      supplier: {
        name: record.name || "",
        address: record.address || "",
        city: record.city || "",
        country: record.country || "Česká republika",
        ico: record.ico || "",
        email: record.email || "",
        phone: record.phone || "",
        vatNote: record.vatNote || "",
      },
      payment: record.payment || {},
    };
  }

  function normalizeCustomerRecord(record) {
    if (!record) return null;
    if (record.customer && typeof record.customer === "object") {
      return {
        ...record,
        ico: record.ico || record.customer.ico || "",
      };
    }
    return {
      id: record.id,
      ico: record.ico || "",
      label: record.label || "",
      savedAt: record.savedAt,
      updatedAt: record.updatedAt,
      customer: {
        name: record.name || "",
        address: record.address || "",
        city: record.city || "",
        country: record.country || "Česká republika",
        ico: record.ico || "",
        dic: record.dic || "",
      },
    };
  }

  async function listParties() {
    const data = await apiFetch("/parties");
    return {
      suppliers: (data.suppliers || []).map(normalizeSupplierRecord).filter(Boolean),
      customers: (data.customers || []).map(normalizeCustomerRecord).filter(Boolean),
    };
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
    const normalized = normalizeSupplierRecord(record);
    if (!normalized) return {};
    return {
      supplierPartyId: normalized.id,
      supplier: { ...(normalized.supplier || {}) },
      payment: {
        constantSymbol: BankUtils.DEFAULT_CONSTANT_SYMBOL,
        method: "Převodem",
        ...(normalized.payment || {}),
      },
    };
  }

  function customerToInvoiceFields(record) {
    const normalized = normalizeCustomerRecord(record);
    if (!normalized) return {};
    return {
      customerPartyId: normalized.id,
      customer: { ...(normalized.customer || {}) },
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
