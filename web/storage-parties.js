const fs = require("fs").promises;
const path = require("path");

const DATA_VERSION = 1;

function createPartiesStorage({ dataRoot }) {
  const partiesFile = path.join(dataRoot, "data", "parties.json");

  function emptyParties() {
    return {
      type: "faktura-app-parties",
      version: DATA_VERSION,
      suppliers: [],
      customers: [],
      updatedAt: new Date().toISOString(),
    };
  }

  function toJsonContent(data) {
    return JSON.stringify(
      {
        type: "faktura-app-parties",
        version: DATA_VERSION,
        exportedAt: new Date().toISOString(),
        data,
      },
      null,
      2
    );
  }

  function parseContent(text) {
    const parsed = JSON.parse(text);
    if (parsed?.type === "faktura-app-parties" && parsed.data) {
      return parsed.data;
    }
    if (Array.isArray(parsed?.suppliers) || Array.isArray(parsed?.customers)) {
      return parsed;
    }
    return emptyParties();
  }

  async function readParties() {
    try {
      const content = await fs.readFile(partiesFile, "utf-8");
      const data = parseContent(content);
      return {
        suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
        customers: Array.isArray(data.customers) ? data.customers : [],
      };
    } catch (err) {
      if (err.code === "ENOENT") {
        return { suppliers: [], customers: [] };
      }
      throw err;
    }
  }

  async function writeParties(data) {
    const record = {
      suppliers: data.suppliers || [],
      customers: data.customers || [],
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(partiesFile), { recursive: true });
    await fs.writeFile(partiesFile, toJsonContent(record), "utf-8");
    return record;
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function buildLabel(name, ico) {
    const parts = [name, ico ? `IČ ${ico}` : ""].filter(Boolean);
    return parts.join(" · ") || "Bez názvu";
  }

  async function upsertSupplier(profile) {
    const parties = await readParties();
    const ico = String(profile.ico || profile.supplier?.ico || "").replace(/\D/g, "");
    const now = new Date().toISOString();

    let existing = parties.suppliers.find(
      (item) => item.id === profile.id || (ico && String(item.ico || item.supplier?.ico || "").replace(/\D/g, "") === ico)
    );

    const supplier = {
      ...(existing?.supplier || {}),
      ...(profile.supplier || {}),
      ico,
    };

    const payment = {
      ...(existing?.payment || {}),
      ...(profile.payment || {}),
      constantSymbol:
        profile.payment?.constantSymbol ||
        existing?.payment?.constantSymbol ||
        "0308",
      method: profile.payment?.method || existing?.payment?.method || "Převodem",
    };

    const record = {
      id: existing?.id || profile.id || makeId("sup"),
      label: profile.label || buildLabel(supplier.name, ico),
      ico,
      supplier,
      payment,
      savedAt: existing?.savedAt || now,
      updatedAt: now,
    };

    if (existing) {
      parties.suppliers = parties.suppliers.map((item) => (item.id === existing.id ? record : item));
    } else {
      parties.suppliers.unshift(record);
    }

    await writeParties(parties);
    return record;
  }

  async function upsertCustomer(profile) {
    const parties = await readParties();
    const ico = String(profile.ico || profile.customer?.ico || "").replace(/\D/g, "");
    const now = new Date().toISOString();

    let existing = parties.customers.find(
      (item) => item.id === profile.id || (ico && String(item.ico || item.customer?.ico || "").replace(/\D/g, "") === ico)
    );

    const customer = {
      name: profile.customer?.name || profile.name || "",
      address: profile.customer?.address || profile.address || "",
      city: profile.customer?.city || profile.city || "",
      country: profile.customer?.country || profile.country || "Česká republika",
      ico,
      dic: profile.customer?.dic || profile.dic || "",
    };

    const record = {
      id: existing?.id || profile.id || makeId("cus"),
      label: profile.label || buildLabel(customer.name, ico),
      ico,
      customer,
      savedAt: existing?.savedAt || now,
      updatedAt: now,
    };

    if (existing) {
      parties.customers = parties.customers.map((item) => (item.id === existing.id ? record : item));
    } else {
      parties.customers.unshift(record);
    }

    await writeParties(parties);
    return record;
  }

  async function deleteSupplier(id) {
    const parties = await readParties();
    const next = parties.suppliers.filter((item) => item.id !== id);
    if (next.length === parties.suppliers.length) {
      throw new Error("Dodavatel nenalezen.");
    }
    parties.suppliers = next;
    await writeParties(parties);
  }

  async function deleteCustomer(id) {
    const parties = await readParties();
    const next = parties.customers.filter((item) => item.id !== id);
    if (next.length === parties.customers.length) {
      throw new Error("Odběratel nenalezen.");
    }
    parties.customers = next;
    await writeParties(parties);
  }

  return {
    readParties,
    upsertSupplier,
    upsertCustomer,
    deleteSupplier,
    deleteCustomer,
  };
}

module.exports = { createPartiesStorage };
