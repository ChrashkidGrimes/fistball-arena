import { test } from "node:test";
import assert from "node:assert/strict";
import { flagFor, countryCode, countryOf } from "./flags.js";

test("every country, in several languages, ignoring case and accents", () => {
  for (const name of ["Germany", "Deutschland", "Alemanha", "Alemania", "germany", " GERMANY "]) assert.equal(flagFor(name), "🇩🇪", name);
  for (const name of ["New Zealand", "Neuseeland", "Nova Zelândia", "Nueva Zelanda"]) assert.equal(flagFor(name), "🇳🇿", name);
  for (const name of ["Österreich", "Osterreich", "Austria", "Áustria"]) assert.equal(flagFor(name), "🇦🇹", name);
  assert.equal(flagFor("Japan"), "🇯🇵");
  assert.equal(flagFor("Schweiz"), "🇨🇭");
  assert.equal(flagFor("Côte d’Ivoire"), flagFor("Cote d'Ivoire"));
});

test("names of the old fixed table still work", () => {
  const old = { Austria: "🇦🇹", Brazil: "🇧🇷", Germany: "🇩🇪", Switzerland: "🇨🇭", Chile: "🇨🇱", India: "🇮🇳", Namibia: "🇳🇦", Kenya: "🇰🇪",
    "New Zealand": "🇳🇿", Italy: "🇮🇹", "Czech Republic": "🇨🇿", Denmark: "🇩🇰", Serbia: "🇷🇸", Argentina: "🇦🇷", Poland: "🇵🇱",
    "United States": "🇺🇸", "United States of America": "🇺🇸", USA: "🇺🇸", "Estados Unidos": "🇺🇸", France: "🇫🇷", Belgium: "🇧🇪",
    Spain: "🇪🇸", Netherlands: "🇳🇱", Brasil: "🇧🇷", Uruguay: "🇺🇾", Uruguai: "🇺🇾", Paraguay: "🇵🇾", Paraguai: "🇵🇾",
    Colombia: "🇨🇴", "Colômbia": "🇨🇴", Peru: "🇵🇪", "Perú": "🇵🇪", Bolivia: "🇧🇴", "Bolívia": "🇧🇴", Ecuador: "🇪🇨",
    Equador: "🇪🇨", Venezuela: "🇻🇪" };
  for (const [name, flag] of Object.entries(old)) assert.equal(flagFor(name), flag, name);
});

test("team names: country before ' - '; unknown and non-countries give no flag", () => {
  assert.equal(countryOf("Austria - WEC"), "Austria");
  assert.equal(flagFor("Brasil - U18 Men"), "🇧🇷");
  for (const name of ["", null, undefined, "TV Pfungstadt", "Winner Semifinal 1", "European Union", "United Nations", "Unknown Region"]) assert.equal(flagFor(name), "", String(name));
});

test("aliases and home nations", () => {
  assert.equal(flagFor("UK"), "🇬🇧");
  assert.equal(flagFor("England"), "🏴󠁧󠁢󠁥󠁮󠁧󠁿");
  assert.equal(countryCode("Deutschland"), "DE");
  assert.equal(countryCode("England"), "GB");
  assert.equal(countryCode("Atlantis"), "");
});
