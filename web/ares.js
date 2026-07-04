const ARES_BASE = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";

function normalizeIco(value) {
  const ico = String(value || "").replace(/\D/g, "");
  if (ico.length < 8) return "";
  return ico.slice(0, 8);
}

function formatPsc(psc) {
  const digits = String(psc || "").replace(/\D/g, "");
  if (digits.length !== 5) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

function formatStreet(sidlo) {
  if (!sidlo) return "";
  if (sidlo.nazevUlice && sidlo.cisloDomovni) {
    let number = String(sidlo.cisloDomovni);
    if (sidlo.cisloOrientacni) {
      number += `/${sidlo.cisloOrientacni}${sidlo.cisloOrientacniPismeno || ""}`;
    }
    return `${sidlo.nazevUlice} ${number}`.trim();
  }
  const text = sidlo.textovaAdresa || "";
  return text.split(",")[0]?.trim() || "";
}

function formatCity(sidlo) {
  if (!sidlo) return "";
  const psc = formatPsc(sidlo.psc);
  const city = sidlo.nazevMestskeObvodu || sidlo.nazevObce || "";
  return [psc, city].filter(Boolean).join(" ").trim();
}

function isVatPayer(aresData) {
  return aresData?.seznamRegistraci?.stavZdrojeDph === "AKTIVNI";
}

function mapAresResponse(aresData) {
  const sidlo = aresData.sidlo || {};
  const vatPayer = isVatPayer(aresData);

  return {
    ico: aresData.ico || "",
    name: aresData.obchodniJmeno || "",
    address: formatStreet(sidlo),
    city: formatCity(sidlo),
    country: sidlo.nazevStatu || "Česká republika",
    dic: aresData.dic || "",
    vatNote: vatPayer ? "" : "Nejsme plátci DPH",
    vatPayer,
  };
}

async function fetchAresByIco(icoInput) {
  const ico = normalizeIco(icoInput);
  if (!ico) {
    throw new Error("Zadej platné IČO (8 číslic).");
  }

  const res = await fetch(`${ARES_BASE}/${ico}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MJ-Faktura/1.0",
    },
  });

  if (res.status === 404) {
    throw new Error(`Subjekt s IČO ${ico} nebyl v ARES nalezen.`);
  }

  if (!res.ok) {
    throw new Error(`ARES vrátil chybu (${res.status}). Zkus to znovu později.`);
  }

  const data = await res.json();
  if (!data?.ico) {
    throw new Error(`Subjekt s IČO ${ico} nebyl v ARES nalezen.`);
  }

  return mapAresResponse(data);
}

module.exports = {
  normalizeIco,
  fetchAresByIco,
  mapAresResponse,
};
