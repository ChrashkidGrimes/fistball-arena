import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { subscribeGames, saveGameKit, subscribeTeamKits, setTeamKits, updateEventFields } from "../cloud.js";
import { resolveKit } from "../kits.js";
import { KitSwatch } from "../KitSwatch.jsx";
import { useEvent } from "../eventContext.js";
import { flagFor } from "../flags.js";
import { checkKits, countChanges, DEFAULT_KIT_RULES } from "../officials/kits.js";
import SuggestKitsModal from "./SuggestKitsModal.jsx";

const KIT_BADGE = { clash: ["Clash", "kb-clash"], unresolvable: ["Can't resolve", "kb-unres"] };

// Common uniform colours. value is the stored hex; label for the tooltip.
const PALETTE = [
  ["White", "#ffffff"], ["Black", "#1a1a1a"], ["Red", "#e23b3b"], ["Blue", "#2f6df0"],
  ["Navy", "#1c2c66"], ["Sky", "#38bdf8"], ["Green", "#17915a"], ["Yellow", "#f2c20a"],
  ["Orange", "#f2762e"], ["Pink", "#ec4899"], ["Purple", "#7c3aed"], ["Gray", "#9aa3b2"],
  ["Brown", "#8b5a2b"], ["Teal", "#14b8a6"], ["Maroon", "#7f1d1d"],
];
const parseDate = (s) => { const [d, m, y] = String(s).split("/").map(Number); return new Date(2000 + (y || 0), (m || 1) - 1, d || 1); };
const dayLabel = (s) => { const dt = parseDate(s); return `${dt.toLocaleDateString("en-US", { weekday: "short" })} ${dt.getDate()} ${dt.toLocaleDateString("en-US", { month: "short" })}`; };
const shortTeam = (t) => String(t?.name || t || "").split(" - ")[0];

function ColorPick({ value, disabled, onPick, what = "shirt" }) {
  const [pos, setPos] = useState(null); // {top,left} while open (fixed, via portal)
  const btnRef = useRef(null);
  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 190) });
  };
  const close = () => setPos(null);
  return (
    <span className="cpick">
      <button ref={btnRef} type="button" className="cpick-btn" disabled={disabled} onClick={toggle}
        title={value ? `Change ${what} colour` : `Set ${what} colour`} style={value ? { background: value } : undefined}>
        {!value && <span className="cpick-empty">—</span>}
      </button>
      {pos && !disabled && createPortal(
        <>
          <div className="cpick-backdrop" onClick={close} />
          <div className="cpick-pop" style={{ top: pos.top, left: pos.left }}>
            {PALETTE.map(([name, hex]) => (
              <button key={hex} type="button" className="cpick-sw" title={name} style={{ background: hex }}
                onClick={() => { onPick(hex); close(); }} />
            ))}
            <button type="button" className="cpick-clear" onClick={() => { onPick(""); close(); }}>Clear</button>
          </div>
        </>, document.body)}
    </span>
  );
}

// Each team registers up to two uniforms (shirt + shorts colours). Referees
// then decide which one a team wears: for a whole day at once, or overriding a
// single game. Admin only. Shown on the games list and on Fistball Live.
export default function Colors() {
  const nav = useNavigate();
  const { eventId, event, isAdmin, archived } = useEvent();
  const [games, setGames] = useState([]);
  const [teamKits, setTeamKitsState] = useState({});
  const [day, setDay] = useState("all");
  const [q, setQ] = useState("");
  const [bulk, setBulk] = useState({ team: "", date: "", kit: "" });
  const [status, setStatus] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => subscribeGames(setGames), []);
  useEffect(() => subscribeTeamKits(setTeamKitsState), []);

  const days = useMemo(() => [...new Set(games.map((g) => g.date).filter(Boolean))].sort((a, b) => parseDate(a) - parseDate(b)), [games]);
  // Registered teams (Settings → Teams); falls back to the names on the games.
  const teamNames = useMemo(() => {
    const entries = (event?.entries || []).map((t) => t.name).filter(Boolean);
    const list = entries.length ? entries : games.flatMap((g) => [g.teamA?.name, g.teamB?.name]).filter(Boolean);
    return [...new Set(list)].sort();
  }, [event, games]);
  // Clash check of the current uniforms (src/officials/kits.js). The ΔE
  // threshold is per event (event.kitThreshold).
  const threshold = Number(event?.kitThreshold) || DEFAULT_KIT_RULES.threshold;
  const kitIssues = useMemo(() => checkKits(games, teamKits, { threshold }), [games, teamKits, threshold]);
  const kitChanges = useMemo(() => countChanges(games), [games]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return games
      .filter((g) => day === "all" || g.date === day)
      .filter((g) => !t || String(g.nr).includes(t) || (g.teamA?.name || "").toLowerCase().includes(t) || (g.teamB?.name || "").toLowerCase().includes(t))
      .sort((a, b) => parseDate(a.date) - parseDate(b.date) || String(a.time).localeCompare(b.time) || a.nr - b.nr);
  }, [games, day, q]);

  if (!isAdmin) return <div className="empty">Admins only.</div>;

  const fail = (e) => setStatus("Failed: " + (e?.code || e?.message || e));
  const setTeamColor = (team, n, part, color) => {
    const kits = [0, 1].map((i) => ({ shirt: "", shorts: "", ...(teamKits[team]?.[i] || {}) }));
    kits[n - 1][part] = color;
    setTeamKits(team, kits).catch(fail);
  };
  const setKit = (g, side, kit) => saveGameKit(g.id, side, kit).catch(fail);
  const applySuggestion = async (proposals) => {
    await Promise.all(proposals.map((p) => saveGameKit(p.gameId, p.side, p.to)));
    setStatus(`Applied ${proposals.length} uniform${proposals.length === 1 ? "" : "s"}.`);
  };
  const setThreshold = (v) => {
    const n = Math.round(Number(v));
    if (n >= 5 && n <= 80 && n !== threshold) updateEventFields({ kitThreshold: n }).catch(fail);
  };
  const nIssues = (lvl) => Object.entries(kitIssues).filter(([id, x]) => x.level === lvl && (day === "all" || games.find((g) => g.id === id)?.date === day)).length;
  const changeHints = Object.entries(kitChanges).flatMap(([t, ds]) => Object.entries(ds).filter(([d]) => day === "all" || d === day).map(([d, n]) => `${shortTeam({ name: t })} ${n}× on ${dayLabel(d)}`));
  const applyBulk = async () => {
    const { team, date, kit } = bulk;
    if (!team || !date) { setStatus("Pick a team and a day first."); return; }
    const targets = games.filter((g) => (date === "all" || g.date === date) && (g.teamA?.name === team || g.teamB?.name === team));
    if (!targets.length) { setStatus("No games for that team on that day."); return; }
    setStatus("Applying…");
    try {
      for (const g of targets) await saveGameKit(g.id, g.teamA?.name === team ? "A" : "B", kit ? Number(kit) : "");
      const when = date === "all" ? "every day" : dayLabel(date);
      setStatus(`${kit ? `Uniform ${kit}` : "No uniform"} for ${shortTeam({ name: team })} on ${when} — ${targets.length} game(s).`);
    } catch (e) { fail(e); }
  };

  const kitSelect = (g, side) => {
    const team = side === "A" ? g.teamA?.name : g.teamB?.name;
    const v = g.kit?.[side];
    return (
      <>
        <KitSwatch kit={resolveKit(v, teamKits[team])} size={16} />
        <select className="kit-sel" value={typeof v === "number" ? String(v) : v ? "legacy" : ""} disabled={archived}
          onChange={(e) => setKit(g, side, e.target.value ? Number(e.target.value) : "")} aria-label={`Uniform for ${shortTeam({ name: team })}`}>
          <option value="">—</option>
          <option value="1">Uniform 1</option>
          <option value="2">Uniform 2</option>
          {typeof v === "string" && v && <option value="legacy" disabled>Shirt only (old)</option>}
        </select>
      </>
    );
  };

  return (
    <>
      <h2 className="page-h">Uniforms</h2>
      <p className="muted-sm" style={{ marginTop: -8 }}>Register each team's uniforms (up to two: shirt and shorts colours), then set which one a team wears — for a whole day at once, or per game to override a specific round. Shows on the games list and in the Uniforms tab of Fistball Live.</p>
      {archived && <div className="warn-box">This event is archived — read-only.</div>}

      <div className="card" style={{ maxWidth: "none" }}>
        <h2>Team uniforms</h2>
        <div className="grid-scroll">
          <table className="ref-grid kit-teams">
            <thead><tr><th className="rg-game">Team</th><th>Uniform 1 (shirt · shorts)</th><th>Uniform 2 (shirt · shorts)</th></tr></thead>
            <tbody>
              {teamNames.length === 0 && <tr><td className="muted-sm" colSpan={3}>No teams yet — add them in Settings → Teams.</td></tr>}
              {teamNames.map((team) => (
                <tr key={team}>
                  <td className="clr-cell"><span className="flag">{flagFor(team)}</span>{shortTeam({ name: team })}</td>
                  {[1, 2].map((n) => (
                    <td key={n} className="clr-cell">
                      <ColorPick what="shirt" value={teamKits[team]?.[n - 1]?.shirt || ""} disabled={archived} onPick={(c) => setTeamColor(team, n, "shirt", c)} />
                      <ColorPick what="shorts" value={teamKits[team]?.[n - 1]?.shorts || ""} disabled={archived} onPick={(c) => setTeamColor(team, n, "shorts", c)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!archived && (
        <div className="card" style={{ maxWidth: "none" }}>
          <div className="bulk-row">
            <span className="muted-sm">Uniform of the day:</span>
            <input list="clr-teams" className="game-search" style={{ maxWidth: 240 }} value={bulk.team} onChange={(e) => setBulk({ ...bulk, team: e.target.value })} placeholder="Team…" />
            <datalist id="clr-teams">{teamNames.map((n) => <option key={n} value={n} />)}</datalist>
            <select className="ag-role" value={bulk.date} onChange={(e) => setBulk({ ...bulk, date: e.target.value })}>
              <option value="">— day —</option>
              <option value="all">Every day</option>
              {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
            </select>
            <select className="ag-role" value={bulk.kit} onChange={(e) => setBulk({ ...bulk, kit: e.target.value })}>
              <option value="">— none —</option>
              <option value="1">Uniform 1</option>
              <option value="2">Uniform 2</option>
            </select>
            <KitSwatch kit={resolveKit(Number(bulk.kit), teamKits[bulk.team])} size={18} />
            <button className="btn sm" onClick={applyBulk}>Apply</button>
          </div>
        </div>
      )}

      <div className="filter-bar" style={{ padding: "8px 0" }}>
        <span className="filter-label">Day</span>
        <button className={`filter-pill ${day === "all" ? "active" : ""}`} onClick={() => setDay("all")}>All</button>
        {days.map((d) => <button key={d} className={`filter-pill ${day === d ? "active" : ""}`} onClick={() => setDay(d)}>{dayLabel(d)}</button>)}
      </div>
      <input className="game-search" style={{ maxWidth: 360, marginBottom: 10 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search game # or team…" />
      {status && <p className="muted-sm">{status}</p>}

      <div className="rg-summary">
        {nIssues("clash") ? <span className="rg-pill rg-pill-hard">{nIssues("clash")} clash{nIssues("clash") === 1 ? "" : "es"}</span> : <span className="rg-pill rg-pill-ok">No clashes</span>}
        {nIssues("unresolvable") > 0 && <span className="rg-pill rg-pill-missing" title="Every uniform combination of the two teams clashes">{nIssues("unresolvable")} can't be resolved</span>}
        {!archived && <button className="btn primary sm" onClick={() => setSuggestOpen(true)} disabled={!Object.keys(teamKits).length} title={Object.keys(teamKits).length ? "" : "Register team uniforms first"}>Suggest uniforms…</button>}
        <label className="rg-only" title="Colour distance (ΔE, CIE76) below which two shirts count as a clash. Higher = stricter. Shorts are ignored.">
          Clash below ΔE <input type="number" min="5" max="80" key={threshold} defaultValue={threshold} disabled={archived} style={{ width: 56 }}
            onBlur={(e) => setThreshold(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        </label>
      </div>
      {changeHints.length > 0 && <p className="muted-sm">Uniform changes during a day: {changeHints.join(", ")}</p>}
      {suggestOpen && <SuggestKitsModal games={games} teamKits={teamKits} threshold={threshold} days={days} day={day} dayLabel={dayLabel} onApply={applySuggestion} onClose={() => setSuggestOpen(false)} />}

      <div className="grid-scroll">
        <table className="ref-grid">
          <thead><tr><th className="rg-game">Game</th><th>Team A uniform</th><th>Team B uniform</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td className="muted-sm" colSpan={3}>No games.</td></tr>}
            {shown.map((g) => (
              <tr key={g.id}>
                <td className="rg-game" onClick={() => nav(`/e/${eventId}/game/${g.id}`)} title="Open game report">
                  <div className="rg-nr">#{g.nr} <span className="muted-sm">{dayLabel(g.date)} · {g.time} · Court {g.court}</span></div>
                  <div className="muted-sm">{g.category} · {g.round}</div>
                  {kitIssues[g.id] && <span className={`kit-badge ${KIT_BADGE[kitIssues[g.id].level][1]}`} title={kitIssues[g.id].msg}>{KIT_BADGE[kitIssues[g.id].level][0]}</span>}
                </td>
                <td className="clr-cell"><span className="flag">{flagFor(g.teamA?.name)}</span>{shortTeam(g.teamA)} {kitSelect(g, "A")}</td>
                <td className="clr-cell"><span className="flag">{flagFor(g.teamB?.name)}</span>{shortTeam(g.teamB)} {kitSelect(g, "B")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
