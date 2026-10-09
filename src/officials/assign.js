// Officials auto-assignment — pure solver, see docs/referee-assignment-spec.md
// §3.4–3.6. Produces a PROPOSAL; the page shows it as a diff and the admin
// applies it.
//
// autoAssign(games, officials, entries, opts) → {
//   proposals: [{ gameId, slot, from, to }],
//   games,                       // games with the proposal applied
//   before, after,               // checkAssignments() of the current / proposed grid
//   scoreBefore, scoreAfter,     // total penalty (lower is better)
//   skipped: [gameId],           // knockout games whose teams aren't known yet
//   unfilled: [{ gameId, slot }] // no eligible official found
// }
//
// 1. Greedy: games in chronological order; per game the referees (as a pair,
//    so the women's-finals rule and "r1 neutral" are handled together), then
//    the line judges (LR pairs together), then the scorer. Each pick is the
//    lowest marginal penalty; ties → fewest games so far, then name.
// 2. Local improvement: swap two officials between games of the same day while
//    the day's score goes down and no hard violation is added (time-boxed).
// Locked cells (already filled) stay as they are unless opts.overwrite.

import {
  canFill, availabilityOn, availableAt, parseSlots,
  teamMeta, sameCountry, sameClub, isWomensGame, isWomenFinal,
} from "./model.js";
import { checkAssignments, isKnockout, officialName, DEFAULT_RULES, SLOTS } from "./rules.js";
import { isPlaceholder } from "../schedule/advance.js";

// Penalty weights. Ordering per spec §3.5:
// r2Nation ≫ reserve ≫ break > lrClub > srLRNation > soloLR > load > gender > repeat.
export const DEFAULT_WEIGHTS = {
  hard: 1e6,        // per hard violation (only used to compare whole grids)
  r2Nation: 1e5,    // knockout r2 from a playing nation
  reserve: 1e4,
  pairSplit: 2000,  // splitting an intact LR pair
  maxPerDay: 1000,
  break: 300,       // per extra game in a row (2 in a row)
  lrClub: 150,
  srLRNation: 100,
  soloLR: 60,       // a line judge not working with their pair partner
  genderUnknown: 50,
  load: 10,         // per game already worked (balances the load)
  gender: 8,        // bonus: female referee on a women's game
  repeat: 3,        // per earlier game with one of these teams
};

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const timeKey = (t) => parseSlots(t)[0] || String(t ?? "").trim();
const parseDate = (s) => { const [d, m, y] = String(s).split("/").map(Number); return (y || 0) * 10000 + (m || 0) * 100 + (d || 0); };
const byTime = (a, b) => parseDate(a.date) - parseDate(b.date) || timeKey(a.time).localeCompare(timeKey(b.time)) || String(a.court).localeCompare(String(b.court)) || (a.nr || 0) - (b.nr || 0);
const hasRole = (o, role) => Array.isArray(o?.roles) && o.roles.includes(role);
const teamKey = (t) => norm(String(t?.name ?? t ?? ""));

// Score of a grid: hard violations (except empty slots) ≫ weighted warnings,
// plus team repeats, minus the gender bonus. Load is balanced in the greedy
// pass; swaps between games don't change anyone's game count.
export function gridScore(games, officials, entries, w = DEFAULT_WEIGHTS, rules = DEFAULT_RULES) {
  const res = checkAssignments(games, officials, entries, rules);
  return { res, score: scoreOf(res, games, officials, w) };
}
const SOFT_WEIGHT = { r2Nation: "r2Nation", reserve: "reserve", inRow: "break", lrClub: "lrClub", srLRNation: "srLRNation", maxPerDay: "maxPerDay", pairSplit: "pairSplit", gender: "genderUnknown" };
function scoreOf(res, games, officials, w) {
  let s = 0;
  for (const i of res.list) {
    if (i.code === "missing") continue;
    s += i.level === "hard" ? w.hard : w[SOFT_WEIGHT[i.code]] || 0;
  }
  const byName = new Map(officials.map((o) => [norm(officialName(o)), o]));
  const seen = new Map();
  for (const g of games) {
    const fem = isWomensGame(g);
    for (const slot of SLOTS) {
      const k = norm(g.refs?.[slot]);
      if (!k) continue;
      for (const t of [teamKey(g.teamA), teamKey(g.teamB)]) {
        const key = k + "|" + t;
        const n = seen.get(key) || 0;
        s += n * w.repeat;
        seen.set(key, n + 1);
      }
      if (fem && (slot === "r1" || slot === "r2") && byName.get(k)?.gender === "f") s -= w.gender;
    }
  }
  return s;
}

export function autoAssign(games, officials, entries, opts = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const rules = { ...DEFAULT_RULES, ...opts.rules };
  const inScope = (g) => !opts.days?.length || opts.days.includes(g.date);
  const pool = (officials || []).filter((o) => officialName(o));
  const lrPool = pool.some((o) => hasRole(o, "LR"));
  const asPool = pool.some((o) => hasRole(o, "AS"));
  const keyOf = new Map(pool.map((o) => [o, norm(officialName(o))]));
  const byKey = new Map(pool.map((o) => [keyOf.get(o), o]));

  // Working copy. Cells in scope are cleared when overwriting; out-of-scope
  // games and locked cells stay and count for double booking / games in a row.
  const skipped = [];
  const work = [...games].sort(byTime).map((g) => {
    const refs = { ...(g.refs || {}) };
    const target = inScope(g) && !(isKnockout(g) && (isPlaceholder(g.teamA?.name ?? g.teamA) || isPlaceholder(g.teamB?.name ?? g.teamB)));
    if (inScope(g) && !target) skipped.push(g.id);
    if (target && opts.overwrite) for (const s of SLOTS) refs[s] = "";
    return { ...g, refs, _target: target };
  });

  // Rounds per day (distinct start times, all courts).
  const roundIdx = new Map();
  for (const g of work) {
    if (!roundIdx.has(g.date)) roundIdx.set(g.date, new Set());
    roundIdx.get(g.date).add(timeKey(g.time));
  }
  for (const [d, set] of roundIdx) roundIdx.set(d, new Map([...set].sort().map((t, i) => [t, i])));
  const roundOf = (g) => roundIdx.get(g.date).get(timeKey(g.time));

  // Per person state, seeded from cells that are already filled.
  const st = new Map(); // key → { total, day: {date: n}, rounds: {date: Set}, booked: Set(date|time), teams: Map }
  const S = (k) => {
    if (!st.has(k)) st.set(k, { total: 0, day: {}, rounds: {}, booked: new Set(), teams: new Map() });
    return st.get(k);
  };
  const book = (k, g) => {
    const p = S(k);
    p.total++;
    p.day[g.date] = (p.day[g.date] || 0) + 1;
    (p.rounds[g.date] ||= new Set()).add(roundOf(g));
    p.booked.add(g.date + "|" + timeKey(g.time));
    for (const t of [teamKey(g.teamA), teamKey(g.teamB)]) p.teams.set(t, (p.teams.get(t) || 0) + 1);
  };
  for (const g of work) for (const s of SLOTS) { const k = norm(g.refs[s]); if (k) book(k, g); }

  // Length of the run of consecutive rounds that `r` would be part of.
  const runWith = (k, date, r) => {
    const set = S(k).rounds[date] || new Set();
    let n = 1;
    for (let i = r - 1; set.has(i); i--) n++;
    for (let i = r + 1; set.has(i); i++) n++;
    return n;
  };

  // LR pairs per day: a pair is intact on a day unless a member is unavailable.
  const partnerOf = (o, date) => {
    if (!o?.lrPair) return null;
    const p = pool.find((x) => x !== o && x.lrPair === o.lrPair);
    if (!p) return null;
    if (availabilityOn(p, date).status === "unavailable" || availabilityOn(o, date).status === "unavailable") return null;
    return p;
  };

  // Hard eligibility + marginal penalty of putting `o` into `slot` of game `g`.
  // Returns null when not allowed.
  const cost = (o, g, slot) => {
    const k = keyOf.get(o);
    if (!canFill(o, slot)) return null;
    if (!availableAt(o, g.date, g.time)) return null;
    if (SLOTS.some((s) => norm(g.refs[s]) === k)) return null;
    if (S(k).booked.has(g.date + "|" + timeKey(g.time))) return null;
    const run = runWith(k, g.date, roundOf(g));
    if (run >= rules.hardInRow) return null;
    const A = teamMeta(entries, g.teamA), B = teamMeta(entries, g.teamB);
    const nation = o.country && (sameCountry(o.country, A.country) || sameCountry(o.country, B.country));
    const club = o.club && (sameClub(o.club, A.club) || sameClub(o.club, B.club));
    const isRef = slot === "r1" || slot === "r2", isLR = slot === "a1" || slot === "a2";
    let c = 0;
    if (isRef) {
      if (club) return null;
      if (nation) {
        if (slot === "r1" || !isKnockout(g)) return null;
        c += w.r2Nation;
      }
      if (isWomensGame(g) && o.gender === "f") c -= w.gender;
    }
    if (isLR) {
      if (club) c += w.lrClub;
      if (nation && hasRole(o, "SR")) c += w.srLRNation;
    }
    if (availabilityOn(o, g.date).status === "reserve") c += w.reserve;
    if (run >= rules.softInRow) c += w.break * (run - rules.softInRow + 1);
    const p = S(k);
    if (o.maxPerDay && (p.day[g.date] || 0) >= o.maxPerDay) c += w.maxPerDay;
    c += w.load * ((p.day[g.date] || 0) + p.total / 2);
    c += w.repeat * ((p.teams.get(teamKey(g.teamA)) || 0) + (p.teams.get(teamKey(g.teamB)) || 0));
    return c;
  };
  // Tie-break: fewest games so far, then name.
  const tie = (a, b) => S(keyOf.get(a)).total - S(keyOf.get(b)).total || officialName(a).localeCompare(officialName(b));
  const pick = (cands) => cands.sort((x, y) => x.c - y.c || tie(x.o[0], y.o[0]) || (x.o[1] && y.o[1] ? tie(x.o[1], y.o[1]) : 0))[0];

  const unfilled = [];
  const set = (g, slot, o) => { g.refs[slot] = officialName(o); book(keyOf.get(o), g); };

  for (const g of work) {
    if (!g._target) continue;
    const empty = (s) => !String(g.refs[s] ?? "").trim();

    // Referees: r1 + r2 together.
    const r = ["r1", "r2"].filter(empty);
    if (r.length) {
      const female = (x) => (typeof x === "string" ? byKey.get(norm(x))?.gender : x?.gender) === "f";
      const genderOk = (r1, r2) => !isWomenFinal(g) || female(r1) || female(r2);
      const c1 = r.includes("r1") ? pool.map((o) => ({ o, c: cost(o, g, "r1") })).filter((x) => x.c !== null) : [];
      const c2 = r.includes("r2") ? pool.map((o) => ({ o, c: cost(o, g, "r2") })).filter((x) => x.c !== null) : [];
      let best = null;
      if (r.length === 2) {
        const cands = [];
        for (const a of c1) for (const b of c2) if (a.o !== b.o && genderOk(a.o, b.o)) cands.push({ o: [a.o, b.o], c: a.c + b.c });
        best = pick(cands);
        if (best) { set(g, "r1", best.o[0]); set(g, "r2", best.o[1]); }
        else {
          // No valid pair (e.g. no female referee for a women's final): fill r1 only.
          const one = pick(c1.map((x) => ({ o: [x.o], c: x.c })));
          if (one && !isWomenFinal(g)) set(g, "r1", one.o[0]);
          unfilled.push(...(one && !isWomenFinal(g) ? ["r2"] : ["r1", "r2"]).map((slot) => ({ gameId: g.id, slot })));
        }
      } else {
        const slot = r[0], other = g.refs[slot === "r1" ? "r2" : "r1"];
        const cands = (slot === "r1" ? c1 : c2).filter((x) => genderOk(x.o, other)).map((x) => ({ o: [x.o], c: x.c }));
        best = pick(cands);
        if (best) set(g, slot, best.o[0]); else unfilled.push({ gameId: g.id, slot });
      }
    }

    // Line judges: a1 + a2, LR pairs together (only when an LR pool exists).
    const l = ["a1", "a2"].filter(empty);
    if (lrPool && l.length) {
      // Penalty for one line judge given who works the other line.
      const pairCost = (o, mate) => {
        const p = partnerOf(o, g.date);
        if (p) return mate === p ? 0 : w.pairSplit;
        return w.soloLR;
      };
      const ca = pool.map((o) => ({ o, c: cost(o, g, "a1") })).filter((x) => x.c !== null);
      if (l.length === 2) {
        const cands = [];
        for (let i = 0; i < ca.length; i++) for (let j = i + 1; j < ca.length; j++) {
          const a = ca[i], b = ca[j];
          cands.push({ o: [a.o, b.o], c: a.c + b.c + pairCost(a.o, b.o) + pairCost(b.o, a.o) });
        }
        const best = pick(cands);
        if (best) {
          const [x, y] = best.o.sort((p, q) => officialName(p).localeCompare(officialName(q)));
          set(g, "a1", x); set(g, "a2", y);
        } else {
          const one = pick(ca.map((x) => ({ o: [x.o], c: x.c + w.soloLR })));
          if (one) set(g, "a1", one.o[0]);
          unfilled.push(...(one ? ["a2"] : ["a1", "a2"]).map((slot) => ({ gameId: g.id, slot })));
        }
      } else {
        const slot = l[0];
        const mate = byKey.get(norm(g.refs[slot === "a1" ? "a2" : "a1"]));
        const cands = ca.map((x) => ({ o: [x.o], c: x.c + pairCost(x.o, mate) + (mate ? (partnerOf(mate, g.date) === x.o ? 0 : partnerOf(mate, g.date) ? w.pairSplit : 0) : 0) }));
        const best = pick(cands);
        if (best) set(g, slot, best.o[0]); else unfilled.push({ gameId: g.id, slot });
      }
    }

    // Scorer (only when an AS pool exists; nation / club don't matter).
    if (asPool && empty("clerk")) {
      const best = pick(pool.map((o) => ({ o: [o], c: cost(o, g, "clerk") })).filter((x) => x.c !== null));
      if (best) set(g, "clerk", best.o[0]); else unfilled.push({ gameId: g.id, slot: "clerk" });
    }
  }

  // Local improvement: for each newly filled single cell (referee or scorer)
  // that still has an issue, try swapping it with another newly filled cell of
  // the same kind on the same day; keep a swap if the day's score drops and no
  // hard violation is added. Only problem cells are tried, and the pass stops
  // after opts.timeBudgetMs (the greedy result alone is already valid).
  const deadline = Date.now() + (opts.timeBudgetMs ?? 1500);
  const locked = new Map(games.map((g) => [g.id, opts.overwrite ? {} : { ...(g.refs || {}) }]));
  const fresh = (g, s) => g._target && !String(locked.get(g.id)?.[s] ?? "").trim() && String(g.refs[s] ?? "").trim();
  const days = [...new Set(work.filter((g) => g._target).map((g) => g.date))];
  for (const date of days) {
    const dayGames = work.filter((g) => g.date === date);
    let cur = gridScore(dayGames, pool, entries, w, rules);
    for (let step = 0; step < (opts.maxSwaps ?? 200) && Date.now() < deadline; step++) {
      const cells = [];
      for (const g of dayGames) for (const s of ["r1", "r2", "clerk"]) if (fresh(g, s)) cells.push([g, s]);
      const problems = cells.filter(([g, s]) => cur.res.cells[g.id]?.[s]?.length);
      let done = false;
      for (const [g1, s1] of problems) {
        for (const [g2, s2] of cells) {
          if (Date.now() >= deadline) break;
          if (g1 === g2 || (s1 === "clerk") !== (s2 === "clerk")) continue;
          const v1 = g1.refs[s1], v2 = g2.refs[s2];
          if (norm(v1) === norm(v2)) continue;
          g1.refs[s1] = v2; g2.refs[s2] = v1;
          const next = gridScore(dayGames, pool, entries, w, rules);
          if (next.res.counts.hard <= cur.res.counts.hard && next.score < cur.score) { cur = next; done = true; break; }
          g1.refs[s1] = v1; g2.refs[s2] = v2;
        }
        if (done) break;
      }
      if (!done) break;
    }
  }

  const out = work.map(({ _target, ...g }) => g);
  const proposals = [];
  const orig = new Map(games.map((g) => [g.id, g.refs || {}]));
  for (const g of out) for (const s of SLOTS) {
    const from = String(orig.get(g.id)?.[s] ?? "").trim(), to = String(g.refs[s] ?? "").trim();
    if (from !== to) proposals.push({ gameId: g.id, slot: s, from, to });
  }
  const before = gridScore(games, pool, entries, w, rules);
  const after = gridScore(out, pool, entries, w, rules);
  return {
    proposals, games: out, skipped, unfilled,
    before: before.res, after: after.res, scoreBefore: before.score, scoreAfter: after.score,
  };
}
