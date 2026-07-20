const fs = require("fs").promises;
const path = require("path");
const { safeId, assertInvoiceDeletable } = require("./storage-utils");

function createFileStorage({ dataRoot, dataVersion }) {
  const invoicesDir = path.join(dataRoot, "data", "invoices");
  const templateFile = path.join(dataRoot, "data", "sablona.json");

  function invoiceFilePath(id) {
    const safe = safeId(id);
    if (!safe) throw new Error("Chybí ID faktury.");
    return path.join(invoicesDir, `${safe}.json`);
  }

  function legacyInvoiceFilePath(id) {
    const safe = safeId(id);
    if (!safe) throw new Error("Chybí ID faktury.");
    return path.join(invoicesDir, `${safe}.txt`);
  }

  function invoiceToJsonContent(invoice) {
    return JSON.stringify(
      {
        type: "faktura-app-invoice",
        version: dataVersion,
        exportedAt: new Date().toISOString(),
        data: invoice,
      },
      null,
      2
    );
  }

  function templateToJsonContent(template) {
    return JSON.stringify(
      {
        type: "faktura-app-template",
        version: dataVersion,
        savedAt: new Date().toISOString(),
        data: template,
      },
      null,
      2
    );
  }

  function parseInvoiceContent(text) {
    const parsed = JSON.parse(text);
    if (parsed?.type === "faktura-app-invoice" && parsed.data) return parsed.data;
    if (parsed?.invoiceNumber || parsed?.supplier) return parsed;
    throw new Error("Neplatný formát souboru faktury.");
  }

  function parseTemplateContent(text) {
    const parsed = JSON.parse(text);
    if (parsed?.type === "faktura-app-template" && parsed.data) return parsed.data;
    if (parsed?.supplier || parsed?.payment) return parsed;
    throw new Error("Neplatný formát šablony.");
  }

  async function ensureDataDirs() {
    await fs.mkdir(invoicesDir, { recursive: true });
  }

  async function migrateLegacyDataFiles() {
    const legacyTemplate = path.join(dataRoot, "data", "sablona.txt");
    try {
      await fs.access(legacyTemplate);
      try {
        await fs.access(templateFile);
      } catch {
        await fs.rename(legacyTemplate, templateFile);
      }
    } catch {
      // žádná stará šablona
    }

    let files = [];
    try {
      files = await fs.readdir(invoicesDir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith(".txt")) continue;
      const jsonName = file.replace(/\.txt$/i, ".json");
      const from = path.join(invoicesDir, file);
      const to = path.join(invoicesDir, jsonName);
      try {
        await fs.access(to);
        await fs.unlink(from);
      } catch {
        await fs.rename(from, to);
      }
    }
  }

  async function readInvoiceById(id) {
    try {
      const content = await fs.readFile(invoiceFilePath(id), "utf-8");
      return parseInvoiceContent(content);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      const content = await fs.readFile(legacyInvoiceFilePath(id), "utf-8");
      return parseInvoiceContent(content);
    }
  }

  async function listInvoices() {
    const files = await fs.readdir(invoicesDir);
    const invoices = [];
    const seen = new Set();

    for (const file of files) {
      if (!file.endsWith(".json") && !file.endsWith(".txt")) continue;
      try {
        const invoice = parseInvoiceContent(
          await fs.readFile(path.join(invoicesDir, file), "utf-8")
        );
        if (seen.has(invoice.id)) continue;
        seen.add(invoice.id);
        invoices.push(invoice);
      } catch {
        // poškozený soubor přeskočíme
      }
    }

    invoices.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.savedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.savedAt || 0).getTime();
      return bTime - aTime;
    });

    return invoices;
  }

  async function saveInvoiceRecord(invoice) {
    const now = new Date().toISOString();
    const id = safeId(invoice.id) || `inv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let createdAt = now;

    try {
      const existing = await readInvoiceById(id);
      createdAt = existing.createdAt || now;
    } catch {
      // nová faktura
    }

    const record = {
      ...invoice,
      id,
      version: dataVersion,
      createdAt,
      savedAt: now,
      updatedAt: now,
    };

    await fs.writeFile(invoiceFilePath(id), invoiceToJsonContent(record), "utf-8");

    try {
      await fs.unlink(legacyInvoiceFilePath(id));
    } catch {
      // starý .txt soubor nemusí existovat
    }

    return record;
  }

  async function deleteInvoiceById(id) {
    const invoice = await readInvoiceById(id).catch((err) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
    if (!invoice) return;

    const all = await listInvoices();
    assertInvoiceDeletable(invoice, all);

    try {
      await fs.unlink(invoiceFilePath(id));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    try {
      await fs.unlink(legacyInvoiceFilePath(id));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async function readTemplate() {
    try {
      const content = await fs.readFile(templateFile, "utf-8");
      return parseTemplateContent(content);
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  async function saveTemplateRecord(template) {
    const record = {
      ...template,
      version: dataVersion,
      savedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(templateFile), { recursive: true });
    await fs.writeFile(templateFile, templateToJsonContent(record), "utf-8");

    const legacyTemplate = path.join(dataRoot, "data", "sablona.txt");
    try {
      await fs.unlink(legacyTemplate);
    } catch {
      // starý .txt soubor nemusí existovat
    }

    return record;
  }

  async function deleteTemplateRecord() {
    try {
      await fs.unlink(templateFile);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const legacyTemplate = path.join(dataRoot, "data", "sablona.txt");
    try {
      await fs.unlink(legacyTemplate);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  return {
    kind: "json",
    invoicesDir,
    async ensureReady() {
      await ensureDataDirs();
      await migrateLegacyDataFiles();
    },
    async shutdown() {},
    getStatus() {
      return {
        storage: "json",
        description: `JSON soubory (${invoicesDir})`,
        invoicesDir,
      };
    },
    listInvoices,
    readInvoiceById,
    saveInvoiceRecord,
    deleteInvoiceById,
    readTemplate,
    saveTemplateRecord,
    deleteTemplateRecord,
  };
}

module.exports = { createFileStorage };
