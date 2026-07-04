const BankUtils = (() => {
  const CZECH_BANKS = {
    "0100": { swift: "KOMBCZPPXXX", name: "Komerční banka" },
    "0300": { swift: "CEKOCZPP", name: "ČSOB" },
    "0600": { swift: "AGBACZPP", name: "MONETA Money Bank" },
    "0710": { swift: "CNBACZPP", name: "Česká národní banka" },
    "0800": { swift: "GIBACZPX", name: "Česká spořitelna" },
    "2010": { swift: "FIOBCZPPXXX", name: "Fio banka" },
    "2020": { swift: "BOTKCZPP", name: "MUFG Bank" },
    "2060": { swift: "CITFCZPP", name: "Citfin" },
    "2070": { swift: "MPUBCZPP", name: "TRINITY BANK" },
    "2100": { swift: "BACXCZPP", name: "UniCredit Bank" },
    "2200": { swift: "COBACZPX", name: "Peněžní dům" },
    "2220": { swift: "ARTTCZPP", name: "Artesa" },
    "2250": { swift: "CTASCZ22", name: "Creditas" },
    "2260": { swift: "NEPACZPP", name: "NEY" },
    "2600": { swift: "CITICZPX", name: "Citibank Europe" },
    "2700": { swift: "BACXCZPP", name: "UniCredit Bank" },
    "3030": { swift: "AIRACZPP", name: "Air Bank" },
    "3060": { swift: "BPKOCZPP", name: "PKO BP" },
    "3500": { swift: "INGBCZPP", name: "ING Bank" },
    "4300": { swift: "NRSBCZPP", name: "Národní rozvojová banka" },
    "5500": { swift: "RZBCCZPP", name: "Raiffeisenbank" },
    "5800": { swift: "JTBPCZPP", name: "J&T BANKA" },
    "6000": { swift: "PMBPCZPP", name: "PPF banka" },
    "6100": { swift: "EQBKCZPP", name: "Equa bank" },
    "6200": { swift: "COBACZPP", name: "mBank" },
    "6210": { swift: "BREXCZPP", name: "BNP Paribas" },
    "6300": { swift: "GEBACZPP", name: "BNP Paribas Fortis" },
    "6700": { swift: "SUBACZPP", name: "Všeobecná úverová banka" },
    "6800": { swift: "VBOECZ2X", name: "Sberbank CZ" },
    "7910": { swift: "DEUTCZPX", name: "Deutsche Bank" },
    "8030": { swift: "GENOCZ21", name: "Volksbank Raiffeisenbank Nordoberpfalz" },
    "8040": { swift: "OBKLCZ2X", name: "Oberbank AG" },
    "8090": { swift: "CZEECZPP", name: "Česká exportní banka" },
    "8150": { swift: "MIDLCZPP", name: "HSBC" },
    "8190": { swift: "MOBPCZPP", name: "Mobilní peníze" },
    "8198": { swift: "FFCSCZPP", name: "FAS finance" },
    "8199": { swift: "MOBPCZPP", name: "Mobilní peníze" },
    "8200": { swift: "FIOBCZPPXXX", name: "Fio banka" },
  };

  const DEFAULT_CONSTANT_SYMBOL = "0308";

  function normalizeIban(value) {
    return String(value || "").replace(/\s/g, "").toUpperCase();
  }

  function formatIban(value) {
    const iban = normalizeIban(value);
    return iban.replace(/(.{4})/g, "$1 ").trim();
  }

  function trimLeadingZeros(value) {
    const trimmed = String(value || "").replace(/^0+/, "");
    return trimmed || "0";
  }

  function formatCzechAccountNumber(bankCode, prefix, account) {
    const combined = trimLeadingZeros(`${prefix}${account}`);
    return `${combined}/${bankCode}`;
  }

  function parseCzechIban(ibanInput) {
    const iban = normalizeIban(ibanInput);
    if (!/^CZ\d{22}$/.test(iban)) return null;

    const bankCode = iban.slice(4, 8);
    const prefix = iban.slice(8, 14);
    const account = iban.slice(14, 24);
    const bank = CZECH_BANKS[bankCode] || null;

    return {
      iban: formatIban(iban),
      bankCode,
      accountNumber: formatCzechAccountNumber(bankCode, prefix, account),
      swift: bank?.swift || "",
      bankName: bank?.name || "",
    };
  }

  function getBankByCode(bankCode) {
    return CZECH_BANKS[String(bankCode || "").padStart(4, "0").slice(-4)] || null;
  }

  return {
    DEFAULT_CONSTANT_SYMBOL,
    normalizeIban,
    formatIban,
    parseCzechIban,
    getBankByCode,
    CZECH_BANKS,
  };
})();
