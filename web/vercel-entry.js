/**
 * Vercel serverless entry — wraps the existing HTTP server request handler.
 * Static assets and /api/* are served by the same function.
 *
 * On Vercel, JSON file storage uses /tmp (ephemeral). For durable data set
 * CONNECTION_TO_PG=true and PostgreSQL env vars in the Vercel project.
 */
const path = require("path");
const { createFakturaServer } = require("./server");

const staticRoot = __dirname;
const dataRoot = process.env.VERCEL
  ? path.join("/tmp", "faktura-data")
  : staticRoot;

let instance = null;
let readyPromise = null;

function getInstance() {
  if (!instance) {
    instance = createFakturaServer({ staticRoot, dataRoot });
  }
  return instance;
}

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = getInstance()
      .ensureReady()
      .catch((err) => {
        readyPromise = null;
        throw err;
      });
  }
  return readyPromise;
}

module.exports = async function handler(req, res) {
  try {
    await ensureReady();
    await getInstance().handleRequest(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: err.message || "Interní chyba serveru.",
        })
      );
    }
  }
};
