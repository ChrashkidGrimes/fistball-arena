// Officials rules engine — pure checks of a referee assignment against the hard
// and soft rules in docs/referee-assignment-spec.md §3.1–3.4.
//
// checkAssignments(games, officials, entries, opts) →
//   { cells: { [gameId]: { [slot]: Issue[] } }, list: Issue[], counts: { hard, soft, missing } }
// Issue = { gameId, slot, name, level: "hard" | "soft", code, msg }
//
// Grid cells hold free-text names; a name is matched to the registry by
// "First Family" (case-insensitive). Names not in the registry only get the
// name-based checks (double booking, games in a row).

import {
  SLOT_ROLE, ROLE_LABEL, parseRoles, canFill, availabilityOn, availableAt, parseSlots,
  teamMeta, sameCountry, sameClub, isWomenFinal, RANK_LABEL, rankOf, rankLevel, gameRank,
  isFinalsRound, isGoldFinal, isClubGame, windowLabel,
} from "./model.js";

export const SLOTS = ["r1", "r2", "clerk", "clerk2", "a1", "a2", "cm"];
export const SLOT_LABEL = { r1: "Referee 1", r2: "Referee 2", clerk: "Clerk", clerk2: "Clerk 2", a1: "Assistant 1", a2: "Assistant 2", cm: "Court manager" };

// Plus the event settings (model.js officialsSettings): r2, clerk2Courts,
// finalRefsOnLines, gameMinutes.
export const DEFAULT_RULES = {
  softInRow: 2, // this many consecutive rounds → warning (a free round after every game is preferred)
  hardInRow: 3, // this many consecutive rounds → hard violation
  r2: "always", clerk2Courts: [], finalRefsOnLines: true, gameMinutes: 45,
};

// Clerks may work game after game (stable table crews), court managers look
// after many games — neither counts for games in a row.
const NO_BREAK_SLOTS = new Set(["clerk", "clerk2", "cm"]);

// Is this slot required in this game? (Referee 1 always; Referee 2 always or
// only in the finals rounds; the others when someone has that role; Clerk 2
// only on the courts set for it.)
export function isRequiredSlot(game, slot, pools, cfg = DEFAULT_RULES) {
  switch (slot) {
    case "r1": return true;
    case "r2": return cfg.r2 !== "finals" || isFinalsRound(game?.round);
    case "a1": case "a2": return !!pools.assistant;
    case "clerk": return !!pools.clerk;
    case "clerk2": return !!pools.clerk && (cfg.clerk2Courts || []).map(String).includes(String(game?.court));
    case "cm": return !!pools.courtManager;
    default: return false;
  }
}
// In the final, the referees work the lines (event setting).
export const refsOnLines = (game, cfg = DEFAULT_RULES) => cfg.finalRefsOnLines !== false && isGoldFinal(game?.round);

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
export const officialName = (o) => [o?.first, o?.name].filter(Boolean).join(" ").trim();
const timeKey = (t) => parseSlots(t)[0] || String(t ?? "").trim();
const teamLabel = (t) => String(t?.name ?? t ?? "").split(" - ")[0];

// Group stage vs knockout. Stored games carry no phase; the generator's group
// games are "Qualification round" (cloud.js derives phase the same way).
// Blank / group-ish rounds count as group stage (the stricter side).
export function isKnockout(game) {
  if (game?.phase) return game.phase !== "group";
  const r = String(game?.round || "").trim();
  return !!r && !/qualif|group|gruppe|vorrunde|round.?robin/i.test(r);
}

// Explicitly given role (old SR / AS / LR codes are read too).
const hasRole = (o, role) => Array.isArray(o?.roles) && parseRoles(o.roles).includes(role);
// Explicit pools: does anyone in the registry carry this role?
const poolHas = (officials, role) => officials.some((o) => hasRole(o, role));

export function checkAssignments(games, officials, entries, opts = {}) {
  const cfg = { ...DEFAULT_RULES, ...opts };
  const byName = new Map();
  for (const o of officials || []) { const k = norm(officialName(o)); if (k && !byName.has(k)) byName.set(k, o); }
  const pools = { assistant: poolHas(officials || [], "assistant"), clerk: poolHas(officials || [], "clerk"), courtManager: poolHas(officials || [], "courtManager") };

  const cells = {};
  const list = [];
  const refsOf = new Map(games.map((g) => [g.id, g.refs || {}]));
  const add = (gameId, slot, level, code, msg, extra) => {
    const it = { gameId, slot, name: String(refsOf.get(gameId)?.[slot] ?? "").trim(), level, code, msg, ...extra };
    ((cells[gameId] ||= {})[slot] ||= []).push(it);
    list.push(it);
  };

  // Who works when: person key → [{ game, slot }]
  const work = new Map();
  // Rounds per day = distinct start times of all games that day.
  const roundsOf = new Map();
  for (const g of games) {
    const t = timeKey(g.time);
    if (!roundsOf.has(g.date)) roundsOf.set(g.date, new Set());
    roundsOf.get(g.date).add(t);
    for (const slot of SLOTS) {
      const k = norm(g.refs?.[slot]);
      if (!k) continue;
      if (!work.has(k)) work.set(k, []);
      work.get(k).push({ game: g, slot });
    }
  }
  const roundIdx = new Map([...roundsOf].map(([d, set]) => [d, new Map([...set].sort().map((t, i) => [t, i]))]));

  for (const g of games) {
    const refs = g.refs || {};
    const metaA = teamMeta(entries, g.teamA), metaB = teamMeta(entries, g.teamB);
    const ko = isKnockout(g);
    const t = timeKey(g.time);

    for (const slot of SLOTS) {
      const raw = String(refs[slot] ?? "").trim();
      if (!raw) {
        if (isRequiredSlot(g, slot, pools, cfg)) add(g.id, slot, "hard", "missing", `${SLOT_LABEL[slot]} is required`);
        continue;
      }
      const k = norm(raw);
      const o = byName.get(k);
      const isRef = slot === "r1" || slot === "r2";
      const isAssistant = slot === "a1" || slot === "a2";
      const isClerk = slot === "clerk" || slot === "clerk2";

      // 4. Double booking — twice in this game, or another game at the same start time.
      const twice = SLOTS.filter((s) => s !== slot && norm(refs[s]) === k);
      if (twice.length) add(g.id, slot, "hard", "double", `Also ${twice.map((s) => SLOT_LABEL[s]).join(", ")} in this game`);
      // A court manager may cover several courts at once: court manager in
      // parallel games is fine, any other role at the same time is not.
      const clash = (work.get(k) || []).filter((w) => w.game.id !== g.id && w.game.date === g.date && timeKey(w.game.time) === t
        && !(slot === "cm" && w.slot === "cm"));
      if (clash.length) add(g.id, slot, "hard", "double", `Also in game ${clash.map((w) => "#" + w.game.nr).join(", ")} at ${t}`);

      if (!o) continue; // not in the registry → nothing else to check

      // 5. Role not allowed (only when roles are set). In the final the
      // referees may work the lines; assistants who aren't referees get a warning.
      const finalLines = isAssistant && refsOnLines(g, cfg);
      if (finalLines && !hasRole(o, "referee")) add(g.id, slot, "soft", "finalLines", "Final: the referees work the lines");
      if (!canFill(o, slot) && !(finalLines && hasRole(o, "referee"))) add(g.id, slot, "hard", "role", `Not allowed as ${ROLE_LABEL[SLOT_ROLE[slot]].toLowerCase()} (roles: ${parseRoles(o.roles).map((x) => ROLE_LABEL[x]).join(", ")})`);

      // 3. Availability.
      const av = availabilityOn(o, g.date);
      if (av.status === "unavailable") add(g.id, slot, "hard", "unavailable", "Not available this day");
      else if (!availableAt(o, g.date, g.time, cfg.gameMinutes)) add(g.id, slot, "hard", "unavailable", `Only available ${windowLabel(av) || "at " + av.slots.join(", ")}`);
      else if (av.status === "reserve") add(g.id, slot, "soft", "reserve", "Reserve this day");

      // 1. Nation: hard for r1 always and r2 in group games; r2 in knockout
      // games is a warning (only if no neutral referee is available). In club
      // competitions the nation of a club only counts as a strong warning.
      // Scorers and line judges: nation doesn't matter — except a referee
      // working the lines for their own nation (warning).
      const nation = o.country && [metaA.country, metaB.country].find((c) => sameCountry(o.country, c));
      if (nation) {
        if (isRef && isClubGame(g)) add(g.id, slot, "soft", "nationClub", `Same nation as a club (${o.country})`);
        else if (slot === "r1" || (slot === "r2" && !ko)) add(g.id, slot, "hard", "nation", `Same nation as a team (${o.country})`);
        else if (slot === "r2") add(g.id, slot, "soft", "r2Nation", `Same nation as a team (${o.country}) — only if no neutral referee is available`);
        else if (isAssistant && hasRole(o, "referee")) add(g.id, slot, "soft", "refereeAsAssistantNation", `Referee as assistant for own nation (${o.country})`);
      }

      // 2. Club: members of a playing club never officiate that game —
      // referees, assistants and clerks (court managers aren't affected).
      const club = o.club && [metaA.club, metaB.club].find((c) => sameClub(o.club, c));
      if (club && (isRef || isAssistant || isClerk)) add(g.id, slot, "hard", "club", `Same club as a team (${o.club})`);

      // Rank: Referee 1 should have at least the game's rank (warning).
      if (slot === "r1") {
        const gap = rankLevel(gameRank(g)) - rankLevel(rankOf(o));
        if (gap > 0) add(g.id, slot, "soft", "rank", `${RANK_LABEL[rankOf(o)]} referee in a ${RANK_LABEL[gameRank(g)].toLowerCase()} game`, { gap });
      }
    }

    // 6. Women's finals: at least one of r1 / r2 female.
    if (isWomenFinal(g) && refs.r1 && refs.r2) {
      const sr = ["r1", "r2"].map((s) => byName.get(norm(refs[s])));
      if (!sr.some((o) => o?.gender === "f")) {
        const known = sr.every((o) => o?.gender === "m");
        for (const s of ["r1", "r2"]) {
          if (known) add(g.id, s, "hard", "gender", "Women's semifinal / final: at least one referee must be female");
          else add(g.id, s, "soft", "gender", "Women's semifinal / final: at least one referee must be female (gender not set)");
        }
      }
    }

    // 3.4 Assistant pair split: a1 and a2 should be the same pair, unless the partner
    // is unavailable that day (the pair dissolves for the day).
    const [l1, l2] = ["a1", "a2"].map((s) => byName.get(norm(refs[s])));
    for (const [s, me, other] of [["a1", l1, l2], ["a2", l2, l1]]) {
      if (!me?.assistantPair || other?.assistantPair === me.assistantPair) continue;
      const partner = (officials || []).find((p) => p !== me && p.assistantPair === me.assistantPair);
      if (partner && availabilityOn(partner, g.date).status !== "unavailable") {
        add(g.id, s, "soft", "pairSplit", `Assistant partner ${officialName(partner)} is not on the other line`);
      }
    }
  }

  // Per person and day: games in a row (not for clerk and court manager duty)
  // and maxPerDay (not for court manager duty).
  for (const [k, all] of work) {
    const o = byName.get(k);
    const ws = all.filter((w) => w.slot !== "cm");
    const byDay = new Map();
    for (const w of ws) { if (!byDay.has(w.game.date)) byDay.set(w.game.date, []); byDay.get(w.game.date).push(w); }
    for (const [date, dws] of byDay) {
      const idx = roundIdx.get(date);
      // One entry per round (a double booking is reported above).
      const roundsOf = (list) => { const m = new Map(); for (const w of list) { const i = idx.get(timeKey(w.game.time)); if (!m.has(i)) m.set(i, w); } return m; };
      const all = roundsOf(dws);
      const seen = roundsOf(dws.filter((w) => !NO_BREAK_SLOTS.has(w.slot)));
      const rounds = [...seen.keys()].sort((a, b) => a - b);
      let run = 0;
      rounds.forEach((r, j) => {
        run = j > 0 && r === rounds[j - 1] + 1 ? run + 1 : 1;
        const w = seen.get(r);
        if (run >= cfg.hardInRow) add(w.game.id, w.slot, "hard", "inRow", `${run} games in a row — needs a break (max ${cfg.hardInRow - 1})`);
        else if (run >= cfg.softInRow) add(w.game.id, w.slot, "soft", "inRow", `${run} games in a row — a break after every game is preferred`);
      });
      const dayRounds = [...all.keys()].sort((a, b) => a - b);
      if (o?.maxPerDay && dayRounds.length > o.maxPerDay) {
        dayRounds.slice(o.maxPerDay).forEach((r) => {
          const w = all.get(r);
          add(w.game.id, w.slot, "soft", "maxPerDay", `More than ${o.maxPerDay} games this day (${dayRounds.length})`);
        });
      }
    }
  }

  const counts = { hard: 0, soft: 0, missing: 0 };
  for (const it of list) {
    if (it.code === "missing") counts.missing++;
    else counts[it.level]++;
  }
  return { cells, list, counts };
}

// Worst level of a cell's issues: "hard" | "soft" | "".
export const cellLevel = (issues) => (issues?.some((i) => i.level === "hard") ? "hard" : issues?.length ? "soft" : "");
export const teamsLabel = (g) => `${teamLabel(g.teamA)} v ${teamLabel(g.teamB)}`;
