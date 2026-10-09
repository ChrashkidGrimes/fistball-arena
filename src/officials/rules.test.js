import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAssignments, isKnockout, cellLevel } from "./rules.js";

// Small fixture: Germany, Austria, Brazil, Switzerland; officials by nation.
const D = "12/09/26";
const O = {
  ger: { first: "Gerd", name: "Ger", country: "Germany", gender: "m", roles: ["SR"] },
  aut: { first: "Anna", name: "Aut", country: "Austria", gender: "f", roles: ["SR"] },
  sui: { first: "Sepp", name: "Sui", country: "Switzerland", gender: "m", roles: ["SR"] },
  ita: { first: "Ida", name: "Ita", country: "Italy", gender: "f", roles: ["SR", "LR"] },
  den: { first: "Dan", name: "Den", country: "Denmark", gender: "m", roles: ["SR"] },
  lrGer: { first: "Lina", name: "Lr", country: "Germany", roles: ["LR"] },
  asGer: { first: "Kurt", name: "Clerk", country: "Germany", club: "TV Brettorf", roles: ["AS"] },
};
const N = (o) => `${o.first} ${o.name}`;
const officials = Object.values(O);
let nr = 0;
const game = (over = {}) => ({
  id: `g${++nr}`, nr, date: D, time: "10:00", court: 1, category: "National Teams Men", round: "Qualification round",
  teamA: { name: "Germany" }, teamB: { name: "Brazil" },
  refs: { r1: N(O.sui), r2: N(O.den) }, ...over,
});
// Issue codes of one cell. "missing" and "inRow" are left out unless asked for,
// so each test only sees the rule it is about.
const codes = (res, g, slot, keep = []) => (res.cells[g.id]?.[slot] || [])
  .filter((i) => !["missing", "inRow"].includes(i.code) || keep.includes(i.code))
  .map((i) => `${i.level}:${i.code}`);

test("clean game has no issues", () => {
  const g = game({ refs: { r1: N(O.sui), r2: N(O.den), clerk: N(O.asGer), a1: N(O.lrGer), a2: N(O.ita) }, teamA: { name: "Austria" } });
  const res = checkAssignments([g], officials, []);
  assert.deepEqual(res.list, []);
  assert.deepEqual(res.counts, { hard: 0, soft: 0, missing: 0 });
});

test("nation: hard for r1, hard for r2 in group games, soft for r2 in knockout", () => {
  const g1 = game({ refs: { r1: N(O.ger), r2: N(O.den) } });
  const g2 = game({ time: "11:00", refs: { r1: N(O.sui), r2: N(O.ger) } });
  const g3 = game({ time: "12:00", round: "Semifinal 1", refs: { r1: N(O.sui), r2: N(O.ger) } });
  const g4 = game({ time: "13:00", round: "Semifinal 2", refs: { r1: N(O.ger), r2: N(O.sui) } });
  const res = checkAssignments([g1, g2, g3, g4], officials, []);
  assert.deepEqual(codes(res, g1, "r1"), ["hard:nation"]);
  assert.deepEqual(codes(res, g2, "r2"), ["hard:nation"]);
  assert.deepEqual(codes(res, g3, "r2"), ["soft:r2Nation"]);
  assert.deepEqual(codes(res, g4, "r1"), ["hard:nation"]);
});

test("nation: irrelevant for scorer and line judges, warning for a referee on the lines", () => {
  const g = game({ teamB: { name: "Italy" }, refs: { r1: N(O.sui), r2: N(O.den), clerk: N(O.asGer), a1: N(O.lrGer), a2: N(O.ita) } });
  const res = checkAssignments([g], officials, []);
  assert.deepEqual(codes(res, g, "clerk"), []);
  assert.deepEqual(codes(res, g, "a1"), []);
  assert.deepEqual(codes(res, g, "a2"), ["soft:srLRNation"]);
});

test("club: hard for referees, soft for line judges, irrelevant for the scorer", () => {
  const entries = [{ name: "TV Brettorf", club: "TV Brettorf", country: "Germany" }, { name: "Ahlhorn", club: "Ahlhorner SV", country: "Germany" }];
  const club = (first, roles) => ({ first, name: "X", club: "Ahlhorner SV", roles });
  const ref = club("Ref", ["SR"]), lr = club("Line", ["LR"]), as = club("Clerk", ["AS"]);
  const g = game({ teamA: { name: "TV Brettorf" }, teamB: { name: "Ahlhorn" }, refs: { r1: "Ref X", r2: N(O.sui), clerk: "Clerk X", a1: "Line X" } });
  const res = checkAssignments([g], [...officials, ref, lr, as], entries);
  assert.deepEqual(codes(res, g, "r1"), ["hard:club"]);
  assert.deepEqual(codes(res, g, "a1"), ["soft:lrClub"]);
  assert.deepEqual(codes(res, g, "clerk"), []);
});

test("availability: unavailable / outside time slots = hard, reserve = soft", () => {
  const o = (status, slots) => ({ first: "Av", name: status + (slots ? "s" : ""), roles: ["SR"], availability: { [D]: { status, ...(slots ? { slots } : {}) } } });
  const away = o("unavailable"), res_ = o("reserve"), late = o("available", ["14:00"]);
  const g = game({ refs: { r1: N(away), r2: N(res_) } });
  const g2 = game({ time: "12:00", refs: { r1: N(late), r2: N(O.sui) } });
  const res = checkAssignments([g, g2], [...officials, away, res_, late], []);
  assert.deepEqual(codes(res, g, "r1"), ["hard:unavailable"]);
  assert.deepEqual(codes(res, g, "r2"), ["soft:reserve"]);
  assert.deepEqual(codes(res, g2, "r1"), ["hard:unavailable"]);
});

test("double booking: same start time on another court, or twice in one game", () => {
  const g1 = game({ refs: { r1: N(O.sui), r2: N(O.den) } });
  const g2 = game({ court: 2, refs: { r1: N(O.ita), r2: N(O.sui) } });
  const g3 = game({ time: "11:00", refs: { r1: N(O.ita), r2: N(O.ita) } });
  const res = checkAssignments([g1, g2, g3], officials, []);
  assert.deepEqual(codes(res, g1, "r1"), ["hard:double"]);
  assert.deepEqual(codes(res, g2, "r2"), ["hard:double"]);
  assert.ok(codes(res, g3, "r1").includes("hard:double"));
  // Free-text names not in the registry are still checked.
  const g4 = game({ time: "15:00", refs: { r1: "Nobody Known", r2: N(O.den) } });
  const g5 = game({ time: "15:00", court: 2, refs: { r1: N(O.sui), r2: "nobody  known" } });
  const res2 = checkAssignments([g4, g5], officials, []);
  assert.deepEqual(codes(res2, g4, "r1"), ["hard:double"]);
});

test("role not allowed (only when roles are set)", () => {
  const anyone = { first: "Any", name: "One" };
  const g = game({ refs: { r1: N(O.sui), r2: N(O.den), clerk: N(O.lrGer), a1: N(anyone) } });
  const res = checkAssignments([g], [...officials, anyone], []);
  assert.deepEqual(codes(res, g, "clerk"), ["hard:role"]);
  assert.deepEqual(codes(res, g, "a1"), []);
});

test("women's finals: one female referee required", () => {
  const w = { category: "National Teams Women", round: "Gold medal match" };
  const ok = game({ ...w, refs: { r1: N(O.sui), r2: N(O.aut) }, teamA: { name: "Brazil" }, teamB: { name: "Italy" } });
  const bad = game({ ...w, time: "11:00", refs: { r1: N(O.sui), r2: N(O.den) } });
  const unknown = game({ ...w, time: "12:00", refs: { r1: N(O.sui), r2: "Not Registered" } });
  const group = game({ category: "National Teams Women", time: "13:00", refs: { r1: N(O.sui), r2: N(O.den) } });
  const res = checkAssignments([ok, bad, unknown, group], officials, []);
  assert.deepEqual(codes(res, ok, "r1"), []);
  assert.deepEqual(codes(res, bad, "r1"), ["hard:gender"]);
  assert.deepEqual(codes(res, bad, "r2"), ["hard:gender"]);
  assert.deepEqual(codes(res, unknown, "r1"), ["soft:gender"]);
  assert.deepEqual(codes(res, group, "r1"), []);
});

test("mandatory slots: r1/r2 always; LR / AS only when that pool exists", () => {
  const g = game({ refs: {} });
  const noPools = officials.map((o) => ({ ...o, roles: undefined }));
  const res = checkAssignments([g], noPools, []);
  assert.deepEqual(Object.keys(res.cells[g.id]).sort(), ["r1", "r2"]);
  assert.equal(res.counts.missing, 2);
  const res2 = checkAssignments([g], officials, []);
  assert.deepEqual(Object.keys(res2.cells[g.id]).sort(), ["a1", "a2", "clerk", "r1", "r2"]);
});

test("games in a row: 2 = warning, 3 = hard; a free round resets", () => {
  const times = ["09:00", "10:00", "11:00", "13:00", "14:00"];
  // Another game fills 12:00 so it counts as a round.
  const filler = game({ time: "12:00", refs: { r1: N(O.ita), r2: N(O.den) }, teamA: { name: "Austria" } });
  const gs = times.map((t) => game({ time: t, refs: { r1: N(O.sui), r2: t === "09:00" ? N(O.den) : N(O.aut) }, teamA: { name: "Italy" } }));
  const res = checkAssignments([...gs, filler], officials, []);
  const sui = gs.map((g) => codes(res, g, "r1", ["inRow"]).filter((c) => c.endsWith("inRow")));
  assert.deepEqual(sui, [[], ["soft:inRow"], ["hard:inRow"], [], ["soft:inRow"]]);
  // Unpadded imported times line up with padded ones.
  const a = game({ time: "9:00", date: "13/09/26" }), b = game({ time: "10:00", date: "13/09/26", court: 2 });
  const res2 = checkAssignments([a, b], officials, []);
  assert.ok(res2.list.some((i) => i.code === "inRow"));
});

test("maxPerDay exceeded = warning on the extra games", () => {
  const cap = { first: "Cap", name: "One", roles: ["SR"], maxPerDay: 1 };
  const g1 = game({ time: "09:00", refs: { r1: N(cap), r2: N(O.den) } });
  const g2 = game({ time: "15:00", refs: { r1: N(cap), r2: N(O.den) } });
  const res = checkAssignments([g1, g2], [...officials, cap], []);
  assert.deepEqual(codes(res, g1, "r1"), []);
  assert.deepEqual(codes(res, g2, "r1"), ["soft:maxPerDay"]);
});

test("LR pair split = warning, unless the partner is away that day", () => {
  const p1 = { first: "P", name: "One", roles: ["LR"], lrPair: "p" };
  const p2 = { first: "P", name: "Two", roles: ["LR"], lrPair: "p" };
  const solo = { first: "S", name: "Olo", roles: ["LR"] };
  const g1 = game({ refs: { r1: N(O.sui), r2: N(O.den), a1: N(p1), a2: N(p2) } });
  const g2 = game({ time: "12:00", refs: { r1: N(O.sui), r2: N(O.den), a1: N(p1), a2: N(solo) } });
  const res = checkAssignments([g1, g2], [...officials, p1, p2, solo], []);
  assert.deepEqual(codes(res, g1, "a1"), []);
  assert.deepEqual(codes(res, g2, "a1"), ["soft:pairSplit"]);
  const away = { ...p2, availability: { [D]: { status: "unavailable" } } };
  const res2 = checkAssignments([g2], [...officials, p1, away, solo], []);
  assert.deepEqual(codes(res2, g2, "a1"), []);
});

test("isKnockout and cellLevel", () => {
  assert.equal(isKnockout({ round: "Qualification round" }), false);
  assert.equal(isKnockout({ round: "" }), false);
  assert.equal(isKnockout({ round: "Quarterfinal 1" }), true);
  assert.equal(isKnockout({ round: "Placement 5-6" }), true);
  assert.equal(isKnockout({ phase: "group", round: "Semifinal" }), false);
  assert.equal(cellLevel([{ level: "soft" }, { level: "hard" }]), "hard");
  assert.equal(cellLevel([{ level: "soft" }]), "soft");
  assert.equal(cellLevel(undefined), "");
});
