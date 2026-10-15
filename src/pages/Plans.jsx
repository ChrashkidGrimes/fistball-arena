import { useEffect, useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { subscribeGames, subscribeReferees, subscribeTeamKits, subscribeRefKits } from "../cloud.js";
import { KitSwatch } from "../KitSwatch.jsx";
import { flagFor } from "../flags.js";
import { useEvent } from "../eventContext.js";
import { SLOT_LABEL } from "../officials/rules.js";
import { teamPlans, officialPlans, planDays } from "../officials/plans.js";
import PlansPDF from "../pdf/PlansPDF.jsx";

// Plans for handing out: which uniform each team wears in which game, and
// each official's day — every round with their role, court, game and referee
// shirt colour, or "free". Readable by every event member; print or PDF.

const parseDate = (s) => { const [d, m, y] = String(s).split("/").map(Number); return new Date(2000 + (y || 0), (m || 1) - 1, d || 1); };
const dayLabel = (s) => { const dt = parseDate(s); return `${dt.toLocaleDateString("en-US", { weekday: "short" })} ${dt.getDate()} ${dt.toLocaleDateString("en-US", { month: "short" })}`; };
const shortTeam = (t) => String(t?.name || t || "").split(" - ")[0];
const fileSafe = (s) => String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

export default function Plans() {
  const { event } = useEvent();
  const [games, setGames] = useState([]);
  const [refs, setRefs] = useState([]);
  const [teamKits, setTeamKits] = useState({});
  const [refKits, setRefKits] = useState([]);
  const [view, setView] = useState("teams");
  const [who, setWho] = useState("all");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeGames(setGames), []);
  useEffect(() => subscribeReferees(setRefs), []);
  useEffect(() => subscribeTeamKits(setTeamKits), []);
  useEffect(() => subscribeRefKits(setRefKits), []);

  const days = useMemo(() => planDays(games), [games]);
  const theDay = days.includes(day) ? day : days[0] || "";
  const teams = useMemo(() => teamPlans(games, teamKits), [games, teamKits]);
  const officials = useMemo(() => officialPlans(games, refs, refKits, theDay), [games, refs, refKits, theDay]);

  const list = view === "teams" ? teams : officials.plans;
  const shown = who === "all" ? list : list.filter((x) => x.key === who);

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const doc = view === "teams"
        ? <PlansPDF event={event} teams={shown} />
        : <PlansPDF event={event} officials={shown} rounds={officials.rounds.length} day={theDay} />;
      const blob = await pdf(doc).toBlob();
      const one = who !== "all" && shown[0] ? (view === "teams" ? `${shown[0].name}-${shown[0].category}` : shown[0].name) : "";
      const name = ["Plan", event?.name, view === "teams" ? "uniforms" : `officials-${theDay.replace(/\//g, "-")}`, one].map(fileSafe).filter(Boolean).join("_");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${name}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { alert("Could not create the PDF: " + (e?.message || e)); }
    setBusy(false);
  };

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
        <button className="btn sm" onClick={downloadPdf} disabled={busy || !shown.length}>{busy ? "Creating PDF…" : "PDF"}</button>
      </div>
      <p className="muted-sm no-print">{view === "teams"
        ? "Which uniform each team wears in which game (set on the Uniforms page). Print / PDF: one page per team."
        : "Every round of the day for each official: role, court, game and referee shirt colour — or free. Print / PDF: one page per official."}</p>

      {shown.length === 0 && <div className="empty">{view === "teams" ? "No games with teams yet." : "No officials yet."}</div>}

      {view === "teams" && shown.map((t) => (
        <section key={t.key} className="card plan-card">
          <h3 className="plan-title"><span className="flag">{flagFor(t.name)}</span>{shortTeam(t)}{t.category && <span className="muted-sm"> · {t.category}</span>}</h3>
          <table className="ref-grid plan-table">
            <thead><tr><th>Day</th><th>Time</th><th>Court</th><th>Game</th><th>Opponent</th><th>Uniform</th></tr></thead>
            <tbody>
              {t.rows.map(({ g, opponent, kit }, i) => (
                <tr key={g.id}>
                  <td>{t.rows[i - 1]?.g.date === g.date ? "" : dayLabel(g.date)}</td>
                  <td>{g.time}</td>
                  <td>{g.court}</td>
                  <td>#{g.nr} <span className="muted-sm">{g.round}</span></td>
                  <td><span className="flag">{flagFor(opponent?.name)}</span>{shortTeam(opponent)}</td>
                  <td>{kit ? <><KitSwatch kit={kit} size={14} /> Uniform {kit.n || ""}</> : <span className="muted-sm">not set</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {view === "officials" && shown.map((o) => (
        <section key={o.key} className="card plan-card">
          <h3 className="plan-title"><span className="flag">{flagFor(o.country)}</span>{o.name}
            <span className="muted-sm"> · {dayLabel(theDay)} · {o.onDuty} of {officials.rounds.length} rounds on duty</span></h3>
          <table className="ref-grid plan-table">
            <thead><tr><th>Time</th><th>Role</th><th>Court</th><th>Game</th><th>Shirt</th></tr></thead>
            <tbody>
              {o.rows.map(({ time, duties }) => (!duties.length
                ? <tr key={time} className="plan-free"><td>{time}</td><td colSpan={4} className="muted-sm">free</td></tr>
                : duties.map((d, i) => (
                  <tr key={time + i}>
                    <td>{i === 0 ? time : ""}</td>
                    <td><b>{SLOT_LABEL[d.slot]}</b></td>
                    <td>{d.courts.join(", ")}</td>
                    <td>{d.games.map((g) => (
                      <div key={g.id}>#{g.nr} <span className="flag">{flagFor(g.teamA?.name)}</span>{shortTeam(g.teamA)} <span className="muted-sm">v</span> <span className="flag">{flagFor(g.teamB?.name)}</span>{shortTeam(g.teamB)}</div>
                    ))}</td>
                    <td>{d.shirts.length ? d.shirts.map((r) => <span key={r.id} className="plan-shirt"><KitSwatch kit={{ colors: [r.shirt] }} size={14} /> {r.name}</span>) : <span className="muted-sm">—</span>}</td>
                  </tr>
                ))))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
