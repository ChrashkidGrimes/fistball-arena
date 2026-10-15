// Seed the Firebase emulators with demo users and a demo event, so the local
// test environment (compose.yaml) is usable right away.
//
//   node scripts/seed-emulator.mjs           # seed once (skips if already seeded)
//   node scripts/seed-emulator.mjs --reset   # wipe ALL emulator data, then seed
//
// Needs FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST (host:port).
// Talks to the emulators' REST APIs with the "owner" token, which bypasses
// security rules — so no extra dependencies. Refuses to run without the
// emulator variables, so it can never write to a real project.

import { generateSchedule } from "../src/schedule/generator.js";
import { eventToConfig } from "../src/schedule/eventToConfig.js";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-fistball";
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const RESET = process.argv.includes("--reset");
if (!FS || !AUTH) {
  console.error("Set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST (emulators only).");
  process.exit(1);
}
if (!PROJECT.startsWith("demo-")) {
  console.error(`Refusing to seed project "${PROJECT}" — only demo-* projects.`);
  process.exit(1);
}

const EVENT_ID = "demo-cup";
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

/* ----------------- demo users (one per role) ----------------- */
// Sign in at http://localhost:5173 → "Sign in with Google" → pick one of these
// in the emulator's account chooser.
const USERS = [
  { email: "orgadmin@fistball.test", name: "Olga Org-Admin", orgAdmin: true },
  { email: "admin@fistball.test", name: "Anna Event-Admin", role: "admin" },
  { email: "official@fistball.test", name: "Otto Official", role: "official" },
  { email: "viewer@fistball.test", name: "Vera Viewer", role: "viewer" },
];

/* ----------------- demo event ----------------- */
const MEN = ["Germany", "Austria", "Switzerland", "Brazil", "Italy", "Chile"];
const WOMEN = ["Germany", "Austria", "Switzerland", "Brazil"];
const CAT_MEN = "National Teams U18 Men";
const CAT_WOMEN = "National Teams U18 Women";

const FIRST_M = ["Lukas", "Jonas", "Felix", "Paul", "Elias", "Noah", "Tim", "Jan", "Ben", "Nico"];
const FIRST_W = ["Lena", "Mia", "Emma", "Lea", "Sofia", "Hannah", "Clara", "Laura", "Nina", "Julia"];
const LAST = ["Müller", "Schmid", "Weber", "Keller", "Huber", "Rossi", "Silva", "Costa", "Bauer", "Frei", "Moser", "Ferrari", "Rojas", "Graf"];

// Same as rosterKey() in src/cloud.js (which pulls in the Firebase SDK).
const rosterKey = (k) => String(k || "").replace(/\//g, "∕");

function pick(list, i) { return list[i % list.length]; }

// Deterministic squads: 10 players + 2 staff per team, numbers 1–10, captain #1.
function squad(teamIdx, women) {
  const firsts = women ? FIRST_W : FIRST_M;
  const players = Array.from({ length: 10 }, (_, i) => ({
    nr: i + 1, name: pick(LAST, teamIdx * 3 + i), first: pick(firsts, teamIdx + i * 3), captain: i === 0,
  }));
  const staff = [
    { role: "Head Coach", name: pick(LAST, teamIdx + 7), first: pick(FIRST_M, teamIdx + 5) },
    { role: "Manager", name: pick(LAST, teamIdx + 11), first: pick(FIRST_W, teamIdx + 2) },
  ];
  return { players, staff };
}

// Officials, twice what one round needs (2 courts → per round 4 referees,
// 2 clerks, 4 assistants; one court manager can cover both courts). `roles` / `country` / `gender` / `assistantPair` are the
// officials fields from src/officials/model.js (older app versions ignore them).
const official = (role, roles) => ([name, first, country, gender, assistantPair]) =>
  ({ name, first, role, roles, country, gender, ...(assistantPair ? { assistantPair } : {}), photo: "", birthday: "" });
// Uniforms: two shirt colours per team
// and the event's referee shirt colours. Several teams share red / white, so
// "all in Uniform 1" clashes and "Suggest uniforms" has something to solve;
// every pairing (incl. knockout) is solvable, each with a fitting referee shirt.
const WHITE = "#ffffff", BLACK = "#1a1a1a", RED = "#e23b3b", YELLOW = "#f2c20a", BLUE = "#2f6df0";
const kits = (s1, s2) => [{ shirt: s1 }, { shirt: s2 }];
const TEAM_KITS = {
  Germany: kits(WHITE, BLACK),
  Austria: kits(RED, WHITE),
  Switzerland: kits(RED, WHITE),
  Brazil: kits(YELLOW, BLUE),
  Italy: kits(BLUE, WHITE),
  Chile: kits(RED, WHITE),
};
const REF_KITS = [
  { id: "ref-mint", name: "Mint green", shirt: "#3eb489" },
  { id: "ref-black", name: "Black", shirt: BLACK },
  { id: "ref-red", name: "Red", shirt: RED },
];

const REFEREES = [
  // Referees: six from playing nations (they must not referee their own
  // team), two neutral ones; ranks top / good / normal for the assignment.
  ...[
    ["Becker", "Thomas", "Germany", "m", "normal"], ["Lehmann", "Sabine", "Namibia", "f", "top"], ["Pereira", "João", "Brazil", "m", "good"], ["Zanetti", "Marco", "Italy", "m", "normal"],
    ["Hofer", "Martin", "Austria", "m", "good"], ["Brunner", "Claudia", "Switzerland", "f", "good"], ["Vogel", "Stefan", "United States", "m", "top"], ["Araya", "Camila", "Chile", "f", "normal"],
  ].map(([name, first, country, gender, rank]) => ({ ...official("Referee", ["referee"])([name, first, country, gender]), ...(rank !== "normal" ? { rank } : {}) })),
  // Clerks
  ...[
    ["Krämer", "Ute", "Germany", "f"], ["Lindner", "Paul", "Austria", "m"], ["Meier", "Anna", "Switzerland", "f"], ["Souza", "Lucas", "Brazil", "m"],
  ].map(official("Clerk", ["clerk"])),
  // Court managers (may cover both courts at once)
  ...[
    ["Schulte", "Petra", "Germany", "f"], ["Novak", "Jan", "Austria", "m"],
  ].map(official("Court manager", ["courtManager"])),
  // Assistants (line judges), in fixed pairs
  ...[
    ["Fuchs", "Jana", "Germany", "f", "pair-1"], ["Wolf", "Erik", "Germany", "m", "pair-1"],
    ["Gruber", "Lisa", "Austria", "f", "pair-2"], ["Steiner", "Felix", "Austria", "m", "pair-2"],
    ["Bianchi", "Giulia", "Italy", "f", "pair-3"], ["Ricci", "Luca", "Italy", "m", "pair-3"],
    ["Rojas", "Diego", "Chile", "m", "pair-4"], ["Muñoz", "Valentina", "Chile", "f", "pair-4"],
  ].map(official("Assistant", ["assistant"])),
];

// Event days: today and tomorrow, so the event shows up as "current".
const pad = (n) => String(n).padStart(2, "0");
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d; };
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const [d1, d2] = [day(0), day(1)];
const datesLabel = d1.getMonth() === d2.getMonth()
  ? `${d1.getDate()}–${d2.getDate()} ${MON[d1.getMonth()]} ${d1.getFullYear()}`
  : `${d1.getDate()} ${MON[d1.getMonth()]} – ${d2.getDate()} ${MON[d2.getMonth()]} ${d2.getFullYear()}`;

const entries = [...new Set([...MEN, ...WOMEN])].map((name) => ({
  name, short: name.slice(0, 3).toUpperCase(),
  cats: [MEN.includes(name) && CAT_MEN, WOMEN.includes(name) && CAT_WOMEN].filter(Boolean),
}));
const event = {
  name: "Demo Cup",
  place: "Teststadt",
  address: "Sportplatz 1, 12345 Teststadt",
  dates: datesLabel,
  startDate: iso(d1),
  endDate: iso(d2),
  status: "active",
  createdBy: "seed",
  categoryBuilder: { types: ["national"], sexes: ["men", "women"], ages: ["U18"] },
  entries,
  formatOverrides: {},
  formatVariants: { [CAT_MEN]: { bestOf: 3, bestOfKo: 5 }, [CAT_WOMEN]: { bestOf: 3, bestOfKo: 5 } },
  slots: {
    courts: ["1", "2"],
    days: [{ date: dmy(d1), start: "09:00", end: "18:00" }, { date: dmy(d2), start: "09:00", end: "18:00" }],
    gameMinutes: 45, breakMinutes: 15,
  },
};

/* ----------------- second demo event: club teams ----------------- */
// Club competition (Ahlhorn style): categories "Clubs Men" / "Clubs Women",
// each club with its nation and club name. Some officials belong to a
// playing club (never used for that club's games); in club competitions a
// referee from a club's nation is only a warning. Elgg plays in both
// categories with different uniforms (kits per team and category).
const CLUB_EVENT_ID = "demo-club-cup";
const CLUB_MEN_CAT = "Clubs Men", CLUB_WOMEN_CAT = "Clubs Women";
const CLUBS = [ // name, short, nation, categories
  ["Pfungstadt", "PFU", "Germany", ["m"]], ["Hagen", "HAG", "Germany", ["m"]], ["Elgg", "ELG", "Switzerland", ["m", "w"]],
  ["Wigoltingen", "WIG", "Switzerland", ["m"]], ["Linz", "LIN", "Austria", ["m"]], ["Vöcklabruck", "VÖC", "Austria", ["m"]],
  ["Ahlhorn", "AHL", "Germany", ["w"]], ["Schneverdingen", "SCH", "Germany", ["w"]], ["Diepoldsau", "DIE", "Switzerland", ["w"]],
  ["Freistadt", "FRE", "Austria", ["w"]], ["Nussbach", "NUS", "Austria", ["w"]],
];
const CLUB_MEN = CLUBS.filter((c) => c[3].includes("m")).map((c) => c[0]);
const CLUB_WOMEN = CLUBS.filter((c) => c[3].includes("w")).map((c) => c[0]);
const clubEntries = CLUBS.map(([name, short, country, cats]) => ({
  name, short, country, club: name, cats: cats.map((c) => (c === "m" ? CLUB_MEN_CAT : CLUB_WOMEN_CAT)),
}));
const NAVY = "#1c2c66", SKY = "#38bdf8", VIOLET = "#7c3aed";
const ck = (team, cat) => `${team} · ${cat}`; // kits per team and category (src/kits.js kitKey)
const CLUB_KITS = {
  [ck("Elgg", CLUB_MEN_CAT)]: kits(WHITE, BLACK), [ck("Linz", CLUB_MEN_CAT)]: kits(BLUE, BLACK),
  [ck("Pfungstadt", CLUB_MEN_CAT)]: kits(YELLOW, BLACK), [ck("Vöcklabruck", CLUB_MEN_CAT)]: kits(WHITE, RED),
  [ck("Hagen", CLUB_MEN_CAT)]: kits(YELLOW, BLUE), [ck("Wigoltingen", CLUB_MEN_CAT)]: kits(BLACK, VIOLET),
  [ck("Ahlhorn", CLUB_WOMEN_CAT)]: kits(NAVY, SKY), [ck("Diepoldsau", CLUB_WOMEN_CAT)]: kits(BLUE, WHITE),
  [ck("Elgg", CLUB_WOMEN_CAT)]: kits(BLUE, BLACK), [ck("Freistadt", CLUB_WOMEN_CAT)]: kits(RED, BLACK),
  [ck("Schneverdingen", CLUB_WOMEN_CAT)]: kits(RED, WHITE), [ck("Nussbach", CLUB_WOMEN_CAT)]: kits(BLACK, WHITE),
};
const CLUB_REF_KITS = [
  { id: "ref-black", name: "Black", shirt: BLACK },
  { id: "ref-lightblue", name: "Light blue", shirt: "#6ca0dc" },
  { id: "ref-mint", name: "Mint green", shirt: "#3eb489" },
];
// Twice what one round needs: 3 courts, Referee 2 only in the finals rounds,
// Clerk 2 on court 1 (→ per round 3 referees, 4 clerks, 6 assistants).
const clubOfficial = (role, roles) => ([name, first, country, gender, club, rank, assistantPair]) => ({
  ...official(role, roles)([name, first, country, gender, assistantPair]),
  ...(club ? { club } : {}), ...(rank && rank !== "normal" ? { rank } : {}),
});
const CLUB_OFFICIALS = [
  ...[
    ["Maier", "Stefan", "Germany", "m", "", "top"], ["Keller", "Ruth", "Switzerland", "f", "Elgg", "good"],
    ["Huber", "Josef", "Austria", "m", "Linz", "normal"], ["Rossi", "Paolo", "Italy", "m", "", "top"],
    ["Dvořák", "Eva", "Czech Republic", "f", "", "good"], ["Schmid", "Urs", "Switzerland", "m", "", "normal"],
    ["Wagner", "Petra", "Germany", "f", "Ahlhorn", "normal"], ["Brandl", "Karl", "Austria", "m", "", "good"],
  ].map(clubOfficial("Referee", ["referee"])),
  ...[
    ["Albers", "Heike", "Germany", "f", "Ahlhorn"], ["Bäumer", "Tim", "Germany", "m", "Pfungstadt"], ["Frick", "Sandra", "Switzerland", "f", ""],
    ["Gasser", "Reto", "Switzerland", "m", "Diepoldsau"], ["Leitner", "Maria", "Austria", "f", ""], ["Pichler", "Florian", "Austria", "m", "Freistadt"],
    ["Vogt", "Ines", "Germany", "f", "Hagen"], ["Zürcher", "Marco", "Switzerland", "m", ""],
  ].map(clubOfficial("Clerk", ["clerk"])),
  ...[["Hartmann", "Jörg", "Germany", "m", ""], ["Zangerl", "Theresa", "Austria", "f", ""]].map(clubOfficial("Court manager", ["courtManager"])),
  ...[
    ["Kühn", "Lea", "Germany", "f", "Schneverdingen", "good", "pair-1"], ["Ott", "Ben", "Germany", "m", "Schneverdingen", "good", "pair-1"],
    ["Baumann", "Nina", "Switzerland", "f", "", "normal", "pair-2"], ["Meili", "Jan", "Switzerland", "m", "", "normal", "pair-2"],
    ["Egger", "Sara", "Austria", "f", "Nussbach", "normal", "pair-3"], ["Haas", "David", "Austria", "m", "Nussbach", "normal", "pair-3"],
    ["Lang", "Mia", "Germany", "f", "", "top", "pair-4"], ["Roth", "Felix", "Germany", "m", "", "top", "pair-4"],
    ["Wirth", "Anja", "Austria", "f", "Vöcklabruck", "normal", "pair-5"], ["Kofler", "Paul", "Austria", "m", "Vöcklabruck", "normal", "pair-5"],
    ["Steiger", "Lara", "Switzerland", "f", "", "good", "pair-6"], ["Imhof", "Nico", "Switzerland", "m", "", "good", "pair-6"],
  ].map(clubOfficial("Assistant", ["assistant"])),
];
const clubEvent = {
  ...event,
  name: "Demo Club Cup",
  place: "Vereinsdorf",
  address: "Faustballplatz 2, 54321 Vereinsdorf",
  categoryBuilder: { types: ["clubs"], sexes: ["men", "women"], ages: [] },
  entries: clubEntries,
  formatVariants: { [CLUB_MEN_CAT]: { bestOf: 3, bestOfKo: 5 }, [CLUB_WOMEN_CAT]: { bestOf: 3, bestOfKo: 5 } },
  officialsRules: { r2: "finals", clerk2Courts: ["1"], finalRefsOnLines: true },
  slots: { ...event.slots, courts: ["1", "2", "3"] },
};

/* ----------------- Firestore REST helpers ----------------- */
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "object") return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
}
function fields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = enc(v);
  return out;
}

async function call(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method || "GET"} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

// Writes are full document sets (like setDoc without merge), 400 per commit.
async function commit(docs) {
  for (let i = 0; i < docs.length; i += 400) {
    const writes = docs.slice(i, i + 400).map(([path, data]) => ({
      update: { name: `${DOCS}/${path}`, fields: fields(data) },
    }));
    await call(`http://${FS}/v1/${DOCS}:commit`, { method: "POST", headers: OWNER, body: JSON.stringify({ writes }) });
  }
}

// Ids of all events (incl. ones that only hold subcollections).
async function eventIds() {
  const ids = [];
  let pageToken = "";
  do {
    const res = await call(`http://${FS}/v1/${DOCS}/events?pageSize=300&showMissing=true&mask.fieldPaths=name${pageToken ? `&pageToken=${pageToken}` : ""}`, { headers: OWNER });
    ids.push(...(res.documents || []).map((d) => d.name.split("/").pop()));
    pageToken = res.nextPageToken || "";
  } while (pageToken);
  return ids;
}

// Create (or refresh) a Google-provider account in the Auth emulator. The
// emulator accepts an unsigned JSON id_token, like its own sign-in popup.
async function ensureGoogleUser({ email, name }) {
  const idToken = JSON.stringify({ sub: `seed-${email}`, email, email_verified: true, name });
  await call(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestUri: "http://localhost",
      postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
      returnSecureToken: true,
    }),
  });
}

/* ----------------- one event's documents ----------------- */
// Event, public info, uniforms, rosters, officials, and the schedule from the
// same generator the Settings wizard runs (+ the docs publishGames() writes).
function eventDocs({ id, ev, men, women, catMen, catWomen, teamKits, refKits, officials, squadOffset }, now) {
  const docs = [];
  docs.push([`events/${id}`, { ...ev, createdAt: now }]);
  docs.push([`public/event_${id}`, {
    eventId: id, name: ev.name, place: ev.place, address: ev.address,
    dates: ev.dates, startsAt: ev.startDate, endsAt: ev.endDate,
  }]);
  docs.push([`public/teamkits_${id}`, { eventId: id, kits: teamKits, refKits }]);
  // Rosters, keyed "<team> - <category>" like the roster import.
  men.forEach((t, i) => docs.push([`events/${id}/rosters/${rosterKey(`${t} - ${catMen}`)}`, { name: `${t} - ${catMen}`, ...squad(i + squadOffset, false) }]));
  women.forEach((t, i) => docs.push([`events/${id}/rosters/${rosterKey(`${t} - ${catWomen}`)}`, { name: `${t} - ${catWomen}`, ...squad(i + squadOffset + 20, true) }]));
  officials.forEach((r) => docs.push([`events/${id}/referees/${`${r.name}_${r.first}`.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, r]));
  const { games, warnings, unplaced } = generateSchedule(eventToConfig(ev, 1));
  if (warnings.length) console.warn(`${ev.name} — schedule warnings:\n  ` + warnings.join("\n  "));
  if (unplaced.length) console.warn(`${ev.name}: ${unplaced.length} games could not be placed.`);
  const shortOf = Object.fromEntries(ev.entries.map((e) => [e.name, e.short]));
  for (const g of games) {
    const teamA = { ...g.teamA, short: shortOf[g.teamA.name] || "" };
    const teamB = { ...g.teamB, short: shortOf[g.teamB.name] || "" };
    docs.push([`events/${id}/games/g${g.nr}`, {
      nr: g.nr, date: g.date, time: g.time, court: g.court,
      bestOf: g.bestOf, round: g.round, category: g.category, group: g.group || "",
      teamA, teamB, srcA: g.srcA || null, srcB: g.srcB || null,
    }]);
    docs.push([`events/${id}/results/g${g.nr}`, {
      nr: g.nr, date: g.date, time: g.time, court: g.court,
      round: g.round, category: g.category, group: g.group || "", bestOf: g.bestOf,
      teamA: teamA.name, teamB: teamB.name, teamAShort: teamA.short, teamBShort: teamB.short,
      setsA: 0, setsB: 0, pointsA: 0, pointsB: 0, sets: [], status: "Not Started", updatedAt: now,
    }]);
  }
  return { docs, games: games.length, rosters: men.length + women.length, officials: officials.length };
}

/* ----------------- seed ----------------- */
async function main() {
  if (RESET) {
    // Emulator-only endpoints: drop every document and every account.
    await call(`http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
    await call(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
    console.log("Emulator data wiped.");
  }
  // Demo data is added event by event: events that already exist are left
  // as they are, missing demo events are added (e.g. the club event after
  // an update). A production copy is never mixed with demo data.
  const existing = RESET ? [] : await eventIds();
  if (existing.some((id) => !id.startsWith("demo-"))) {
    console.log("Emulator holds a production copy — use --reset to go back to demo data.");
    return;
  }
  const missing = (id) => !existing.includes(id);
  const demoIds = [EVENT_ID, CLUB_EVENT_ID];
  if (!demoIds.some(missing) && !missing("demo-archive")) {
    console.log("Demo events already there — use --reset to start over.");
    return;
  }

  for (const u of USERS) await ensureGoogleUser(u);

  const now = new Date();
  const docs = [];

  // Users: org-admin via the orgAdmins collection (no rules edit needed),
  // the others as event members, mirrored onto people/{email} like the app does.
  for (const u of USERS) {
    const person = { email: u.email, name: u.name };
    if (u.role) person.events = Object.fromEntries(demoIds.map((id) => [id, u.role]));
    docs.push([`people/${u.email}`, person]);
    if (u.orgAdmin) docs.push([`orgAdmins/${u.email}`, { email: u.email, name: u.name, addedBy: "seed", addedAt: now }]);
    if (u.role) for (const id of demoIds.filter(missing)) docs.push([`events/${id}/members/${u.email}`, { email: u.email, name: u.name, role: u.role, addedBy: "seed", addedAt: now }]);
  }

  const added = [];
  const national = eventDocs({ id: EVENT_ID, ev: event, men: MEN, women: WOMEN, catMen: CAT_MEN, catWomen: CAT_WOMEN,
    teamKits: TEAM_KITS, refKits: REF_KITS, officials: REFEREES, squadOffset: 0 }, now);
  const clubs = eventDocs({ id: CLUB_EVENT_ID, ev: clubEvent, men: CLUB_MEN, women: CLUB_WOMEN, catMen: CLUB_MEN_CAT, catWomen: CLUB_WOMEN_CAT,
    teamKits: CLUB_KITS, refKits: CLUB_REF_KITS, officials: CLUB_OFFICIALS, squadOffset: 40 }, now);
  if (missing(EVENT_ID)) {
    docs.push(...national.docs);
    docs.push(["public/live", { eventId: EVENT_ID, name: event.name, startsAt: event.startDate, endsAt: event.endDate, updatedAt: now }]);
    added.push(`"${event.name}" (${national.games} games, ${national.rosters} rosters, ${national.officials} officials, kits for ${Object.keys(TEAM_KITS).length} teams, ${REF_KITS.length} referee shirt colours)`);
  }
  if (missing(CLUB_EVENT_ID)) {
    docs.push(...clubs.docs);
    added.push(`"${clubEvent.name}" (club teams: ${clubs.games} games, ${clubs.rosters} rosters, ${clubs.officials} officials)`);
  }

  // A finished past event, so the events timeline isn't empty.
  if (missing("demo-archive")) {
    const past = day(-60);
    docs.push(["events/demo-archive", {
      name: "Demo Open (archived)", place: "Altstadt", dates: `${past.getDate()} ${MON[past.getMonth()]} ${past.getFullYear()}`,
      startDate: iso(past), endDate: iso(past), status: "archived", createdBy: "seed", createdAt: now,
    }]);
    added.push(`"Demo Open (archived)"`);
  }

  await commit(docs);
  console.log(`Seeded ${USERS.length} users and ${added.join(", ")}.`);
  console.log("Sign in with one of: " + USERS.map((u) => u.email).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
