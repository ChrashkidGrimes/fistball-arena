// Automatic slot allocation.
// Assigns each fixture a (date, time, court) over a grid of days × slots × courts.
// Each day has its own start/end window; a slot = game duration + break.
// Hard constraint: no real team plays two matches in the same time slot.
// Soft constraint: avoid a team playing back-to-back consecutive slots (rest).
// Group stage is placed before knockout; knockout respects dependency order.

const KO_RANK = { qf: 0, sf: 1, bronze: 2, final: 3 };

function isPlaceholder(name) { return /\d/.test(name) || /(winner|loser)/i.test(name); }
function realTeamKeys(f) {
  const keys = [];
  for (const name of [f.teamA, f.teamB]) if (!isPlaceholder(name)) keys.push(`${f.category}|${name}`);
  return keys;
}
function toMinutes(hhmm) { const [h, m] = String(hhmm).split(":").map(Number); return (h || 0) * 60 + (m || 0); }
function toHHMM(mins) { const h = Math.floor(mins / 60), m = mins % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
const addMin = (hhmm, mins) => toHHMM(toMinutes(hhmm) + mins);

// Accepts the rich shape { courts, days:[{date,start,end}], gameMinutes, breakMinutes }
// and migrates the legacy shape { courts, days:[str], startTime, slotMinutes, slotsPerDay }.
export function normalizeSlots(s) {
  s = s || {};
  const gameMinutes = Number(s.gameMinutes || s.slotMinutes || 45);
  const breakMinutes = Number(s.breakMinutes || 0);
  let days = s.days || [];
  if (days.length && typeof days[0] === "string") {
    const start = s.startTime || "09:00";
    const end = addMin(start, (Number(s.slotsPerDay) || 8) * (gameMinutes + breakMinutes));
    days = days.map((date) => ({ date, start, end }));
  }
  return {
    courts: (s.courts || []).map(String),
    // A day may override the game duration (e.g. finals day, all best of 5).
    days: days.map((d) => ({ date: d.date, start: d.start || "09:00", end: d.end || "18:00", ...(Number(d.gameMinutes) > 0 ? { gameMinutes: Number(d.gameMinutes) } : {}) })),
    gameMinutes, breakMinutes,
  };
}

// Game duration on a given day: its own override, else the event default.
export const dayGameMinutes = (day, gameMinutes) => Number(day?.gameMinutes) || Number(gameMinutes) || 45;

// Slots that fit in one day for one court (given the window and slot step).
export function slotsPerDay(day, gameMinutes, breakMinutes) {
  const step = Math.max(5, dayGameMinutes(day, gameMinutes) + Number(breakMinutes || 0));
  return Math.max(0, Math.floor((toMinutes(day.end) - toMinutes(day.start)) / step));
}

function orderFixtures(fixtures) {
  const group = fixtures.filter((f) => f.phase === "group");
  const ko = fixtures.filter((f) => f.phase === "ko");
  group.sort((a, b) => (a.groupRoundIndex - b.groupRoundIndex) || (a.seq - b.seq));
  ko.sort((a, b) => ((KO_RANK[a.koStage] ?? 9) - (KO_RANK[b.koStage] ?? 9)) ||
    String(a.category).localeCompare(b.category) || (a.koIndex - b.koIndex));
  return [...group, ...ko];
}

export function allocate(fixtures, slotConfig) {
  const cfg = normalizeSlots(slotConfig);
  const { courts, days, gameMinutes, breakMinutes } = cfg;
  const warnings = [];

  // Enumerate cells: each day's window → slots × courts. `global` keeps a big
  // per-day offset so slots in different days are never "adjacent" (rest check).
  const cells = [];
  let capacity = 0;
  days.forEach((day, d) => {
    const s0 = toMinutes(day.start);
    const step = Math.max(5, dayGameMinutes(day, gameMinutes) + breakMinutes);
    const n = slotsPerDay(day, gameMinutes, breakMinutes);
    capacity += n * courts.length;
    for (let s = 0; s < n; s++) for (let c = 0; c < courts.length; c++) {
      cells.push({ d, s, c, global: d * 1000 + s, timeMin: s0 + s * step });
    }
  });

  if (!courts.length) warnings.push("No courts defined.");
  if (!days.length) warnings.push("No days defined.");
  if (fixtures.length > capacity) {
    warnings.push(`Not enough room: ${fixtures.length} matches for ${capacity} court-slots. Widen the day windows, shorten the game/break, or add a court.`);
  }

  const cellUsed = new Set();
  const busy = new Map();
  const played = new Map();
  const placedAt = new Map();
  const placed = [];
  const unplaced = [];
  let lastGroupGlobal = -1;
  let restViolations = 0;
  const busyAt = (g) => busy.get(g) || busy.set(g, new Set()).get(g);
  const playedOf = (k) => played.get(k) || played.set(k, new Set()).get(k);

  function findCell(keys, floor, requireRest) {
    for (const cell of cells) {
      if (cell.global < floor) continue;
      const ck = `${cell.global}|${cell.c}`;
      if (cellUsed.has(ck)) continue;
      const slotTeams = busy.get(cell.global);
      let ok = true;
      for (const k of keys) {
        if (slotTeams && slotTeams.has(k)) { ok = false; break; }
        if (requireRest) { const ps = played.get(k); if (ps && (ps.has(cell.global - 1) || ps.has(cell.global + 1))) { ok = false; break; } }
      }
      if (ok) return cell;
    }
    return null;
  }

  for (const f of orderFixtures(fixtures)) {
    const keys = realTeamKeys(f);
    let floor = 0;
    for (const dep of f.deps || []) if (placedAt.has(dep)) floor = Math.max(floor, placedAt.get(dep) + 1);
    if (f.phase === "ko") floor = Math.max(floor, lastGroupGlobal + 1);

    let cell = findCell(keys, floor, true);
    if (!cell) { cell = findCell(keys, floor, false); if (cell) restViolations++; }
    if (!cell) { unplaced.push(f); continue; }

    cellUsed.add(`${cell.global}|${cell.c}`);
    for (const k of keys) { busyAt(cell.global).add(k); playedOf(k).add(cell.global); }
    placedAt.set(f.id, cell.global);
    if (f.phase === "group") lastGroupGlobal = Math.max(lastGroupGlobal, cell.global);

    placed.push({
      fixture: f, date: days[cell.d].date, time: toHHMM(cell.timeMin),
      court: String(courts[cell.c]), global: cell.global, courtIndex: cell.c,
    });
  }

  if (restViolations > 0) warnings.push(`${restViolations} match(es) had to be scheduled back-to-back for a team. Add slots or a court for more rest.`);
  if (unplaced.length > 0) warnings.push(`${unplaced.length} match(es) could not be placed under the constraints. Add slots or a court.`);

  placed.sort((a, b) => (a.global - b.global) || (a.courtIndex - b.courtIndex));
  return { placed, unplaced, warnings };
}
