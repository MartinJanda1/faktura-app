let allInvoices = [];
let revenueChart = null;
let customerChart = null;

const STATS_PREFS_KEY = "faktura-stats-prefs";

function isDarkTheme() {
  return document.documentElement.classList.contains("dark");
}

function chartColors() {
  const dark = isDarkTheme();
  return {
    text: dark ? "#cbd5e1" : "#525252",
    grid: dark ? "rgba(148, 163, 184, 0.18)" : "rgba(163, 163, 163, 0.35)",
    brand: "#00b5c8",
    brandFill: dark ? "rgba(0, 181, 200, 0.55)" : "rgba(0, 181, 200, 0.75)",
    palette: dark
      ? ["#2dd4bf", "#38bdf8", "#a78bfa", "#fbbf24", "#fb7185", "#4ade80"]
      : ["#0d9488", "#0284c7", "#7c3aed", "#d97706", "#e11d48", "#16a34a"],
  };
}

function loadStatsPrefs() {
  try {
    const raw = localStorage.getItem(STATS_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStatsPrefs(filter) {
  try {
    localStorage.setItem(STATS_PREFS_KEY, JSON.stringify(filter));
  } catch {
    // ignore
  }
}

function getFilterFromUi() {
  return {
    year: document.getElementById("stats-year").value || "",
    quarter: document.getElementById("stats-quarter").value || "",
    month: document.getElementById("stats-month").value || "",
    customerKey: document.getElementById("stats-customer").value || "",
    status: document.getElementById("stats-status").value || "all",
  };
}

function applyFilterToUi(filter) {
  if (!filter) return;
  const year = document.getElementById("stats-year");
  const quarter = document.getElementById("stats-quarter");
  const month = document.getElementById("stats-month");
  const customer = document.getElementById("stats-customer");
  const status = document.getElementById("stats-status");

  if (filter.year != null && [...year.options].some((o) => o.value === String(filter.year))) {
    year.value = String(filter.year);
  }
  syncPeriodControls();
  if (filter.quarter != null) quarter.value = String(filter.quarter);
  if (filter.month != null && [...month.options].some((o) => o.value === String(filter.month))) {
    month.value = String(filter.month);
  }
  if (filter.customerKey != null && [...customer.options].some((o) => o.value === filter.customerKey)) {
    customer.value = filter.customerKey;
  }
  if (filter.status) status.value = filter.status;
}

function fillSelect(select, placeholder, values, formatter) {
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = formatter(value);
    select.appendChild(option);
  });
  if (values.map(String).includes(current)) select.value = current;
}

function syncPeriodControls() {
  const year = document.getElementById("stats-year").value;
  const quarter = document.getElementById("stats-quarter");
  const month = document.getElementById("stats-month");
  const hasYear = Boolean(year);

  quarter.disabled = !hasYear;
  month.disabled = !hasYear;

  if (!hasYear) {
    quarter.value = "";
    month.value = "";
    return;
  }

  fillSelect(
    month,
    "Celý rok / měsíc",
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    (m) => InvoiceStats.MONTH_NAMES[m - 1]
  );
}

function populateFilterOptions() {
  const years = InvoiceStats.availableYears(allInvoices);
  const yearSelect = document.getElementById("stats-year");
  fillSelect(yearSelect, "Všechny roky", years, (y) => String(y));

  const prefs = loadStatsPrefs();
  const defaultYear = prefs?.year || String(years[0] || "");
  if (defaultYear && [...yearSelect.options].some((o) => o.value === defaultYear)) {
    yearSelect.value = defaultYear;
  }

  const customers = InvoiceFilters.buildCustomerOptions(allInvoices);
  const customerSelect = document.getElementById("stats-customer");
  const currentCustomer = customerSelect.value;
  customerSelect.innerHTML = `<option value="">Všichni odběratelé</option>`;
  customers.forEach((c) => {
    const option = document.createElement("option");
    option.value = InvoiceStats.customerKey(c);
    option.textContent = c.name || c.ico || "Bez názvu";
    customerSelect.appendChild(option);
  });
  if ([...customerSelect.options].some((o) => o.value === currentCustomer)) {
    customerSelect.value = currentCustomer;
  }

  syncPeriodControls();
  if (prefs) applyFilterToUi(prefs);
}

function destroyCharts() {
  if (revenueChart) {
    revenueChart.destroy();
    revenueChart = null;
  }
  if (customerChart) {
    customerChart.destroy();
    customerChart = null;
  }
}

function renderKpis(summary) {
  document.getElementById("kpi-count").textContent = String(summary.count);
  document.getElementById("kpi-total").textContent = `${InvoiceStats.formatMoney(summary.total)} Kč`;
  document.getElementById("kpi-hours").textContent = `${InvoiceStats.formatHours(summary.hours)} h`;
  document.getElementById("kpi-avg").textContent = summary.count
    ? `${InvoiceStats.formatMoney(summary.avgTotal)} Kč`
    : "—";
  document.getElementById("kpi-status").textContent =
    summary.count === 0
      ? "—"
      : `${summary.resolved} vyřízených · ${summary.active} otevřených · ${summary.cancelled} storen`;
}

function renderTable(points) {
  const tbody = document.getElementById("stats-table-body");
  if (!points.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-neutral-500">Žádná data pro zvolený filtr</td></tr>`;
    return;
  }

  tbody.innerHTML = points
    .map(
      (p) => `
      <tr class="border-b border-neutral-100">
        <td class="px-4 py-2.5 font-medium text-neutral-800">${escapeHtml(p.fullLabel || p.label)}</td>
        <td class="px-4 py-2.5 text-right tabular-nums text-neutral-700">${p.count}</td>
        <td class="px-4 py-2.5 text-right tabular-nums text-neutral-700">${InvoiceStats.formatHours(p.hours)}</td>
        <td class="px-4 py-2.5 text-right tabular-nums font-medium text-neutral-900">${InvoiceStats.formatMoney(p.total)} Kč</td>
      </tr>`
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRevenueChart(series) {
  const canvas = document.getElementById("chart-revenue");
  const colors = chartColors();
  const labels = series.points.map((p) => p.label);
  const data = series.points.map((p) => Math.round(p.total));

  document.getElementById("chart-revenue-title").textContent = series.title;

  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Obrat (Kč)",
          data,
          backgroundColor: colors.brandFill,
          borderColor: colors.brand,
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: series.mode === "years" ? 48 : 36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const point = series.points[ctx.dataIndex];
              return [
                `Obrat: ${InvoiceStats.formatMoney(ctx.parsed.y)} Kč`,
                `Faktur: ${point?.count ?? 0}`,
                `Hodin: ${InvoiceStats.formatHours(point?.hours ?? 0)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: colors.text },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: colors.text,
            callback: (v) => InvoiceStats.formatMoney(v),
          },
          grid: { color: colors.grid },
        },
      },
    },
  });
}

function renderCustomerChart(customers) {
  const canvas = document.getElementById("chart-customers");
  const empty = document.getElementById("chart-customers-empty");
  const colors = chartColors();

  if (!customers.length) {
    if (customerChart) {
      customerChart.destroy();
      customerChart = null;
    }
    canvas.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  canvas.classList.remove("hidden");
  empty.classList.add("hidden");

  if (customerChart) customerChart.destroy();
  customerChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: customers.map((c) => c.label),
      datasets: [
        {
          data: customers.map((c) => Math.round(c.total)),
          backgroundColor: customers.map((_, i) => colors.palette[i % colors.palette.length]),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: colors.text, boxWidth: 12, padding: 14 },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const c = customers[ctx.dataIndex];
              const pct = c && customers.reduce((s, x) => s + x.total, 0)
                ? Math.round((c.total / customers.reduce((s, x) => s + x.total, 0)) * 100)
                : 0;
              return `${ctx.label}: ${InvoiceStats.formatMoney(ctx.parsed)} Kč (${pct} %)`;
            },
          },
        },
      },
    },
  });
}

function renderStats() {
  const filter = getFilterFromUi();
  saveStatsPrefs(filter);

  const filtered = InvoiceStats.filterInvoices(allInvoices, filter);
  const summary = InvoiceStats.summarize(filtered);
  const series = InvoiceStats.chartSeries(filtered, filter);
  const customers = InvoiceStats.seriesByCustomer(filtered);

  renderKpis(summary);
  renderRevenueChart(series);
  renderCustomerChart(customers);
  renderTable(series.points);

  document.getElementById("stats-result-count").textContent =
    filtered.length === allInvoices.length
      ? `${allInvoices.length} faktur celkem`
      : `${filtered.length} z ${allInvoices.length} faktur`;
}

function onPeriodChange(source) {
  const quarter = document.getElementById("stats-quarter");
  const month = document.getElementById("stats-month");
  if (source === "quarter" && quarter.value) month.value = "";
  if (source === "month" && month.value) quarter.value = "";
  renderStats();
}

function initThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  const apply = (isDark) => {
    document.documentElement.classList.toggle("dark", isDark);
    toggle.setAttribute("aria-checked", isDark ? "true" : "false");
  };

  try {
    apply(localStorage.getItem("faktura-theme") === "dark");
  } catch {
    apply(false);
  }

  toggle.addEventListener("click", () => {
    const isDark = !document.documentElement.classList.contains("dark");
    apply(isDark);
    try {
      localStorage.setItem("faktura-theme", isDark ? "dark" : "light");
    } catch {
      // ignore
    }
    renderStats();
  });
}

function bindFilters() {
  document.getElementById("stats-year").addEventListener("change", () => {
    syncPeriodControls();
    renderStats();
  });
  document.getElementById("stats-quarter").addEventListener("change", () => onPeriodChange("quarter"));
  document.getElementById("stats-month").addEventListener("change", () => onPeriodChange("month"));
  document.getElementById("stats-customer").addEventListener("change", renderStats);
  document.getElementById("stats-status").addEventListener("change", renderStats);
  document.getElementById("stats-reset").addEventListener("click", () => {
    const years = InvoiceStats.availableYears(allInvoices);
    document.getElementById("stats-year").value = years[0] ? String(years[0]) : "";
    document.getElementById("stats-quarter").value = "";
    document.getElementById("stats-month").value = "";
    document.getElementById("stats-customer").value = "";
    document.getElementById("stats-status").value = "all";
    syncPeriodControls();
    renderStats();
  });
}

async function init() {
  AppMeta.mount();
  MdiIcons.mount();
  initThemeToggle();
  bindFilters();

  try {
    allInvoices = await FakturaStorage.readInvoices();
    populateFilterOptions();
    renderStats();
  } catch (err) {
    document.getElementById("stats-error").textContent =
      err.message || "Nepodařilo se načíst faktury.";
    document.getElementById("stats-error").classList.remove("hidden");
  }
}

init();
