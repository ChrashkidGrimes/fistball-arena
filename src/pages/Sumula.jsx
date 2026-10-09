import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { pdf } from "@react-pdf/renderer";
import {
  ensureReport, subscribeReport, acquireLock, releaseLock, heartbeat,
  adminUnlock, reopenReport, saveReport, submitReport, fetchTeamRosters, buildReportSeed,
  subscribeReferees, resetReport,
} from "../cloud.js";
import SumulaPDF from "../pdf/SumulaPDF.jsx";
import { flagFor } from "../flags.js";
import { useEvent } from "../eventContext.js";
import { overlayUrl } from "../broadcast.js";

const SECTIONS = [
  ["info", "Info"],
  ["lineup", "Line-ups"],
  ["score", "Score"],
  ["refs", "Referees"],
  ["finish", "Finish"],
];

export default function Sumula({ me }) {
  const { id } = useParams();
  const nav = useNavigate();
  const { eventId, canScore, isAdmin, branding, archived } = useEvent();
  const [draft, setDraft] = useState(null);
  const [lockedBy, setLockedBy] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [section, setSection] = useState("info");
  const [team, setTeam] = useState("teamA");
  const [saving, setSaving] = useState(false);
  const holdRef = useRef(false);
  const draftRef = useRef(null);
  const saveTimer = useRef(null);

  const [refNames, setRefNames] = useState([]);
  useEffect(() => subscribeReferees((list) =>
    setRefNames([...new Set(list.map((r) => [r.first, r.name].filter(Boolean).join(" ").trim()).filter(Boolean))].sort())
  ), []);

  const iHold = !!lockedBy && lockedBy.uid === me.uid;
  const readOnly = !iHold || submitted || !canScore;

  useEffect(() => {
    let unsub, cancelled = false;
    const seedReadOnly = () => {
      if (draftRef.current) return;
      buildReportSeed(id).then((seed) => {
        if (cancelled || draftRef.current || !seed) return;
        const d = extractDraft(seed);
        draftRef.current = d;
        setDraft(d);
      }).catch((e) => console.warn("Could not build a read-only view:", e?.code || e));
    };
    (async () => {
      // Creating/locking a report is a WRITE — never let it block viewing. If it
      // fails (event not active, no permission…), fall through to a read-only view.
      if (canScore) {
        try {
          await ensureReport(id);
          await acquireLock(id, me);
        } catch (e) { console.warn("Scoring lock unavailable — opening read-only:", e?.code || e); }
      }
      unsub = subscribeReport(id, (data) => {
        if (!data) {
          // No report doc (archived / imported past event): render read-only from the game itself.
          seedReadOnly();
          return;
        }
        setLockedBy(data.lockedBy || null);
        const done = data.status === "submitted";
        setSubmitted(done);
        const holding = !!data.lockedBy && data.lockedBy.uid === me.uid;
        holdRef.current = holding;
        // Load the doc on first load, or keep live-viewing when we don't hold the lock.
        if (!draftRef.current || !holding || done) {
          const d = extractDraft(data);
          draftRef.current = d;
          setDraft(d);
        }
      });
    })();
    const hb = setInterval(() => { if (holdRef.current) heartbeat(id, me); }, 20000);
    return () => {
      cancelled = true;
      clearInterval(hb);
      if (unsub) unsub();
      if (holdRef.current) releaseLock(id, me);
    };
    // Re-run when canScore flips (e.g. the event was just re-activated) so the
    // scoring lock is acquired without needing a manual page reload.
  }, [id, canScore]);

  function update(mutator) {
    if (readOnly) return;
    setDraft((cur) => {
      const next = structuredClone(cur);
      mutator(next);
      draftRef.current = next;
      setSaving(true);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveReport(id, me, pickSumula(next)).then(() => setSaving(false));
      }, 400);
      return next;
    });
  }

  const scoring = useMemo(() => computeScore(draft), [draft]);

  // Pull both line-ups fresh from the roster registry (for reports created before
  // the registry was imported, or to get updated players/photos).
  async function loadRoster() {
    if (readOnly) return;
    const cur = draftRef.current;
    const map = await fetchTeamRosters([cur.teamA.name, cur.teamB.name], cur.info?.category);
    if (!Object.keys(map).length) { alert("No roster found for these teams. Import players in the Teams page first."); return; }
    update((n) => {
      for (const side of ["teamA", "teamB"]) {
        const r = map[n[side].name];
        if (!r) continue;
        n[side].players = (r.players || []).map((p) => ({
          nr: p.nr, name: p.name, first: p.first, photo: p.photo || "",
          captain: false, onCourt: false, cards: { y: false, yr: false, r: false },
        }));
        n[side].staff = (r.staff || []).map((s) => ({
          role: s.role, name: s.name, first: s.first, photo: s.photo || "",
          cards: { y: false, yr: false, r: false },
        }));
      }
    });
  }

  async function downloadPDF() {
    const blob = await pdf(<SumulaPDF draft={draft} branding={branding} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Game-Report-${draft.info.nr}-${short(draft.teamA.name)}-vs-${short(draft.teamB.name)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Clear just this game's report (admins). Leaves the page so it reopens clean.
  async function resetThis() {
    if (!window.confirm(`Reset game report #${draft.info.nr}? This deletes its scores, cards, line-up choices and signatures and sets it back to “Not Started”. Other games are kept. This cannot be undone.`)) return;
    clearTimeout(saveTimer.current);
    holdRef.current = false; // the report is deleted — don't try to release a lock on it
    try {
      const { kept } = await resetReport(id);
      if (kept.length) alert(`Report reset. Note: game${kept.length > 1 ? "s" : ""} #${kept.join(", #")} already started with the team this game had advanced — check ${kept.length > 1 ? "them" : "it"} manually.`);
      nav(`/e/${eventId}`);
    } catch (e) { alert("Reset failed: " + (e?.message || e)); }
  }

  // Admin-only amendment of a submitted report (e.g. a card removed after review).
  async function reopenToAmend() {
    const reason = window.prompt("Reason for amending this submitted report (e.g. “Yellow card #7 removed after review”):", "");
    if (reason === null) return;
    if (!reason.trim()) { alert("Please give a reason — it is logged on the report."); return; }
    try { await reopenReport(id, me, reason.trim()); await acquireLock(id, me); }
    catch (e) { alert("Could not reopen: " + (e?.message || e)); }
  }

  async function copyOverlay() {
    const url = overlayUrl(eventId, { game: id });
    try { await navigator.clipboard.writeText(url); alert("Broadcast link copied:\n" + url); }
    catch (_) { window.prompt("Broadcast link (copy it):", url); }
  }

  if (!draft) return <div className="empty">Loading…</div>;

  return (
    <>
      <div className="page-h game-h">
        <button className="iconbtn" onClick={() => nav(`/e/${eventId}`)}>‹ Games</button>
        <div>
          <div className="gh-title">#{draft.info.nr} · {short(draft.teamA.name)} vs {short(draft.teamB.name)}</div>
          <div className="gh-sub">{draft.info.time} · Court {draft.info.court} · Best of {draft.info.bestOf}</div>
        </div>
        <div className="gh-actions">
          <button className="btn sm" onClick={copyOverlay} title="Copy the live scoreboard link for this game (OBS/vMix browser source)">📺 Broadcast link</button>
          {isAdmin && !archived && (
            <button className="btn danger sm" onClick={resetThis} title="Clear only this game report">Reset this report</button>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="lockbar">
          <span>
            {submitted
              ? `✓ This report was submitted — read only.${isAdmin ? "" : " Only an event admin can amend it."}`
              : archived
                ? "📦 This event is archived — read only. Re-activate it in Settings → Event status to score."
                : !canScore
                  ? "👁 Read only — you don’t have scoring access for this event."
                  : lockedBy && lockedBy.uid !== me.uid
                    ? `🔒 Being scored by ${lockedBy?.name || "another official"} — read only.`
                    : "🔓 Read only — reload the page to start scoring (the lock wasn’t acquired)."}
          </span>
          {me.admin && !submitted && !archived && lockedBy && lockedBy.uid !== me.uid && (
            <button className="btn danger sm" onClick={() => adminUnlock(id)}>Admin unlock</button>
          )}
          {isAdmin && submitted && !archived && (
            <button className="btn sm" onClick={reopenToAmend} title="Event admins only — logged with your name and the reason">Reopen to amend</button>
          )}
          {archived && me.admin && (
            <button className="btn sm" onClick={() => nav(`/e/${eventId}/settings`)}>Open Settings</button>
          )}
        </div>
      )}

      <nav className="steps">
        {SECTIONS.map(([k, label]) => (
          <button key={k} className={`step ${section === k ? "active" : ""}`} onClick={() => setSection(k)}>
            {label}
          </button>
        ))}
      </nav>

      <div>
        {section === "info" && <InfoSection d={draft} />}
        {section === "lineup" && (
          <LineupSection d={draft} team={team} setTeam={setTeam} update={update} loadRoster={loadRoster} readOnly={readOnly} />
        )}
        {section === "score" && <ScoreSection d={draft} scoring={scoring} update={update} readOnly={readOnly} />}
        {section === "refs" && <RefsSection d={draft} update={update} refNames={refNames} />}
        {section === "finish" && <FinishSection d={draft} scoring={scoring} update={update} onPdf={downloadPDF} />}
      </div>

      <div className="bottombar">
        <span className="status">
          {submitted ? "✓ Submitted" : readOnly ? "Read only" : saving ? "Saving…" : "✓ Saved (live)"}
        </span>
        {section !== "finish" ? (
          <button className="btn primary" onClick={() => setSection(nextSection(section))}>Next ›</button>
        ) : (
          <button className="btn primary" disabled={readOnly} onClick={() => submitReport(id, me)}>
            {submitted ? "Submitted" : "Submit report"}
          </button>
        )}
      </div>
    </>
  );
}

/* ---------------- sections ---------------- */

function InfoSection({ d }) {
  const rows = [
    ["Match Nr", "#" + d.info.nr],
    ["Date", d.info.date],
    ["Time", d.info.time],
    ["Court", d.info.court],
    ["Round", d.info.round],
    ["Category", d.info.category],
    ["Best of", d.info.bestOf],
    ["Team A", d.teamA.name],
    ["Team B", d.teamB.name],
  ];
  return (
    <div className="card">
      <h2>Match information</h2>
      <div className="grid2">
        {rows.map(([k, v]) => (
          <div className="field" key={k}>
            <label>{k}</label>
            <div className="readonly">{v}</div>
          </div>
        ))}
      </div>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>
        Round &amp; category come from the schedule; the rest is filled in the next tabs.
      </p>
    </div>
  );
}

function PlayerAvatar({ src, name }) {
  const [err, setErr] = useState(false);
  if (src && !err) return <img className="avatar" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setErr(true)} />;
  return <span className="avatar avatar-ph">{(name || "?").trim()[0]}</span>;
}

function LineupSection({ d, team, setTeam, update, loadRoster, readOnly }) {
  const t = d[team];
  const toggleCaptain = (i) =>
    update((n) => n[team].players.forEach((p, j) => (p.captain = j === i ? !p.captain : false)));
  const toggleOC = (i) => update((n) => (n[team].players[i].onCourt = !n[team].players[i].onCourt));
  const toggleCard = (list, i, kind) =>
    update((n) => (n[team][list][i].cards[kind] = !n[team][list][i].cards[kind]));

  return (
    <>
      <div className="team-tabs">
        <button className={`team-tab ${team === "teamA" ? "active" : ""}`} onClick={() => setTeam("teamA")}>
          <span className="flag">{flagFor(d.teamA.name)}</span>{short(d.teamA.name)}
        </button>
        <button className={`team-tab ${team === "teamB" ? "active" : ""}`} onClick={() => setTeam("teamB")}>
          <span className="flag">{flagFor(d.teamB.name)}</span>{short(d.teamB.name)}
        </button>
      </div>

      <div className="card">
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Players — tap C (captain), OC (on court), or a card</h2>
          {!readOnly && <button className="btn sm" onClick={loadRoster} title="Fill both line-ups from the Teams registry">↻ Load roster</button>}
        </div>
        <div style={{ height: 12 }} />
        {t.players.length === 0 && (
          <div className="warn-box" style={{ marginBottom: 10 }}>
            ⚠️ No line-up loaded for {short(t.name)}.{" "}
            {readOnly
              ? "Read-only access — the roster couldn't be loaded (event archived or you're not a member of this event)."
              : "Import the squads (Players & staff → Excel), make sure the team names match, then tap ↻ Load roster."}
          </div>
        )}
        {t.players.map((p, i) => (
          <div className="player" key={i}>
            <div className="player-id">
              <PlayerAvatar src={p.photo} name={p.name} />
              <div className="pnr">{p.nr}</div>
              <div className="pname">
                <div className="sur">{p.name}</div>
                <div className="giv">{p.first}</div>
              </div>
            </div>
            <div className="player-controls">
              <button className={`chip cap ${p.captain ? "on" : ""}`} onClick={() => toggleCaptain(i)}>C</button>
              <button className={`chip oc ${p.onCourt ? "on" : ""}`} onClick={() => toggleOC(i)}>OC</button>
              <div className="card-chips">
                {["y", "yr", "r"].map((k) => (
                  <button key={k} className={`chip ${k} ${p.cards[k] ? "on" : ""}`} onClick={() => toggleCard("players", i, k)}>
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}

        {t.staff.length > 0 && <div className="subhead">Staff</div>}
        {t.staff.map((s, i) => (
          <div className="player" key={i}>
            <div className="player-id">
              <PlayerAvatar src={s.photo} name={s.name} />
              <div className="prole">{s.role}</div>
              <div className="pname">
                <div className="sur">{s.name}</div>
                <div className="giv">{s.first}</div>
              </div>
            </div>
            <div className="player-controls">
              <div className="card-chips">
                {["y", "yr", "r"].map((k) => (
                  <button key={k} className={`chip ${k} ${s.cards[k] ? "on" : ""}`} onClick={() => toggleCard("staff", i, k)}>
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ScoreSection({ d, scoring, update, readOnly }) {
  const [cur, setCur] = useState(() => {
    const i = d.sets.findIndex((s) => !(s.rallies && s.rallies.length));
    return i === -1 ? d.sets.length - 1 : i;
  });
  const scroller = useRef(null);
  const [selCol, setSelCol] = useState(null);   // rally being corrected
  const set = d.sets[cur] || { rallies: [] };
  const rallies = set.rallies || [];
  const { a, b } = setScore(set);

  useEffect(() => {
    const el = scroller.current;
    if (el && selCol == null) el.scrollLeft = el.scrollWidth;
  }, [rallies.length, cur, selCol]);
  useEffect(() => setSelCol(null), [cur]);

  const addPoint = (w) => update((n) => {
    if (!n.sets[cur].rallies) n.sets[cur].rallies = [];
    n.sets[cur].rallies.push(w);
  });
  const undo = () => update((n) => { if (n.sets[cur].rallies) n.sets[cur].rallies.pop(); });
  const setRally = (i, w) => { update((n) => { n.sets[cur].rallies[i] = w; }); setSelCol(null); };
  const removeRally = (i) => { update((n) => { n.sets[cur].rallies.splice(i, 1); }); setSelCol(null); };
  const setBall = (which, val) => update((n) => (n.ballChoice[which] = val));
  const addTimeout = (side) => update((n) => {
    if (!n.timeouts) n.timeouts = { teamA: [], teamB: [] };
    (n.timeouts[side] = n.timeouts[side] || []).push({ set: cur, a, b });
  });
  const removeTimeout = (side, i) => update((n) => n.timeouts[side].splice(i, 1));

  // Build the two paper rows: the scorer's running number, "/" on the other side.
  const rowA = [], rowB = [];
  let ca = 0, cb = 0;
  for (const w of rallies) {
    if (w === "A") { ca++; rowA.push(String(ca)); rowB.push("/"); }
    else { cb++; rowB.push(String(cb)); rowA.push("/"); }
  }

  return (
    <div className="card">
      <div className="set-pills">
        {d.sets.map((s, i) => {
          const sc = setScore(s);
          const played = sc.a + sc.b > 0;
          return (
            <button key={i} className={`set-pill ${i === cur ? "active" : ""}`} onClick={() => setCur(i)}>
              <span className="sp-label">Set {i + 1}</span>
              <span className="sp-score">{played ? `${sc.a}:${sc.b}` : "–"}</span>
            </button>
          );
        })}
      </div>

      <div className="score-big">
        <span className={a > b ? "lead" : ""}>{a}</span>
        <span className="colon">:</span>
        <span className={b > a ? "lead" : ""}>{b}</span>
      </div>

      <div className="rally" ref={scroller}>
        <div className="rally-row">
          <div className="rally-team">{short(d.teamA.name)}</div>
          <div className="rally-cells">
            {rowA.length === 0 && <span className="cell x">·</span>}
            {rowA.map((c, i) => (
              <button key={i} className={`cell ${c === "/" ? "x" : ""} ${selCol === i ? "sel" : ""}`} onClick={() => setSelCol(selCol === i ? null : i)}>{c}</button>
            ))}
          </div>
        </div>
        <div className="rally-row">
          <div className="rally-team">{short(d.teamB.name)}</div>
          <div className="rally-cells">
            {rowB.length === 0 && <span className="cell x">·</span>}
            {rowB.map((c, i) => (
              <button key={i} className={`cell ${c === "/" ? "x" : ""} ${selCol === i ? "sel" : ""}`} onClick={() => setSelCol(selCol === i ? null : i)}>{c}</button>
            ))}
          </div>
        </div>
      </div>
      {rallies.length > 0 && selCol == null && (
        <p className="hint">Tapped the wrong side? Tap that point in the record to fix it.</p>
      )}

      {selCol != null && (
        <div className="correct-bar">
          <span className="cb-label">Rally {selCol + 1} — who scored?</span>
          <div className="cb-actions">
            <button className="btn" onClick={() => setRally(selCol, "A")}>{short(d.teamA.name)}</button>
            <button className="btn" onClick={() => setRally(selCol, "B")}>{short(d.teamB.name)}</button>
            <button className="btn danger" onClick={() => removeRally(selCol)}>✕ Remove</button>
            <button className="btn ghost" onClick={() => setSelCol(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="point-buttons">
        <button className="pt a" onClick={() => addPoint("A")}>
          <span className="pt-team">{short(d.teamA.name)}</span>
          <span className="pt-plus">+ point</span>
        </button>
        <button className="pt b" onClick={() => addPoint("B")}>
          <span className="pt-team">{short(d.teamB.name)}</span>
          <span className="pt-plus">+ point</span>
        </button>
      </div>
      <button className="btn undo" onClick={undo} disabled={!rallies.length}>↶ Undo last point</button>

      <div className="tally">
        <div className={`t ${scoring.setsA > scoring.setsB ? "lead" : ""}`}><div className="n">{scoring.setsA}</div><div>sets</div></div>
        <div className={`t ${scoring.setsB > scoring.setsA ? "lead" : ""}`}><div className="n">{scoring.setsB}</div><div>sets</div></div>
      </div>
      {scoring.winner && (
        <p style={{ textAlign: "center", fontWeight: 800, color: "var(--win)" }}>
          Winner: {short(scoring.winner === "A" ? d.teamA.name : d.teamB.name)}
        </p>
      )}

      <div className="subhead">Time-outs <span className="muted-sm" style={{ fontWeight: 400 }}>(records the set &amp; score at the moment)</span></div>
      <div className="to-panel">
        {["teamA", "teamB"].map((side) => (
          <div className="to-team" key={side}>
            <div className="to-head">
              <span className="to-name">{short(d[side].name)}</span>
              {!readOnly && <button className="btn sm" onClick={() => addTimeout(side)}>+ Time-out</button>}
            </div>
            <div className="to-chips">
              {(d.timeouts?.[side] || []).map((t, i) => (
                <span className="to-chip" key={i}>S{(t.set ?? 0) + 1} · {t.a}:{t.b}{!readOnly && <button className="to-x" onClick={() => removeTimeout(side, i)}>✕</button>}</span>
              ))}
              {!(d.timeouts?.[side] || []).length && <span className="muted-sm">none</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="subhead">Choice of ball / serve</div>
      {["set1", "set5"].map((w) => (
        <div className="field" key={w}>
          <label>{w === "set1" ? "1st set" : "Deciding set"}</label>
          <div className="seg">
            <button className={d.ballChoice[w] === "A" ? "on" : ""} onClick={() => setBall(w, "A")}>{short(d.teamA.name)}</button>
            <button className={d.ballChoice[w] === "B" ? "on" : ""} onClick={() => setBall(w, "B")}>{short(d.teamB.name)}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RefsSection({ d, update, refNames = [] }) {
  const fields = [
    ["r1", "Referee 1"], ["r2", "Referee 2"], ["clerk", "Recording Clerk"],
    ["a1", "Assistant 1"], ["a2", "Assistant 2"],
  ];
  return (
    <div className="card">
      <h2>Referee team</h2>
      <p className="muted-sm" style={{ marginTop: -6 }}>Pre-filled from the referees assigned to this game (Referees screen). Pick from the list or type a name.</p>
      <datalist id="sumula-ref-names">{refNames.map((n) => <option key={n} value={n} />)}</datalist>
      {fields.map(([k, label]) => (
        <div className="field" key={k}>
          <label>{label}</label>
          <input
            list="sumula-ref-names"
            value={d.referees[k]}
            onChange={(e) => update((n) => (n.referees[k] = e.target.value))}
            placeholder="Name"
          />
        </div>
      ))}
    </div>
  );
}

function FinishSection({ d, scoring, update, onPdf }) {
  const sign = (k) => update((n) => (n.signatures[k] = !n.signatures[k]));
  return (
    <>
      <div className="card">
        <h2>Summary</h2>
        <p style={{ fontSize: 18, fontWeight: 700 }}>
          {short(d.teamA.name)} {scoring.setsA} × {scoring.setsB} {short(d.teamB.name)}
        </p>
        <p style={{ color: "var(--muted)" }}>
          {d.sets.map((s) => { const { a, b } = setScore(s); return a + b ? `${a}:${b}` : null; }).filter(Boolean).join("  ·  ") || "No sets recorded yet"}
        </p>
      </div>

      {(d.amendments || []).length > 0 && (
        <div className="card">
          <h2>Amended after submission</h2>
          {d.amendments.map((a, i) => (
            <p key={i} style={{ margin: "4px 0" }}>
              <strong>{new Date(a.at).toLocaleString()}</strong> · {a.by} — {a.reason || "—"}
            </p>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Remarks / extraordinary events</h2>
        <div className="field">
          <textarea rows={3} value={d.remarks} onChange={(e) => update((n) => (n.remarks = e.target.value))} placeholder="Protests, incidents, notes…" />
        </div>
        <div className="field">
          <label>Responsible person</label>
          <input value={d.responsible} onChange={(e) => update((n) => (n.responsible = e.target.value))} placeholder="Name" />
        </div>
      </div>

      <div className="card">
        <h2>Signatures (confirm)</h2>
        {[
          ["capA", `Captain — ${short(d.teamA.name)}`],
          ["capB", `Captain — ${short(d.teamB.name)}`],
          ["referee", "Referee"],
          ["clerk", `Recording Clerk${d.referees?.clerk ? ` — ${d.referees.clerk}` : ""}`],
        ].map(([k, label]) => (
          <div className="toggle-row" key={k}>
            <span>{label}</span>
            <button className={`switch ${d.signatures[k] ? "on" : ""}`} onClick={() => sign(k)}>
              {d.signatures[k] ? "Signed" : "Sign"}
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Game report PDF</h2>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Generates the full game report (súmula) in the tournament layout — to save, print or e-mail.
        </p>
        <button className="btn primary" style={{ width: "100%" }} onClick={onPdf}>⬇ Download PDF</button>
      </div>
    </>
  );
}

/* ---------------- helpers ---------------- */

function short(name) {
  return (name || "").split(" - ")[0];
}

// The report doc <-> editable súmula draft.
function extractDraft(data) {
  return {
    info: data.info,
    teamA: data.teamA,
    teamB: data.teamB,
    sets: data.sets,
    timeouts: data.timeouts || { teamA: [], teamB: [] },
    ballChoice: data.ballChoice || { set1: "", set5: "" },
    referees: data.referees || { r1: "", r2: "", clerk: "", a1: "", a2: "" },
    remarks: data.remarks || "",
    responsible: data.responsible || "",
    signatures: { capA: false, capB: false, referee: false, clerk: false, ...(data.signatures || {}) },
    submittedAt: data.submittedAt || null,
    amendments: data.amendments || [],
  };
}
function pickSumula(d) {
  return {
    info: d.info, teamA: d.teamA, teamB: d.teamB, sets: d.sets,
    timeouts: d.timeouts || { teamA: [], teamB: [] },
    ballChoice: d.ballChoice, referees: d.referees,
    remarks: d.remarks, responsible: d.responsible, signatures: d.signatures,
  };
}

function nextSection(cur) {
  const i = SECTIONS.findIndex(([k]) => k === cur);
  return SECTIONS[Math.min(i + 1, SECTIONS.length - 1)][0];
}

function setScore(s) {
  const r = (s && s.rallies) || [];
  let a = 0, b = 0;
  for (const x of r) { if (x === "A") a++; else if (x === "B") b++; }
  return { a, b };
}

// A set ends at 11 with a 2-point lead, or at 15.
const setOver = ({ a, b }) => (Math.max(a, b) >= 11 && Math.abs(a - b) >= 2) || Math.max(a, b) >= 15;

// Sets won — like Fistball Live and the broadcast overlay, the set being played
// isn't counted until it's over. Sets before the last played one count as over.
function computeScore(d) {
  if (!d) return { setsA: 0, setsB: 0, winner: null };
  let setsA = 0, setsB = 0;
  const played = d.sets.map(setScore).filter(({ a, b }) => a + b > 0);
  played.forEach((sc, i) => {
    if (i === played.length - 1 && !setOver(sc)) return;
    if (sc.a > sc.b) setsA++; else if (sc.b > sc.a) setsB++;
  });
  const need = Math.floor((d.info.bestOf) / 2) + 1;
  const winner = setsA >= need ? "A" : setsB >= need ? "B" : null;
  return { setsA, setsB, winner };
}
