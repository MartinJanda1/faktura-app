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

  function normalizeExisting(existingNumbers) {
    return (existingNumbers || []).map((n) => String(n || "").trim()).filter(Boolean);
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

  function suggestNext(existingNumbers, options = {}) {
    const year = options.year ?? currentYear();
    const numbers = normalizeExisting(existingNumbers);
    const prefs = loadPrefs();
    const hasSeries = usesSeriesYearFormat(numbers);
    const useSeries =
      options.format === "series-year" ||
      hasSeries ||
      prefs?.format === "series-year" ||
      numbers.length === 0;

    if (useSeries) {
      const { maxSeq, seqPad: existingPad } = maxInYear(numbers, year);
      const seqPad = Math.max(existingPad, prefs?.seqPad || 0);

      if (numbers.length === 0 && options.startNumber === undefined && !prefs?.startNumber) {
        const start = 1;
        return {
          needsSetup: true,
          number: formatSeriesYear(start, year, seqPad),
          format: "series-year",
          year,
          startNumber: start,
          seqPad,
        };
      }

      const startNumber = options.startNumber ?? prefs?.startNumber ?? 1;
      const nextSeq = numbers.length === 0 ? startNumber : maxSeq + 1;
      const number = findUnique(formatSeriesYear(nextSeq, year, seqPad), numbers);

      return {
        needsSetup: false,
        number,
        format: "series-year",
        year,
        sequence: nextSeq,
        seqPad,
      };
    }

    const last = numbers[numbers.length - 1] || "1";
    const parsed = parse(last);
    if (parsed.kind === "legacy-suffix") {
      const number = findUnique(
        `${parsed.prefix}${String(parsed.sequence + 1).padStart(parsed.seqPad, "0")}${parsed.suffix}`,
        numbers
      );
      return { needsSetup: false, number, format: "legacy-suffix" };
    }

    const number = findUnique(numbers.length === 0 ? "1" : `${last}-2`, numbers);
    return { needsSetup: numbers.length === 0, number, format: "unknown" };
  }

  function suggestForCopy(sourceNumber, existingNumbers, options = {}) {
    const year = options.year ?? currentYear();
    const numbers = normalizeExisting(existingNumbers);
    const source = parse(sourceNumber);

    if (
      source.kind === "series-year" ||
      usesSeriesYearFormat(numbers) ||
      loadPrefs()?.format === "series-year"
    ) {
      const { maxSeq, seqPad } = maxInYear(numbers, year);
      const prefsPad = loadPrefs()?.seqPad || 0;
      const pad = Math.max(seqPad, source.seqPad || 0, prefsPad);
      const nextSeq = maxSeq + 1;
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

    return suggestNext(numbers, options);
  }

  function variableSymbolFromNumber(invoiceNumber) {
    return String(invoiceNumber || "")
      .replace(/\D/g, "")
      .slice(0, 10);
  }

  return {
    PREFS_KEY,
    parse,
    formatSeriesYear,
    loadPrefs,
    savePrefs,
    suggestNext,
    suggestForCopy,
    findUnique,
    variableSymbolFromNumber,
    currentYear,
    usesSeriesYearFormat,
  };
})();
