/**
 * Doplní adresy odběratelů z ARES podle IČO do všech faktur a parties.json.
 */
const fs = require("fs");
const path = require("path");
const { fetchAresByIco } = require("../web/ares");

const invoicesDir = path.resolve(__dirname, "../web/data/invoices");
const partiesPath = path.resolve(__dirname, "../web/data/parties.json");

async function main() {
  const files = fs.readdirSync(invoicesDir).filter((f) => f.endsWith(".json"));
  const cache = new Map();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  async function resolveCustomer(customer = {}) {
    const ico = String(customer.ico || "").replace(/\D/g, "").slice(0, 8);
    if (ico.length < 8) return null;

    if (!cache.has(ico)) {
      try {
        const ares = await fetchAresByIco(ico);
        cache.set(ico, ares);
        console.log(`ARES ${ico}: ${ares.name} — ${ares.address}, ${ares.city}`);
      } catch (err) {
        cache.set(ico, { error: err.message });
        console.warn(`ARES ${ico}: ${err.message}`);
      }
    }

    const ares = cache.get(ico);
    if (!ares || ares.error) return null;

    return {
      name: ares.name || customer.name || "",
      address: ares.address || "",
      city: ares.city || "",
      country: ares.country || "Česká republika",
      ico: ares.ico || ico,
      dic: ares.dic || customer.dic || "",
    };
  }

  for (const file of files) {
    const full = path.join(invoicesDir, file);
    const wrapped = JSON.parse(fs.readFileSync(full, "utf8"));
    const inv = wrapped.data || wrapped;
    const filled = await resolveCustomer(inv.customer || {});
    if (!filled) {
      skipped += 1;
      if (cache.get(String(inv.customer?.ico || "").replace(/\D/g, "").slice(0, 8))?.error) {
        failed += 1;
      }
      continue;
    }

    inv.customer = filled;
    const now = new Date().toISOString();
    inv.updatedAt = now;
    inv.savedAt = now;

    if (wrapped.data) {
      wrapped.data = inv;
      wrapped.exportedAt = now;
      fs.writeFileSync(full, JSON.stringify(wrapped, null, 2), "utf8");
    } else {
      fs.writeFileSync(full, JSON.stringify(inv, null, 2), "utf8");
    }
    updated += 1;
  }

  // aktualizace parties.json customers
  let parties;
  try {
    parties = JSON.parse(fs.readFileSync(partiesPath, "utf8"));
  } catch {
    parties = { type: "faktura-app-parties", version: 1, data: { suppliers: [], customers: [] } };
  }
  const data = parties.data || parties;
  const customers = Array.isArray(data.customers) ? data.customers : [];
  const byIco = new Map();

  for (const [ico, ares] of cache.entries()) {
    if (!ares || ares.error) continue;
    const existing = customers.find(
      (c) => String(c.ico || c.customer?.ico || "").replace(/\D/g, "") === ico
    );
    const record = {
      id: existing?.id || `cus-${ico}`,
      name: ares.name,
      address: ares.address,
      city: ares.city,
      country: ares.country || "Česká republika",
      ico: ares.ico || ico,
      dic: ares.dic || existing?.dic || "",
      label: `${ares.name} · IČ ${ares.ico || ico}`,
      savedAt: existing?.savedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    byIco.set(ico, record);
  }

  // zachovej zákazníky bez IČ / bez ARES
  for (const c of customers) {
    const ico = String(c.ico || "").replace(/\D/g, "").slice(0, 8);
    if (!ico || !byIco.has(ico)) {
      byIco.set(ico || c.id || `cus-${Math.random().toString(36).slice(2, 8)}`, c);
    }
  }

  data.customers = [...byIco.values()];
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    partiesPath,
    JSON.stringify(
      {
        type: "faktura-app-parties",
        version: 1,
        exportedAt: new Date().toISOString(),
        data,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\nHotovo: upraveno ${updated} faktur, přeskočeno ${skipped}, ARES chyb ${failed}.`);
  console.log(`Odběratelů v parties: ${data.customers.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
