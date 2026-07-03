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

let rowPendingRemoval = null;

function openRemoveModal(row) {
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
    <td class="no-print cell-action">
      <button type="button" class="btn-remove h-6 w-6 cursor-pointer rounded border border-[#ccc] bg-white text-base leading-none text-red-600 hover:bg-red-50" title="Odebrat řádek" aria-label="Odebrat řádek">×</button>
    </td>
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
  calculateGrandTotal();
}

function bindRowEvents(row) {
  row.querySelectorAll(".qty, .unit-price").forEach((input) => {
    input.addEventListener("input", calculateGrandTotal);
    input.addEventListener("focus", () => onAccountingFocus(input));
    input.addEventListener("blur", () => {
      formatAccountingInput(input);
      calculateGrandTotal();
    });
  });

  const unitInput = row.querySelector(".unit");
  if (unitInput) {
    unitInput.addEventListener("blur", () => formatUnitInput(unitInput));
  }

  const removeBtn = row.querySelector(".btn-remove");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      const rows = document.querySelectorAll(".item-row");
      if (rows.length <= 1) return;
      openRemoveModal(row);
    });
  }
}

function replaceInputWithSpan(input) {
  const span = document.createElement("span");
  span.className = "pdf-text-replacement";
  span.textContent = input.value;
  span.dataset.for = input.id || `input-${Math.random().toString(36).slice(2)}`;
  if (!input.id) input.id = span.dataset.for;
  input.style.display = "none";
  input.insertAdjacentElement("afterend", span);
  return span;
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
let pdfQrWasVisible = null;

function forcePdfBarColors() {
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

  document.querySelectorAll("input[type='date']").forEach((input) => {
    const span = document.createElement("span");
    span.className = "pdf-date-replacement";
    span.textContent = formatDateCs(input.value);
    span.dataset.for = input.id;
    input.style.display = "none";
    input.insertAdjacentElement("afterend", span);
  });

  document.querySelectorAll(".payment-line input, .payment-select").forEach((el) => {
    if (el.tagName === "SELECT") {
      const span = document.createElement("span");
      span.className = "pdf-text-replacement";
      span.textContent = el.value;
      span.dataset.for = el.id;
      el.style.display = "none";
      el.insertAdjacentElement("afterend", span);
    } else if (el.offsetParent !== null) {
      replaceInputWithSpan(el);
    }
  });

  forcePdfBarColors();

  const includeQrInPdf =
    PaymentQr.shouldShowQr() && document.getElementById("pdf-include-qr")?.checked !== false;
  const qrWrap = document.getElementById("payment-qr-wrap");
  if (qrWrap && !includeQrInPdf) {
    pdfQrWasVisible = !qrWrap.classList.contains("hidden");
    qrWrap.classList.add("hidden");
  } else {
    pdfQrWasVisible = null;
  }
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

  document.querySelectorAll(".pdf-date-replacement, .pdf-text-replacement").forEach((span) => {
    const input = document.getElementById(span.dataset.for);
    if (input) input.style.display = "";
    span.remove();
  });

  if (pdfQrWasVisible !== null) {
    const qrWrap = document.getElementById("payment-qr-wrap");
    if (qrWrap) qrWrap.classList.toggle("hidden", !pdfQrWasVisible);
    pdfQrWasVisible = null;
  }
}

function downloadPdf() {
  const btn = document.getElementById("btn-pdf");
  btn.disabled = true;
  btn.textContent = "Generuji PDF…";

  window.scrollTo(0, 0);
  prepareForPdf();

  const invoice = document.getElementById("invoice");
  const number = document.getElementById("invoice-number").value.trim() || "faktura";

  const options = {
    margin: [0, 0, 14, 0],
    filename: `faktura-${number.replace(/[/\\?%*:|"<>]/g, "-")}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      scrollX: 0,
      scrollY: 0,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };

  html2pdf()
    .set(options)
    .from(invoice)
    .toPdf()
    .get("pdf")
    .then((pdf) => {
      addPdfFooters(pdf);
      pdf.save(options.filename);
    })
    .then(() => {
      restoreAfterPdf();
      btn.disabled = false;
      btn.textContent = "Stáhnout PDF";
    })
    .catch(() => {
      restoreAfterPdf();
      btn.disabled = false;
      btn.textContent = "Stáhnout PDF";
      alert("PDF se nepodařilo vygenerovat. Zkus obnovit stránku.");
    });
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

  if (!(await validateInvoiceNumberOrToast())) return;

  btn.disabled = true;
  btn.textContent = "Ukládám…";

  const data = InvoiceModel.collectFromForm();
  const root = document.getElementById("invoice-root");
  if (root?.dataset.invoiceId) {
    data.id = root.dataset.invoiceId;
  }
  data.resolved = root?.dataset.resolved === "1";

  FakturaStorage.saveInvoice(data)
    .then(async (saved) => {
      root.dataset.invoiceId = saved.id;
      const location = await FakturaStorage.getSaveLocationLabel();
      showToast(`Faktura uložena (${location})`);
      document.title = `Faktura ${saved.invoiceNumber || saved.id} – editor`;
    })
    .catch((err) => {
      alert(err.message || "Uložení se nezdařilo.");
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = "Uložit fakturu";
    });
}

function templateExists(template) {
  return Boolean(
    template &&
      (template.supplier?.name ||
        template.customer?.name ||
        template.payment?.accountNumber ||
        template.sourceInvoiceNumber)
  );
}

function buildTemplateInfoItems(template) {
  const items = [];
  if (template.sourceInvoiceNumber) items.push(`Z faktury č.: ${template.sourceInvoiceNumber}`);
  if (template.supplier?.name) items.push(`Dodavatel: ${template.supplier.name}`);
  if (template.supplier?.ico) items.push(`IČ: ${template.supplier.ico}`);
  if (template.customer?.name) items.push(`Odběratel: ${template.customer.name}`);
  items.push(`Počet položek: ${template.items?.length || 0}`);
  if (template.savedAt) {
    const saved = new Date(template.savedAt);
    if (!Number.isNaN(saved.getTime())) {
      items.push(`Uloženo: ${saved.toLocaleString("cs-CZ")}`);
    }
  }
  return items;
}

function openTemplateSaveModal(existing) {
  const exists = templateExists(existing);
  const title = document.getElementById("template-save-modal-title");
  const text = document.getElementById("template-save-modal-text");
  const confirmBtn = document.getElementById("template-save-modal-confirm");
  const existingBox = document.getElementById("template-save-existing");
  const existingInfo = document.getElementById("template-save-existing-info");

  if (exists) {
    title.textContent = "Přepsat uloženou šablonu?";
    text.textContent =
      "Šablona už existuje. Chceš ji přepsat údaji z této faktury (dodavatel, odběratel, platba, položky)?";
    confirmBtn.textContent = "Přepsat";
    existingInfo.innerHTML = buildTemplateInfoItems(existing)
      .map((line) => `<li>${line.replace(/</g, "&lt;")}</li>`)
      .join("");
    existingBox.classList.remove("hidden");
  } else {
    title.textContent = "Uložit jako šablonu?";
    text.textContent =
      "Chceš uložit údaje z této faktury jako šablonu (dodavatel, odběratel, platba, položky)?";
    confirmBtn.textContent = "Uložit";
    existingInfo.innerHTML = "";
    existingBox.classList.add("hidden");
  }

  document.getElementById("template-save-modal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  confirmBtn.focus();
}

function closeTemplateSaveModal() {
  document.getElementById("template-save-modal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function saveTemplate() {
  if (!(await validateInvoiceNumberOrToast())) return;

  try {
    const existing = await FakturaStorage.getTemplate();
    openTemplateSaveModal(existing);
  } catch (err) {
    alert(err.message || "Nepodařilo se načíst stávající šablonu.");
  }
}

async function confirmSaveTemplate() {
  const btn = document.getElementById("template-save-modal-confirm");
  btn.disabled = true;

  const data = InvoiceModel.collectFromForm();
  const template = InvoiceModel.extractTemplateFromInvoice(data);

  try {
    await FakturaStorage.saveTemplate(template);
    closeTemplateSaveModal();
    const location = await FakturaStorage.getSaveLocationLabel();
    showToast(
      (await FakturaStorage.getStorageStatus()).storage === "postgres"
        ? `Šablona uložena (${location})`
        : "Šablona uložena do data/sablona.json"
    );
  } catch (err) {
    alert(err.message || "Uložení šablony se nezdařilo.");
  } finally {
    btn.disabled = false;
  }
}

function initTemplateSaveModal() {
  document.getElementById("template-save-modal-cancel").addEventListener("click", closeTemplateSaveModal);
  document.getElementById("template-save-modal-confirm").addEventListener("click", confirmSaveTemplate);
  document.getElementById("template-save-modal-close").addEventListener("click", closeTemplateSaveModal);
  document.getElementById("template-save-modal-backdrop").addEventListener("click", closeTemplateSaveModal);

  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("template-save-modal");
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeTemplateSaveModal();
    }
  });
}

async function loadInvoiceFromParams() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const mode = params.get("mode");

  try {
    if (id) {
      const invoice = await FakturaStorage.getInvoice(id);
      InvoiceModel.applyToForm(invoice, { rebuildRows: rebuildItemRows });
      const root = document.getElementById("invoice-root");
      if (root) root.dataset.resolved = invoice.resolved ? "1" : "";
      document.title = `Faktura ${invoice.invoiceNumber || invoice.id} – editor`;
      return;
    }

    let invoice = InvoiceModel.defaultEmptyInvoice();

    if (mode === "template" && (await FakturaStorage.hasTemplate())) {
      const template = await FakturaStorage.getTemplate();
      invoice = InvoiceModel.applyTemplateToInvoice(invoice, template);
    }

    InvoiceModel.applyToForm(invoice, { rebuildRows: rebuildItemRows });
  } catch (err) {
    alert(err.message || "Načtení faktury se nezdařilo.");
    window.location.href = "index.html";
  }
}

async function init() {
  await loadInvoiceFromParams();

  document.getElementById("items-body").addEventListener("input", (e) => {
    if (e.target.matches(".qty, .unit-price")) {
      calculateGrandTotal();
    }
  });

  document.getElementById("btn-add-row").addEventListener("click", () => createItemRow());
  document.getElementById("btn-pdf").addEventListener("click", downloadPdf);
  document.getElementById("btn-save").addEventListener("click", saveInvoice);
  document.getElementById("btn-save-template").addEventListener("click", saveTemplate);
  initRemoveModal();
  initTemplateSaveModal();
  PaymentQr.bindPaymentQrUpdates();

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
