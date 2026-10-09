import {
  collection, collectionGroup, doc, getDoc, getDocs, setDoc, onSnapshot,
  runTransaction, serverTimestamp, updateDoc, writeBatch, deleteDoc, deleteField, arrayUnion, query, where,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { db, auth, googleProvider } from "./firebase.js";
import { team } from "./seed.js";
import { resolveAdvancement } from "./schedule/advance.js";

/* ----------------- identity (Google login) ----------------- */
// Bootstrap org-admins — can create events and manage members of any event.
// Set VITE_ORG_ADMINS (comma-separated emails) in your .env to override.
// Keep this in sync with the same list in firestore.rules (rules can't read env).
const ORG_ADMINS = (import.meta.env.VITE_ORG_ADMINS ||
  "claudio.englert@gmail.com,claudio@qualitin.com,gastaoenglert@gmail.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export function isOrgAdmin(email) {
  return ORG_ADMINS.includes((email || "").toLowerCase());
}

// Map a Firebase auth user to our app "me" shape (null when signed out).
function toMe(user) {
  if (!user) return null;
  const email = (user.email || "").toLowerCase();
  return { uid: user.uid, name: user.displayName || email || "User", email, photo: user.photoURL || "", admin: isOrgAdmin(email) };
}

export function onMe(cb) {
  return onAuthStateChanged(auth, async (user) => {
    const me = toMe(user);
    cb(me);
    if (!me) return;
    // Everyone who signs in is remembered in the global directory (so they can be
    // authorized on other events with one click later).
    try { await upsertPerson(me.email, me.name); } catch (_) { /* best-effort */ }
    // Org-admins beyond the hardcoded bootstrap list are stored in `orgAdmins`.
    if (!me.admin) {
      try {
        const snap = await getDoc(doc(db, "orgAdmins", me.email));
        if (snap.exists()) cb({ ...me, admin: true });
      } catch (_) { /* orgAdmins unreadable — stay non-admin */ }
    }
  });
}
export async function signInWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  return toMe(cred.user);
}
export async function signOutMe() {
  await signOut(auth);
}

/* ----------------- event scoping ----------------- */
// All game data lives under events/{eid}/…. setEvent() picks the current event;
// the path helpers below build the nested paths so function bodies stay simple.
let _eid = null;
export function setEvent(eid) { _eid = eid; }
export function currentEventId() { return _eid; }
function reqEid() {
  if (!_eid) throw new Error("cloud: no event selected (call setEvent first)");
  return _eid;
}
function ecol(name) { return collection(db, "events", reqEid(), name); }
function edoc(name, id) { return doc(db, "events", reqEid(), name, id); }

/* ----------------- events & membership ----------------- */
// Events the signed-in user can access. Org-admins see all events; others see
// only events where they hold a membership (matched by email).
export function listMyEvents(me, cb) {
  if (me.admin) {
    return onSnapshot(collection(db, "events"),
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data(), myRole: "admin" }))),
      (err) => { console.warn("events unavailable:", err?.code || err); cb([]); });
  }
  // Non-admins discover their events from their OWN people/{email} doc's
  // { events: { eventId: role } } map — a single self-read the rules allow.
  // (A collection-group query over members can't be reliably authorized.)
  return onSnapshot(
    doc(db, "people", me.email),
    async (snap) => {
      const evs = (snap.exists() && snap.data().events) || {};
      const rows = await Promise.all(Object.entries(evs).map(async ([eid, role]) => {
        try {
          const ev = await getDoc(doc(db, "events", eid));
          return ev.exists() ? { id: ev.id, ...ev.data(), myRole: role } : null;
        } catch (_) { return null; }
      }));
      cb(rows.filter(Boolean));
    },
    (err) => { console.error("my events unavailable:", err?.code, err?.message, err); cb([]); }
  );
}

// Public per-event info doc (read by the anonymous Live for header + countdown).
// Merged so branding (logos) and details (name/place/dates) coexist.
function writeEventPublic(eid, patch) {
  return setDoc(doc(db, "public", `event_${eid}`), { eventId: eid, ...patch }, { merge: true });
}

export async function createEvent(descriptor, me) {
  const ref = doc(collection(db, "events"));
  await setDoc(ref, {
    name: descriptor.name || "New event",
    place: descriptor.place || "",
    dates: descriptor.dates || "",
    startDate: descriptor.startDate || "",
    endDate: descriptor.endDate || "",
    status: descriptor.status === "archived" ? "archived" : "active",
    createdBy: me.uid,
    createdAt: serverTimestamp(),
  });
  await writeEventPublic(ref.id, {
    name: descriptor.name || "", place: descriptor.place || "", dates: descriptor.dates || "",
    startsAt: descriptor.startDate || "", endsAt: descriptor.endDate || "",
  });
  // Add the creator as an admin member so they always appear in their list.
  await setDoc(doc(db, "events", ref.id, "members", me.email), {
    email: me.email, name: me.name, role: "admin", addedBy: me.email, addedAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeEvent(cb) {
  return onSnapshot(doc(db, "events", reqEid()),
    (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null),
    (err) => { console.warn("event unavailable:", err?.code || err); cb(null); });
}
export async function setEventStatus(status, me) {
  const ref = doc(db, "events", reqEid());
  const entry = { at: new Date().toISOString(), by: me?.name || me?.email || "—", action: status === "active" ? "re-activated" : "archived" };
  const snap = await getDoc(ref);
  const log = [entry, ...((snap.exists() && snap.data().statusLog) || [])].slice(0, 30);
  await updateDoc(ref, { status, statusLog: log });
}
// Write specific fields to the event doc without touching the public projection
// (used for collaborative fields like categoryBuilder / entries).
export async function updateEventFields(patch, eventId) {
  await updateDoc(doc(db, "events", eventId || reqEid()), patch);
}

// Classification point table (how many standings points a result is worth).
// Stored on the event AND mirrored to the public doc so Fistball Live uses it.
// Empty table → Live falls back to IFA (win 2 / loss 0).
export async function saveScoringRules({ pointTable, drawPoints }) {
  const eid = reqEid();
  const patch = { pointTable: pointTable || [], drawPoints: Number.isFinite(drawPoints) ? drawPoints : 1 };
  await updateDoc(doc(db, "events", eid), patch);
  await writeEventPublic(eid, patch);
}

// Non-game schedule entries (ceremonies, breaks). Stored on the event doc AND
// mirrored to the public doc so Fistball Live can show them without login.
export async function saveScheduleBlocks(blocks) {
  const eid = reqEid();
  await updateDoc(doc(db, "events", eid), { scheduleBlocks: blocks });
  await writeEventPublic(eid, { scheduleBlocks: blocks });
}

export async function updateEventDetails(patch, eventId) {
  const eid = eventId || reqEid();
  await updateDoc(doc(db, "events", eid), patch);
  await writeEventPublic(eid, {
    name: patch.name || "", place: patch.place || "", address: patch.address || "", dates: patch.dates || "",
    startsAt: patch.startDate || "", endsAt: patch.endDate || "",
  });
}

export function subscribeMembers(cb) {
  return onSnapshot(ecol("members"),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn("members unavailable:", err?.code || err); cb([]); });
}
export async function addMember({ email, name, role }, me) {
  const e = (email || "").toLowerCase().trim();
  if (!e) return;
  await setDoc(edoc("members", e), {
    email: e, name: name || "", role: role || "viewer",
    addedBy: me.email, addedAt: serverTimestamp(),
  });
  await upsertPerson(e, name); // remember for reuse across events
  await mirrorMembership(reqEid(), e, role || "viewer", name);
}

/* ----------------- global people directory (reuse across events) ----------------- */
export function subscribePeople(cb) {
  return onSnapshot(collection(db, "people"),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn("people unavailable:", err?.code || err); cb([]); });
}
async function upsertPerson(email, name) {
  const e = (email || "").toLowerCase().trim();
  if (!e) return;
  const patch = { email: e };
  if (name && name.trim()) patch.name = name.trim();
  await setDoc(doc(db, "people", e), patch, { merge: true });
}

// Mirror a membership onto the person's own people/{email} doc as an
// { events: { [eventId]: role } } map. This lets a non-admin discover their
// events by reading ONLY their own doc — no collection-group query (which the
// rules can't reliably authorize). Best-effort; the members doc stays the source
// of truth for org-admins.
export async function mirrorMembership(eventId, email, role, name) {
  const e = (email || "").toLowerCase().trim();
  if (!eventId || !e) return;
  try {
    const patch = { email: e, events: { [eventId]: role || "viewer" } };
    if (name && name.trim()) patch.name = name.trim();
    await setDoc(doc(db, "people", e), patch, { merge: true });
  } catch (_) { /* best-effort */ }
}
async function unmirrorMembership(eventId, email) {
  const e = (email || "").toLowerCase().trim();
  if (!eventId || !e) return;
  try { await setDoc(doc(db, "people", e), { events: { [eventId]: deleteField() } }, { merge: true }); }
  catch (_) { /* best-effort */ }
}

/* ----------------- org admins (global, manageable — beyond the bootstrap list) ----------------- */
export const BOOTSTRAP_ORG_ADMINS = ORG_ADMINS;
export function subscribeOrgAdmins(cb) {
  return onSnapshot(collection(db, "orgAdmins"),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn("orgAdmins unavailable:", err?.code || err); cb([]); });
}
export async function addOrgAdmin({ email, name }, me) {
  const e = (email || "").toLowerCase().trim();
  if (!e) return;
  await setDoc(doc(db, "orgAdmins", e), { email: e, name: (name || "").trim(), addedBy: me?.email || "", addedAt: serverTimestamp() }, { merge: true });
  await upsertPerson(e, name);
}
export async function removeOrgAdmin(email) {
  const e = (email || "").toLowerCase().trim();
  if (e) await deleteDoc(doc(db, "orgAdmins", e));
}
export async function removeMember(email) {
  const e = (email || "").toLowerCase().trim();
  await deleteDoc(edoc("members", e));
  await unmirrorMembership(reqEid(), e);
}

/* ----------------- global access grid (org-admins) -----------------
 * Every membership across every event. Readable in one collection-group
 * query by org-admins (their read rule doesn't depend on the document). */
export function subscribeAllMembers(cb) {
  return onSnapshot(collectionGroup(db, "members"),
    (snap) => cb(snap.docs.map((d) => {
      const ev = d.ref.parent.parent;
      return { eventId: ev ? ev.id : null, email: d.id, ...d.data() };
    }).filter((m) => m.eventId)),
    (err) => { console.warn("all members unavailable:", err?.code || err); cb([]); });
}
// Members of a SPECIFIC event (event-scoped, no reqEid()). Normal subcollection
// read — allowed for org-admins by the rules, unlike a collection-group query.
export function subscribeMembersAt(eventId, cb) {
  return onSnapshot(collection(db, "events", eventId, "members"),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, email: d.id, ...d.data() }))),
    (err) => { console.warn(`members of ${eventId} unavailable:`, err?.code || err); cb([]); });
}
// Grant/change a member's role in a SPECIFIC event (event-scoped, no reqEid()).
export async function setMemberRoleAt(eventId, { email, name, role }, me) {
  const e = (email || "").toLowerCase().trim();
  if (!eventId || !e) return;
  await setDoc(doc(db, "events", eventId, "members", e), {
    email: e, name: name || "", role: role || "viewer",
    addedBy: me?.email || "", addedAt: serverTimestamp(),
  }, { merge: true });
  await upsertPerson(e, name);
  await mirrorMembership(eventId, e, role || "viewer", name);
}
export async function removeMemberAt(eventId, email) {
  const e = (email || "").toLowerCase().trim();
  if (eventId && e) {
    await deleteDoc(doc(db, "events", eventId, "members", e));
    await unmirrorMembership(eventId, e);
  }
}

// My role for the current event ('admin' | 'official' | 'viewer' | null).
// Org-admins are admin everywhere.
export function subscribeMyRole(me, cb) {
  if (me.admin) { cb("admin"); return () => {}; }
  return onSnapshot(edoc("members", me.email),
    (d) => cb(d.exists() ? d.data().role : null),
    () => cb(null));
}

/* ----------------- team logos ----------------- */
// One public doc per event: { eventId, logos: { [teamName]: dataUrl } }. Kept
// apart from the event docs so it doesn't bloat them; read (no login) by the
// broadcast overlay and the Live game page.
const teamLogosRef = (eid) => doc(db, "public", `teamlogos_${eid}`);
export function subscribeTeamLogos(cb) {
  return onSnapshot(teamLogosRef(reqEid()),
    (d) => cb(d.exists() ? d.data().logos || {} : {}),
    (err) => { console.warn("team logos unavailable:", err?.code || err); cb({}); });
}
// dataUrl null removes the team's logo.
export async function setTeamLogo(teamName, dataUrl) {
  const eid = reqEid();
  await setDoc(teamLogosRef(eid), { eventId: eid, logos: { [teamName]: dataUrl || deleteField() } }, { merge: true });
}

/* ----------------- team kits (uniforms) ----------------- */
// One public doc per event: { eventId, kits: { [teamName]: [{shirt, shorts}, {shirt, shorts}] } }
// — up to two uniforms per team. Games pick one by number (see saveGameKit);
// public so Fistball Live can show which uniform each team wears.
const teamKitsRef = (eid) => doc(db, "public", `teamkits_${eid}`);
export function subscribeTeamKits(cb) {
  return onSnapshot(teamKitsRef(reqEid()),
    (d) => cb(d.exists() ? d.data().kits || {} : {}),
    (err) => { console.warn("team kits unavailable:", err?.code || err); cb({}); });
}
export async function setTeamKits(teamName, kits) {
  const eid = reqEid();
  await setDoc(teamKitsRef(eid), { eventId: eid, kits: { [teamName]: kits } }, { merge: true });
}

/* ----------------- logo library + event branding ----------------- */
// Reusable logo library (global). Each logo is { name, dataUrl } (small PNG).
export function subscribeLogos(cb) {
  return onSnapshot(collection(db, "logos"),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn("logos unavailable:", err?.code || err); cb([]); });
}
export async function addLogo({ name, dataUrl }, me) {
  const ref = doc(collection(db, "logos"));
  await setDoc(ref, { name: name || "Logo", dataUrl, addedBy: me.email, addedAt: serverTimestamp() });
  return ref.id;
}
export async function deleteLogo(id) { await deleteDoc(doc(db, "logos", id)); }

// Per-event branding lives in a PUBLIC doc so the anonymous Live can read it too.
// { eventId, name, eventLogo: {name,dataUrl}|null, promoters: [{name,dataUrl}] }
export function subscribeBranding(cb) {
  const eid = reqEid();
  return onSnapshot(doc(db, "public", `event_${eid}`),
    (d) => cb(d.exists() ? d.data() : null),
    () => cb(null));
}
export async function saveBranding({ name, eventLogo, promoters }) {
  await writeEventPublic(reqEid(), { name: name || "", eventLogo: eventLogo || null, promoters: promoters || [] });
}

// Branding for ALL events (public), keyed by eventId — for logos on event cards.
export function subscribeAllBranding(cb) {
  return onSnapshot(collection(db, "public"), (snap) => {
    const m = {};
    snap.forEach((d) => { if (d.id.startsWith("event_")) { const v = d.data(); if (v.eventId) m[v.eventId] = v; } });
    cb(m);
  }, (err) => { console.warn("branding list unavailable:", err?.code || err); cb({}); });
}

/* ----------------- Fistball Live pointer -----------------
 * A single PUBLIC doc telling the spectator app which event to show. Read
 * anonymously by Fistball Live; written by an admin of that event (or org-admin). */
export function subscribeLivePointer(cb) {
  return onSnapshot(doc(db, "public", "live"),
    (d) => cb(d.exists() ? d.data() : null),
    (err) => { console.warn("live pointer unavailable:", err?.code || err); cb(null); });
}
export async function setLiveEvent(event) {
  const eid = event?.id || reqEid();
  await setDoc(doc(db, "public", "live"), {
    eventId: eid, name: event?.name || "",
    startsAt: event?.startDate || "", endsAt: event?.endDate || "",
    updatedAt: serverTimestamp(),
  });
  // Ensure the public info doc exists so the Live has place/dates/countdown.
  await writeEventPublic(eid, {
    name: event?.name || "", place: event?.place || "", address: event?.address || "", dates: event?.dates || "",
    startsAt: event?.startDate || "", endsAt: event?.endDate || "",
  });
}
export async function clearLiveEvent() {
  await deleteDoc(doc(db, "public", "live"));
}

// Reset all match reports (súmulas) — deletes every report and sets each public
// results row back to "Not Started" (keeps games, schedule, teams and rosters).
// Use after a scoring rehearsal to start the tournament clean.
// Rebuild the placeholder label a knockout slot had before advancement filled
// it (e.g. "Winner Quarterfinal 1", "Loser Semifinal 2", "1st"). Used by reset.
function slotPlaceholder(src, gamesById) {
  if (!src) return null;
  if (src.type === "seed") {
    const n = Number(src.rank) || 0;
    const suf = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
    return `${n}${suf}`;
  }
  const round = gamesById[src.game || src.dep]?.round;
  if (!round) return null;
  if (src.type === "winner") return `Winner ${round}`;
  if (src.type === "loser") return `Loser ${round}`;
  return null;
}

const LIVE_RESET = { liveSetsA: 0, liveSetsB: 0, liveSet: 1, livePointsA: 0, livePointsB: 0 };
export async function resetScores() {
  await clearCollection("reports");
  // Games carry srcA/srcB and the (possibly advancement-filled) teamA/teamB.
  const gsnap = await getDocs(ecol("games"));
  const gamesById = {};
  gsnap.docs.forEach((d) => { gamesById[d.id] = { id: d.id, ...d.data() }; });
  // Revert every knockout slot that has a source back to its placeholder, on
  // both the game and its result (the Live bracket reads results).
  const slotReverts = {}; // gameId -> { teamA?, teamB? }
  gsnap.docs.forEach((d) => {
    const g = gamesById[d.id];
    const pa = slotPlaceholder(g.srcA, gamesById);
    const pb = slotPlaceholder(g.srcB, gamesById);
    const patch = {};
    if (pa && g.teamA?.name !== pa) patch.teamA = { name: pa, short: "" };
    if (pb && g.teamB?.name !== pb) patch.teamB = { name: pb, short: "" };
    if (Object.keys(patch).length) slotReverts[d.id] = patch;
  });
  const gdocs = gsnap.docs.filter((d) => slotReverts[d.id]);
  for (let i = 0; i < gdocs.length; i += 300) {
    const batch = writeBatch(db);
    gdocs.slice(i, i + 300).forEach((d) => batch.set(d.ref, slotReverts[d.id], { merge: true }));
    await batch.commit();
  }

  const snap = await getDocs(ecol("results"));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 300) {
    const batch = writeBatch(db);
    docs.slice(i, i + 300).forEach((d) => {
      const rev = slotReverts[d.id] || {};
      const teamPatch = {};
      if (rev.teamA) teamPatch.teamA = rev.teamA.name;
      if (rev.teamB) teamPatch.teamB = rev.teamB.name;
      batch.set(d.ref, { setsA: 0, setsB: 0, pointsA: 0, pointsB: 0, sets: [], cards: [], status: "Not Started", ...LIVE_RESET, ...teamPatch, updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  }
  return docs.length;
}

// Reset ONE match report (súmula): deletes its report and puts its public result
// back to "Not Started" (teams kept). Knockout slots this game already filled
// (winner/loser, or QR seeds of its category) go back to their placeholder —
// but only on games that haven't started; those that have are returned in
// `kept` so the UI can warn. Other games are untouched.
export async function resetReport(gameId) {
  const gsnap = await getDocs(ecol("games"));
  const gamesById = {};
  gsnap.docs.forEach((d) => { gamesById[d.id] = { id: d.id, ...d.data() }; });
  const game = gamesById[gameId];

  await deleteDoc(edoc("reports", gameId));
  await setDoc(edoc("results", gameId), {
    setsA: 0, setsB: 0, pointsA: 0, pointsB: 0, sets: [], cards: [], status: "Not Started", ...LIVE_RESET, updatedAt: serverTimestamp(),
  }, { merge: true });
  if (!game) return { reverted: 0, kept: [] };

  const isQR = game.round === "Qualification round";
  const dependsOnThis = (src) => !!src && (
    ((src.type === "winner" || src.type === "loser") && (src.game || src.dep) === gameId)
    || (src.type === "seed" && isQR));
  const rsnap = await getDocs(ecol("results"));
  const resById = {};
  rsnap.forEach((d) => (resById[d.id] = d.data()));

  let reverted = 0;
  const kept = [];
  for (const g of Object.values(gamesById)) {
    if (g.category !== game.category) continue;
    const patch = {};
    for (const [side, src] of [["teamA", g.srcA], ["teamB", g.srcB]]) {
      if (!dependsOnThis(src)) continue;
      const ph = slotPlaceholder(src, gamesById);
      if (ph && g[side]?.name !== ph) patch[side] = ph;
    }
    if (!Object.keys(patch).length) continue;
    const st = resById[g.id]?.status || "Not Started";
    if (st !== "Not Started") { kept.push(g.nr); continue; }
    const gameUpd = {}, resUpd = {}, repUpd = {};
    for (const [side, name] of Object.entries(patch)) {
      gameUpd[side] = { name, short: "" };
      resUpd[side] = name;
      repUpd[side] = cloneTeam({ name, players: [], staff: [] });
    }
    await setDoc(edoc("games", g.id), gameUpd, { merge: true });
    await setDoc(edoc("results", g.id), { ...resUpd, updatedAt: serverTimestamp() }, { merge: true });
    const rep = await getDoc(edoc("reports", g.id));
    if (rep.exists()) await updateDoc(edoc("reports", g.id), repUpd);
    reverted++;
  }
  return { reverted, kept };
}

/* ----------------- schedule generator config ----------------- */
export function subscribeScheduleConfig(cb) {
  return onSnapshot(edoc("meta", "schedule"),
    (d) => cb(d.exists() ? d.data().config : null),
    (err) => console.warn("schedule config unavailable:", err?.code || err));
}
export async function saveScheduleConfig(config) {
  await setDoc(edoc("meta", "schedule"), { config, updatedAt: serverTimestamp() });
}

/* ----------------- Excel import history ----------------- */
// A rolling log of roster imports, kept in one event-scoped meta doc.
// `at` is a client ISO string (serverTimestamp can't live inside an array).
export function subscribeImportLog(cb) {
  return onSnapshot(edoc("meta", "importLog"),
    (d) => cb(d.exists() ? (d.data().entries || []) : []),
    (err) => { console.warn("import log unavailable:", err?.code || err); cb([]); });
}
export async function appendImportLog(entry) {
  const ref = edoc("meta", "importLog");
  const snap = await getDoc(ref);
  const prev = snap.exists() ? (snap.data().entries || []) : [];
  const entries = [{ at: new Date().toISOString(), ...entry }, ...prev].slice(0, 20);
  await setDoc(ref, { entries, updatedAt: serverTimestamp() });
}

// Delete every doc in an event subcollection, chunked under the batch limit.
async function clearCollection(name) {
  const snap = await getDocs(ecol(name));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

// Write generated games. replaceAll wipes existing games + reports + results first.
export async function publishGames(games, { replaceAll } = {}) {
  if (replaceAll) {
    await clearCollection("reports");
    await clearCollection("results");
    await clearCollection("games");
  }
  // 200 games max per batch (2 writes each: game + its "Not Started" result).
  for (let i = 0; i < games.length; i += 200) {
    const batch = writeBatch(db);
    games.slice(i, i + 200).forEach((g) => {
      const id = `g${g.nr}`;
      batch.set(edoc("games", id), {
        nr: g.nr, date: g.date, time: g.time, court: g.court,
        bestOf: g.bestOf, round: g.round, category: g.category, group: g.group || "",
        teamA: g.teamA, teamB: g.teamB, srcA: g.srcA || null, srcB: g.srcB || null,
      });
      // Public results row so the spectator Live sees the whole fixture upfront.
      batch.set(edoc("results", id), {
        nr: g.nr, date: g.date, time: g.time, court: g.court,
        round: g.round, category: g.category, group: g.group || "", bestOf: g.bestOf,
        teamA: g.teamA.name, teamB: g.teamB.name,
        teamAShort: g.teamA.short || "", teamBShort: g.teamB.short || "",
        setsA: 0, setsB: 0, pointsA: 0, pointsB: 0, sets: [], status: "Not Started",
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
}

// Reassign day/time/court for individual games (manual drag-drop scheduling).
// Updates BOTH the game doc and its public results row so Fistball Live follows.
export async function updateGameSlots(updates) {
  for (let i = 0; i < updates.length; i += 200) {
    const batch = writeBatch(db);
    updates.slice(i, i + 200).forEach((u) => {
      const id = u.id || `g${u.nr}`; // prefer the stable doc id (nr may be renumbered)
      const patch = { date: u.date || "", time: u.time || "", court: u.court || "" };
      batch.set(edoc("games", id), patch, { merge: true });
      batch.set(edoc("results", id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  }
}

// Renumber games #1..N in chronological order (day · time · court), touching
// ONLY the display number — not the games themselves, their doc ids or the
// bracket. Updates the `nr` field on each game and its public result (and the
// snapshot in any existing report), so the number is consistent everywhere.
export async function renumberGames() {
  const toMin = (t) => { const [h, m] = String(t || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : 1e9; };
  const dOf = (s) => { const [d, m, y] = String(s || "").split("/").map(Number); return d ? new Date(2000 + (y || 0), (m || 1) - 1, d).getTime() : 8.64e15; };
  const gsnap = await getDocs(ecol("games"));
  const games = gsnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const sorted = [...games].sort((a, b) =>
    dOf(a.date) - dOf(b.date) || toMin(a.time) - toMin(b.time)
    || String(a.court || "").localeCompare(String(b.court || ""), undefined, { numeric: true })
    || (Number(a.nr) || 0) - (Number(b.nr) || 0));
  const [rSnap, repSnap] = await Promise.all([getDocs(ecol("results")), getDocs(ecol("reports"))]);
  const hasResult = new Set(rSnap.docs.map((d) => d.id));
  const hasReport = new Set(repSnap.docs.map((d) => d.id));
  let changed = 0;
  for (let i = 0; i < sorted.length; i += 150) {
    const batch = writeBatch(db);
    let ops = 0;
    sorted.slice(i, i + 150).forEach((g, j) => {
      const newNr = i + j + 1;
      if (Number(g.nr) === newNr) return;
      changed++; ops++;
      batch.update(edoc("games", g.id), { nr: newNr });
      if (hasResult.has(g.id)) batch.update(edoc("results", g.id), { nr: newNr, updatedAt: serverTimestamp() });
      if (hasReport.has(g.id)) batch.update(edoc("reports", g.id), { "info.nr": newNr });
    });
    if (ops) await batch.commit();
  }
  return { total: sorted.length, changed };
}

// Import a whole past event: games + real results (scores) + rosters.
export async function publishEventImport({ games, results, rosters, cautions }, { replaceAll } = {}) {
  if (replaceAll) {
    await clearCollection("reports");
    await clearCollection("results");
    await clearCollection("games");
    if (rosters && Object.keys(rosters).length) await clearCollection("rosters");
  }
  const g = games || [];
  for (let i = 0; i < g.length; i += 200) {
    const batch = writeBatch(db);
    g.slice(i, i + 200).forEach((x) => batch.set(edoc("games", `g${x.nr}`), {
      nr: x.nr, date: x.date, time: x.time, court: x.court, bestOf: x.bestOf, round: x.round, category: x.category, group: x.group || "", teamA: x.teamA, teamB: x.teamB,
    }));
    await batch.commit();
  }
  const rs = results || [];
  for (let i = 0; i < rs.length; i += 400) {
    const batch = writeBatch(db);
    rs.slice(i, i + 400).forEach((x) => batch.set(edoc("results", `g${x.nr}`), { ...x, updatedAt: serverTimestamp() }));
    await batch.commit();
  }
  const entries = Object.entries(rosters || {});
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db);
    entries.slice(i, i + 400).forEach(([k, v]) => batch.set(edoc("rosters", rosterKey(k)), v));
    await batch.commit();
  }
  // Cards (from the sheet's Cautions DB) go on the public event doc so Fistball
  // Live can render the Cards tab for this imported event.
  await writeEventPublic(reqEid(), { cautions: cautions || [] });
}

/* ----------------- players & staff registry (rosters) ----------------- */
export function subscribeRosters(cb) {
  const eid = reqEid();
  return onSnapshot(ecol("rosters"), (snap) => {
    if (eid !== _eid) return;
    const m = {};
    snap.forEach((d) => (m[d.id] = d.data()));
    cb(m);
  }, (err) => { console.warn("rosters unavailable:", err?.code || err); cb({}); });
}
export async function publishRosters(rosters) {
  const entries = Object.entries(rosters);
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db);
    entries.slice(i, i + 400).forEach(([key, v]) => batch.set(edoc("rosters", rosterKey(key)), v));
    await batch.commit();
  }
}
// Wipe the whole players & staff registry for the current event.
export async function clearRosters() { await clearCollection("rosters"); }

// Update a team's players in the registry (e.g. fix jersey numbers in-app,
// without re-uploading the file). `rosterId` is the roster doc id (t.key).
export async function updateRosterPlayers(rosterId, players) {
  await setDoc(edoc("rosters", rosterId), { players }, { merge: true });
}
/* ----------------- referees registry ----------------- */
export function subscribeReferees(cb) {
  return onSnapshot(ecol("referees"),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn("referees unavailable:", err?.code || err); cb([]); });
}
// Assign the referee team to a game (planning, on the schedule). Stored on the
// game doc as `refs`; pre-fills the game report when it's created.
export async function saveGameRefs(gameId, refs) {
  await setDoc(edoc("games", gameId), { refs }, { merge: true });
}

// Uniform a team wears in a game (referees decide per day, sometimes per game).
// side is "A" or "B"; kit is the team's uniform number (1 or 2, see team kits),
// or "" to clear. Older events stored a shirt hex string here. Mirrored onto
// the public result so the spectator app can show it too.
export async function saveGameKit(gameId, side, kit) {
  const patch = { kit: { [side]: kit || "" } };
  await setDoc(edoc("games", gameId), patch, { merge: true });
  try { await setDoc(edoc("results", gameId), patch, { merge: true }); } catch (_) { /* result may not exist */ }
}
const refereeId = (r, i) => (`${r.name}_${r.first}`).toLowerCase().replace(/[^a-z0-9]+/g, "_") || `ref_${i}`;
// Officials fields (see src/officials/model.js). The import may bring some of
// them; whatever it leaves blank is kept from the existing doc, so a re-import
// never wipes availability etc. edited in the app.
const OFFICIAL_FIELDS = ["roles", "country", "club", "gender", "lrPair", "availability", "maxPerDay"];
export async function publishReferees(list, { replaceAll } = {}) {
  const prev = {};
  (await getDocs(ecol("referees"))).forEach((d) => { prev[d.id] = d.data(); });
  if (replaceAll) await clearCollection("referees");
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    list.slice(i, i + 400).forEach((r, j) => {
      const id = refereeId(r, i + j);
      const data = { name: r.name, first: r.first, role: r.role || "Referee", photo: r.photo || "", birthday: r.birthday || "" };
      for (const k of OFFICIAL_FIELDS) {
        const v = r[k] ?? prev[id]?.[k];
        if (v !== undefined && v !== "") data[k] = v;
      }
      batch.set(edoc("referees", id), data);
    });
    await batch.commit();
  }
}
// Officials card: add one person, edit fields (top-level fields are replaced
// whole, e.g. the full availability map), or remove them from the registry.
export async function addReferee(r) {
  const id = refereeId(r, Date.now());
  await setDoc(edoc("referees", id), { name: r.name || "", first: r.first || "", role: "Referee", photo: "", birthday: "", ...r }, { merge: true });
  return id;
}
export async function updateReferee(id, patch) {
  const p = {};
  for (const [k, v] of Object.entries(patch)) p[k] = v === "" || v == null ? deleteField() : v;
  await updateDoc(edoc("referees", id), p);
}
export async function deleteReferee(id) {
  await deleteDoc(edoc("referees", id));
}

// "/" is illegal in a Firestore document id (it's a path separator), and some
// team names contain it (e.g. "ASBP/CONDOR/FMD"). Sanitize it for the roster id.
export const rosterKey = (k) => String(k || "").replace(/\//g, "∕");

// Rosters are keyed by "<team> - <category>" (so the same club/country can field
// a squad in more than one category), with a plain "<team>" fallback for older
// imports and events whose team names already carry the category. Never throws.
async function getRoster(teamName, category) {
  if (!teamName) return null;
  const keys = category ? [`${teamName} - ${category}`, teamName] : [teamName];
  for (const k of keys) {
    try {
      const s = await getDoc(edoc("rosters", rosterKey(k)));
      if (s.exists()) return s.data();
    } catch (_) { /* bad id or read error — skip this key */ }
  }
  return null;
}
export async function fetchTeamRosters(names, category) {
  const out = {};
  for (const name of [...new Set(names)]) {
    const r = await getRoster(name, category);
    if (r) out[name] = r;
  }
  return out;
}

/* ----------------- games ----------------- */
export function subscribeGames(cb) {
  const eid = reqEid();
  return onSnapshot(ecol("games"),
    (snap) => { if (eid === _eid) cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); },
    (err) => console.warn("games unavailable:", err?.code || err));
}

// Every published result (scores + cards) — used for standings embeds and the
// per-person match/card history on the Players & staff page.
export function subscribeResults(cb) {
  const eid = reqEid();
  return onSnapshot(ecol("results"),
    (snap) => { if (eid === _eid) cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); },
    (err) => { console.warn("results unavailable:", err?.code || err); cb([]); });
}

// Live status/lock of every report (for the list badges).
export function subscribeReports(cb) {
  const eid = reqEid();
  return onSnapshot(ecol("reports"), (snap) => {
    if (eid !== _eid) return;
    const map = {};
    snap.forEach((d) => {
      const r = d.data();
      map[d.id] = { status: r.status || "not_started", lockedBy: r.lockedBy || null };
    });
    cb(map);
  }, (err) => console.warn("reports unavailable:", err?.code || err));
}

/* ----------------- one report (súmula) ----------------- */
function cloneTeam(t) {
  return {
    name: t.name,
    players: (t.players || []).map((p) => ({
      nr: p.nr, name: p.name, first: p.first, photo: p.photo || "", captain: !!p.captain, onCourt: false,
      cards: { y: false, yr: false, r: false },
    })),
    staff: (t.staff || []).map((s) => ({
      role: s.role, name: s.name, first: s.first, photo: s.photo || "", cards: { y: false, yr: false, r: false },
    })),
  };
}
function blankReport(game) {
  return {
    matchId: game.id,
    info: { nr: game.nr, date: game.date, time: game.time, court: game.court, bestOf: game.bestOf, round: game.round, category: game.category, group: game.group || "" },
    teamA: cloneTeam(game.teamA),
    teamB: cloneTeam(game.teamB),
    sets: Array.from({ length: game.bestOf }, () => ({ rallies: [] })),
    timeouts: { teamA: [], teamB: [] },
    ballChoice: { set1: "", set5: "" },
    // Pre-fill from the referees assigned to the game in the schedule, if any.
    referees: { r1: "", r2: "", clerk: "", a1: "", a2: "", ...(game.refs || {}) },
    remarks: "", responsible: "",
    signatures: { capA: false, capB: false, referee: false, clerk: false },
    status: "not_started",
    lockedBy: null,
  };
}

// Build a report-shaped object WITHOUT writing it — used to render a read-only
// súmula when no report doc exists (archived/imported events) OR when the viewer
// lacks member read access. Prefers the members-only game doc, but falls back to
// the PUBLIC results doc so any signed-in user can at least open the game.
export async function buildReportSeed(gameId) {
  let game = null;
  try {
    const gsnap = await getDoc(edoc("games", gameId));
    if (gsnap.exists()) game = { id: gameId, ...gsnap.data() };
  } catch (_) { /* members-only read denied — fall back to public results */ }
  if (!game) {
    try {
      const rsnap = await getDoc(edoc("results", gameId)); // public read
      if (rsnap.exists()) {
        const r = rsnap.data();
        game = {
          id: gameId, nr: r.nr, date: r.date, time: r.time, court: r.court,
          bestOf: r.bestOf || 3, round: r.round, category: r.category, group: r.group || "",
          teamA: r.teamA, teamB: r.teamB,
        };
      }
    } catch (_) { /* even the public read failed */ }
  }
  if (!game) return null;
  // results stores team names as strings; normalise to the {name,players,staff} shape.
  for (const side of ["teamA", "teamB"]) {
    if (typeof game[side] === "string") game[side] = { name: game[side], players: [], staff: [] };
  }
  // Enrich with rosters when the viewer can read them (members only) — best effort.
  for (const side of ["teamA", "teamB"]) {
    try {
      const r = await getRoster(game[side]?.name, game.category);
      if (r) game[side] = { ...game[side], players: r.players, staff: r.staff };
    } catch (_) { /* rosters are members-only */ }
  }
  return blankReport(game);
}

const REF_KEYS = ["r1", "r2", "clerk", "a1", "a2"];
export async function ensureReport(gameId) {
  const ref = edoc("reports", gameId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    // Report already exists: backfill referees from the game's assignment if the
    // report has none yet (so games scored before an assignment still pick it up).
    const refs = snap.data().referees || {};
    const hasRefs = REF_KEYS.some((k) => (refs[k] || "").trim());
    if (!hasRefs) {
      try {
        const g = await getDoc(edoc("games", gameId));
        const gr = g.exists() ? g.data().refs : null;
        if (gr && REF_KEYS.some((k) => (gr[k] || "").trim())) {
          await updateDoc(ref, { referees: { r1: "", r2: "", clerk: "", a1: "", a2: "", ...gr } });
        }
      } catch (e) { console.warn("referee backfill skipped:", e?.code || e); }
    }
    return;
  }
  const gsnap = await getDoc(edoc("games", gameId));
  if (!gsnap.exists()) return;
  const game = { id: gameId, ...gsnap.data() };
  for (const side of ["teamA", "teamB"]) {
    const r = await getRoster(game[side]?.name, game.category);
    if (r) game[side] = { ...game[side], players: r.players, staff: r.staff };
  }
  try { await setDoc(ref, blankReport(game)); }
  catch (e) { console.warn("ensureReport (read-only?):", e?.code || e); }
}

export function subscribeReport(gameId, cb) {
  const eid = reqEid();
  return onSnapshot(edoc("reports", gameId),
    (d) => { if (eid === _eid) cb(d.exists() ? d.data() : null); },
    (err) => console.warn("report unavailable:", err?.code || err));
}

// Re-pull both line-ups from the roster registry.
export async function reloadReportRoster(gameId) {
  const ref = edoc("reports", gameId);
  const snap = await getDoc(ref);
  const rep = snap.data();
  if (!rep) return { updated: [], missing: [] };
  const patch = {};
  const updated = [], missing = [];
  for (const side of ["teamA", "teamB"]) {
    const name = rep[side]?.name;
    const r = await getRoster(name, rep.info?.category);
    if (r) { patch[side] = cloneTeam({ name, players: r.players, staff: r.staff }); updated.push(name); }
    else if (name) missing.push(name);
  }
  if (Object.keys(patch).length) await updateDoc(ref, patch);
  return { updated, missing };
}

/* ----------------- locking ----------------- */
// A lock whose heartbeat (every 20s) stopped this long ago is considered
// abandoned (e.g. a tablet that froze/closed) and can be taken over.
const STALE_LOCK_MS = 60000;
export async function acquireLock(gameId, me) {
  const ref = edoc("reports", gameId);
  const lockPatch = { lockedBy: { uid: me.uid, name: me.name }, lockedAt: serverTimestamp() };
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? snap.data() : {};
      const lock = data.lockedBy;
      const ts = data.lockedAt?.toMillis ? data.lockedAt.toMillis() : 0;
      const stale = ts > 0 && Date.now() - ts > STALE_LOCK_MS;
      if (lock && lock.uid !== me.uid && !stale) return { ok: false, lockedBy: lock };
      // set+merge (not update) so a missing report doc — never scored, cleared by
      // a reset, or a write not yet synced — doesn't make the lock fail.
      tx.set(ref, { ...lockPatch, status: data.status === "submitted" ? "submitted" : "in_progress" }, { merge: true });
      return { ok: true, tookOver: !!(lock && lock.uid !== me.uid) };
    });
  } catch (e) {
    // Transactions need a live connection and can fail on flaky venue wifi —
    // never let that block scoring. Fall back to a direct write (queues offline
    // and syncs on reconnect). Worst case two devices race; heartbeat + stale
    // takeover resolve it, and the report is a single doc anyway.
    console.warn("acquireLock transaction failed — direct-set fallback:", e?.code || e);
    try {
      await setDoc(ref, { ...lockPatch, status: "in_progress" }, { merge: true });
      return { ok: true, fallback: true };
    } catch (e2) {
      console.warn("acquireLock fallback failed:", e2?.code || e2);
      return { ok: false, error: e2?.code || String(e2) };
    }
  }
}
export async function heartbeat(gameId, me) {
  const ref = edoc("reports", gameId);
  const snap = await getDoc(ref);
  if (snap.data()?.lockedBy?.uid === me.uid) await updateDoc(ref, { lockedAt: serverTimestamp() });
}
export async function releaseLock(gameId, me) {
  const ref = edoc("reports", gameId);
  const snap = await getDoc(ref);
  const data = snap.data();
  if (!data) return;
  if (data.lockedBy?.uid === me.uid && data.status !== "submitted") {
    await updateDoc(ref, { lockedBy: null, status: data.hasData ? "draft" : "not_started" });
  }
}
export async function adminUnlock(gameId) {
  await updateDoc(edoc("reports", gameId), { lockedBy: null });
}
// Reopen a submitted report to amend it (e.g. remove a card after a review).
// Event admins only (enforced by the rules). Keeps the scores; logs who/when/why
// in `amendments`. While `amending`, the public result stays "Finished".
export async function reopenReport(gameId, me, reason) {
  await updateDoc(edoc("reports", gameId), {
    status: "draft", lockedBy: null, amending: true,
    amendments: arrayUnion({ at: new Date().toISOString(), by: me?.name || me?.email || "—", reason: reason || "" }),
  });
}

/* ----------------- saving ----------------- */
export async function saveReport(gameId, me, patch) {
  await updateDoc(edoc("reports", gameId), {
    ...patch,
    status: "in_progress",
    hasData: true,
    updatedBy: { uid: me.uid, name: me.name },
    updatedAt: serverTimestamp(),
  });
  await publishResult(gameId);
}
export async function submitReport(gameId, me) {
  await updateDoc(edoc("reports", gameId), {
    status: "submitted",
    lockedBy: null,
    amending: false,
    submittedBy: { uid: me.uid, name: me.name },
    submittedAt: serverTimestamp(),
  });
  await publishResult(gameId);
  // Advance the whole bracket (all categories) — best-effort, and resilient to a
  // single submit's advancement failing (the next submit/open re-tries).
  await runAdvancementAll();
}

// Auto-advancement: after a result lands, fill the placeholder slots of later
// knockout games — seeds from the QR ranking, and winners/losers of finished
// games — updating the game, its public result and (if present) its report.
// Resolve one category's knockout slots from finished sources. Returns how many
// slots were filled. Throws on write errors (callers decide whether to swallow).
async function advanceCategory(category, allGames, allRes) {
  const games = allGames.filter((g) => g.category === category);
  if (!games.length) return 0;
  const resultsById = {};
  for (const g of games) if (allRes[g.id]) resultsById[g.id] = allRes[g.id];
  const qrTeams = new Set();
  games.filter((g) => g.round === "Qualification round").forEach((g) => {
    if (g.teamA?.name) qrTeams.add(g.teamA.name);
    if (g.teamB?.name) qrTeams.add(g.teamB.name);
  });
  const shaped = games.map((g) => ({
    id: g.id, category: g.category, phase: g.round === "Qualification round" ? "group" : "ko",
    round: g.round, teamA: g.teamA?.name, teamB: g.teamB?.name, srcA: g.srcA, srcB: g.srcB,
  }));
  const patches = resolveAdvancement(shaped, resultsById, qrTeams.size);
  let filled = 0;
  for (const [gid, patch] of Object.entries(patches)) {
    const gameUpd = {}, resUpd = {}, repUpd = {};
    for (const side of ["teamA", "teamB"]) {
      const name = patch[side];
      if (!name) continue;
      const roster = await getRoster(name, category);
      gameUpd[side] = team(name);
      resUpd[side] = name;
      repUpd[side] = cloneTeam({ name, players: roster?.players || [], staff: roster?.staff || [] });
    }
    if (Object.keys(gameUpd).length) await updateDoc(edoc("games", gid), gameUpd);
    if (Object.keys(resUpd).length) await setDoc(edoc("results", gid), resUpd, { merge: true });
    const rep = await getDoc(edoc("reports", gid));
    if (rep.exists()) await updateDoc(edoc("reports", gid), repUpd);
    filled++;
  }
  return filled;
}

export async function runAdvancement(category) {
  if (!category) return;
  try {
    const [gsnap, rsnap] = await Promise.all([getDocs(ecol("games")), getDocs(ecol("results"))]);
    const allGames = gsnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const allRes = {}; rsnap.forEach((d) => (allRes[d.id] = d.data()));
    await advanceCategory(category, allGames, allRes);
  } catch (e) { console.warn("runAdvancement failed:", e?.code || e); }
}

// Fill every category's bracket from whatever is finished (self-heal / manual
// "Advance bracket" button). With { silent:false } it throws so the UI can
// report failures instead of leaving the bracket quietly stuck.
export async function runAdvancementAll({ silent = true } = {}) {
  const run = async () => {
    const [gsnap, rsnap] = await Promise.all([getDocs(ecol("games")), getDocs(ecol("results"))]);
    const allGames = gsnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const allRes = {}; rsnap.forEach((d) => (allRes[d.id] = d.data()));
    const cats = [...new Set(allGames.map((g) => g.category).filter(Boolean))];
    let filled = 0;
    for (const c of cats) filled += await advanceCategory(c, allGames, allRes);
    return filled;
  };
  if (silent) { try { return await run(); } catch (e) { console.warn("runAdvancementAll failed:", e?.code || e); return 0; } }
  return run();
}

/* ----------------- publish to Fistball Live ----------------- */
// Disciplinary cards logged on a report, flattened for the public results doc.
// Fistball Live aggregates these (across all games) into its Cards tab.
function deriveCards(rep) {
  const out = [];
  const i = rep.info || {};
  for (const side of ["teamA", "teamB"]) {
    const t = rep[side];
    if (!t) continue;
    const push = (list, isStaff) => (list || []).forEach((p) => {
      const c = p.cards || {};
      if (!c.y && !c.yr && !c.r) return;
      out.push({
        team: t.name || "", category: i.category || "",
        nr: isStaff ? "" : (p.nr || ""), name: p.name || "", first: p.first || "",
        role: isStaff ? (p.role || "Staff") : "",
        y: c.y ? 1 : 0, yr: c.yr ? 1 : 0, r: c.r ? 1 : 0,
      });
    });
    push(t.players, false);
    push(t.staff, true);
  }
  return out;
}
function deriveResult(rep) {
  const sets = [];
  let setsA = 0, setsB = 0, pointsA = 0, pointsB = 0;
  for (const s of rep.sets || []) {
    const r = s.rallies || [];
    if (!r.length) continue;
    const a = r.filter((x) => x === "A").length;
    const b = r.filter((x) => x === "B").length;
    // objects, not [a,b] — Firestore rejects nested arrays. seq = point-by-point
    // order ("AABA…"), public for the Live game ticker.
    sets.push({ a, b, seq: r.filter((x) => x === "A" || x === "B").join("") });
    pointsA += a; pointsB += b;
    if (a > b) setsA++; else if (b > a) setsB++;
  }
  let status = "Not Started";
  if (rep.status === "submitted" || rep.amending) status = "Finished";
  else if (sets.length) status = "In progress";
  const i = rep.info || {};
  // Flat scoreboard fields for broadcast graphics (vMix/Singular read them from
  // the public JSON): only COMPLETED sets count as won (a fistball set ends at
  // 11 with a 2-point lead, or at 15); live* is the set being played.
  const setDone = (s) => (Math.max(s.a, s.b) >= 11 && Math.abs(s.a - s.b) >= 2) || Math.max(s.a, s.b) >= 15;
  const last = sets[sets.length - 1];
  const playing = status === "In progress" && last && !setDone(last) ? last : null;
  const closed = playing ? sets.slice(0, -1) : sets;
  const live = {
    liveSetsA: closed.filter((s) => s.a > s.b).length,
    liveSetsB: closed.filter((s) => s.b > s.a).length,
    liveSet: status === "Finished" ? 0 : playing ? sets.length : sets.length + 1,
    livePointsA: playing ? playing.a : 0,
    livePointsB: playing ? playing.b : 0,
  };
  // The set being played isn't won yet — don't count it in setsA/setsB either.
  if (playing) { setsA = live.liveSetsA; setsB = live.liveSetsB; }
  return {
    nr: i.nr, date: i.date, time: i.time, court: i.court,
    round: i.round, category: i.category, group: i.group || "", bestOf: i.bestOf,
    teamA: rep.teamA?.name || "", teamB: rep.teamB?.name || "",
    setsA, setsB, pointsA, pointsB, sets, status, ...live,
    cards: deriveCards(rep),
    updatedAt: serverTimestamp(),
  };
}
export async function publishResult(gameId) {
  try {
    const snap = await getDoc(edoc("reports", gameId));
    if (!snap.exists()) return;
    // merge: keep fields only the schedule publish writes (teamAShort/teamBShort),
    // which Fistball Live and the broadcast overlay use for display names.
    await setDoc(edoc("results", gameId), deriveResult(snap.data()), { merge: true });
  } catch (e) {
    console.warn("publishResult failed:", e);
  }
}
