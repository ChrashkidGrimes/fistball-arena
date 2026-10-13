import { test } from "node:test";
import assert from "node:assert/strict";
import { teamPlans, officialPlans, planDays } from "./plans.js";

const D1 = "12/09/26", D2 = "13/09/26";
let nr = 0;
const game = (a, b, date, time, court, over = {}) => ({ id: `g${++nr}`, nr, date, time, court, category: "Men", round: "Qualification round", teamA: { name: a }, teamB: { name: b }, refs: {}, kit: {}, ...over });

test("teamPlans: per team and category, in time order, with the uniform worn; placeholders skipped", () => {
  const tk = { "X · Men": [{ shirt: "#e23b3b" }, { shirt: "#ffffff" }], Y: [{ shirt: "#2f6df0" }] };
  const g1 = game("X", "Y", D1, "10:00", 1, { kit: { A: 2, B: 1 } });
  const g2 = game("Y", "X", D1, "09:00", 2, { kit: { A: 1 } });
  const g3 = game("Winner Semifinal 1", "X", D2, "09:00", 1, { round: "Gold medal match" });
  const g4 = game("X", "Z", D1, "11:00", 1, { category: "Women" });
  const plans = teamPlans([g1, g2, g3, g4], tk);
  assert.deepEqual(plans.map((p) => p.key), ["X · Men", "X · Women", "Y · Men", "Z · Women"]);
  const x = plans[0];
  assert.deepEqual(x.rows.map((r) => r.g.id), [g2.id, g1.id, g3.id]);
  assert.equal(x.rows[1].kit.shirt, "#ffffff"); // uniform 2 in g1
  assert.equal(x.rows[0].kit, null);            // not set in g2
  assert.equal(x.rows[1].opponent.name, "Y");
  assert.deepEqual(planDays([g1, g2, g3]), [D1, D2]);
});

test("officialPlans: every round of the day, free rounds, one line for a court manager on several courts, shirt colours", () => {
  const refKits = [{ id: "m", name: "Mint", shirt: "#3eb489" }];
  const refs = [{ first: "Ann", name: "Ref" }, { first: "Cm", name: "Man" }];
  const gs = [
    game("A", "B", D1, "09:00", 1, { refs: { r1: "Ann Ref", cm: "Cm Man" }, kit: { R: "m" } }),
    game("C", "D", D1, "09:00", 2, { refs: { cm: "Cm Man" } }),
    game("A", "C", D1, "10:00", 1, { refs: { r2: "Other Person" } }),
    game("B", "D", D1, "11:00", 1, { refs: { a1: "Ann Ref" } }),
    game("A", "D", D2, "09:00", 1, { refs: { r1: "Ann Ref" } }),
  ];
  const { rounds, plans } = officialPlans(gs, refs, refKits, D1);
  assert.deepEqual(rounds, ["09:00", "10:00", "11:00"]);
  assert.deepEqual(plans.map((p) => p.name), ["Ann Ref", "Cm Man", "Other Person"]); // + names outside the registry
  const ann = plans[0];
  assert.equal(ann.onDuty, 2);
  assert.deepEqual(ann.rows.map((r) => r.duties.map((d) => d.slot)), [["r1"], [], ["a1"]]);
  assert.deepEqual(ann.rows[0].duties[0].shirts.map((r) => r.name), ["Mint"]);
  const cm = plans[1].rows[0].duties;
  assert.equal(cm.length, 1);
  assert.deepEqual(cm[0].courts, [1, 2]);
});
