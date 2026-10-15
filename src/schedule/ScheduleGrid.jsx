import { useEffect, useMemo, useState } from "react";
import { subscribeGames, updateGameSlots, saveScheduleBlocks } from "../cloud.js";
import { normalizeSlots, dayGameMinutes } from "./scheduler.js";
import { useEvent } from "../eventContext.js";

const PALETTE = ["#6c5ce7", "#e84393", "#00b894", "#0984e3", "#e17055", "#00cec9", "#d63031", "#a29bfe", "#e1b12c", "#636e72"];
const toMin = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const short = (s) => (String(s || "").length > 16 ? String(s).slice(0, 15) + "…" : s);
const dayLabel = (d) => {
  const [dd, mm, yy] = String(d || "").split("/").map(Number);
  if (!dd) return d || "—";
  return new Date(2000 + (yy || 0), (mm || 1) - 1, dd).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

// Drag-and-drop grid to place each game on a day / court / time.
//  - Controlled/preview mode (pass `games` + `onChange`): edits the given games
//    in memory — used BEFORE publishing, inside the generate step.
//  - Standalone mode (no props): subscribes to published games and Saves changes
//    to Firestore — used by the Arrange page for post-publish tweaks.
export default function ScheduleGrid({ games: controlledGames, onChange }) {
  const controlled = typeof onChange === "function";
  const { event, archived } = useEvent();
  const [fetched, setFetched] = useState(controlled ? [] : null);
  const [local, setLocal] = useState({}); // nr -> { date, time, court } (standalone only)
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState("list"); // "list" (type day/time/court) | "grid" (drag)
  const [blocks, setBlocks] = useState(() => event?.scheduleBlocks || []);
  const [blocksDirty, setBlocksDirty] = useState(false);

  useEffect(() => { if (!controlled) return subscribeGames(setFetched); }, [controlled]);
  useEffect(() => { if (!blocksDirty) setBlocks(event?.scheduleBlocks || []); }, [event, blocksDirty]);

  const games = controlled ? (controlledGames || []) : fetched;

  const slots = useMemo(() => normalizeSlots(event?.slots || {}), [event]);
  const cats = useMemo(() => [...new Set((games || []).map((g) => g.category))], [games]);
  const catColor = (c) => PALETTE[Math.max(0, cats.indexOf(c)) % PALETTE.length];
  const eff = (g) => (controlled ? g : { ...g, ...(local[g.nr] || {}) });

  const courts = slots.courts.length ? slots.courts : [...new Set((games || []).map((g) => g.court).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const days = useMemo(() => {
    const set = [...new Set([...slots.days.map((d) => d.date), ...(games || []).map((g) => ({ ...g, ...(local[g.nr] || {}) }).date).filter(Boolean)])];
    const p = (s) => { const [d, m, y] = String(s).split("/").map(Number); return (y || 0) * 10000 + (m || 0) * 100 + (d || 0); };
    return set.sort((a, b) => p(a) - p(b));
  }, [slots, games, local]);

  const timesFor = (date) => {
    const day = slots.days.find((d) => d.date === date);
    const dur = dayGameMinutes(day, slots.gameMinutes);
    const step = dur + slots.breakMinutes;
    const set = new Set();
    if (day && step > 0) for (let t = toMin(day.start); t + dur <= toMin(day.end) + 1; t += step) set.add(toHHMM(t));
    (games || []).map(eff).filter((g) => g.date === date && g.time).forEach((g) => set.add(g.time));
    return [...set].sort((a, b) => toMin(a) - toMin(b));
  };
  const cardsAt = (date, court, time) => (games || []).map(eff).filter((g) => g.date === date && String(g.court) === String(court) && g.time === time);
  const unscheduled = (games || []).map(eff).filter((g) => !g.date || !g.time || !g.court);

  const applyMove = (nr, patch) => {
    if (controlled) onChange((controlledGames || []).map((g) => (String(g.nr) === String(nr) ? { ...g, ...patch } : g)));
    else setLocal((l) => ({ ...l, [nr]: { ...(l[nr] || {}), ...patch } }));
  };
  const drop = (date, court, time) => { if (drag != null) applyMove(drag, { date, court: String(court), time }); setDrag(null); setOver(""); };
  const dropUnscheduled = () => { if (drag != null) applyMove(drag, { date: "", court: "", time: "" }); setDrag(null); setOver(""); };

  const changed = Object.keys(local);
  const save = async () => {
    if (!changed.length) return;
    setStatus("Saving…");
    try {
      await updateGameSlots(changed.map((nr) => ({ nr: Number(nr), ...eff((games || []).find((g) => String(g.nr) === String(nr))) })));
      setLocal({});
      setStatus(`Saved ${changed.length} game${changed.length === 1 ? "" : "s"}.`);
    } catch (e) { setStatus("Save failed: " + (e?.message || e)); }
  };

  const addBlock = () => { setBlocksDirty(true); setBlocks((b) => [...b, { id: `b${Date.now()}${Math.floor(Math.random() * 1000)}`, label: "", date: days[0] || "", time: "", court: "" }]); };
  const editBlock = (id, patch) => { setBlocksDirty(true); setBlocks((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x))); };
  const delBlock = (id) => { setBlocksDirty(true); setBlocks((b) => b.filter((x) => x.id !== id)); };
  const saveBlocks = async () => {
    setStatus("Saving entries…");
    try { await saveScheduleBlocks(blocks); setBlocksDirty(false); setStatus(`Saved ${blocks.length} extra entr${blocks.length === 1 ? "y" : "ies"}.`); }
    catch (e) { setStatus("Save failed: " + (e?.message || e)); }
  };

  const card = (g) => (
    <div key={g.nr} className="ag-card" draggable={!archived} style={{ borderLeftColor: catColor(g.category) }}
      onDragStart={() => setDrag(g.nr)} onDragEnd={() => { setDrag(null); setOver(""); }}
      title={`#${g.nr} · ${g.category} · ${g.round}`}>
      <div className="ag-card-cat" style={{ color: catColor(g.category) }}>#{g.nr} · {g.category}</div>
      <div className="ag-card-teams">{short(g.teamA?.short || g.teamA?.name || g.teamA)} <span className="muted-sm">v</span> {short(g.teamB?.short || g.teamB?.name || g.teamB)}</div>
      <div className="ag-card-round muted-sm">{g.round}</div>
    </div>
  );

  // Advisory checks (court clashes, team double-booking, court fairness).
  const isPh = (n) => /\d/.test(String(n)) || /winner|loser|group/i.test(String(n));
  const teamsOf = (g) => [g.teamA?.name || g.teamA, g.teamB?.name || g.teamB];
  const warnings = useMemo(() => {
    const sched = (games || []).map(eff).filter((g) => g.date && g.time && g.court);
    const out = [];
    const cell = {};
    sched.forEach((g) => { const k = `${g.date}|${g.court}|${g.time}`; (cell[k] = cell[k] || []).push(g); });
    Object.entries(cell).forEach(([k, gs]) => { if (gs.length > 1) { const [d, c, t] = k.split("|"); out.push({ bad: true, msg: `Court clash — ${dayLabel(d)} ${t} · Court ${c}: ${gs.map((g) => "#" + g.nr).join(", ")}` }); } });
    // A team is unique WITHIN its category (Argentina Men ≠ Argentina Women),
    // so identity = category + name — otherwise same-named squads look clashy.
    const SEP = "";
    const ts = {};
    sched.forEach((g) => teamsOf(g).forEach((t) => { if (t && !isPh(t)) { const k = `${g.category}${SEP}${t}${SEP}${g.date}${SEP}${g.time}`; (ts[k] = ts[k] || []).push(g.nr); } }));
    Object.entries(ts).forEach(([k, ns]) => { if (ns.length > 1) { const [cat, t, d, tm] = k.split(SEP); out.push({ bad: true, msg: `${t} (${cat}) has ${ns.length} games at ${dayLabel(d)} ${tm}` }); } });
    if (courts.length > 1) {
      const tc = {};
      sched.forEach((g) => teamsOf(g).forEach((t) => { if (t && !isPh(t)) { const id = `${g.category}${SEP}${t}`; tc[id] = tc[id] || {}; tc[id][g.court] = (tc[id][g.court] || 0) + 1; } }));
      Object.entries(tc).forEach(([id, m]) => {
        const [cat, t] = id.split(SEP);
        const total = Object.values(m).reduce((a, b) => a + b, 0);
        const [topCourt, top] = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
        if (total >= 3 && Object.keys(m).length === 1) out.push({ bad: false, msg: `${t} (${cat}) plays all ${total} games on Court ${topCourt}` });
        else if (total >= 4 && top / total >= 0.75) out.push({ bad: false, msg: `${t} (${cat}) plays ${top}/${total} games on Court ${topCourt}` });
      });
    }
    return out;
  }, [games, local, courts]);

  if (games === null) return <div className="empty">Loading games…</div>;
  if (games.length === 0) return <div className="empty">No games yet — generate the schedule first.</div>;

  const byTimeCourt = (a, b) => (toMin(a.time) - toMin(b.time)) || String(a.court || "").localeCompare(String(b.court || ""), undefined, { numeric: true }) || (a.nr - b.nr);

  const listRow = (g) => (
    <div className="ag-lrow" key={g.nr} style={{ borderLeftColor: catColor(g.category) }}>
      <span className="ag-lcat" style={{ color: catColor(g.category) }}>#{g.nr}</span>
      <div className="ag-lmid">
        <div className="ag-lteams">{short(g.teamA?.short || g.teamA?.name || g.teamA)} <span className="muted-sm">v</span> {short(g.teamB?.short || g.teamB?.name || g.teamB)}</div>
        <div className="ag-lsub muted-sm">{g.category} · {g.round}</div>
      </div>
      <select className="ag-lday" value={g.date || ""} disabled={archived} onChange={(e) => applyMove(g.nr, { date: e.target.value })}>
        <option value="">— day —</option>
        {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
      </select>
      <input className="ag-ltime" value={g.time || ""} placeholder="hh:mm" disabled={archived} onChange={(e) => applyMove(g.nr, { time: e.target.value })} />
      <select className="ag-lcourt" value={g.court || ""} disabled={archived} onChange={(e) => applyMove(g.nr, { court: e.target.value })}>
        <option value="">— court —</option>
        {courts.map((c) => <option key={c} value={String(c)}>Court {c}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <div className="ag-bar">
        <div className="seg">
          <button className={`seg-btn ${view === "list" ? "on" : ""}`} onClick={() => setView("list")}>List</button>
          <button className={`seg-btn ${view === "grid" ? "on" : ""}`} onClick={() => setView("grid")}>Grid</button>
        </div>
        <span style={{ flex: 1 }} />
        {!controlled && (
          <>
            <span className="muted-sm">{changed.length ? `${changed.length} unsaved` : "No changes"}</span>
            {changed.length > 0 && <button className="btn sm" onClick={() => setLocal({})}>Reset</button>}
            <button className="btn primary sm" disabled={!changed.length || archived} onClick={save}>Save</button>
          </>
        )}
      </div>

      {courts.length === 0 && <div className="warn-box">No courts defined — set them in “Courts &amp; schedule”.</div>}

      {warnings.length > 0 && (
        <details className="ag-warns">
          <summary>{warnings.filter((w) => w.bad).length} conflict{warnings.filter((w) => w.bad).length === 1 ? "" : "s"} · {warnings.filter((w) => !w.bad).length} court-fairness note{warnings.filter((w) => !w.bad).length === 1 ? "" : "s"}</summary>
          <ul>{warnings.map((w, i) => <li key={i} className={w.bad ? "ag-w-bad" : "ag-w-note"}>{w.bad ? "⚠️" : "ℹ️"} {w.msg}</li>)}</ul>
        </details>
      )}

      {view === "list" && (
        <div className="ag-blocks">
          <div className="row-between" style={{ alignItems: "center" }}>
            <div className="subhead" style={{ margin: 0 }}>Ceremonies &amp; breaks ({blocks.length})</div>
            <div style={{ display: "flex", gap: 8 }}>
              {blocksDirty && <button className="btn primary sm" disabled={archived} onClick={saveBlocks}>Save entries</button>}
              <button className="btn sm" disabled={archived} onClick={addBlock}>+ Add entry</button>
            </div>
          </div>
          {blocks.map((b) => (
            <div className="ag-lrow" key={b.id} style={{ borderLeftColor: "#8a6d1c" }}>
              <input className="ag-lname" value={b.label || ""} placeholder="e.g. NT Awards ceremony" disabled={archived} onChange={(e) => editBlock(b.id, { label: e.target.value })} />
              <select className="ag-lday" value={b.date || ""} disabled={archived} onChange={(e) => editBlock(b.id, { date: e.target.value })}>
                <option value="">— day —</option>{days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
              </select>
              <input className="ag-ltime" value={b.time || ""} placeholder="hh:mm" disabled={archived} onChange={(e) => editBlock(b.id, { time: e.target.value })} />
              <select className="ag-lcourt" value={b.court || ""} disabled={archived} onChange={(e) => editBlock(b.id, { court: e.target.value })}>
                <option value="">— court —</option>{courts.map((c) => <option key={c} value={String(c)}>Court {c}</option>)}
              </select>
              <button className="btn danger sm" disabled={archived} onClick={() => delBlock(b.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {view === "list" ? (
        [...days, ""].map((date) => {
          const list = (date ? (games || []).map(eff).filter((g) => g.date === date) : unscheduled).sort(byTimeCourt);
          if (!date && !list.length) return null;
          return (
            <div className="ag-day" key={date || "uns"}>
              <div className="day-head" style={{ position: "static" }}>{date ? dayLabel(date) : `Unscheduled (${list.length})`}</div>
              {list.map(listRow)}
            </div>
          );
        })
      ) : (
        <>
          <div className={`ag-tray ${over === "unsched" ? "ag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver("unsched"); }} onDragLeave={() => setOver("")} onDrop={dropUnscheduled}>
            <div className="subhead" style={{ margin: 0 }}>Unscheduled ({unscheduled.length})</div>
            <div className="ag-tray-cards">{unscheduled.length ? unscheduled.map(card) : <span className="muted-sm">Drag a game here to unschedule it.</span>}</div>
          </div>
          {courts.length > 0 && days.map((date) => {
            const times = timesFor(date);
            return (
              <div className="ag-day" key={date}>
                <div className="day-head" style={{ position: "static" }}>{dayLabel(date)}</div>
                <div className="ag-grid-wrap">
                  <table className="ag-grid">
                    <thead>
                      <tr><th className="ag-th-time" /> {courts.map((c) => <th key={c} className="ag-th-court">Court {c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {times.map((time) => (
                        <tr key={time}>
                          <td className="ag-time">{time}</td>
                          {courts.map((c) => {
                            const here = cardsAt(date, c, time);
                            const key = `${date}|${c}|${time}`;
                            return (
                              <td key={c} className={`ag-cell ${here.length > 1 ? "ag-conflict" : ""} ${over === key ? "ag-over" : ""}`}
                                onDragOver={(e) => { e.preventDefault(); setOver(key); }} onDragLeave={() => setOver("")} onDrop={() => drop(date, c, time)}>
                                {here.map(card)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
      {status && <p className="muted-sm">{status}</p>}
    </>
  );
}
