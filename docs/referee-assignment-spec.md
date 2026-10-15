# Officials & Uniform Assignment — Spec

Tracking issue: [#1](https://github.com/c-englert/fistball-arena/issues/1)

Handover spec for porting the referee/officials assignment logic and the uniform
selection logic (from the Reiden 2026 and Ahlhorn 2026 single-file tools) into
Fistball Arena. Read this before touching `src/pages/Referees.jsx`,
`src/pages/Colors.jsx`, `src/cloud.js` (referees / kits) or the Excel import.

---

## 0. Ground rules for the implementation

- **Pure logic, separate from UI and Firestore.** All rules and solvers live in
  plain ES modules under `src/officials/` (no React, no Firebase imports). Pages
  only call them and render results. This keeps the logic testable and reusable.
- **Tests.** The repo has no test runner yet. Add `node:test` (zero deps) or
  Vitest, plus an `npm test` script and a CI step in `.github/workflows/ci.yml`.
  Cover every hard rule, assistant pairing, the gender rule, and the uniform solver with
  small hand-built fixtures.
- **Never silently overwrite live data.** Firestore is shared and live. Any
  automatic assignment produces a *proposal* shown as a diff; the admin applies
  it explicitly. Manually set values are locked by default and only overwritten
  with an explicit "overwrite manual entries" option.
- **Small PRs** against upstream (`c-englert/fistball-arena`), in the order of
  section 5. Match existing code style (oxlint, terse functional React).
- UI strings: the app is English-only today; keep new strings English unless
  i18n lands upstream.

---

## 1. Current state in Arena (as of commit 33f4bfe, 2026-10-09)

- `Referees.jsx`: manual grid per game, roles `r1`, `r2`, `clerk`, `a1`, `a2`,
  free-text names with a datalist, autosave via `saveGameRefs(gameId, refs)`
  into `game.refs`. Report (`Sumula`) is pre-filled from `game.refs`.
- Referee registry: `events/{eid}/referees/{id}` with
  `{ name, first, role, photo, birthday }` — no country, gender, club or
  availability. Imported from the IFA "…DATA.xlsx" (`importExcel.js`): a row
  with role `referee`, or with no `Team` and not a player, is a referee.
- `Colors.jsx`: each team has up to two uniforms (since main af77280:
  `{ colors: [hex, …] }`, up to 3 jersey colours; older `{shirt, shorts}`) in
  `public/teamkits_{eid}`; per game `game.kit = { A: 1|2|"", B: 1|2|"" }` via
  `saveGameKit(gameId, side, kit)`. Bulk "uniform of the day" per team. No clash
  detection.

### Role mapping (our terms → Arena)

| Ours | Arena role (`roles`) | Arena slots |
| --- | --- | --- |
| Referee 1 / 2 (SR, Schiedsrichter) | `referee` | `r1`, `r2` |
| Clerk (AS, Anschreiber, scorer) | `clerk` | `clerk` |
| Assistant 1 / 2 (LR, Linienrichter, line judge) | `assistant` | `a1`, `a2` |
| Court manager (Platzwart) | `courtManager` | `cm` |

This mapping is final. Arena has exactly **one** scorer slot per game
(`clerk`); no second clerk slot is added (the Reiden two-scorer setup does not
apply). `a1` / `a2` are always the two assistants (an assistant pair).

---

## 2. Data model extensions

### 2.1 Referee / official document (`events/{eid}/referees/{id}`)

Add (all optional, backwards compatible):

```js
{
  // existing: name, first, role, photo, birthday
  roles: ["referee", "assistant", "clerk"], // which slots this person may fill
  country: "GER",               // nation (IFA events) — conflict check vs teams
  club: "Ahlhorner SV",         // club (EFA/club events) — conflict check vs teams
  gender: "f" | "m",
  assistantPair: "pair-3",      // optional id; two people with the same id are assistant partners (picked as partner in the app)
  rank: "top" | "good" | "normal", // referees and assistants; missing = normal (see 3.4b)
  availability: {               // by date ("dd/mm/yy", as on games); missing date = available
    "12/09/26": { status: "available" | "reserve" | "unavailable",
                  from: "12:00", to: "15:00" }  // optional window; the whole game must fit
  },
  maxPerDay: 6                  // optional load cap
}
```

### 2.2 Team metadata

Conflict checks need country/club per team. Derive in this order:
1. explicit `event.entries[].country` / `.club` if present (add these fields to
   Settings → Teams),
2. otherwise the team name itself (IFA events: team name = nation, as `flagFor`
   already assumes).

### 2.3 Game

Use existing `category` and `round` fields. Add a helper
`isWomenFinal(game)` → true for women's categories when the round is semifinal,
bronze/3rd-place or final. Check the actual `round` strings the generator
produces (`src/schedule/bracket.js`, `format.js`) and match on those, not on
guesses. The generator produces "Qualification round" (group stage),
"Quarterfinal [n]", "Semifinal [n]", "Bronze medal match", "Gold medal match"
and "Placement x-y". Finals rounds = Semifinal, Bronze medal match,
Placement 3-5 (3rd place in the 5-team format) and Gold medal match.

### 2.4 Import

Extend `importExcel.js` to read optional columns for referees: `Nation`,
`Club`, `Gender`, `Official Roles` (English names, German words or the codes SR / AS / LR), `Assistant Pair` (older `LR Pair` accepted). Availability is edited in the app
(new "Officials" card on the Referees page); an optional availability sheet
import can follow later.

---

## 3. Officials assignment rules

### 3.1 Hard rules (blocking — never auto-assigned, red in the grid)

1. **Country conflict**: official's `country` equals either team's country.
   Hard for `r1` in every game and for `r2` in group-stage games. For `r2` in
   knockout games see the exception in 3.2. In **club competitions**
   (category "Clubs …") the nation of a club is only a strong soft penalty
   for referees (above breaks), see 3.2. Does **not** apply to `clerk` or
   to line judges (`a1`, `a2`): their nation plays no role in the assignment —
   except for a referee filling a line judge slot (see 3.2).
2. **Club conflict**: official's `club` equals either team's club
   (e.g. Ahlhorner SV members cannot referee Ahlhorner SV games). Hard for
   referees, assistants **and clerks** (as in the Ahlhorn tool, 2026-10-14);
   court managers are not affected.
3. **Unavailable**: availability status `unavailable` for that date, or the
   game (start + game length) doesn't fit into the day's window `from`–`to`.
4. **Double booking**: same person in two games whose time windows overlap,
   or twice in the same game.
8. **Too many games in a row**: more than **two** consecutive rounds
   (Durchgänge) on the same day without a free round in between. A round is
   one start time of the day (all courts); consecutive = adjacent start times
   of that day's schedule. **Clerks and court managers are exempt** — clerks
   may work game after game (stable table crews, see 3.4c).
5. **Role not allowed**: person lacks the role for that slot (`roles`).
6. **Women's finals gender rule**: in women's semifinals, bronze and final,
   at least one of `r1`/`r2` must be female.
7. **Mandatory slots**: `r1` is mandatory; `r2` in every game or only in
   semifinals / bronze / final (event setting, 3.4c). `a1`/`a2` (assistants)
   mandatory when an assistant pool exists. `clerk` is **optional** unless the
   clerk pool is non-empty (at club events teams provide their own scorers);
   `clerk2` additionally only on the courts set for a second clerk.

Hard rules are hard blocks, not warnings — this is a firm design principle.

### 3.2 Soft rules (allowed, orange in the grid, penalised in auto-assignment)

- **Non-neutral second referee (knockout only)**: in a knockout game, `r2`
  may come from one of the playing nations **only when no neutral eligible
  referee is available** for that slot (eligible = available, no double
  booking, no club conflict, women's-final gender rule still satisfied).
  Highest soft penalty, always shown as an orange warning, never a silent
  fallback. Event setting `r2NationKo: "lenient"` (as in the Reiden tool):
  only about as bad as a missing break, so a rested referee may take the slot
  to balance the load (still an orange warning). Group games stay hard. `r1` must always be neutral. Knockout = any game outside the group
  stage (`phase !== "group"`, or a round other than "Qualification round").
- **Referee as assistant from a playing nation**: a person with the `referee`
  role in `a1`/`a2` whose `country` equals either team's country → orange
  warning and penalty. A referee as assistant from a neutral nation is fine;
  pure assistants (no `referee` role) never get a nation warning.
- **Reserve usage**: status `reserve` for that date → high penalty.
- **Break violation**: same person in two consecutive rounds. Preferred is a
  free round after every game; two in a row are allowed but penalised, a
  third in a row is a hard violation (3.1 rule 8). Both limits configurable
  (default: soft at 2, hard at 3).
- **Referee from a club's nation (club competitions)**: strong penalty,
  above breaks; used only when no other referee fits.
- **Final: assistants who aren't referees**: when the referees work the lines
  in the final (event setting), a pure assistant there is a warning.
- **Load imbalance**: deviation from the average number of games per person
  (per role, per day and overall); also `maxPerDay` exceeded.
- **Repeat pairing / repeat team**: same official seeing the same team many
  times (low weight).

**Priority**: break violations outweigh the gender preference.

### 3.3 Bonus

- Female referee on women's games (outside the hard-rule finals) — small bonus,
  lower weight than break violations.

### 3.3b Court manager

- One `cm` slot per game. A court manager may cover **several courts at the
  same time** (court manager in parallel games is not a double booking), but
  takes no other role at that time (that is a double booking).
- Nation and club don't matter; court manager duty doesn't count for games in
  a row or `maxPerDay`.
- Mandatory only when someone has the `courtManager` role. Auto-assign fills
  it after the other roles: **one court manager per round** looks after all
  courts of that round (another one in the same round only if needed), and
  the rounds are spread evenly between the court managers.

### 3.4 Assistant pairing (hard-coupled, "Option B")

- Two people with the same `assistantPair` are always assigned together to `a1` + `a2`.
- If one member is unavailable on a day, the pair dissolves **for that day**;
  the remaining member becomes a solo person.
- Solo persons are a reserve fallback: they may fill `a1`/`a2` only when no
  complete pair is available (penalty).

### 3.4b Ranks (referees and games)

- Referees have a rank: `top`, `good` or `normal` (default). Games have one
  too: set per game (`game.rank`), otherwise semifinals, bronze / 3rd place
  and the final are `top` and every other game is `normal`.
- **Referee 1** should have at least the game's rank (Referee 2 is not
  matched). A lower-ranked Referee 1 is a warning and a strong penalty per
  level (`w_rankUnder`): above breaks and load balance, but never above a hard
  rule — if no fitting referee is free, a lower-ranked one is used.
- A referee (1 or 2) above the game's rank costs a small penalty per level
  (`w_rankOver`), so top referees stay free for top games when it matters.

### 3.4c Event settings and rules from the Reiden / Ahlhorn tools (2026-10-14)

Event settings (`event.officialsRules`, Referees page → "Assignment settings"):

- **`r2`**: `"always"` (default) or `"finals"` — Referee 2 only in semifinals,
  bronze / 3rd place and the final; elsewhere optional, by hand.
- **`clerk2Courts`**: courts with a second clerk (slot `clerk2`, "Clerk 2").
- **`finalRefsOnLines`** (default on): in the final (gold medal game) the
  referees work the lines; auto-assign takes the assistants only from the
  referees, the assistant pool stays out.
- **`r2NationKo`**: `"lastResort"` (default) or `"lenient"` — knockout
  Referee 2 from a playing nation, see 3.2 (decided 2026-10-15, Reiden #15).
- Game length for the availability windows: `event.slots.gameMinutes`.

Further rules:

- **Clerks** may work game after game (no break rule) and keep their court:
  a clerk working on in the next round on another court costs a small
  penalty (`w_clerkCourtSwitch`, ≈ 1.5 games of load).
- **Ranks for assistants** too: an assistant below the game's rank costs
  `w_rankUnder` per level (no warning shown); with a big enough gap the rank
  beats keeping a pair together.
- **Team spread** for referees: `w_repeat` per earlier game with one of the
  teams (≈ 0.6 games of load).
- **Assistant crews** take part in the local improvement: whole crews
  (`a1` + `a2`) are swapped between games of the same day.
- The slot picker shows each official's games today / in total.

### 3.5 Scoring

```
score(assignment) = Σ hard violations × ∞  (excluded)
                  + w_missingRef · empty Referee 1 / 2
                  + w_missing   · empty required Clerk / Assistant
                  + w_r2Nation  · non-neutral knockout r2
                  + w_rankUnder · Referee 1 below the game's rank (per level)
                  + w_rankOver  · referees above the game's rank (per level)
                  + w_reserve   · reserve uses
                  + w_break     · break violations
                  + w_load      · load imbalance
                  + w_soloAssistant · solo assistant uses
                  + w_refereeAsAssistantNation · referees as assistant from a playing nation
                  + w_repeat    · repeats
                  − w_gender    · female referee on women's games
```

Weights live in one config object (event-level, editable later), default
ordering: `w_missingRef ≫ w_r2Nation ≫ w_missing ≫ w_reserve ≫ w_rankUnder > w_break > w_refereeAsAssistantNation > w_soloAssistant > w_rankOver > w_load > w_gender > w_repeat`.

### 3.6 Solver

- Process games in chronological order; per game fill the referees, then the assistants (pairs),
  then the clerk. For a knockout `r2`, try every neutral candidate first; only if none is
  eligible fall back to a non-neutral one (counted as a soft violation). For each slot choose the eligible candidate with the lowest marginal
  penalty; tie-break by fewest games so far, then name.
- Repair pass for required slots that are still empty (the chronological
  greedy may have booked the only eligible people in a parallel game): move an
  official over from another game of the same day and refill their old cell
  with a free official or with one taken from a third cell (chains of up to two
  moves), keeping the best chain while the score decreases. Because empty
  slots are scored, an empty Referee 2 is traded for an empty Clerk.
- Then a local-improvement pass (swap two officials between games of the same
  day) while the total score decreases.
- Respect filled cells; only fill empty ones. Slots filled by auto-assign are
  flagged (`game.refsAuto`); "overwrite" recomputes only those. Officials set by
  hand (no flag) are never changed by auto-assign, and can be cleared
  separately ("Clear auto-assigned" keeps them).
- Output: `{ proposals: [{ gameId, role, from, to }], violations: [...] }`.

### 3.7 UI (Referees page)

- Per-cell badge: red (hard), orange (soft), with tooltip listing the reasons.
- Header summary: number of hard/soft issues; click opens a list.
- "Auto-assign" button → modal with the proposal as a diff (game, role,
  old → new) and the score delta → "Apply" writes via `saveGameRefs`.
- "Officials" card: edit roles, country/club, gender, assistant partner, availability per
  day (available / reserve / unavailable + optional time slots).
- Per-person load overview (games per day per role).

---

## 4. Uniform (kit) selection

### 4.1 Goal (as specified by Toby)

From each team's registered kits, choose so that **every team plays in a single
kit per day** wherever possible. Where that is impossible, **minimise the number
of kit changes**.

### 4.2 Definitions

- **Clash**: two kits clash if their jerseys are too similar. Colour distance
  is ΔE (CIE76 in Lab) between hex values; clash if the jersey distance
  `< threshold` (default 35, configurable per event). A jersey has 1–3
  colours (stripes); the jersey distance is the symmetric Hausdorff distance
  of the two colour sets — small only when **each jersey's colours all appear
  in the other** (red/white vs white/red clash; plain white vs black/white
  stripes don't). For plain jerseys it is simply the ΔE of the two colours.
  Older `{shirt, shorts}` uniforms count by their shirt.
- **Kit change**: for a team, a change between two consecutive games of that
  team on the same day where the kit differs. (Switching for one game and back
  counts as 2 changes.)
- A team with only one registered kit is fixed; a game where both fixed kits
  clash is **unresolvable** → reported as a warning, excluded from the
  objective.

### 4.3 Objective (lexicographic, per day)

1. No clashing game (except unresolvable ones).
2. Minimise total kit changes over all teams.
3. Minimise the number of teams that change at all.
4. A referee shirt colour (4.6) contrasts with both teams' shirts. Ranked
   after the kit changes, so it never forces a mid-day change — it only
   overrides the preferences below.
5. Alternate kits across days: prefer the **other** kit than the team's
   previous day (day 1 → Uniform 1, day 2 → Uniform 2, day 3 → Uniform 1, …).
   The previous day's kit is the one the team wore in most of its games that
   day (ties: the kit of its last game). Days without games for the team are
   skipped, so the alternation continues from its last playing day.
6. Prefer Uniform 1 (effectively decides the team's first day).

### 4.4 Algorithm

- Solve days in chronological order, because objective 4 depends on the kit
  each team wore the previous day.
- Split each day into **connected components** of the "plays against" graph
  (usually a group or a bracket path) — they are independent.
- **Step 1 – one kit per day**: try to assign a day kit to every team in the
  component so that no game clashes (variables are only teams with 2 kits;
  components are small, so exhaustive search over 2^k is fine for k ≤ ~16, with
  pruning). If feasible, pick the best one by objectives 4–6. Done.
- **Step 2 – minimal changes**: dynamic programming over the component's time
  slots in chronological order. State = the current kit of every team in the
  component (2^k). Transition to the next slot: every game in that slot must be
  clash-free; cost = number of teams whose kit changes. Pick the min-cost path,
  tie-breaks per 4.3. Fallback for very large components (k > ~16): greedy from
  the best Step-1 partial assignment plus local repair.
- Respect manually set `game.kit` values as fixed constraints unless the admin
  chooses "overwrite".

### 4.5 UI (Uniforms page)

- Clash badge per game row (red = clash, grey = unresolvable).
- Button "Suggest uniforms" (per day or all days) → diff modal showing per team
  the day kit and any per-game deviations, total changes → "Apply" writes via
  `saveGameKit`.
- Hint per team/day when the team must change kits ("2 changes on Sat").

### 4.6 Referee shirts

Officials' shirt colour is chosen per game so it does not clash with either
team's kit. **All officials of a game (Referee 1/2, Clerk, Assistant 1/2) wear the same
colour** — one value per game.

**Data (entered per event):**
- The event's available referee shirt colours live in the existing public doc
  `public/teamkits_{eid}` as `refKits: [{ id, name, shirt }]` (e.g.
  `{ id: "y", name: "Yellow", shirt: "#f5d000" }`), so Fistball Live can show
  them too. There is **no preference** between the colours.
- Edited in a new "Referee shirts" card on the Uniforms page (`Colors.jsx`):
  add / rename / recolour / delete.
- Per game: `game.kit.R = refKitId` (or `""`), written via the existing
  `saveGameKit(gameId, "R", id)` and mirrored to the public result like the
  team kits.

**Rules:**
- **Clash** (hard): the referee shirt clashes with team A's or team B's jersey
  for that game, using the same jersey distance and threshold as 4.2 (the
  referee shirt is a one-colour jersey). Team jerseys are
  taken from the game's resolved team kits (proposal or saved `game.kit`).
- If no referee colour is clash-free for a game → **unresolvable**, reported as
  a warning (grey badge).

**Objective (lexicographic):**
1. No clashing game (except unresolvable ones).
2. Minimise shirt changes per official across their games on the same day
   (uses the officials assignment from section 3 when present; otherwise
   minimise changes per court per day).
3. Prefer the larger minimum ΔE to both team shirts (better contrast).
Exact ties go to the colour used least so far (neutral; no colour is
preferred).

**Algorithm:** run after the team kit solver (team kits first, then referee
shirts; the team kit solver already prefers kit combinations for which a
referee colour exists, objective 4.3/4). Per day: one colour for the whole day if one contrasts with every game;
otherwise game by game in time order by the objective above. Manually set
`game.kit.R` values are fixed unless the admin chooses "overwrite".

**UI:** a referee-shirt column on the Uniforms page with clash badges, included
in the "Suggest uniforms" diff modal and applied in the same step.

---

## 5. PR plan

1. **Data model + import** — referee fields (2.1), team country/club (2.2),
   `isWomenFinal` (2.3), import columns (2.4), Officials card to edit them.
   Add the test runner here.
2. **Rules engine + badges** — `src/officials/rules.js` (3.1–3.4 checks, pure),
   unit tests, red/orange badges and issue summary on the Referees page.
3. **Auto-assign** — `src/officials/assign.js` (3.5–3.6), weights config,
   diff/apply modal.
4. **Uniforms** — `src/officials/kits.js` (clash + solver, 4.2–4.4), unit tests,
   badges and "Suggest uniforms" modal on the Uniforms page.
5. **Referee shirts** — "Referee shirts" card (per-event colours), referee
   shirt solver in `src/officials/kits.js` (4.6), unit tests, column + badges,
   included in the "Suggest uniforms" modal.

---

## 6. Open questions

- Availability: maintained in Arena only, or also imported from Excel?
