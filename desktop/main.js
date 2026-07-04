const { app, BrowserWindow, shell, session, ipcMain } = require("electron");
const path = require("path");const webRoot = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "web");
const { createFakturaServer } = require(path.join(webRoot, "server.js"));

// Potlačí HTTPS upgrady a služby Chromia na pozadí (často způsobují SSL chyby v terminálu)
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
app.commandLine.appendSwitch("disable-sync");
app.commandLine.appendSwitch("disable-breakpad");
app.commandLine.appendSwitch("log-level", "3");
app.commandLine.appendSwitch(
  "disable-features",
  [
    "TranslateUI",
    "HttpsUpgrades",
    "HttpsFirstModeV2",
    "HttpsFirstBalancedMode",
    "AutofillServerCommunication",
    "OptimizationHints",
    "CertificateTransparencyComponentUpdater",
    "TrustTokens",
    "MediaRouter",
  ].join(",")
);

let mainWindow = null;
let fakturaServer = null;
let serverInfo = null;

function isLocalAppUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function setupOfflineSession() {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
    if (isLocalAppUrl(details.url)) {
      callback({});
      return;
    }
    if (details.url.startsWith("http://") || details.url.startsWith("https://")) {
      callback({ cancel: true });
      return;
    }
    callback({});
  });
}

function getPaths() {
  const isDev = !app.isPackaged;
  const webRoot = isDev
    ? path.join(__dirname, "..", "web")
    : path.join(process.resourcesPath, "web");
  const dataRoot = isDev ? __dirname : app.getPath("userData");

  return { webRoot, dataRoot };
}

async function startBackend() {
  const { webRoot, dataRoot } = getPaths();
  fakturaServer = createFakturaServer({
    staticRoot: webRoot,
    dataRoot,
    port: 0,
  });
  serverInfo = await fakturaServer.start();
  return serverInfo;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    title: "MJ Faktura",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverInfo.port}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalAppUrl(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isLocalAppUrl(url)) event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("export-invoice-pdf", async (event) => {
  const pdfBuffer = await event.sender.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    pageSize: "A4",
    margins: { top: 0, bottom: 14, left: 0, right: 0 },
  });
  return pdfBuffer.toString("base64");
});

app.whenReady().then(async () => {  try {
    setupOfflineSession();
    await startBackend();
    createWindow();
  } catch (err) {
    console.error("Spuštění aplikace se nezdařilo:", err);
    app.quit();
  }

  app.on("activate", async () => {
    if (mainWindow) return;
    if (!fakturaServer) await startBackend();
    createWindow();
  });
});

app.on("window-all-closed", async () => {
  if (fakturaServer) {
    await fakturaServer.stop();
    fakturaServer = null;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  if (fakturaServer) {
    await fakturaServer.stop();
    fakturaServer = null;
  }
});
