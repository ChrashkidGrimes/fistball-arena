import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  setEventStatus, subscribeLivePointer, setLiveEvent, clearLiveEvent,
  subscribeLogos, addLogo, deleteLogo, subscribeTeamLogos, setTeamLogo, saveBranding, updateEventDetails, updateEventFields, publishGames, resetScores, saveScoringRules, subscribeGames,
} from "../cloud.js";
import { TYPES, COMMON_AGES, expandBuilder, buildColumns, sexWord } from "../categories.js";
import { describeFormat, formatMatches, formatWarnings, slotOptions, parseSlot, slotValue, normalizeOverride, ROUND_OPTIONS } from "../schedule/format.js";
import SlotsEditor from "../schedule/SlotsEditor.jsx";
import { generateSchedule } from "../schedule/generator.js";
import { eventToConfig } from "../schedule/eventToConfig.js";
import ExcelImport from "../roster/ExcelImport.jsx";
import ScheduleGrid from "../schedule/ScheduleGrid.jsx";
import EventAccess from "./EventAccess.jsx";
import { fileToLogoDataUrl } from "../img.js";
import { formatRange } from "../dates.js";
import { flagFor } from "../flags.js";
import { useEvent } from "../eventContext.js";
import { overlayUrl, resultsJsonUrl } from "../broadcast.js";

// Format variants offered per category in phase 4. The editable bracket (View
// bracket) still fine-tunes individual knockout matchups on top of these.
const FORMAT_VARIANTS = [
  { id: "rr_ko", label: "Round-robin + playoffs", flags: { double: false, knockout: true } },
  { id: "rr", label: "Round-robin only (no playoffs)", flags: { double: false, knockout: false } },
  { id: "drr_ko", label: "Double round-robin + playoffs", flags: { double: true, knockout: true } },
  { id: "drr", label: "Double round-robin only", flags: { double: true, knockout: false } },
];

function fmtStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const fromEvent = (ev) => ({
  name: ev?.name || "", place: ev?.place || "", address: ev?.address || "", startDate: ev?.startDate || "", endDate: ev?.endDate || "",
  categoryBuilder: ev?.categoryBuilder || { types: [], sexes: [], ages: [] },
  entries: ev?.entries || [], // [{ name, cats: [categoryName…] }]
  formatOverrides: ev?.formatOverrides || {}, // { [category]: { [matchId]: { a?, b? } } }
  formatVariants: ev?.formatVariants || {}, // { [category]: { double?, knockout? } }
  pointTable: ev?.pointTable || [], // [{ bestOf, winSets, loseSets, winPts, losePts }]
  drawPoints: ev?.drawPoints ?? 1,
  slots: ev?.slots || { courts: [], days: [], gameMinutes: 45, breakMinutes: 0 },
});

// Classification presets. IFA = win 2 / loss 0 (an empty table also means this).
const IFA_TABLE = [
  { bestOf: 3, winSets: 2, loseSets: 1, winPts: 2, losePts: 0 },
  { bestOf: 3, winSets: 2, loseSets: 0, winPts: 2, losePts: 0 },
  { bestOf: 5, winSets: 3, loseSets: 2, winPts: 2, losePts: 0 },
  { bestOf: 5, winSets: 3, loseSets: 1, winPts: 2, losePts: 0 },
  { bestOf: 5, winSets: 3, loseSets: 0, winPts: 2, losePts: 0 },
];
// PAFA: clean wins worth more, and the loser earns points for sets taken.
const PAFA_TABLE = [
  { bestOf: 3, winSets: 2, loseSets: 1, winPts: 2, losePts: 1 },
  { bestOf: 3, winSets: 2, loseSets: 0, winPts: 3, losePts: 0 },
  { bestOf: 5, winSets: 3, loseSets: 2, winPts: 3, losePts: 2 },
  { bestOf: 5, winSets: 3, loseSets: 1, winPts: 3, losePts: 1 },
  { bestOf: 5, winSets: 3, loseSets: 0, winPts: 3, losePts: 0 },
];

export default function Settings({ me }) {
  const nav = useNavigate();
  const { eventId, event, archived, isAdmin, branding } = useEvent();
  const [live, setLive] = useState(undefined);
  const [status, setStatus] = useState("");
  const [details, setDetails] = useState(() => fromEvent(event));
  const [dirty, setDirty] = useState(false); // has unsaved local edits
  // Guided setup accordion: the open step (0 = all closed). Starts on the first
  // step that isn't done yet.
  const [openStep, setOpenStep] = useState(() => {
    const d = fromEvent(event);
    const nt = (d.entries || []).length > 0;
    const courts = (d.slots?.courts || []).length > 0 && (d.slots?.days || []).length > 0;
    const flags = [!!(d.name && d.startDate), expandBuilder(d.categoryBuilder).length > 0, nt, nt, courts, false, false, false];
    const i = flags.findIndex((f) => !f);
    return i === -1 ? 0 : i + 1;
  });
  const openOrToggle = (n) => setOpenStep((s) => (s === n ? 0 : n));
  const [bracketIdx, setBracketIdx] = useState(null); // category index shown in the bracket modal
  const teamsInCat = (cat) => (details.entries || []).filter((t) => (t.cats || []).includes(cat)).map((t) => t.name);
  // Per-category format override: edit slots, remove or add knockout matches.
  const mutateOv = (cat, fn) => edit((d) => {
    const fo = { ...(d.formatOverrides || {}) };
    const cur = normalizeOverride(fo[cat]);
    const ov = { edits: { ...cur.edits }, removed: [...cur.removed], added: cur.added.map((m) => ({ ...m })) };
    fn(ov);
    fo[cat] = ov;
    return { ...d, formatOverrides: fo };
  });
  const setSlot = (cat, matchId, slot, value, isAdded) => mutateOv(cat, (ov) => {
    const src = parseSlot(value);
    if (isAdded) { const m = ov.added.find((x) => x.id === matchId); if (m) m[slot] = src; }
    else ov.edits[matchId] = { ...(ov.edits[matchId] || {}), [slot]: src };
  });
  const setRound = (cat, matchId, round) => mutateOv(cat, (ov) => { const m = ov.added.find((x) => x.id === matchId); if (m) m.round = round; });
  const addMatch = (cat) => mutateOv(cat, (ov) => ov.added.push({ id: `x${Date.now()}`, round: "Placement 5-6", a: { type: "seed", rank: 5 }, b: { type: "seed", rank: 6 } }));
  const removeMatch = (cat, matchId, isAdded) => mutateOv(cat, (ov) => {
    if (isAdded) ov.added = ov.added.filter((m) => m.id !== matchId);
    else if (!ov.removed.includes(matchId)) ov.removed.push(matchId);
  });
  const resetFormat = (cat) => edit((d) => { const fo = { ...(d.formatOverrides || {}) }; delete fo[cat]; return { ...d, formatOverrides: fo }; });
  const saveOverrides = () => { setStatus("Saving format…"); updateEventFields({ formatOverrides: details.formatOverrides }).then(() => afterSave("Format saved.")).catch((e) => setStatus("Save failed: " + (e?.message || e))); };
  const [remote, setRemote] = useState(false); // someone else changed it while editing

  // Live sync: pull the event doc into the form whenever it changes remotely,
  // unless the user has unsaved edits (then just flag that it changed).
  const lastEvent = useRef(event);
  useEffect(() => {
    if (event === lastEvent.current) return;
    lastEvent.current = event;
    if (dirty) setRemote(true);
    else setDetails(fromEvent(event));
  }, [event, dirty]);
  const reloadFromEvent = () => { setDetails(fromEvent(event)); setDirty(false); setRemote(false); };

  const [ageInput, setAgeInput] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const edit = (updater) => { setDirty(true); setDetails(updater); };

  // Per-category format variants (phase 4). Editable brackets layer on top via formatOverrides.
  const variantId = (v) => (v?.double ? (v.knockout === false ? "drr" : "drr_ko") : (v?.knockout === false ? "rr" : "rr_ko"));
  const applyVariant = (cat, id) => {
    const flags = FORMAT_VARIANTS.find((x) => x.id === id)?.flags || { double: false, knockout: true };
    const fv = { ...(details.formatVariants || {}), [cat]: { ...(details.formatVariants?.[cat] || {}), ...flags } };
    edit((d) => ({ ...d, formatVariants: fv }));
    updateEventFields({ formatVariants: fv }).catch((e) => setStatus("Save failed: " + (e?.message || e)));
  };
  const setVariantField = (cat, patch) => {
    const fv = { ...(details.formatVariants || {}), [cat]: { ...(details.formatVariants?.[cat] || {}), ...patch } };
    edit((d) => ({ ...d, formatVariants: fv }));
    updateEventFields({ formatVariants: fv }).catch((e) => setStatus("Save failed: " + (e?.message || e)));
  };

  const cb = details.categoryBuilder;
  const setBuilder = (patch) => edit((d) => ({ ...d, categoryBuilder: { ...d.categoryBuilder, ...patch } }));
  const toggleIn = (key, val) => setBuilder({ [key]: (cb[key] || []).includes(val) ? cb[key].filter((x) => x !== val) : [...(cb[key] || []), val] });
  const addAge = (a) => { const v = a.trim(); if (v && !(cb.ages || []).includes(v)) setBuilder({ ages: [...(cb.ages || []), v] }); setAgeInput(""); };
  const previewCats = expandBuilder(cb);
  const afterSave = (msg) => { setDirty(false); setRemote(false); lastEvent.current = event; setStatus(msg); };
  const saveCategories = () => {
    setStatus("Saving…");
    updateEventFields({ categoryBuilder: details.categoryBuilder })
      .then(() => { afterSave(`Saved — ${previewCats.length} categor${previewCats.length === 1 ? "y" : "ies"} defined.`); setOpenStep(3); })
      .catch((e) => setStatus("Save failed: " + (e?.message || e)));
  };

  // Team-entry matrix (rows = clubs/nations, columns = categories).
  const addTeam = (name) => {
    const v = name.trim();
    if (v && !(details.entries || []).some((t) => t.name.toLowerCase() === v.toLowerCase())) {
      edit((d) => ({ ...d, entries: [...(d.entries || []), { name: v, cats: [] }] }));
    }
    setTeamInput("");
  };
  const removeTeam = (i) => edit((d) => ({ ...d, entries: (d.entries || []).filter((_, j) => j !== i) }));
  const renameTeam = (i, name) => edit((d) => { const e = [...(d.entries || [])]; e[i] = { ...e[i], name }; return { ...d, entries: e }; });
  const setShort = (i, short) => edit((d) => { const e = [...(d.entries || [])]; e[i] = { ...e[i], short }; return { ...d, entries: e }; });
  const toggleEntry = (i, cat) => edit((d) => {
    const e = [...(d.entries || [])]; const cur = e[i].cats || [];
    e[i] = { ...e[i], cats: cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat] };
    return { ...d, entries: e };
  });
  // Team logos (shown on the broadcast scoreboard) — saved immediately.
  const [teamLogos, setTeamLogos] = useState({});
  useEffect(() => subscribeTeamLogos(setTeamLogos), [eventId]);
  const logoInput = useRef(null);
  const logoFor = useRef("");
  const pickLogo = (name) => { logoFor.current = name; logoInput.current?.click(); };
  const onTeamLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !logoFor.current) return;
    setStatus("Uploading team logo…");
    try { await setTeamLogo(logoFor.current, await fileToLogoDataUrl(file, 128)); setStatus(`Logo saved for ${logoFor.current}.`); }
    catch (e2) { setStatus("Logo upload failed: " + (e2?.message || e2)); }
  };
  const removeTeamLogo = async (name) => {
    try { await setTeamLogo(name, null); setStatus(`Logo removed for ${name}.`); }
    catch (e2) { setStatus("Failed: " + (e2?.message || e2)); }
  };

  const saveTeams = () => {
    setStatus("Saving teams…");
    updateEventFields({ entries: details.entries })
      .then(() => { afterSave(`Saved ${(details.entries || []).length} team(s).`); setOpenStep(4); })
      .catch((e) => setStatus("Save failed: " + (e?.message || e)));
  };

  const saveDetails = async () => {
    setStatus("Saving event…");
    try { await updateEventDetails({ name: details.name, place: details.place, address: details.address.trim(), startDate: details.startDate, endDate: details.endDate, dates: formatRange(details.startDate, details.endDate) }); afterSave("Event details saved."); setOpenStep(2); }
    catch (e) { setStatus("Save failed: " + (e?.message || e)); }
  };

  // logo library + this event's selection
  const [logos, setLogos] = useState([]);
  const [eventLogo, setEventLogo] = useState(null);
  const [promoters, setPromoters] = useState([]);
  const [libOpen, setLibOpen] = useState(false);
  const fileRef = useRef(null);
  const initedRef = useRef(false);

  useEffect(() => subscribeLivePointer(setLive), []);
  useEffect(() => subscribeLogos(setLogos), []);
  // Load the saved selection once branding arrives.
  useEffect(() => {
    if (branding && !initedRef.current) {
      setEventLogo(branding.eventLogo || null);
      setPromoters(branding.promoters || []);
      initedRef.current = true;
    }
  }, [branding]);

  // Step 8 state (generate & publish) — hooks must stay above the admin check.
  const [genResult, setGenResult] = useState(null);
  const [published, setPublished] = useState(false);
  const [existingGames, setExistingGames] = useState([]);
  useEffect(() => subscribeGames(setExistingGames), []);

  if (!isAdmin) return <div className="empty">Admins only.</div>;

  const thisIsLive = live?.eventId === eventId;
  const publishLive = async () => { try { await setLiveEvent(event); } catch (e) { setStatus("Failed: " + (e?.message || e)); } };
  const stopLive = async () => {
    if (!window.confirm("Stop showing this event on Fistball Live?")) return;
    try { await clearLiveEvent(); } catch (e) { setStatus("Failed: " + (e?.message || e)); }
  };
  const toggleArchive = async () => {
    const next = archived ? "active" : "archived";
    if (!window.confirm(archived ? "Re-activate this event?" : "Archive this event? It becomes read-only for everyone.")) return;
    try { await setEventStatus(next, me); } catch (e) { setStatus("Failed: " + (e?.message || e)); }
  };
  const pt = details.pointTable || [];
  const addPtRow = () => edit((d) => ({ ...d, pointTable: [...(d.pointTable || []), { bestOf: 3, winSets: 2, loseSets: 1, winPts: 2, losePts: 0 }] }));
  const editPtRow = (i, k, v) => edit((d) => { const rows = [...(d.pointTable || [])]; rows[i] = { ...rows[i], [k]: v === "" ? "" : Number(v) }; return { ...d, pointTable: rows }; });
  const delPtRow = (i) => edit((d) => ({ ...d, pointTable: (d.pointTable || []).filter((_, j) => j !== i) }));
  const applyPreset = (rows) => edit((d) => ({ ...d, pointTable: rows.map((r) => ({ ...r })) }));
  const savePoints = async () => {
    setStatus("Saving points…");
    try { await saveScoringRules({ pointTable: details.pointTable || [], drawPoints: details.drawPoints ?? 1 }); afterSave("Classification points saved."); }
    catch (e) { setStatus("Save failed: " + (e?.message || e)); }
  };

  const resetAllScores = async () => {
    if (!window.confirm("Reset ALL game reports? This deletes every game report, sets all scores back to “Not Started”, and clears the knockout bracket (advanced teams go back to their placeholders). Games, schedule, teams and rosters are kept. This cannot be undone.")) return;
    setStatus("Resetting game reports…");
    try { const n = await resetScores(); setStatus(`Reset done — ${n} games back to Not Started.`); }
    catch (e) { setStatus("Reset failed: " + (e?.message || e)); }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setStatus("Uploading logo…");
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      await addLogo({ name: file.name.replace(/\.[^.]+$/, ""), dataUrl }, me);
      setStatus("Logo added to the library.");
    } catch (e2) { setStatus("Upload failed: " + (e2?.message || e2)); }
  };
  const asLogo = (l) => ({ name: l.name, dataUrl: l.dataUrl });
  const addPromoter = (l) => setPromoters((p) => (p.some((x) => x.dataUrl === l.dataUrl) ? p : [...p, asLogo(l)]));
  const removePromoter = (i) => setPromoters((p) => p.filter((_, j) => j !== i));

  const saveLogos = async () => {
    setStatus("Saving branding…");
    try { await saveBranding({ name: event?.name, eventLogo, promoters }); setStatus("Branding saved."); setOpenStep(8); }
    catch (e) { setStatus("Save failed: " + (e?.message || e)); }
  };
  const setSlots = (next) => edit((d) => ({ ...d, slots: next }));
  const saveSlots = () => { setStatus("Saving courts…"); updateEventFields({ slots: details.slots }).then(() => { afterSave("Courts & schedule saved."); setOpenStep(6); }).catch((e) => setStatus("Save failed: " + (e?.message || e))); };
  // Derive courts & day windows from the games already scheduled (e.g. imported
  // events) so the user doesn't have to re-enter what's plainly in the schedule.
  const deriveSlotsFromGames = () => {
    const courts = [...new Set(existingGames.map((g) => String(g.court)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const byDate = {};
    existingGames.forEach((g) => {
      if (!g.date || !g.time) return;
      (byDate[g.date] ||= []).push(g.time);
    });
    const dISO = (d) => { const [dd, mm, yy] = String(d).split("/"); return dd ? `20${yy}-${mm}-${dd}` : ""; };
    const addMin = (t, n) => { const [h, m] = t.split(":").map(Number); const x = h * 60 + m + n; return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
    const dur = details.slots?.gameMinutes || 45;
    const days = Object.entries(byDate)
      .map(([date, times]) => { const sorted = [...times].sort(); return { date, start: sorted[0], end: addMin(sorted[sorted.length - 1], dur) }; })
      .sort((a, b) => dISO(a.date).localeCompare(dISO(b.date)));
    setSlots({ ...details.slots, courts, days });
    setStatus(`Loaded ${courts.length} courts and ${days.length} days from the schedule.`);
  };
  const slotsEmpty = !(details.slots?.courts || []).length || !(details.slots?.days || []).length;

  // Step 8 — generate & publish the schedule from the saved setup (state is
  // declared above, before the admin check, so hooks always run in the same order).
  const existingCats = new Set(existingGames.map((g) => g.category));
  const maxNr = existingGames.reduce((mx, g) => Math.max(mx, Number(g.nr) || 0), 0);
  // append: only build categories that don't have published games yet, numbering
  // after the existing games — so an already-built part (e.g. national teams) is
  // kept and a new part (e.g. clubs) is added without disturbing it.
  const runGenerate = (append) => {
    const cfg = eventToConfig({
      categoryBuilder: details.categoryBuilder, entries: details.entries,
      formatOverrides: details.formatOverrides, formatVariants: details.formatVariants, slots: details.slots,
    }, append ? maxNr + 1 : 1);
    if (append) cfg.categories = cfg.categories.filter((c) => !existingCats.has(c.name));
    if (append && !cfg.categories.length) { setStatus("All categories already have published games — nothing new to add."); setGenResult(null); return; }
    const r = generateSchedule(cfg);
    const shortOf = {};
    (details.entries || []).forEach((e) => { if (e.short && e.short.trim()) shortOf[e.name] = e.short.trim(); });
    r.games = r.games.map((g) => ({
      ...g,
      teamA: { ...g.teamA, short: shortOf[g.teamA?.name] || "" },
      teamB: { ...g.teamB, short: shortOf[g.teamB?.name] || "" },
    }));
    r.append = append;
    setGenResult(r);
    setStatus(`${r.games.length} ${append ? "new " : ""}games generated${r.unplaced.length ? `, ${r.unplaced.length} unplaced` : ""}.`);
  };
  const doGenerate = () => runGenerate(false);
  const doGenerateAppend = () => runGenerate(true);
  const doPublish = async () => {
    if (!genResult?.games.length) return;
    const append = !!genResult.append;
    const msg = append
      ? `Add ${genResult.games.length} new games to the schedule? Existing games, reports and results are kept.`
      : `Publish ${genResult.games.length} games? This replaces ALL current games, reports and results for this event.`;
    if (!window.confirm(msg)) return;
    setStatus("Publishing…");
    try {
      await publishGames(genResult.games, { replaceAll: !append });
      setPublished(true);
      setStatus(`${append ? "Added" : "Published"} ${genResult.games.length} games. See the games list / Fistball Live.`);
      setOpenStep(7);
    } catch (e) { setStatus("Publish failed: " + (e?.message || e)); }
  };

  // Guided-setup step state: which are done, and which are still locked.
  const nTeams = (details.entries || []).length;
  const courtsDone = (details.slots?.courts || []).length > 0 && (details.slots?.days || []).length > 0;
  const done = [
    !!(details.name && details.startDate),
    previewCats.length > 0,
    nTeams > 0,
    nTeams > 0,
    courtsDone,
    published,
    !!(branding?.eventLogo || (branding?.promoters || []).length),
    thisIsLive,
    false, // 9 access — always available, never "done"
  ];
  // 1 details · 2 categories · 3 teams · 4 format · 5 courts · 6 schedule · 7 logos · 8 live · 9 access
  const locked = [false, !done[0], !done[1], !done[2], !done[3], !done[4], !done[4], !done[5], !done[0]];

  return (
    <>
      <h2 className="page-h">Event settings{archived && <span className="arch-badge">Archived</span>}</h2>
      <div>
        {remote && (
          <div className="sync-banner">
            <span>Another admin just changed this event.</span>
            <button className="btn sm" onClick={reloadFromEvent}>Load latest</button>
          </div>
        )}
        {/* ---- 1. Event details ---- */}
        <Step n={1} title="Event details" sub={done[0] ? details.name : ""} done={done[0]} locked={locked[0]} open={openStep === 1} onToggle={() => openOrToggle(1)}>
          <div className="field"><span>Name</span>
            <input value={details.name} disabled={archived} onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))} /></div>
          <div className="field"><span>Place</span>
            <input value={details.place} disabled={archived} onChange={(e) => edit((d) => ({ ...d, place: e.target.value }))} placeholder="City · Country" /></div>
          <div className="field"><span>Venue address</span>
            <input value={details.address} disabled={archived} onChange={(e) => edit((d) => ({ ...d, address: e.target.value }))} placeholder="Street, number, city — shown on Fistball Live with directions" /></div>
          <div className="grid2">
            <div className="field"><span>Starts</span>
              <input type="date" disabled={archived} value={details.startDate} onChange={(e) => edit((d) => ({ ...d, startDate: e.target.value, endDate: d.endDate && d.endDate < e.target.value ? e.target.value : d.endDate }))} /></div>
            <div className="field"><span>Ends</span>
              <input type="date" disabled={archived} min={details.startDate || undefined} value={details.endDate} onChange={(e) => edit((d) => ({ ...d, endDate: e.target.value }))} /></div>
          </div>
          {(details.startDate || details.endDate) && <p className="muted-sm">{formatRange(details.startDate, details.endDate)}</p>}
          {!archived && <button className="btn primary" onClick={saveDetails}>Save details</button>}
        </Step>

        {/* ---- 2. Categories (chip builder) ---- */}
        <Step n={2} title="Categories" sub={done[1] ? `${previewCats.length} categories` : ""} done={done[1]} locked={locked[1]} open={openStep === 2} onToggle={() => openOrToggle(2)}>
          <p className="muted-sm">Mark the chips and the app creates every category (type × age × sex).</p>

          <div className="chip-row">
            <span className="chip-row-label">Type</span>
            {TYPES.map((t) => (
              <button key={t.id} disabled={archived} className={`selchip ${(cb.types || []).includes(t.id) ? "on" : ""}`} onClick={() => toggleIn("types", t.id)}>{t.label}</button>
            ))}
          </div>

          <div className="chip-row">
            <span className="chip-row-label">Gender</span>
            <button disabled={archived} className={`selchip ${(cb.sexes || []).includes("men") ? "on men" : ""}`} onClick={() => toggleIn("sexes", "men")}>♂ Men</button>
            <button disabled={archived} className={`selchip ${(cb.sexes || []).includes("women") ? "on women" : ""}`} onClick={() => toggleIn("sexes", "women")}>♀ Women</button>
          </div>

          <div className="chip-row">
            <span className="chip-row-label">Ages <span className="muted-sm" style={{ fontWeight: 400 }}>(optional)</span></span>
            {[...COMMON_AGES, ...(cb.ages || []).filter((a) => !COMMON_AGES.includes(a))].map((a) => (
              <button key={a} disabled={archived} className={`selchip ${(cb.ages || []).includes(a) ? "on" : ""}`} onClick={() => toggleIn("ages", a)}>{a}</button>
            ))}
            {!archived && (
              <input className="age-input" value={ageInput} onChange={(e) => setAgeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAge(ageInput)} placeholder="+ custom" />
            )}
          </div>

          <div className="cat-preview-box">
            {previewCats.length ? (
              <>
                <div className="subhead">Creates {previewCats.length} categor{previewCats.length === 1 ? "y" : "ies"}</div>
                <div className="chips">{previewCats.map((n) => <span className="team-chip" key={n}>{n}</span>)}</div>
              </>
            ) : <p className="muted-sm" style={{ margin: 0 }}>Pick a type and a sex to see the categories.</p>}
          </div>

          {!archived && <button className="btn primary" style={{ marginTop: 12 }} onClick={saveCategories} disabled={!previewCats.length}>Save categories</button>}
        </Step>

        {/* ---- 3. Team-entry matrix (teams × categories) ---- */}
        <Step n={3} title="Teams & categories" sub={done[2] ? `${nTeams} teams` : ""} done={done[2]} locked={locked[2]} open={openStep === 3} onToggle={() => openOrToggle(3)}>
          <div>
            <p className="muted-sm">Add each club / national team and tick the categories it plays. This is what the schedule uses.</p>
            {!archived && (
              <div className="add-row">
                <input value={teamInput} onChange={(e) => setTeamInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTeam(teamInput)} placeholder="Add club / national team" />
                <button className="btn sm" onClick={() => addTeam(teamInput)}>Add</button>
              </div>
            )}
            {!(details.entries || []).length ? (
              <p className="muted-sm" style={{ marginTop: 10 }}>No teams yet.</p>
            ) : (
              (() => {
                const cols = buildColumns(cb);
                const headRows = cols.hasAges ? 3 : 2;
                return (
                  <div className="matrix-wrap">
                    <table className="matrix">
                      <thead>
                        <tr>
                          <th className="mx-team" rowSpan={headRows}>Team</th>
                          {cols.types.map((t, ti) => (
                            <th key={ti} className="mx-type" colSpan={cols.sexes.length * cols.agesList.length}>{t}</th>
                          ))}
                          <th rowSpan={headRows} aria-label="Remove" />
                        </tr>
                        <tr>
                          {cols.types.map((t, ti) => cols.sexes.map((s) => (
                            <th key={ti + s} className={`mx-sex mx-sex-${s}`} colSpan={cols.agesList.length}>{s === "women" ? "♀ Women" : "♂ Men"}</th>
                          )))}
                        </tr>
                        {cols.hasAges && (
                          <tr>
                            {cols.types.map((t, ti) => cols.sexes.map((s) => cols.agesList.map((a) => (
                              <th key={ti + s + a} className="mx-age">{a}</th>
                            ))))}
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        {(details.entries || []).map((t, i) => (
                          <tr key={i}>
                            <td className="mx-team"><span className="mx-team-cell">{teamLogos[t.name]
                              ? <span className="mx-logo"><img src={teamLogos[t.name]} alt="" title="Change logo" onClick={() => !archived && pickLogo(t.name)} />{!archived && <button className="mx-logo-x" onClick={() => removeTeamLogo(t.name)} aria-label="Remove logo" title="Remove logo">✕</button>}</span>
                              : !archived && <button className="mx-logo-add" onClick={() => pickLogo(t.name)} title="Add team logo (shown on the broadcast scoreboard)">+ logo</button>}<span className="flag">{flagFor(t.name)}</span><span className="mx-team-inputs"><input className="mx-team-input" value={t.name} disabled={archived} onChange={(e) => renameTeam(i, e.target.value)} aria-label="Team name" /><input className="mx-team-short" value={t.short || ""} disabled={archived} onChange={(e) => setShort(i, e.target.value)} placeholder="short name for schedule (optional)" aria-label="Short name" /></span></span></td>
                            {cols.leaves.map((lf) => (
                              <td key={lf.name} className="mx-cell">
                                <input type="checkbox" checked={(t.cats || []).includes(lf.name)} disabled={archived} onChange={() => toggleEntry(i, lf.name)} title={lf.name} />
                              </td>
                            ))}
                            <td>{!archived && <button className="btn danger sm" onClick={() => removeTeam(i)} aria-label="Remove">✕</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="mx-team dim">Teams</td>
                          {cols.leaves.map((lf) => <td key={lf.name} className="mx-cell dim">{(details.entries || []).filter((t) => (t.cats || []).includes(lf.name)).length}</td>)}
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()
            )}
<input ref={logoInput} type="file" accept="image/*" hidden onChange={onTeamLogo} />
            {(details.entries || []).length > 0 && <p className="muted-sm" style={{ marginTop: 8 }}>Team logos (“+ logo”) are saved right away and shown on the broadcast scoreboard. A logo is linked to the team name — renaming a team drops it.</p>}
            {!archived && (details.entries || []).length > 0 && <button className="btn primary" style={{ marginTop: 12 }} onClick={saveTeams}>Save teams</button>}
          </div>
        </Step>

        {/* ---- 4. Format per category (auto by team count) ---- */}
        <Step n={4} title="Format" sub={done[3] ? `${previewCats.length} categories` : ""} done={done[3]} locked={locked[3]} open={openStep === 4} onToggle={() => openOrToggle(4)}>
          <div>
            <p className="muted-sm">Pick a format for each category. The number of teams comes from the matrix; “View bracket” fine-tunes the knockout matchups.</p>
            {previewCats.length > 0 && (
              <button className="btn" style={{ marginBottom: 10 }} onClick={() => setBracketIdx(0)}>👁 Review each bracket →</button>
            )}
            {previewCats.map((cat, ci) => {
              const count = (details.entries || []).filter((t) => (t.cats || []).includes(cat)).length;
              const v = details.formatVariants?.[cat];
              const flags = { double: !!v?.double, knockout: v?.knockout !== false };
              const d = describeFormat(count, details.formatOverrides?.[cat], flags);
              return (
                <div className="fmt-cat" key={cat}>
                  <div className="fmt-head"><b>{cat}</b><span className="tag">{count} team{count === 1 ? "" : "s"}</span>
                    {count > 0 && d && flags.knockout && formatWarnings(count, details.formatOverrides?.[cat]).length > 0 && <span className="tag" style={{ background: "#fff4e5", color: "#8a5a00" }}>⚠️ check</span>}
                    {count > 0 && d && flags.knockout && <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => setBracketIdx(ci)}>View bracket</button>}
                  </div>
                  {count > 0 && (
                    <>
                      <select className="fmt-variant" value={variantId(v)} disabled={archived} onChange={(e) => applyVariant(cat, e.target.value)}>
                        {FORMAT_VARIANTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                      <div className="fmt-bestof">
                        <label>Group best of
                          <select value={Number(v?.bestOf) || 3} disabled={archived} onChange={(e) => setVariantField(cat, { bestOf: Number(e.target.value) })}>
                            {[1, 3, 5, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                        {flags.knockout && (
                          <label>Finals best of
                            <select value={Number(v?.bestOfKo) || Number(v?.bestOf) || 3} disabled={archived} onChange={(e) => setVariantField(cat, { bestOfKo: Number(e.target.value) })}>
                              {[1, 3, 5, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </label>
                        )}
                      </div>
                    </>
                  )}
                  {!count ? (
                    <p className="muted-sm" style={{ margin: "2px 0 0" }}>No teams ticked yet.</p>
                  ) : d ? (
                    <>
                      <div className="fmt-line"><span className="fmt-round">Qualification Round</span> one group · {flags.double ? "double round-robin" : "round-robin"} · {d.qrGames} games</div>
                      {d.rounds.map((r, i) => (
                        <div className="fmt-line" key={i}><span className="fmt-round">{r.round}</span> {r.matches.join(" · ")}</div>
                      ))}
                      {!flags.knockout && <div className="fmt-line muted-sm">No playoffs — final standings from the round-robin.</div>}
                      <div className="muted-sm" style={{ marginTop: 4 }}>Total <b>{d.total}</b> games · group best of {Number(v?.bestOf) || 3}{flags.knockout ? ` · finals best of ${Number(v?.bestOfKo) || Number(v?.bestOf) || 3}` : ""}</div>
                    </>
                  ) : (
                    <p className="muted-sm" style={{ margin: "2px 0 0" }}>No knockout preset for {count} teams yet — pick a “round-robin only” variant, or a manual bracket will be needed.</p>
                  )}
                </div>
              );
            })}
          </div>
          {!archived && <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setOpenStep(5)}>Looks good — continue</button>}
        </Step>

        {/* ---- 5. Courts & schedule ---- */}
        <Step n={5} title="Courts & schedule" sub={done[4] ? `${(details.slots?.courts || []).length} courts · ${(details.slots?.days || []).length} days` : ""} done={done[4]} locked={locked[4]} open={openStep === 5} onToggle={() => openOrToggle(5)}>
          <p className="muted-sm">Define the courts and each day’s window. The schedule generator uses this to place the games.</p>
          {!archived && slotsEmpty && existingGames.length > 0 && (
            <div className="info-box" style={{ marginBottom: 10 }}>
              This event already has a schedule with courts and days.{" "}
              <button className="btn sm" onClick={deriveSlotsFromGames}>Load from existing schedule</button>
            </div>
          )}
          <SlotsEditor value={details.slots} onChange={setSlots} disabled={archived} />
          {!archived && <button className="btn primary" style={{ marginTop: 12 }} onClick={saveSlots} disabled={!courtsDone}>Save courts &amp; continue</button>}
        </Step>

        {/* ---- 6. Generate, arrange & publish schedule ---- */}
        <Step n={6} title="Generate & publish schedule" sub={done[5] ? "published" : ""} done={done[5]} locked={locked[5]} open={openStep === 6} onToggle={() => openOrToggle(6)}>
          <p className="muted-sm">Builds all games from your categories, teams, format and courts. Auto-places them on days/courts/times — drag or type to adjust — then publish (they appear on the games list and Fistball Live).</p>
          {!archived && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={doGenerate}>{genResult && !genResult.append ? "Regenerate (replace all)" : "Generate schedule"}</button>
              {existingGames.length > 0 && <button className="btn" onClick={doGenerateAppend}>+ Add new categories (keep current)</button>}
            </div>
          )}
          {existingGames.length > 0 && !genResult && (
            <p className="muted-sm" style={{ marginTop: 8 }}>This event already has <b>{existingGames.length}</b> published games. “<b>Add new categories</b>” builds only the categories without games yet (e.g. clubs) and numbers them after the existing ones — the current part (e.g. national teams) is left untouched.</p>
          )}
          {genResult && (
            <>
              {genResult.append && <div className="warn-box" style={{ marginTop: 10, background: "#eaf6ee", color: "#1c6b3f" }}>➕ Add mode — these are NEW games (numbered from #{maxNr + 1}); publishing keeps the {existingGames.length} existing games.</div>}
              {genResult.warnings?.length > 0 && <div className="warn-box" style={{ marginTop: 10 }}>{genResult.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}</div>}
              <p className="muted-sm" style={{ marginTop: 8 }}>Ready: <b>{genResult.games.length}</b> {genResult.append ? "new " : ""}games{genResult.unplaced.length ? ` · ${genResult.unplaced.length} unplaced` : ""}.</p>
              <div className="subhead">Arrange — set each game’s day · court · time</div>
              <ScheduleGrid games={genResult.games} onChange={(gs) => setGenResult((r) => ({ ...r, games: gs }))} />
              {!archived && (
                <button className="btn primary" style={{ marginTop: 12, width: "100%" }} onClick={doPublish} disabled={!genResult.games.length}>
                  {genResult.append ? `Add ${genResult.games.length} games (keep current)` : `Publish ${genResult.games.length} games (replace all)`}
                </button>
              )}
              {done[5] && <p className="muted-sm">✅ Published. You can keep adjusting above and publish again, or fine-tune later via Manage → Arrange schedule.</p>}
            </>
          )}
        </Step>

        {/* ---- 7. Event logos ---- */}
        <Step n={7} title="Event logos" sub={done[6] ? "set" : "optional"} done={done[6]} locked={locked[6]} open={openStep === 7} onToggle={() => openOrToggle(7)}>
          <div className="row-between">
            <span className="muted-sm">Shown on the game report (PDF), the app topbar and Fistball Live.</span>
            <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={archived}>+ Upload logo</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />

          <div className="subhead">This event</div>
          <div className="brand-picks">
            <div className="brand-pick">
              <div className="brand-pick-label">Event logo</div>
              {eventLogo
                ? <div className="logo-chip"><img src={eventLogo.dataUrl} alt="" /><button onClick={() => setEventLogo(null)} disabled={archived}>✕</button></div>
                : <div className="logo-empty">none</div>}
            </div>
            <div className="brand-pick">
              <div className="brand-pick-label">Promoters</div>
              <div className="chips">
                {promoters.map((p, i) => (
                  <div className="logo-chip" key={i}><img src={p.dataUrl} alt="" /><button onClick={() => removePromoter(i)} disabled={archived}>✕</button></div>
                ))}
                {!promoters.length && <div className="logo-empty">none</div>}
              </div>
            </div>
          </div>
          {!archived && <button className="btn primary" style={{ marginTop: 12 }} onClick={saveLogos}>Save logos &amp; continue</button>}

          <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setLibOpen(true)}>
            📁 Logo library ({logos.length})
          </button>
        </Step>

        {/* ---- 8. Publish to Fistball Live ---- */}
        <Step n={8} title="Publish to Fistball Live" sub={done[7] ? "On air" : ""} done={done[7]} locked={locked[7]} open={openStep === 8} onToggle={() => openOrToggle(8)}>
          <p className="muted-sm">
            {live === undefined ? "Checking…"
              : thisIsLive ? "✅ This event is showing on the public scoreboard."
              : live?.eventId ? `Another event is live: “${live.name || live.eventId}”.`
              : "No event is on the public scoreboard yet."}
          </p>
          {thisIsLive
            ? <button className="btn danger" onClick={stopLive}>Stop showing</button>
            : <button className="btn primary" onClick={publishLive}>{live?.eventId ? "Show this instead" : "Publish to Live"}</button>}
          <BroadcastLinks eventId={eventId} games={existingGames} />
        </Step>

        {/* ---- 9. Access to this event ---- */}
        <Step n={9} title="Access to this event" sub={locked[8] ? "" : "who can score & manage"} done={done[8]} locked={locked[8]} open={openStep === 9} onToggle={() => openOrToggle(9)}>
          <EventAccess me={me} />
        </Step>

        <div className="tools-divider">Tools (optional)</div>

        {/* ---- Import players & staff from Excel ---- */}
        {!archived && <ExcelImport me={me} teamNames={(details.entries || []).map((e) => e.name)} categories={previewCats} />}

        {/* ---- Classification points (point table) ---- */}
        <div className="card">
          <div className="row-between">
            <h2 style={{ margin: 0 }}>Classification points</h2>
            {!archived && <button className="btn primary sm" onClick={savePoints}>Save points</button>}
          </div>
          <p className="muted-sm">How many standings points each result is worth. Empty = <b>IFA</b> (win 2 · loss 0). Set your own rows for other federations (e.g. PAFA).</p>
          {!archived && (
            <div style={{ display: "flex", gap: 8, margin: "6px 0" }}>
              <button className="btn sm" onClick={() => applyPreset(IFA_TABLE)}>Use IFA (2 / 0)</button>
              <button className="btn sm" onClick={() => applyPreset(PAFA_TABLE)}>Use PAFA</button>
              <button className="btn sm" onClick={() => applyPreset([])}>Clear</button>
              <span style={{ flex: 1 }} />
              <label className="muted-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>Draw pts
                <input style={{ width: 46 }} type="number" value={details.drawPoints ?? 1} disabled={archived} onChange={(e) => edit((d) => ({ ...d, drawPoints: Number(e.target.value) }))} />
              </label>
            </div>
          )}
          <div className="pt-table">
            <div className="pt-row pt-head"><span>Best of</span><span>Win sets</span><span>Lose sets</span><span>Win pts</span><span>Lose pts</span><span /></div>
            {pt.length === 0 && <p className="muted-sm" style={{ margin: "6px 0" }}>No rows — using IFA default (win 2 · loss 0).</p>}
            {pt.map((r, i) => (
              <div className="pt-row" key={i}>
                {["bestOf", "winSets", "loseSets", "winPts", "losePts"].map((k) => (
                  <input key={k} type="number" value={r[k]} disabled={archived} onChange={(e) => editPtRow(i, k, e.target.value)} />
                ))}
                {!archived && <button className="btn danger sm" onClick={() => delPtRow(i)}>✕</button>}
              </div>
            ))}
            {!archived && <button className="btn sm" style={{ marginTop: 6 }} onClick={addPtRow}>+ Add row</button>}
          </div>
        </div>

        {/* ---- Status ---- */}
        <div className="card">
          <div className="row-between">
            <div><h2 style={{ margin: 0 }}>Event status</h2>
              <p className="muted-sm">{archived ? "Archived — read-only for everyone." : "Active — members can score."}</p></div>
            <button className={`btn ${archived ? "primary" : "danger"}`} onClick={toggleArchive}>{archived ? "Re-activate" : "Archive"}</button>
          </div>
          {!archived && (
            <div className="row-between" style={{ marginTop: 12, alignItems: "center" }}>
              <span className="muted-sm">Rehearsed scoring? Clear all game reports and reset the bracket to start the tournament clean (keeps games &amp; rosters). To clear a single game, open it and use “Reset this report”.</span>
              <button className="btn danger sm" onClick={resetAllScores}>Reset all game reports</button>
            </div>
          )}
          {(event?.statusLog || []).length > 0 && (
            <details className="import-history" style={{ marginTop: 10 }}>
              <summary>Status history ({event.statusLog.length})</summary>
              <ul className="import-log">
                {event.statusLog.map((h, i) => (
                  <li key={i}>
                    <span className="il-when">{fmtStamp(h.at)}</span>
                    <span className="il-what">{h.action}</span>
                    <span className="il-by muted-sm">{h.by}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {status && <p className="muted-sm">{status}</p>}
      </div>

      {bracketIdx !== null && previewCats[bracketIdx] && (
        <BracketModal
          category={previewCats[bracketIdx]}
          teams={teamsInCat(previewCats[bracketIdx])}
          override={details.formatOverrides?.[previewCats[bracketIdx]]}
          onSlot={(matchId, slot, value, isAdded) => setSlot(previewCats[bracketIdx], matchId, slot, value, isAdded)}
          onRound={(matchId, round) => setRound(previewCats[bracketIdx], matchId, round)}
          onAdd={() => addMatch(previewCats[bracketIdx])}
          onRemove={(matchId, isAdded) => removeMatch(previewCats[bracketIdx], matchId, isAdded)}
          onReset={() => resetFormat(previewCats[bracketIdx])}
          onSave={saveOverrides}
          archived={archived}
          idx={bracketIdx}
          total={previewCats.length}
          onClose={() => setBracketIdx(null)}
          onNext={() => { saveOverrides(); setBracketIdx((i) => (i + 1 < previewCats.length ? i + 1 : null)); }}
        />
      )}

      {libOpen && (
        <div className="modal-overlay" onClick={() => setLibOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="modal-x" onClick={() => setLibOpen(false)} aria-label="Close">✕</button>
            <h3 className="modal-title" style={{ marginBottom: 2 }}>Logo library ({logos.length})</h3>
            <p className="muted-sm" style={{ marginTop: 0 }}>Pick a logo to use in this event, or upload a new one.</p>
            <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={archived}>+ Upload logo</button>
            {logos.length === 0 && <p className="muted-sm" style={{ marginTop: 10 }}>No logos yet — upload one above.</p>}
            <div className="logo-grid" style={{ marginTop: 10 }}>
              {logos.map((l) => (
                <div className="logo-lib" key={l.id}>
                  <img src={l.dataUrl} alt={l.name} title={l.name} />
                  <div className="logo-name">{l.name}</div>
                  {!archived && (
                    <div className="logo-actions">
                      <button className="btn sm" onClick={() => setEventLogo(asLogo(l))}>Event logo</button>
                      <button className="btn sm" onClick={() => addPromoter(l)}>Add promoter</button>
                      <button className="btn danger sm" onClick={() => window.confirm(`Delete “${l.name}” from the library?`) && deleteLogo(l.id)}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Editable bracket of one category (group + every knockout match) in a modal.
// Each slot is a dropdown (seed / winner-of / loser-of); changes are saved as a
// per-category override. Stepped through one category at a time.
// Per-court scoreboard overlay links for the TV/stream producer (OBS/vMix
// browser source). Each follows whatever game is on that court.
function BroadcastLinks({ eventId, games }) {
  const courts = [...new Set(games.map((g) => String(g.court || "")).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const copy = async (url) => {
    try { await navigator.clipboard.writeText(url); } catch (_) { window.prompt("Copy the link:", url); }
  };
  return (
    <div style={{ marginTop: 14 }}>
      <strong>📺 Broadcast overlay (points &amp; sets)</strong>
      <p className="muted-sm">Live scoreboard with a transparent background — add it as a <em>Browser source</em> in OBS/vMix (e.g. 1920×1080). One link per court follows the game being played there; each game report also has its own link.</p>
      {courts.length === 0 && <p className="muted-sm">Publish games first to get the court links.</p>}
      <p className="muted-sm" style={{ marginTop: 8 }}>
        Data feed (JSON, for vMix/Singular/TV graphics — all games of this event):{" "}
        <a href={resultsJsonUrl(eventId)} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>{resultsJsonUrl(eventId)}</a>
      </p>
      {courts.map((c) => {
        const url = overlayUrl(eventId, { court: c });
        return (
          <div key={c} className="row-between" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
            <span style={{ minWidth: 64, fontWeight: 600 }}>Court {c}</span>
            <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0, fontSize: 12 }} />
            <button className="btn sm" onClick={() => copy(url)}>Copy</button>
            <a className="btn sm" href={url} target="_blank" rel="noreferrer">Open ↗</a>
          </div>
        );
      })}
    </div>
  );
}

function BracketModal({ category, teams, override, onSlot, onRound, onAdd, onRemove, onReset, onSave, archived, idx, total, onClose, onNext }) {
  const n = teams.length;
  const matches = formatMatches(n, override);
  const warnings = formatWarnings(n, override);
  const last = idx + 1 >= total;
  const Slot = ({ m, side }) => {
    const slot = side === "a" ? m.a : m.b;
    if (archived) return <span className="brk-slot-ro">{slot.label}</span>;
    return (
      <select className="brk-slot" value={slotValue(slot.src)} onChange={(e) => onSlot(m.id, side, e.target.value, m.added)}>
        {slotOptions(n, m.id, override).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bracket-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="modal-title" style={{ marginBottom: 2 }}>{category}</h3>
        <p className="muted-sm" style={{ marginTop: 0 }}>{n} teams · category {idx + 1} of {total}</p>
        {!matches.length ? (
          <p className="muted-sm">No preset for {n} teams yet.</p>
        ) : (
          <>
            <div className="brk-group">
              <div className="brk-col-title">Qualification Round · one group</div>
              <div className="chips">{teams.map((t) => <span className="team-chip" key={t}>{t}</span>)}</div>
            </div>
            <div className="brk-edit-list">
              {matches.map((m) => (
                <div className="brk-edit-row" key={m.id}>
                  {m.added && !archived
                    ? <select className="brk-erd-sel" value={m.round} onChange={(e) => onRound(m.id, e.target.value)}>
                        {ROUND_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    : <span className="brk-erd">{m.round}</span>}
                  <Slot m={m} side="a" /><span className="brk-x">×</span><Slot m={m} side="b" />
                  {!archived && <button className="brk-del" title="Remove match" onClick={() => onRemove(m.id, m.added)}>✕</button>}
                </div>
              ))}
            </div>
            {!archived && (
              <div className="brk-editnote">
                <button className="btn sm" onClick={onAdd}>+ Add match</button>
                {override && normalizeOverride(override) && (normalizeOverride(override).removed.length || normalizeOverride(override).added.length || Object.keys(normalizeOverride(override).edits).length)
                  ? <button className="btn sm" onClick={onReset}>Reset to preset</button> : null}
              </div>
            )}
            {warnings.length > 0 && (
              <div className="warn-box">{warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}</div>
            )}
            <p className="muted-sm">Remove a match with ✕, or add one. Placeholders (“Winner SF1”…) fill in automatically as games finish.</p>
          </>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={onNext}>{last ? "Save — done" : "Save — next category"}</button>
        </div>
      </div>
    </div>
  );
}

// One numbered, collapsible step of the guided event setup. The number stays on
// completed steps (turns green); the current step is open, later steps locked.
function Step({ n, title, sub, done, locked, open, onToggle, children }) {
  return (
    <div className="sec-card">
      <button className="sec-head" onClick={onToggle} disabled={locked}>
        <span className={`sec-num ${done ? "done" : ""} ${locked ? "locked" : ""}`}>{n}</span>
        <span className={`sec-title ${locked ? "locked" : ""}`}>{title}</span>
        {sub ? <span className="sec-sub">{sub}</span> : null}
        <span className="sec-chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && !locked && <div className="sec-body">{children}</div>}
    </div>
  );
}
