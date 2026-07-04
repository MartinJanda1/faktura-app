const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const distPath = path.join(__dirname, "..", "dist");

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function stopWindowsAppProcesses() {
  if (process.platform !== "win32") return;

  const killed = new Set();
  function killImage(name) {
    if (killed.has(name)) return;
    try {
      execSync(`taskkill /F /IM ${name} /T`, { stdio: "ignore" });
      console.log(`Ukončeno: ${name}`);
      killed.add(name);
    } catch {
      // not running
    }
  }

  killImage("MJ Faktura.exe");
  killImage("Faktura.exe");

  try {
    const out = execSync("tasklist /FO CSV /NH", { encoding: "utf8" });
    for (const line of out.split(/\r?\n/)) {
      const match = line.match(/^"([^"]+\.exe)"/i);
      if (!match) continue;
      const lower = match[1].toLowerCase();
      if (lower.startsWith("faktura") || lower.startsWith("mj-faktura") || lower.includes("mj faktura")) {
        killImage(match[1]);
      }
    }
  } catch {
    // ignore
  }

  sleep(1000);
}

function tryCleanDist() {
  if (!fs.existsSync(distPath)) return;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      fs.rmSync(distPath, { recursive: true, force: true });
      console.log("Složka dist vyčištěna.");
      return;
    } catch {
      sleep(500);
    }
  }

  console.warn(
    "desktop/dist nejde smazat (pravděpodobně Cursor nebo Průzkumník) — build pokračuje v temp složce."
  );
}

stopWindowsAppProcesses();
tryCleanDist();
