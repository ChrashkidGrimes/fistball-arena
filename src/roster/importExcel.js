// Parse an uploaded .xlsx (the IFA "…DATA.xlsx" model) into rosters + referees.
// Same columns as the DB sheet tab, but with a `Referee` role and no category.
// xlsx is loaded on demand so it doesn't bloat the initial bundle.
//
// Some DATA files split the squads into FEMALE / MALE sections with a one-cell
// banner row above each block (and the "Family Name" header repeated per block).
// We track the current section's gender so the same club fielding both a women's
// and a men's team stays as two separate rosters instead of merging into one.
//
// Optional referee columns (officials assignment): Nation, Club, Gender,
// Official Roles ("Referee, Assistant, Clerk" — also German words or the old
// codes "SR, LR, AS"), Rank (Top / Good / Normal), Assistant Pair (or the
// older "LR Pair"). Blank → left out, so a re-import keeps
// what was edited in the app.

import { parseRoles, parseGender, parseRank } from "../officials/model.js";

const GENDERS = {
  FEMALE: "Female", FEMININO: "Female", FEMININA: "Female", WOMEN: "Female",
  WOMENS: "Female", WOMEN0S: "Female", W: "Female", F: "Female",
  MALE: "Male", MASCULINO: "Male", MASCULINA: "Male", MEN: "Male",
  MENS: "Male", M: "Male",
};

export async function parseExcelRoster(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 → array-of-arrays, so we can find the header row ourselves and
  // recognise the gender banner rows (which would otherwise break header detection).
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  return buildFromRows(rows);
}

// Tidy a person's name on import: trim, drop stray trailing slashes, and
// title-case names that came in ALL CAPS or all lowercase (leaving already
// mixed-case names — e.g. "McLeod", 'Pablo "Nico"' — untouched). Accent-aware.
function tidyName(s) {
  let v = String(s ?? "").trim().replace(/[\\/]+\s*$/, "").trim();
  if (!v) return "";
  const allUpper = v === v.toUpperCase() && /\p{Lu}/u.test(v);
  const allLower = v === v.toLowerCase() && /\p{Ll}/u.test(v);
  if (allUpper || allLower) {
    v = v.toLowerCase().replace(/(^|[\s\-'.’])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
  }
  return v;
}

function buildFromRows(rows) {
  const norm = (s) => String(s ?? "").trim();
  const teams = {};
  const referees = [];
  let gender = "";   // current section gender ("" when the file has no banners)
  let col = null;    // header column map { "family name": idx, … }

  for (const row of rows) {
    const cells = (row || []).map(norm);
    const nonEmpty = cells.filter(Boolean);
    if (!nonEmpty.length) continue;

    // Section banner: a single cell holding a gender keyword (FEMALE / MALE / …).
    if (nonEmpty.length === 1) {
      const key = nonEmpty[0].toUpperCase().replace(/[^A-Z]/g, "");
      if (GENDERS[key]) { gender = GENDERS[key]; continue; }
    }

    // Header row (may repeat per section).
    const low = cells.map((c) => c.toLowerCase());
    if (low.includes("family name") && low.includes("given name")) {
      col = {};
      low.forEach((c, i) => { if (c && !(c in col)) col[c] = i; });
      continue;
    }
    if (!col) continue; // data before any header — ignore

    const g = (name) => {
      const i = col[name.toLowerCase()];
      return i === undefined ? "" : norm(row[i]);
    };
    const fam = tidyName(g("Family Name")), giv = tidyName(g("Given Name"));
    if (!fam && !giv) continue;
    const role = g("Role").toLowerCase();
    const photo = g("Link to Profile Pic");
    const country = g("Team");

    // Referees have no team. Count an explicit "referee" role — OR any named row
    // with no team that isn't a player — as a referee, because referee-list files
    // often fill the Role only on the first row (or put the whole name in one cell).
    if (role === "referee" || (!country && role !== "player")) {
      const ref = { name: fam, first: giv, role: g("Staff Role") || "Referee", photo, birthday: g("Birthday") };
      const roles = parseRoles(g("Official Roles"));
      const sex = parseGender(g("Gender")); // not the section banner — referee rows often trail the MALE block
      if (roles.length) ref.roles = roles;
      if (g("Nation") || g("Country")) ref.country = g("Nation") || g("Country");
      if (g("Club")) ref.club = g("Club");
      if (sex) ref.gender = sex;
      const rank = parseRank(g("Rank"));
      if (rank) ref.rank = rank;
      const pair = g("Assistant Pair") || g("LR Pair");
      if (pair) ref.assistantPair = pair;
      referees.push(ref);
      continue;
    }
    if (!country) continue;
    // Keep women's and men's teams of the same club apart.
    const key = gender ? `${country}\u0000${gender}` : country;
    const t = teams[key] || (teams[key] = { name: country, gender, players: [], staff: [] });
    if (role === "player") {
      const nr = parseInt(g("Jersey Number"), 10);
      t.players.push({
        nr: isNaN(nr) ? "" : nr, name: fam, first: giv, position: g("Player Position"),
        birthday: g("Birthday"), height: g("Height in cm"), matches: g("# matches national team"),
        country, photo,
      });
    } else {
      t.staff.push({ role: g("Staff Role") || "Staff", name: fam, first: giv, birthday: g("Birthday"), country, photo });
    }
  }

  for (const t of Object.values(teams)) {
    t.players.sort((a, b) => (a.nr === "" ? 999 : a.nr) - (b.nr === "" ? 999 : b.nr));
  }
  const count = Object.values(teams).reduce((s, t) => s + t.players.length + t.staff.length, 0);
  const genders = [...new Set(Object.values(teams).map((t) => t.gender).filter(Boolean))];
  return {
    teams, referees,
    teamCount: Object.keys(teams).length, count, refereeCount: referees.length,
    genders,
    warnings: count || referees.length ? [] : ["No players/staff/referees found in the file."],
  };
}
