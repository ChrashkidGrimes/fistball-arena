import { useMemo, useRef, useState } from "react";
import { addReferee, updateReferee, deleteReferee } from "../cloud.js";
import { OFFICIAL_ROLES, ROLE_LABEL, RANKS, RANK_LABEL, rankOf, AVAIL_STATUS, availabilityOn, rolesOf } from "../officials/model.js";
import { flagFor } from "../flags.js";

const ROLE_TITLE = { referee: "Referee 1 / 2", clerk: "Clerk (scorer)", assistant: "Assistant 1 / 2 (line judge)", courtManager: "Court manager (may cover several courts at once)" };
const STATUS_LABEL = { available: "✓ available", reserve: "reserve", unavailable: "✕ away" };
const refName = (r) => [r.first, r.name].filter(Boolean).join(" ").trim();
const NONE = "\u0000none"; // filter value for "field is empty"
const NO_FILTER = { q: "", roles: [], rank: "", gender: "", country: "", club: "", partner: "", max: "", day: {} };
const low = (v) => String(v ?? "").trim().toLowerCase();

// Officials registry editor on the Referees page: roles, nation / club (conflict
// checks), gender, assistant partner and per-day availability. Saved automatically.
// See docs/referee-assignment-spec.md §2.1.
export default function OfficialsCard({ refs, days, dayLabel, teamNations, archived }) {
  const [local, setLocal] = useState({});     // id -> patch (optimistic overlay)
  const [fam, setFam] = useState("");
  const [giv, setGiv] = useState("");
  const [flt, setFlt] = useState(NO_FILTER);
  const timers = useRef({});
  const pending = useRef({});

  const rows = useMemo(() => [...refs].sort((a, b) => refName(a).localeCompare(refName(b))), [refs]);

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
    const have = rolesOf(cur(r));
    const next = OFFICIAL_ROLES.filter((x) => (x === role ? !have.includes(x) : have.includes(x)));
    save(r, { roles: next.length ? next : "" }, 0); // none ticked = any slot
  };
  // Availability map without "available, any time" entries (= the default).
  // A day's entry: status plus an optional window (from / to). "Available,
  // all day" is the default and isn't stored. (Older start-time lists are dropped
  // once the day is edited.)
  const setAvail = (r, date, upd) => {
    const map = { ...(cur(r).availability || {}) };
    const { status, from, to } = { ...availabilityOn(cur(r), date), ...upd };
    if (from && to && from >= to) return; // impossible window — ignore
    const entry = { status, ...(from ? { from } : {}), ...(to ? { to } : {}) };
    if (status === "available" && !from && !to) delete map[date];
    else map[date] = entry;
    save(r, { availability: map }, 0);
  };

  // Assistant partner: picked as a person, stored as a shared assistantPair label on both
  // (rules, auto-assign and the import work with the label).
  const canAssist = (r) => rolesOf(r).includes("assistant");
  const partnersOf = (r) => { const p = cur(r).assistantPair; return p ? rows.filter((x) => x.id !== r.id && cur(x).assistantPair === p) : []; };
  const setPartner = (r, partnerId) => {
    const p = rows.find((x) => x.id === partnerId);
    // Whoever either of them was paired with before is left without a partner.
    for (const x of [r, p].filter(Boolean)) {
      for (const old of partnersOf(x)) if (old.id !== r.id && old.id !== p?.id) save(old, { assistantPair: "" }, 0);
    }
    if (!p) { save(r, { assistantPair: "" }, 0); return; }
    const label = [r.id, p.id].sort().join("+");
    save(r, { assistantPair: label }, 0);
    save(p, { assistantPair: label }, 0);
  };

  // Column filters (all must match). Values come from the current (edited) rows.
  const setF = (patch) => setFlt((f) => ({ ...f, ...patch }));
  const distinct = (key) => [...new Map(rows.map((x) => String(cur(x)[key] ?? "").trim()).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()].sort((a, b) => a.localeCompare(b));
  const nations = distinct("country"), clubs = distinct("club");
  const filterOn = JSON.stringify(flt) !== JSON.stringify(NO_FILTER);
  const pick = (want, value) => !want || (want === NONE ? !low(value) : low(value) === low(want));
  const matches = (r0) => {
    const r = cur(r0);
    if (flt.q && !low(refName(r)).includes(low(flt.q))) return false;
    if (flt.roles.length && !flt.roles.some((x) => rolesOf(r).includes(x))) return false;
    if (flt.rank && rankOf(r) !== flt.rank) return false;
    if (flt.gender && (flt.gender === NONE ? r.gender : r.gender !== flt.gender)) return false;
    if (!pick(flt.country, r.country) || !pick(flt.club, r.club)) return false;
    if (flt.partner && (partnersOf(r0).length > 0) !== (flt.partner === "yes")) return false;
    if (flt.max && (r.maxPerDay ? "set" : "empty") !== flt.max) return false;
    return days.every((d) => !flt.day[d] || availabilityOn(r, d).status === flt.day[d]);
  };
  const shown = rows.filter(matches);

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
      <p className="muted-sm">Who may fill which slot, conflicts (referees never get games of their own nation; referees, assistants and clerks never get games of their own club), and availability per day. Empty roles = any slot; no entry for a day = available all day. Assistant partners always work the lines together. Saved automatically.</p>
      <datalist id="of-nations">{teamNations.map((n) => <option key={n} value={n} />)}</datalist>
      {filterOn && <p className="muted-sm of-count">{shown.length} of {rows.length} shown · <button className="link-btn" onClick={() => setFlt(NO_FILTER)}>Clear filters</button></p>}
      <div className="grid-scroll">
        <table className="ref-grid of-grid">
          <thead>
            <tr>
              <th>Official</th><th>Roles</th><th title="Auto-assign gives a game a Referee 1 of at least the game's rank">Rank</th><th>Gender</th><th>Nation</th><th>Club</th><th>Assistant partner</th><th title="Max games per day (optional)">Max/day</th>
              {days.map((d) => <th key={d}>{dayLabel(d)}</th>)}
              <th aria-label="Remove" />
            </tr>
            {rows.length > 0 && (
              <tr className="of-filter">
                <th><input className="of-input" value={flt.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Filter name…" aria-label="Filter by name" /></th>
                <th><span className="of-roles">{OFFICIAL_ROLES.map((x) => (
                  <button key={x} className={`of-role ${flt.roles.includes(x) ? "on" : ""}`} title={`Only: ${ROLE_TITLE[x]}`} aria-pressed={flt.roles.includes(x)}
                    onClick={() => setF({ roles: flt.roles.includes(x) ? flt.roles.filter((y) => y !== x) : [...flt.roles, x] })}>{ROLE_LABEL[x]}</button>
                ))}</span></th>
                <th><select className="of-input of-sm" value={flt.rank} onChange={(e) => setF({ rank: e.target.value })} aria-label="Filter by rank">
                  <option value="">All</option>{RANKS.map((x) => <option key={x} value={x}>{RANK_LABEL[x]}</option>)}
                </select></th>
                <th><select className="of-input of-sm" value={flt.gender} onChange={(e) => setF({ gender: e.target.value })} aria-label="Filter by gender">
                  <option value="">All</option><option value="f">♀ f</option><option value="m">♂ m</option><option value={NONE}>— not set</option>
                </select></th>
                {[["country", nations, "nation"], ["club", clubs, "club"]].map(([key, list, what]) => (
                  <th key={key}><select className="of-input" value={flt[key]} onChange={(e) => setF({ [key]: e.target.value })} aria-label={`Filter by ${what}`}>
                    <option value="">All</option>
                    {list.map((v) => <option key={v} value={v}>{key === "country" ? `${flagFor(v)} ${v}`.trim() : v}</option>)}
                    <option value={NONE}>— none</option>
                  </select></th>
                ))}
                <th><select className="of-input" value={flt.partner} onChange={(e) => setF({ partner: e.target.value })} aria-label="Filter by assistant partner">
                  <option value="">All</option><option value="yes">With partner</option><option value="no">Without partner</option>
                </select></th>
                <th><select className="of-input of-xs" value={flt.max} onChange={(e) => setF({ max: e.target.value })} aria-label="Filter by max games per day">
                  <option value="">All</option><option value="set">Set</option><option value="empty">—</option>
                </select></th>
                {days.map((d) => (
                  <th key={d}><select className="of-input of-sm" value={flt.day[d] || ""} onChange={(e) => setF({ day: { ...flt.day, [d]: e.target.value } })} aria-label={`Filter by availability ${dayLabel(d)}`}>
                    <option value="">All</option>
                    {AVAIL_STATUS.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
                  </select></th>
                ))}
                <th>{filterOn && <button className="btn sm" onClick={() => setFlt(NO_FILTER)} title="Clear filters" aria-label="Clear filters">✕</button>}</th>
              </tr>
            )}
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td className="muted-sm" colSpan={9 + days.length}>No officials yet — import them via Players &amp; staff, or add one below.</td></tr>}
            {rows.length > 0 && shown.length === 0 && <tr><td className="muted-sm" colSpan={9 + days.length}>No officials match the filters.</td></tr>}
            {shown.map((r0) => {
              const r = cur(r0);
              const roles = rolesOf(r);
              return (
                <tr key={r.id}>
                  <td className="of-name"><span className="flag">{flagFor(r.country)}</span>{refName(r) || <span className="muted-sm">—</span>}</td>
                  <td><span className="of-roles">{OFFICIAL_ROLES.map((x) => (
                    <button key={x} className={`of-role ${roles.includes(x) ? "on" : ""}`} disabled={archived} title={ROLE_TITLE[x]} onClick={() => toggleRole(r0, x)}>{ROLE_LABEL[x]}</button>
                  ))}</span></td>
                  <td>
                    <select className="of-input of-sm" value={rankOf(r)} disabled={archived || !(roles.includes("referee") || roles.includes("assistant"))} onChange={(e) => save(r0, { rank: e.target.value === "normal" ? "" : e.target.value }, 0)}
                      aria-label="Rank" title={roles.includes("referee") || roles.includes("assistant") ? undefined : "Only for referees and assistants"}>
                      {RANKS.map((x) => <option key={x} value={x}>{RANK_LABEL[x]}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="of-input of-sm" value={r.gender || ""} disabled={archived} onChange={(e) => save(r0, { gender: e.target.value }, 0)} aria-label="Gender">
                      <option value="">—</option><option value="f">♀ f</option><option value="m">♂ m</option>
                    </select>
                  </td>
                  <td><input className="of-input" list="of-nations" value={r.country || ""} disabled={archived} onChange={(e) => save(r0, { country: e.target.value })} placeholder="—" aria-label="Nation" /></td>
                  <td><input className="of-input" value={r.club || ""} disabled={archived} onChange={(e) => save(r0, { club: e.target.value })} placeholder="—" aria-label="Club" /></td>
                  <td>{(() => {
                    const ps = partnersOf(r0), v = ps[0]?.id || "";
                    return (
                      <select className="of-input" value={v} disabled={archived || !canAssist(r)} onChange={(e) => setPartner(r0, e.target.value)} aria-label="Assistant partner"
                        title={ps.length > 1 ? `Shared with ${ps.map((x) => refName(x)).join(", ")} — pick one partner` : canAssist(r) ? undefined : "Only for assistants (line judges)"}>
                        <option value="">—</option>
                        {rows.filter((x) => x.id !== r.id && (canAssist(cur(x)) || x.id === v)).map((x) => <option key={x.id} value={x.id}>{refName(x)}</option>)}
                      </select>
                    );
                  })()}</td>
                  <td><input className="of-input of-xs" type="number" min="1" value={r.maxPerDay ?? ""} disabled={archived} onChange={(e) => save(r0, { maxPerDay: e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10) || 1) })} placeholder="—" aria-label="Max games per day" /></td>
                  {days.map((d) => {
                    const a = availabilityOn(r, d);
                    return (
                      <td key={d} className={`of-day of-${a.status}`}>
                        <select className="of-input of-sm" value={a.status} disabled={archived} onChange={(e) => setAvail(r0, d, { status: e.target.value })} aria-label={`Availability ${dayLabel(d)}`}>
                          {AVAIL_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                        {a.status !== "unavailable" && (
                          <span className="of-window" title="Only between these times — the whole game has to fit. Empty = all day.">
                            <input type="time" className="of-input of-time" value={a.from} disabled={archived} onChange={(e) => setAvail(r0, d, { from: e.target.value })} aria-label={`Available from ${dayLabel(d)}`} />
                            <span className="muted-sm">–</span>
                            <input type="time" className="of-input of-time" value={a.to} disabled={archived} onChange={(e) => setAvail(r0, d, { to: e.target.value })} aria-label={`Available until ${dayLabel(d)}`} />
                          </span>
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
