import localforage from "localforage";
import { SEED_MATCHES } from "./seed";

const db = localforage.createInstance({ name: "fistball-scoring" });
const MATCHES_KEY = "matches";
const draftKey = (id) => `draft:${id}`;

export async function initStore() {
  const existing = await db.getItem(MATCHES_KEY);
  if (!existing) await db.setItem(MATCHES_KEY, SEED_MATCHES);
}

export async function getMatches() {
  let list = await db.getItem(MATCHES_KEY);
  if (!list) { list = SEED_MATCHES; await db.setItem(MATCHES_KEY, list); }
  return list;
}

export async function getMatch(id) {
  const list = await getMatches();
  return list.find((m) => m.id === id) || null;
}

export async function loadDraft(id) {
  return (await db.getItem(draftKey(id))) || null;
}

export async function saveDraft(id, data) {
  const next = { ...data, updatedAt: Date.now() };
  await db.setItem(draftKey(id), next);
  return next;
}

// One map of every draft's state, for the match list badges.
export async function draftStates() {
  const keys = await db.keys();
  const out = {};
  for (const k of keys) {
    if (!k.startsWith("draft:")) continue;
    const d = await db.getItem(k);
    out[k.slice(6)] = {
      status: d?.submittedAt ? "submitted" : "draft",
      updatedAt: d?.updatedAt,
    };
  }
  return out;
}

// Build a blank súmula from the match's roster.
function cloneTeam(t) {
  return {
    name: t.name,
    players: (t.players || []).map((p) => ({
      nr: p.nr, name: p.name, first: p.first,
      captain: !!p.captain, onCourt: false,
      cards: { y: false, yr: false, r: false },
    })),
    staff: (t.staff || []).map((s) => ({
      role: s.role, name: s.name, first: s.first,
      cards: { y: false, yr: false, r: false },
    })),
  };
}

function initDraft(m) {
  return {
    matchId: m.id,
    info: {
      nr: m.nr, date: m.date, time: m.time, court: m.court,
      bestOf: m.bestOf, round: m.round, category: m.category,
    },
    teamA: cloneTeam(m.teamA),
    teamB: cloneTeam(m.teamB),
    // Each set is a rally-by-rally record: who won each rally ('A' | 'B').
    sets: Array.from({ length: m.bestOf }, () => ({ rallies: [] })),
    ballChoice: { set1: "", set5: "" },
    referees: { r1: "", r2: "", clerk: "", a1: "", a2: "" },
    remarks: "",
    responsible: "",
    signatures: { capA: false, capB: false, referee: false, clerk: false },
  };
}

export async function getOrInitDraft(id) {
  const existing = await loadDraft(id);
  if (existing) return existing;
  const m = await getMatch(id);
  if (!m) return null;
  return saveDraft(id, initDraft(m));
}

// Mark as submitted. Later this also enqueues for Firestore sync.
export async function submitDraft(id) {
  const d = await loadDraft(id);
  if (!d) return null;
  return saveDraft(id, { ...d, submittedAt: Date.now() });
}
