// Officials data model helpers — pure (no React, no Firebase), see
// docs/referee-assignment-spec.md §2. Shared by the import, the Officials card
// and (later) the rules engine / auto-assign.

import { flagFor } from "../flags.js";

// Official roles: referee (Referee 1/2), clerk (scorer), assistant (line judge,
// Assistant 1/2), court manager (slot "cm"; may cover several courts at once).
export const OFFICIAL_ROLES = ["referee", "clerk", "assistant", "courtManager"];
export const SLOT_ROLE = { r1: "referee", r2: "referee", clerk: "clerk", clerk2: "clerk", a1: "assistant", a2: "assistant", cm: "courtManager" };
// Display names.
export const ROLE_LABEL = { referee: "Referee", clerk: "Clerk", assistant: "Assistant", courtManager: "Court manager" };
export const AVAIL_STATUS = ["available", "reserve", "unavailable"];

const norm = (s) => String(s ?? "").trim().toLowerCase();

// "Referee; Line judge" / "Schiedsrichter/Anschreiber" / the old codes "SR, LR"
// → ["referee","assistant",…] (canonical order). Unknown words are ignored.
const ROLE_WORDS = [
  ["referee", /^(sr|r|ref|referee|schiedsrichter|árbitro|arbitro|umpire)$/],
  ["clerk", /^(as|clerk|scorer|scorekeeper|anschreiber|apontador|secretary)$/],
  ["assistant", /^(lr|a|assistant|line ?judge|lines(man|woman|person)|linienrichter|juiz de linha)$/],
  ["courtManager", /^(cm|court ?manager|courtmanager|platzwart|platzverantwortlicher?|court ?director|gerente de quadra|delegado de cancha)$/],
];
export function parseRoles(v) {
  const words = (Array.isArray(v) ? v : String(v ?? "").split(/[,;/|+]+/)).map(norm).filter(Boolean);
  const out = new Set();
  for (const w of words) for (const [code, re] of ROLE_WORDS) if (re.test(w)) out.add(code);
  return OFFICIAL_ROLES.filter((r) => out.has(r));
}

// "F" / "female" / "w" / "Damen" → "f"; "M" / "male" / "Herren" → "m"; else "".
export function parseGender(v) {
  const s = norm(v).replace(/[^a-zà-ú]/g, "");
  if (!s) return "";
  if (/^(f|w|female|woman|women|weiblich|frau|frauen|damen|feminin[oa]?|mulher)$/.test(s)) return "f";
  if (/^(m|h|male|man|men|männlich|mannlich|mann|männer|manner|herren|masculin[oa]?|homem)$/.test(s)) return "m";
  return "";
}

// Roles a person may fill. Docs without `roles` may fill any slot; roles saved
// with the old codes (SR / AS / LR) are read as their new names.
export const rolesOf = (o) => {
  const r = Array.isArray(o?.roles) ? parseRoles(o.roles) : [];
  return r.length ? r : OFFICIAL_ROLES;
};
export const canFill = (o, slot) => rolesOf(o).includes(SLOT_ROLE[slot]);

// Availability on a game date ("dd/mm/yy"). Missing date = available all day.
// Optional time window per day: from / to ("HH:MM"). `slots` (a list of
// allowed start times) is the older form and is still honoured.
export function availabilityOn(o, date) {
  const a = o?.availability?.[date];
  const status = AVAIL_STATUS.includes(a?.status) ? a.status : "available";
  return {
    status, from: parseSlots(a?.from)[0] || "", to: parseSlots(a?.to)[0] || "",
    slots: Array.isArray(a?.slots) ? a.slots : [],
  };
}
const minutesOf = (t) => { const [h, m] = (parseSlots(t)[0] || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
// Is the person usable for a game starting at `time` on `date` that lasts
// `minutes`? The whole game has to fit into the day's window. ("reserve" counts as usable.)
export function availableAt(o, date, time, minutes = 0) {
  const { status, from, to, slots } = availabilityOn(o, date);
  if (status === "unavailable") return false;
  const start = minutesOf(time);
  if (start !== null && from && start < minutesOf(from)) return false;
  if (start !== null && to && start + (Number(minutes) || 0) > minutesOf(to)) return false;
  if (!slots.length) return true;
  const t = parseSlots(time)[0] || String(time).trim(); // imported sheets may say "9:00"
  return parseSlots(slots.join(" ")).includes(t);
}
// "from 12:00", "until 15:00", "12:00–15:00" or "" (all day).
export function windowLabel({ from, to } = {}) {
  if (from && to) return `${from}–${to}`;
  if (from) return `from ${from}`;
  if (to) return `until ${to}`;
  return "";
}

// "10:30, 11:45 / 9:00" → ["09:00","10:30","11:45"] (sorted, de-duplicated, HH:MM).
export function parseSlots(v) {
  const out = new Set();
  for (const m of String(v ?? "").matchAll(/(\d{1,2})[:.h](\d{2})/g)) out.add(`${m[1].padStart(2, "0")}:${m[2]}`);
  return [...out].sort();
}

// Team metadata for conflict checks (spec §2.2): explicit entry.country / .club
// first, otherwise the team name itself (IFA events: team name = nation;
// "Germany - WEC" → "Germany"). `entries` is event.entries.
export function teamMeta(entries, team) {
  const name = String(team?.name ?? team ?? "").trim();
  const base = name.split(" - ")[0].trim();
  const e = (entries || []).find((x) => norm(x.name) === norm(name)) || (entries || []).find((x) => norm(x.name) === norm(base));
  return {
    country: String(e?.country || "").trim() || base,
    club: String(e?.club || "").trim() || base,
  };
}

// Same nation? Case-insensitive, and "Brasil" == "Brazil" via the shared flag table.
export function sameCountry(a, b) {
  if (!norm(a) || !norm(b)) return false;
  if (norm(a) === norm(b)) return true;
  const fa = flagFor(a);
  return !!fa && fa === flagFor(b);
}
export const sameClub = (a, b) => !!norm(a) && norm(a) === norm(b);

// Category names end in "Women"/"Men" (see categories.js); imported sheets may
// use other words.
export const isWomensGame = (game) => /\b(women|female|ladies|damen|frauen|femin\w*)\b/i.test(String(game?.category || ""));

// Rounds where the women's finals gender rule applies (spec §3.1.6): semifinals,
// bronze / 3rd place and the final. Generator strings (schedule/format.js,
// bracket.js): "Semifinal", "Semifinal 1/2", "Bronze medal match",
// "Placement 3-5", "Gold medal match". Imported sheets may say "Final",
// "Halbfinale", "Spiel um Platz 3". Quarterfinals and other placements don't count.
export function isFinalsRound(round) {
  const r = String(round || "").toLowerCase();
  if (/quarter|viertel/.test(r)) return false;
  return /semi|halbfinal|bronze|gold|\bfinals?\b|\bfinale\b|placement 3\b|3rd|platz 3|third/.test(r);
}
export const isWomenFinal = (game) => isWomensGame(game) && isFinalsRound(game?.round);

// Ranks of referees and games: top > good > normal (missing = normal).
// Auto-assign tries to give a game a Referee 1 of at least the game's rank.
export const RANKS = ["top", "good", "normal"];
export const RANK_LABEL = { top: "Top", good: "Good", normal: "Normal" };
const RANK_LEVEL = { top: 2, good: 1, normal: 0 };
export const rankLevel = (rank) => RANK_LEVEL[rank] ?? 0;
export const rankOf = (o) => (RANKS.includes(o?.rank) ? o.rank : "normal");
// "Top" / "A" / "1" → "top", "Good" / "gut" / "B" / "2" → "good", "Normal" / "C" / "3" → "normal".
export function parseRank(v) {
  const s = norm(v);
  if (/^(top|a|1|elite)$/.test(s)) return "top";
  if (/^(good|gut|bom|bueno|b|2)$/.test(s)) return "good";
  if (/^(normal|standard|c|3)$/.test(s)) return "normal";
  return "";
}
// A game's rank: set by hand, otherwise semifinals, bronze / 3rd place and the
// final are top and every other game is normal.
export const defaultGameRank = (game) => (isFinalsRound(game?.round) ? "top" : "normal");
export const gameRank = (game) => (RANKS.includes(game?.rank) ? game.rank : defaultGameRank(game));

// The gold medal game / final (not the semifinals, bronze or placement games).
export function isGoldFinal(round) {
  const r = String(round || "").toLowerCase();
  if (/semi|halbfinal|quarter|viertel|bronze|3rd|third|platz|placement|1\/2|1\/4/.test(r)) return false;
  return /gold|\bfinals?\b|\bfinale\b|endspiel/.test(r);
}
// Club competition? (category names from the builder say "Clubs …").
export const isClubGame = (game) => /\b(clubs?|vereine?)\b/i.test(String(game?.category || ""));

// Event settings for the assignment (event.officialsRules), with defaults:
// - r2: "always" — Referee 2 in every game; "finals" — only semifinals,
//   bronze / 3rd place and the final (elsewhere optional, by hand).
// - clerk2Courts: courts with a second clerk (slot "clerk2").
// - finalRefsOnLines: in the final, the referees work the lines.
// - gameMinutes / dayMinutes: game length for the availability windows —
//   the event's default and the days that set their own (Settings → Courts &
//   schedule), see minutesOn().
export function officialsSettings(event) {
  const r = event?.officialsRules || {};
  return {
    r2: r.r2 === "finals" ? "finals" : "always",
    clerk2Courts: Array.isArray(r.clerk2Courts) ? r.clerk2Courts.map(String) : [],
    finalRefsOnLines: r.finalRefsOnLines !== false,
    // Knockout Referee 2 from a playing nation: "lastResort" = only if no
    // neutral referee fits; "lenient" = about as bad as a missing break
    // (as in the Reiden tool, helps balance the load).
    r2NationKo: r.r2NationKo === "lenient" ? "lenient" : "lastResort",
    gameMinutes: Number(event?.slots?.gameMinutes) || 45,
    dayMinutes: Object.fromEntries((event?.slots?.days || []).filter((d) => Number(d?.gameMinutes) > 0).map((d) => [d.date, Number(d.gameMinutes)])),
  };
}
// Game length on a date (a day's own duration, else the event default).
export const minutesOn = (settings, date) => settings?.dayMinutes?.[date] || settings?.gameMinutes || 45;
