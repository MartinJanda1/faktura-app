const http = require("http");
const fs = require("fs").promises;
const path = require("path");
const { loadEnvFiles, isPgEnabled } = require("./env-loader");
const { createFileStorage } = require("./storage-file");
const { createPgStorage } = require("./storage-pg");
const { createPartiesStorage } = require("./storage-parties");
const { fetchAresByIco, normalizeIco } = require("./ares");

const DATA_VERSION = 1;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

function createFakturaServer(options = {}) {
  const staticRoot = options.staticRoot || __dirname;
  const dataRoot = options.dataRoot || __dirname;
  let listenPort =
    options.port !== undefined ? Number(options.port) : Number(process.env.PORT) || 3000;

  let storage = null;
  let partiesStorage = null;

  function sendJson(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  }

  function sendError(res, status, message) {
    sendJson(res, status, { error: message });
  }

  function parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : null);
        } catch {
          reject(new Error("Neplatný JSON v těle požadavku."));
        }
      });
      req.on("error", reject);
    });
  }

  async function initStorage() {
    loadEnvFiles([
      path.join(dataRoot, ".env"),
      path.join(__dirname, "..", ".env"),
    ]);

    const usePg = options.connectionToPg ?? isPgEnabled();
    storage = usePg
      ? createPgStorage({ dataVersion: DATA_VERSION })
      : createFileStorage({ dataRoot, dataVersion: DATA_VERSION });

    partiesStorage = createPartiesStorage({ dataRoot });

    await storage.ensureReady();
    return storage.getStatus();
  }

  async function serveStatic(req, res) {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const filePath = path.join(staticRoot, urlPath === "/" ? "index.html" : urlPath.replace(/^\//, ""));

    if (!filePath.startsWith(staticRoot)) {
      sendError(res, 403, "Přístup odepřen.");
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        sendError(res, 404, "Soubor nenalezen.");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const content = await fs.readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(content);
    } catch (err) {
      if (err.code === "ENOENT") {
        sendError(res, 404, "Soubor nenalezen.");
        return;
      }
      throw err;
    }
  }

  async function handleApi(req, res) {
    const url = new URL(req.url, `http://localhost:${listenPort}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "api") {
      sendError(res, 404, "Endpoint nenalezen.");
      return;
    }

    try {
      if (parts[1] === "status" && req.method === "GET") {
        sendJson(res, 200, storage.getStatus());
        return;
      }

      if (parts[1] === "invoices" && parts.length === 2 && req.method === "GET") {
        sendJson(res, 200, await storage.listInvoices());
        return;
      }

      if (parts[1] === "invoices" && parts.length === 2 && req.method === "POST") {
        const body = await parseBody(req);
        const saved = await storage.saveInvoiceRecord(body || {});
        sendJson(res, 201, saved);
        return;
      }

      if (parts[1] === "invoices" && parts.length === 3 && req.method === "GET") {
        const invoice = await storage.readInvoiceById(parts[2]);
        sendJson(res, 200, invoice);
        return;
      }

      if (parts[1] === "invoices" && parts.length === 3 && req.method === "PUT") {
        const body = await parseBody(req);
        const saved = await storage.saveInvoiceRecord({ ...body, id: parts[2] });
        sendJson(res, 200, saved);
        return;
      }

      if (parts[1] === "invoices" && parts.length === 3 && req.method === "DELETE") {
        await storage.deleteInvoiceById(parts[2]);
        res.writeHead(204);
        res.end();
        return;
      }

      if (parts[1] === "template" && req.method === "GET") {
        sendJson(res, 200, await storage.readTemplate());
        return;
      }

      if (parts[1] === "template" && req.method === "PUT") {
        const body = await parseBody(req);
        const saved = await storage.saveTemplateRecord(body || {});
        sendJson(res, 200, saved);
        return;
      }

      if (parts[1] === "template" && req.method === "DELETE") {
        await storage.deleteTemplateRecord();
        res.writeHead(204);
        res.end();
        return;
      }

      if (parts[1] === "import" && parts[2] === "sql" && req.method === "POST") {
        if (storage.kind !== "postgres" || !storage.importSqlScript) {
          sendError(res, 400, "SQL import je dostupný jen v režimu PostgreSQL.");
          return;
        }
        const body = await parseBody(req);
        const result = await storage.importSqlScript(body?.sql || "");
        sendJson(res, 200, result);
        return;
      }

      if (parts[1] === "parties" && parts.length === 2 && req.method === "GET") {
        sendJson(res, 200, await partiesStorage.readParties());
        return;
      }

      if (parts[1] === "parties" && parts[2] === "suppliers" && parts.length === 3 && req.method === "POST") {
        const body = await parseBody(req);
        const saved = await partiesStorage.upsertSupplier(body || {});
        sendJson(res, 201, saved);
        return;
      }

      if (parts[1] === "parties" && parts[2] === "customers" && parts.length === 3 && req.method === "POST") {
        const body = await parseBody(req);
        const saved = await partiesStorage.upsertCustomer(body || {});
        sendJson(res, 201, saved);
        return;
      }

      if (parts[1] === "parties" && parts[2] === "suppliers" && parts.length === 4 && req.method === "DELETE") {
        await partiesStorage.deleteSupplier(parts[3]);
        res.writeHead(204);
        res.end();
        return;
      }

      if (parts[1] === "parties" && parts[2] === "customers" && parts.length === 4 && req.method === "DELETE") {
        await partiesStorage.deleteCustomer(parts[3]);
        res.writeHead(204);
        res.end();
        return;
      }

      if (parts[1] === "ares" && parts.length === 3 && req.method === "GET") {
        const ico = normalizeIco(parts[2]);
        if (!ico) {
          sendError(res, 400, "Zadej platné IČO (8 číslic).");
          return;
        }
        const aresData = await fetchAresByIco(ico);
        sendJson(res, 200, aresData);
        return;
      }

      sendError(res, 404, "Endpoint nenalezen.");
    } catch (err) {
      const status = err.code === "ENOENT" ? 404 : 400;
      sendError(res, status, err.message || "Chyba API.");
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/")) {
        await handleApi(req, res);
        return;
      }
      await serveStatic(req, res);
    } catch (err) {
      console.error(err);
      sendError(res, 500, "Interní chyba serveru.");
    }
  });

  return {
    server,
    get port() {
      return listenPort;
    },
    get storage() {
      return storage;
    },
    async start() {
      const status = await initStorage();
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(listenPort, () => {
          listenPort = server.address().port;
          resolve({
            port: listenPort,
            dataRoot,
            staticRoot,
            storage: status,
          });
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        const shutdownStorage = storage ? storage.shutdown() : Promise.resolve();
        shutdownStorage.finally(() => {
          server.close(() => resolve());
        });
      });
    },
  };
}

module.exports = { createFakturaServer };

if (require.main === module) {
  const instance = createFakturaServer();
  instance
    .start()
    .then(({ port, storage }) => {
      console.log(`Faktura-app běží na http://localhost:${port}`);
      console.log(`Úložiště: ${storage.description}`);
    })
    .catch((err) => {
      console.error("Spuštění serveru se nezdařilo:", err.message || err);
      process.exit(1);
    });
}
