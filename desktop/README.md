# MJ Faktura – desktopová verze

Electron aplikace se stejným rozhraním jako webová verze v `../web/`.

## Spuštění ve vývoji

Nejdřív zkompiluj CSS ve webové složce:

```bash
cd ../web
npm install
npm run build:css
```

Poté spusť desktop:

```bash
cd ../desktop
npm install
npm start
```

## Uvedení do provozu (portable `.exe`)

Uživatel **nepotřebuje Node.js** — stačí spustitelný soubor.

1. Sestav aplikaci (viz níže)
2. Předej soubor **`dist/MJ-Faktura-1.3.0-portable.exe`**
3. Po prvním spuštění se data vytvoří automaticky

### Kde jsou data

| Režim | Umístění |
|-------|----------|
| Vývoj (`npm start`) | `desktop/data/` |
| Sestavená `.exe` | **`%APPDATA%\faktura-app-desktop\data\`** |

Typická cesta: `C:\Users\<uživatel>\AppData\Roaming\faktura-app-desktop\data\`

**Záloha:** zkopíruj celou složku `data\` (faktury, parties, případně `.env`).

Desktop verze používá **JSON úložiště** — PostgreSQL režim v `.exe` není podporován.

### Import / export faktur

Stejný formát `.json` jako webová verze — viz kořenový [`README.md`](../README.md#formát-importovaného-json).

---

## Sestavení .exe pro Windows

```bash
cd ../web && npm run build:css
cd ../desktop && npm run dist
```

Výstup: **`desktop/dist/MJ-Faktura-1.3.0-portable.exe`**

Instalační verze (NSIS): `npm run dist:installer` → `MJ-Faktura-1.3.0-setup.exe`

Z kořene projektu: `npm run dist:desktop`

### Průběh buildu

- Před buildem se automaticky zkompiluje CSS a ukončí běžící procesy `MJ Faktura.exe`
- Build probíhá v **`%TEMP%\faktura-electron-build`** (mimo projekt), hotový `.exe` se zkopíruje do `desktop/dist/`
- Pokud nejde smazat starou složku `dist`, build stejně pokračuje

### Chyba „Cannot create symbolic link“ při buildu

Na Windows electron-builder někdy stahuje balíček `winCodeSign` se symlinky. V `package.json` je vypnuté `signAndEditExecutable` (u portable `.exe` není podpis potřeba).

Alternativa: **Nastavení → Systém → Pro vývojáře → Režim pro vývojáře** (zapnout).

### Chyba „Access is denied“ / zamčená složka `dist`

Často zamyká Cursor (sleduje soubory v projektu) nebo otevřená složka v Průzkumníku. Build v temp složce tento problém obchází — stačí spustit `npm run dist` znovu.

---

## Rozdíly oproti webové verzi

| | Web | Desktop `.exe` |
|---|-----|----------------|
| Spuštění | `npm start` + prohlížeč | Dvojklik na `.exe` |
| Data | `web/data/` | `%APPDATA%\faktura-app-desktop\data\` |
| PostgreSQL | Ano (volitelně) | Ne |
| Externí URL v okně | Ano | Ne (otevřou se v prohlížeči) |
| ARES / API | Ano | Ano (lokální server uvnitř Electronu) |
