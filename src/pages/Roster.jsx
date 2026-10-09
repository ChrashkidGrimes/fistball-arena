import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchRosters } from "../roster/importRoster.js";
import ExcelImport from "../roster/ExcelImport.jsx";
import { subscribeRosters, subscribeResults, publishRosters, addMember, updateRosterPlayers } from "../cloud.js";
import { flagFor } from "../flags.js";
import { eventCategoryNames } from "../categories.js";
import { useEvent } from "../eventContext.js";

function Avatar({ src, name }) {
  const [err, setErr] = useState(false);
  if (src && !err) return <img className="avatar" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setErr(true)} />;
  return <span className="avatar avatar-ph">{(name || "?").trim()[0]}</span>;
}

export default function Roster({ me }) {
  const nav = useNavigate();
  const { eventId, isAdmin, event, archived } = useEvent();
  const [rosters, setRosters] = useState(null);   // live registry from Firestore
  const [numEdit, setNumEdit] = useState({});      // `${rosterKey}:${idx}` -> jersey string (in-flight edits)
  const numTimers = useRef({});
  const [preview, setPreview] = useState(null);     // parsed import { rosters, teamCount, count, warnings }
  const [sheetId, setSheetId] = useState("");
  const [tab, setTab] = useState("DB");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(null);           // expanded team
  const [profile, setProfile] = useState(null);     // person card
  const [results, setResults] = useState([]);       // published results (for history)

  useEffect(() => subscribeRosters(setRosters), []);
  useEffect(() => subscribeResults(setResults), []);

  const doImport = async () => {
    setStatus("Reading DB tab…");
    try {
      const id = sheetId.match(/[-\w]{25,}/)?.[0] || sheetId.trim();
      const r = await fetchRosters(id, tab.trim() || "DB");
      setPreview(r);
      setStatus(`Found ${r.count} people across ${r.teamCount} teams.`);
    } catch (e) {
      setStatus("Import failed: " + (e?.message || e));
    }
  };

  const doPublish = async () => {
    if (!preview?.count) return;
    setStatus("Saving registry…");
    try {
      await publishRosters(preview.rosters);
      setStatus(`Saved ${preview.count} people across ${preview.teamCount} teams. Line-ups will now pre-fill when a game is opened.`);
      setPreview(null);
    } catch (e) {
      setStatus("Save failed: " + (e?.message || e));
    }
  };

  const teams = useMemo(() => {
    const src = rosters || {};
    return Object.keys(src).sort((a, b) => a.localeCompare(b)).map((k) => ({ key: k, ...src[k] }));
  }, [rosters]);

  // Edit a jersey number in-app (no re-upload). Debounced save of the whole
  // players array, applying every pending edit for that team.
  const canEditNums = isAdmin && !archived;
  const setNum = (t, i, v) => {
    setNumEdit((m) => ({ ...m, [`${t.key}:${i}`]: v }));
    clearTimeout(numTimers.current[t.key]);
    numTimers.current[t.key] = setTimeout(() => {
      setNumEdit((cur) => {
        const players = (t.players || []).map((p, idx) => {
          const k = `${t.key}:${idx}`;
          if (!(k in cur)) return p;
          const raw = String(cur[k]).trim();
          const nr = raw === "" ? "" : (Number.isFinite(+raw) ? +raw : raw);
          return { ...p, nr };
        });
        updateRosterPlayers(t.key, players)
          .then(() => setStatus(`Saved jersey numbers for ${t.name}.`))
          .catch((e) => setStatus("Save failed: " + (e?.code || e?.message || e)));
        // drop this team's in-flight edits; the subscription now holds the truth
        const next = { ...cur };
        Object.keys(next).forEach((k) => { if (k.startsWith(`${t.key}:`)) delete next[k]; });
        return next;
      });
    }, 700);
  };

  // Normalise the volume bars against the largest players/staff count across teams.
  const maxCount = useMemo(
    () => Math.max(1, ...teams.flatMap((t) => [t.players?.length || 0, t.staff?.length || 0])),
    [teams]
  );

  // After all hooks, so they run in the same order whether or not the role has loaded yet.
  if (!isAdmin) {
    return <div className="empty">Admins only. <button className="btn" onClick={() => nav(`/e/${eventId}`)}>Back</button></div>;
  }

  return (
    <>
      <h2 className="page-h">Players &amp; staff</h2>
        {/* ---- Excel upload ---- */}
        <ExcelImport me={me} teamNames={(event?.entries || []).map((e) => e.name)} categories={eventCategoryNames(event)} />

        {/* ---- Google Sheet import (alternative) ---- */}
        <div className="card">
          <h2>Import players &amp; staff from the DB sheet</h2>
          <p className="muted-sm">Reads the “DB” tab and stores one roster per team. Game-report line-ups then pre-fill automatically.</p>
          <div className="add-row" style={{ marginTop: 8 }}>
            <input value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder="Sheet URL or ID" />
            <input value={tab} onChange={(e) => setTab(e.target.value)} placeholder="Tab" style={{ maxWidth: 90, flex: "none" }} />
            <button className="btn primary" onClick={doImport}>Read</button>
          </div>
          {preview?.warnings?.length > 0 && (
            <div className="warn-box">{preview.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}</div>
          )}
          {preview?.count > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="muted-sm">Ready to save <b>{preview.count}</b> people across <b>{preview.teamCount}</b> teams.</p>
              <button className="btn primary" style={{ width: "100%" }} onClick={doPublish}>
                Save {preview.count} people to the registry
              </button>
            </div>
          )}
          {status && <p className="muted-sm" style={{ marginTop: 10 }}>{status}</p>}
        </div>

        {rosters === null && <div className="empty">Loading registry…</div>}
        {rosters !== null && teams.length === 0 && (
          <div className="empty">No teams in the registry yet — import from the DB sheet above.</div>
        )}

        <div className="card-grid loose">
        {teams.map((t) => (
          <div className="card" key={t.key}>
            <button className="roster-head" onClick={() => setOpen(open === t.key ? null : t.key)}>
              <div className="row-between">
                <span className="group-title"><span className="flag">{flagFor(t.name)}</span>{t.name}</span>
                <span className="muted-sm">{t.players?.length || 0} players · {t.staff?.length || 0} staff {open === t.key ? "▾" : "▸"}</span>
              </div>
              <div className="vol-bar" title={`${t.players?.length || 0} players · ${t.staff?.length || 0} staff`}>
                <div className="vol-half left">
                  <span className="vol-fill players" style={{ width: ((t.players?.length || 0) / maxCount * 100) + "%" }} />
                </div>
                <div className="vol-half right">
                  <span className="vol-fill staff" style={{ width: ((t.staff?.length || 0) / maxCount * 100) + "%" }} />
                </div>
              </div>
            </button>
            {open === t.key && (
              <div style={{ marginTop: 10 }}>
                {(t.players || []).map((p, i) => (
                  <div className="roster-row clickable" key={"p" + i} onClick={() => setProfile({ ...p, team: t.name, kind: "player" })}>
                    <Avatar src={p.photo} name={p.name} />
                    {canEditNums ? (
                      <input
                        className="roster-nr nr-edit"
                        value={numEdit[`${t.key}:${i}`] ?? (p.nr ?? "")}
                        inputMode="numeric"
                        aria-label={`Jersey number for ${p.name}`}
                        title="Jersey number — click to edit"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setNum(t, i, e.target.value)}
                      />
                    ) : (
                      <span className="roster-nr">{p.nr}</span>
                    )}
                    <span className="roster-name">{p.name} <span className="muted-sm">{p.first}</span></span>
                    <span className="muted-sm">{p.position}</span>
                  </div>
                ))}
                {canEditNums && (t.players || []).length > 0 && (
                  <p className="muted-sm" style={{ margin: "4px 0 0" }}>Tip: edit a jersey number above — it saves automatically. In an already-open game report, use “↻ Load roster” (Line-ups tab) to pull the fix.</p>
                )}
                {(t.staff || []).length > 0 && <div className="subhead">Staff</div>}
                {(t.staff || []).map((s, i) => (
                  <div className="roster-row clickable" key={"s" + i} onClick={() => setProfile({ ...s, team: t.name, kind: "staff" })}>
                    <Avatar src={s.photo} name={s.name} />
                    <span className="roster-nr role">{(s.role || "").split(" ").map((w) => w[0]).join("").slice(0, 3)}</span>
                    <span className="roster-name">{s.name} <span className="muted-sm">{s.first}</span></span>
                    <span className="muted-sm">{s.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        </div>

      {profile && <PersonModal person={profile} results={results} onClose={() => setProfile(null)} me={me} isAdmin={isAdmin} />}
    </>
  );
}

function ageFrom(bday) {
  const m = String(bday).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const b = new Date(+m[1], +m[2] - 1, +m[3]);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

// Same-person test tolerant of missing jersey numbers / accents.
function normName(s) { return String(s || "").trim().toLowerCase(); }
function sameCard(c, p) {
  if (normName(c.name) !== normName(p.name)) return false;
  if (c.first && p.first && normName(c.first) !== normName(p.first)) return false;
  if (c.nr && p.nr && String(c.nr) !== String(p.nr)) return false;
  return true;
}

function PersonModal({ person, results = [], onClose, me, isAdmin }) {
  const p = person;
  const age = ageFrom(p.birthday);

  // Matches this person's team played, most recent first, with their cards.
  const history = useMemo(() => {
    const rows = [];
    for (const r of results) {
      const side = r.teamA === p.team ? "A" : r.teamB === p.team ? "B" : null;
      if (!side) continue;
      const opp = side === "A" ? r.teamB : r.teamA;
      const my = side === "A" ? r.setsA : r.setsB;
      const th = side === "A" ? r.setsB : r.setsA;
      const cards = (r.cards || []).filter((c) => c.team === p.team && sameCard(c, p));
      rows.push({
        nr: r.nr, date: r.date, category: r.category, round: r.round,
        opp: String(opp || "").split(" - ")[0],
        score: `${my ?? 0}–${th ?? 0}`,
        result: r.status === "Finished" ? (my > th ? "W" : my < th ? "L" : "–") : "",
        status: r.status,
        y: cards.reduce((a, c) => a + (c.y || 0), 0),
        yr: cards.reduce((a, c) => a + (c.yr || 0), 0),
        r: cards.reduce((a, c) => a + (c.r || 0), 0),
      });
    }
    rows.sort((a, b) => (Number(b.nr) || 0) - (Number(a.nr) || 0));
    return rows;
  }, [results, p.team, p.name, p.first, p.nr]);
  const totals = useMemo(() => history.reduce(
    (t, h) => ({ y: t.y + h.y, yr: t.yr + h.yr, r: t.r + h.r }), { y: 0, yr: 0, r: 0 }
  ), [history]);
  const [grant, setGrant] = useState({ email: "", role: "official" });
  const [granting, setGranting] = useState(false);
  const [granted, setGranted] = useState("");
  const authorize = async () => {
    if (!grant.email.trim()) return;
    setGranting(true);
    try {
      await addMember({ email: grant.email, name: `${p.first} ${p.name}`.trim(), role: grant.role }, me);
      setGranted(`${grant.email} authorized as ${grant.role}.`);
      setGrant({ email: "", role: "official" });
    } catch (e) { setGranted("Failed: " + (e?.message || e)); }
    setGranting(false);
  };
  const facts = [
    p.kind === "player" && ["Number", p.nr],
    [p.kind === "player" ? "Position" : "Role", p.kind === "player" ? p.position : p.role],
    ["Team", p.team],
    p.birthday && ["Born", p.birthday + (age != null ? ` (${age})` : "")],
    p.height && ["Height", p.height + " cm"],
    p.matches && ["Nat. team caps", p.matches],
  ].filter(Boolean);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal person-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        {p.photo
          ? <img className="person-photo" src={p.photo} alt="" referrerPolicy="no-referrer" />
          : <div className="person-photo person-photo-ph">{(p.name || "?").trim()[0]}</div>}
        <h3 className="person-name">{p.first} {p.name}</h3>
        <div className="person-sub">{p.kind === "player" ? p.position : p.role} · <span className="flag">{flagFor(p.team)}</span>{p.team}</div>
        <div className="person-facts">
          {facts.map(([k, v]) => (
            <div className="person-fact" key={k}><span className="pf-k">{k}</span><span className="pf-v">{v}</span></div>
          ))}
        </div>
        <div className="person-history">
          <div className="subhead" style={{ marginTop: 14 }}>
            Match &amp; card history
            {(totals.y || totals.yr || totals.r) ? (
              <span style={{ marginLeft: 8 }}>
                {totals.y > 0 && <span className="chip y on">Y {totals.y}</span>}
                {totals.yr > 0 && <span className="chip yr on">YR {totals.yr}</span>}
                {totals.r > 0 && <span className="chip r on">R {totals.r}</span>}
              </span>
            ) : null}
          </div>
          {history.length === 0 ? (
            <p className="muted-sm">No matches recorded for {p.team} yet.</p>
          ) : (
            <div className="hist-list">
              {history.map((h) => (
                <div className="hist-row" key={h.nr}>
                  <span className="tag">#{h.nr}</span>
                  <span className="hist-opp">vs {h.opp}</span>
                  <span className="hist-score">{h.status === "Not Started" ? "—" : h.score}</span>
                  {h.result && <span className={`hist-res ${h.result === "W" ? "win" : h.result === "L" ? "loss" : ""}`}>{h.result}</span>}
                  <span className="hist-cards">
                    {h.y > 0 && <span className="chip y on">Y{h.y > 1 ? "×" + h.y : ""}</span>}
                    {h.yr > 0 && <span className="chip yr on">YR{h.yr > 1 ? "×" + h.yr : ""}</span>}
                    {h.r > 0 && <span className="chip r on">R{h.r > 1 ? "×" + h.r : ""}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="person-grant">
            <div className="subhead">Give access</div>
            <p className="muted-sm">Authorize this person as a member of the event.</p>
            <div className="add-row" style={{ flexWrap: "wrap" }}>
              <input style={{ flex: "2 1 160px" }} value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} placeholder="email@example.com" />
              <select value={grant.role} onChange={(e) => setGrant({ ...grant, role: e.target.value })}>
                <option value="admin">admin</option><option value="official">official</option><option value="viewer">viewer</option>
              </select>
              <button className="btn primary" disabled={granting || !grant.email.trim()} onClick={authorize}>Authorize</button>
            </div>
            {granted && <p className="muted-sm">{granted}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
