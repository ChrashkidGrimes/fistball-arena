// Auto-advancement resolver (pure). Given a category's games (each knockout game
// carrying srcA/srcB) and its results (by game id), work out which placeholder
// slots can now be filled with a real team:
//   - seed   → the QR group ranking (once the group is complete)
//   - winner → the winner of a finished source game
//   - loser  → the loser of a finished source game
// Returns { [gameId]: { teamA?, teamB? } } with only the newly-resolvable slots.

import { rankGroup, groupComplete } from "./standings.js";

const num = (x) => (Number.isFinite(+x) ? +x : 0);
const finished = (r) => r && r.status === "Finished";
const winnerOf = (r) => (!finished(r) ? null : num(r.setsA) > num(r.setsB) ? r.teamA : num(r.setsB) > num(r.setsA) ? r.teamB : null);
const loserOf = (r) => (!finished(r) ? null : num(r.setsA) > num(r.setsB) ? r.teamB : num(r.setsB) > num(r.setsA) ? r.teamA : null);

export function isPlaceholder(name) {
  const n = String(name || "").trim();
  return !n || /(winner|loser)/i.test(n) || /\b\d+(st|nd|rd|th)\b/i.test(n);
}

// games: [{ id, category, phase:"group"|"ko", round, teamA, teamB, srcA, srcB }]
// resultsById: { [gameId]: { teamA, teamB, setsA, setsB, status } }
export function resolveAdvancement(games, resultsById, teamCount) {
  const qrResults = games.filter((g) => g.phase === "group").map((g) => resultsById[g.id]).filter(Boolean);
  const ranking = groupComplete(qrResults, teamCount) ? rankGroup(qrResults) : null;

  const resolve = (src) => {
    if (!src) return null;
    if (src.type === "seed") return ranking ? ranking[src.rank - 1] || null : null;
    if (src.type === "winner") return winnerOf(resultsById[src.game || src.dep]);
    if (src.type === "loser") return loserOf(resultsById[src.game || src.dep]);
    return null;
  };

  const out = {};
  for (const g of games) {
    if (g.phase !== "ko") continue;
    const patch = {};
    const a = resolve(g.srcA), b = resolve(g.srcB);
    if (a && !isPlaceholder(a) && a !== g.teamA) patch.teamA = a;
    if (b && !isPlaceholder(b) && b !== g.teamB) patch.teamB = b;
    if (Object.keys(patch).length) out[g.id] = patch;
  }
  return out;
}
