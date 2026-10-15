// Plans for handing out — pure data, shared by the Plans page and its PDF.
//
// teamPlans(games, teamKits) → [{ key, name, category, rows: [{ g, opponent, kit }] }]
//   every real team (per category, uniforms are per category) with its games
//   in time order and the uniform it wears (resolved kit or null).
// officialPlans(games, refs, refKits, date) → { rounds, plans: [{ key, name,
//   country, onDuty, rows: [{ time, duties: [{ slot, games, courts, shirts }] }] }] }
//   every round of the day per official; an empty `duties` list = free. A
//   court manager on several courts of a round is one duty.

import { resolveKit, teamKitsFor } from "../kits.js";
import { isPlaceholder } from "../schedule/advance.js";
import { parseSlots } from "./model.js";

export const PLAN_SLOTS = ["r1", "r2", "clerk", "clerk2", "a1", "a2", "cm"];
const parseDate = (s) => { const [d, m, y] = String(s).split("/").map(Number); return (y || 0) * 10000 + (m || 0) * 100 + (d || 0); };
export const timeKey = (t) => parseSlots(t)[0] || String(t ?? "").trim();
export const byTime = (a, b) => parseDate(a.date) - parseDate(b.date) || timeKey(a.time).localeCompare(timeKey(b.time))
  || String(a.court).localeCompare(String(b.court), undefined, { numeric: true }) || (a.nr || 0) - (b.nr || 0);
const refName = (r) => [r.first, r.name].filter(Boolean).join(" ").trim();

export function planDays(games) {
  return [...new Set([...games].sort(byTime).map((g) => g.date).filter(Boolean))];
}

export function teamPlans(games, teamKits) {
  const m = new Map();
  for (const g of [...games].sort(byTime)) for (const side of ["A", "B"]) {
    const name = side === "A" ? g.teamA?.name : g.teamB?.name;
    if (!name || isPlaceholder(name)) continue;
    const key = `${name} · ${g.category || ""}`;
    if (!m.has(key)) m.set(key, { key, name, category: g.category || "", rows: [] });
    m.get(key).rows.push({
      g,
      opponent: side === "A" ? g.teamB : g.teamA,
      kit: resolveKit(g.kit?.[side], teamKitsFor(teamKits, name, g.category)),
    });
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name) || a.category.localeCompare(b.category));
}

export function officialPlans(games, refs, refKits, date) {
  const dayGames = [...games].filter((g) => g.date === date).sort(byTime);
  const rounds = [...new Set(dayGames.map((g) => timeKey(g.time)))].sort();
  const people = new Map((refs || []).map((r) => [refName(r).toLowerCase(), { key: refName(r).toLowerCase(), name: refName(r), country: r.country || "" }]));
  for (const g of games) for (const s of PLAN_SLOTS) {
    const n = String(g.refs?.[s] ?? "").trim();
    if (n && !people.has(n.toLowerCase())) people.set(n.toLowerCase(), { key: n.toLowerCase(), name: n, country: "" });
  }
  const shirtOf = (g) => (refKits || []).find((r) => r.id === g.kit?.R);
  const plans = [...people.values()].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
    const rows = rounds.map((time) => {
      const byDuty = new Map();
      for (const g of dayGames.filter((x) => timeKey(x.time) === time)) for (const s of PLAN_SLOTS) {
        if (String(g.refs?.[s] ?? "").trim().toLowerCase() !== p.key) continue;
        const k = s === "cm" ? "cm" : s + "|" + g.id;
        if (!byDuty.has(k)) byDuty.set(k, { slot: s, games: [] });
        byDuty.get(k).games.push(g);
      }
      const duties = [...byDuty.values()].map((d) => ({
        ...d,
        courts: d.games.map((g) => g.court),
        shirts: [...new Map(d.games.map(shirtOf).filter(Boolean).map((r) => [r.id, r])).values()],
      }));
      return { time, duties };
    });
    return { ...p, rows, onDuty: rows.filter((r) => r.duties.length).length };
  });
  return { rounds, plans };
}
