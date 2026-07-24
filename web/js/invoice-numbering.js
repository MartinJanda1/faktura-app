const InvoiceNumbering = (() => {
  const PREFS_KEY = "faktura-invoice-numbering";
  const SERIES_YEAR_RE = /^(\d+)\/(\d{2,4})$/;

  function currentYear() {
    return new Date().getFullYear();
  }

  function expandYear(yStr) {
    const n = parseInt(yStr, 10);
    if (yStr.length === 2) return n >= 70 ? 1900 + n : 2000 + n;
    return n;
  }

  function partyKey(party) {
    const p = party || {};
    const ico = String(p.ico || "").replace(/\D/g, "");
    if (ico) return `ico:${ico}`;
    const name = String(p.name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return name ? `name:${name}` : "";
  }

  function sameParty(a, b) {
    const keyA = partyKey(a);
    const keyB = partyKey(b);
    return Boolean(keyA && keyB && keyA === keyB);
  }

  function parse(value) {
    const raw = String(value || "").trim();
    const match = raw.match(SERIES_YEAR_RE);
    if (match) {
      const seqStr = match[1];
      return {
        kind: "series-year",
        sequence: parseInt(seqStr, 10),
        year: expandYear(match[2]),
        seqPad: seqStr.length,
        raw,
      };
    }

    const legacy = raw.match(/^(.*?)(\d+)(\s*)$/);
    if (legacy) {
      return {
        kind: "legacy-suffix",
        prefix: legacy[1],
        sequence: parseInt(legacy[2], 10),
        seqPad: legacy[2].length,
        suffix: legacy[3],
        raw,
      };
    }

    return { kind: "unknown", raw };
  }

  function formatSeriesYear(sequence, year, seqPad = 0) {
    const num = seqPad > 0 ? String(sequence).padStart(seqPad, "0") : String(sequence);
    return `${num}/${year}`;
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return null;
  }

  function savePrefs(prefs) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }

  function loadSupplierSeriesPrefs(supplier) {
    const key = partyKey(supplier);
    if (!key) return null;
    const prefs = loadPrefs();
    return prefs?.suppliers?.[key] || prefs?.customers?.[key] || null;
  }

  function saveSupplierSeriesPrefs(supplier, seriesPrefs) {
    const key = partyKey(supplier);
    if (!key) return;
    const prefs = loadPrefs() || { format: "series-year", suppliers: {} };
    prefs.format = prefs.format || "series-year";
    prefs.suppliers = prefs.suppliers || {};
    prefs.suppliers[key] = {
      ...(prefs.suppliers[key] || {}),
      ...seriesPrefs,
    };
    savePrefs(prefs);
  }

  function normalizeExisting(existingNumbers) {
    return (existingNumbers || []).map((n) => String(n || "").trim()).filter(Boolean);
  }

  function invoiceNumbers(invoices = []) {
    return invoices.map((inv) => inv?.invoiceNumber).filter(Boolean);
  }

  function invoicesForSupplier(invoices = [], supplier) {
    const key = partyKey(supplier);
    if (!key) return invoices;
    return invoices.filter((inv) => sameParty(inv.supplier, supplier));
  }

  /** Je faktura poslední v číselné řadě dodavatele (pro daný rok u formátu číslo/rok)? */
  function isLastInSeries(invoice, invoices = []) {
    if (!invoice) return false;
    const scoped = invoicesForSupplier(invoices, invoice.supplier);
    const parsed = parse(invoice.invoiceNumber);
    if (parsed.kind === "series-year") {
      const { maxSeq } = maxInYear(
        scoped.map((inv) => inv.invoiceNumber),
        parsed.year
      );
      return parsed.sequence === maxSeq;
    }
    // fallback: poslední podle čísla v rámci dodavatele
    const numbers = scoped.map((inv) => String(inv.invoiceNumber || "").trim()).filter(Boolean);
    if (!numbers.length) return true;
    const sorted = [...numbers].sort((a, b) => a.localeCompare(b, "cs", { numeric: true }));
    return sorted[sorted.length - 1] === String(invoice.invoiceNumber || "").trim();
  }

  function canDeleteInvoice(invoice, invoices = []) {
    if (!invoice || invoice.resolved || invoice.cancelled) return false;
    return isLastInSeries(invoice, invoices);
  }

  function deleteBlockReason(invoice, invoices = []) {
    if (!invoice) return "Faktura nenalezena.";
    if (invoice.cancelled) return "Stornovanou fakturu nelze smazat.";
    if (invoice.resolved) return "Vyřízenou fakturu nelze smazat.";
    if (!isLastInSeries(invoice, invoices)) {
      return "Smazat lze jen poslední nevyřízenou fakturu v číselné řadě.";
    }
    return "";
  }

  function variableSymbolFromNumber(invoiceNumber) {
    return String(invoiceNumber || "")
      .replace(/\D/g, "")
      .slice(0, 10);
  }

  function collectSeriesYear(numbers) {
    return numbers.map(parse).filter((p) => p.kind === "series-year");
  }

  function usesSeriesYearFormat(existingNumbers) {
    return collectSeriesYear(normalizeExisting(existingNumbers)).length > 0;
  }

  function maxInYear(existingNumbers, year) {
    let maxSeq = 0;
    let seqPad = 0;
    for (const item of collectSeriesYear(normalizeExisting(existingNumbers))) {
      if (item.year === year) {
        maxSeq = Math.max(maxSeq, item.sequence);
        seqPad = Math.max(seqPad, item.seqPad);
      }
    }
    return { maxSeq, seqPad };
  }

  function findUnique(candidate, existingNumbers) {
    const taken = new Set(normalizeExisting(existingNumbers).map((n) => n.toLowerCase()));
    let next = String(candidate || "").trim();
    if (!next) next = "1";
    let guard = 0;

    while (taken.has(next.toLowerCase()) && guard < 10000) {
      const parsed = parse(next);
      if (parsed.kind === "series-year") {
        next = formatSeriesYear(parsed.sequence + 1, parsed.year, parsed.seqPad);
      } else if (parsed.kind === "legacy-suffix") {
        next = `${parsed.prefix}${String(parsed.sequence + 1).padStart(parsed.seqPad, "0")}${parsed.suffix}`;
      } else {
        next = `${next}-2`;
      }
      guard += 1;
    }

    return next;
  }

  /**
   * Navrhne další číslo. Řada patří dodavateli (vystaviteli).
   * Unikátnost se kontroluje napříč všemi fakturami.
   */
  function suggestNext(invoicesOrNumbers, options = {}) {
    const year = options.year ?? currentYear();
    const invoices = Array.isArray(invoicesOrNumbers) ? invoicesOrNumbers : [];
    const looksLikeInvoices = invoices.some((item) => item && typeof item === "object" && "invoiceNumber" in item);

    const allNumbers = looksLikeInvoices
      ? invoiceNumbers(invoices)
      : normalizeExisting(invoicesOrNumbers);

    const supplier = options.supplier || null;
    const scopedInvoices = looksLikeInvoices
      ? invoicesForSupplier(invoices, supplier)
      : null;

    const scopedNumbers = scopedInvoices ? invoiceNumbers(scopedInvoices) : allNumbers;
    const supplierPrefs = supplier ? loadSupplierSeriesPrefs(supplier) : null;
    const globalPrefs = loadPrefs();
    const scopedEmpty = scopedNumbers.length === 0;

    const needsSetup =
      options.forceSetup === true ||
      (scopedEmpty && options.startNumber === undefined && !supplierPrefs?.startNumber && !options.skipSetup);

    if (needsSetup) {
      const start = options.startNumber ?? supplierPrefs?.startNumber ?? globalPrefs?.startNumber ?? 1;
      return {
        needsSetup: true,
        number: formatSeriesYear(start, year, supplierPrefs?.seqPad || 0),
        format: "series-year",
        year,
        startNumber: start,
        seqPad: supplierPrefs?.seqPad || 0,
        supplierKey: partyKey(supplier),
      };
    }

    const { maxSeq, seqPad: existingPad } = maxInYear(scopedNumbers, year);
    const seqPad = Math.max(existingPad, supplierPrefs?.seqPad || 0, globalPrefs?.seqPad || 0);
    const startNumber = options.startNumber ?? supplierPrefs?.startNumber ?? globalPrefs?.startNumber ?? 1;
    const nextSeq = scopedEmpty ? startNumber : maxSeq + 1;
    const number = findUnique(formatSeriesYear(nextSeq, year, seqPad), allNumbers);

    return {
      needsSetup: false,
      number,
      format: "series-year",
      year,
      sequence: nextSeq,
      seqPad,
      supplierKey: partyKey(supplier),
    };
  }

  function suggestForCopy(sourceInvoice, invoices, options = {}) {
    const year = options.year ?? currentYear();
    const list = Array.isArray(invoices) ? invoices : [];
    const sourceNumber = sourceInvoice?.invoiceNumber || sourceInvoice;
    const supplier = options.supplier || sourceInvoice?.supplier || null;
    const allNumbers =
      list.length && typeof list[0] === "object" ? invoiceNumbers(list) : normalizeExisting(list);

    if (typeof sourceInvoice === "object" && sourceInvoice?.invoiceNumber) {
      const scoped = invoicesForSupplier(list, supplier);
      const scopedNumbers = invoiceNumbers(scoped);
      const source = parse(sourceNumber);

      if (source.kind === "series-year" || usesSeriesYearFormat(scopedNumbers) || usesSeriesYearFormat(allNumbers)) {
        const { maxSeq, seqPad } = maxInYear(scopedNumbers.length ? scopedNumbers : allNumbers, year);
        const pad = Math.max(seqPad, source.seqPad || 0);
        const nextSeq = Math.max(maxSeq, source.sequence || 0) + 1;
        const number = findUnique(formatSeriesYear(nextSeq, year, pad), allNumbers);
        return { number, format: "series-year", year, sequence: nextSeq };
      }
    }

    const numbers = allNumbers;
    const source = parse(sourceNumber);
    if (source.kind === "series-year" || usesSeriesYearFormat(numbers)) {
      const { maxSeq, seqPad } = maxInYear(numbers, year);
      const pad = Math.max(seqPad, source.seqPad || 0);
      const nextSeq = Math.max(maxSeq, source.sequence || 0) + 1;
      const number = findUnique(formatSeriesYear(nextSeq, year, pad), numbers);
      return { number, format: "series-year", year, sequence: nextSeq };
    }

    if (source.kind === "legacy-suffix") {
      const number = findUnique(
        `${source.prefix}${String(source.sequence + 1).padStart(source.seqPad, "0")}${source.suffix}`,
        numbers
      );
      return { number, format: "legacy-suffix" };
    }

    return suggestNext(list, { ...options, supplier, skipSetup: true });
  }

  return {
    PREFS_KEY,
    parse,
    formatSeriesYear,
    loadPrefs,
    savePrefs,
    loadSupplierSeriesPrefs,
    saveSupplierSeriesPrefs,
    partyKey,
    sameParty,
    suggestNext,
    suggestForCopy,
    findUnique,
    variableSymbolFromNumber,
    currentYear,
    usesSeriesYearFormat,
    invoicesForSupplier,
    isLastInSeries,
    canDeleteInvoice,
    deleteBlockReason,
  };
})();
