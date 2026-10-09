import { test } from "node:test";
import assert from "node:assert/strict";
import { deltaE, checkKits, countChanges, suggestKits, DEFAULT_KIT_RULES } from "./kits.js";

const WHITE = "#ffffff", OFFWHITE = "#f4f4f0", BLACK = "#1a1a1a", RED = "#e23b3b", BLUE = "#2f6df0", NAVY = "#1c2c66", YELLOW = "#f2c20a";
const kit = (shirt, shorts = "") => ({ shirt, shorts });
let nr = 0;
const game = (a, b, date, time, over = {}) => ({ id: `g${++nr}`, nr, date, time, teamA: { name: a }, teamB: { name: b }, kit: {}, ...over });
const kitOf = (res, g) => res.games.find((x) => x.id === g.id).kit;
const D1 = "12/09/26", D2 = "13/09/26", D3 = "14/09/26";

test("deltaE: identical 0, white/off-white close, white/black far, invalid = Infinity", () => {
  assert.equal(DEFAULT_KIT_RULES.threshold, 35);
  assert.equal(deltaE(WHITE, WHITE), 0);
  assert.ok(deltaE(WHITE, OFFWHITE) < 25);
  assert.ok(deltaE(WHITE, BLACK) > 90);
  assert.ok(deltaE(BLUE, NAVY) > 25);
  assert.equal(deltaE(WHITE, ""), Infinity);
  assert.equal(deltaE("#fff", WHITE), 0);
});

test("checkKits: clash and unresolvable; shorts are ignored", () => {
  const tk = {
    W: [kit(WHITE, BLACK), kit(RED, BLACK)],
    O: [kit(OFFWHITE, BLACK), kit(BLUE, WHITE)],
    X: [kit(WHITE)], Y: [kit(OFFWHITE)],
  };
  const g1 = game("W", "O", D1, "10:00", { kit: { A: 1, B: 1 } });
  const g2 = game("W", "O", D1, "11:00", { kit: { A: 2, B: 1 } });
  const g3 = game("X", "Y", D1, "12:00", { kit: { A: 1, B: 1 } });
  const g4 = game("W", "O", D1, "13:00", { kit: { A: 2, B: 2 } });
  const res = checkKits([g1, g2, g3, g4], tk);
  assert.equal(res[g1.id].level, "clash");
  assert.equal(res[g2.id], undefined); // same shorts, different shirts → fine
  assert.equal(res[g3.id].level, "unresolvable");
  assert.equal(res[g4.id], undefined);
});

test("countChanges: switching for one game and back = 2", () => {
  const gs = [game("A", "B", D1, "09:00", { kit: { A: 1 } }), game("A", "C", D1, "10:00", { kit: { A: 2 } }), game("A", "D", D1, "11:00", { kit: { A: 1 } })];
  assert.deepEqual(countChanges(gs), { A: { [D1]: 2 } });
});

test("one kit per team per day when possible", () => {
  const tk = { W: [kit(WHITE), kit(RED)], O: [kit(OFFWHITE), kit(BLUE)], B: [kit(BLACK), kit(YELLOW)] };
  const gs = [game("W", "O", D1, "09:00"), game("O", "B", D1, "10:00"), game("W", "B", D1, "11:00")];
  const res = suggestKits(gs, tk);
  assert.deepEqual(res.clashes, []);
  assert.deepEqual(res.changes, {});
  // Every team wears the same kit in all its games.
  for (const t of ["W", "O", "B"]) {
    const vals = res.games.flatMap((g) => (g.teamA.name === t ? [g.kit.A] : g.teamB.name === t ? [g.kit.B] : []));
    assert.equal(new Set(vals).size, 1, t);
  }
  // Uniform 1 preferred: only one of W / O has to switch.
  const k1 = res.games.flatMap((g) => [g.kit.A, g.kit.B]).filter((v) => v === 1).length;
  assert.ok(k1 >= 4);
});

test("alternates kits across days", () => {
  const tk = { A: [kit(WHITE), kit(RED)], B: [kit(BLACK), kit(YELLOW)] };
  const gs = [game("A", "B", D1, "10:00"), game("A", "B", D2, "10:00"), game("A", "B", D3, "10:00")];
  const res = suggestKits(gs, tk);
  assert.deepEqual(gs.map((g) => kitOf(res, g).A), [1, 2, 1]);
  assert.deepEqual(gs.map((g) => kitOf(res, g).B), [1, 2, 1]);
});

test("alternation continues from a day outside the selected days", () => {
  const tk = { A: [kit(WHITE), kit(RED)], B: [kit(BLACK), kit(YELLOW)] };
  const g1 = game("A", "B", D1, "10:00", { kit: { A: 2, B: 1 } }), g2 = game("A", "B", D2, "10:00");
  const res = suggestKits([g1, g2], tk, { days: [D2] });
  assert.deepEqual(kitOf(res, g2), { A: 1, B: 2 });
  assert.ok(!res.proposals.some((p) => p.gameId === g1.id));
});

test("minimal kit changes when one kit per day is impossible", () => {
  // W (white/red) plays O (off-white, fixed) and then R (red, fixed):
  // white clashes with O, red clashes with R → W must change exactly once.
  const tk = { W: [kit(WHITE), kit(RED)], O: [kit(OFFWHITE)], R: [kit("#e0393d")] };
  const g1 = game("W", "O", D1, "09:00"), g2 = game("W", "R", D1, "10:00"), g3 = game("W", "O", D1, "11:00");
  const res = suggestKits([g1, g2, g3], tk);
  assert.deepEqual(res.clashes, []);
  assert.deepEqual([g1, g2, g3].map((g) => kitOf(res, g).A), [2, 1, 2]);
  assert.deepEqual(res.changes, { W: { [D1]: 2 } });
});

test("unresolvable games are reported and don't block the rest", () => {
  const tk = { X: [kit(WHITE)], Y: [kit(OFFWHITE)], Z: [kit(BLACK), kit(RED)] };
  const g1 = game("X", "Y", D1, "09:00"), g2 = game("X", "Z", D1, "10:00");
  const res = suggestKits([g1, g2], tk);
  assert.deepEqual(res.unresolvable, [g1.id]);
  assert.deepEqual(kitOf(res, g2), { A: 1, B: 1 });
});

test("locked kits stay unless overwrite", () => {
  const tk = { A: [kit(WHITE), kit(RED)], B: [kit(BLACK), kit(YELLOW)] };
  const g = game("A", "B", D1, "10:00", { kit: { A: 2 } });
  const res = suggestKits([g], tk);
  assert.equal(kitOf(res, g).A, 2);
  assert.ok(!res.proposals.some((p) => p.side === "A"));
  assert.equal(kitOf(suggestKits([g], tk, { overwrite: true }), g).A, 1);
});

test("teams without kits are left alone", () => {
  const tk = { A: [kit(WHITE), kit(RED)] };
  const g = game("A", "Nobody", D1, "10:00");
  const res = suggestKits([g], tk);
  assert.deepEqual(kitOf(res, g), { A: 1 });
});
