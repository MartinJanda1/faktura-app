const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const desktopRoot = path.join(__dirname, "..");
const artifactDir = path.join(desktopRoot, "dist");
const buildDir = path.join(os.tmpdir(), "faktura-electron-build");
const target = process.argv[2] === "nsis" ? "nsis" : "portable";

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

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      sleep(500);
    }
  }
}

function copyArtifacts() {
  fs.mkdirSync(artifactDir, { recursive: true });

  const exes = fs
    .readdirSync(buildDir)
    .filter((name) => name.endsWith(".exe"));

  if (exes.length === 0) {
    throw new Error(`V ${buildDir} nebyl nalezen žádný .exe soubor.`);
  }

  for (const name of exes) {
    const from = path.join(buildDir, name);
    const to = path.join(artifactDir, name);
    fs.copyFileSync(from, to);
    console.log(`\nHotovo: ${to}`);
  }
}

stopWindowsAppProcesses();
cleanDir(buildDir);

const builderArgs =
  target === "nsis"
    ? ["electron-builder", "--win", "nsis"]
    : ["electron-builder", "--win", "portable"];

const configPath = buildDir.replace(/\\/g, "/");
builderArgs.push(`--config.directories.output=${configPath}`);

console.log(`Build probíhá v: ${buildDir}`);

execSync("npm run build:css", {
  cwd: path.join(desktopRoot, "..", "web"),
  stdio: "inherit",
});

execSync(builderArgs.join(" "), {
  cwd: desktopRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
});

copyArtifacts();
