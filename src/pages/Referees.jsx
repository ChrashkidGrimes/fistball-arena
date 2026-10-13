import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeGames, subscribeReferees, saveGameRefs, saveGameRank } from "../cloud.js";
import { useEvent } from "../eventContext.js";
import { flagFor } from "../flags.js";
import { teamMeta, ROLE_LABEL, SLOT_ROLE, canFill, availableAt, sameCountry, RANKS, RANK_LABEL, defaultGameRank, rankOf } from "../officials/model.js";
import { checkAssignments, cellLevel, SLOT_LABEL } from "../officials/rules.js";
import OfficialsCard from "./OfficialsCard.jsx";
import AutoAssignModal from "./AutoAssignModal.jsx";

const ROLES = [["r1", "Referee 1"], ["r2", "Referee 2"], ["clerk", "Clerk"], ["a1", "Assistant 1"], ["a2", "Assistant 2"], ["cm", "Court manager"]];
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
  const [localAuto, setLocalAuto] = useState({}); // gameId -> {r1: true,..} which slots auto-assign filled
  const [saved, setSaved] = useState({});    // gameId -> ts (flash "saved")
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [showList, setShowList] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const timers = useRef({});

  useEffect(() => subscribeGames(setGames), []);
  useEffect(() => subscribeReferees(setRefs), []);

  const sortedRefs = useMemo(() => [...refs].sort((a, b) => refName(a).localeCompare(refName(b))), [refs]);
  const teamNations = useMemo(() => [...new Set((event?.entries || []).map((e) => teamMeta(event.entries, e.name).country).filter(Boolean))].sort(), [event]);
  const days = useMemo(() => [...new Set(games.map((g) => g.date))].sort((a, b) => parseDate(a) - parseDate(b)), [games]);
  // Rule checks over ALL games (games in a row / double booking span the day),
  // including unsaved edits. See src/officials/rules.js.
  const merged = useMemo(() => games.map((g) => (local[g.id] || localAuto[g.id]
    ? { ...g, refs: local[g.id] || g.refs, refsAuto: localAuto[g.id] || g.refsAuto } : g)), [games, local, localAuto]);
  const check = useMemo(() => checkAssignments(merged, refs, event?.entries || []), [merged, refs, event]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return games
      .filter((g) => day === "all" || g.date === day)
      .filter((g) => !issuesOnly || check.cells[g.id])
      .filter((g) => !t || String(g.nr).includes(t) || (g.teamA?.name || "").toLowerCase().includes(t) || (g.teamB?.name || "").toLowerCase().includes(t))
      .sort((a, b) => parseDate(a.date) - parseDate(b.date) || String(a.time).localeCompare(b.time) || a.nr - b.nr);
  }, [games, day, q, issuesOnly, check]);

  if (!isAdmin) return <div className="empty">Admins only.</div>;

  const valOf = (g, k) => (local[g.id]?.[k] ?? g.refs?.[k] ?? "");
  // Slots filled by auto-assign are flagged in game.refsAuto; any other filled
  // slot (picked here, or from before the flag existed) counts as set by hand.
  const autoOf = (g) => localAuto[g.id] || g.refsAuto || {};
  const isManual = (g, k) => !!String(valOf(g, k)).trim() && !autoOf(g)[k];
  const setVal = (g, k, v) => {
    const next = { ...(local[g.id] || { ...(g.refs || {}) }), [k]: v };
    const nextAuto = { ...autoOf(g), [k]: false };
    setLocal((p) => ({ ...p, [g.id]: next }));
    setLocalAuto((p) => ({ ...p, [g.id]: nextAuto }));
    clearTimeout(timers.current[g.id]);
    timers.current[g.id] = setTimeout(async () => {
      try { await saveGameRefs(g.id, next, nextAuto); setSaved((s) => ({ ...s, [g.id]: Date.now() })); setTimeout(() => setSaved((s) => { const n = { ...s }; delete n[g.id]; return n; }), 1500); }
      catch (e) { alert("Could not save referees for #" + g.nr + ": " + (e?.code || e?.message || e)); }
    }, 500);
  };

  // Picker for one slot: officials with that role first, the rest below; each
  // with flag and short hints (own nation, busy at this time, away, already
  // in this game) so problems show before picking. "Other name…" allows a
  // name outside the registry.
  const busyAt = new Map(); // "date|time" → name → [{ nr, slot }]
  for (const x of merged) for (const [k] of ROLES) {
    const n = String(x.refs?.[k] ?? "").trim().toLowerCase();
    if (!n) continue;
    const key = `${x.date}|${x.time}`;
    if (!busyAt.has(key)) busyAt.set(key, new Map());
    const m = busyAt.get(key);
    m.set(n, [...(m.get(n) || []), { nr: x.nr, slot: k }]);
  }
  // Wide enough for the longest name in the registry (flag + name), so every
  // picked name is shown in full; the hints only appear in the open list.
  // (ch = width of "0"; names in a proportional font run ~15% wider, plus the
  // flag and the select's arrow.)
  const pickerWidth = `calc(${(Math.max(12, ...sortedRefs.map((o) => refName(o).length)) * 1.15 + 3).toFixed(1)}ch + 40px)`;
  const officialPicker = (g, k, placeholder) => {
    const v = String(valOf(g, k)).trim();
    const known = sortedRefs.find((o) => refName(o).toLowerCase() === v.toLowerCase());
    const value = known ? refName(known) : v;
    const A = teamMeta(event?.entries, g.teamA), B = teamMeta(event?.entries, g.teamB);
    const label = (o) => {
      const n = refName(o), lower = n.toLowerCase(), hints = [];
      if (ROLES.some(([s]) => s !== k && String(valOf(g, s)).trim().toLowerCase() === lower)) hints.push("in this game");
      // Court manager on other courts at the same time is fine (only for the court manager slot).
      const other = (busyAt.get(`${g.date}|${g.time}`)?.get(lower) || []).filter((x) => x.nr !== g.nr && !(k === "cm" && x.slot === "cm")).map((x) => x.nr);
      if (other.length) hints.push(`busy (#${other.join(", #")})`);
      if (!availableAt(o, g.date, g.time)) hints.push("away");
      if ((k === "r1" || k === "r2") && o.country && (sameCountry(o.country, A.country) || sameCountry(o.country, B.country))) hints.push("own nation");
      if ((k === "r1" || k === "r2") && rankOf(o) !== "normal") hints.unshift(RANK_LABEL[rankOf(o)].toLowerCase());
      return `${flagFor(o.country)} ${n}${hints.length ? " — " + hints.join(", ") : ""}`.trim();
    };
    const text = (o) => (refName(o) === value ? `${flagFor(o.country)} ${refName(o)}`.trim() : label(o));
    const fits = sortedRefs.filter((o) => canFill(o, k)), others = sortedRefs.filter((o) => !canFill(o, k));
    const pick = (e) => {
      if (e.target.value !== "__other__") { setVal(g, k, e.target.value); return; }
      const n = prompt("Name of the official (not in the registry):", value);
      if (n !== null) setVal(g, k, n.trim());
    };
    return (
      <select className="ref-input" style={{ width: pickerWidth }} value={value} disabled={archived} onChange={pick} aria-label={`${ROLES.find(([s]) => s === k)[1]} of game ${g.nr}`}>
        <option value="">{placeholder}</option>
        {v && !known && <option value={v}>{v} (not in the registry)</option>}
        <optgroup label={`${ROLE_LABEL[SLOT_ROLE[k]]}s`}>{fits.map((o) => <option key={o.id} value={refName(o)}>{text(o)}</option>)}</optgroup>
        {others.length > 0 && <optgroup label="Other officials">{others.map((o) => <option key={o.id} value={refName(o)}>{text(o)}</option>)}</optgroup>}
        <option value={"__other__"}>Other name…</option>
      </select>
    );
  };

  // Write an auto-assign proposal: one saveGameRefs per changed game.
  const applyProposal = async (res) => {
    const byGame = {};
    for (const p of res.proposals) (byGame[p.gameId] ||= {})[p.slot] = p.to;
    const next = {}, nextAuto = {};
    for (const g of merged) if (byGame[g.id]) {
      next[g.id] = { ...(g.refs || {}), ...byGame[g.id] };
      nextAuto[g.id] = { ...autoOf(g), ...Object.fromEntries(Object.entries(byGame[g.id]).map(([s, to]) => [s, !!to])) };
    }
    setLocal((p) => ({ ...p, ...next }));
    setLocalAuto((p) => ({ ...p, ...nextAuto }));
    await Promise.all(Object.entries(next).map(([id, r]) => saveGameRefs(id, r, nextAuto[id])));
  };

  // Remove every official from the games of the selected day (or all days).
  // Existing game reports keep their referees; only the planning is cleared.
  // Remove officials from the games of the selected day (or all days): only
  // the auto-assigned ones (manual picks stay), or all of them. Existing game
  // reports keep their referees; only the planning is cleared.
  const clearAssignments = async (onlyAuto) => {
    const clears = (g, k) => !!String(valOf(g, k)).trim() && (!onlyAuto || !isManual(g, k));
    const targets = merged.filter((g) => (day === "all" || g.date === day) && ROLES.some(([k]) => clears(g, k)));
    const when = day === "all" ? "all days" : dayLabel(day);
    if (!targets.length) { alert(`No ${onlyAuto ? "auto-assigned " : ""}officials (${when}).`); return; }
    const n = targets.reduce((s, g) => s + ROLES.filter(([k]) => clears(g, k)).length, 0);
    const kept = onlyAuto ? merged.filter((g) => day === "all" || g.date === day).reduce((s, g) => s + ROLES.filter(([k]) => isManual(g, k)).length, 0) : 0;
    if (!confirm(`Remove ${n} ${onlyAuto ? "auto-assigned " : ""}official${n === 1 ? "" : "s"} from ${targets.length} game${targets.length === 1 ? "" : "s"} (${when})?${kept ? ` ${kept} set by hand stay.` : ""} Game reports that already exist keep their referees.`)) return;
    const next = {}, nextAuto = {};
    for (const g of targets) {
      next[g.id] = Object.fromEntries(ROLES.map(([k]) => [k, clears(g, k) ? "" : String(valOf(g, k))]));
      nextAuto[g.id] = {}; // what's left is set by hand
    }
    setLocal((p) => ({ ...p, ...next }));
    setLocalAuto((p) => ({ ...p, ...nextAuto }));
    try { await Promise.all(targets.map((g) => saveGameRefs(g.id, next[g.id], nextAuto[g.id]))); }
    catch (e) { alert("Could not clear: " + (e?.code || e?.message || e)); }
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

      {!archived && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button className="btn primary sm" onClick={() => setAutoOpen(true)} disabled={!refs.length} title={refs.length ? "" : "Add officials first"}>Auto-assign…</button>
          <button className="btn sm" onClick={() => clearAssignments(true)} title={`Remove the auto-assigned officials (${day === "all" ? "all days" : dayLabel(day)}); officials set by hand stay`}>Clear auto-assigned…</button>
          <button className="btn sm" onClick={() => clearAssignments(false)} title={`Remove all officials (${day === "all" ? "all days" : dayLabel(day)})`}>Clear all…</button>
        </div>
      )}
      {autoOpen && <AutoAssignModal games={merged} refs={refs} entries={event?.entries || []} days={days} day={day} dayLabel={dayLabel} onApply={applyProposal} onClose={() => setAutoOpen(false)} />}
      <LoadOverview games={merged} days={days} dayLabel={dayLabel} />
      <IssueSummary check={check} games={games} day={day} showList={showList} setShowList={setShowList}
        issuesOnly={issuesOnly} setIssuesOnly={setIssuesOnly} onPick={(g) => { setDay("all"); setQ(String(g.nr)); }} />


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
                  <select className={`rg-rank rg-rank-${g.rank || defaultGameRank(g)}`} value={g.rank || ""} disabled={archived} onClick={(e) => e.stopPropagation()}
                    onChange={(e) => saveGameRank(g.id, e.target.value).catch((err) => alert("Could not save the rank: " + (err?.code || err?.message || err)))}
                    aria-label={`Rank of game ${g.nr}`} title="Game rank — auto-assign gives it a Referee 1 of at least this rank">
                    <option value="">Auto: {RANK_LABEL[defaultGameRank(g)]}</option>
                    {RANKS.map((x) => <option key={x} value={x}>{RANK_LABEL[x]}</option>)}
                  </select>
                </td>
                {ROLES.map(([k]) => {
                  const iss = check.cells[g.id]?.[k];
                  const lvl = cellLevel(iss);
                  const empty = !String(valOf(g, k)).trim();
                  return (
                    <td key={k} className={`ag-cell ${lvl ? `rg-${empty ? "missing" : lvl}` : ""} ${isManual(g, k) ? "ag-manual" : ""}`}
                      title={[isManual(g, k) && "✎ Set by hand", ...(iss || []).map((i) => (i.level === "hard" ? "⛔ " : "⚠ ") + i.msg)].filter(Boolean).join("\n") || undefined}>
                      {isManual(g, k) && <span className="ag-manual-mark" aria-label="Set by hand">✎ manual</span>}
                      {officialPicker(g, k, empty && lvl ? "required" : "—")}
                      {lvl && !empty && <span className={`rg-badge rg-badge-${lvl}`}>{iss.length > 1 ? iss.length : "!"}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Header summary: hard / soft / empty counts (for the selected day); click to
// list the issues, or show only games that have any.
function IssueSummary({ check, games, day, showList, setShowList, issuesOnly, setIssuesOnly, onPick }) {
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const items = check.list
    .filter((i) => day === "all" || byId.get(i.gameId)?.date === day)
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "hard" ? -1 : 1) || (byId.get(a.gameId)?.nr ?? 0) - (byId.get(b.gameId)?.nr ?? 0));
  const n = (f) => items.filter(f).length;
  const hard = n((i) => i.level === "hard" && i.code !== "missing"), soft = n((i) => i.level === "soft"), missing = n((i) => i.code === "missing");
  return (
    <div className="rg-summary">
      <button className={`rg-pill ${hard ? "rg-pill-hard" : "rg-pill-ok"}`} onClick={() => setShowList(!showList)}>{hard ? `${hard} conflict${hard === 1 ? "" : "s"}` : "No conflicts"}</button>
      {soft > 0 && <button className="rg-pill rg-pill-soft" onClick={() => setShowList(!showList)}>{soft} warning{soft === 1 ? "" : "s"}</button>}
      {missing > 0 && <button className="rg-pill rg-pill-missing" onClick={() => setShowList(!showList)}>{missing} empty required slot{missing === 1 ? "" : "s"}</button>}
      <label className="rg-only"><input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> Only games with issues</label>
      {showList && items.length > 0 && (
        <ul className="rg-issues">
          {items.filter((i) => i.code !== "missing").map((i, j) => {
            const g = byId.get(i.gameId);
            return (
              <li key={j} className={`rg-issue-${i.level}`} onClick={() => g && onPick(g)} title="Show this game">
                <b>#{g?.nr}</b> <span className="muted-sm">{g?.time}</span> · {SLOT_LABEL[i.slot]}: <b>{i.name}</b> — {i.msg}
              </li>
            );
          })}
          {missing > 0 && <li className="muted-sm">+ {missing} empty required slot{missing === 1 ? "" : "s"} (Referee 1/2 always; Clerk and Assistants when officials with that role exist).</li>}
        </ul>
      )}
    </div>
  );
}

// Games per official per day, split by role (referee 1/2, assistant 1/2,
// clerk), to spot an uneven load at a glance.
const ROLE_OF = { r1: "referee", r2: "referee", a1: "assistant", a2: "assistant", clerk: "clerk", cm: "courtManager" };
function LoadOverview({ games, days, dayLabel }) {
  const rows = useMemo(() => {
    const m = new Map();
    for (const g of games) for (const [slot, role] of Object.entries(ROLE_OF)) {
      const n = String(g.refs?.[slot] ?? "").trim();
      if (!n) continue;
      const k = n.toLowerCase();
      if (!m.has(k)) m.set(k, { name: n, total: 0, day: {} });
      const r = m.get(k); r.total++;
      const d = (r.day[g.date] ||= { referee: 0, assistant: 0, clerk: 0, courtManager: 0 }); d[role]++;
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [games]);
  if (!rows.length) return null;
  const fmt = (d) => (d ? ["referee", "assistant", "clerk", "courtManager"].filter((r) => d[r]).map((r) => `${d[r]}× ${ROLE_LABEL[r]}`).join(" · ") : "");
  return (
    <details className="adv-tool" style={{ marginBottom: 10 }}>
      <summary>Load per official</summary>
      <div className="grid-scroll">
        <table className="ref-grid">
          <thead><tr><th>Official</th>{days.map((d) => <th key={d}>{dayLabel(d)}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}><td className="of-name">{r.name}</td>{days.map((d) => <td key={d} className="muted-sm">{fmt(r.day[d])}</td>)}<td><b>{r.total}</b></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
