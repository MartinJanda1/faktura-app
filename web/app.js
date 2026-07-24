function formatCurrency(value) {
  return Number(value).toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseNumber(value) {
  const cleaned = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function formatAccountingValue(value) {
  return formatCurrency(parseNumber(value));
}

function formatAccountingInput(input) {
  input.value = formatAccountingValue(input.value);
}

function formatUnitInput(input) {
  const val = input.value.trim();
  if (/^\d+([.,]\d+)?$/.test(val)) {
    const num = parseNumber(val);
    input.value = Number.isInteger(num) ? String(num) : formatAccountingValue(num);
  }
}

function onAccountingFocus(input) {
  const num = parseNumber(input.value);
  input.value = input.value.trim() === "" ? "" : String(num).replace(".", ",");
  input.select();
}

function formatRowNumericCells(row) {
  row.querySelectorAll(".qty, .unit-price").forEach(formatAccountingInput);
  const unit = row.querySelector(".unit");
  if (unit) formatUnitInput(unit);
}

function formatDateCs(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("bg-neutral-800", "bg-red-600");
  toast.classList.add(type === "error" ? "bg-red-600" : "bg-neutral-800");
  toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add("hidden"), type === "error" ? 4000 : 2800);
}

function calculateRowTotal(row) {
  const qty = parseNumber(row.querySelector(".qty").value);
  const price = parseNumber(row.querySelector(".unit-price").value);
  const total = qty * price;
  row.querySelector(".row-total").textContent = formatCurrency(total);
  return total;
}

function calculateGrandTotal() {
  const rows = document.querySelectorAll(".item-row");
  let sum = 0;
  rows.forEach((row) => {
    sum += calculateRowTotal(row);
  });
  const formatted = formatCurrency(sum);
  document.getElementById("grand-total").textContent = formatted;
  document.getElementById("payment-total").textContent = formatted;
  PaymentQr.updatePaymentQr();
  return sum;
}

function rowHasContent(row) {
  const desc = row.querySelector(".desc")?.value.trim();
  const qty = parseNumber(row.querySelector(".qty")?.value);
  const price = parseNumber(row.querySelector(".unit-price")?.value);
  return Boolean(desc) || qty !== 0 || price !== 0;
}

function updateRowControls() {
  const readOnly = isEditorReadOnly();
  document.querySelectorAll(".item-row").forEach((row) => {
    const btn = row.querySelector(".btn-remove");
    if (!btn) return;
    if (readOnly) {
      btn.classList.add("hidden");
      return;
    }
    btn.classList.toggle("hidden", !rowHasContent(row));
  });
}

function isEditorReadOnly() {
  return document.getElementById("invoice-root")?.dataset.readOnly === "1";
}

function setEditorReadOnly(enabled) {
  const root = document.getElementById("invoice-root");
  const invoice = document.getElementById("invoice");
  const banner = document.getElementById("readonly-banner");
  const layoutSelect = document.getElementById("layout-select");
  const btnSave = document.getElementById("btn-save");
  const btnAddRow = document.getElementById("btn-add-row");

  if (root) root.dataset.readOnly = enabled ? "1" : "";
  root?.classList.toggle("is-readonly", enabled);
  invoice?.classList.toggle("invoice-readonly", enabled);
  banner?.classList.toggle("hidden", !enabled);

  invoice?.querySelectorAll("input, textarea, select").forEach((el) => {
    if (el.tagName === "SELECT") {
      el.disabled = enabled;
    } else {
      el.readOnly = enabled;
    }
  });

  if (layoutSelect) layoutSelect.disabled = enabled;
  if (btnSave) {
    btnSave.hidden = enabled;
    if (enabled) btnSave.disabled = true;
  }
  if (btnAddRow) {
    btnAddRow.hidden = enabled;
    btnAddRow.disabled = enabled;
  }

  document.querySelectorAll(".col-row-ctl").forEach((cell) => {
    cell.classList.toggle("hidden", enabled);
  });

  updateRowControls();
  updateEditorActionButtons();
}

function ensureMinOneRow() {
  if (!document.querySelector(".item-row")) {
    createItemRow();
  }
}

function removeItemRow(row) {
  row.remove();
  ensureMinOneRow();
  updateRowControls();
  calculateGrandTotal();
  markEditorDirty();
}

let rowPendingRemoval = null;

function openRemoveModal(row) {
  if (isEditorReadOnly()) return;
  rowPendingRemoval = row;
  const desc = row.querySelector(".desc")?.value.trim();
  const textEl = document.getElementById("remove-modal-text");
  textEl.textContent = desc
    ? `Opravdu chcete odebrat položku „${desc}"?`
    : "Opravdu chcete odebrat tuto položku z faktury?";
  document.getElementById("remove-modal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  document.getElementById("remove-modal-confirm").focus();
}

function closeRemoveModal() {
  rowPendingRemoval = null;
  document.getElementById("remove-modal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

function confirmRemoveRow() {
  if (rowPendingRemoval) {
    rowPendingRemoval.remove();
    calculateGrandTotal();
    markEditorDirty();
  }
  closeRemoveModal();
}

function initRemoveModal() {
  document.getElementById("remove-modal-cancel").addEventListener("click", closeRemoveModal);
  document.getElementById("remove-modal-confirm").addEventListener("click", confirmRemoveRow);
  document.getElementById("remove-modal-backdrop").addEventListener("click", closeRemoveModal);

  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("remove-modal");
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeRemoveModal();
    }
  });
}

function createItemRowElement(item = {}) {
  const row = document.createElement("tr");
  row.className = "item-row";
  row.innerHTML = `
    <td class="no-print col-row-ctl align-middle">
      <button type="button" class="btn-item-ctl btn-item-remove btn-remove hidden" title="Odebrat položku" aria-label="Odebrat položku">−</button>
    </td>
    <td class="border border-neutral-500 p-1.5 align-middle text-invoice-sm">
      <input type="text" class="desc" placeholder="Označení dodávky">
    </td>
    <td class="col-qty border border-neutral-500 p-1.5 align-middle text-invoice-sm">
      <input type="text" class="qty numeric-cell text-right" inputmode="decimal">
    </td>
    <td class="col-unit border border-neutral-500 p-1.5 align-middle text-invoice-sm">
      <input type="text" class="unit text-center">
    </td>
    <td class="col-price border border-neutral-500 p-1.5 align-middle text-invoice-sm">
      <input type="text" class="unit-price numeric-cell text-right" inputmode="decimal">
    </td>
    <td class="row-total border border-neutral-500 p-1.5 text-right text-invoice-sm font-bold tabular-nums">0,00</td>
  `;

  row.querySelector(".desc").value = item.desc ?? "";
  row.querySelector(".qty").value = item.qty ?? "1,00";
  row.querySelector(".unit").value = item.unit ?? "ks";
  row.querySelector(".unit-price").value = item.unitPrice ?? "0,00";
  return row;
}

function createItemRow(item) {
  const tbody = document.getElementById("items-body");
  const row = createItemRowElement(item);
  tbody.appendChild(row);
  formatRowNumericCells(row);
  bindRowEvents(row);
  updateRowControls();
  calculateGrandTotal();
}

function rebuildItemRows(items) {
  const tbody = document.getElementById("items-body");
  tbody.innerHTML = "";
  const list = items?.length ? items : [{ desc: "", qty: "1,00", unit: "ks", unitPrice: "0,00" }];
  list.forEach((item) => {
    const row = createItemRowElement(item);
    tbody.appendChild(row);
    formatRowNumericCells(row);
    bindRowEvents(row);
  });
  updateRowControls();
  calculateGrandTotal();
}

function bindRowEvents(row) {
  row.querySelectorAll(".qty, .unit-price").forEach((input) => {
    input.addEventListener("input", () => {
      calculateGrandTotal();
      updateRowControls();
    });
    input.addEventListener("focus", () => onAccountingFocus(input));
    input.addEventListener("blur", () => {
      formatAccountingInput(input);
      calculateGrandTotal();
      updateRowControls();
    });
  });

  const descInput = row.querySelector(".desc");
  if (descInput) {
    descInput.addEventListener("input", updateRowControls);
  }

  const unitInput = row.querySelector(".unit");
  if (unitInput) {
    unitInput.addEventListener("blur", () => formatUnitInput(unitInput));
  }

  const removeBtn = row.querySelector(".btn-remove");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => removeItemRow(row));
  }
}

function replaceInputWithSpan(input, text) {
  const span = document.createElement("span");
  span.className = "pdf-text-replacement";
  span.textContent = text ?? input.value ?? "";
  span.dataset.for = input.id || `input-${Math.random().toString(36).slice(2)}`;
  if (!input.id) input.id = span.dataset.for;
  input.style.display = "none";
  input.insertAdjacentElement("afterend", span);
  return span;
}

function controlTextForPdf(el) {
  if (el.tagName === "SELECT") return el.value;
  if (el.type === "date") return formatDateCs(el.value);
  return el.value ?? "";
}

function replaceInvoiceControlsForPdf() {
  const invoice = document.getElementById("invoice");
  if (!invoice) return;

  invoice.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.type === "hidden") return;
    if (el.closest(".no-print")) return;
    if (el.style.display === "none") return;
    if (el.nextElementSibling?.classList.contains("pdf-text-replacement")) return;
    if (el.nextElementSibling?.classList.contains("pdf-date-replacement")) return;
    replaceInputWithSpan(el, controlTextForPdf(el));
  });
}

function injectPrintFooter() {
  if (document.getElementById("pdf-print-footer")) return;

  const printedBy = document.getElementById("supplier-name")?.value.trim() || "";
  const printDate = formatPrintDate();
  const leftText = printedBy
    ? `Vytiskl(a): ${printedBy}, ${printDate}`
    : `Vytiskl(a): , ${printDate}`;

  const footer = document.createElement("div");
  footer.id = "pdf-print-footer";
  footer.className = "pdf-print-footer";
  footer.innerHTML = `
    <div class="pdf-print-footer-inner">
      <span>${leftText}</span>
      <span class="pdf-print-footer-page"></span>
    </div>
  `;
  document.body.appendChild(footer);
}

function removePrintFooter() {
  document.getElementById("pdf-print-footer")?.remove();
}

function fixSectionLabelsForPdf() {
  document.querySelectorAll(".section-label").forEach((label) => {
    const span = label.querySelector("span");
    if (!span) return;
    const rect = span.getBoundingClientRect();
    const needed = Math.ceil(Math.max(rect.width, rect.height)) + 4;
    label.style.minHeight = `${needed}px`;
  });
}

function resetSectionLabels() {
  document.querySelectorAll(".section-label").forEach((label) => {
    label.style.minHeight = "";
  });
}

let pdfPrevDark = false;
let pdfPrevColorScheme = "";
let pdfColorOverrides = [];

function forcePdfBarColors() {
  if (InvoiceLayouts.getCurrentLayout() === "idoklad") return;
  pdfColorOverrides = [];
  document.querySelectorAll("#invoice .payment-bar, #invoice .recap-bar").forEach((bar) => {
    pdfColorOverrides.push([bar, bar.getAttribute("style")]);
    bar.style.backgroundColor = "#00b5c8";
    bar.style.color = "#ffffff";
    bar.querySelectorAll("*").forEach((child) => {
      pdfColorOverrides.push([child, child.getAttribute("style")]);
      child.style.color = "#ffffff";
    });
  });
}

function restorePdfBarColors() {
  pdfColorOverrides.forEach(([el, style]) => {
    if (style === null) {
      el.removeAttribute("style");
    } else {
      el.setAttribute("style", style);
    }
  });
  pdfColorOverrides = [];
}

function prepareForPdf() {
  document.body.classList.add("pdf-exporting");
  pdfPrevDark = document.documentElement.classList.contains("dark");
  if (pdfPrevDark) document.documentElement.classList.remove("dark");
  pdfPrevColorScheme = document.documentElement.style.colorScheme;
  document.documentElement.style.colorScheme = "light";
  fixSectionLabelsForPdf();

  document.querySelectorAll(".item-row").forEach((row) => {
    row.querySelectorAll(".qty, .desc, .unit-price, .unit").forEach((input) => {
      if (input.matches(".qty, .unit-price")) {
        formatAccountingInput(input);
      } else if (input.matches(".unit")) {
        formatUnitInput(input);
      }
      input.setAttribute("value", input.value);
    });
  });

  document.querySelectorAll("input[type='text'], input[type='email'], input[type='number']").forEach((input) => {
    if (input.type === "date") return;
    input.setAttribute("value", input.value);
  });

  replaceInvoiceControlsForPdf();
  injectPrintFooter();
  forcePdfBarColors();
}

function formatPrintDate() {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, "0");
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const y = today.getFullYear();
  return `${d}.${m}.${y}`;
}

function addPdfFooters(pdf) {
  const totalPages = pdf.internal.getNumberOfPages();
  const printedBy = document.getElementById("supplier-name")?.value.trim() || "";
  const printDate = formatPrintDate();
  const leftText = printedBy
    ? `Vytiskl(a): ${printedBy}, ${printDate}`
    : `Vytiskl(a): , ${printDate}`;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const footerY = pageHeight - 6;
  const lineY = footerY - 3;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 90);
  pdf.setDrawColor(210, 210, 210);
  pdf.setLineWidth(0.2);

  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.line(8, lineY, pageWidth - 8, lineY);
    pdf.text(leftText, 8, footerY);

    const pageText = `Strana ${page}/${totalPages}`;
    const pageTextWidth = pdf.getTextWidth(pageText);
    pdf.text(pageText, pageWidth - 8 - pageTextWidth, footerY);
  }
}

function restoreAfterPdf() {
  document.body.classList.remove("pdf-exporting");
  if (pdfPrevDark) document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = pdfPrevColorScheme;
  restorePdfBarColors();
  resetSectionLabels();
  removePrintFooter();

  document.querySelectorAll(".pdf-date-replacement, .pdf-text-replacement").forEach((span) => {
    const input = document.getElementById(span.dataset.for);
    if (input) input.style.display = "";
    span.remove();
  });
}

function downloadPdfBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function base64ToPdfBlob(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "application/pdf" });
}

async function exportPdfViaDesktop(filename, invoice) {
  try {
    const base64 = await window.mjFakturaDesktop.exportInvoicePdf();
    downloadPdfBlob(filename, base64ToPdfBlob(base64));
  } catch (err) {
    console.warn("Desktop PDF selhalo, použit canvas export:", err);
    await exportPdfViaCanvas(invoice, filename);
  }
}

function exportPdfViaCanvas(invoice, filename) {
  const pdfScale = Math.min(4, Math.max(3, (window.devicePixelRatio || 1) * 2));
  const options = {
    margin: [0, 0, 14, 0],
    filename,
    image: { type: "png", quality: 1 },
    html2canvas: {
      scale: pdfScale,
      useCORS: true,
      letterRendering: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      logging: false,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };

  return html2pdf()
    .set(options)
    .from(invoice)
    .toPdf()
    .get("pdf")
    .then((pdf) => {
      addPdfFooters(pdf);
      pdf.save(filename);
    });
}

function downloadPdf() {
  const btn = document.getElementById("btn-pdf");
  if (btn.disabled) return;

  btn.disabled = true;
  btn.textContent = "Generuji PDF…";

  window.scrollTo(0, 0);
  prepareForPdf();

  const invoice = document.getElementById("invoice");
  const number = document.getElementById("invoice-number").value.trim() || "faktura";
  const filename = `faktura-${number.replace(/[/\\?%*:|"<>]/g, "-")}.pdf`;
  const useDesktopPdf = window.mjFakturaDesktop?.exportInvoicePdf;

  const exportPromise = useDesktopPdf
    ? exportPdfViaDesktop(filename, invoice)
    : exportPdfViaCanvas(invoice, filename);

  exportPromise
    .then(() => {
      restoreAfterPdf();
      btn.textContent = "Stáhnout PDF";
      updateEditorActionButtons();
    })
    .catch(() => {
      restoreAfterPdf();
      btn.textContent = "Stáhnout PDF";
      updateEditorActionButtons();
      alert("PDF se nepodařilo vygenerovat. Zkus obnovit stránku.");
    });
}

let editorSavedSnapshot = null;
let editorActionBusy = false;

function isInvoicePersisted() {
  return Boolean(document.getElementById("invoice-root")?.dataset.invoiceId);
}

function getEditorSnapshot() {
  return JSON.stringify(InvoiceModel.collectFromForm());
}

function isEditorDirty() {
  if (editorSavedSnapshot === null) return true;
  return getEditorSnapshot() !== editorSavedSnapshot;
}

function setEditorButtonStyle(btn, primary) {
  btn.classList.toggle("btn-editor-primary", primary);
  btn.classList.toggle("btn-editor-secondary", !primary);
}

function updateEditorActionButtons() {
  if (editorActionBusy) return;

  const btnSave = document.getElementById("btn-save");
  const btnPdf = document.getElementById("btn-pdf");
  if (!btnSave || !btnPdf) return;

  if (isEditorReadOnly()) {
    btnSave.hidden = true;
    btnSave.disabled = true;
    btnPdf.disabled = !isInvoicePersisted();
    setEditorButtonStyle(btnSave, false);
    setEditorButtonStyle(btnPdf, !btnPdf.disabled);
    return;
  }

  btnSave.hidden = false;

  const persisted = isInvoicePersisted();
  const dirty = isEditorDirty();
  const canSave = !persisted || dirty;
  const canPdf = persisted && !dirty;

  btnSave.disabled = !canSave;
  btnPdf.disabled = !canPdf;
  setEditorButtonStyle(btnSave, canSave);
  setEditorButtonStyle(btnPdf, canPdf);
}

function markEditorClean() {
  editorSavedSnapshot = getEditorSnapshot();
  updateEditorActionButtons();
}

function markEditorDirty() {
  updateEditorActionButtons();
}

function bindEditorDirtyTracking() {
  const invoice = document.getElementById("invoice");
  if (invoice) {
    invoice.addEventListener("input", markEditorDirty);
    invoice.addEventListener("change", markEditorDirty);
  }

  document.getElementById("layout-select")?.addEventListener("change", markEditorDirty);
}

async function validateInvoiceNumberOrToast() {
  const numberInput = document.getElementById("invoice-number");
  const number = (numberInput?.value || "").trim();

  if (!number) {
    showToast("Vyplň číslo faktury (pole Faktura).", "error");
    numberInput?.focus();
    return false;
  }

  const currentId = document.getElementById("invoice-root")?.dataset.invoiceId || null;

  try {
    const invoices = await FakturaStorage.readInvoices();
    const duplicate = invoices.some(
      (inv) =>
        inv.id !== currentId &&
        String(inv.invoiceNumber || "").trim().toLowerCase() === number.toLowerCase()
    );
    if (duplicate) {
      showToast(`Faktura s číslem ${number} už existuje.`, "error");
      numberInput?.focus();
      return false;
    }
  } catch (err) {
    showToast(err.message || "Nepodařilo se ověřit číslo faktury.", "error");
    return false;
  }

  return true;
}

async function saveInvoice() {
  const btn = document.getElementById("btn-save");
  if (btn.disabled || btn.hidden || isEditorReadOnly()) {
    if (isEditorReadOnly()) showToast("Vyřízenou fakturu nelze upravovat.", "error");
    return;
  }

  if (!(await validateInvoiceNumberOrToast())) return;

  editorActionBusy = true;
  btn.disabled = true;
  btn.textContent = "Ukládám…";

  const data = InvoiceModel.collectFromForm();
  const root = document.getElementById("invoice-root");
  if (root?.dataset.invoiceId) {
    data.id = root.dataset.invoiceId;
  }
  data.resolved = root?.dataset.resolved === "1";
  data.cancelled = root?.dataset.cancelled === "1";

  FakturaStorage.saveInvoice(data)
    .then(async (saved) => {
      root.dataset.invoiceId = saved.id;
      const location = await FakturaStorage.getSaveLocationLabel();
      showToast(`Faktura uložena (${location})`);
      document.title = `MJ Faktura – ${saved.invoiceNumber || saved.id}`;

      try {
        const partyIds = await FakturaParties.syncFromInvoice(data, {
          supplierPartyId: root?.dataset.supplierPartyId || "",
          customerPartyId: root?.dataset.customerPartyId || "",
        });
        if (partyIds.supplierPartyId) root.dataset.supplierPartyId = partyIds.supplierPartyId;
        if (partyIds.customerPartyId) root.dataset.customerPartyId = partyIds.customerPartyId;
      } catch (syncErr) {
        console.warn("Profil dodavatele/odběratele se nepodařilo uložit.", syncErr);
      }

      history.replaceState(null, "", `invoice.html?id=${encodeURIComponent(saved.id)}`);
      markEditorClean();
    })
    .catch((err) => {
      alert(err.message || "Uložení se nezdařilo.");
    })
    .finally(() => {
      editorActionBusy = false;
      btn.textContent = "Uložit fakturu";
      updateEditorActionButtons();
    });
}

function applyLayoutDefaults(layoutId) {
  const defaults = InvoiceLayouts.getDefaultFieldValues(layoutId);
  if (defaults.supplier?.vatNote && !document.getElementById("supplier-vat-note")?.value.trim()) {
    setFieldValue("supplier-vat-note", defaults.supplier.vatNote);
  }
  if (defaults.footerNote && !document.getElementById("footer-note")?.value.trim()) {
    setFieldValue("footer-note", defaults.footerNote);
  }
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

const NEW_INVOICE_SETUP_KEY = "faktura-new-invoice-setup";

function applyNewInvoiceSetup(invoice) {
  let setup = null;
  try {
    const raw = sessionStorage.getItem(NEW_INVOICE_SETUP_KEY);
    if (raw) {
      setup = JSON.parse(raw);
      sessionStorage.removeItem(NEW_INVOICE_SETUP_KEY);
    }
  } catch (e) {
    sessionStorage.removeItem(NEW_INVOICE_SETUP_KEY);
  }

  if (!setup) return { invoice, setup: null };

  if (setup.supplier) {
    invoice.supplier = { ...invoice.supplier, ...setup.supplier };
  }
  if (setup.customer) {
    invoice.customer = { ...invoice.customer, ...setup.customer };
  }
  if (setup.payment) {
    invoice.payment = { ...invoice.payment, ...setup.payment };
  }
  if (setup.layout) {
    invoice.layout = setup.layout;
  }
  if (setup.invoiceNumber) {
    invoice.invoiceNumber = setup.invoiceNumber;
    invoice.payment = {
      ...invoice.payment,
      variableSymbol:
        setup.payment?.variableSymbol ||
        InvoiceNumbering.variableSymbolFromNumber(setup.invoiceNumber),
    };
    invoice.variableSymbolManual = false;
  }

  return { invoice, setup };
}

async function loadInvoiceFromParams() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const copyId = params.get("copy");
  const layoutParam = params.get("layout");

  try {
    if (id) {
      const invoice = await FakturaStorage.getInvoice(id);
      InvoiceModel.applyToForm(invoice, { rebuildRows: rebuildItemRows });
      const root = document.getElementById("invoice-root");
      if (root) {
        root.dataset.resolved = invoice.resolved ? "1" : "";
        root.dataset.cancelled = invoice.cancelled ? "1" : "";
      }
      const readOnly = Boolean(invoice.resolved) && !invoice.cancelled;
      setEditorReadOnly(readOnly);
      document.title = readOnly
        ? `MJ Faktura – ${invoice.invoiceNumber || invoice.id} (ke čtení)`
        : `MJ Faktura – ${invoice.invoiceNumber || invoice.id}`;
      calculateGrandTotal();
      PaymentQr.updatePaymentQr();
      return;
    }

    if (copyId) {
      const [source, allInvoices] = await Promise.all([
        FakturaStorage.getInvoice(copyId),
        FakturaStorage.readInvoices(),
      ]);
      const invoice = InvoiceModel.prepareCopyFromInvoice(source, {
        existingInvoices: allInvoices,
      });
      InvoiceModel.applyToForm(invoice, { rebuildRows: rebuildItemRows });
      const root = document.getElementById("invoice-root");
      if (root) {
        delete root.dataset.invoiceId;
        delete root.dataset.resolved;
        delete root.dataset.cancelled;
      }
      setEditorReadOnly(false);
      document.title = `MJ Faktura – kopie ${source.invoiceNumber || copyId}`;
      calculateGrandTotal();
      PaymentQr.updatePaymentQr();
      return;
    }

    let invoice = InvoiceModel.defaultEmptyInvoice();
    const layoutId = InvoiceLayouts.normalizeLayoutId(layoutParam || InvoiceLayouts.DEFAULT_LAYOUT);
    invoice.layout = layoutId;

    const layoutDefaults = InvoiceLayouts.getDefaultFieldValues(layoutId);
    if (layoutDefaults.supplier?.vatNote) {
      invoice.supplier.vatNote = layoutDefaults.supplier.vatNote;
    }
    if (layoutDefaults.footerNote) {
      invoice.footerNote = layoutDefaults.footerNote;
    }

    const applied = applyNewInvoiceSetup(invoice);
    invoice = applied.invoice;

    InvoiceModel.applyToForm(invoice, { rebuildRows: rebuildItemRows });
    setEditorReadOnly(false);

    if (applied.setup) {
      const root = document.getElementById("invoice-root");
      if (root) {
        if (applied.setup.supplierPartyId) root.dataset.supplierPartyId = applied.setup.supplierPartyId;
        if (applied.setup.customerPartyId) root.dataset.customerPartyId = applied.setup.customerPartyId;
      }

      const paymentMethod = document.getElementById("payment-method");
      if (paymentMethod && applied.setup.payment?.method) {
        paymentMethod.value = applied.setup.payment.method;
        paymentMethod.dispatchEvent(new Event("change"));
      }

      PaymentQr.updatePaymentQr();
    }
  } catch (err) {
    alert(err.message || "Načtení faktury se nezdařilo.");
    window.location.href = "index.html";
  }
}

function bindIbanAutofill() {
  const ibanInput = document.getElementById("iban");
  if (!ibanInput) return;

  function fillFromIban() {
    const parsed = BankUtils.parseCzechIban(ibanInput.value);
    if (!parsed) return;

    ibanInput.value = parsed.iban;

    const account = document.getElementById("account-number");
    if (account) account.value = parsed.accountNumber;

    const swift = document.getElementById("swift");
    if (swift && parsed.swift) swift.value = parsed.swift;

    const bankName = document.getElementById("bank-name");
    if (bankName && parsed.bankName) bankName.value = parsed.bankName;

    if (typeof PaymentQr !== "undefined") {
      PaymentQr.updatePaymentQr();
    }
  }

  ibanInput.addEventListener("blur", fillFromIban);
  ibanInput.addEventListener("change", fillFromIban);
}

async function init() {
  await loadInvoiceFromParams();
  bindEditorDirtyTracking();

  // Po načtení: uložená faktura = čistá (PDF aktivní), nová/kopie = neuložená (Uložit aktivní).
  if (isInvoicePersisted()) {
    markEditorClean();
  } else {
    editorSavedSnapshot = null;
    updateEditorActionButtons();
  }

  const autoPdf = new URLSearchParams(window.location.search).get("pdf") === "1";
  if (autoPdf && isInvoicePersisted()) {
    const invoiceId = document.getElementById("invoice-root")?.dataset.invoiceId;
    history.replaceState(null, "", `invoice.html?id=${encodeURIComponent(invoiceId)}`);
    setTimeout(() => downloadPdf(), 400);
  }

  document.getElementById("items-body").addEventListener("input", (e) => {
    if (e.target.matches(".qty, .unit-price")) {
      calculateGrandTotal();
    }
  });

  document.getElementById("btn-add-row").addEventListener("click", () => {
    if (isEditorReadOnly()) return;
    createItemRow();
    markEditorDirty();
  });
  document.getElementById("btn-pdf").addEventListener("click", downloadPdf);
  document.getElementById("btn-save").addEventListener("click", saveInvoice);
  initRemoveModal();
  PaymentQr.bindPaymentQrUpdates();
  bindIbanAutofill();

  const layoutSelect = document.getElementById("layout-select");
  if (layoutSelect) {
    layoutSelect.addEventListener("change", () => {
      const prevLayout = InvoiceLayouts.getCurrentLayout();
      const nextLayout = InvoiceLayouts.applyLayout(layoutSelect.value);
      if (prevLayout !== nextLayout) {
        applyLayoutDefaults(nextLayout);
      }
      markEditorDirty();
    });
  }

  const vs = document.getElementById("variable-symbol");
  const invoiceNumber = document.getElementById("invoice-number");

  invoiceNumber.addEventListener("input", () => {
    if (!vs.dataset.manual) {
      vs.value = invoiceNumber.value.replace(/\D/g, "").slice(0, 10);
    }
  });

  vs.addEventListener("input", () => {
    vs.dataset.manual = "1";
  });
}

init();
