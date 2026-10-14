// Championship format templates keyed by team count. Each category plays a
// SINGLE round-robin group (Qualification Round); the knockout is seeded by the
// final group ranking. Every knockout slot carries a structured source (src):
//   { type:"seed",   rank:N }        -> the Nth-ranked team of the QR group
//   { type:"winner", dep:"ko:sf1" }  -> winner of another fixture
//   { type:"loser",  dep:"ko:sf1" }  -> loser of another fixture
//
// A per-category `override` (map of matchId -> { a?:src, b?:src }) lets an admin
// change which variable feeds a slot; presets are the default. buildFormat and
// describeFormat both honour the override.

import { roundRobin } from "./roundRobin.js";

const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
export const seed = (n) => ORD[n] || `${n}th`;

// Full, unambiguous names for each match id (used in slot labels so it's clear
// which semifinal/quarterfinal a winner/loser comes from).
const NAME = {
  pi: "Quarterfinal", qf1: "Quarterfinal 1", qf2: "Quarterfinal 2", qf3: "Quarterfinal 3", qf4: "Quarterfinal 4",
  p7: "Placement 7-8", p56: "Placement 5-6", p58a: "Placement 5-8 (1)", p58b: "Placement 5-8 (2)", p78: "Placement 7-8",
  sf1: "Semifinal 1", sf2: "Semifinal 2", final: "Final", bronze: "Bronze",
  p35a: "Placement 3-5", p35b: "Placement 3-5", p35c: "Placement 3-5",
};
const nameOf = (ref) => NAME[String(ref).replace("ko:", "")] || String(ref).replace("ko:", "").toUpperCase();

const S = (n) => ({ label: seed(n), src: { type: "seed", rank: n } });
const W = (ref, label) => ({ label: label || `Winner ${nameOf(ref)}`, src: { type: "winner", dep: `ko:${ref}` } });
const L = (ref, label) => ({ label: label || `Loser ${nameOf(ref)}`, src: { type: "loser", dep: `ko:${ref}` } });

const KO = {
  2: () => [
    { id: "final", stage: "final", idx: 0, round: "Gold medal match", a: S(1), b: S(2) },
  ],
  3: () => [
    { id: "final", stage: "final", idx: 0, round: "Gold medal match", a: S(1), b: S(2) },
  ],
  4: () => [
    { id: "sf1", stage: "sf", idx: 0, round: "Semifinal 1", a: S(1), b: S(4) },
    { id: "sf2", stage: "sf", idx: 1, round: "Semifinal 2", a: S(2), b: S(3) },
    { id: "final",  stage: "final",  idx: 0, round: "Gold medal match",   a: W("sf1"), b: W("sf2") },
    { id: "bronze", stage: "bronze", idx: 0, round: "Bronze medal match", a: L("sf1"), b: L("sf2") },
  ],
  5: () => [
    { id: "pi",  stage: "qf", idx: 0, round: "Quarterfinal", a: S(4), b: S(5) },
    { id: "sf1", stage: "sf", idx: 0, round: "Semifinal 1", a: S(1), b: W("pi") },
    { id: "sf2", stage: "sf", idx: 1, round: "Semifinal 2", a: S(2), b: S(3) },
    { id: "final", stage: "final", idx: 0, round: "Gold medal match", a: W("sf1"), b: W("sf2") },
    { id: "p35a", stage: "bronze", idx: 0, round: "Placement 3-5", a: L("sf1"), b: L("sf2") },
    { id: "p35b", stage: "bronze", idx: 1, round: "Placement 3-5", a: L("sf1"), b: L("pi") },
    { id: "p35c", stage: "bronze", idx: 2, round: "Placement 3-5", a: L("sf2"), b: L("pi") },
  ],
  6: () => [
    // Top two seeds get a bye; 3rd–6th cross in the quarterfinals.
    { id: "qf1", stage: "qf", idx: 0, round: "Quarterfinal 1", a: S(4), b: S(5) },
    { id: "qf2", stage: "qf", idx: 1, round: "Quarterfinal 2", a: S(3), b: S(6) },
    { id: "sf1", stage: "sf", idx: 0, round: "Semifinal 1", a: S(1), b: W("qf1") },
    { id: "sf2", stage: "sf", idx: 1, round: "Semifinal 2", a: S(2), b: W("qf2") },
    { id: "final",  stage: "final",  idx: 0, round: "Gold medal match",   a: W("sf1"), b: W("sf2") },
    { id: "bronze", stage: "bronze", idx: 0, round: "Bronze medal match", a: L("sf1"), b: L("sf2") },
    { id: "p56", stage: "bronze", idx: 1, round: "Placement 5-6", a: L("qf1"), b: L("qf2") },
  ],
  7: () => [
    // Top seed gets a bye; 2nd–7th cross in the quarterfinals.
    { id: "qf1", stage: "qf", idx: 0, round: "Quarterfinal 1", a: S(4), b: S(5) },
    { id: "qf2", stage: "qf", idx: 1, round: "Quarterfinal 2", a: S(3), b: S(6) },
    { id: "qf3", stage: "qf", idx: 2, round: "Quarterfinal 3", a: S(2), b: S(7) },
    { id: "sf1", stage: "sf", idx: 0, round: "Semifinal 1", a: S(1), b: W("qf1") },
    { id: "sf2", stage: "sf", idx: 1, round: "Semifinal 2", a: W("qf2"), b: W("qf3") },
    { id: "final",  stage: "final",  idx: 0, round: "Gold medal match",   a: W("sf1"), b: W("sf2") },
    { id: "bronze", stage: "bronze", idx: 0, round: "Bronze medal match", a: L("sf1"), b: L("sf2") },
  ],
  8: () => [
    // QF1 feeds SF1 and QF2 feeds SF2, drawn top→top / bottom→bottom so the
    // bracket connectors don't cross. Pairings match the spec: 1st plays the
    // winner of 4th×5th, 2nd plays the winner of 3rd×6th.
    { id: "qf1", stage: "qf", idx: 0, round: "Quarterfinal 1", a: S(4), b: S(5) },
    { id: "qf2", stage: "qf", idx: 1, round: "Quarterfinal 2", a: S(3), b: S(6) },
    { id: "p7",  stage: "qf", idx: 2, round: "Placement 7-8", a: S(7), b: S(8) },
    { id: "sf1", stage: "sf", idx: 0, round: "Semifinal 1", a: S(1), b: W("qf1") },
    { id: "sf2", stage: "sf", idx: 1, round: "Semifinal 2", a: S(2), b: W("qf2") },
    { id: "final",  stage: "final",  idx: 0, round: "Gold medal match",   a: W("sf1"), b: W("sf2") },
    { id: "bronze", stage: "bronze", idx: 0, round: "Bronze medal match", a: L("sf1"), b: L("sf2") },
  ],
};

export function hasFormat(teamCount) { return !!KO[teamCount]; }

function labelOf(src) {
  if (!src) return "?";
  if (src.type === "seed") return seed(src.rank);
  return `${src.type === "winner" ? "Winner" : "Loser"} ${nameOf(src.dep)}`;
}

// Rounds offered when adding a custom match.
export const ROUND_OPTIONS = ["Quarterfinal 1", "Quarterfinal 2", "Semifinal 1", "Semifinal 2", "Placement 5-6", "Placement 7-8", "Placement 3-5", "Bronze medal match", "Gold medal match"];
const STAGE_OF = (round) => /gold/i.test(round) ? "final" : /semi/i.test(round) ? "sf" : /quarter|play-off/i.test(round) ? "qf" : "bronze";

// Override may be a legacy flat map (matchId -> {a,b}) or the richer shape
// { edits:{matchId:{a,b}}, removed:[matchId], added:[{id,round,a,b}] }.
export function normalizeOverride(ov) {
  if (!ov) return { edits: {}, removed: [], added: [] };
  if (ov.edits || ov.removed || ov.added) return { edits: ov.edits || {}, removed: ov.removed || [], added: ov.added || [] };
  return { edits: ov, removed: [], added: [] };
}
function mk(id, stage, idx, round, a, b, added) {
  const deps = [a.src, b.src].filter((s) => s && s.type !== "seed").map((s) => s.dep);
  return { id, stage, idx, round, a, b, deps, added: !!added };
}

// Merge preset knockout with a per-category override (edits + removed + added).
export function koFor(teamCount, override) {
  const ov = normalizeOverride(override);
  const base = (KO[teamCount] ? KO[teamCount]() : [])
    .filter((m) => !ov.removed.includes(m.id))
    .map((m) => {
      const o = ov.edits[m.id] || {};
      const a = o.a ? { src: o.a, label: labelOf(o.a) } : { src: m.a.src, label: m.a.label };
      const b = o.b ? { src: o.b, label: labelOf(o.b) } : { src: m.b.src, label: m.b.label };
      return mk(m.id, m.stage, m.idx, m.round, a, b, false);
    });
  const added = (ov.added || []).map((m, i) =>
    mk(m.id, STAGE_OF(m.round || ""), 20 + i, m.round || "Placement", { src: m.a, label: labelOf(m.a) }, { src: m.b, label: labelOf(m.b) }, true));
  return [...base, ...added];
}

// Options for a slot: every seed, plus winner/loser of any preset match that
// comes earlier (added matches, which run last, may reference any preset match).
export function slotOptions(teamCount, matchId, override) {
  const base = KO[teamCount] ? KO[teamCount]() : [];
  const ov = normalizeOverride(override);
  const idx = base.findIndex((m) => m.id === matchId); // -1 for an added match
  const opts = [];
  for (let r = 1; r <= teamCount; r++) opts.push({ value: `seed:${r}`, label: `${seed(r)} place` });
  base.forEach((m, i) => {
    if (ov.removed.includes(m.id)) return;
    if (idx === -1 || i < idx) {
      opts.push({ value: `winner:ko:${m.id}`, label: `Winner · ${m.round}` });
      opts.push({ value: `loser:ko:${m.id}`, label: `Loser · ${m.round}` });
    }
  });
  return opts;
}
export function parseSlot(value) {
  if (value.startsWith("seed:")) return { type: "seed", rank: Number(value.slice(5)) };
  if (value.startsWith("winner:")) return { type: "winner", dep: value.slice(7) };
  if (value.startsWith("loser:")) return { type: "loser", dep: value.slice(6) };
  return null;
}
export function slotValue(src) {
  if (!src) return "";
  if (src.type === "seed") return `seed:${src.rank}`;
  return `${src.type}:${src.dep}`;
}

// Human-readable summary of the format for a team count (respecting override).
export function describeFormat(teamCount, override, opts = {}) {
  const { double = false, knockout = true } = opts;
  if (teamCount < 2) return null;
  if (knockout && !KO[teamCount]) return null; // KO variant needs a preset for this count
  const qrGames = ((teamCount * (teamCount - 1)) / 2) * (double ? 2 : 1);
  const ko = knockout ? koFor(teamCount, override) : [];
  const rounds = [];
  for (const m of ko) {
    let r = rounds.find((x) => x.round === m.round);
    if (!r) { r = { round: m.round, matches: [] }; rounds.push(r); }
    r.matches.push(`${m.a.label} × ${m.b.label}`);
  }
  return { teamCount, qrGames, rounds, total: qrGames + ko.length, double, knockout };
}

// The editable knockout matches (id/round + current a/b) for the modal editor.
export function formatMatches(teamCount, override) { return koFor(teamCount, override); }

// Warn when a slot references a match that no longer exists (removed), so its
// placeholder would never resolve.
export function formatWarnings(teamCount, override) {
  const ko = koFor(teamCount, override);
  const ids = new Set(ko.map((m) => `ko:${m.id}`));
  const out = [];
  for (const m of ko) {
    for (const s of [m.a.src, m.b.src]) {
      if (s && s.type !== "seed" && !ids.has(s.dep)) out.push(`${m.round}: “${labelOf(s)}” — that match was removed.`);
    }
  }
  return out;
}

// buildFormat: QR (single group round-robin, single or double) + optional seeded
// knockout, as fixtures. `double` plays every pair twice; `knockout:false` is a
// league (final standings from the round-robin, no playoffs).
export function buildFormat(teams, { category, bestOf = 3, bestOfKo, override, double = false, knockout = true } = {}) {
  const real = (teams || []).filter(Boolean);
  const n = real.length;
  if (knockout && !KO[n]) return null;
  if (n < 2) return null;
  const koBestOf = bestOfKo || bestOf; // finals default to the group best-of

  const fixtures = [];
  let seq = 0;

  roundRobin(real, double).forEach((round, ri) => {
    round.forEach(([a, b], i) => {
      fixtures.push({
        id: `qr:${ri}:${i}`, category, bestOf, group: "", round: "Qualification round",
        phase: "group", groupRoundIndex: ri, seq: seq++, teamA: a, teamB: b, deps: [],
      });
    });
  });

  if (knockout) {
    for (const m of koFor(n, override)) {
      fixtures.push({
        id: `ko:${m.id}`, category, bestOf: koBestOf,
        round: m.round, phase: "ko", koStage: m.stage, koIndex: m.idx, seq: seq++,
        teamA: m.a.label, teamB: m.b.label, srcA: m.a.src, srcB: m.b.src, deps: m.deps,
      });
    }
  }

  return { fixtures, warnings: [] };
}

/* ---------------- Several groups ----------------
 * A category can be split into groups (e.g. Pan-American Games: 2 groups of 6).
 * Each group plays its own round-robin; the top Q of every group cross into a
 * knockout. Seeds then carry the group: { type:"seed", group:"A", rank:1 }.
 * variant fields (formatVariants[cat]): groups (count), groupOf { team: "A" },
 * qualifiers (per group), placements (QF losers play for 5th–8th). */

export const groupLabel = (i) => String.fromCharCode(65 + i); // A, B, C…

// Team → group, honouring saved choices and filling the rest "snake" style
// (A B B A A B…) so groups stay balanced. Returns [{ label, teams }].
export function assignGroups(teams, count, groupOf = {}) {
  const n = Math.max(1, Math.min(Number(count) || 1, 26));
  const groups = Array.from({ length: n }, (_, i) => ({ label: groupLabel(i), teams: [] }));
  if (n === 1) { groups[0].teams = [...teams]; return groups; }
  const free = [];
  for (const t of teams) {
    const g = groups.find((x) => x.label === groupOf[t]);
    if (g) g.teams.push(t); else free.push(t);
  }
  let i = 0;
  for (const t of free) {
    // next slot in snake order, skipping groups already larger than the rest
    const order = Math.floor(i / n) % 2 === 0 ? i % n : n - 1 - (i % n);
    const min = Math.min(...groups.map((g) => g.teams.length));
    const g = groups[order].teams.length > min ? groups.find((x) => x.teams.length === min) : groups[order];
    g.teams.push(t);
    i++;
  }
  return groups;
}

// Qualifiers per group the cross-over knockout supports, by number of groups.
export const QUALIFIER_OPTIONS = { 2: [1, 2, 3, 4], 4: [1, 2], 8: [1] };
// The saved qualifiers if still valid for these groups, else the default.
export function pickQualifiers(groups, q) {
  const smallest = Math.min(...groups.map((g) => g.teams.length));
  return (QUALIFIER_OPTIONS[groups.length] || []).includes(Number(q)) && Number(q) <= smallest ? Number(q) : defaultQualifiers(groups);
}
export function defaultQualifiers(groups) {
  const opts = QUALIFIER_OPTIONS[groups.length] || [];
  const smallest = Math.min(...groups.map((g) => g.teams.length));
  return [...opts].reverse().find((q) => q <= smallest) || opts[0] || 0;
}

const GS = (g, n) => ({ label: `${seed(n)} Group ${g}`, src: { type: "seed", group: g, rank: n } });

// Cross-over knockout from the groups' qualifiers. Returns matches in the same
// shape as koFor (id, stage, idx, round, a, b, deps), or null if unsupported.
export function groupKO(labels, Q, { placements = true } = {}) {
  const G = labels.length;
  if (!(QUALIFIER_OPTIONS[G] || []).includes(Q)) return null;
  const [A, B, C, D, E, F, Gg, H] = labels;
  const out = [];
  const add = (id, stage, idx, round, a, b) => out.push(mk(id, stage, idx, round, a, b, false));
  const semisFinal = (sfA1, sfB1, sfA2, sfB2) => {
    add("sf1", "sf", 0, "Semifinal 1", sfA1, sfB1);
    add("sf2", "sf", 1, "Semifinal 2", sfA2, sfB2);
    add("final", "final", 0, "Gold medal match", W("sf1"), W("sf2"));
    add("bronze", "bronze", 0, "Bronze medal match", L("sf1"), L("sf2"));
  };
  // Four quarterfinals → semis, final, bronze (+ optional 5th–8th placement).
  const quarters = (p) => {
    p.forEach(([a, b], i) => add(`qf${i + 1}`, "qf", i, `Quarterfinal ${i + 1}`, a, b));
    semisFinal(W("qf1"), W("qf2"), W("qf3"), W("qf4"));
    if (placements) {
      add("p58a", "bronze", 1, "Placement 5-8", L("qf1"), L("qf2"));
      add("p58b", "bronze", 2, "Placement 5-8", L("qf3"), L("qf4"));
      add("p56", "bronze", 3, "Placement 5-6", W("p58a"), W("p58b"));
      add("p78", "bronze", 4, "Placement 7-8", L("p58a"), L("p58b"));
    }
  };
  if (G === 2 && Q === 1) add("final", "final", 0, "Gold medal match", GS(A, 1), GS(B, 1));
  if (G === 2 && Q === 2) semisFinal(GS(A, 1), GS(B, 2), GS(B, 1), GS(A, 2));
  if (G === 2 && Q === 3) {
    // Group winners get a bye; 2nd and 3rd cross in the quarterfinals.
    add("qf1", "qf", 0, "Quarterfinal 1", GS(B, 2), GS(A, 3));
    add("qf2", "qf", 1, "Quarterfinal 2", GS(A, 2), GS(B, 3));
    semisFinal(GS(A, 1), W("qf1"), GS(B, 1), W("qf2"));
    if (placements) add("p56", "bronze", 1, "Placement 5-6", L("qf1"), L("qf2"));
  }
  if (G === 2 && Q === 4) quarters([[GS(A, 1), GS(B, 4)], [GS(B, 2), GS(A, 3)], [GS(B, 1), GS(A, 4)], [GS(A, 2), GS(B, 3)]]);
  if (G === 4 && Q === 1) semisFinal(GS(A, 1), GS(D, 1), GS(B, 1), GS(C, 1));
  if (G === 4 && Q === 2) quarters([[GS(A, 1), GS(B, 2)], [GS(C, 1), GS(D, 2)], [GS(B, 1), GS(A, 2)], [GS(D, 1), GS(C, 2)]]);
  if (G === 8 && Q === 1) quarters([[GS(A, 1), GS(H, 1)], [GS(D, 1), GS(E, 1)], [GS(B, 1), GS(Gg, 1)], [GS(C, 1), GS(F, 1)]]);
  return out;
}

// Summary for the Format step: games per group, knockout rounds and total.
export function describeGroupFormat(groups, { double = false, knockout = true, qualifiers, placements = true } = {}) {
  const per = groups.map((g) => ({ label: g.label, teams: g.teams.length, games: ((g.teams.length * (g.teams.length - 1)) / 2) * (double ? 2 : 1) }));
  const Q = pickQualifiers(groups, qualifiers);
  const ko = knockout ? groupKO(groups.map((g) => g.label), Q, { placements }) : [];
  const rounds = [];
  for (const m of ko || []) {
    let r = rounds.find((x) => x.round === m.round);
    if (!r) { r = { round: m.round, matches: [] }; rounds.push(r); }
    r.matches.push(`${m.a.label} × ${m.b.label}`);
  }
  const groupGames = per.reduce((s, g) => s + g.games, 0);
  return { groups: per, qualifiers: Q, rounds, koSupported: !knockout || !!ko, total: groupGames + (ko || []).length, double, knockout };
}

// Fixtures for a grouped category: a round-robin per group (labelled with the
// group) + the cross-over knockout. Same fixture shape as buildFormat.
export function buildGroupFormat(groups, { category, bestOf = 3, bestOfKo, double = false, knockout = true, qualifiers, placements = true } = {}) {
  const fixtures = [];
  const warnings = [];
  let seq = 0;
  for (const g of groups) {
    roundRobin(g.teams, double).forEach((round, ri) => {
      round.forEach(([a, b], i) => {
        fixtures.push({
          id: `grp:${g.label}:${ri}:${i}`, category, bestOf, group: g.label, round: "Qualification round",
          phase: "group", groupRoundIndex: ri, seq: seq++, teamA: a, teamB: b, deps: [],
        });
      });
    });
  }
  if (knockout) {
    const Q = pickQualifiers(groups, qualifiers);
    const ko = groupKO(groups.map((g) => g.label), Q, { placements });
    if (!ko) warnings.push(`${category}: no automatic knockout for ${groups.length} groups × ${Q} qualifiers — group stage only.`);
    for (const m of ko || []) {
      fixtures.push({
        id: `ko:${m.id}`, category, bestOf: bestOfKo || bestOf,
        round: m.round, phase: "ko", koStage: m.stage, koIndex: m.idx, seq: seq++,
        teamA: m.a.label, teamB: m.b.label, srcA: m.a.src, srcB: m.b.src, deps: m.deps,
      });
    }
  }
  return { fixtures, warnings };
}
