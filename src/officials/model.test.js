import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRoles, parseGender, rolesOf, canFill, availabilityOn, availableAt, parseSlots,
  teamMeta, sameCountry, sameClub, isWomensGame, isFinalsRound, isWomenFinal,
} from "./model.js";

test("parseRoles: codes and words, canonical order, unknowns ignored", () => {
  assert.deepEqual(parseRoles("LR, SR"), ["SR", "LR"]);
  assert.deepEqual(parseRoles("Referee; Line judge / Scorer"), ["SR", "AS", "LR"]);
  assert.deepEqual(parseRoles("Schiedsrichter/Anschreiber"), ["SR", "AS"]);
  assert.deepEqual(parseRoles(["as", "lr"]), ["AS", "LR"]);
  assert.deepEqual(parseRoles("coach"), []);
  assert.deepEqual(parseRoles(""), []);
});

test("parseGender", () => {
  for (const v of ["F", "female", "W", "Damen", "Feminino"]) assert.equal(parseGender(v), "f", v);
  for (const v of ["M", "male", "Herren", "Männlich", "Masculino"]) assert.equal(parseGender(v), "m", v);
  assert.equal(parseGender(""), "");
  assert.equal(parseGender("x"), "");
});

test("roles: missing roles = may fill any slot", () => {
  assert.deepEqual(rolesOf({}), ["SR", "AS", "LR"]);
  assert.equal(canFill({}, "a1"), true);
  const lr = { roles: ["LR"] };
  assert.equal(canFill(lr, "a2"), true);
  assert.equal(canFill(lr, "r1"), false);
  assert.equal(canFill(lr, "clerk"), false);
});

test("availability: missing date = available any time; slots whitelist; reserve is usable", () => {
  const o = { availability: {
    "12/09/26": { status: "unavailable" },
    "13/09/26": { status: "reserve" },
    "14/09/26": { status: "available", slots: ["10:30", "11:45"] },
  } };
  assert.deepEqual(availabilityOn(o, "11/09/26"), { status: "available", slots: [] });
  assert.equal(availableAt(o, "11/09/26", "09:00"), true);
  assert.equal(availableAt(o, "12/09/26", "09:00"), false);
  assert.equal(availableAt(o, "13/09/26", "09:00"), true);
  assert.equal(availabilityOn(o, "13/09/26").status, "reserve");
  assert.equal(availableAt(o, "14/09/26", "10:30"), true);
  assert.equal(availableAt(o, "14/09/26", "13:00"), false);
  assert.equal(availableAt({ availability: { d: { status: "available", slots: ["09:00"] } } }, "d", "9:00"), true);
  assert.equal(availabilityOn({ availability: { "x": { status: "bogus" } } }, "x").status, "available");
});

test("parseSlots normalises, sorts and de-duplicates", () => {
  assert.deepEqual(parseSlots("11:45, 9:00 / 10.30 11:45"), ["09:00", "10:30", "11:45"]);
  assert.deepEqual(parseSlots(""), []);
});

test("teamMeta: explicit entry fields first, else the team name", () => {
  const entries = [
    { name: "TV Brettorf", club: "TV Brettorf", country: "Germany" },
    { name: "Ahlhorn II", club: "Ahlhorner SV" },
    { name: "Austria" },
  ];
  assert.deepEqual(teamMeta(entries, { name: "Ahlhorn II" }), { country: "Ahlhorn II", club: "Ahlhorner SV" });
  assert.deepEqual(teamMeta(entries, "TV Brettorf"), { country: "Germany", club: "TV Brettorf" });
  // "Country - Category" names fall back to the base entry / name.
  assert.deepEqual(teamMeta(entries, "Austria - WEC"), { country: "Austria", club: "Austria" });
  assert.deepEqual(teamMeta([], "Brazil - U18"), { country: "Brazil", club: "Brazil" });
});

test("sameCountry / sameClub", () => {
  assert.equal(sameCountry("Germany", "germany "), true);
  assert.equal(sameCountry("Brasil", "Brazil"), true);
  assert.equal(sameCountry("Austria", "Germany"), false);
  assert.equal(sameCountry("", ""), false);
  assert.equal(sameCountry("Narnia", "Atlantis"), false);
  assert.equal(sameClub("Ahlhorner SV", "ahlhorner sv"), true);
  assert.equal(sameClub("", ""), false);
});

test("isFinalsRound matches the generator's round strings", () => {
  for (const r of ["Semifinal", "Semifinal 1", "Semifinal 2", "Bronze medal match", "Gold medal match", "Placement 3-5", "Final", "Halbfinale", "Spiel um Platz 3"]) {
    assert.equal(isFinalsRound(r), true, r);
  }
  for (const r of ["Qualification round", "Quarterfinal", "Quarterfinal 2", "Placement 5-6", "Placement 7-8", "", undefined]) {
    assert.equal(isFinalsRound(r), false, String(r));
  }
});

test("isWomenFinal: women's category and a finals round", () => {
  assert.equal(isWomensGame({ category: "Clubs U18 Women" }), true);
  assert.equal(isWomensGame({ category: "Clubs U18 Men" }), false);
  assert.equal(isWomenFinal({ category: "National Teams Women", round: "Gold medal match" }), true);
  assert.equal(isWomenFinal({ category: "National Teams Women", round: "Quarterfinal 1" }), false);
  assert.equal(isWomenFinal({ category: "National Teams Men", round: "Semifinal 1" }), false);
});
