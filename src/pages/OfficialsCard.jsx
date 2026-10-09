import { useMemo, useRef, useState } from "react";
import { addReferee, updateReferee, deleteReferee } from "../cloud.js";
import { OFFICIAL_ROLES, AVAIL_STATUS, availabilityOn, parseSlots } from "../officials/model.js";

const ROLE_TITLE = { SR: "Referee (R1/R2)", AS: "Scorer / clerk", LR: "Line judge (A1/A2)" };
const STATUS_LABEL = { available: "✓ available", reserve: "reserve", unavailable: "✕ away" };
const refName = (r) => [r.first, r.name].filter(Boolean).join(" ").trim();

// Officials registry editor on the Referees page: roles, nation / club (conflict
// checks), gender, LR pair and per-day availability. Saved automatically.
// See docs/referee-assignment-spec.md §2.1.
export default function OfficialsCard({ refs, days, dayLabel, teamNations, archived }) {
  const [local, setLocal] = useState({});     // id -> patch (optimistic overlay)
  const [slotText, setSlotText] = useState({}); // `${id}|${date}` -> raw text while typing
  const [fam, setFam] = useState("");
  const [giv, setGiv] = useState("");
  const timers = useRef({});
  const pending = useRef({});

  const rows = useMemo(() => [...refs].sort((a, b) => refName(a).localeCompare(refName(b))), [refs]);
  const pairs = useMemo(() => [...new Set(refs.map((r) => r.lrPair).filter(Boolean))].sort(), [refs]);

  const cur = (r) => ({ ...r, ...local[r.id] });
  const save = (r, patch, delay = 500) => {
    setLocal((p) => ({ ...p, [r.id]: { ...p[r.id], ...patch } }));
    pending.current[r.id] = { ...pending.current[r.id], ...patch };
    clearTimeout(timers.current[r.id]);
    timers.current[r.id] = setTimeout(async () => {
      const p = pending.current[r.id]; delete pending.current[r.id];
      try { await updateReferee(r.id, p); }
      catch (e) { alert(`Could not save ${refName(r)}: ` + (e?.code || e?.message || e)); }
    }, delay);
  };

  const toggleRole = (r, role) => {
    const have = cur(r).roles?.length ? cur(r).roles : OFFICIAL_ROLES;
    const next = OFFICIAL_ROLES.filter((x) => (x === role ? !have.includes(x) : have.includes(x)));
    save(r, { roles: next.length ? next : "" }, 0); // none ticked = any slot
  };
  // Availability map without "available, any time" entries (= the default).
  const setAvail = (r, date, upd) => {
    const map = { ...(cur(r).availability || {}) };
    const a = { ...availabilityOn(cur(r), date), ...upd };
    if (a.status === "available" && !a.slots.length) delete map[date];
    else map[date] = a.slots.length ? a : { status: a.status };
    save(r, { availability: map }, 0);
  };
  const commitSlots = (r, date) => {
    const k = `${r.id}|${date}`;
    if (slotText[k] === undefined) return;
    setAvail(r, date, { slots: parseSlots(slotText[k]) });
    setSlotText((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  const add = async () => {
    if (!fam.trim() && !giv.trim()) return;
    try { await addReferee({ name: fam.trim(), first: giv.trim() }); setFam(""); setGiv(""); }
    catch (e) { alert("Could not add official: " + (e?.code || e?.message || e)); }
  };
  const remove = async (r) => {
    if (!confirm(`Remove ${refName(r)} from the officials registry? Games they're assigned to keep the name.`)) return;
    try { await deleteReferee(r.id); } catch (e) { alert("Could not remove: " + (e?.code || e?.message || e)); }
  };

  return (
    <details className="adv-tool officials-card">
      <summary>Officials ({refs.length}) — roles, nation / club, availability</summary>
      <p className="muted-sm">Who may fill which slot, conflicts (referees never get games of their own nation or club; line judges are kept away from their own club where possible; for scorers neither matters), and availability per day. Empty roles = any slot; no entry for a day = available all day. Two people with the same LR pair always work the lines together. Saved automatically.</p>
      <datalist id="of-nations">{teamNations.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="of-pairs">{pairs.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="grid-scroll">
        <table className="ref-grid of-grid">
          <thead>
            <tr>
              <th>Official</th><th>Roles</th><th>Gender</th><th>Nation</th><th>Club</th><th>LR pair</th><th title="Max games per day (optional)">Max/day</th>
              {days.map((d) => <th key={d}>{dayLabel(d)}</th>)}
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td className="muted-sm" colSpan={8 + days.length}>No officials yet — import them via Players &amp; staff, or add one below.</td></tr>}
            {rows.map((r0) => {
              const r = cur(r0);
              const roles = r.roles?.length ? r.roles : OFFICIAL_ROLES;
              return (
                <tr key={r.id}>
                  <td className="of-name">{refName(r) || <span className="muted-sm">—</span>}</td>
                  <td><span className="of-roles">{OFFICIAL_ROLES.map((x) => (
                    <button key={x} className={`of-role ${roles.includes(x) ? "on" : ""}`} disabled={archived} title={ROLE_TITLE[x]} onClick={() => toggleRole(r0, x)}>{x}</button>
                  ))}</span></td>
                  <td>
                    <select className="of-input of-sm" value={r.gender || ""} disabled={archived} onChange={(e) => save(r0, { gender: e.target.value }, 0)} aria-label="Gender">
                      <option value="">—</option><option value="f">♀ f</option><option value="m">♂ m</option>
                    </select>
                  </td>
                  <td><input className="of-input" list="of-nations" value={r.country || ""} disabled={archived} onChange={(e) => save(r0, { country: e.target.value })} placeholder="—" aria-label="Nation" /></td>
                  <td><input className="of-input" value={r.club || ""} disabled={archived} onChange={(e) => save(r0, { club: e.target.value })} placeholder="—" aria-label="Club" /></td>
                  <td><input className="of-input of-sm" list="of-pairs" value={r.lrPair || ""} disabled={archived} onChange={(e) => save(r0, { lrPair: e.target.value })} placeholder="—" aria-label="LR pair" /></td>
                  <td><input className="of-input of-xs" type="number" min="1" value={r.maxPerDay ?? ""} disabled={archived} onChange={(e) => save(r0, { maxPerDay: e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10) || 1) })} placeholder="—" aria-label="Max games per day" /></td>
                  {days.map((d) => {
                    const a = availabilityOn(r, d);
                    const k = `${r.id}|${d}`;
                    return (
                      <td key={d} className={`of-day of-${a.status}`}>
                        <select className="of-input of-sm" value={a.status} disabled={archived} onChange={(e) => setAvail(r0, d, { status: e.target.value })} aria-label={`Availability ${dayLabel(d)}`}>
                          {AVAIL_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                        {a.status !== "unavailable" && (
                          <input className="of-input of-sm of-slots" value={slotText[k] ?? a.slots.join(", ")} disabled={archived}
                            onChange={(e) => setSlotText((p) => ({ ...p, [k]: e.target.value }))} onBlur={() => commitSlots(r0, d)}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                            placeholder="all times" title="Only these start times, e.g. 10:30, 11:45 — empty = all day" aria-label={`Start times ${dayLabel(d)}`} />
                        )}
                      </td>
                    );
                  })}
                  <td>{!archived && <button className="btn danger sm" onClick={() => remove(r0)} aria-label="Remove" title="Remove from registry">✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!archived && (
        <div className="add-row" style={{ marginTop: 10 }}>
          <input value={fam} onChange={(e) => setFam(e.target.value)} placeholder="Family name" />
          <input value={giv} onChange={(e) => setGiv(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Given name" />
          <button className="btn sm" onClick={add}>Add official</button>
        </div>
      )}
    </details>
  );
}
