# Faktura – správa faktur

Projekt obsahuje dvě verze stejné aplikace:

| Složka | Typ | Popis |
|--------|-----|-------|
| [`web/`](web/) | Webová aplikace | Spustíš v prohlížeči přes lokální server |
| [`desktop/`](desktop/) | Desktopová aplikace | Electron — okno jako běžný program v PC |

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

### Desktop

```bash
cd web && npm install && npm run build:css
cd ../desktop && npm install && npm start
```

### Příkazy z kořene projektu

```bash
npm run start:web       # spustí webovou verzi
npm run start:desktop   # spustí desktopovou verzi
npm run build:css       # zkompiluje Tailwind CSS
npm run dist:desktop    # sestaví desktop .exe
npm run db:migrate      # vytvoří tabulky v PostgreSQL (viz níže)
```

---

## Ukládání dat

Aplikace podporuje **dvě úložiště**. Výchozí režim nevyžaduje žádnou konfiguraci.

| Režim | Kdy se použije | Kde jsou data |
|-------|----------------|---------------|
| **JSON** (výchozí) | Bez `.env` nebo bez `CONNECTION_TO_PG=true` | `web/data/invoices/*.json`, `web/data/sablona.json` |
| **PostgreSQL** | `CONNECTION_TO_PG=true` v `.env` | Tabulky v databázi (např. `fakturaApp`) |

### JSON režim (jako dřív)

- Spuštění: `npm run start` ve `web/`
- Data v `web/data/` (v `.gitignore`, do gitu se necommitují)
- Desktop při vývoji ukládá do `desktop/data/`
- Po sestavení desktop `.exe` do profilu uživatele Windows

### PostgreSQL režim (volitelný)

1. Vytvoř databázi a spusť migrace:

```bash
# v kořeni projektu — .env s připojením k DB (viz .env.docker.example)
npm run db:migrate
```

2. Do `.env` v kořeni projektu přidej:

```env
CONNECTION_TO_PG=true
PG_HOST=10.0.0.158
PG_PORT=5432
PG_DATABASE=fakturaApp
PG_USER=cbos
PG_PASSWORD=heslo
```

3. Spusť server — data se ukládají do tabulek místo JSON souborů.

Skripty schématu jsou ve složce [`pg-scripts/`](pg-scripts/) (`1_tables.sql`, `2_indexes.sql`, `3_triggers.sql`).

Import/export `.json` funguje v obou režimech.

---

## Nasazení na NAS (Docker)

Pro provoz na QNAP / Docker je připraveno:

| Soubor | Popis |
|--------|--------|
| `Dockerfile` | Image webové aplikace |
| `docker-compose.yml` | Postgres + aplikace (vše v jednom) |
| `docker-compose.app-only.yml` | Jen aplikace — k existujícímu postgres kontejneru |
| `.env.docker.example` | Volitelné proměnné pro compose |

### Nová instalace (Postgres + app)

```bash
docker compose up -d --build
```

Aplikace: **http://IP_NAS:3000**

### Existující PostgreSQL kontejner (např. `postgres-1`)

```bash
docker compose -f docker-compose.app-only.yml up -d --build
```

Nastav `PG_HOST=postgres-1` a oba kontejnery připoj do stejné Docker sítě.

Při startu kontejneru se automaticky spustí DB migrace (`RUN_MIGRATIONS=true`).

---

## Webová verze (`web/`)

Podrobnosti: [`web/README.md`](web/README.md)

---

## Desktopová verze (`desktop/`)

Podrobnosti: [`desktop/README.md`](desktop/README.md)

### Sestavení .exe pro Windows

```bash
cd web && npm run build:css
cd ../desktop && npm run dist
```

Výstup: `desktop/dist/Faktura-1.0.0-portable.exe`

---

## Funkce

### Seznam faktur

- Přehled faktur s číslem, odběratelem, datem vystavení a částkou
- **Filtry** — odběratel (autocomplete podle jména, IČ, DIČ), datum (rok → měsíc → den)
- **Řazení** sloupců (číslo, odběratel, datum, částka)
- **Hromadný výběr** — checkboxy, smazání / označení vyřízeno / zrušení vyřízeno
- **Vyřízené faktury** — zelené pozadí v seznamu, přepínač u každého řádku
- **Šablona** — banner s info o zdrojové faktuře, ruční smazání šablony
- **Import** jedné nebo více faktur ze `.json`
- **Export** s filtry do jednoho `.json` souboru
- **Světlý / tmavý režim** (volba se ukládá do prohlížeče)

### Editor faktury

- Dodavatel, odběratel, datumy, platební údaje a položky
- Automatický výpočet řádků a celkové částky
- Variabilní symbol se doplňuje z čísla faktury (lze přepsat ručně)
- Validace — povinné číslo faktury, kontrola duplicity
- **Šablona** — uložení s potvrzením (včetně varování při přepsání existující)
- **Export do PDF** včetně patičky se jménem a číslem stránky

### QR platba

- U způsobu platby **Převodem** — QR kód ve formátu SPAYD pod rekapitulací
- Přepínač u **Stáhnout PDF** — volba, zda QR zahrnout do PDF

---

## Struktura projektu

```
faktura-app/
├── web/                  # Webová aplikace (server + frontend)
├── desktop/              # Electron desktop
├── pg-scripts/           # SQL migrace pro PostgreSQL
├── docker/               # Entrypoint pro Docker
├── docker-compose.yml    # Nasazení na NAS / Docker
├── Dockerfile
└── .env                  # Volitelné — PostgreSQL režim (není v gitu)
```

---

## Poznámky

- Bez `.env` aplikace funguje **stejně jako dřív** — JSON soubory, žádná databáze.
- Aplikace nemá přihlašování — na NAS ji nevystavuj na internet bez ochrany (VPN, firewall, reverse proxy).
- Při startu serveru se staré soubory `.txt` automaticky přejmenují na `.json`.
