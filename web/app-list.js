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
  const el = document.getElementById("storage-hint");
  if (!el) return;
  const status = await FakturaStorage.getStorageStatus();
  if (status.storage === "postgres") {
    el.innerHTML = `Faktury se ukládají do <code class="text-xs">PostgreSQL (${escapeHtml(status.database || "DB")})</code>`;
  } else {
    el.innerHTML = 'Faktury se ukládají do složky <code class="text-xs">data/invoices/</code>';
  }
  await updateExportImportUi(status);
}

async function updateExportImportUi(status) {
  const resolved = status || (await FakturaStorage.getStorageStatus());
  const isPg = resolved.storage === "postgres";
  exportFileExt = isPg ? "sql" : "json";

  const importLabel = document.getElementById("import-label");
  if (importLabel) {
    const textNode = [...importLabel.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    if (textNode) {
      textNode.textContent = isPg ? "Importovat (.sql / .json) " : "Importovat .json ";
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

  document.querySelectorAll(".btn-download").forEach((btn) => {
    const label = `Exportovat .${exportFileExt}`;
    btn.title = label;
    btn.setAttribute("aria-label", label);
  });
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
  const { ids, onChange } = config;
  let customerFilter = { query: "", selected: null };
  let dateFilter = { year: "", month: "", day: "" };
  let suggestionIndex = -1;

  const els = {
    customer: document.getElementById(ids.customer),
    clearCustomer: document.getElementById(ids.clearCustomer),
    suggestions: document.getElementById(ids.suggestions),
    year: document.getElementById(ids.year),
    month: document.getElementById(ids.month),
    day: document.getElementById(ids.day),
    clearDates: document.getElementById(ids.clearDates),
  };

  function getFiltered() {
    return InvoiceFilters.filterInvoices(allInvoices, customerFilter, dateFilter);
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
  }

  return {
    bind,
    getFiltered,
    getState() {
      return {
        customerFilter: InvoiceFilters.cloneCustomerFilter(customerFilter),
        dateFilter: InvoiceFilters.cloneDateFilter(dateFilter),
      };
    },
    closeSuggestions,
    updateDateSelects,
    syncFrom(source) {
      customerFilter = InvoiceFilters.cloneCustomerFilter(source.customerFilter);
      dateFilter = InvoiceFilters.cloneDateFilter(source.dateFilter);
      syncInputsFromState();
      onChange();
    },
    reset() {
      customerFilter = { query: "", selected: null };
      dateFilter = { year: "", month: "", day: "" };
      els.customer.value = "";
      closeSuggestions();
      els.clearCustomer.classList.add("hidden");
      updateDateSelects();
      onChange();
    },
    clearAll() {
      customerFilter = { query: "", selected: null };
      dateFilter = { year: "", month: "", day: "" };
      els.customer.value = "";
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
  const { customerFilter, dateFilter } = listFilters.getState();
  const hasFilter = InvoiceFilters.hasAnyFilter(customerFilter, dateFilter);

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
  const { customerFilter, dateFilter } = listFilters.getState();
  const hasFilter = InvoiceFilters.hasAnyFilter(customerFilter, dateFilter);

  if (!invoices.length && hasFilter) {
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
      const rowClass = summary.resolved
        ? "border-b border-green-100 bg-green-50 hover:bg-green-100"
        : "border-b border-neutral-100 hover:bg-neutral-50";
      return `
        <tr class="${rowClass}" data-id="${summary.id}">
          <td class="px-5 py-4">
            <input type="checkbox" class="row-select h-4 w-4 cursor-pointer accent-brand align-middle" data-id="${summary.id}" aria-label="Vybrat fakturu ${escapeHtml(summary.invoiceNumber)}" ${checked} />
          </td>
          <td class="px-5 py-4 font-medium text-neutral-900">${escapeHtml(summary.invoiceNumber)}</td>
          <td class="px-5 py-4 text-neutral-700">
            <div>${escapeHtml(summary.customerName)}</div>
            ${customerMeta ? `<div class="mt-0.5 text-xs text-neutral-400">${escapeHtml(customerMeta)}</div>` : ""}
          </td>
          <td class="px-5 py-4 text-neutral-700">${escapeHtml(summary.issueDate)}</td>
          <td class="whitespace-nowrap px-5 py-4 text-right font-medium tabular-nums text-neutral-900">${escapeHtml(summary.total)} Kč</td>
          <td class="px-5 py-4 text-neutral-500">
            <div>${escapeHtml(summary.savedAt)}</div>
            <div class="mt-0.5 text-xs text-neutral-400">${escapeHtml(fileLabel)}</div>
          </td>
          <td class="px-5 py-4">
            <div class="flex justify-end gap-2">
              <a href="invoice.html?id=${encodeURIComponent(summary.id)}" class="btn-icon" title="Otevřít" aria-label="Otevřít fakturu">
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.379-8.379-2.828-2.828z"/></svg>
              </a>
              <button type="button" class="btn-icon btn-download" data-id="${summary.id}" title="Exportovat .${exportFileExt}" aria-label="Exportovat .${exportFileExt}">
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 3a1 1 0 011 1v6.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 10.586V4a1 1 0 011-1z"/><path d="M4 14a1 1 0 011 1v1h10v-1a1 1 0 112 0v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a1 1 0 011-1z"/></svg>
              </button>
              <button type="button" class="btn-icon btn-resolve ${summary.resolved ? "btn-icon-resolved" : ""}" data-id="${summary.id}" data-resolved="${summary.resolved ? "1" : "0"}" title="${summary.resolved ? "Zrušit vyřízeno" : "Označit jako vyřízenou"}" aria-label="${summary.resolved ? "Zrušit vyřízeno" : "Označit jako vyřízenou"}">
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z" clip-rule="evenodd"/></svg>
              </button>
              <button type="button" class="btn-icon btn-icon-danger btn-delete" data-id="${summary.id}" title="Smazat" aria-label="Smazat fakturu">
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
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

function navigateToNewInvoice(mode) {
  window.location.href = `invoice.html?mode=${mode}`;
}

function openTemplateModal() {
  document.getElementById("template-modal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  document.getElementById("template-modal-use").focus();
}

function closeTemplateModal() {
  document.getElementById("template-modal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function handleNewInvoice() {
  try {
    if (await FakturaStorage.hasTemplate()) {
      openTemplateModal();
    } else {
      navigateToNewInvoice("empty");
    }
  } catch (err) {
    showLoadError(err);
  }
}

function openDeleteModal(invoice) {
  invoicePendingDelete = invoice;
  const text = document.getElementById("delete-modal-text");
  const label = invoice.invoiceNumber || invoice.customer?.name || "tuto fakturu";
  text.textContent = `Opravdu chcete smazat fakturu „${label}"?`;
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
  const count = selectedIds.size;
  if (count === 0) return;

  const text = document.getElementById("bulk-delete-modal-text");
  text.textContent =
    count === 1
      ? "Opravdu chcete smazat 1 označenou fakturu? Tuto akci nelze vrátit."
      : `Opravdu chcete smazat ${count} označených faktur? Tuto akci nelze vrátit.`;

  document.getElementById("bulk-delete-modal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  document.getElementById("bulk-delete-modal-confirm").focus();
}

function closeBulkDeleteModal() {
  document.getElementById("bulk-delete-modal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function confirmBulkDelete() {
  const ids = Array.from(selectedIds);
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

  document.getElementById("template-modal-use").addEventListener("click", () => {
    closeTemplateModal();
    navigateToNewInvoice("template");
  });
  document.getElementById("template-modal-empty").addEventListener("click", () => {
    closeTemplateModal();
    navigateToNewInvoice("empty");
  });
  document.getElementById("template-modal-backdrop").addEventListener("click", closeTemplateModal);
  document.getElementById("template-modal-close").addEventListener("click", closeTemplateModal);

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

  document.getElementById("btn-clear-filter").addEventListener("click", () => listFilters.clearAll());

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
  document.getElementById("btn-bulk-clear").addEventListener("click", clearSelection);
  document.getElementById("btn-bulk-delete").addEventListener("click", openBulkDeleteModal);
  document.getElementById("bulk-delete-modal-cancel").addEventListener("click", closeBulkDeleteModal);
  document.getElementById("bulk-delete-modal-confirm").addEventListener("click", confirmBulkDelete);
  document.getElementById("bulk-delete-modal-backdrop").addEventListener("click", closeBulkDeleteModal);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!document.getElementById("export-modal").classList.contains("hidden")) closeExportModal();
    if (!document.getElementById("template-modal").classList.contains("hidden")) closeTemplateModal();
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
    const downloadBtn = e.target.closest(".btn-download");
    if (downloadBtn) {
      try {
        const invoice = await FakturaStorage.getInvoice(downloadBtn.dataset.id);
        await FakturaStorage.downloadInvoiceExport(invoice);
        showToast(`Kopie faktury exportována (.${exportFileExt}).`);
      } catch (err) {
        alert(err.message || "Export se nezdařil.");
      }
      return;
    }

    const resolveBtn = e.target.closest(".btn-resolve");
    if (resolveBtn) {
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

    const deleteBtn = e.target.closest(".btn-delete");
    if (deleteBtn) {
      try {
        const invoice = await FakturaStorage.getInvoice(deleteBtn.dataset.id);
        openDeleteModal(invoice);
      } catch (err) {
        alert(err.message || "Načtení faktury se nezdařilo.");
      }
    }
  });
}

async function setInvoiceResolved(id, resolved) {
  const invoice = await FakturaStorage.getInvoice(id);
  invoice.resolved = resolved;
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
    },
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
