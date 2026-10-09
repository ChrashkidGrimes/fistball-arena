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

/* ---------- referee shirts ---------- */
import { checkRefShirts, suggestRefShirts } from "./kits.js";

const REF = [{ id: "y", name: "Yellow", shirt: YELLOW }, { id: "k", name: "Black", shirt: BLACK }, { id: "r", name: "Red", shirt: RED }];
const refOf = (res, g) => res.games.find((x) => x.id === g.id).kit.R;

test("checkRefShirts: clash with a team shirt, unresolvable, unknown colour", () => {
  const tk = { A: [kit(YELLOW)], B: [kit(BLUE)], C: [kit(BLACK)], D: [kit(RED)] };
  const g1 = game("A", "B", D1, "09:00", { kit: { A: 1, B: 1, R: "y" } });
  const g2 = game("A", "B", D1, "10:00", { kit: { A: 1, B: 1, R: "k" } });
  const g3 = game("A", "C", D1, "11:00", { kit: { A: 1, B: 1 } });
  const g4 = game("C", "D", D1, "12:00", { kit: { A: 1, B: 1, R: "gone" } });
  const res = checkRefShirts([g1, g2, g3, g4], tk, REF);
  assert.equal(res[g1.id].level, "clash");
  assert.equal(res[g2.id], undefined);
  assert.equal(res[g4.id].level, "unknown");
  // Without red, yellow v black leaves no contrasting colour.
  const g5 = game("A", "C", D1, "13:00", { kit: { A: 1, B: 1 } });
  const res2 = checkRefShirts([g5], tk, REF.slice(0, 2));
  assert.equal(res2[g5.id].level, "unresolvable");
  assert.deepEqual(checkRefShirts([g1], tk, []), {});
});

test("suggestRefShirts: one colour for the whole day when it fits every game", () => {
  const tk = { A: [kit(WHITE)], B: [kit(BLUE)], C: [kit(RED)] };
  const gs = [game("A", "B", D1, "09:00", { kit: { A: 1, B: 1 } }), game("B", "C", D1, "10:00", { kit: { A: 1, B: 1 } })];
  const res = suggestRefShirts(gs, tk, REF);
  assert.equal(refOf(res, gs[1]), refOf(res, gs[0]));
  assert.ok(["y", "k"].includes(refOf(res, gs[0])));
  assert.deepEqual(res.unresolvable, []);
  assert.deepEqual(checkRefShirts(res.games, tk, REF), {});
});

test("suggestRefShirts: never clashes; keeps an official's colour where possible", () => {
  // Game 1 has a yellow team, game 2 a black team, game 3 neither.
  const tk = { Y: [kit(YELLOW)], K: [kit(BLACK)], W: [kit(WHITE)], B: [kit(BLUE)] };
  const refs = { r1: "Sepp", r2: "Dan" };
  const g1 = game("Y", "W", D1, "09:00", { kit: { A: 1, B: 1 }, refs });
  const g2 = game("K", "B", D1, "10:00", { kit: { A: 1, B: 1 }, refs: { r1: "Ida", r2: "Ola" } });
  const g3 = game("W", "B", D1, "11:00", { kit: { A: 1, B: 1 }, refs });
  const res = suggestRefShirts([g1, g2, g3], tk, REF);
  assert.deepEqual(checkRefShirts(res.games, tk, REF), {});
  assert.notEqual(refOf(res, g1), "y");
  assert.notEqual(refOf(res, g2), "k");
  // Sepp and Dan keep the colour of their first game in game 3.
  assert.equal(refOf(res, g3), refOf(res, g1));
});

test("suggestRefShirts: locked colours stay unless overwrite; unresolvable reported", () => {
  const tk = { A: [kit(WHITE)], B: [kit(BLUE)], Y: [kit(YELLOW)], K: [kit(BLACK)] };
  const g1 = game("A", "B", D1, "09:00", { kit: { A: 1, B: 1, R: "r" } });
  const g2 = game("Y", "K", D1, "10:00", { kit: { A: 1, B: 1 } });
  const res = suggestRefShirts([g1, g2], tk, REF.slice(0, 2));
  assert.equal(refOf(res, g1), "k"); // "r" isn't in this list any more → replaced
  const res2 = suggestRefShirts([g1, g2], tk, REF);
  assert.equal(refOf(res2, g1), "r");
  assert.ok(!res2.proposals.some((p) => p.gameId === g1.id));
  assert.deepEqual(suggestRefShirts([g2], tk, REF.slice(0, 2)).unresolvable, [g2.id]);
  // A locked colour that clashes is kept — unless overwriting.
  const g3 = game("Y", "B", D1, "11:00", { kit: { A: 1, B: 1, R: "y" } });
  assert.equal(refOf(suggestRefShirts([g3], tk, REF), g3), "y");
  assert.notEqual(refOf(suggestRefShirts([g3], tk, REF, { overwrite: true }), g3), "y");
});

test("suggestRefShirts: no colour preference — list order doesn't matter, ties are balanced", () => {
  // No team shirts set → every colour fits equally well.
  const gs = [game("P", "Q", D1, "09:00"), game("P", "Q", D2, "09:00")];
  const a = suggestRefShirts(gs, {}, REF), b = suggestRefShirts(gs, {}, [...REF].reverse());
  assert.deepEqual(a.games.map((g) => g.kit.R), b.games.map((g) => g.kit.R));
  // Two days, equal contrast → two different colours rather than the same one twice.
  assert.notEqual(a.games[0].kit.R, a.games[1].kit.R);
});
