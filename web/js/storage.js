const FakturaStorage = (() => {
  const API_BASE = "/api";
  const DATA_VERSION = 1;

  class StorageError extends Error {
    constructor(message, cause) {
      super(message);
      this.name = "StorageError";
      this.cause = cause;
    }
  }

  function generateId() {
    return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  async function apiFetch(path, options = {}) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new StorageError(payload.error || `Chyba serveru (${res.status}).`);
      }

      if (res.status === 204) return null;
      return res.json();
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        "Server neběží. Spusť aplikaci příkazem: npm start",
        err
      );
    }
  }

  async function readInvoices() {
    return apiFetch("/invoices");
  }

  async function getInvoice(id) {
    return apiFetch(`/invoices/${encodeURIComponent(id)}`);
  }

  async function saveInvoice(invoice) {
    const payload = { ...invoice, version: DATA_VERSION };
    if (payload.id) {
      return apiFetch(`/invoices/${encodeURIComponent(payload.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    }
    return apiFetch("/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function deleteInvoice(id) {
    await apiFetch(`/invoices/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async function getTemplate() {
    return apiFetch("/template");
  }

  async function saveTemplate(template) {
    return apiFetch("/template", {
      method: "PUT",
      body: JSON.stringify({ ...template, version: DATA_VERSION }),
    });
  }

  async function deleteTemplate() {
    return apiFetch("/template", { method: "DELETE" });
  }

  async function hasTemplate() {
    const template = await getTemplate();
    return Boolean(
      template &&
        (template.supplier?.name ||
          template.customer?.name ||
          template.payment?.accountNumber)
    );
  }

  function sanitizeFilename(value) {
    return String(value || "faktura").replace(/[/\\?%*:|"<>]/g, "-").trim() || "faktura";
  }

  function invoiceToJsonContent(invoice) {
    const payload = {
      type: "faktura-app-invoice",
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      data: invoice,
    };
    return JSON.stringify(payload, null, 2);
  }

  function invoicesToJsonContent(invoices) {
    if (invoices.length === 1) {
      return invoiceToJsonContent(invoices[0]);
    }
    const payload = {
      type: "faktura-app-invoices",
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      count: invoices.length,
      data: invoices,
    };
    return JSON.stringify(payload, null, 2);
  }

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadInvoiceJson(invoice) {
    downloadInvoicesJson([invoice]);
  }

  function downloadInvoicesJson(invoices) {
    if (!invoices?.length) return;
    const filename =
      invoices.length === 1
        ? `faktura-${sanitizeFilename(invoices[0].invoiceNumber)}.json`
        : `faktury-export-${new Date().toISOString().slice(0, 10)}.json`;
    downloadText(filename, invoicesToJsonContent(invoices), "application/json;charset=utf-8");
  }

  async function downloadInvoicesExport(invoices) {
    if (!invoices?.length) return;
    const status = await loadStorageStatus();

    if (status.storage === "postgres") {
      if (!window.FakturaSql) {
        throw new StorageError("SQL export modul není načten.");
      }
      const sql = window.FakturaSql.invoicesToSqlScript(invoices, DATA_VERSION);
      const filename =
        invoices.length === 1
          ? `faktura-${sanitizeFilename(invoices[0].invoiceNumber)}.sql`
          : `faktury-export-${new Date().toISOString().slice(0, 10)}.sql`;
      downloadText(filename, sql, "application/sql;charset=utf-8");
      return;
    }

    downloadInvoicesJson(invoices);
  }

  async function downloadInvoiceExport(invoice) {
    return downloadInvoicesExport([invoice]);
  }

  function parseInvoicesFromJson(text) {
    const parsed = JSON.parse(text);
    if (parsed?.type === "faktura-app-invoices" && Array.isArray(parsed.data)) {
      return parsed.data;
    }
    if (parsed?.type === "faktura-app-invoice" && parsed.data) {
      return [parsed.data];
    }
    if (parsed?.invoiceNumber || parsed?.supplier) {
      return [parsed];
    }
    throw new Error("Neplatný formát souboru faktury.");
  }

  function parseJsonContent(text) {
    const invoices = parseInvoicesFromJson(text);
    return invoices[0];
  }

  async function importInvoicesFromFile(file) {
    const text = await file.text();
    const status = await loadStorageStatus();
    const isSql =
      file.name.toLowerCase().endsWith(".sql") ||
      text.trim().startsWith("-- Faktura-app SQL");

    if (status.storage === "postgres" && isSql) {
      const result = await apiFetch("/import/sql", {
        method: "POST",
        body: JSON.stringify({ sql: text }),
      });
      return { count: result?.importedCount || 0 };
    }

    const invoices = parseInvoicesFromJson(text);
    const saved = [];

    for (const invoice of invoices) {
      const record = { ...invoice };
      if (!record.id) record.id = generateId();
      saved.push(await saveInvoice(record));
    }

    return { count: saved.length, saved };
  }

  async function importInvoiceFromFile(file) {
    const result = await importInvoicesFromFile(file);
    return result.saved?.[0] || null;
  }

  let storageStatus = null;

  async function loadStorageStatus() {
    if (storageStatus) return storageStatus;
    try {
      storageStatus = await apiFetch("/status");
    } catch {
      storageStatus = { storage: "json", description: "JSON soubory" };
    }
    return storageStatus;
  }

  async function getStorageStatus() {
    return loadStorageStatus();
  }

  function getInvoiceFileLabel(invoice) {
    if (storageStatus?.storage === "postgres") {
      return `PostgreSQL · ${invoice.id}`;
    }
    return `${invoice.id}.json`;
  }

  async function getSaveLocationLabel() {
    const status = await loadStorageStatus();
    return status.storage === "postgres" ? status.description : "data/invoices/";
  }

  return {
    StorageError,
    generateId,
    getInvoice,
    saveInvoice,
    deleteInvoice,
    readInvoices,
    getTemplate,
    saveTemplate,
    deleteTemplate,
    hasTemplate,
    downloadInvoiceJson,
    downloadInvoicesJson,
    downloadInvoiceExport,
    downloadInvoicesExport,
    downloadJson: downloadText,
    importInvoiceFromFile,
    importInvoicesFromFile,
    parseJsonContent,
    parseInvoicesFromJson,
    getInvoiceFileLabel,
    getStorageStatus,
    getSaveLocationLabel,
    loadStorageStatus,
  };
})();
