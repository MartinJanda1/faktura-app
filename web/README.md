# MJ Faktura – webová verze

Spuštění v prohlížeči přes lokální Node.js server.

## Spuštění

```bash
npm install
npm run build:css
npm start
```

Otevři **http://localhost:3000** (port lze změnit proměnnou `PORT` v `.env`).

Při úpravách CSS:

```bash
npm run watch:css
```

## Data (JSON režim — výchozí)

| Soubor / složka | Obsah |
|-----------------|-------|
| `data/invoices/*.json` | Uložené faktury |
| `data/parties.json` | Dodavatelé a odběratelé (profily + platební údaje dodavatele) |
| `data/sablona.json` | Legacy šablona, pokud existuje |

Složka `data/` je v `.gitignore`.

## PostgreSQL režim (volitelný)

Do `.env` v kořeni projektu nebo ve `web/`:

```env
CONNECTION_TO_PG=true
PG_HOST=…
PG_DATABASE=…
PG_USER=…
PG_PASSWORD=…
```

Migrace tabulek: z kořene projektu `npm run db:migrate`.

V PostgreSQL režimu lze importovat i `.sql` soubory s INSERT příkazy (tlačítko Import na seznamu faktur).

## Import / export JSON

Formát souborů pro import a export je popsán v kořenovém [`README.md`](../README.md#formát-importovaného-json).

Shrnutí:

- **Export** vytvoří soubor s `"type": "faktura-app-invoice"` (jedna faktura) nebo `"faktura-app-invoices"` (více faktur)
- **Import** akceptuje i zjednodušený JSON bez obálky — stačí objekt s `invoiceNumber` nebo `supplier`
- Částky a množství používají **desetinnou čárku** (`"1,00"`, `"1500,50"`)

## Desktop a Docker

- Desktopová verze: [`../desktop/README.md`](../desktop/README.md)
- Nasazení na NAS: kořenový [`README.md`](../README.md#nasazení-do-provozu)
