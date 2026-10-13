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
// 2 clerks, 4 assistants). `roles` / `country` / `gender` / `lrPair` are the
// officials fields from src/officials/model.js (older app versions ignore them).
const official = (role, roles) => ([name, first, country, gender, lrPair]) =>
  ({ name, first, role, roles, country, gender, ...(lrPair ? { lrPair } : {}), photo: "", birthday: "" });
// Uniforms: two kits per team (shirt + shorts; only shirts count for clashes)
// and the event's referee shirt colours. Several teams share red / white, so
// "all in Uniform 1" clashes and "Suggest uniforms" has something to solve;
// every pairing (incl. knockout) is solvable, each with a fitting referee shirt.
const WHITE = "#ffffff", BLACK = "#1a1a1a", RED = "#e23b3b", YELLOW = "#f2c20a", BLUE = "#2f6df0";
const kits = (s1, h1, s2, h2) => [{ shirt: s1, shorts: h1 }, { shirt: s2, shorts: h2 }];
const TEAM_KITS = {
  Germany: kits(WHITE, BLACK, BLACK, WHITE),
  Austria: kits(RED, WHITE, WHITE, RED),
  Switzerland: kits(RED, RED, WHITE, WHITE),
  Brazil: kits(YELLOW, BLUE, BLUE, WHITE),
  Italy: kits(BLUE, WHITE, WHITE, BLUE),
  Chile: kits(RED, BLUE, WHITE, BLUE),
};
const REF_KITS = [
  { id: "ref-mint", name: "Mint green", shirt: "#3eb489" },
  { id: "ref-black", name: "Black", shirt: BLACK },
  { id: "ref-red", name: "Red", shirt: RED },
];

const REFEREES = [
  // Referees (SR)
  ...[
    ["Becker", "Thomas", "", "m"], ["Lehmann", "Sabine", "", "f"], ["Pereira", "João", "", "m"], ["Zanetti", "Marco", "", "m"],
    ["Hofer", "Martin", "", "m"], ["Brunner", "Claudia", "", "f"], ["Vogel", "Stefan", "", "m"], ["Araya", "Camila", "", "f"],
  ].map(official("Referee", ["SR"])).map(({ country, ...r }) => r), // nation left blank: set it on the Referees page
  // Clerks (AS)
  ...[
    ["Krämer", "Ute", "Germany", "f"], ["Lindner", "Paul", "Austria", "m"], ["Meier", "Anna", "Switzerland", "f"], ["Souza", "Lucas", "Brazil", "m"],
  ].map(official("Clerk", ["AS"])),
  // Assistants / line judges (LR), in fixed pairs
  ...[
    ["Fuchs", "Jana", "Germany", "f", "LR-1"], ["Wolf", "Erik", "Germany", "m", "LR-1"],
    ["Gruber", "Lisa", "Austria", "f", "LR-2"], ["Steiner", "Felix", "Austria", "m", "LR-2"],
    ["Bianchi", "Giulia", "Italy", "f", "LR-3"], ["Ricci", "Luca", "Italy", "m", "LR-3"],
    ["Rojas", "Diego", "Chile", "m", "LR-4"], ["Muñoz", "Valentina", "Chile", "f", "LR-4"],
  ].map(official("Assistant", ["LR"])),
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

// Any event at all? (Also true after loading a production copy.)
async function hasEvents() {
  const res = await fetch(`http://${FS}/v1/${DOCS}/events?pageSize=1&showMissing=true`, { headers: OWNER });
  return res.ok && ((await res.json()).documents || []).length > 0;
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

/* ----------------- seed ----------------- */
async function main() {
  if (RESET) {
    // Emulator-only endpoints: drop every document and every account.
    await call(`http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
    await call(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
    console.log("Emulator data wiped.");
  } else if (await hasEvents()) {
    console.log("Emulator already has events (demo data or a production copy) — use --reset to start over.");
    return;
  }

  for (const u of USERS) await ensureGoogleUser(u);

  const now = new Date();
  const docs = [];

  // Users: org-admin via the orgAdmins collection (no rules edit needed),
  // the others as event members, mirrored onto people/{email} like the app does.
  for (const u of USERS) {
    const person = { email: u.email, name: u.name };
    if (u.role) person.events = { [EVENT_ID]: u.role };
    docs.push([`people/${u.email}`, person]);
    if (u.orgAdmin) docs.push([`orgAdmins/${u.email}`, { email: u.email, name: u.name, addedBy: "seed", addedAt: now }]);
    if (u.role) docs.push([`events/${EVENT_ID}/members/${u.email}`, { email: u.email, name: u.name, role: u.role, addedBy: "seed", addedAt: now }]);
  }

  docs.push([`events/${EVENT_ID}`, { ...event, createdAt: now }]);
  docs.push([`public/event_${EVENT_ID}`, {
    eventId: EVENT_ID, name: event.name, place: event.place, address: event.address,
    dates: event.dates, startsAt: event.startDate, endsAt: event.endDate,
  }]);
  docs.push([`public/teamkits_${EVENT_ID}`, { eventId: EVENT_ID, kits: TEAM_KITS, refKits: REF_KITS }]);
  docs.push(["public/live", { eventId: EVENT_ID, name: event.name, startsAt: event.startDate, endsAt: event.endDate, updatedAt: now }]);

  // Rosters, keyed "<team> - <category>" like the roster import.
  MEN.forEach((t, i) => docs.push([`events/${EVENT_ID}/rosters/${rosterKey(`${t} - ${CAT_MEN}`)}`, { name: `${t} - ${CAT_MEN}`, ...squad(i, false) }]));
  WOMEN.forEach((t, i) => docs.push([`events/${EVENT_ID}/rosters/${rosterKey(`${t} - ${CAT_WOMEN}`)}`, { name: `${t} - ${CAT_WOMEN}`, ...squad(i + 20, true) }]));

  REFEREES.forEach((r) => docs.push([`events/${EVENT_ID}/referees/${`${r.name}_${r.first}`.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, r]));

  // Schedule: the same generator the Settings wizard runs, then the same game
  // + public result docs publishGames() writes.
  const { games, warnings, unplaced } = generateSchedule(eventToConfig(event, 1));
  if (warnings.length) console.warn("Schedule warnings:\n  " + warnings.join("\n  "));
  if (unplaced.length) console.warn(`${unplaced.length} games could not be placed.`);
  const shortOf = Object.fromEntries(entries.map((e) => [e.name, e.short]));
  for (const g of games) {
    const teamA = { ...g.teamA, short: shortOf[g.teamA.name] || "" };
    const teamB = { ...g.teamB, short: shortOf[g.teamB.name] || "" };
    docs.push([`events/${EVENT_ID}/games/g${g.nr}`, {
      nr: g.nr, date: g.date, time: g.time, court: g.court,
      bestOf: g.bestOf, round: g.round, category: g.category, group: g.group || "",
      teamA, teamB, srcA: g.srcA || null, srcB: g.srcB || null,
    }]);
    docs.push([`events/${EVENT_ID}/results/g${g.nr}`, {
      nr: g.nr, date: g.date, time: g.time, court: g.court,
      round: g.round, category: g.category, group: g.group || "", bestOf: g.bestOf,
      teamA: teamA.name, teamB: teamB.name, teamAShort: teamA.short, teamBShort: teamB.short,
      setsA: 0, setsB: 0, pointsA: 0, pointsB: 0, sets: [], status: "Not Started", updatedAt: now,
    }]);
  }

  // A finished past event, so the events timeline isn't empty.
  const past = day(-60);
  docs.push(["events/demo-archive", {
    name: "Demo Open (archived)", place: "Altstadt", dates: `${past.getDate()} ${MON[past.getMonth()]} ${past.getFullYear()}`,
    startDate: iso(past), endDate: iso(past), status: "archived", createdBy: "seed", createdAt: now,
  }]);

  await commit(docs);
  console.log(`Seeded ${USERS.length} users, event "${event.name}" (${games.length} games, ${MEN.length + WOMEN.length} rosters, ${REFEREES.length} officials, kits for ${Object.keys(TEAM_KITS).length} teams, ${REF_KITS.length} referee shirt colours).`);
  console.log("Sign in with one of: " + USERS.map((u) => u.email).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
