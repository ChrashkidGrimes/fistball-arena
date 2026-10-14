// Orchestrates the schedule generator: round-robin group fixtures + knockout
// bracket → automatic slot allocation → Firestore game docs.

import { roundRobin } from "./roundRobin.js";
import { buildBracket } from "./bracket.js";
import { buildFormat, hasFormat, buildGroupFormat } from "./format.js";
import { allocate } from "./scheduler.js";
import { team } from "../seed.js";

// The category's published name = typed name + its sex, so the Live can split
// Women/Men (it reads the word "Men"/"Women" from the category). If the typed
// name already states the sex, it's used as-is; a missing sex leaves it plain.
export function categoryLabel(cat) {
  const name = (cat.name || "").trim();
  const g = cat.gender === "women" ? "Women" : cat.gender === "men" ? "Men" : "";
  if (!g) return name || "Category";
  if (/\b(men|women)\b/i.test(name)) return name || g;
  return name ? `${name} ${g}` : g;
}

// config:
// {
//   categories: [{ name, bestOf, double, qualifiersPerGroup, knockout,
//                  groups: [{ label, teams: [name, ...] }] }],
//   slots: { courts: [], days: [], startTime, slotMinutes, slotsPerDay },
//   startNr,
// }
export function generateSchedule(config) {
  const warnings = [];
  const fixtures = [];
  let seq = 0;

  for (const cat of config.categories || []) {
    const catName = categoryLabel(cat);
    const catKey = catName.replace(/\s+/g, "_");

    // Several groups: round-robin per group + cross-over knockout. One group:
    // championship preset by team count (rank-seeded knockout).
    const allTeams = (cat.groups || []).flatMap((g) => g.teams || []);
    const multi = (cat.groups || []).filter((g) => (g.teams || []).length).length > 1;
    if (multi || hasFormat(allTeams.length)) {
      const opts = { category: catName, bestOf: cat.bestOf || 3, bestOfKo: cat.bestOfKo, double: !!cat.double, knockout: cat.knockout !== false };
      const built = multi
        ? buildGroupFormat(cat.groups.filter((g) => (g.teams || []).length), { ...opts, qualifiers: cat.qualifiers, placements: cat.placements !== false, override: cat.override })
        : buildFormat(allTeams, { ...opts, override: cat.override });
      warnings.push(...(built.warnings || []));
      const nsSrc = (s) => (s && s.dep ? { ...s, dep: `${catKey}:${s.dep}` }
        : s && s.deps ? { ...s, deps: s.deps.map((d) => `${catKey}:${d}`) } : s);
      for (const f of built.fixtures) {
        fixtures.push({
          ...f, id: `${catKey}:${f.id}`, deps: (f.deps || []).map((d) => `${catKey}:${d}`), seq: seq++,
          srcA: nsSrc(f.srcA), srcB: nsSrc(f.srcB),
        });
      }
      continue;
    }

    const groups = (cat.groups || []).filter((g) => (g.teams || []).length >= 2);
    if (!groups.length) {
      warnings.push(`${catName}: no group has 2+ teams — skipped.`);
      continue;
    }

    // Group stage (round-robin per group), interleaved later by round index.
    for (const g of groups) {
      const rounds = roundRobin(g.teams, !!cat.double);
      rounds.forEach((round, ri) => {
        round.forEach(([a, b], i) => {
          fixtures.push({
            id: `${catKey}:grp:${g.label}:${ri}:${i}`,
            category: catName, bestOf: cat.bestOf, group: g.label,
            round: "Qualification round", phase: "group",
            groupRoundIndex: ri, seq: seq++,
            teamA: a, teamB: b, deps: [],
          });
        });
      });
    }

    // Knockout bracket (placeholder teams). Namespace ids + deps per category.
    const { fixtures: ko, warnings: kw } = buildBracket(groups, cat.qualifiersPerGroup || 2, {
      category: catName, bestOf: cat.bestOfKo || cat.bestOf, knockout: !!cat.knockout,
    });
    warnings.push(...kw);
    for (const f of ko) {
      fixtures.push({
        ...f,
        id: `${catKey}:${f.id}`,
        deps: (f.deps || []).map((d) => `${catKey}:${d}`),
        seq: seq++,
      });
    }
  }

  if (!fixtures.length) return { games: [], warnings, unplaced: [], fixtureCount: 0 };

  const { placed, unplaced, warnings: aw } = allocate(fixtures, config.slots);
  warnings.push(...aw);

  let nr = Number(config.startNr) || 1;
  const idToNr = new Map();
  for (const p of placed) idToNr.set(p.fixture.id, nr++);
  const mapSrc = (s, category) => {
    if (!s) return undefined;
    if (s.type === "seed") return s.group ? { type: "seed", group: s.group, rank: s.rank, category } : { type: "seed", rank: s.rank, category };
    if (s.type === "rankedLoser") {
      const games = (s.deps || []).map((d) => idToNr.get(d)).filter(Boolean).map((n) => `g${n}`);
      return games.length === (s.deps || []).length ? { type: "rankedLoser", games, rank: s.rank } : undefined;
    }
    const n = idToNr.get(s.dep);
    return n ? { type: s.type, game: `g${n}` } : undefined;
  };
  const games = placed.map((p) => ({
    nr: idToNr.get(p.fixture.id),
    date: p.date,
    time: p.time,
    court: p.court,
    bestOf: p.fixture.bestOf,
    round: p.fixture.round,
    category: p.fixture.category,
    group: p.fixture.group || "",
    teamA: team(p.fixture.teamA),
    teamB: team(p.fixture.teamB),
    srcA: mapSrc(p.fixture.srcA, p.fixture.category) || null,
    srcB: mapSrc(p.fixture.srcB, p.fixture.category) || null,
  }));

  return { games, warnings, unplaced, fixtureCount: fixtures.length };
}
