# MJ Faktura – správa faktur

**Verze:** 1.2.0 — změny viz [CHANGELOG.md](CHANGELOG.md).

Projekt obsahuje dvě verze stejné aplikace:

| Složka | Typ | Popis |
|--------|-----|-------|
| [`web/`](web/) | Webová aplikace | Spustíš v prohlížeči přes lokální Node.js server |
| [`desktop/`](desktop/) | Desktopová aplikace | Electron — okno jako běžný program v PC (portable `.exe`) |

Obě verze sdílejí stejné rozhraní, funkce i formát dat (JSON export/import).

---

## Rychlé spuštění

### Web (výchozí)

```bash
cd web
npm install
npm run build:css
npm start
```

Otevři **http://localhost:3000**

Při úpravách stylů v terminálu běží `npm run watch:css` (nebo po změnách znovu `npm run build:css`).

### Desktop (vývoj)

```bash
cd web && npm install && npm run build:css
cd ../desktop && npm install && npm start
```

### Desktop (portable `.exe` pro Windows)

```bash
cd web && npm run build:css
cd ../desktop && npm run dist
```

Výstup: **`desktop/dist/MJ-Faktura-1.2.0-portable.exe`** — není potřeba instalace, stačí spustit soubor.

Instalační verze: `cd desktop && npm run dist:installer`

### Příkazy z kořene projektu

```bash
npm run start:web              # webová verze
npm run start:desktop          # desktop ve vývoji
npm run build:css              # zkompiluje Tailwind CSS
npm run dist:desktop           # sestaví portable .exe
npm run dist:desktop:installer # sestaví instalační .exe
npm run db:migrate             # PostgreSQL migrace (viz níže)
```

---

## Ukládání dat

Aplikace podporuje **dvě úložiště faktur**. Výchozí režim nevyžaduje žádnou konfiguraci.

| Režim | Kdy se použije | Kde jsou data |
|-------|----------------|---------------|
| **JSON** (výchozí) | Bez `.env` nebo bez `CONNECTION_TO_PG=true` | Složka `data/` (viz tabulka níže) |
| **PostgreSQL** | `CONNECTION_TO_PG=true` v `.env` | Tabulky v databázi (např. `fakturaApp`) |

### Soubory v JSON režimu

| Soubor / složka | Obsah |
|-----------------|-------|
| `data/invoices/*.json` | Uložené faktury |
| `data/parties.json` | Uložení dodavatelé a odběratelé (včetně platebních údajů dodavatele) |
| `data/sablona.json` | Legacy šablona (pokud existuje z dřívějška) |

**Kde je `data/` podle verze:**

| Verze | Umístění dat |
|-------|--------------|
| Web (`npm start` ve `web/`) | `web/data/` |
| Desktop ve vývoji | `desktop/data/` |
| Desktop `.exe` (sestavená) | `%APPDATA%\faktura-app-desktop\data\` |
| Docker / NAS | Volume nebo cesta dle compose |

Soubory v `data/` jsou v `.gitignore` — do gitu se necommitují.

### PostgreSQL režim (volitelný, web / Docker)

Pouze pro **webovou verzi** nebo **Docker**. Sestavená desktop `.exe` používá JSON (modul `pg` není součástí balíčku).

1. Vytvoř databázi a spusť migrace:

```bash
# v kořeni projektu — .env s připojením k DB (viz .env.docker.example)
npm run db:migrate
```

2. Do `.env` v kořeni projektu (nebo ve `web/`) přidej:

```env
CONNECTION_TO_PG=true
PG_HOST=10.0.0.158
PG_PORT=5432
PG_DATABASE=fakturaApp
PG_USER=cbos
PG_PASSWORD=heslo
```

3. Spusť server — faktury se ukládají do tabulek místo JSON souborů.

Skripty schématu: [`pg-scripts/`](pg-scripts/) (`1_tables.sql`, `2_indexes.sql`, `3_triggers.sql`).

Import/export `.json` funguje v obou režimech. V PostgreSQL režimu lze navíc importovat `.sql` soubory s INSERT příkazy.

---

## Formát importovaného JSON

Tlačítko **Importovat .json** na seznamu faktur akceptuje tyto formáty:

### 1. Jedna faktura (doporučený export z aplikace)

```json
{
  "type": "faktura-app-invoice",
  "version": 1,
  "exportedAt": "2026-04-07T12:00:00.000Z",
  "data": {
    "invoiceNumber": "2026001",
    "layout": "classic",
    "footerNote": "",
    "resolved": false,
    "variableSymbolManual": false,
    "supplier": {
      "name": "Dodavatel s.r.o.",
      "address": "Hlavní 1",
      "city": "Praha 1",
      "country": "Česká republika",
      "ico": "12345678",
      "email": "info@dodavatel.cz",
      "phone": "+420 123 456 789",
      "vatNote": "Nejsme plátci DPH"
    },
    "customer": {
      "name": "Odběratel a.s.",
      "address": "Vedlejší 2",
      "city": "Brno",
      "country": "Česká republika",
      "ico": "87654321",
      "dic": "CZ87654321"
    },
    "dates": {
      "issue": "2026-04-07",
      "due": "2026-04-27",
      "orderNumber": ""
    },
    "payment": {
      "accountNumber": "123456789/0100",
      "iban": "CZ6501000000001234567890",
      "swift": "KOMBCZPP",
      "bankName": "Komerční banka",
      "variableSymbol": "2026001",
      "constantSymbol": "0308",
      "method": "Převodem"
    },
    "items": [
      {
        "desc": "Služba / zboží",
        "qty": "1,00",
        "unit": "ks",
        "unitPrice": "1000,00"
      }
    ]
  }
}
```

### 2. Více faktur najednou (hromadný export)

```json
{
  "type": "faktura-app-invoices",
  "version": 1,
  "exportedAt": "2026-04-07T12:00:00.000Z",
  "count": 2,
  "data": [
    { "invoiceNumber": "2026001", "supplier": { "name": "…" }, "…": "…" },
    { "invoiceNumber": "2026002", "supplier": { "name": "…" }, "…": "…" }
  ]
}
```

### 3. Zjednodušený / starší formát (zpětná kompatibilita)

Stačí samotný objekt faktury v kořeni souboru (bez obálky `type` / `data`), pokud obsahuje `invoiceNumber` nebo `supplier`:

```json
{
  "invoiceNumber": "2026001",
  "supplier": { "name": "Dodavatel s.r.o." },
  "customer": { "name": "Odběratel a.s." },
  "items": [{ "desc": "Položka", "qty": "1,00", "unit": "ks", "unitPrice": "500,00" }]
}
```

### Pravidla importu

| Pole | Poznámka |
|------|----------|
| `id` | Volitelné — chybí-li, aplikace vygeneruje nové |
| `invoiceNumber` | Doporučené; duplicita se nekontroluje při importu |
| Formát `číslo/rok` | Např. `6/2026` — při nové faktuře nebo kopii se automaticky navýší pořadové číslo v řadě aktuálního roku |
| `layout` | `"classic"` (výchozí) nebo `"idoklad"` |
| `items[].qty`, `unitPrice` | Český formát desetinné čárky, např. `"1,00"`, `"1500,50"` |
| `dates.issue`, `dates.due` | Formát `YYYY-MM-DD` |
| `payment.method` | Např. `"Převodem"`, `"Hotově"`, `"Kartou"` |

**Poznámka:** Soubor `parties.json` (dodavatelé / odběratelé) se tlačítkem Import ** neimportuje** — ten se plní automaticky při ukládání faktury a při zakládání nové faktury přes modal (včetně načtení z ARES).

---

## Nasazení do provozu

### Web na PC (lokálně)

1. `cd web && npm install && npm run build:css`
2. `npm start` — server běží na portu 3000 (nebo `PORT` z `.env`)
3. Pro trvalý provoz na serveru použij process manager (systemd, pm2) nebo Docker (viz níže)

### Desktop na PC (bez Node.js)

1. Sestav `.exe` (`npm run dist` ve složce `desktop/`)
2. Zkopíruj `MJ-Faktura-1.2.0-portable.exe` kamkoli (USB, Plocha)
3. Spusť — data se ukládají do `%APPDATA%\faktura-app-desktop\data\`
4. Záloha = zkopírovat celou složku `data\`

Podrobnosti k buildu: [`desktop/README.md`](desktop/README.md)

### NAS (Docker)

| Soubor | Popis |
|--------|--------|
| `Dockerfile` | Image webové aplikace |
| `docker-compose.yml` | Postgres + aplikace (vše v jednom) |
| `docker-compose.app-only.yml` | Jen aplikace — k existujícímu postgres kontejneru |
| `.env.docker.example` | Volitelné proměnné pro compose |

**Nová instalace (Postgres + app):**

```bash
docker compose up -d --build
```

Aplikace: **http://IP_NAS:3000**

**Existující PostgreSQL kontejner (např. `postgres-1`):**

```bash
docker compose -f docker-compose.app-only.yml up -d --build
```

Nastav `PG_HOST=postgres-1` a oba kontejnery připoj do stejné Docker sítě.

Při startu kontejneru se automaticky spustí DB migrace (`RUN_MIGRATIONS=true`).

---

## Funkce

### Seznam faktur

- Přehled s číslem, odběratelem, datem vystavení a částkou
- **Filtry** — odběratel (autocomplete podle jména, IČ, DIČ), datum (rok → měsíc → den), stav (platné / vyřízené / stornované / všechny)
- **Řazení** sloupců
- **Storno** — faktura zůstane v řadě (přeškrtnutá); smazat lze jen poslední nevyřízenou nestornovanou fakturu
- **Hromadný výběr** — smazání, označení / zrušení vyřízeno, stornování
- **Kopírování faktury** — nová faktura s navazujícím číslem v řadě `číslo/rok` (např. z `6/2026` → `7/2026`), dnešním datem a vynulovaným množstvím položek
- **Import** jedné nebo více faktur ze `.json` (viz [formát JSON](#formát-importovaného-json))
- **Export** s filtry do jednoho `.json` souboru
- **Světlý / tmavý režim**

### Nová faktura (modal)

- Volba **layoutu** — Klasická nebo iDoklad
- Výběr **dodavatele** a **odběratele** ze seznamu uložených subjektů
- **Číslování** — formát `číslo/rok` (např. `6/2026`); řada patří dodavateli, u první faktury volba počátečního čísla, poté kontinuální navazování v rámci roku
- **Načtení podle IČO (ARES)** — doplnění názvu, adresy, DIČ
- Platební údaje dodavatele se ukládají spolu s dodavatelem do `parties.json`

### Editor faktury

- Dodavatel, odběratel, datumy, platební údaje (u dodavatele) a položky
- **IBAN** — po zadání se doplní číslo účtu, SWIFT a název banky
- Výchozí **konstantní symbol** `0308`
- Automatický výpočet řádků a celkové částky
- Variabilní symbol z čísla faktury (lze přepsat ručně)
- Validace — povinné číslo faktury, kontrola duplicity
- **Export do PDF** včetně patičky se jménem a číslem stránky
- Položky: přidání / smazání řádků přímo v tabulce

### QR platba

- U způsobu platby **Převodem** — QR kód ve formátu SPAYD pod rekapitulací (SPAYD se zobrazí i v PDF, pokud je QR viditelný na obrazovce)

---

## Struktura projektu

```
faktura-app/
├── web/                  # Webová aplikace (server + frontend)
├── desktop/              # Electron desktop + skripty pro build .exe
├── pg-scripts/           # SQL migrace pro PostgreSQL
├── docker/               # Entrypoint pro Docker
├── docker-compose.yml    # Nasazení na NAS / Docker
├── Dockerfile
└── .env                  # Volitelné — PostgreSQL režim (není v gitu)
```

Podrobnosti: [`web/README.md`](web/README.md), [`desktop/README.md`](desktop/README.md)

---

## Poznámky

- Bez `.env` aplikace funguje **stejně jako dřív** — JSON soubory, žádná databáze.
- Aplikace nemá přihlašování — na NAS ji nevystavuj na internet bez ochrany (VPN, firewall, reverse proxy).
- Při startu serveru se staré soubory `.txt` automaticky přejmenují na `.json`.
- ARES vyžaduje síťové připojení (v desktop verzi jsou blokována jen externí stránky v okně prohlížeče, API ARES na serveru funguje).
