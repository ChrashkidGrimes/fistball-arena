// Uniform (kit) selection — pure logic, see docs/referee-assignment-spec.md §4.
//
// Colours: two shirts clash when their CIE76 ΔE (Lab) is below the threshold.
// Only shirts count — shorts are ignored.
//
// suggestKits(games, teamKits, opts) → {
//   proposals: [{ gameId, side: "A"|"B", from, to }],
//   games,            // games with the proposal applied
//   changes: { [team]: { [date]: n } },   // kit changes per team and day
//   unresolvable: [gameId], clashes: [gameId]  // after the proposal
// }
// Per day (chronological, so the previous day's kit is known), per connected
// component of the "plays against" graph:
//   1. one kit per team for the whole day if any clash-free choice exists
//      (exhaustive over the teams with two kits);
//   2. otherwise the fewest kit changes: DP over the day's time slots, state =
//      every team's current kit.
// Objectives (lexicographic): no clash › fewest changes › wear the OTHER kit
// than the previous day › Uniform 1.

import { resolveKit } from "../kits.js";
import { parseSlots } from "./model.js";

export const DEFAULT_KIT_RULES = { threshold: 35, maxExhaustive: 16 };

/* ---------- colour distance ---------- */
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgbToLab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
// CIE76 ΔE between two hex colours; Infinity when either is missing/invalid.
export function deltaE(a, b) {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return Infinity;
  const [l1, a1, b1] = rgbToLab(ra), [l2, a2, b2] = rgbToLab(rb);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/* ---------- helpers ---------- */
const name = (t) => String(t?.name ?? t ?? "");
const timeKey = (t) => parseSlots(t)[0] || String(t ?? "").trim();
const dateNum = (s) => { const [d, m, y] = String(s).split("/").map(Number); return (y || 0) * 10000 + (m || 0) * 100 + (d || 0); };
const byTime = (a, b) => dateNum(a.date) - dateNum(b.date) || timeKey(a.time).localeCompare(timeKey(b.time)) || (a.nr || 0) - (b.nr || 0);
// Registered kit numbers of a team (a kit counts when it has a shirt colour).
export const kitNumbers = (kits) => [1, 2].filter((n) => kits?.[n - 1]?.shirt);
const shirtOf = (v, kits) => resolveKit(v, kits)?.shirt || "";

// Can these two teams ever play without a clash (any combination of their kits)?
function resolvable(kitsA, kitsB, th, optsA = kitNumbers(kitsA), optsB = kitNumbers(kitsB)) {
  if (!optsA.length || !optsB.length) return true;
  return optsA.some((x) => optsB.some((y) => deltaE(kitsA[x - 1].shirt, kitsB[y - 1].shirt) >= th));
}

// Status of each game's CURRENT kits, for the badges on the Uniforms page:
// { [gameId]: { level: "clash" | "unresolvable", msg } } (only games with an issue).
export function checkKits(games, teamKits, opts = {}) {
  const th = opts.threshold ?? DEFAULT_KIT_RULES.threshold;
  const out = {};
  for (const g of games) {
    const kA = teamKits[name(g.teamA)], kB = teamKits[name(g.teamB)];
    const vA = g.kit?.A, vB = g.kit?.B;
    if (!resolvable(kA, kB, th)) { out[g.id] = { level: "unresolvable", msg: "Every uniform combination of these teams clashes" }; continue; }
    const sA = shirtOf(vA, kA), sB = shirtOf(vB, kB);
    if (!sA || !sB) continue;
    const d = deltaE(sA, sB);
    if (d < th) out[g.id] = { level: "clash", msg: `Shirts too similar (ΔE ${Math.round(d)})` };
  }
  return out;
}

// Kit changes per team and day for a set of games: consecutive games of a team
// on a day with different kit values.
export function countChanges(games) {
  const last = new Map(), out = {};
  for (const g of [...games].sort(byTime)) {
    for (const side of ["A", "B"]) {
      const t = name(side === "A" ? g.teamA : g.teamB), v = g.kit?.[side];
      if (!t || !v) continue;
      const k = t + "|" + g.date;
      if (last.has(k) && last.get(k) !== v) ((out[t] ||= {})[g.date] = (out[t][g.date] || 0) + 1);
      last.set(k, v);
    }
  }
  return out;
}

// The kit a team "wore" on a day: most games, ties → its last game.
function dayKitOf(team, dayGames) {
  const cnt = {}; let lastV = null;
  for (const g of dayGames) {
    const side = name(g.teamA) === team ? "A" : name(g.teamB) === team ? "B" : null;
    const v = side && g.kit?.[side];
    if (typeof v !== "number") continue;
    cnt[v] = (cnt[v] || 0) + 1; lastV = v;
  }
  const best = Math.max(0, ...Object.values(cnt));
  if (!best) return null;
  const tied = Object.keys(cnt).map(Number).filter((v) => cnt[v] === best);
  return tied.includes(lastV) ? lastV : tied[0];
}

// Lexicographic cost tuples: [clashes, changes, sameAsPrevDay, uniform2].
const ZERO = [0, 0, 0, 0];
const add = (a, b) => a.map((x, i) => x + b[i]);
const less = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

export function suggestKits(games, teamKits, opts = {}) {
  const th = opts.threshold ?? DEFAULT_KIT_RULES.threshold;
  const maxEx = opts.maxExhaustive ?? DEFAULT_KIT_RULES.maxExhaustive;
  const inScope = (g) => !opts.days?.length || opts.days.includes(g.date);
  const work = [...games].sort(byTime).map((g) => ({ ...g, kit: { ...(g.kit || {}) } }));
  const days = [...new Set(work.map((g) => g.date))].sort((a, b) => dateNum(a) - dateNum(b));
  const prevKit = new Map(); // team → kit worn on its last playing day

  for (const date of days) {
    const dayGames = work.filter((g) => g.date === date);
    if (dayGames.some(inScope)) solveDay(dayGames.filter(inScope));
    // Remember today's kit per team for tomorrow's alternation.
    for (const t of new Set(dayGames.flatMap((g) => [name(g.teamA), name(g.teamB)]))) {
      const k = dayKitOf(t, dayGames);
      if (k) prevKit.set(t, k);
    }
  }

  function solveDay(dayGames) {
    // Locked sides: a kit number already set (unless overwriting) is a fixed
    // constraint; an old-style hex string stays as it is and is not modelled.
    const lockedOf = (g, side) => {
      const v = g.kit?.[side];
      if (typeof v === "string" && v) return "legacy";
      return !opts.overwrite && typeof v === "number" ? v : null;
    };
    // Connected components over teams that have kits.
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
    const teamsOf = (g) => [name(g.teamA), name(g.teamB)].filter((t) => kitNumbers(teamKits[t]).length);
    for (const g of dayGames) for (const t of teamsOf(g)) if (!parent.has(t)) parent.set(t, t);
    for (const g of dayGames) { const ts = teamsOf(g); if (ts.length === 2) parent.set(find(ts[0]), find(ts[1])); }
    const comps = new Map();
    for (const t of parent.keys()) { const r = find(t); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(t); }

    for (const teams of comps.values()) {
      const tset = new Set(teams);
      const cg = dayGames.filter((g) => tset.has(name(g.teamA)) || tset.has(name(g.teamB)));
      solveComponent(teams, cg, lockedOf);
    }
  }

  function solveComponent(teams, cg, lockedOf) {
    // Variables: teams with two kits. Fixed: single-kit teams.
    const opts1 = new Map(teams.map((t) => [t, kitNumbers(teamKits[t])]));
    const vars = teams.filter((t) => opts1.get(t).length === 2).sort();
    const vi = new Map(vars.map((t, i) => [t, i]));
    const kitIn = (t, state) => (vi.has(t) ? ((state >> vi.get(t)) & 1) + 1 : opts1.get(t)[0]);
    const unres = new Set(cg.filter((g) => !resolvable(teamKits[name(g.teamA)], teamKits[name(g.teamB)], th)).map((g) => g.id));

    // Value worn by a side in a game for a given state (locked sides win).
    const sideVal = (g, side, state) => {
      const t = name(side === "A" ? g.teamA : g.teamB);
      const lk = lockedOf(g, side);
      if (lk === "legacy") return g.kit[side];
      if (!opts1.get(t)?.length) return null; // team without kits
      return kitIn(t, state);
    };
    // Cost of one game under a state; null when a locked side disagrees.
    const gameCost = (g, state) => {
      const c = [...ZERO];
      for (const side of ["A", "B"]) {
        const lk = lockedOf(g, side), t = name(side === "A" ? g.teamA : g.teamB);
        if (typeof lk === "number" && opts1.get(t)?.length && kitIn(t, state) !== lk) return null;
      }
      const tA = name(g.teamA), tB = name(g.teamB);
      const vA = sideVal(g, "A", state), vB = sideVal(g, "B", state);
      if (vA && vB && !unres.has(g.id) && deltaE(shirtOf(vA, teamKits[tA]), shirtOf(vB, teamKits[tB])) < th) c[0]++;
      for (const [t, v] of [[tA, vA], [tB, vB]]) {
        if (typeof v !== "number" || !vi.has(t)) continue;
        if (prevKit.has(t) && prevKit.get(t) === v) c[2]++;
        if (v === 2) c[3]++;
      }
      return c;
    };
    const assign = (g, stateOf) => {
      for (const side of ["A", "B"]) {
        const t = name(side === "A" ? g.teamA : g.teamB);
        if (lockedOf(g, side) !== null || !opts1.get(t)?.length) continue;
        g.kit[side] = kitIn(t, stateOf(g));
      }
    };

    const k = vars.length;
    // Step 1: one kit per team for the whole day.
    if (k <= maxEx) {
      let best = null, bestS = 0;
      for (let s = 0; s < 1 << k; s++) {
        let c = [...ZERO], ok = true;
        for (const g of cg) { const gc = gameCost(g, s); if (!gc || gc[0]) { ok = false; break; } c = add(c, gc); }
        if (ok && (!best || less(c, best))) { best = c; bestS = s; }
      }
      if (best) { for (const g of cg) assign(g, () => bestS); return; }

      // Step 2: fewest changes — DP over time slots. dist[s] = best cost of
      // being in state s after the slot; a change of state costs its Hamming
      // distance (number of teams switching), computed per dimension.
      const slots = [...new Set(cg.map((g) => timeKey(g.time)))].sort();
      const N = 1 << k;
      let dist = new Array(N).fill(null).map(() => [...ZERO]);
      const back = []; // per slot: src state for each state
      for (const slot of slots) {
        const sg = cg.filter((g) => timeKey(g.time) === slot);
        // Transition: relax over Hamming distance (one pass per team).
        const d = dist.map((x) => x && [...x]);
        const src = Array.from({ length: N }, (_, s) => s);
        for (let i = 0; i < k; i++) {
          for (let s = 0; s < N; s++) {
            const o = s ^ (1 << i);
            if (!d[o]) continue;
            const cand = add(d[o], [0, 1, 0, 0]);
            if (!d[s] || less(cand, d[s])) { d[s] = cand; src[s] = src[o]; }
          }
        }
        // Add this slot's game costs.
        const next = new Array(N).fill(null);
        for (let s = 0; s < N; s++) {
          if (!d[s]) continue;
          let c = d[s], ok = true;
          for (const g of sg) { const gc = gameCost(g, s); if (!gc) { ok = false; break; } c = add(c, gc); }
          if (ok) next[s] = c;
        }
        back.push(src);
        dist = next;
      }
      let end = -1;
      for (let s = 0; s < N; s++) if (dist[s] && (end < 0 || less(dist[s], dist[end]))) end = s;
      if (end >= 0) {
        // Walk back: state used in each slot.
        const stateAt = new Array(slots.length);
        let s = end;
        for (let i = slots.length - 1; i >= 0; i--) { stateAt[i] = s; s = back[i][s]; }
        const idx = new Map(slots.map((t, i) => [t, i]));
        for (const g of cg) assign(g, (x) => stateAt[idx.get(timeKey(x.time))]);
        return;
      }
    }

    // Fallback (very large component or locked constraints that conflict):
    // greedy in time order — keep each team's kit, switch one team only when a
    // game would clash.
    const cur = new Map(teams.map((t) => [t, prevKit.has(t) && opts1.get(t).length === 2 ? 3 - prevKit.get(t) : opts1.get(t)[0]]));
    for (const g of [...cg].sort(byTime)) {
      const tA = name(g.teamA), tB = name(g.teamB);
      for (const [t, side] of [[tA, "A"], [tB, "B"]]) { const lk = lockedOf(g, side); if (typeof lk === "number" && cur.has(t)) cur.set(t, lk); }
      const shirt = (t, side) => (lockedOf(g, side) === "legacy" ? g.kit[side] : cur.has(t) ? teamKits[t][cur.get(t) - 1]?.shirt : "");
      if (!unres.has(g.id) && deltaE(shirt(tA, "A"), shirt(tB, "B")) < th) {
        for (const [t, side] of [[tB, "B"], [tA, "A"]]) {
          if (lockedOf(g, side) !== null || opts1.get(t)?.length !== 2) continue;
          const alt = 3 - cur.get(t);
          const other = t === tA ? shirt(tB, "B") : shirt(tA, "A");
          if (deltaE(teamKits[t][alt - 1].shirt, other) >= th) { cur.set(t, alt); break; }
        }
      }
      for (const [t, side] of [[tA, "A"], [tB, "B"]]) if (lockedOf(g, side) === null && cur.has(t)) g.kit[side] = cur.get(t);
    }
  }

  const out = work;
  const orig = new Map(games.map((g) => [g.id, g.kit || {}]));
  const proposals = [];
  for (const g of out) for (const side of ["A", "B"]) {
    const from = orig.get(g.id)?.[side] ?? "", to = g.kit[side] ?? "";
    if (from !== to) proposals.push({ gameId: g.id, side, from, to });
  }
  const after = checkKits(out, teamKits, { threshold: th });
  return {
    proposals, games: out, changes: countChanges(out.filter(inScope)),
    unresolvable: Object.keys(after).filter((id) => after[id].level === "unresolvable"),
    clashes: Object.keys(after).filter((id) => after[id].level === "clash"),
  };
}
