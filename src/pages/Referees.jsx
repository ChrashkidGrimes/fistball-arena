import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeGames, subscribeReferees, saveGameRefs } from "../cloud.js";
import { useEvent } from "../eventContext.js";
import { flagFor } from "../flags.js";
import { teamMeta } from "../officials/model.js";
import OfficialsCard from "./OfficialsCard.jsx";

const ROLES = [["r1", "Referee 1"], ["r2", "Referee 2"], ["clerk", "Clerk"], ["a1", "Assistant 1"], ["a2", "Assistant 2"]];
const parseDate = (s) => { const [d, m, y] = String(s).split("/").map(Number); return new Date(2000 + (y || 0), (m || 1) - 1, d || 1); };
const dayLabel = (s) => { const dt = parseDate(s); return `${dt.toLocaleDateString("en-US", { weekday: "short" })} ${dt.getDate()} ${dt.toLocaleDateString("en-US", { month: "short" })}`; };
const refName = (r) => [r.first, r.name].filter(Boolean).join(" ").trim();
const shortTeam = (t) => String(t?.name || t || "").split(" - ")[0];

// Assign the officiating team to each game, up front, from the event's referee
// registry. Saved on the game and pre-fills its report. Admin only.
export default function Referees() {
  const nav = useNavigate();
  const { eventId, event, isAdmin, archived } = useEvent();
  const [games, setGames] = useState([]);
  const [refs, setRefs] = useState([]);
  const [day, setDay] = useState("all");
  const [q, setQ] = useState("");
  const [local, setLocal] = useState({});   // gameId -> {r1,..} optimistic overlay
  const [saved, setSaved] = useState({});    // gameId -> ts (flash "saved")
  const timers = useRef({});

  useEffect(() => subscribeGames(setGames), []);
  useEffect(() => subscribeReferees(setRefs), []);

  const names = useMemo(() => [...new Set(refs.map(refName).filter(Boolean))].sort(), [refs]);
  const teamNations = useMemo(() => [...new Set((event?.entries || []).map((e) => teamMeta(event.entries, e.name).country).filter(Boolean))].sort(), [event]);
  const days = useMemo(() => [...new Set(games.map((g) => g.date))].sort((a, b) => parseDate(a) - parseDate(b)), [games]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return games
      .filter((g) => day === "all" || g.date === day)
      .filter((g) => !t || String(g.nr).includes(t) || (g.teamA?.name || "").toLowerCase().includes(t) || (g.teamB?.name || "").toLowerCase().includes(t))
      .sort((a, b) => parseDate(a.date) - parseDate(b.date) || String(a.time).localeCompare(b.time) || a.nr - b.nr);
  }, [games, day, q]);

  if (!isAdmin) return <div className="empty">Admins only.</div>;

  const valOf = (g, k) => (local[g.id]?.[k] ?? g.refs?.[k] ?? "");
  const setVal = (g, k, v) => {
    const next = { ...(local[g.id] || { ...(g.refs || {}) }), [k]: v };
    setLocal((p) => ({ ...p, [g.id]: next }));
    clearTimeout(timers.current[g.id]);
    timers.current[g.id] = setTimeout(async () => {
      try { await saveGameRefs(g.id, next); setSaved((s) => ({ ...s, [g.id]: Date.now() })); setTimeout(() => setSaved((s) => { const n = { ...s }; delete n[g.id]; return n; }), 1500); }
      catch (e) { alert("Could not save referees for #" + g.nr + ": " + (e?.code || e?.message || e)); }
    }, 500);
  };

  return (
    <>
      <h2 className="page-h">Referees</h2>
      <p className="muted-sm" style={{ marginTop: -8 }}>Assign the officiating team per game. Names come from the event's referee registry (import via Players &amp; staff) — or type a new one. Saved automatically; the game report is pre-filled with these.</p>
      {archived && <div className="warn-box">This event is archived — read-only.</div>}

      <OfficialsCard refs={refs} days={days} dayLabel={dayLabel} teamNations={teamNations} archived={archived} />

      <div className="filter-bar" style={{ padding: "8px 0" }}>
        <span className="filter-label">Day</span>
        <button className={`filter-pill ${day === "all" ? "active" : ""}`} onClick={() => setDay("all")}>All</button>
        {days.map((d) => <button key={d} className={`filter-pill ${day === d ? "active" : ""}`} onClick={() => setDay(d)}>{dayLabel(d)}</button>)}
      </div>
      <input className="game-search" style={{ maxWidth: 360, marginBottom: 10 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search game # or team…" />

      <datalist id="ref-names">{names.map((n) => <option key={n} value={n} />)}</datalist>

      <div className="grid-scroll">
        <table className="ref-grid">
          <thead>
            <tr>
              <th className="rg-game">Game</th>
              {ROLES.map(([k, label]) => <th key={k}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td className="muted-sm" colSpan={6}>No games.</td></tr>}
            {shown.map((g) => (
              <tr key={g.id} className={saved[g.id] ? "rg-saved" : ""}>
                <td className="rg-game" onClick={() => nav(`/e/${eventId}/game/${g.id}`)} title="Open game report">
                  <div className="rg-nr">#{g.nr} <span className="muted-sm">{g.time} · Court {g.court}</span></div>
                  <div className="rg-teams"><span className="flag">{flagFor(g.teamA?.name)}</span>{shortTeam(g.teamA)} <span className="muted-sm">v</span> <span className="flag">{flagFor(g.teamB?.name)}</span>{shortTeam(g.teamB)}</div>
                  <div className="muted-sm">{dayLabel(g.date)} · {g.category}</div>
                </td>
                {ROLES.map(([k]) => (
                  <td key={k} className="ag-cell">
                    <input className="ref-input" list="ref-names" value={valOf(g, k)} disabled={archived}
                      onChange={(e) => setVal(g, k, e.target.value)} placeholder="—" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
