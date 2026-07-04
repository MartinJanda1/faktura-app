const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mjFakturaDesktop", {
  isDesktop: true,
  exportInvoicePdf: () => ipcRenderer.invoke("export-invoice-pdf"),
});
