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
//    the assistants (pairs together), then the clerk. Each pick is the
//    lowest marginal penalty; ties → fewest games so far, then name.
// 2. Repair: an empty required slot is filled by moving someone over from
//    another game of the same day (chains of up to two moves).
// 3. Local improvement: swap two officials between games of the same day while
//    the day's score goes down and no hard violation is added (time-boxed).
// Filled cells stay as they are. With opts.overwrite, cells auto-assign filled
// before (game.refsAuto[slot]) are recomputed; cells set by hand never change.

import {
  canFill, parseRoles, availabilityOn, availableAt, parseSlots,
  teamMeta, sameCountry, sameClub, isWomensGame, isWomenFinal, rankOf, rankLevel, gameRank, isClubGame, minutesOn,
} from "./model.js";
import { checkAssignments, isKnockout, officialName, DEFAULT_RULES, SLOTS, isRequiredSlot, refsOnLines } from "./rules.js";
import { isPlaceholder } from "../schedule/advance.js";

// Penalty weights. Ordering per spec §3.5:
// r2Nation ≫ reserve ≫ (lenient r2Nation) > break > refereeAsAssistantNation > soloAssistant > load > gender > repeat.
// Empty required slots rank between hard violations and r2Nation (a
// non-neutral knockout r2 beats an empty one); an empty referee slot is far
// worse than an empty scorer / line judge slot. A Referee 1 below the game's
// rank outweighs breaks and load (but no hard rule); a referee above the
// game's rank costs a little, so top referees stay free for top games.
export const DEFAULT_WEIGHTS = {
  hard: 1e6,        // per hard violation (only used to compare whole grids)
  missingRef: 5e5,  // empty Referee 1 / 2
  missing: 2e4,     // empty required Clerk / Assistant
  r2Nation: 1e5,    // knockout r2 from a playing nation
  r2NationLenient: 305, // the same with the event setting "lenient" (Reiden): a bit worse than a missing break
  reserve: 1e4,
  pairSplit: 2000,  // splitting an intact assistant pair
  finalLines: 3000, // a non-referee on the lines of the final (when referees work the lines)
  rankUnder: 1500,  // per rank level Referee 1 (or an assistant) is below the game's rank
  maxPerDay: 1000,
  nationClub: 400,  // club competition: referee from the nation of a playing club (above breaks)
  break: 300,       // per extra game in a row (2 in a row)
  refereeAsAssistantNation: 100,
  soloAssistant: 60,       // a line judge not working with their pair partner
  genderUnknown: 50,
  rankOver: 40,     // per rank level a referee (1 or 2) is above the game's rank
  cmRound: 5000,    // a second court manager in the same round (one per round covers all courts)
  clerkCourtSwitch: 15, // a clerk working on in the next round, but on another court
  load: 10,         // per game already worked (balances the load)
  gender: 8,        // bonus: female referee on a women's game
  repeat: 6,        // per earlier game a referee had with one of these teams
};

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const timeKey = (t) => parseSlots(t)[0] || String(t ?? "").trim();
const parseDate = (s) => { const [d, m, y] = String(s).split("/").map(Number); return (y || 0) * 10000 + (m || 0) * 100 + (d || 0); };
const byTime = (a, b) => parseDate(a.date) - parseDate(b.date) || timeKey(a.time).localeCompare(timeKey(b.time)) || String(a.court).localeCompare(String(b.court)) || (a.nr || 0) - (b.nr || 0);
const hasRole = (o, role) => Array.isArray(o?.roles) && parseRoles(o.roles).includes(role); // old codes read too
const teamKey = (t) => norm(String(t?.name ?? t ?? ""));

// Score of a grid: hard violations ≫ empty required slots ≫ weighted warnings,
// plus team repeats, minus the gender bonus. Load is balanced in the greedy
// pass; swaps between games don't change anyone's game count.
export function gridScore(games, officials, entries, w = DEFAULT_WEIGHTS, rules = DEFAULT_RULES) {
  const res = checkAssignments(games, officials, entries, rules);
  return { res, score: scoreOf(res, games, officials, w, rules) };
}
const SOFT_WEIGHT = { r2Nation: "r2Nation", reserve: "reserve", inRow: "break", refereeAsAssistantNation: "refereeAsAssistantNation", maxPerDay: "maxPerDay", pairSplit: "pairSplit", gender: "genderUnknown", nationClub: "nationClub", finalLines: "finalLines" };
function scoreOf(res, games, officials, w, rules) {
  let s = 0;
  for (const i of res.list) {
    if (i.code === "missing") { s += i.slot === "r1" || i.slot === "r2" ? w.missingRef : w.missing; continue; }
    if (i.code === "rank") { s += w.rankUnder * (i.gap || 1); continue; }
    const key = i.code === "r2Nation" && rules.r2NationKo === "lenient" ? "r2NationLenient" : SOFT_WEIGHT[i.code];
    s += i.level === "hard" ? w.hard : w[key] || 0;
  }
  const byName = new Map(officials.map((o) => [norm(officialName(o)), o]));
  const seen = new Map();
  const clerkAt = new Map(); // clerk → date → [[time, court]]
  for (const g of games) {
    const fem = isWomensGame(g);
    for (const slot of SLOTS) {
      const k = norm(g.refs?.[slot]);
      if (!k) continue;
      if (slot === "clerk" || slot === "clerk2") { const d = (clerkAt.get(k) || clerkAt.set(k, new Map()).get(k)); (d.get(g.date) || d.set(g.date, []).get(g.date)).push([timeKey(g.time), String(g.court)]); }
      if ((slot === "a1" || slot === "a2") && byName.has(k)) s += w.rankUnder * Math.max(0, rankLevel(gameRank(g)) - rankLevel(rankOf(byName.get(k))));
      if (slot !== "r1" && slot !== "r2") continue;
      for (const t of [teamKey(g.teamA), teamKey(g.teamB)]) {
        const key = k + "|" + t;
        const n = seen.get(key) || 0;
        s += n * w.repeat;
        seen.set(key, n + 1);
      }
      if (fem && (slot === "r1" || slot === "r2") && byName.get(k)?.gender === "f") s -= w.gender;
      if ((slot === "r1" || slot === "r2") && byName.has(k)) s += w.rankOver * Math.max(0, rankLevel(rankOf(byName.get(k))) - rankLevel(gameRank(g)));
    }
  }
  // Clerks keep their court from one round to the next.
  const times = new Map(); // date → sorted distinct start times
  for (const g of games) (times.get(g.date) || times.set(g.date, new Set()).get(g.date)).add(timeKey(g.time));
  for (const [, days] of clerkAt) for (const [date, list] of days) {
    const order = [...times.get(date)].sort();
    const at = new Map(list.map(([t, c]) => [order.indexOf(t), c]));
    for (const [i, c] of at) if (at.has(i - 1) && at.get(i - 1) !== c) s += w.clerkCourtSwitch;
  }
  return s;
}

export function autoAssign(games, officials, entries, opts = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const rules = { ...DEFAULT_RULES, ...opts.rules };
  const inScope = (g) => !opts.days?.length || opts.days.includes(g.date);
  const pool = (officials || []).filter((o) => officialName(o));
  const pools = { assistant: pool.some((o) => hasRole(o, "assistant")), clerk: pool.some((o) => hasRole(o, "clerk")), courtManager: pool.some((o) => hasRole(o, "courtManager")) };
  const required = (g, slot) => isRequiredSlot(g, slot, pools, rules);
  // Who may take a slot: in the final (event setting) the referees work the lines.
  const eligible = (o, g, slot) => ((slot === "a1" || slot === "a2") && refsOnLines(g, rules) ? hasRole(o, "referee") : canFill(o, slot));
  const keyOf = new Map(pool.map((o) => [o, norm(officialName(o))]));
  const byKey = new Map(pool.map((o) => [keyOf.get(o), o]));

  // Working copy. Cells in scope are cleared when overwriting; out-of-scope
  // games and locked cells stay and count for double booking / games in a row.
  const skipped = [];
  const work = [...games].sort(byTime).map((g) => {
    const refs = { ...(g.refs || {}) };
    const target = inScope(g) && !(isKnockout(g) && (isPlaceholder(g.teamA?.name ?? g.teamA) || isPlaceholder(g.teamB?.name ?? g.teamB)));
    if (inScope(g) && !target) skipped.push(g.id);
    if (target && opts.overwrite) for (const s of SLOTS) if (g.refsAuto?.[s]) refs[s] = "";
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
  // Court manager duty is kept apart (cm: Set(date|time)): one court manager
  // looks after all courts of a round, and the duty doesn't count for load,
  // breaks or maxPerDay of the other roles.
  // Clerk duty counts for the load but not for games in a row (clerks may
  // work on), and records the court per round (court loyalty).
  const st = new Map(); // key → { total, day: {date: n}, rounds: {date: Set}, booked: Set(date|time), teams: Map, cm: Set(date|time), court: Map(date|round → court) }
  const S = (k) => {
    if (!st.has(k)) st.set(k, { total: 0, day: {}, rounds: {}, booked: new Set(), teams: new Map(), cm: new Set(), court: new Map() });
    return st.get(k);
  };
  const cmRounds = (k, date) => [...S(k).cm].filter((x) => x.startsWith(date + "|")).length;
  const book = (k, g, slot) => {
    const p = S(k);
    if (slot === "cm") { p.cm.add(g.date + "|" + timeKey(g.time)); return; }
    p.total++;
    p.day[g.date] = (p.day[g.date] || 0) + 1;
    p.booked.add(g.date + "|" + timeKey(g.time));
    p.court.set(g.date + "|" + roundOf(g), String(g.court));
    if (slot === "clerk" || slot === "clerk2") return;
    (p.rounds[g.date] ||= new Set()).add(roundOf(g));
    if (slot === "r1" || slot === "r2") for (const t of [teamKey(g.teamA), teamKey(g.teamB)]) p.teams.set(t, (p.teams.get(t) || 0) + 1);
  };
  for (const g of work) for (const s of SLOTS) { const k = norm(g.refs[s]); if (k) book(k, g, s); }

  // Length of the run of consecutive rounds that `r` would be part of.
  const runWith = (k, date, r) => {
    const set = S(k).rounds[date] || new Set();
    let n = 1;
    for (let i = r - 1; set.has(i); i--) n++;
    for (let i = r + 1; set.has(i); i++) n++;
    return n;
  };

  // Assistant pairs per day: a pair is intact on a day unless a member is unavailable.
  const partnerOf = (o, date) => {
    if (!o?.assistantPair) return null;
    const p = pool.find((x) => x !== o && x.assistantPair === o.assistantPair);
    if (!p) return null;
    if (availabilityOn(p, date).status === "unavailable" || availabilityOn(o, date).status === "unavailable") return null;
    return p;
  };

  // Hard eligibility + marginal penalty of putting `o` into `slot` of game `g`.
  // Returns null when not allowed.
  const cost = (o, g, slot) => {
    const k = keyOf.get(o);
    if (!eligible(o, g, slot)) return null;
    if (!availableAt(o, g.date, g.time, minutesOn(rules, g.date))) return null;
    if (SLOTS.some((s) => norm(g.refs[s]) === k)) return null;
    if (S(k).booked.has(g.date + "|" + timeKey(g.time))) return null;
    if (slot === "cm") {
      // Court manager: role, availability and no other duty at this time.
      // One per round: whoever already manages a court in this round takes
      // this one too; otherwise spread the rounds evenly.
      if (S(k).cm.has(g.date + "|" + timeKey(g.time))) return 0;
      let c = w.cmRound + w.load * cmRounds(k, g.date);
      if (availabilityOn(o, g.date).status === "reserve") c += w.reserve;
      return c;
    }
    if (S(k).cm.has(g.date + "|" + timeKey(g.time))) return null;
    const isRef = slot === "r1" || slot === "r2", isAssistant = slot === "a1" || slot === "a2", isClerk = slot === "clerk" || slot === "clerk2";
    // Clerks may work game after game; everyone else needs breaks.
    const run = isClerk ? 1 : runWith(k, g.date, roundOf(g));
    if (run >= rules.hardInRow) return null;
    const A = teamMeta(entries, g.teamA), B = teamMeta(entries, g.teamB);
    const nation = o.country && (sameCountry(o.country, A.country) || sameCountry(o.country, B.country));
    const club = o.club && (sameClub(o.club, A.club) || sameClub(o.club, B.club));
    if (club && (isRef || isAssistant || isClerk)) return null; // members of a playing club never officiate it
    let c = 0;
    if (isRef) {
      if (nation && isClubGame(g)) c += w.nationClub; // club competition: only a strong warning
      else if (nation) {
        if (slot === "r1" || !isKnockout(g)) return null;
        c += rules.r2NationKo === "lenient" ? w.r2NationLenient : w.r2Nation;
      }
      if (isWomensGame(g) && o.gender === "f") c -= w.gender;
      const diff = rankLevel(rankOf(o)) - rankLevel(gameRank(g));
      if (slot === "r1" && diff < 0) c += w.rankUnder * -diff;
      if (diff > 0) c += w.rankOver * diff;
    }
    if (isAssistant) {
      if (nation && hasRole(o, "referee")) c += w.refereeAsAssistantNation;
      const diff = rankLevel(rankOf(o)) - rankLevel(gameRank(g));
      if (diff < 0) c += w.rankUnder * -diff;
    }
    if (isClerk) {
      const prev = S(k).court.get(g.date + "|" + (roundOf(g) - 1));
      if (prev && prev !== String(g.court)) c += w.clerkCourtSwitch;
    }
    if (availabilityOn(o, g.date).status === "reserve") c += w.reserve;
    if (run >= rules.softInRow) c += w.break * (run - rules.softInRow + 1);
    const p = S(k);
    if (o.maxPerDay && (p.day[g.date] || 0) >= o.maxPerDay) c += w.maxPerDay;
    c += w.load * ((p.day[g.date] || 0) + p.total / 2);
    if (isRef) c += w.repeat * ((p.teams.get(teamKey(g.teamA)) || 0) + (p.teams.get(teamKey(g.teamB)) || 0));
    return c;
  };
  // Tie-break: fewest games so far, then name.
  const tie = (a, b) => S(keyOf.get(a)).total - S(keyOf.get(b)).total || officialName(a).localeCompare(officialName(b));
  const pick = (cands) => cands.sort((x, y) => x.c - y.c || tie(x.o[0], y.o[0]) || (x.o[1] && y.o[1] ? tie(x.o[1], y.o[1]) : 0))[0];

  const set = (g, slot, o) => { g.refs[slot] = officialName(o); book(keyOf.get(o), g, slot); };

  for (const g of work) {
    if (!g._target) continue;
    const empty = (s) => !String(g.refs[s] ?? "").trim();

    // Referees: r1 + r2 together (r2 only where required — elsewhere by hand).
    const r = ["r1", "r2"].filter((s) => empty(s) && required(g, s));
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
        }
      } else {
        const slot = r[0], other = g.refs[slot === "r1" ? "r2" : "r1"];
        const cands = (slot === "r1" ? c1 : c2).filter((x) => genderOk(x.o, other)).map((x) => ({ o: [x.o], c: x.c }));
        best = pick(cands);
        if (best) set(g, slot, best.o[0]);
      }
    }

    // Assistants: a1 + a2, pairs together (when an assistant pool exists, or
    // in the final when the referees work the lines).
    const l = ["a1", "a2"].filter(empty);
    if ((pools.assistant || refsOnLines(g, rules)) && l.length) {
      // Penalty for one line judge given who works the other line.
      const pairCost = (o, mate) => {
        const p = partnerOf(o, g.date);
        if (p) return mate === p ? 0 : w.pairSplit;
        return w.soloAssistant;
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
          const one = pick(ca.map((x) => ({ o: [x.o], c: x.c + w.soloAssistant })));
          if (one) set(g, "a1", one.o[0]);
        }
      } else {
        const slot = l[0];
        const mate = byKey.get(norm(g.refs[slot === "a1" ? "a2" : "a1"]));
        const cands = ca.map((x) => ({ o: [x.o], c: x.c + pairCost(x.o, mate) + (mate ? (partnerOf(mate, g.date) === x.o ? 0 : partnerOf(mate, g.date) ? w.pairSplit : 0) : 0) }));
        const best = pick(cands);
        if (best) set(g, slot, best.o[0]);
      }
    }

    // Clerks (when a clerk pool exists; Clerk 2 on the courts set for it).
    for (const slot of ["clerk", "clerk2"]) {
      if (!empty(slot) || !required(g, slot)) continue;
      const best = pick(pool.map((o) => ({ o: [o], c: cost(o, g, slot) })).filter((x) => x.c !== null));
      if (best) set(g, slot, best.o[0]);
    }

    // Court manager (only when a court manager pool exists).
    if (pools.courtManager && empty("cm")) {
      const best = pick(pool.map((o) => ({ o: [o], c: cost(o, g, "cm") })).filter((x) => x.c !== null));
      if (best) set(g, "cm", best.o[0]);
    }
  }

  const deadline = Date.now() + (opts.timeBudgetMs ?? 1500);
  const locked = new Map(games.map((g) => [g.id, Object.fromEntries(SLOTS.map((s) => [s, opts.overwrite && g.refsAuto?.[s] ? "" : g.refs?.[s] ?? ""]))]));
  const fresh = (g, s) => g._target && !String(locked.get(g.id)?.[s] ?? "").trim() && String(g.refs[s] ?? "").trim();
  const days = [...new Set(work.filter((g) => g._target).map((g) => g.date))];
  const byId = new Map(work.map((g) => [g.id, g]));

  // Repair: the greedy pass fills games in order, so a neutral referee may
  // already be booked in a parallel game when a later game needs them. For
  // each empty required slot, try moving someone X there from another newly
  // filled cell of the same day, and refilling X's old cell with a free
  // official or with someone Y taken from a third cell (which then stays
  // empty). Empty slots are part of the score (referees ≫ scorer / line
  // judges), so trading an empty Referee 2 for an empty Clerk is an
  // improvement. Keep the best chain while the day's score drops and no hard
  // violation is added; locked cells are never touched.
  for (const date of days) {
    const dayGames = work.filter((g) => g.date === date);
    let cur = gridScore(dayGames, pool, entries, w, rules);
    for (let step = 0; step < (opts.maxSwaps ?? 200) && Date.now() < deadline; step++) {
      const holes = cur.res.list
        .filter((i) => i.code === "missing" && byId.get(i.gameId)?._target)
        .sort((a, b) => (b.slot === "r1" || b.slot === "r2") - (a.slot === "r1" || a.slot === "r2"));
      const cells = [];
      for (const g of dayGames) for (const s of SLOTS) if (fresh(g, s)) cells.push([g, s]);
      let best = null;
      const consider = (moves) => {
        const undo = moves.map(([g, s, v]) => { const old = g.refs[s]; g.refs[s] = v; return [g, s, old]; });
        const next = gridScore(dayGames, pool, entries, w, rules);
        if (next.res.counts.hard <= cur.res.counts.hard && next.score < (best ? best.next.score : cur.score)) best = { next, moves };
        for (const [g, s, old] of undo.reverse()) g.refs[s] = old;
      };
      for (const hole of holes) {
        const g = byId.get(hole.gameId), s = hole.slot;
        // Direct fill: someone free by now (or a court manager on a parallel court).
        for (const o of pool) if (eligible(o, g, s) && availableAt(o, g.date, g.time, minutesOn(rules, g.date))) consider([[g, s, officialName(o)]]);
        for (const [g2, s2] of cells) {
          if (Date.now() >= deadline) break;
          const v = g2.refs[s2], X = byKey.get(norm(v));
          if (!X || !eligible(X, g, s) || !availableAt(X, g.date, g.time, minutesOn(rules, g.date))) continue;
          consider([[g2, s2, ""], [g, s, v]]);
          for (const Y of pool) {
            const vy = officialName(Y);
            if (norm(vy) === norm(v) || !eligible(Y, g2, s2) || !availableAt(Y, g2.date, g2.time, minutesOn(rules, g2.date))) continue;
            consider([[g2, s2, vy], [g, s, v]]);
            for (const [g3, s3] of cells) {
              if ((g3 === g2 && s3 === s2) || norm(g3.refs[s3]) !== norm(vy)) continue;
              consider([[g3, s3, ""], [g2, s2, vy], [g, s, v]]);
            }
          }
        }
        if (best) break; // re-plan from the improved grid
      }
      if (!best) break;
      for (const [x, t, v] of best.moves) x.refs[t] = v;
      cur = best.next;
    }
  }

  // Local improvement: for each newly filled single cell (referee or scorer)
  // that still has an issue, try swapping it with another newly filled cell of
  // the same kind on the same day; keep a swap if the day's score drops and no
  // hard violation is added. Only problem cells are tried, and the pass stops
  // after opts.timeBudgetMs (the greedy result alone is already valid).
  for (const date of days) {
    const dayGames = work.filter((g) => g.date === date);
    let cur = gridScore(dayGames, pool, entries, w, rules);
    for (let step = 0; step < (opts.maxSwaps ?? 200) && Date.now() < deadline; step++) {
      const cells = [];
      for (const g of dayGames) for (const s of ["r1", "r2", "clerk", "clerk2"]) if (fresh(g, s)) cells.push([g, s]);
      const problems = cells.filter(([g, s]) => cur.res.cells[g.id]?.[s]?.length);
      const isClerk = (s) => s === "clerk" || s === "clerk2";
      let done = false;
      for (const [g1, s1] of problems) {
        for (const [g2, s2] of cells) {
          if (Date.now() >= deadline) break;
          if (g1 === g2 || isClerk(s1) !== isClerk(s2)) continue;
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

  // Assistants: swap whole crews (a1 + a2, so pairs stay together) between
  // two games of the same day when that removes a problem (e.g. a missing
  // break). Only crews auto-assign placed in this run; set-by-hand ones stay.
  for (const date of days) {
    const dayGames = work.filter((g) => g.date === date);
    let cur = gridScore(dayGames, pool, entries, w, rules);
    const crew = (g) => fresh(g, "a1") && fresh(g, "a2");
    for (let step = 0; step < (opts.maxSwaps ?? 200) && Date.now() < deadline; step++) {
      const crews = dayGames.filter(crew);
      const problems = crews.filter((g) => ["a1", "a2"].some((s) => cur.res.cells[g.id]?.[s]?.length));
      let done = false;
      for (const g1 of problems) {
        for (const g2 of crews) {
          if (Date.now() >= deadline) break;
          if (g1 === g2) continue;
          const c1 = [g1.refs.a1, g1.refs.a2], c2 = [g2.refs.a1, g2.refs.a2];
          [g1.refs.a1, g1.refs.a2, g2.refs.a1, g2.refs.a2] = [...c2, ...c1];
          const next = gridScore(dayGames, pool, entries, w, rules);
          if (next.res.counts.hard <= cur.res.counts.hard && next.score < cur.score) { cur = next; done = true; break; }
          [g1.refs.a1, g1.refs.a2, g2.refs.a1, g2.refs.a2] = [...c1, ...c2];
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
  // Required slots still empty in the assigned games (after the repair pass).
  const target = new Set(work.filter((g) => g._target).map((g) => g.id));
  const unfilled = after.res.list.filter((i) => i.code === "missing" && target.has(i.gameId)).map(({ gameId, slot }) => ({ gameId, slot }));
  return {
    proposals, games: out, skipped, unfilled,
    before: before.res, after: after.res, scoreBefore: before.score, scoreAfter: after.score,
  };
}
