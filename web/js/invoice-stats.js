/**
 * Agregace faktur pro stránku statistik.
 */
const InvoiceStats = (() => {
  const MONTH_NAMES_SHORT = [
    "Led", "Úno", "Bře", "Dub", "Kvě", "Čvn",
    "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro",
  ];
  const MONTH_NAMES = InvoiceFilters?.MONTH_NAMES || [
    "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
  ];

  function parseAmount(value) {
    const n = parseFloat(String(value ?? "").trim().replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function invoiceTotal(invoice) {
    if (typeof InvoiceModel !== "undefined" && InvoiceModel.calculateTotal) {
      return InvoiceModel.calculateTotal(invoice);
    }
    return (invoice.items || []).reduce(
      (sum, item) => sum + parseAmount(item.qty) * parseAmount(item.unitPrice),
      0
    );
  }

  function invoiceHours(invoice) {
    return (invoice.items || []).reduce((sum, item) => {
      const unit = String(item.unit || "").toLowerCase();
      if (!unit.startsWith("hod")) return sum;
      return sum + parseAmount(item.qty);
    }, 0);
  }

  function customerKey(customer = {}) {
    return [customer.name || "", customer.ico || "", customer.dic || ""].join("|");
  }

  function customerLabel(customer = {}) {
    return customer.name || customer.ico || "Bez názvu";
  }

  function getIssueParts(invoice) {
    return InvoiceFilters.getInvoiceIssueParts(invoice);
  }

  function matchesStatsFilter(invoice, filter) {
    if (!InvoiceFilters.matchesStatusFilter(invoice, filter.status || "all")) return false;

    if (filter.customerKey) {
      if (customerKey(invoice.customer || {}) !== filter.customerKey) return false;
    }

    const parts = getIssueParts(invoice);
    if (!parts) return false;

    if (filter.year && parts.year !== Number(filter.year)) return false;
    if (filter.quarter) {
      const q = Math.ceil(parts.month / 3);
      if (q !== Number(filter.quarter)) return false;
    }
    if (filter.month && parts.month !== Number(filter.month)) return false;
    return true;
  }

  function filterInvoices(invoices, filter) {
    return (invoices || []).filter((inv) => matchesStatsFilter(inv, filter || {}));
  }

  function emptyBucket() {
    return { count: 0, total: 0, hours: 0, resolved: 0, cancelled: 0, active: 0 };
  }

  function addToBucket(bucket, invoice) {
    const total = invoiceTotal(invoice);
    const hours = invoiceHours(invoice);
    bucket.count += 1;
    bucket.total += total;
    bucket.hours += hours;
    if (invoice.cancelled) bucket.cancelled += 1;
    else if (invoice.resolved) bucket.resolved += 1;
    else bucket.active += 1;
  }

  function summarize(invoices) {
    const summary = emptyBucket();
    invoices.forEach((inv) => addToBucket(summary, inv));
    summary.avgTotal = summary.count ? summary.total / summary.count : 0;
    return summary;
  }

  function seriesByYear(invoices) {
    const map = new Map();
    invoices.forEach((inv) => {
      const parts = getIssueParts(inv);
      if (!parts) return;
      if (!map.has(parts.year)) map.set(parts.year, emptyBucket());
      addToBucket(map.get(parts.year), inv);
    });
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, bucket]) => ({
        key: String(year),
        label: String(year),
        ...bucket,
      }));
  }

  function seriesByMonth(invoices, year) {
    const y = Number(year);
    const buckets = Array.from({ length: 12 }, (_, i) => ({
      key: `${y}-${String(i + 1).padStart(2, "0")}`,
      label: MONTH_NAMES_SHORT[i],
      fullLabel: `${MONTH_NAMES[i]} ${y}`,
      month: i + 1,
      ...emptyBucket(),
    }));

    invoices.forEach((inv) => {
      const parts = getIssueParts(inv);
      if (!parts || parts.year !== y) return;
      addToBucket(buckets[parts.month - 1], inv);
    });

    return buckets;
  }

  function seriesByQuarterMonths(invoices, year, quarter) {
    const months = seriesByMonth(invoices, year);
    const q = Number(quarter);
    const start = (q - 1) * 3;
    return months.slice(start, start + 3);
  }

  function seriesByCustomer(invoices) {
    const map = new Map();
    invoices.forEach((inv) => {
      const key = customerKey(inv.customer || {});
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: customerLabel(inv.customer || {}),
          ...emptyBucket(),
        });
      }
      addToBucket(map.get(key), inv);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  function chartSeries(invoices, filter) {
    const f = filter || {};
    if (f.year && f.month) {
      const all = seriesByMonth(invoices, f.year);
      return {
        mode: "month",
        title: `Obrat – ${MONTH_NAMES[Number(f.month) - 1]} ${f.year}`,
        points: all.filter((p) => p.month === Number(f.month)),
      };
    }
    if (f.year && f.quarter) {
      return {
        mode: "quarter",
        title: `Obrat – Q${f.quarter} ${f.year}`,
        points: seriesByQuarterMonths(invoices, f.year, f.quarter),
      };
    }
    if (f.year) {
      return {
        mode: "year-months",
        title: `Obrat po měsících – ${f.year}`,
        points: seriesByMonth(invoices, f.year),
      };
    }
    return {
      mode: "years",
      title: "Obrat po letech",
      points: seriesByYear(invoices),
    };
  }

  function availableYears(invoices) {
    return InvoiceFilters.getAvailableYears(invoices);
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("cs-CZ", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  function formatHours(value) {
    return Number(value || 0).toLocaleString("cs-CZ", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
  }

  return {
    MONTH_NAMES,
    MONTH_NAMES_SHORT,
    invoiceTotal,
    invoiceHours,
    customerKey,
    customerLabel,
    filterInvoices,
    summarize,
    seriesByYear,
    seriesByMonth,
    seriesByCustomer,
    chartSeries,
    availableYears,
    formatMoney,
    formatHours,
  };
})();
