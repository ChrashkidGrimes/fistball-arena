import { test } from "node:test";
import assert from "node:assert/strict";
import { autoAssign } from "./assign.js";

const D = "12/09/26", D2 = "13/09/26";
const ref = (first, country, extra = {}) => ({ first, name: "Ref", country, roles: ["referee"], gender: "m", ...extra });
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

test("knockout r2 from a playing nation, setting lenient: about as bad as a missing break", () => {
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Gerd", "Germany")];
  const before = game({ teamA: { name: "Austria" }, teamB: { name: "Italy" }, refs: { r1: "Sepp Ref", r2: "Dan Ref" } });
  const ko = game({ time: "11:00", round: "Semifinal 1" });
  // Default: a neutral referee works a second game in a row.
  const r = at(autoAssign([before, ko], offs, []), ko);
  assert.deepEqual(new Set([r.r1, r.r2]), new Set(["Sepp Ref", "Dan Ref"]));
  // Lenient: the rested German referee takes Referee 2 (Referee 1 stays neutral).
  const res = autoAssign([before, ko], offs, [], { rules: { r2NationKo: "lenient" } });
  const l = at(res, ko);
  assert.equal(l.r2, "Gerd Ref");
  assert.ok(["Sepp Ref", "Dan Ref"].includes(l.r1));
  assert.equal(res.after.counts.hard, 0);
  // Group games stay hard in either mode.
  const grp = game({ time: "13:00" });
  const g = at(autoAssign([grp], [ref("Sepp", "Switzerland"), ref("Gerd", "Germany")], [], { rules: { r2NationKo: "lenient" } }), grp);
  assert.equal(g.r2 ?? "", "");
});

test("women's final gets a female referee", () => {
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ida", "Italy", { gender: "f" })];
  const g = game({ category: "National Teams Women", round: "Gold medal match" });
  const r = at(autoAssign([g], offs, []), g);
  assert.ok([r.r1, r.r2].includes("Ida Ref"));
});

test("filled cells stay; overwrite recomputes only the auto-assigned ones, never those set by hand", () => {
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ola", "Norway"), ref("Ida", "Italy")];
  const g = game({ refs: { r1: "Ola Ref" } }); // no refsAuto → set by hand
  const res = autoAssign([g], offs, []);
  assert.equal(at(res, g).r1, "Ola Ref");
  assert.ok(!res.proposals.some((p) => p.slot === "r1"));
  // Overwrite keeps the manual r1 and fills r2.
  const res2 = autoAssign([g], offs, [], { overwrite: true });
  assert.equal(at(res2, g).r1, "Ola Ref");
  assert.ok(at(res2, g).r2);
  // An auto-assigned r2 that now conflicts (Ida's nation plays) is replaced; the manual r1 stays.
  const g2 = game({ teamB: { name: "Italy" }, refs: { r1: "Ola Ref", r2: "Ida Ref" }, refsAuto: { r2: true } });
  const res3 = autoAssign([g2], offs, [], { overwrite: true });
  assert.equal(at(res3, g2).r1, "Ola Ref");
  assert.notEqual(at(res3, g2).r2, "Ida Ref");
  assert.equal(res3.after.counts.hard, 0);
  // Without overwrite the auto-assigned r2 stays too.
  assert.equal(at(autoAssign([g2], offs, []), g2).r2, "Ida Ref");
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

test("assistant pairs work together; a pair dissolves when a member is away", () => {
  const sr = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark")];
  const lr = (first, pair, extra = {}) => ({ first, name: "Lr", roles: ["assistant"], assistantPair: pair, ...extra });
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

test("clerk: nation doesn't matter (club does, see rules.test.js); only filled when a clerk pool exists", () => {
  const sr = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark")];
  const g = game();
  assert.equal(at(autoAssign([g], sr, []), g).clerk ?? "", "");
  const as = { first: "Kurt", name: "Clerk", roles: ["clerk"], country: "Germany" };
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

test("repair: moves a neutral referee over from a parallel game instead of leaving Referee 2 empty", () => {
  // Greedy fills the Austria game first (Ana + Hal, Vic as clerk), leaving
  // only Pia for the Italy–Germany game. Moving Hal over and the German Vic
  // into his place trades the empty Referee 2 for an empty Clerk.
  const offs = [
    ref("Ana", "Chile"), ref("Pia", "Brazil"),
    { first: "Vic", name: "Ref", country: "Germany", gender: "m" }, // any slot
    { first: "Hal", name: "Ref", country: "Norway", roles: ["referee", "clerk"], gender: "m" },
  ];
  const a = game({ teamA: { name: "Austria" }, teamB: { name: "Switzerland" } });
  const b = game({ teamA: { name: "Italy" }, teamB: { name: "Germany" }, court: 2 });
  const res = autoAssign([a, b], offs, []);
  const ra = at(res, a), rb = at(res, b);
  assert.ok(ra.r1 && ra.r2 && rb.r1 && rb.r2, JSON.stringify({ ra, rb }));
  assert.equal(res.after.counts.hard, 0);
  assert.ok(![rb.r1, rb.r2].includes("Vic Ref"));
  assert.deepEqual(res.unfilled.map((u) => u.slot), ["clerk", "clerk"]);
});

test("ranks: the top game gets a top Referee 1, top referees are kept off normal games", () => {
  const top = ref("Tom", "Spain", { rank: "top" });
  const offs = [ref("Ann", "Norway"), ref("Bob", "Chile"), ref("Cid", "Denmark"), top];
  // Same start time: the normal game on court 1 is filled first.
  const normal = game({ teamA: { name: "Italy" }, teamB: { name: "Austria" } });
  const semi = game({ round: "Semifinal 1", court: 2 });
  const res = autoAssign([normal, semi], offs, []);
  assert.equal(at(res, semi).r1, "Tom Ref");
  assert.ok(![at(res, normal).r1, at(res, normal).r2].includes("Tom Ref"));
  assert.ok(!res.after.list.some((i) => i.code === "rank"));
});

test("ranks: a strong preference — beats a break, never a hard rule; falls back with a warning", () => {
  const top = ref("Tom", "Spain", { rank: "top" });
  const offs = [ref("Ann", "Norway"), ref("Bob", "Chile"), ref("Cid", "Denmark"), top];
  // Tom is booked in the round before (locked) → R1 of the final means two in a row: still Tom.
  const before = game({ time: "09:00", teamA: { name: "Italy" }, teamB: { name: "Austria" }, refs: { r1: "Tom Ref", r2: "Ann Ref" } });
  const final = game({ round: "Gold medal match", time: "10:00" });
  const res = autoAssign([before, final], offs, []);
  assert.equal(at(res, final).r1, "Tom Ref");
  // Tom from a playing nation (hard) → a normal referee instead, flagged.
  const spanishFinal = game({ round: "Gold medal match", teamA: { name: "Spain" } });
  const res2 = autoAssign([spanishFinal], offs, []);
  const r = at(res2, spanishFinal);
  assert.ok(r.r1 && r.r1 !== "Tom Ref" && r.r2 && r.r2 !== "Tom Ref");
  assert.deepEqual(res2.after.list.filter((i) => i.code === "rank").map((i) => i.slot), ["r1"]);
  assert.equal(res2.after.counts.hard, 0);
});

test("court manager: filled when someone has the role, may cover parallel courts, never doubles as another role", () => {
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ola", "Norway"), ref("Ida", "Italy"),
    { first: "Carl", name: "Cm", roles: ["courtManager", "referee"], country: "Spain" }];
  const g1 = game(), g2 = game({ court: 2, teamA: { name: "Austria" }, teamB: { name: "Chile" } });
  const res = autoAssign([g1, g2], offs, []);
  // Carl is the only court manager → both parallel games; so he can't referee at that time.
  assert.equal(at(res, g1).cm, "Carl Cm");
  assert.equal(at(res, g2).cm, "Carl Cm");
  assert.ok(![g1, g2].some((g) => ["r1", "r2"].some((s) => at(res, g)[s] === "Carl Cm")));
  assert.equal(res.after.counts.hard, 0);
  // Without anyone holding the role, the slot stays empty and isn't required.
  const res2 = autoAssign([game()], offs.slice(0, 4), []);
  assert.equal(res2.games[0].refs.cm ?? "", "");
  assert.ok(!res2.unfilled.some((u) => u.slot === "cm"));
});

test("court manager: one per round covers all courts; rounds are spread evenly", () => {
  const cm = (first) => ({ first, name: "Cm", roles: ["courtManager"], country: "Spain" });
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ola", "Norway"), ref("Ida", "Italy"), cm("Carl"), cm("Cora")];
  const gs = [];
  for (const time of ["09:00", "10:00", "11:00", "12:00"]) for (const court of [1, 2]) gs.push(game({ time, court }));
  const res = autoAssign(gs, offs, []);
  const byTime = {};
  for (const g of res.games) (byTime[g.time] ||= new Set()).add(g.refs.cm);
  for (const [t, names] of Object.entries(byTime)) assert.equal(names.size, 1, `${t}: ${[...names]}`);
  const rounds = {};
  for (const [, names] of Object.entries(byTime)) for (const n of names) rounds[n] = (rounds[n] || 0) + 1;
  assert.deepEqual(Object.values(rounds).sort(), [2, 2]);
  assert.equal(res.after.counts.hard, 0);
});

test("event settings: Referee 2 only in the finals rounds, Clerk 2 only on chosen courts", () => {
  const as = (first) => ({ first, name: "Clerk", roles: ["clerk"] });
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ola", "Norway"), as("Kurt"), as("Karl"), as("Kim")];
  const grp = game({ court: 1 }), grp2 = game({ court: 2, teamA: { name: "Italy" }, teamB: { name: "Chile" } });
  const semi = game({ round: "Semifinal 1", time: "12:00" });
  const res = autoAssign([grp, grp2, semi], offs, [], { rules: { r2: "finals", clerk2Courts: ["1"] } });
  assert.ok(at(res, grp).r1 && !at(res, grp).r2);
  assert.ok(at(res, semi).r1 && at(res, semi).r2);
  assert.ok(at(res, grp).clerk && at(res, grp).clerk2);
  assert.ok(at(res, grp2).clerk && !at(res, grp2).clerk2);
  assert.equal(res.after.counts.hard, 0);
});

test("clerks may work in a row and keep their court", () => {
  const as = (first) => ({ first, name: "Clerk", roles: ["clerk"] });
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ola", "Norway"), ref("Ida", "Italy"), as("Kurt"), as("Karl")];
  const gs = [];
  for (const time of ["09:00", "10:00", "11:00"]) for (const court of [1, 2]) gs.push(game({ time, court, teamA: { name: `A${time}${court}` }, teamB: { name: `B${time}${court}` } }));
  const res = autoAssign(gs, offs, []);
  const byCourt = {};
  for (const g of res.games) (byCourt[g.court] ||= new Set()).add(g.refs.clerk);
  assert.equal(byCourt[1].size, 1); // the same clerk on court 1 all day
  assert.equal(byCourt[2].size, 1);
  assert.ok(!res.after.list.some((i) => i.slot === "clerk"));
});

test("final: the referees work the lines; club members never officiate their club", () => {
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ola", "Norway"), ref("Ida", "Italy"),
    { first: "Lena", name: "Lr", roles: ["assistant"] }, { first: "Lars", name: "Lr", roles: ["assistant"] }];
  const fin = game({ round: "Gold medal match" });
  const r = at(autoAssign([fin], offs, []), fin);
  assert.ok(![r.a1, r.a2].some((n) => /Lr$/.test(n)), JSON.stringify(r));
  const off = at(autoAssign([fin], offs, [], { rules: { finalRefsOnLines: false } }), fin);
  assert.deepEqual([off.a1, off.a2].sort(), ["Lars Lr", "Lena Lr"]);
  // A clerk and an assistant from a playing club are never used for that game.
  const entries = [{ name: "Ahlhorn", club: "Ahlhorner SV" }];
  const clubOffs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"),
    { first: "Kurt", name: "Ahl", roles: ["clerk"], club: "Ahlhorner SV" }, { first: "Lina", name: "Ahl", roles: ["assistant"], club: "Ahlhorner SV" }, { first: "Max", name: "Lr", roles: ["assistant"] }];
  const cg = game({ category: "Clubs Men", teamA: { name: "Ahlhorn" }, teamB: { name: "Elgg" } });
  const cr = at(autoAssign([cg], clubOffs, entries), cg);
  assert.ok(![cr.clerk, cr.a1, cr.a2].includes("Kurt Ahl") && ![cr.a1, cr.a2].includes("Lina Ahl"), JSON.stringify(cr));
});

test("club competitions: a referee from a club's nation is used only when needed; ranks count for assistants too", () => {
  const entries = [{ name: "Linz", country: "Austria" }];
  const aut = { first: "Anna", name: "Aut", country: "Austria", roles: ["referee"] };
  const cg = game({ category: "Clubs Men", teamA: { name: "Linz" }, teamB: { name: "Elgg" } });
  const only = at(autoAssign([cg], [aut, ref("Dan", "Denmark")], entries), cg);
  assert.ok([only.r1, only.r2].includes("Anna Aut")); // allowed (warning), not blocked
  const neutral = at(autoAssign([cg], [aut, ref("Dan", "Denmark"), ref("Ola", "Norway")], entries), cg);
  assert.ok(![neutral.r1, neutral.r2].includes("Anna Aut"));
  // Assistants: the top game gets the top-ranked assistants.
  const lr = (first, rank) => ({ first, name: "Lr", roles: ["assistant"], ...(rank ? { rank } : {}) });
  const offs = [ref("Sepp", "Switzerland"), ref("Dan", "Denmark"), ref("Ola", "Norway"), ref("Ida", "Italy"), lr("Al"), lr("Bo"), lr("Tia", "top"), lr("Tom", "top")];
  const normal = game({ teamA: { name: "Italy" }, teamB: { name: "Austria" } });
  const semi = game({ round: "Semifinal 1", court: 2 });
  const res = autoAssign([normal, semi], offs, []);
  assert.deepEqual([at(res, semi).a1, at(res, semi).a2].sort(), ["Tia Lr", "Tom Lr"]);
});
