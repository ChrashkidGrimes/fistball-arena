import { test } from "node:test";
import assert from "node:assert/strict";
import { autoAssign } from "./assign.js";

const D = "12/09/26", D2 = "13/09/26";
const ref = (first, country, extra = {}) => ({ first, name: "Ref", country, roles: ["SR"], gender: "m", ...extra });
let nr = 0;
const game = (over = {}) => ({
  id: `g${++nr}`, nr, date: D, time: "10:00", court: 1, category: "National Teams Men", round: "Qualification round",
  teamA: { name: "Germany" }, teamB: { name: "Brazil" }, refs: {}, ...over,
});
const at = (res, g) => res.games.find((x) => x.id === g.id).refs;

test("fills r1/r2 without hard violations and never uses a playing nation", () => {
  const offs = [ref("Gerd", "Germany"), ref("Bia", "Brazil"), ref("Sepp", "Switzerland"), ref("Dan", "Denmark")];
  const g = game();
  const res = autoAssign([g], offs, []);
  const r = at(res, g);
  assert.deepEqual(new Set([r.r1, r.r2]), new Set(["Sepp Ref", "Dan Ref"]));
  assert.equal(res.after.counts.hard, 0);
  assert.equal(res.proposals.length, 2);
});

test("knockout r2 from a playing nation only when no neutral referee is available", () => {
  const offs = [ref("Gerd", "Germany"), ref("Sepp", "Switzerland")];
  const ko = game({ round: "Semifinal 1" });
  const r = at(autoAssign([ko], offs, []), ko);
  assert.equal(r.r1, "Sepp Ref");
  assert.equal(r.r2, "Gerd Ref");
  // With a second neutral referee the non-neutral one is not used.
  const r2 = at(autoAssign([ko], [...offs, ref("Dan", "Denmark")], []), ko);
  assert.deepEqual(new Set([r2.r1, r2.r2]), new Set(["Sepp Ref", "Dan Ref"]));
  // In group games it stays empty instead.
  const grp = game();
  const res = autoAssign([grp], offs, []);
  assert.equal(at(res, grp).r2 ?? "", "");
  assert.deepEqual(res.unfilled.map((u) => u.slot), ["r2"]);
});

test("women's final gets a female referee", () => {
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ida", "Italy", { gender: "f" })];
  const g = game({ category: "National Teams Women", round: "Gold medal match" });
  const r = at(autoAssign([g], offs, []), g);
  assert.ok([r.r1, r.r2].includes("Ida Ref"));
});

test("locked cells stay unless overwrite", () => {
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ola", "Norway")];
  const g = game({ refs: { r1: "Ola Ref" } });
  const res = autoAssign([g], offs, []);
  assert.equal(at(res, g).r1, "Ola Ref");
  assert.ok(!res.proposals.some((p) => p.slot === "r1"));
  const res2 = autoAssign([g], offs, [], { overwrite: true });
  assert.equal(res2.games[0].refs.r1 !== "" && res2.games[0].refs.r2 !== "", true);
});

test("respects availability and avoids double booking", () => {
  const away = ref("Away", "Spain", { availability: { [D]: { status: "unavailable" } } });
  const offs = [away, ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ola", "Norway"), ref("Ida", "Italy")];
  const g1 = game(), g2 = game({ court: 2 });
  const res = autoAssign([g1, g2], offs, []);
  const names = [at(res, g1).r1, at(res, g1).r2, at(res, g2).r1, at(res, g2).r2];
  assert.equal(new Set(names).size, 4);
  assert.ok(!names.includes("Away Ref"));
  assert.equal(res.after.counts.hard, 0);
});

test("balances load and avoids games in a row", () => {
  const offs = ["A", "B", "C", "D"].map((x, i) => ref(x, ["Spain", "Italy", "Norway", "Chile"][i]));
  const gs = ["09:00", "10:00", "11:00", "12:00"].map((t) => game({ time: t }));
  const res = autoAssign(gs, offs, []);
  assert.equal(res.after.counts.hard, 0);
  const count = {};
  for (const g of res.games) for (const s of ["r1", "r2"]) count[g.refs[s]] = (count[g.refs[s]] || 0) + 1;
  assert.deepEqual(Object.values(count), [2, 2, 2, 2]);
  // Nobody works two rounds in a row when it can be avoided.
  assert.equal(res.after.list.filter((i) => i.code === "inRow").length, 0);
});

test("LR pairs work together; a pair dissolves when a member is away", () => {
  const sr = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark")];
  const lr = (first, pair, extra = {}) => ({ first, name: "Lr", roles: ["LR"], lrPair: pair, ...extra });
  const p1 = lr("P1", "p"), p2 = lr("P2", "p"), q1 = lr("Q1", "q"), solo = lr("Solo", "");
  const g = game();
  const r = at(autoAssign([g], [...sr, p1, solo, q1, p2], []), g);
  assert.deepEqual(new Set([r.a1, r.a2]), new Set(["P1 Lr", "P2 Lr"]));
  // P2 away on day 2 → P1 is a solo line judge; still filled, no pair-split warning.
  const p2away = { ...p2, availability: { [D2]: { status: "unavailable" } } };
  const g2 = game({ date: D2 });
  const res = autoAssign([g2], [...sr, p1, p2away, solo], []);
  const r2 = at(res, g2);
  assert.ok(r2.a1 && r2.a2);
  assert.ok(!res.after.list.some((i) => i.code === "pairSplit"));
});

test("scorer: nation and club don't matter; only filled when an AS pool exists", () => {
  const sr = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark")];
  const g = game();
  assert.equal(at(autoAssign([g], sr, []), g).clerk ?? "", "");
  const as = { first: "Kurt", name: "Clerk", roles: ["AS"], country: "Germany" };
  assert.equal(at(autoAssign([g], [...sr, as], []), g).clerk, "Kurt Clerk");
});

test("knockout games with undetermined teams are skipped", () => {
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark")];
  const g = game({ round: "Gold medal match", teamA: { name: "Winner Semifinal 1" }, teamB: { name: "Winner Semifinal 2" } });
  const res = autoAssign([g], offs, []);
  assert.deepEqual(res.skipped, [g.id]);
  assert.equal(res.proposals.length, 0);
});

test("only the selected days are assigned", () => {
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark")];
  const g1 = game(), g2 = game({ date: D2 });
  const res = autoAssign([g1, g2], offs, [], { days: [D2] });
  assert.equal(at(res, g1).r1 ?? "", "");
  assert.ok(at(res, g2).r1);
});
