import { useState } from "react";
import { normalizeSlots, slotsPerDay, DAY_PHASES } from "./scheduler.js";

const toISO = (s) => { const [d, m, y] = String(s).split("/"); return d ? `20${y}-${m}-${d}` : ""; };
const fromISO = (iso) => { const [y, m, d] = String(iso).split("-"); return d ? `${d}/${m}/${y.slice(2)}` : ""; };
const wd = (date) => { const [d, m, y] = date.split("/"); const dt = new Date(2000 + +y, m - 1, +d); return dt.toLocaleDateString("en-US", { weekday: "short" }); };

// Courts + per-day windows + game/break minutes. value/onChange use the rich
// slots shape; legacy values are migrated on read.
export default function SlotsEditor({ value, onChange, disabled }) {
  const s = normalizeSlots(value);
  const set = (patch) => onChange({ ...s, ...patch });
  const [court, setCourt] = useState("");
  const [newDay, setNewDay] = useState("");

  const addCourt = () => { const v = court.trim(); if (v && !s.courts.includes(v)) set({ courts: [...s.courts, v] }); setCourt(""); };
  const addDay = (iso) => { const date = fromISO(iso); if (date && !s.days.some((d) => d.date === date)) set({ days: [...s.days, { date, start: "09:00", end: "18:00" }].sort((a, b) => toISO(a.date).localeCompare(toISO(b.date))) }); };
  const setDay = (i, patch) => set({ days: s.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  // Per-day game duration; empty = use the default below.
  const setDayMinutes = (i, v) => set({ days: s.days.map((d, j) => {
    if (j !== i) return d;
    const { gameMinutes: _, ...rest } = d;
    return Number(v) > 0 ? { ...rest, gameMinutes: Number(v) } : rest;
  }) });
  const togglePhase = (i, p) => set({ days: s.days.map((d, j) => {
    if (j !== i) return d;
    const cur = d.phases || [];
    const { phases: _, ...rest } = d;
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    return next.length ? { ...rest, phases: next } : rest;
  }) });
  const removeDay = (i) => set({ days: s.days.filter((_, j) => j !== i) });

  const perDay = (d) => slotsPerDay(d, s.gameMinutes, s.breakMinutes) * s.courts.length;

  return (
    <div>
      <div className="subhead">Courts</div>
      <div className="chips">
        {s.courts.map((c, i) => (
          <span className="court-chip" key={i}>
            <input className="court-input" value={c} disabled={disabled} size={Math.max(4, c.length)} aria-label="Court name"
              onChange={(e) => set({ courts: s.courts.map((x, j) => (j === i ? e.target.value : x)) })} />
            {!disabled && <button onClick={() => set({ courts: s.courts.filter((_, j) => j !== i) })}>✕</button>}
          </span>
        ))}
        {!s.courts.length && <span className="muted-sm">No courts yet</span>}
      </div>
      {!disabled && (
        <div className="add-row" style={{ marginTop: 8 }}>
          <input value={court} onChange={(e) => setCourt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCourt()} placeholder="Court name/number" />
          <button className="btn sm" onClick={addCourt}>Add</button>
        </div>
      )}

      <div className="subhead" style={{ marginTop: 16 }}>Days &amp; times</div>
      {s.days.map((d, i) => (
        <div className="slot-day" key={i}>
          <span className="slot-date">{wd(d.date)} {d.date}</span>
          <label className="slot-time">start <input type="time" disabled={disabled} value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} /></label>
          <label className="slot-time">end <input type="time" disabled={disabled} value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} /></label>
          <label className="slot-time">game <input type="number" className="slot-min" min="10" step="5" disabled={disabled} value={d.gameMinutes || ""} placeholder={String(s.gameMinutes)}
            onChange={(e) => setDayMinutes(i, e.target.value)} aria-label={`Game duration on ${d.date} (minutes)`} /> min</label>
          <span className="slot-cap">~{perDay(d)} games</span>
          {!disabled && <button className="btn danger sm" onClick={() => removeDay(i)}>✕</button>}
          <div className="slot-phases" role="group" aria-label={`Phases on ${d.date}`}>
            {DAY_PHASES.map(([k, label]) => (
              <button key={k} type="button" disabled={disabled} className={`filter-pill ${(d.phases || []).includes(k) ? "active" : ""}`} onClick={() => togglePhase(i, k)}>{label}</button>
            ))}
            {!(d.phases || []).length && <span className="muted-sm">any phase</span>}
          </div>
        </div>
      ))}
      {!s.days.length && <p className="muted-sm">No days yet — add one below.</p>}
      {!disabled && (
        <div className="add-row" style={{ marginTop: 8 }}>
          <input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} />
          <button className="btn sm" disabled={!newDay} onClick={() => { addDay(newDay); setNewDay(""); }}>Add day</button>
        </div>
      )}

      <div className="grid2" style={{ marginTop: 16 }}>
        <label className="field"><span>Default game duration (min)</span>
          <input type="number" min="10" step="5" disabled={disabled} value={s.gameMinutes} onChange={(e) => set({ gameMinutes: Number(e.target.value) })} /></label>
        <label className="field"><span>Break between games (min)</span>
          <input type="number" min="0" step="5" disabled={disabled} value={s.breakMinutes} onChange={(e) => set({ breakMinutes: Number(e.target.value) })} /></label>
      </div>
      <p className="muted-sm">Tick the phases a day is for (e.g. groups on the first days, semifinals and finals on the last) — the generator only places those games there; no phase ticked = any game. Each day can have its own game duration (e.g. a finals day with best of 5); leave it empty to use the default. Max games/day = the day’s window ÷ (duration + break) × courts.</p>
    </div>
  );
}
