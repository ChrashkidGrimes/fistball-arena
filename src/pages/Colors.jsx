import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { subscribeGames, saveGameKit, subscribeTeamKits, setTeamKits, updateEventFields, subscribeRefKits, setRefKits } from "../cloud.js";
import { resolveKit, kitKey, teamKitsFor, kitColors, MAX_KIT_COLORS } from "../kits.js";
import { useEvent } from "../eventContext.js";
import { flagFor } from "../flags.js";
import { checkKits, checkRefShirts, countChanges, DEFAULT_KIT_RULES } from "../officials/kits.js";
import SuggestKitsModal from "./SuggestKitsModal.jsx";

const KIT_BADGE = { clash: ["Clash", "kb-clash"], unresolvable: ["Can't resolve", "kb-unres"], unknown: ["Unknown colour", "kb-unres"] };

// Common uniform colours. value is the stored hex; label for the tooltip.
const PALETTE = [
  ["White", "#ffffff"], ["Black", "#1a1a1a"], ["Red", "#e23b3b"], ["Blue", "#2f6df0"],
  ["Navy", "#1c2c66"], ["Sky", "#38bdf8"], ["Green", "#17915a"], ["Mint", "#3eb489"], ["Yellow", "#f2c20a"],
  ["Orange", "#f2762e"], ["Pink", "#ec4899"], ["Purple", "#7c3aed"], ["Gray", "#9aa3b2"],
  ["Brown", "#8b5a2b"], ["Teal", "#14b8a6"], ["Maroon", "#7f1d1d"],
];
const parseDate = (s) => { const [d, m, y] = String(s).split("/").map(Number); return new Date(2000 + (y || 0), (m || 1) - 1, d || 1); };
const dayLabel = (s) => { const dt = parseDate(s); return `${dt.toLocaleDateString("en-US", { weekday: "short" })} ${dt.getDate()} ${dt.toLocaleDateString("en-US", { month: "short" })}`; };
// Women's categories say so in their name ("Clubs U18 Women", "Damen"…).
const isWomen = (cat) => /\b(women|woman|female|ladies|damen|frauen|feminino|femenino|mujeres)\b/i.test(String(cat || ""));
const shortTeam = (t) => String(t?.name || t || "").split(" - ")[0];

function ColorPick({ value, disabled, onPick, what = "jersey" }) {
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

// Which uniform a team wears: one button per registered uniform showing its
// jersey colours; click to pick, click the picked one again to clear. A stored
// value the team no longer has (removed uniform, old single shirt colour) gets
// its own button to clear it.
function KitPick({ value, kits, disabled, label, onPick }) {
  const options = [1, 2].map((n) => resolveKit(n, kits)).filter(Boolean);
  const stale = value && !options.some((k) => k.n === value);
  return (
    <span className="rs-pick kit-pick" role="group" aria-label={label}>
      {options.map((k) => {
        const on = k.n === value;
        return (
          <button key={k.n} type="button" className={`kp-sw ${on ? "on" : ""}`} disabled={disabled} aria-pressed={on}
            title={`Uniform ${k.n}${on ? " — click to clear" : ""}`} aria-label={`Uniform ${k.n}`} onClick={() => onPick(on ? "" : k.n)}>
            {k.colors.map((c, i) => <span key={i} style={{ background: c }} />)}
          </button>
        );
      })}
      {!options.length && <span className="muted-sm">no uniforms registered</span>}
      {stale && (typeof value === "string"
        ? <button type="button" className="kp-sw on" disabled={disabled} style={{ background: value }} title="Shirt colour from an older version — click to clear" onClick={() => onPick("")} />
        : <button type="button" className="btn sm" disabled={disabled} title="This uniform was removed from the team" onClick={() => onPick("")}>Uniform {value} (removed) ✕</button>)}
    </span>
  );
}

// Each team registers up to two uniforms (jersey colours, up to 3 each). Referees
// then decide which one a team wears: for a whole day at once, or overriding a
// single game. Admin only. Shown on the games list and on Fistball Live.
export default function Colors() {
  const nav = useNavigate();
  const { eventId, event, isAdmin, archived } = useEvent();
  const [games, setGames] = useState([]);
  const [teamKits, setTeamKitsState] = useState({});
  const [refKits, setRefKitsState] = useState([]);
  const [day, setDay] = useState("all");
  const [q, setQ] = useState("");
  const [bulk, setBulk] = useState({ team: "", date: "", kit: "" });
  const [status, setStatus] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => subscribeGames(setGames), []);
  useEffect(() => subscribeTeamKits(setTeamKitsState), []);
  useEffect(() => subscribeRefKits(setRefKitsState), []);

  const days = useMemo(() => [...new Set(games.map((g) => g.date).filter(Boolean))].sort((a, b) => parseDate(a) - parseDate(b)), [games]);
  // One row per team per category it actually plays in this event (from the
  // games; knockout placeholders like "Winner SF1" are skipped when the event
  // has registered teams). Before any games exist, falls back to Settings → Teams.
  const teams = useMemo(() => {
    const registered = new Set((event?.entries || []).map((t) => t?.name).filter(Boolean));
    const pairs = [];
    for (const g of games) for (const n of [g.teamA?.name, g.teamB?.name]) if (n && (!registered.size || registered.has(n))) pairs.push([n, g.category || ""]);
    if (!pairs.length) for (const t of event?.entries || []) if (t?.name) for (const cat of (t.cats?.length ? t.cats : [""])) pairs.push([t.name, cat]);
    const m = new Map(pairs.map(([name, category]) => [kitKey(name, category), { key: kitKey(name, category), name, category, women: isWomen(category) }]));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name) || a.category.localeCompare(b.category));
  }, [event, games]);
  const teamByKey = useMemo(() => new Map(teams.map((t) => [t.key, t])), [teams]);
  const rowLabel = (t) => `${shortTeam({ name: t.name })}${t.category ? ` — ${t.category}` : ""}`;
  // Clash check of the current uniforms (src/officials/kits.js). The ΔE
  // threshold is per event (event.kitThreshold).
  const threshold = Number(event?.kitThreshold) || DEFAULT_KIT_RULES.threshold;
  const kitIssues = useMemo(() => checkKits(games, teamKits, { threshold }), [games, teamKits, threshold]);
  const kitChanges = useMemo(() => countChanges(games), [games]);
  const refIssues = useMemo(() => checkRefShirts(games, teamKits, refKits, { threshold }), [games, teamKits, refKits, threshold]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return games
      .filter((g) => day === "all" || g.date === day)
      .filter((g) => !t || String(g.nr).includes(t) || (g.teamA?.name || "").toLowerCase().includes(t) || (g.teamB?.name || "").toLowerCase().includes(t))
      .sort((a, b) => parseDate(a.date) - parseDate(b.date) || String(a.time).localeCompare(b.time) || a.nr - b.nr);
  }, [games, day, q]);

  if (!isAdmin) return <div className="empty">Admins only.</div>;

  const fail = (e) => setStatus("Failed: " + (e?.code || e?.message || e));
  // Jersey colours of one uniform: set colour #idx ("" removes it).
  const setTeamColor = (t, n, idx, color) => {
    const cur = teamKitsFor(teamKits, t.name, t.category);
    const kits = [0, 1].map((i) => ({ colors: kitColors(cur?.[i]) }));
    const cols = [...kits[n - 1].colors];
    if (color) cols[idx] = color; else cols.splice(idx, 1);
    kits[n - 1] = { colors: cols.filter(Boolean) };
    setTeamKits(t.key, kits).catch(fail);
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
  const nIssues = (lvl, issues = kitIssues) => Object.entries(issues).filter(([id, x]) => x.level === lvl && (day === "all" || games.find((g) => g.id === id)?.date === day)).length;
  const changeHints = Object.entries(kitChanges).flatMap(([t, ds]) => Object.entries(ds).filter(([d]) => day === "all" || d === day).map(([d, n]) => `${shortTeam({ name: t })} ${n}× on ${dayLabel(d)}`));
  const applyBulk = async () => {
    const { date, kit } = bulk;
    const t = teamByKey.get(bulk.team);
    if (!t || !date) { setStatus("Pick a team and a day first."); return; }
    const team = t.name;
    const targets = games.filter((g) => (date === "all" || g.date === date) && (!t.category || g.category === t.category)
      && (g.teamA?.name === team || g.teamB?.name === team));
    if (!targets.length) { setStatus("No games for that team on that day."); return; }
    setStatus("Applying…");
    try {
      for (const g of targets) await saveGameKit(g.id, g.teamA?.name === team ? "A" : "B", kit ? Number(kit) : "");
      const when = date === "all" ? "every day" : dayLabel(date);
      setStatus(`${kit ? `Uniform ${kit}` : "No uniform"} for ${rowLabel(t)} on ${when} — ${targets.length} game(s).`);
    } catch (e) { fail(e); }
  };

  const teamRow = (t) => (
    <tr key={t.key}>
      <td className="clr-cell"><span className="flag">{flagFor(t.name)}</span>{shortTeam({ name: t.name })}{t.category && <span className="muted-sm"> · {t.category}</span>}</td>
      {[1, 2].map((n) => (
        <td key={n} className="clr-cell">
          {(() => {
            const cols = kitColors(teamKitsFor(teamKits, t.name, t.category)?.[n - 1]);
            const slots = cols.length < MAX_KIT_COLORS && !archived ? [...cols, ""] : cols;
            return slots.map((col, idx) => (
              <ColorPick key={idx} value={col} disabled={archived} onPick={(c) => setTeamColor(t, n, idx, c)} />
            ));
          })()}
        </td>
      ))}
    </tr>
  );

  const kitSelect = (g, side) => {
    const team = side === "A" ? g.teamA?.name : g.teamB?.name;
    const v = g.kit?.[side];
    return (
      <KitPick value={v} kits={teamKitsFor(teamKits, team, g.category)} disabled={archived}
        label={`Uniform for ${shortTeam({ name: team })}`} onPick={(n) => setKit(g, side, n)} />
    );
  };

  // Officials' shirt per game (game.kit.R = colour id): one swatch per event
  // colour; click to pick, click the picked one again to clear.
  const refSelect = (g) => {
    const v = g.kit?.R || "";
    const known = refKits.some((r) => r.id === v);
    return (
      <span className="rs-pick" role="group" aria-label="Referee shirt">
        {refKits.filter((r) => r.shirt).map((r) => (
          <button key={r.id} type="button" className={`rs-sw ${r.id === v ? "on" : ""}`} style={{ background: r.shirt }} disabled={archived}
            title={`${r.name || r.shirt}${r.id === v ? " — click to clear" : ""}`} aria-label={r.name || r.shirt} aria-pressed={r.id === v}
            onClick={() => setKit(g, "R", r.id === v ? "" : r.id)} />
        ))}
        {v && !known && <button type="button" className="btn sm" disabled={archived} onClick={() => setKit(g, "R", "")} title="This colour was removed from the list">deleted colour ✕</button>}
      </span>
    );
  };

  return (
    <>
      <h2 className="page-h">Uniforms</h2>
      <p className="muted-sm" style={{ marginTop: -8 }}>Register each team's uniforms (up to two; each jersey can have up to 3 colours, e.g. stripes), then set which one a team wears — for a whole day at once, or per game to override a specific round. Shows on the games list and in the Uniforms tab of Fistball Live.</p>
      {archived && <div className="warn-box">This event is archived — read-only.</div>}

      <div className="card" style={{ maxWidth: "none" }}>
        <h2>Team uniforms</h2>
        <div className="grid-scroll">
          <table className="ref-grid kit-teams">
            <thead><tr><th className="rg-game">Team</th><th>Uniform 1 (jersey colours)</th><th>Uniform 2 (jersey colours)</th></tr></thead>
            <tbody>
              {teams.length === 0 && <tr><td className="muted-sm" colSpan={3}>No teams yet — add them in Settings → Teams.</td></tr>}
              {[["Men", false], ["Women", true]].flatMap(([label, women]) => {
                const list = teams.filter((t) => t.women === women);
                return list.length ? [<tr key={label} className="kit-sec"><th colSpan={3}>{label}</th></tr>, ...list.map(teamRow)] : [];
              })}
            </tbody>
          </table>
        </div>
      </div>

      <RefShirtsCard refKits={refKits} archived={archived} onSave={(list) => setRefKits(list).catch(fail)} />

      {!archived && (
        <div className="card" style={{ maxWidth: "none" }}>
          <div className="bulk-row">
            <span className="muted-sm">Uniform of the day:</span>
            <select className="ag-role" value={bulk.team} onChange={(e) => setBulk({ ...bulk, team: e.target.value })}>
              <option value="">— team —</option>
              {[["Men", false], ["Women", true]].map(([label, women]) => (
                <optgroup key={label} label={label}>
                  {teams.filter((t) => t.women === women).map((t) => <option key={t.key} value={t.key}>{rowLabel(t)}</option>)}
                </optgroup>
              ))}
            </select>
            <select className="ag-role" value={bulk.date} onChange={(e) => setBulk({ ...bulk, date: e.target.value })}>
              <option value="">— day —</option>
              <option value="all">Every day</option>
              {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
            </select>
            {bulk.team
              ? <KitPick value={Number(bulk.kit) || ""} kits={teamKitsFor(teamKits, teamByKey.get(bulk.team)?.name, teamByKey.get(bulk.team)?.category)}
                  label="Uniform of the day" onPick={(n) => setBulk({ ...bulk, kit: n ? String(n) : "" })} />
              : <span className="muted-sm">— pick a team to see its uniforms —</span>}
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
        {refKits.length > 0 && (nIssues("clash", refIssues) + nIssues("unknown", refIssues)
          ? <span className="rg-pill rg-pill-hard">{nIssues("clash", refIssues) + nIssues("unknown", refIssues)} referee shirt clash{nIssues("clash", refIssues) + nIssues("unknown", refIssues) === 1 ? "" : "es"}</span>
          : null)}
        {refKits.length > 0 && nIssues("unresolvable", refIssues) > 0 && <span className="rg-pill rg-pill-missing" title="No referee shirt colour contrasts with both teams">{nIssues("unresolvable", refIssues)} without a fitting referee shirt</span>}
        {!archived && <button className="btn primary sm" onClick={() => setSuggestOpen(true)} disabled={!Object.keys(teamKits).length && !refKits.length} title={Object.keys(teamKits).length || refKits.length ? "" : "Register team uniforms first"}>Suggest uniforms…</button>}
        <label className="rg-only" title="Colour distance (ΔE, CIE76) below which two jerseys count as a clash (striped jerseys: when made of the same colours). Higher = stricter.">
          Clash below ΔE <input type="number" min="5" max="80" key={threshold} defaultValue={threshold} disabled={archived} style={{ width: 56 }}
            onBlur={(e) => setThreshold(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        </label>
      </div>
      {changeHints.length > 0 && <p className="muted-sm">Uniform changes during a day: {changeHints.join(", ")}</p>}
      {suggestOpen && <SuggestKitsModal games={games} teamKits={teamKits} refKits={refKits} threshold={threshold} days={days} day={day} dayLabel={dayLabel} onApply={applySuggestion} onClose={() => setSuggestOpen(false)} />}

      <div className="grid-scroll">
        <table className="ref-grid">
          <thead><tr><th className="rg-game">Game</th><th>Team A uniform</th><th>Team B uniform</th>{refKits.length > 0 && <th>Referee shirt</th>}</tr></thead>
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
                {refKits.length > 0 && <td className="clr-cell">{refSelect(g)}{refIssues[g.id] && <div><span className={`kit-badge ${KIT_BADGE[refIssues[g.id].level][1]}`} title={refIssues[g.id].msg}>{KIT_BADGE[refIssues[g.id].level][0]}</span></div>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// The event's referee shirt colours (no preference between them). All officials of a
// game wear one of them; "Suggest uniforms" picks one per game that contrasts
// with both teams.
function RefShirtsCard({ refKits, archived, onSave }) {
  const [names, setNames] = useState({}); // id -> name being typed
  const update = (i, patch) => onSave(refKits.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onSave([...refKits, { id: Date.now().toString(36), name: "", shirt: "" }]);
  return (
    <div className="card" style={{ maxWidth: "none" }}>
      <h2>Referee shirts</h2>
      <p className="muted-sm" style={{ marginTop: -6 }}>Shirt colours the officials have at this event. All officials of a game wear the same colour; "Suggest uniforms" picks one that contrasts with both teams.</p>
      {refKits.length > 0 && (
        <div className="rs-list">
          {refKits.map((r, i) => (
            <div key={r.id} className="rs-row">
              <ColorPick what="shirt" value={r.shirt || ""} disabled={archived} onPick={(c) => update(i, { shirt: c })} />
              <input className="of-input" value={names[r.id] ?? r.name ?? ""} disabled={archived} placeholder="Name, e.g. Yellow"
                onChange={(e) => setNames((p) => ({ ...p, [r.id]: e.target.value }))}
                onBlur={() => { if (names[r.id] !== undefined && names[r.id] !== r.name) update(i, { name: names[r.id].trim() }); setNames((p) => { const n = { ...p }; delete n[r.id]; return n; }); }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label="Colour name" />
              {!archived && <button className="btn danger sm" onClick={() => onSave(refKits.filter((_, j) => j !== i))} aria-label="Remove">✕</button>}
            </div>
          ))}
        </div>
      )}
      {!archived && <button className="btn sm" style={{ marginTop: 8 }} onClick={add}>+ Add colour</button>}
    </div>
  );
}
