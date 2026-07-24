const AppMeta = (() => {
  const NAME = "MJ Faktura";
  const VERSION = "1.2.0";
  const YEAR = new Date().getFullYear();

  function mountVersionLabels(root = document) {
    root.querySelectorAll("[data-app-version]").forEach((el) => {
      el.textContent = `verze ${VERSION}`;
    });
  }

  function mountCopyrightYears(root = document) {
    root.querySelectorAll("[data-app-year]").forEach((el) => {
      el.textContent = String(YEAR);
    });
  }

  function mount(root = document) {
    mountVersionLabels(root);
    mountCopyrightYears(root);
  }

  return { NAME, VERSION, YEAR, mount };
})();
