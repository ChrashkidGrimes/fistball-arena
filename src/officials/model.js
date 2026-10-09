// Officials data model helpers — pure (no React, no Firebase), see
// docs/referee-assignment-spec.md §2. Shared by the import, the Officials card
// and (later) the rules engine / auto-assign.

import { flagFor } from "../flags.js";

// Official roles: SR = referee (r1/r2), AS = scorer (clerk), LR = line judge (a1/a2).
export const OFFICIAL_ROLES = ["SR", "AS", "LR"];
export const SLOT_ROLE = { r1: "SR", r2: "SR", clerk: "AS", a1: "LR", a2: "LR" };
export const AVAIL_STATUS = ["available", "reserve", "unavailable"];

const norm = (s) => String(s ?? "").trim().toLowerCase();

// "SR, LR" / "Referee; Line judge" / "Schiedsrichter/Anschreiber" → ["SR","LR",…]
// (canonical order). Unknown words are ignored.
const ROLE_WORDS = [
  ["SR", /^(sr|r|ref|referee|schiedsrichter|árbitro|arbitro|umpire)$/],
  ["AS", /^(as|clerk|scorer|scorekeeper|anschreiber|apontador|secretary)$/],
  ["LR", /^(lr|a|assistant|line ?judge|lines(man|woman|person)|linienrichter|juiz de linha)$/],
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

// Roles a person may fill. Older docs have no `roles` → may fill any slot.
export const rolesOf = (o) => (Array.isArray(o?.roles) && o.roles.length ? o.roles : OFFICIAL_ROLES);
export const canFill = (o, slot) => rolesOf(o).includes(SLOT_ROLE[slot]);

// Availability on a game date ("dd/mm/yy"). Missing date = available, any time.
export function availabilityOn(o, date) {
  const a = o?.availability?.[date];
  const status = AVAIL_STATUS.includes(a?.status) ? a.status : "available";
  return { status, slots: Array.isArray(a?.slots) ? a.slots : [] };
}
// Is the person usable for a game starting at `time` on `date`? ("reserve" counts as usable.)
export function availableAt(o, date, time) {
  const { status, slots } = availabilityOn(o, date);
  if (status === "unavailable") return false;
  if (!slots.length) return true;
  const t = parseSlots(time)[0] || String(time).trim(); // imported sheets may say "9:00"
  return parseSlots(slots.join(" ")).includes(t);
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
