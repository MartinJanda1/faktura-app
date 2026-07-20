let invoicePendingDelete = null;
let allInvoices = [];
let customerOptions = [];
let listFilters = null;
let exportFilters = null;
let sortState = { column: null, direction: "asc" };
let selectedIds = new Set();
let visibleIds = [];

const SORT_COLUMNS = ["number", "customer", "issue", "total"];

let exportFileExt = "json";

async function updateStorageHint() {
  await updateExportImportUi();
}

async function updateExportImportUi(status) {
  const resolved = status || (await FakturaStorage.getStorageStatus());
  const isPg = resolved.storage === "postgres";
  exportFileExt = isPg ? "sql" : "json";

  const importLabel = document.getElementById("import-label");
  if (importLabel) {
    const textNode = [...importLabel.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    if (textNode) {
      textNode.textContent = isPg ? "Importovat (.sql / .json) " : "Importovat";
    }
  }

  const importInput = document.getElementById("import-file");
  if (importInput) {
    importInput.accept = isPg
      ? ".sql,.json,application/json,application/sql,text/plain"
      : ".json,application/json,.txt,text/plain";
  }

  const exportConfirm = document.getElementById("export-modal-confirm");
  if (exportConfirm) {
    exportConfirm.textContent = isPg ? "Exportovat .sql" : "Exportovat .json";
  }

  const exportDesc = document.getElementById("export-modal-desc");
  if (exportDesc) {
    exportDesc.textContent = isPg
      ? "Vyber filtry — exportují se jen odpovídající faktury do jednoho .sql souboru (INSERT skript)."
      : "Vyber filtry — exportují se jen odpovídající faktury do jednoho .json souboru.";
  }
}

async function deletedInvoicesMessage(count) {
  const status = await FakturaStorage.getStorageStatus();
  if (status.storage === "postgres") {
    return count === 1
      ? "1 faktura smazána z databáze."
      : `${count} faktur smazáno z databáze.`;
  }
  return count === 1
    ? "1 faktura smazána ze složky data/invoices."
    : `${count} faktur smazáno ze složky data/invoices.`;
}

async function importedInvoicesMessage(count) {
  const status = await FakturaStorage.getStorageStatus();
  if (status.storage === "postgres") {
    return count === 1
      ? "1 faktura importována do databáze."
      : `${count} faktur importováno do databáze.`;
  }
  return count === 1
    ? "1 faktura importována do data/invoices."
    : `${count} faktur importováno do data/invoices.`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCustomerMeta(customer) {
  const parts = [];
  if (customer.ico) parts.push(`<span>IČ: ${escapeHtml(customer.ico)}</span>`);
  if (customer.dic) parts.push(`<span>DIČ: ${escapeHtml(customer.dic)}</span>`);
  return parts.join("");
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
  select.value = values.map(String).includes(current) ? current : "";
}

function createFilterController(config) {
  const { ids, onChange, defaultStatus = "all" } = config;
  let customerFilter = { query: "", selected: null };
  let dateFilter = { year: "", month: "", day: "" };
  let statusFilter = defaultStatus;
  let suggestionIndex = -1;

  const els = {
    customer: document.getElementById(ids.customer),
    clearCustomer: document.getElementById(ids.clearCustomer),
    suggestions: document.getElementById(ids.suggestions),
    year: document.getElementById(ids.year),
    month: document.getElementById(ids.month),
    day: document.getElementById(ids.day),
    clearDates: document.getElementById(ids.clearDates),
    status: ids.status ? document.getElementById(ids.status) : null,
  };

  function getFiltered() {
    return InvoiceFilters.filterInvoices(allInvoices, customerFilter, dateFilter, statusFilter);
  }

  function updateDateSelects() {
    fillSelect(els.year, "Rok", InvoiceFilters.getAvailableYears(allInvoices), (y) => y);

    const hasYear = Boolean(dateFilter.year);
    els.month.disabled = !hasYear;
    els.day.disabled = !hasYear || !dateFilter.month;

    if (!hasYear) {
      dateFilter.month = "";
      dateFilter.day = "";
      els.month.innerHTML = '<option value="">Měsíc</option>';
      els.day.innerHTML = '<option value="">Den</option>';
    } else {
      fillSelect(
        els.month,
        "Měsíc",
        InvoiceFilters.getAvailableMonths(allInvoices, dateFilter.year),
        (m) => InvoiceFilters.MONTH_NAMES[m - 1]
      );
      dateFilter.month = els.month.value;

      if (!dateFilter.month) {
        dateFilter.day = "";
        els.day.innerHTML = '<option value="">Den</option>';
      } else {
        fillSelect(
          els.day,
          "Den",
          InvoiceFilters.getAvailableDays(allInvoices, dateFilter.year, dateFilter.month),
          (d) => d
        );
        dateFilter.day = els.day.value;
      }
    }

    els.year.value = dateFilter.year;
    if (hasYear) els.month.value = dateFilter.month;
    if (hasYear && dateFilter.month) els.day.value = dateFilter.day;

    els.clearDates.classList.toggle("hidden", !InvoiceFilters.hasDateFilter(dateFilter));
  }

  function closeSuggestions() {
    els.suggestions.classList.add("hidden");
    els.suggestions.innerHTML = "";
    els.customer.setAttribute("aria-expanded", "false");
    suggestionIndex = -1;
  }

  function renderSuggestions() {
    const suggestions = InvoiceFilters.getSuggestions(customerOptions, els.customer.value);
    if (!suggestions.length) {
      closeSuggestions();
      return;
    }

    els.suggestions.innerHTML = suggestions
      .map((customer, index) => {
        const name = customer.name || "Bez názvu";
        const meta = formatCustomerMeta(customer);
        return `
          <li class="filter-suggestion${index === suggestionIndex ? " is-active" : ""}" role="option" data-index="${index}">
            <div class="filter-suggestion-name">${escapeHtml(name)}</div>
            ${meta ? `<div class="filter-suggestion-meta">${meta}</div>` : ""}
          </li>
        `;
      })
      .join("");

    els.suggestions.classList.remove("hidden");
    els.customer.setAttribute("aria-expanded", "true");
  }

  function applySuggestion(index) {
    const suggestions = InvoiceFilters.getSuggestions(customerOptions, els.customer.value);
    const customer = suggestions[index];
    if (!customer) return;

    customerFilter.selected = customer;
    customerFilter.query = "";
    els.customer.value = customer.name || customer.ico || customer.dic || "";
    closeSuggestions();
    els.clearCustomer.classList.toggle("hidden", !InvoiceFilters.hasCustomerFilter(customerFilter));
    onChange();
  }

  function syncInputsFromState() {
    if (customerFilter.selected) {
      els.customer.value =
        customerFilter.selected.name ||
        customerFilter.selected.ico ||
        customerFilter.selected.dic ||
        "";
    } else {
      els.customer.value = customerFilter.query;
    }
    els.clearCustomer.classList.toggle("hidden", !InvoiceFilters.hasCustomerFilter(customerFilter));
    updateDateSelects();
  }

  function bind() {
    els.customer.addEventListener("input", () => {
      customerFilter.selected = null;
      customerFilter.query = els.customer.value;
      suggestionIndex = -1;
      els.clearCustomer.classList.remove("hidden");
      renderSuggestions();
      onChange();
    });

    els.customer.addEventListener("focus", () => {
      suggestionIndex = -1;
      renderSuggestions();
    });

    els.customer.addEventListener("keydown", (e) => {
      const suggestions = InvoiceFilters.getSuggestions(customerOptions, els.customer.value);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!suggestions.length) return;
        suggestionIndex = Math.min(suggestionIndex + 1, suggestions.length - 1);
        renderSuggestions();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        suggestionIndex = Math.max(suggestionIndex - 1, 0);
        renderSuggestions();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (suggestionIndex >= 0) applySuggestion(suggestionIndex);
        else closeSuggestions();
      } else if (e.key === "Escape") {
        closeSuggestions();
      }
    });

    els.suggestions.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const item = e.target.closest(".filter-suggestion");
      if (item) applySuggestion(Number(item.dataset.index));
    });

    els.clearCustomer.addEventListener("click", () => {
      customerFilter = { query: "", selected: null };
      els.customer.value = "";
      closeSuggestions();
      els.clearCustomer.classList.add("hidden");
      onChange();
    });

    els.clearDates.addEventListener("click", () => {
      dateFilter = { year: "", month: "", day: "" };
      updateDateSelects();
      onChange();
    });

    els.year.addEventListener("change", () => {
      dateFilter.year = els.year.value;
      dateFilter.month = "";
      dateFilter.day = "";
      updateDateSelects();
      onChange();
    });

    els.month.addEventListener("change", () => {
      dateFilter.month = els.month.value;
      dateFilter.day = "";
      updateDateSelects();
      onChange();
    });

    els.day.addEventListener("change", () => {
      dateFilter.day = els.day.value;
      updateDateSelects();
      onChange();
    });

    if (els.status) {
      els.status.value = statusFilter;
      els.status.addEventListener("change", () => {
        statusFilter = els.status.value || defaultStatus;
        onChange();
      });
    }
  }

  return {
    bind,
    getFiltered,
    getState() {
      return {
        customerFilter: InvoiceFilters.cloneCustomerFilter(customerFilter),
        dateFilter: InvoiceFilters.cloneDateFilter(dateFilter),
        statusFilter,
      };
    },
    closeSuggestions,
    updateDateSelects,
    syncFrom(source) {
      customerFilter = InvoiceFilters.cloneCustomerFilter(source.customerFilter);
      dateFilter = InvoiceFilters.cloneDateFilter(source.dateFilter);
      if (source.statusFilter) statusFilter = source.statusFilter;
      syncInputsFromState();
      onChange();
    },
    reset() {
      customerFilter = { query: "", selected: null };
      dateFilter = { year: "", month: "", day: "" };
      statusFilter = defaultStatus;
      els.customer.value = "";
      if (els.status) els.status.value = statusFilter;
      closeSuggestions();
      els.clearCustomer.classList.add("hidden");
      updateDateSelects();
      onChange();
    },
    clearAll() {
      customerFilter = { query: "", selected: null };
      dateFilter = { year: "", month: "", day: "" };
      statusFilter = defaultStatus;
      els.customer.value = "";
      if (els.status) els.status.value = statusFilter;
      closeSuggestions();
      els.clearCustomer.classList.add("hidden");
      updateDateSelects();
      onChange();
    },
  };
}

function updateListFilterCount() {
  const countEl = document.getElementById("filter-result-count");
  const filtered = listFilters.getFiltered();
  const total = allInvoices.length;
  const { customerFilter, dateFilter, statusFilter } = listFilters.getState();
  const hasFilter = InvoiceFilters.hasAnyFilter(customerFilter, dateFilter, statusFilter);

  if (!hasFilter) {
    countEl.textContent = total ? `${total} faktur celkem` : "";
  } else {
    countEl.textContent = `${filtered.length} z ${total} faktur`;
  }
}

function updateExportButtonState() {
  const btn = document.getElementById("btn-export");
  const hasInvoices = allInvoices.length > 0;
  btn.disabled = !hasInvoices;
}

function updateExportModalCount() {
  const count = exportFilters.getFiltered().length;
  const countEl = document.getElementById("export-filter-count");
  const confirmBtn = document.getElementById("export-modal-confirm");

  countEl.textContent =
    count === 0
      ? "Žádná faktura neodpovídá zvoleným filtrům"
      : count === 1
        ? "1 faktura k exportu"
        : `${count} faktur k exportu`;

  confirmBtn.disabled = count === 0;
}

function openExportModal() {
  exportFilters.syncFrom(listFilters.getState());
  document.getElementById("export-modal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  document.getElementById("export-filter-customer").focus();
}

function closeExportModal() {
  exportFilters.closeSuggestions();
  document.getElementById("export-modal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

function confirmExport() {
  const invoices = exportFilters.getFiltered();
  if (!invoices.length) return;

  FakturaStorage.downloadInvoicesExport(invoices)
    .then(async () => {
      const ext = exportFileExt;
      showToast(
        invoices.length === 1
          ? `Faktura exportována do .${ext} souboru.`
          : `${invoices.length} faktur exportováno do jednoho .${ext} souboru.`
      );
      closeExportModal();
    })
    .catch((err) => {
      alert(err.message || "Export se nezdařil.");
    });
}

function sortInvoices(invoices) {
  if (!sortState.column) return invoices;

  const { column, direction } = sortState;
  const factor = direction === "asc" ? 1 : -1;

  return [...invoices].sort((a, b) => {
    let cmp = 0;

    if (column === "number") {
      cmp = String(a.invoiceNumber || "").localeCompare(String(b.invoiceNumber || ""), "cs", {
        numeric: true,
      });
    } else if (column === "customer") {
      cmp = String(a.customer?.name || "").localeCompare(String(b.customer?.name || ""), "cs");
    } else if (column === "issue") {
      cmp = String(a.dates?.issue || "").localeCompare(String(b.dates?.issue || ""));
    } else if (column === "total") {
      cmp = InvoiceModel.calculateTotal(a) - InvoiceModel.calculateTotal(b);
    }

    return cmp * factor;
  });
}

function updateSortHeaderUi() {
  document.querySelectorAll(".sort-btn[data-sort]").forEach((btn) => {
    const isActive = btn.dataset.sort === sortState.column;
    btn.classList.toggle("is-sorted-asc", isActive && sortState.direction === "asc");
    btn.classList.toggle("is-sorted-desc", isActive && sortState.direction === "desc");
    btn.setAttribute("aria-sort", isActive ? sortState.direction + "ending" : "none");
  });
}

function handleSortClick(column) {
  if (!SORT_COLUMNS.includes(column)) return;

  if (sortState.column === column) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.column = column;
    sortState.direction = column === "issue" || column === "total" ? "desc" : "asc";
  }

  updateSortHeaderUi();
  renderInvoiceRows();
}

function initSort() {
  document.querySelector(".invoice-list-table thead")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".sort-btn[data-sort]");
    if (!btn) return;
    handleSortClick(btn.dataset.sort);
  });
  updateSortHeaderUi();
}

function renderInvoiceRows() {
  const tbody = document.getElementById("invoice-list");
  const listWrap = document.getElementById("invoice-list-wrap");
  const filterEmpty = document.getElementById("filter-empty-state");
  const invoices = sortInvoices(listFilters.getFiltered());

  if (!invoices.length && allInvoices.length > 0) {
    tbody.innerHTML = "";
    listWrap.classList.add("hidden");
    filterEmpty.classList.remove("hidden");
    visibleIds = [];
    updateBulkUi();
    return;
  }

  filterEmpty.classList.add("hidden");
  listWrap.classList.remove("hidden");

  visibleIds = invoices.map((invoice) => invoice.id);

  tbody.innerHTML = invoices
    .map((invoice) => {
      const summary = InvoiceModel.getSummary(invoice);
      const fileLabel = FakturaStorage.getInvoiceFileLabel(invoice);
      const customer = invoice.customer || {};
      const customerMeta = [customer.ico, customer.dic].filter(Boolean).join(" · ");
      const checked = selectedIds.has(summary.id) ? "checked" : "";
      const canDelete = InvoiceNumbering.canDeleteInvoice(invoice, allInvoices);
      const deleteReason = InvoiceNumbering.deleteBlockReason(invoice, allInvoices);
      const cancelled = Boolean(invoice.cancelled);
      const resolved = Boolean(invoice.resolved) && !cancelled;

      let rowClass = "border-b border-neutral-100 hover:bg-neutral-50";
      if (cancelled) {
        rowClass = "invoice-row-cancelled border-b border-neutral-200 bg-neutral-50/80 text-neutral-500";
      } else if (resolved) {
        rowClass = "border-b border-green-100 bg-green-50 hover:bg-green-100";
      }

      const statusBadge = cancelled
        ? `<span class="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Storno</span>`
        : resolved
          ? `<span class="ml-2 rounded bg-green-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">Vyřízeno</span>`
          : "";

      return `
        <tr class="${rowClass}" data-id="${summary.id}">
          <td class="px-5 py-4">
            <input type="checkbox" class="row-select h-4 w-4 cursor-pointer accent-brand align-middle" data-id="${summary.id}" aria-label="Vybrat fakturu ${escapeHtml(summary.invoiceNumber)}" ${checked} ${cancelled ? "disabled" : ""} />
          </td>
          <td class="px-5 py-4 font-medium text-neutral-900">
            <span class="${cancelled ? "line-through" : ""}">${escapeHtml(summary.invoiceNumber)}</span>${statusBadge}
          </td>
          <td class="px-5 py-4 text-neutral-700 ${cancelled ? "line-through" : ""}">
            <div>${escapeHtml(summary.customerName)}</div>
            ${customerMeta ? `<div class="mt-0.5 text-xs text-neutral-400">${escapeHtml(customerMeta)}</div>` : ""}
          </td>
          <td class="px-5 py-4 text-neutral-700 ${cancelled ? "line-through" : ""}">${escapeHtml(summary.issueDate)}</td>
          <td class="whitespace-nowrap px-5 py-4 text-right font-medium tabular-nums text-neutral-900 ${cancelled ? "line-through" : ""}">${escapeHtml(summary.total)} Kč</td>
          <td class="px-5 py-4 text-neutral-500">
            <div>${escapeHtml(summary.savedAt)}</div>
            <div class="mt-0.5 text-xs text-neutral-400">${escapeHtml(fileLabel)}</div>
          </td>
          <td class="px-5 py-4">
            <div class="flex justify-end gap-2">
              <a href="invoice.html?id=${encodeURIComponent(summary.id)}" class="btn-icon" title="Otevřít" aria-label="Otevřít fakturu">
                ${MdiIcons.svg("pencilOutline")}
              </a>
              <a href="invoice.html?copy=${encodeURIComponent(summary.id)}" class="btn-icon btn-icon-copy ${cancelled ? "btn-icon-disabled pointer-events-none" : ""}" title="Kopírovat fakturu" aria-label="Kopírovat fakturu" ${cancelled ? 'tabindex="-1" aria-disabled="true"' : ""}>
                ${MdiIcons.svg("fileDocumentMultipleOutline")}
              </a>
              <a href="invoice.html?id=${encodeURIComponent(summary.id)}&pdf=1" class="btn-icon btn-icon-pdf" title="Stáhnout PDF" aria-label="Stáhnout PDF">
                ${MdiIcons.svg("filePdfBox")}
              </a>
              <button type="button" class="btn-icon btn-resolve ${resolved ? "btn-icon-resolved" : ""} ${cancelled ? "btn-icon-disabled" : ""}" data-id="${summary.id}" data-resolved="${resolved ? "1" : "0"}" title="${cancelled ? "Stornovanou fakturu nelze označit jako vyřízenou" : resolved ? "Zrušit vyřízeno" : "Označit jako vyřízenou"}" aria-label="${cancelled ? "Stornovanou fakturu nelze označit jako vyřízenou" : resolved ? "Zrušit vyřízeno" : "Označit jako vyřízenou"}" ${cancelled ? "disabled" : ""}>
                ${MdiIcons.svg("checkCircle")}
              </button>
              <button type="button" class="btn-icon btn-cancel ${cancelled ? "btn-icon-cancelled" : ""}" data-id="${summary.id}" data-cancelled="${cancelled ? "1" : "0"}" title="${cancelled ? "Zrušit storno" : "Stornovat fakturu"}" aria-label="${cancelled ? "Zrušit storno" : "Stornovat fakturu"}">
                ${MdiIcons.svg("cancel")}
              </button>
              <button type="button" class="btn-icon btn-icon-danger btn-delete ${canDelete ? "" : "btn-icon-disabled"}" data-id="${summary.id}" title="${canDelete ? "Smazat" : deleteReason}" aria-label="${canDelete ? "Smazat fakturu" : deleteReason}" ${canDelete ? "" : "disabled"}>
                ${MdiIcons.svg("deleteOutline")}
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  updateBulkUi();
}

function updateBulkUi() {
  const bar = document.getElementById("bulk-actions");
  const count = document.getElementById("bulk-count");
  const selectAll = document.getElementById("select-all");

  const total = selectedIds.size;

  if (bar) bar.classList.toggle("hidden", total === 0);
  if (bar) bar.classList.toggle("flex", total > 0);

  if (count) {
    count.textContent =
      total === 1 ? "1 faktura označena" : `${total} faktur označeno`;
  }

  if (selectAll) {
    const visibleSelected = visibleIds.filter((id) => selectedIds.has(id)).length;
    selectAll.checked = visibleIds.length > 0 && visibleSelected === visibleIds.length;
    selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visibleIds.length;
  }
}

function clearSelection() {
  selectedIds = new Set();
  document.querySelectorAll(".row-select").forEach((cb) => {
    cb.checked = false;
  });
  updateBulkUi();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add("hidden"), 2800);
}

function showLoadError(err) {
  const message = err?.message || "Nepodařilo se načíst data.";
  const banner = document.getElementById("server-error");
  if (banner) {
    banner.textContent = message;
    banner.classList.remove("hidden");
  } else {
    alert(message);
  }
}

const NEW_INVOICE_SETUP_KEY = "faktura-new-invoice-setup";
const PARTY_ARES = "__ares__";

function navigateToNewInvoice(layout) {
  const params = new URLSearchParams({ mode: "empty" });
  params.set("layout", InvoiceLayouts.normalizeLayoutId(layout));
  window.location.href = `invoice.html?${params}`;
}

let selectedNewInvoiceLayout = InvoiceLayouts.DEFAULT_LAYOUT;
let partiesCache = { suppliers: [], customers: [] };
let supplierSelection = { id: "", record: null };
let customerSelection = { id: "", record: null };

function showNewInvoiceError(message) {
  const el = document.getElementById("new-invoice-error");
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove("hidden");
  } else {
    el.textContent = "";
    el.classList.add("hidden");
  }
}

function renderLayoutPicker() {
  const picker = document.getElementById("layout-picker");
  if (!picker) return;

  picker.innerHTML = InvoiceLayouts.listLayouts()
    .map(
      (layout) => `
        <button
          type="button"
          class="layout-option${layout.id === selectedNewInvoiceLayout ? " is-selected" : ""}"
          data-layout-id="${layout.id}"
          role="radio"
          aria-checked="${layout.id === selectedNewInvoiceLayout}"
        >
          <div class="layout-option-name">${layout.name}</div>
          <div class="layout-option-desc">${layout.description}</div>
        </button>
      `
    )
    .join("");

  picker.querySelectorAll(".layout-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedNewInvoiceLayout = btn.dataset.layoutId;
      renderLayoutPicker();
    });
  });
}

function renderPartySelect(selectEl, items, emptyLabel) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = [
    `<option value="">${emptyLabel}</option>`,
    `<option value="${PARTY_ARES}">+ Načíst podle IČO (ARES)</option>`,
    ...items.map(
      (item) => `<option value="${item.id}">${escapeHtml(item.label || item.supplier?.name || item.customer?.name || item.id)}</option>`
    ),
  ].join("");

  if (current && [...selectEl.options].some((opt) => opt.value === current)) {
    selectEl.value = current;
  }
}

function findPartyRecord(type, id) {
  const list = type === "supplier" ? partiesCache.suppliers : partiesCache.customers;
  return list.find((item) => item.id === id) || null;
}

function updatePartyPreview(type) {
  const isSupplier = type === "supplier";
  const select = document.getElementById(isSupplier ? "new-supplier-select" : "new-customer-select");
  const aresBox = document.getElementById(isSupplier ? "new-supplier-ares" : "new-customer-ares");
  const preview = document.getElementById(isSupplier ? "new-supplier-preview" : "new-customer-preview");
  const selection = isSupplier ? supplierSelection : customerSelection;

  if (!select) return;

  selection.id = select.value;
  selection.record = selection.id && selection.id !== PARTY_ARES ? findPartyRecord(type, selection.id) : null;

  aresBox?.classList.toggle("hidden", selection.id !== PARTY_ARES);

  if (selection.record) {
    const data = isSupplier ? selection.record.supplier : selection.record.customer;
    preview.textContent = [data?.name, data?.address, data?.city, data?.ico ? `IČ ${data.ico}` : ""]
      .filter(Boolean)
      .join(" · ");
    preview.classList.remove("hidden");
  } else if (selection.id === PARTY_ARES) {
    preview.textContent = "Zadej IČO a načti údaje z ARES.";
    preview.classList.remove("hidden");
  } else {
    preview.textContent = "";
    preview.classList.add("hidden");
  }
}

function syncQrCheckboxState() {
  const method = document.getElementById("new-payment-method")?.value || "Převodem";
  const qr = document.getElementById("new-include-qr");
  const label = qr?.closest("label");
  const enabled = method === "Převodem";
  if (qr) {
    qr.disabled = !enabled;
    if (!enabled) qr.checked = false;
  }
  label?.classList.toggle("opacity-50", !enabled);
  label?.classList.toggle("cursor-not-allowed", !enabled);
}

async function loadPartiesForModal() {
  partiesCache = await FakturaParties.listParties();
  if (!Array.isArray(partiesCache.suppliers)) partiesCache.suppliers = [];
  if (!Array.isArray(partiesCache.customers)) partiesCache.customers = [];
}

function applyDefaultPartySelections() {
  const supplierSelect = document.getElementById("new-supplier-select");
  const customerSelect = document.getElementById("new-customer-select");

  if (partiesCache.suppliers.length === 1) {
    supplierSelect.value = partiesCache.suppliers[0].id;
  } else if (partiesCache.suppliers.length === 0) {
    supplierSelect.value = PARTY_ARES;
  } else {
    supplierSelect.value = "";
  }

  if (partiesCache.customers.length === 1) {
    customerSelect.value = partiesCache.customers[0].id;
  } else if (partiesCache.customers.length === 0) {
    customerSelect.value = PARTY_ARES;
  } else {
    customerSelect.value = "";
  }

  updatePartyPreview("supplier");
  updatePartyPreview("customer");
}

async function handleAresLoad(type) {
  const isSupplier = type === "supplier";
  const icoInput = document.getElementById(isSupplier ? "new-supplier-ico" : "new-customer-ico");
  const btn = document.getElementById(isSupplier ? "new-supplier-ares-load" : "new-customer-ares-load");
  const ico = (icoInput?.value || "").replace(/\D/g, "").slice(0, 8);

  if (ico.length !== 8) {
    showNewInvoiceError("IČO musí mít 8 číslic.");
    icoInput?.focus();
    return null;
  }

  showNewInvoiceError("");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Načítám…";
  }

  try {
    const saved = isSupplier
      ? await FakturaParties.loadSupplierFromAres(ico)
      : await FakturaParties.loadCustomerFromAres(ico);

    await loadPartiesForModal();
    renderPartySelect(
      document.getElementById(isSupplier ? "new-supplier-select" : "new-customer-select"),
      isSupplier ? partiesCache.suppliers : partiesCache.customers,
      isSupplier ? "— prázdný dodavatel —" : "— prázdný odběratel —"
    );

    const select = document.getElementById(isSupplier ? "new-supplier-select" : "new-customer-select");
    if (select) select.value = saved.id;

    if (isSupplier) {
      supplierSelection = { id: saved.id, record: saved };
    } else {
      customerSelection = { id: saved.id, record: saved };
    }

    updatePartyPreview(type);
    return saved;
  } catch (err) {
    showNewInvoiceError(err.message || "Načtení z ARES se nezdařilo.");
    return null;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Načíst ARES";
    }
  }
}

async function resolvePartyForConfirm(type) {
  const isSupplier = type === "supplier";
  const select = document.getElementById(isSupplier ? "new-supplier-select" : "new-customer-select");
  const value = select?.value || "";

  if (!value) return null;

  if (value === PARTY_ARES) {
    const icoInput = document.getElementById(isSupplier ? "new-supplier-ico" : "new-customer-ico");
    const ico = (icoInput?.value || "").replace(/\D/g, "").slice(0, 8);
    if (ico.length !== 8) {
      throw new Error(isSupplier ? "Zadej IČO dodavatele." : "Zadej IČO odběratele.");
    }

    const selection = isSupplier ? supplierSelection : customerSelection;
    if (selection.record && String(selection.record.ico || selection.record.supplier?.ico || selection.record.customer?.ico || "").replace(/\D/g, "") === ico) {
      return selection.record;
    }

    const loaded = await handleAresLoad(type);
    if (!loaded) {
      throw new Error(isSupplier ? "Načti dodavatele z ARES (IČO)." : "Načti odběratele z ARES (IČO).");
    }
    return loaded;
  }

  return findPartyRecord(type, value);
}

function getSelectedSupplierForNumbering() {
  const select = document.getElementById("new-supplier-select");
  const value = select?.value || "";
  if (!value || value === PARTY_ARES) {
    if (value === PARTY_ARES && supplierSelection.record?.supplier) {
      return supplierSelection.record.supplier;
    }
    return null;
  }
  const record = findPartyRecord("supplier", value);
  return record?.supplier || null;
}

function updateNumberPreviewFromSetup() {
  const startInput = document.getElementById("new-number-start");
  const preview = document.getElementById("new-number-preview");
  if (!preview) return;
  const start = Math.max(1, parseInt(startInput?.value, 10) || 1);
  preview.textContent = InvoiceNumbering.formatSeriesYear(start, InvoiceNumbering.currentYear());
}

async function updateNewInvoiceNumberingUI() {
  const setupEl = document.getElementById("new-invoice-number-setup");
  const autoEl = document.getElementById("new-invoice-number-auto");
  const valueEl = document.getElementById("new-invoice-number-value");
  const setupText = document.getElementById("new-invoice-number-setup-text");
  const startInput = document.getElementById("new-number-start");

  const invoices = await FakturaStorage.readInvoices();
  const supplier = getSelectedSupplierForNumbering();
  const supplierPrefs = supplier ? InvoiceNumbering.loadSupplierSeriesPrefs(supplier) : null;
  const result = InvoiceNumbering.suggestNext(invoices, { supplier });

  if (startInput) {
    startInput.value = String(supplierPrefs?.startNumber || result.startNumber || 1);
  }

  if (result.needsSetup) {
    setupEl?.classList.remove("hidden");
    autoEl?.classList.add("hidden");
    if (setupText) {
      setupText.textContent = supplier
        ? "Pro tohoto dodavatele zatím není řada. Nastavte počáteční číslo:"
        : "Zatím nemáte žádné faktury. Nastavte formát řady pro tento rok:";
    }
    updateNumberPreviewFromSetup();
    return;
  }

  setupEl?.classList.add("hidden");
  autoEl?.classList.remove("hidden");
  if (valueEl) valueEl.textContent = result.number;
}

async function openNewInvoiceModal() {
  try {
    selectedNewInvoiceLayout = localStorage.getItem("faktura-last-layout") || InvoiceLayouts.DEFAULT_LAYOUT;
  } catch (e) {
    selectedNewInvoiceLayout = InvoiceLayouts.DEFAULT_LAYOUT;
  }

  showNewInvoiceError("");
  renderLayoutPicker();
  await loadPartiesForModal();

  renderPartySelect(document.getElementById("new-supplier-select"), partiesCache.suppliers, "— prázdný dodavatel —");
  renderPartySelect(document.getElementById("new-customer-select"), partiesCache.customers, "— prázdný odběratel —");
  applyDefaultPartySelections();

  const paymentMethod = document.getElementById("new-payment-method");
  if (paymentMethod) paymentMethod.value = "Převodem";

  const includeQr = document.getElementById("new-include-qr");
  if (includeQr) includeQr.checked = true;

  syncQrCheckboxState();

  document.getElementById("new-supplier-ico").value = "";
  document.getElementById("new-customer-ico").value = "";

  await updateNewInvoiceNumberingUI();

  document.getElementById("new-invoice-modal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  document.getElementById("new-invoice-modal-confirm").focus();
}

function closeNewInvoiceModal() {
  document.getElementById("new-invoice-modal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
  showNewInvoiceError("");
}

async function confirmNewInvoice() {
  const confirmBtn = document.getElementById("new-invoice-modal-confirm");
  confirmBtn.disabled = true;

  try {
    showNewInvoiceError("");

    const supplierRecord = await resolvePartyForConfirm("supplier");
    const customerRecord = await resolvePartyForConfirm("customer");

    const paymentMethod = document.getElementById("new-payment-method")?.value || "Převodem";
    const includeQr = document.getElementById("new-include-qr")?.checked !== false && paymentMethod === "Převodem";

    const setup = {
      layout: selectedNewInvoiceLayout,
      includeQr,
      payment: { method: paymentMethod },
    };

    if (supplierRecord) {
      Object.assign(setup, FakturaParties.supplierToInvoiceFields(supplierRecord));
      setup.payment = { ...setup.payment, ...supplierRecord.payment, method: paymentMethod };
    }

    if (customerRecord) {
      Object.assign(setup, FakturaParties.customerToInvoiceFields(customerRecord));
    }

    const invoices = await FakturaStorage.readInvoices();
    const supplier = supplierRecord?.supplier || getSelectedSupplierForNumbering();
    const setupVisible = !document.getElementById("new-invoice-number-setup")?.classList.contains("hidden");
    let startNumber;
    if (setupVisible) {
      startNumber = Math.max(1, parseInt(document.getElementById("new-number-start")?.value, 10) || 1);
      if (supplier) {
        InvoiceNumbering.saveSupplierSeriesPrefs(supplier, {
          format: document.getElementById("new-number-format")?.value || "series-year",
          startNumber,
          seqPad: 0,
        });
      } else {
        InvoiceNumbering.savePrefs({
          format: document.getElementById("new-number-format")?.value || "series-year",
          startNumber,
          seqPad: 0,
        });
      }
    }
    const numbering = InvoiceNumbering.suggestNext(invoices, {
      supplier,
      startNumber,
      skipSetup: true,
    });
    setup.invoiceNumber = numbering.number;
    setup.payment = {
      ...setup.payment,
      variableSymbol: InvoiceNumbering.variableSymbolFromNumber(numbering.number),
    };

    sessionStorage.setItem(NEW_INVOICE_SETUP_KEY, JSON.stringify(setup));

    try {
      localStorage.setItem("faktura-last-layout", selectedNewInvoiceLayout);
    } catch (e) {}

    closeNewInvoiceModal();
    navigateToNewInvoice(selectedNewInvoiceLayout);
  } catch (err) {
    showNewInvoiceError(err.message || "Nepodařilo se připravit novou fakturu.");
  } finally {
    confirmBtn.disabled = false;
  }
}

async function handleNewInvoice() {
  try {
    await openNewInvoiceModal();
  } catch (err) {
    showLoadError(err);
  }
}

function openDeleteModal(invoice) {
  const reason = InvoiceNumbering.deleteBlockReason(invoice, allInvoices);
  if (reason) {
    showToast(reason);
    return;
  }
  invoicePendingDelete = invoice;
  const text = document.getElementById("delete-modal-text");
  const label = invoice.invoiceNumber || invoice.customer?.name || "tuto fakturu";
  text.textContent = `Opravdu chcete smazat fakturu „${label}"? Smazat lze jen poslední nevyřízenou fakturu v řadě. Tuto akci nelze vrátit.`;
  document.getElementById("delete-modal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  document.getElementById("delete-modal-confirm").focus();
}

function closeDeleteModal() {
  invoicePendingDelete = null;
  document.getElementById("delete-modal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function confirmDelete() {
  if (!invoicePendingDelete?.id) {
    closeDeleteModal();
    return;
  }

  if (!InvoiceNumbering.canDeleteInvoice(invoicePendingDelete, allInvoices)) {
    showToast(InvoiceNumbering.deleteBlockReason(invoicePendingDelete, allInvoices));
    closeDeleteModal();
    return;
  }

  try {
    await FakturaStorage.deleteInvoice(invoicePendingDelete.id);
    showToast(await deletedInvoicesMessage(1));
    await renderInvoiceList();
  } catch (err) {
    alert(err.message || "Smazání se nezdařilo.");
  }

  closeDeleteModal();
}

function openBulkDeleteModal() {
  const deletableIds = Array.from(selectedIds).filter((id) => {
    const invoice = allInvoices.find((inv) => inv.id === id);
    return invoice && InvoiceNumbering.canDeleteInvoice(invoice, allInvoices);
  });
  const skipped = selectedIds.size - deletableIds.length;

  if (deletableIds.length === 0) {
    showToast(
      skipped > 0
        ? "Žádnou z označených faktur nelze smazat (vyřízená, stornovaná, nebo není poslední v řadě)."
        : "Nejsou vybrané žádné faktury ke smazání."
    );
    return;
  }

  const text = document.getElementById("bulk-delete-modal-text");
  let msg =
    deletableIds.length === 1
      ? "Opravdu chcete smazat 1 označenou fakturu? Tuto akci nelze vrátit."
      : `Opravdu chcete smazat ${deletableIds.length} označených faktur? Tuto akci nelze vrátit.`;
  if (skipped > 0) {
    msg += ` ${skipped === 1 ? "1 faktura bude přeskočena." : skipped + " faktur bude přeskočeno."}`;
  }
  text.textContent = msg;

  document.getElementById("bulk-delete-modal").dataset.deletableIds = JSON.stringify(deletableIds);
  document.getElementById("bulk-delete-modal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  document.getElementById("bulk-delete-modal-confirm").focus();
}

function closeBulkDeleteModal() {
  document.getElementById("bulk-delete-modal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function confirmBulkDelete() {
  let ids = [];
  try {
    ids = JSON.parse(document.getElementById("bulk-delete-modal").dataset.deletableIds || "[]");
  } catch {
    ids = [];
  }
  if (!ids.length) {
    ids = Array.from(selectedIds).filter((id) => {
      const invoice = allInvoices.find((inv) => inv.id === id);
      return invoice && InvoiceNumbering.canDeleteInvoice(invoice, allInvoices);
    });
  }
  if (!ids.length) {
    closeBulkDeleteModal();
    return;
  }

  const confirmBtn = document.getElementById("bulk-delete-modal-confirm");
  confirmBtn.disabled = true;

  const failed = [];
  for (const id of ids) {
    try {
      await FakturaStorage.deleteInvoice(id);
      selectedIds.delete(id);
    } catch (err) {
      failed.push(id);
    }
  }

  confirmBtn.disabled = false;
  closeBulkDeleteModal();

  const deletedCount = ids.length - failed.length;
  if (deletedCount > 0) {
    showToast(await deletedInvoicesMessage(deletedCount));
  }
  if (failed.length) {
    alert(`Některé faktury se nepodařilo smazat (${failed.length}).`);
  }

  await renderInvoiceList();
}

function openTemplateDeleteModal() {
  document.getElementById("template-delete-modal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  document.getElementById("template-delete-modal-confirm").focus();
}

function closeTemplateDeleteModal() {
  document.getElementById("template-delete-modal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function confirmTemplateDelete() {
  const confirmBtn = document.getElementById("template-delete-modal-confirm");
  confirmBtn.disabled = true;

  try {
    await FakturaStorage.deleteTemplate();
    closeTemplateDeleteModal();
    showToast("Uložená šablona smazána.");
    await renderInvoiceList();
  } catch (err) {
    alert(err.message || "Smazání šablony se nezdařilo.");
  } finally {
    confirmBtn.disabled = false;
  }
}

function templateHasContent(template) {
  return Boolean(
    template &&
      (template.supplier?.name ||
        template.customer?.name ||
        template.payment?.accountNumber)
  );
}

function updateTemplateBannerInfo(template, hasTemplate) {
  const info = document.getElementById("template-banner-info");
  if (!info) return;

  if (!hasTemplate) {
    info.classList.add("hidden");
    info.textContent = "";
    return;
  }

  const sourceNumber = template?.sourceInvoiceNumber || "";

  if (sourceNumber) {
    info.textContent = ` (šablona z faktury č. ${sourceNumber})`;
    info.classList.remove("hidden");
  } else {
    info.classList.add("hidden");
    info.textContent = "";
  }
}

async function renderInvoiceList() {
  const emptyState = document.getElementById("empty-state");
  const filtersBar = document.getElementById("filters-bar");
  const filterEmpty = document.getElementById("filter-empty-state");
  const listWrap = document.getElementById("invoice-list-wrap");
  const templateBanner = document.getElementById("template-banner");
  const serverError = document.getElementById("server-error");

  try {
    allInvoices = await FakturaStorage.readInvoices();
    const existingIds = new Set(allInvoices.map((inv) => inv.id));
    selectedIds = new Set(Array.from(selectedIds).filter((id) => existingIds.has(id)));
    customerOptions = InvoiceFilters.buildCustomerOptions(allInvoices);
    const template = await FakturaStorage.getTemplate();
    const hasTemplate = templateHasContent(template);

    serverError?.classList.add("hidden");
    templateBanner.classList.toggle("hidden", !hasTemplate);
    updateTemplateBannerInfo(template, hasTemplate);
    updateExportButtonState();

    if (!allInvoices.length) {
      emptyState.classList.remove("hidden");
      filtersBar.classList.add("hidden");
      filterEmpty.classList.add("hidden");
      listWrap.classList.add("hidden");
      visibleIds = [];
      updateBulkUi();
      return;
    }

    emptyState.classList.add("hidden");
    filtersBar.classList.remove("hidden");
    listFilters.updateDateSelects();
    updateListFilterCount();
    renderInvoiceRows();
  } catch (err) {
    showLoadError(err);
    document.getElementById("invoice-list").innerHTML = "";
    emptyState.classList.remove("hidden");
    filtersBar?.classList.add("hidden");
    filterEmpty.classList.add("hidden");
    listWrap.classList.add("hidden");
    visibleIds = [];
    updateBulkUi();
    updateExportButtonState();
  }
}

function initModals() {
  document.getElementById("btn-new-invoice").addEventListener("click", handleNewInvoice);
  document.getElementById("btn-new-empty").addEventListener("click", handleNewInvoice);
  document.getElementById("btn-export").addEventListener("click", openExportModal);

  document.getElementById("new-invoice-modal-confirm").addEventListener("click", confirmNewInvoice);
  document.getElementById("new-invoice-modal-cancel").addEventListener("click", closeNewInvoiceModal);
  document.getElementById("new-invoice-modal-close").addEventListener("click", closeNewInvoiceModal);
  document.getElementById("new-invoice-modal-backdrop").addEventListener("click", closeNewInvoiceModal);
  document.getElementById("new-number-start")?.addEventListener("input", updateNumberPreviewFromSetup);

  document.getElementById("new-supplier-select")?.addEventListener("change", () => {
    updatePartyPreview("supplier");
    updateNewInvoiceNumberingUI();
  });
  document.getElementById("new-customer-select")?.addEventListener("change", () => updatePartyPreview("customer"));
  document.getElementById("new-supplier-ares-load")?.addEventListener("click", async () => {
    await handleAresLoad("supplier");
    await updateNewInvoiceNumberingUI();
  });
  document.getElementById("new-customer-ares-load")?.addEventListener("click", () => handleAresLoad("customer"));
  document.getElementById("new-supplier-ico")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAresLoad("supplier");
    }
  });
  document.getElementById("new-customer-ico")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAresLoad("customer");
    }
  });
  document.getElementById("new-payment-method")?.addEventListener("change", syncQrCheckboxState);

  document.getElementById("delete-modal-cancel").addEventListener("click", closeDeleteModal);
  document.getElementById("delete-modal-confirm").addEventListener("click", confirmDelete);
  document.getElementById("delete-modal-backdrop").addEventListener("click", closeDeleteModal);

  document.getElementById("btn-delete-template").addEventListener("click", openTemplateDeleteModal);
  document.getElementById("template-delete-modal-cancel").addEventListener("click", closeTemplateDeleteModal);
  document.getElementById("template-delete-modal-confirm").addEventListener("click", confirmTemplateDelete);
  document.getElementById("template-delete-modal-close").addEventListener("click", closeTemplateDeleteModal);
  document.getElementById("template-delete-modal-backdrop").addEventListener("click", closeTemplateDeleteModal);

  document.getElementById("export-modal-cancel").addEventListener("click", closeExportModal);
  document.getElementById("export-modal-confirm").addEventListener("click", confirmExport);
  document.getElementById("export-modal-backdrop").addEventListener("click", closeExportModal);
  document.getElementById("export-modal-close").addEventListener("click", closeExportModal);

  document.getElementById("btn-clear-filter").addEventListener("click", () => listFilters.reset());

  document.getElementById("select-all").addEventListener("change", (e) => {
    if (e.target.checked) {
      visibleIds.forEach((id) => selectedIds.add(id));
    } else {
      visibleIds.forEach((id) => selectedIds.delete(id));
    }
    document.querySelectorAll(".row-select").forEach((cb) => {
      cb.checked = selectedIds.has(cb.dataset.id);
    });
    updateBulkUi();
  });

  document.getElementById("btn-bulk-resolve").addEventListener("click", () => bulkSetResolved(true));
  document.getElementById("btn-bulk-unresolve").addEventListener("click", () => bulkSetResolved(false));
  document.getElementById("btn-bulk-cancel").addEventListener("click", () => bulkSetCancelled(true));
  document.getElementById("btn-bulk-clear").addEventListener("click", clearSelection);
  document.getElementById("btn-bulk-delete").addEventListener("click", openBulkDeleteModal);
  document.getElementById("bulk-delete-modal-cancel").addEventListener("click", closeBulkDeleteModal);
  document.getElementById("bulk-delete-modal-confirm").addEventListener("click", confirmBulkDelete);
  document.getElementById("bulk-delete-modal-backdrop").addEventListener("click", closeBulkDeleteModal);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!document.getElementById("export-modal").classList.contains("hidden")) closeExportModal();
    if (!document.getElementById("new-invoice-modal").classList.contains("hidden")) closeNewInvoiceModal();
    if (!document.getElementById("delete-modal").classList.contains("hidden")) closeDeleteModal();
    if (!document.getElementById("bulk-delete-modal").classList.contains("hidden")) closeBulkDeleteModal();
    if (!document.getElementById("template-delete-modal").classList.contains("hidden")) closeTemplateDeleteModal();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#filter-customer") && !e.target.closest("#filter-suggestions")) {
      listFilters.closeSuggestions();
    }
    if (!e.target.closest("#export-filter-customer") && !e.target.closest("#export-filter-suggestions")) {
      exportFilters.closeSuggestions();
    }
  });
}

function initListActions() {
  document.getElementById("invoice-list").addEventListener("change", (e) => {
    const checkbox = e.target.closest(".row-select");
    if (!checkbox) return;
    const id = checkbox.dataset.id;
    if (checkbox.checked) {
      selectedIds.add(id);
    } else {
      selectedIds.delete(id);
    }
    updateBulkUi();
  });

  document.getElementById("invoice-list").addEventListener("click", async (e) => {
    const resolveBtn = e.target.closest(".btn-resolve");
    if (resolveBtn) {
      if (resolveBtn.disabled) return;
      const nextResolved = resolveBtn.dataset.resolved !== "1";
      try {
        await setInvoiceResolved(resolveBtn.dataset.id, nextResolved);
        showToast(nextResolved ? "Faktura označena jako vyřízená." : "Vyřízeno zrušeno.");
        await renderInvoiceList();
      } catch (err) {
        alert(err.message || "Změna stavu se nezdařila.");
      }
      return;
    }

    const cancelBtn = e.target.closest(".btn-cancel");
    if (cancelBtn) {
      const nextCancelled = cancelBtn.dataset.cancelled !== "1";
      try {
        await setInvoiceCancelled(cancelBtn.dataset.id, nextCancelled);
        showToast(nextCancelled ? "Faktura stornována." : "Storno zrušeno.");
        await renderInvoiceList();
      } catch (err) {
        alert(err.message || "Změna stavu se nezdařila.");
      }
      return;
    }

    const deleteBtn = e.target.closest(".btn-delete");
    if (deleteBtn) {
      if (deleteBtn.disabled) {
        showToast(deleteBtn.title || "Tuto fakturu nelze smazat.");
        return;
      }
      try {
        const invoice = await FakturaStorage.getInvoice(deleteBtn.dataset.id);
        openDeleteModal(invoice);
      } catch (err) {
        alert(err.message || "Načtení faktury se nezdařilo.");
      }
      return;
    }
  });
}

async function setInvoiceResolved(id, resolved) {
  const invoice = await FakturaStorage.getInvoice(id);
  if (invoice.cancelled) {
    throw new Error("Stornovanou fakturu nelze označit jako vyřízenou.");
  }
  invoice.resolved = resolved;
  await FakturaStorage.saveInvoice(invoice);
}

async function setInvoiceCancelled(id, cancelled) {
  const invoice = await FakturaStorage.getInvoice(id);
  invoice.cancelled = cancelled;
  if (cancelled) invoice.resolved = false;
  await FakturaStorage.saveInvoice(invoice);
}

async function bulkSetResolved(resolved) {
  const ids = Array.from(selectedIds);
  if (!ids.length) return;

  const failed = [];
  for (const id of ids) {
    try {
      await setInvoiceResolved(id, resolved);
    } catch (err) {
      failed.push(id);
    }
  }

  const okCount = ids.length - failed.length;
  if (okCount > 0) {
    showToast(
      resolved
        ? `${okCount === 1 ? "1 faktura označena" : okCount + " faktur označeno"} jako vyřízené.`
        : `Vyřízeno zrušeno u ${okCount === 1 ? "1 faktury" : okCount + " faktur"}.`
    );
  }
  if (failed.length) {
    alert(`U některých faktur se stav nezměnil (${failed.length}).`);
  }

  await renderInvoiceList();
}

async function bulkSetCancelled(cancelled) {
  const ids = Array.from(selectedIds);
  if (!ids.length) return;

  const failed = [];
  for (const id of ids) {
    try {
      await setInvoiceCancelled(id, cancelled);
    } catch (err) {
      failed.push(id);
    }
  }

  const okCount = ids.length - failed.length;
  if (okCount > 0) {
    showToast(
      cancelled
        ? `${okCount === 1 ? "1 faktura stornována" : okCount + " faktur stornováno"}.`
        : `Storno zrušeno u ${okCount === 1 ? "1 faktury" : okCount + " faktur"}.`
    );
  }
  if (failed.length) {
    alert(`U některých faktur se stav nezměnil (${failed.length}).`);
  }

  await renderInvoiceList();
}

function initImport() {
  const input = document.getElementById("import-file");
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      const result = await FakturaStorage.importInvoicesFromFile(file);
      showToast(await importedInvoicesMessage(result.count));
      await renderInvoiceList();
    } catch (err) {
      alert(err.message || "Import se nezdařil.");
    }
  });
}

function initFilters() {
  listFilters = createFilterController({
    ids: {
      customer: "filter-customer",
      clearCustomer: "filter-clear-customer",
      suggestions: "filter-suggestions",
      year: "filter-year",
      month: "filter-month",
      day: "filter-day",
      clearDates: "filter-clear-dates",
      status: "filter-status",
    },
    defaultStatus: "active",
    onChange: () => {
      updateListFilterCount();
      renderInvoiceRows();
    },
  });

  exportFilters = createFilterController({
    ids: {
      customer: "export-filter-customer",
      clearCustomer: "export-filter-clear-customer",
      suggestions: "export-filter-suggestions",
      year: "export-filter-year",
      month: "export-filter-month",
      day: "export-filter-day",
      clearDates: "export-filter-clear-dates",
    },
    onChange: updateExportModalCount,
  });

  listFilters.bind();
  exportFilters.bind();
}

function initThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  const readStored = () => {
    try {
      return localStorage.getItem("faktura-theme");
    } catch {
      return null;
    }
  };

  const apply = (isDark) => {
    document.documentElement.classList.toggle("dark", isDark);
    toggle.setAttribute("aria-checked", isDark ? "true" : "false");
  };

  apply(readStored() === "dark");

  toggle.addEventListener("click", () => {
    const isDark = !document.documentElement.classList.contains("dark");
    apply(isDark);
    try {
      localStorage.setItem("faktura-theme", isDark ? "dark" : "light");
    } catch {
      // úložiště nemusí být dostupné
    }
  });
}

async function init() {
  AppMeta.mount();
  MdiIcons.mount();
  initThemeToggle();
  initFilters();
  initSort();
  initModals();
  initListActions();
  initImport();
  await FakturaStorage.loadStorageStatus();
  await updateStorageHint();
  await renderInvoiceList();
}

init();
