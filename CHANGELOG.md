# Changelog

Všechny významné změny projektu **MJ Faktura** jsou dokumentovány v tomto souboru.

Formát vychází z [Keep a Changelog](https://keepachangelog.com/cs/1.1.0/),
verze ze [Semantic Versioning](https://semver.org/lang/cs/).

## [1.2.0] – 2026-07-24

### Přidáno

- Paměť **filtrů a řazení** na seznamu faktur (`localStorage`) — po obnovení stránky zůstanou nastavené
- **Jen ke čtení** u vyřízených faktur — nelze editovat; v seznamu ikona oka místo tužky
- Skripty pro migraci starých faktur z CSV (`scripts/csv-to-invoices.js`) a doplnění adres odběratelů z ARES (`scripts/fill-customer-addresses-ares.js`)
- Při CSV importu výpočet hodin ze sazby 500 Kč/h (celková částka beze změny)

### Změněno

- Robustnější práce s uloženými dodavateli/odběrateli (i „placatý“ tvar záznamu)

### Opraveno

- Pád při **Nová faktura** (`Cannot read properties of null (reading 'ico')`) při výpočtu číselné řady

## [1.1.0] – 2026-07-20

### Přidáno

- Stav **stornováno** — faktura zůstane v seznamu (přeškrtnutá) a zachová číslo, aby číselná řada zůstala konzistentní
- Filtr stavu na seznamu: **platné** / **vyřízené** / **stornované** / **všechny**
- Hromadné stornování vybraných faktur
- Stránka **nápovědy** (`help.html`) s přehledem práce s aplikací
- Zobrazení verze aplikace v patičce (`AppMeta`)
- PostgreSQL migrace `pg-scripts/6_add_invoice_cancelled.sql` (sloupec `cancelled`)

### Změněno

- **Mazání** — smazat lze jen poslední nevyřízenou a nestornovanou fakturu v číselné řadě dodavatele
- **Číslování** `číslo/rok` je vázané na **dodavatele** (vystavitele); kopírování pokračuje v jeho řadě
- UI seznamu — akce s ikonami (úprava, kopie, PDF, vyřízeno, storno, smazání)
- Lepší PDF výstup (desktop `printToPDF` včetně okrajů, úpravy webového exportu)
- Přejmenování produktu na **MJ Faktura** (portable build `MJ-Faktura-*-portable.exe`)

### Opraveno

- Nesprávné okraje při generování PDF v Electronu

## [1.0.0] – 2026-04

První ucelená verze webové a desktopové aplikace:

- Seznam faktur s filtry, řazením a hromadnými akcemi
- Editor faktur (layout Klasická / iDoklad), QR platba, ARES
- Úložiště JSON nebo PostgreSQL, export/import, Docker
- Desktopová Electron aplikace (portable / instalátor)
