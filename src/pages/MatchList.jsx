import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { pdf } from "@react-pdf/renderer";
import { subscribeGames, subscribeReports, subscribeTeamKits, adminUnlock, runAdvancementAll } from "../cloud.js";
import { resolveKit, teamKitsFor } from "../kits.js";
import { KitSwatch } from "../KitSwatch.jsx";
import { flagFor } from "../flags.js";
import { useEvent } from "../eventContext.js";
import SchedulePDF from "../pdf/SchedulePDF.jsx";

function parseDate(s) {
  const [d, m, y] = String(s).split("/").map(Number);
  return new Date(2000 + (y || 0), (m || 1) - 1, d || 1);
}
function dayLabel(s) {
  const dt = parseDate(s);
  const wd = dt.toLocaleDateString("en-US", { weekday: "short" });
  const mo = dt.toLocaleDateString("en-US", { month: "short" });
  return `${wd} ${dt.getDate()} ${mo}`;
}

export default function MatchList({ me }) {
  const nav = useNavigate();
  const { eventId, event, isAdmin, archived } = useEvent();
  const base = `/e/${eventId}`;
  const [games, setGames] = useState([]);
  const [reports, setReports] = useState({});
  const [court, setCourt] = useState(() => localStorage.getItem("fb_court") || "all");
  const [day, setDay] = useState(() => localStorage.getItem("fb_day") || "all");
  const [q, setQ] = useState("");
  const [teamKits, setTeamKits] = useState({});
  useEffect(() => subscribeTeamKits(setTeamKits), [eventId]);

  // Short names come from the game (if published with one) or the event's team
  // entries (so setting a short name reflects even on already-published games).
  const shortOf = useMemo(() => {
    const m = {};
    (event?.entries || []).forEach((e) => { if (e?.short && e.short.trim()) m[e.name] = e.short.trim(); });
    return m;
  }, [event]);
  const teamLabel = (t) => String((t?.short || shortOf[t?.name] || t?.name || "")).split(" - ")[0];

  useEffect(() => {
    const u1 = subscribeGames(setGames);
    const u2 = subscribeReports(setReports);
    return () => { u1(); u2(); };
  }, []);

  const courts = useMemo(
    () => [...new Set(games.map((m) => m.court))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
    [games]
  );
  const days = useMemo(
    () => [...new Set(games.map((m) => m.date))].sort((a, b) => parseDate(a) - parseDate(b)),
    [games]
  );

  const nq = q.trim().toLowerCase();
  const num = nq.replace(/^#/, ""); // allow "#6" as well as "6"
  const matchesQuery = (m) => {
    if (!nq) return true;
    return (num && String(m.nr).includes(num))
      || (m.teamA?.name || "").toLowerCase().includes(nq)
      || (m.teamB?.name || "").toLowerCase().includes(nq)
      || (m.category || "").toLowerCase().includes(nq);
  };
  const shown = games
    .filter((m) => (court === "all" || String(m.court) === String(court)) && (day === "all" || m.date === day) && matchesQuery(m))
    .sort((a, b) => parseDate(a.date) - parseDate(b.date) || String(a.time).localeCompare(b.time) || a.nr - b.nr);

  const pickCourt = (c) => { setCourt(c); localStorage.setItem("fb_court", c); };
  const pickDay = (d) => { setDay(d); localStorage.setItem("fb_day", d); };

  // Print / save the schedule (respects the current day/court/search filters).
  const downloadSchedule = async () => {
    const blob = await pdf(<SchedulePDF games={shown} event={event} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Schedule-${(event?.name || "event").replace(/[^\w]+/g, "-")}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <>
      <div className="filter-bar">
        <input className="game-search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search by game # or team…" aria-label="Search games" />
        {q && <button className="filter-pill" onClick={() => setQ("")}>Clear</button>}
        <button className="filter-pill" onClick={downloadSchedule} title="Print / save the schedule as PDF">🖨 PDF</button>
        {isAdmin && !archived && (
          <button className="filter-pill" title="Fill knockout games with the teams that qualified (winners / group ranking)"
            onClick={async () => {
              try { const n = await runAdvancementAll({ silent: false }); alert(n ? `Advanced ${n} game slot(s).` : "Nothing to advance yet — finish the feeding games first."); }
              catch (e) { alert("Advance failed: " + (e?.code || e?.message || e)); }
            }}>↻ Advance bracket</button>
        )}
      </div>

      <div className="filter-bar">
        <span className="filter-label">Day</span>
        <button className={`filter-pill ${day === "all" ? "active" : ""}`} onClick={() => pickDay("all")}>All</button>
        {days.map((d) => (
          <button key={d} className={`filter-pill ${day === d ? "active" : ""}`} onClick={() => pickDay(d)}>{dayLabel(d)}</button>
        ))}
      </div>
      <div className="filter-bar">
        <span className="filter-label">Court</span>
        <button className={`filter-pill ${court === "all" ? "active" : ""}`} onClick={() => pickCourt("all")}>All</button>
        {courts.map((c) => (
          <button key={c} className={`filter-pill ${String(court) === String(c) ? "active" : ""}`} onClick={() => pickCourt(c)}>Court {c}</button>
        ))}
      </div>

      {shown.length === 0 && <div className="empty">No games for this filter.</div>}
      <div className="card-grid">
      {shown.map((m) => {
        const rep = reports[m.id] || {};
        const st = rep.status || "not_started";
        const locked = rep.lockedBy || null;
        const inProgress = st === "in_progress";
        const stateLabel = st === "submitted" ? "Submitted"
          : inProgress ? `In progress · ${locked?.name || "…"}`
          : "Not started";
        const canUnlock = isAdmin && !archived && locked && locked.uid !== me.uid && st !== "submitted";
        return (
          <div className="match-card" key={m.id} onClick={() => nav(`${base}/game/${m.id}`)}>
            <div className="mc-top">
              <span className="tag">#{m.nr}</span>
              <span className="tag day">{dayLabel(m.date)}</span>
              <span>{m.time}</span>
              <span className="tag">Court {m.court}</span>
              <span>{m.round}</span>
              <span className="tag">{m.category}</span>
              <span className={`state ${st === "submitted" ? "submitted" : inProgress ? "progress" : "none"}`}>
                {inProgress && <span className="live-dot" />}{stateLabel}
              </span>
              {canUnlock && (
                <button className="btn danger sm" onClick={(e) => { e.stopPropagation(); adminUnlock(m.id); }}>Unlock</button>
              )}
            </div>
            <div className="mc-teams">
              <KitSwatch kit={resolveKit(m.kit?.A, teamKitsFor(teamKits, m.teamA.name, m.category))} />
              <span className="flag">{flagFor(m.teamA.name)}</span>{teamLabel(m.teamA)}
              <span className="vs">vs</span>
              <KitSwatch kit={resolveKit(m.kit?.B, teamKitsFor(teamKits, m.teamB.name, m.category))} />
              <span className="flag">{flagFor(m.teamB.name)}</span>{teamLabel(m.teamB)}
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}
