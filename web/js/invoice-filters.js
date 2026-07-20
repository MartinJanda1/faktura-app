const InvoiceFilters = (() => {
  const MONTH_NAMES = [
    "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
  ];

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function customerKey(customer = {}) {
    return [customer.name || "", customer.ico || "", customer.dic || ""].join("|");
  }

  function buildCustomerOptions(invoices) {
    const map = new Map();
    invoices.forEach((invoice) => {
      const customer = invoice.customer || {};
      if (!customer.name && !customer.ico && !customer.dic) return;
      const key = customerKey(customer);
      if (!map.has(key)) {
        map.set(key, {
          name: customer.name || "",
          ico: customer.ico || "",
          dic: customer.dic || "",
        });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      normalizeText(a.name).localeCompare(normalizeText(b.name), "cs")
    );
  }

  function customerMatchesQuery(customer, query) {
    const q = normalizeText(query);
    if (!q) return true;
    return [customer.name, customer.ico, customer.dic].some((field) =>
      normalizeText(field).includes(q)
    );
  }

  function customerEquals(a, b) {
    return customerKey(a) === customerKey(b);
  }

  function getInvoiceIssueParts(invoice) {
    const iso = invoice.dates?.issue;
    if (!iso) return null;
    const [year, month, day] = iso.split("-").map(Number);
    if (!year || !month || !day) return null;
    return { year, month, day };
  }

  function matchesCustomerFilter(invoice, customerFilter) {
    if (customerFilter.selected) {
      return customerEquals(invoice.customer || {}, customerFilter.selected);
    }
    const query = customerFilter.query.trim();
    if (!query) return true;
    return customerMatchesQuery(invoice.customer || {}, query);
  }

  function matchesDateFilter(invoice, dateFilter) {
    if (!dateFilter.year && !dateFilter.month && !dateFilter.day) return true;

    const parts = getInvoiceIssueParts(invoice);
    if (!parts) return false;

    if (dateFilter.year && parts.year !== Number(dateFilter.year)) return false;
    if (dateFilter.month && parts.month !== Number(dateFilter.month)) return false;
    if (dateFilter.day && parts.day !== Number(dateFilter.day)) return false;
    return true;
  }

  function hasCustomerFilter(customerFilter) {
    return Boolean(customerFilter.selected || customerFilter.query.trim());
  }

  function hasDateFilter(dateFilter) {
    return Boolean(dateFilter.year || dateFilter.month || dateFilter.day);
  }

  function matchesStatusFilter(invoice, statusFilter) {
    const status = statusFilter || "active";
    if (status === "all") return true;
    if (status === "cancelled") return Boolean(invoice.cancelled);
    if (status === "resolved") return Boolean(invoice.resolved) && !invoice.cancelled;
    // active / platné — nevyřízené a nestornované
    return !invoice.cancelled && !invoice.resolved;
  }

  function hasStatusFilter(statusFilter) {
    return Boolean(statusFilter && statusFilter !== "all");
  }

  function hasAnyFilter(customerFilter, dateFilter, statusFilter) {
    return hasCustomerFilter(customerFilter) || hasDateFilter(dateFilter) || hasStatusFilter(statusFilter);
  }

  function filterInvoices(invoices, customerFilter, dateFilter, statusFilter = "all") {
    return invoices.filter(
      (invoice) =>
        matchesCustomerFilter(invoice, customerFilter) &&
        matchesDateFilter(invoice, dateFilter) &&
        matchesStatusFilter(invoice, statusFilter)
    );
  }

  function getAvailableYears(invoices) {
    const years = new Set();
    invoices.forEach((invoice) => {
      const parts = getInvoiceIssueParts(invoice);
      if (parts) years.add(parts.year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }

  function getAvailableMonths(invoices, year) {
    const months = new Set();
    invoices.forEach((invoice) => {
      const parts = getInvoiceIssueParts(invoice);
      if (parts && parts.year === Number(year)) months.add(parts.month);
    });
    return Array.from(months).sort((a, b) => a - b);
  }

  function getAvailableDays(invoices, year, month) {
    const days = new Set();
    invoices.forEach((invoice) => {
      const parts = getInvoiceIssueParts(invoice);
      if (parts && parts.year === Number(year) && parts.month === Number(month)) {
        days.add(parts.day);
      }
    });
    return Array.from(days).sort((a, b) => a - b);
  }

  function getSuggestions(customerOptions, query, limit = 8) {
    const q = query.trim();
    if (!q) return customerOptions.slice(0, limit);
    return customerOptions.filter((customer) => customerMatchesQuery(customer, q)).slice(0, limit);
  }

  function cloneCustomerFilter(customerFilter) {
    return {
      query: customerFilter.query || "",
      selected: customerFilter.selected ? { ...customerFilter.selected } : null,
    };
  }

  function cloneDateFilter(dateFilter) {
    return {
      year: dateFilter.year || "",
      month: dateFilter.month || "",
      day: dateFilter.day || "",
    };
  }

  return {
    MONTH_NAMES,
    normalizeText,
    buildCustomerOptions,
    customerMatchesQuery,
    customerEquals,
    getInvoiceIssueParts,
    matchesCustomerFilter,
    matchesDateFilter,
    matchesStatusFilter,
    hasCustomerFilter,
    hasDateFilter,
    hasStatusFilter,
    hasAnyFilter,
    filterInvoices,
    getAvailableYears,
    getAvailableMonths,
    getAvailableDays,
    getSuggestions,
    cloneCustomerFilter,
    cloneDateFilter,
  };
})();
