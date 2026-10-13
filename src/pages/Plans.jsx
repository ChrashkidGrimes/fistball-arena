import { useEffect, useMemo, useState } from "react";
import { subscribeGames, subscribeReferees, subscribeTeamKits, subscribeRefKits } from "../cloud.js";
import { resolveKit, teamKitsFor } from "../kits.js";
import { KitSwatch } from "../KitSwatch.jsx";
import { flagFor } from "../flags.js";
import { isPlaceholder } from "../schedule/advance.js";
import { parseSlots } from "../officials/model.js";
import { SLOT_LABEL } from "../officials/rules.js";

// Printable plans for handing out: which uniform each team wears in which
// game, and each official's day — every round with their role, court, game
// and referee shirt colour, or "free". Readable by every event member.

const parseDate = (s) => { const [d, m, y] = String(s).split("/").map(Number); return new Date(2000 + (y || 0), (m || 1) - 1, d || 1); };
const dayLabel = (s) => { const dt = parseDate(s); return `${dt.toLocaleDateString("en-US", { weekday: "short" })} ${dt.getDate()} ${dt.toLocaleDateString("en-US", { month: "short" })}`; };
const timeKey = (t) => parseSlots(t)[0] || String(t ?? "").trim();
const shortTeam = (t) => String(t?.name || t || "").split(" - ")[0];
const byTime = (a, b) => parseDate(a.date) - parseDate(b.date) || timeKey(a.time).localeCompare(timeKey(b.time)) || String(a.court).localeCompare(String(b.court), undefined, { numeric: true }) || (a.nr || 0) - (b.nr || 0);
const refName = (r) => [r.first, r.name].filter(Boolean).join(" ").trim();
const SLOTS = ["r1", "r2", "clerk", "a1", "a2", "cm"];

export default function Plans() {
  const [games, setGames] = useState([]);
  const [refs, setRefs] = useState([]);
  const [teamKits, setTeamKits] = useState({});
  const [refKits, setRefKits] = useState([]);
  const [view, setView] = useState("teams");
  const [who, setWho] = useState("all");
  const [day, setDay] = useState("");

  useEffect(() => subscribeGames(setGames), []);
  useEffect(() => subscribeReferees(setRefs), []);
  useEffect(() => subscribeTeamKits(setTeamKits), []);
  useEffect(() => subscribeRefKits(setRefKits), []);

  const sorted = useMemo(() => [...games].sort(byTime), [games]);
  const days = useMemo(() => [...new Set(sorted.map((g) => g.date).filter(Boolean))], [sorted]);
  const theDay = days.includes(day) ? day : days[0] || "";

  // Teams: one per team and category (uniforms are per category), real teams only.
  const teams = useMemo(() => {
    const m = new Map();
    for (const g of sorted) for (const side of ["A", "B"]) {
      const name = side === "A" ? g.teamA?.name : g.teamB?.name;
      if (!name || isPlaceholder(name)) continue;
      const key = `${name} · ${g.category || ""}`;
      if (!m.has(key)) m.set(key, { key, name, category: g.category || "", games: [] });
      m.get(key).games.push({ g, side });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name) || a.category.localeCompare(b.category));
  }, [sorted]);

  // Officials: the registry plus any other name used on the games.
  const officials = useMemo(() => {
    const m = new Map(refs.map((r) => [refName(r).toLowerCase(), { key: refName(r).toLowerCase(), name: refName(r), country: r.country }]));
    for (const g of sorted) for (const s of SLOTS) {
      const n = String(g.refs?.[s] ?? "").trim();
      if (n && !m.has(n.toLowerCase())) m.set(n.toLowerCase(), { key: n.toLowerCase(), name: n });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [refs, sorted]);

  const list = view === "teams" ? teams : officials;
  const shown = who === "all" ? list : list.filter((x) => x.key === who);
  const refShirt = (g) => refKits.find((r) => r.id === g.kit?.R);

  return (
    <>
      <h2 className="page-h no-print">Plans</h2>
      <div className="plan-bar no-print">
        <span className="filter-pill-group">
          <button className={`filter-pill ${view === "teams" ? "active" : ""}`} onClick={() => { setView("teams"); setWho("all"); }}>Teams — uniforms</button>
          <button className={`filter-pill ${view === "officials" ? "active" : ""}`} onClick={() => { setView("officials"); setWho("all"); }}>Officials — day plan</button>
        </span>
        <select className="ag-role" value={who} onChange={(e) => setWho(e.target.value)} aria-label={view === "teams" ? "Team" : "Official"}>
          <option value="all">{view === "teams" ? "All teams" : "All officials"}</option>
          {list.map((x) => <option key={x.key} value={x.key}>{view === "teams" ? `${shortTeam(x)}${x.category ? ` — ${x.category}` : ""}` : x.name}</option>)}
        </select>
        {view === "officials" && (
          <select className="ag-role" value={theDay} onChange={(e) => setDay(e.target.value)} aria-label="Day">
            {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
          </select>
        )}
        <button className="btn sm" onClick={() => window.print()}>Print</button>
      </div>
      <p className="muted-sm no-print">{view === "teams"
        ? "Which uniform each team wears in which game (set on the Uniforms page). Each team prints on its own page."
        : "Every round of the day for each official: role, court, game and referee shirt colour — or free. Each official prints on its own page."}</p>

      {shown.length === 0 && <div className="empty">{view === "teams" ? "No games with teams yet." : "No officials yet."}</div>}

      {view === "teams" && shown.map((t) => (
        <section key={t.key} className="card plan-card">
          <h3 className="plan-title"><span className="flag">{flagFor(t.name)}</span>{shortTeam(t)}{t.category && <span className="muted-sm"> · {t.category}</span>}</h3>
          <table className="ref-grid plan-table">
            <thead><tr><th>Day</th><th>Time</th><th>Court</th><th>Game</th><th>Opponent</th><th>Uniform</th></tr></thead>
            <tbody>
              {t.games.map(({ g, side }, i) => {
                const prev = t.games[i - 1]?.g;
                const opp = side === "A" ? g.teamB : g.teamA;
                const kit = resolveKit(g.kit?.[side], teamKitsFor(teamKits, t.name, g.category));
                return (
                  <tr key={g.id}>
                    <td>{prev?.date === g.date ? "" : dayLabel(g.date)}</td>
                    <td>{g.time}</td>
                    <td>{g.court}</td>
                    <td>#{g.nr} <span className="muted-sm">{g.round}</span></td>
                    <td><span className="flag">{flagFor(opp?.name)}</span>{shortTeam(opp)}</td>
                    <td>{kit ? <><KitSwatch kit={kit} size={14} /> Uniform {kit.n || ""}</> : <span className="muted-sm">not set</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      {view === "officials" && shown.map((o) => {
        const dayGames = sorted.filter((g) => g.date === theDay);
        const rounds = [...new Set(dayGames.map((g) => timeKey(g.time)))].sort();
        const duties = (t) => {
          const out = [];
          for (const g of dayGames.filter((x) => timeKey(x.time) === t)) for (const s of SLOTS) {
            if (String(g.refs?.[s] ?? "").trim().toLowerCase() === o.key) out.push({ g, s });
          }
          return out;
        };
        const busy = rounds.filter((t) => duties(t).length).length;
        return (
          <section key={o.key} className="card plan-card">
            <h3 className="plan-title"><span className="flag">{flagFor(o.country)}</span>{o.name}
              <span className="muted-sm"> · {dayLabel(theDay)} · {busy} of {rounds.length} rounds on duty</span></h3>
            <table className="ref-grid plan-table">
              <thead><tr><th>Time</th><th>Role</th><th>Court</th><th>Game</th><th>Shirt</th></tr></thead>
              <tbody>
                {rounds.map((t) => {
                  const ds = duties(t);
                  if (!ds.length) return <tr key={t} className="plan-free"><td>{t}</td><td colSpan={4} className="muted-sm">free</td></tr>;
                  // One line per role (a court manager on several courts is one line).
                  const byRole = new Map();
                  for (const d of ds) { const k = d.s === "cm" ? "cm" : d.s + d.g.id; if (!byRole.has(k)) byRole.set(k, []); byRole.get(k).push(d); }
                  return [...byRole.values()].map((list, i) => {
                    const shirts = [...new Map(list.map(({ g }) => refShirt(g)).filter(Boolean).map((r) => [r.id, r])).values()];
                    return (
                      <tr key={t + i}>
                        <td>{i === 0 ? t : ""}</td>
                        <td><b>{SLOT_LABEL[list[0].s]}</b></td>
                        <td>{list.map(({ g }) => g.court).join(", ")}</td>
                        <td>{list.map(({ g }) => (
                          <div key={g.id}>#{g.nr} <span className="flag">{flagFor(g.teamA?.name)}</span>{shortTeam(g.teamA)} <span className="muted-sm">v</span> <span className="flag">{flagFor(g.teamB?.name)}</span>{shortTeam(g.teamB)}</div>
                        ))}</td>
                        <td>{shirts.length ? shirts.map((r) => <span key={r.id} className="plan-shirt"><KitSwatch kit={{ shirt: r.shirt }} size={14} /> {r.name}</span>) : <span className="muted-sm">—</span>}</td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
