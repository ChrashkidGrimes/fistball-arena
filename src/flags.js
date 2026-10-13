// Country flag emojis by country name, for teams and officials. Team names are
// "Country - Category" (e.g. "Austria - WEC"), so flagFor() extracts the country.
// Shared across the Teams page, the games list and the súmula.
//
// Every country is recognised: names come from the browser's own country list
// (Intl.DisplayNames) in English, German, Portuguese, Spanish, French and
// Italian — "Germany", "Deutschland", "Alemanha" and "Alemania" all map to 🇩🇪 —
// plus a few common aliases. Matching ignores case, accents and punctuation.

const LANGS = ["en", "de", "pt", "es", "fr", "it"];
// Region codes with a name that are not countries.
const NOT_COUNTRIES = new Set(["EU", "EZ", "QO", "UN", "XA", "XB", "ZZ"]);
// Names the browser list doesn't use (short forms, older names, home nations).
const ALIASES = {
  USA: "US", "U.S.A.": "US", "United States of America": "US", America: "US",
  UK: "GB", "Great Britain": "GB", Britain: "GB",
  "Czech Republic": "CZ", Holland: "NL", Korea: "KR", "South Korea": "KR", "North Korea": "KP",
  Russia: "RU", "Ivory Coast": "CI", Swaziland: "SZ", Burma: "MM", "Cape Verde": "CV",
  "Republic of Ireland": "IE", Macedonia: "MK", Türkiye: "TR", Turkey: "TR",
  England: "gbeng", Scotland: "gbsct", Wales: "gbwls", "Northern Ireland": "GB",
};
// England / Scotland / Wales: emoji tag sequences (🏴 + subdivision tag).
const subdivisionFlag = (tag) => "\u{1F3F4}" + [...tag].map((c) => String.fromCodePoint(0xE0000 + c.charCodeAt(0))).join("") + "\u{E007F}";
const codeFlag = (code) => String.fromCodePoint(...[...code].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));

const key = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Deprecated codes (DD, SU, YU, UK, …) still have names ("Germany" for DD) —
// skip them: canonicalisation maps them to their successor.
const isCurrent = (code) => { try { return Intl.getCanonicalLocales(`und-${code}`)[0] === `und-${code}`; } catch { return false; } };

let index = null; // key(name) → ISO 3166 code (or subdivision tag)
function buildIndex() {
  const m = new Map();
  const add = (name, code) => { const k = key(name); if (k && !m.has(k)) m.set(k, code); };
  for (const [name, code] of Object.entries(ALIASES)) add(name, code);
  for (const lang of LANGS) {
    let names;
    try { names = new Intl.DisplayNames([lang], { type: "region" }); } catch { continue; }
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code) || !isCurrent(code)) continue;
      let name;
      try { name = names.of(code); } catch { continue; }
      if (name && name !== code) add(name, code);
    }
  }
  return m;
}

export function countryOf(teamName) {
  return String(teamName || "").split(" - ")[0].trim();
}

// ISO 3166 alpha-2 code for a country name in any supported language ("" if unknown).
export function countryCode(teamNameOrCountry) {
  index ||= buildIndex();
  const code = index.get(key(countryOf(teamNameOrCountry))) || "";
  return code.length === 2 ? code : code ? code.slice(0, 2).toUpperCase() : "";
}

export function flagFor(teamNameOrCountry) {
  index ||= buildIndex();
  const code = index.get(key(countryOf(teamNameOrCountry)));
  if (!code) return "";
  return code.length === 2 ? codeFlag(code) : subdivisionFlag(code);
}
