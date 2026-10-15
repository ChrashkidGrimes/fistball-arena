# Local test environment (Podman / Docker)

Runs the whole app locally against the **Firebase Emulator Suite** — no Firebase
account, nothing reaches the real project. Everything runs in containers; the
only thing you need on your machine is Podman (or Docker).

| Container   | What it does                                                        |
| ----------- | ------------------------------------------------------------------- |
| `emulators` | Firebase Auth + Firestore emulators (with `firestore.rules`) and the Emulator UI |
| `seed`      | One-shot: creates demo users and a demo event, then exits           |
| `app`       | Vite dev server in emulator mode, with live reload                  |

## Start

```bash
podman compose up -d --build
```

The first run builds the emulator image and installs `node_modules` inside the
`app` container (a few minutes). Then open:

- **App:** http://localhost:5173
- **Emulator UI:** http://localhost:4001 — browse/edit Firestore data, users, rules log

`podman compose logs -f app` shows the dev server output; `podman compose ps`
should list `emulators` (healthy) and `app` (running), with `seed` exited.

## Isolation from production

In this environment the app only talks to the emulators: `.env.emulator` sets
the offline-only project `demo-fistball`, the app refuses to start in emulator
mode with any other project id, and the seed script refuses non-`demo-*`
projects. Note that a plain `npm run dev` outside this setup (no `.env`) uses
the **production** project.

## Sign in

Click **Sign in with Google**. The Auth emulator opens a fake account chooser
with the seeded users (or *Add new account* for any other email):

| User                      | Role                                   |
| ------------------------- | -------------------------------------- |
| `orgadmin@fistball.test`  | Org-admin (via the `orgAdmins` collection) |
| `admin@fistball.test`     | Event admin of *Demo Cup*              |
| `official@fistball.test`  | Official of *Demo Cup* (can score súmulas) |
| `viewer@fistball.test`    | Viewer of *Demo Cup*                   |

## Demo data

*Demo Cup* runs today and tomorrow (relative to when it was seeded) on two
courts: *National Teams U18 Men* (6 teams) and *U18 Women* (4 teams), with
rosters, a schedule built by the same generator as the Settings wizard, and
officials — twice what one round needs: 8 referees (six from playing nations,
two neutral; 2 top, 3 good, 3 normal), 4 clerks, 8 assistants (line judges, 4 fixed
pairs) and 2 court managers. Each team has two registered uniforms and the event has three
referee shirt colours (mint green, black, red); no uniform is assigned to the
games yet — try "Suggest uniforms" on the Uniforms page. It is also set as the live event. An archived event fills the timeline.

A second event, *Demo Club Cup*, has **club teams** (categories "Clubs Men" /
"Clubs Women", six clubs each, three courts): clubs carry a nation and a club
name, some officials belong to a playing club (never used for its games), a
referee from a club's nation is only a warning, and the event settings use
Referee 2 only in the finals rounds and a second clerk on court 1. Elgg plays
in both categories with different uniforms.

## Data & reset

Emulator data is saved to the `emulator-data` volume when the emulators stop
(`podman compose stop` or `down`) and reloaded on the next start. The seed
leaves existing demo events as they are and only adds missing ones (so after
an update the new *Demo Club Cup* appears next to your *Demo Cup* data). It
never adds demo data to a production copy.

```bash
podman compose run --rm seed --reset   # wipe ALL emulator data and reseed
podman compose down -v                 # remove containers AND volumes (data + node_modules)
```

## Testing with a copy of the production data

You can load a copy of the production Firestore data into the emulators. The
copy is made with a service account that may **only read** — the script checks
that before the first request and stops if the key could write.

**One-time setup** (needs IAM rights on the Google Cloud project, e.g. Owner —
the in-app org-admin role is not enough):

1. Google Cloud Console → project `fistball-arena` → *IAM & Admin* → *Service
   accounts* → *Create service account*, e.g. `arena-prod-reader`.
2. Grant it exactly one role: **Cloud Datastore Viewer**
   (`roles/datastore.viewer`). Nothing else.
3. *Keys* → *Add key* → *JSON*. Store the file **outside the repository**,
   e.g. `~/.config/fistball-arena/prod-reader.json` (`chmod 600`).

**Copy:**

```bash
PROD_READER_KEY=~/.config/fistball-arena/prod-reader.json podman compose run --rm prod-copy
podman compose run --rm prod-copy --import-only   # reload the last copy (no prod access)
```

If the script says it could not verify the key's permissions, enable the
*Cloud Resource Manager API* for the project (Console → *APIs & Services*); the
check uses it to make sure the key cannot write.

This **replaces all emulator data** (demo data and test accounts) with the
copy. Sign in with your usual email in the emulator's account chooser — your
role comes from the copied data. Login accounts themselves are not copied.

The copy contains personal data (names, birthdays, photos). It lives only in
the `prod-copy` and `emulator-data` volumes; remove them when done
(`podman compose down -v`), and delete the key in the Cloud Console when you no
longer need it. `podman compose run --rm seed --reset` goes back to demo data.

## Notes

- **Ports** 4001, 4400, 4500, 5173, 8080, 9099 and 9150 must be free on the host.
- **Code changes** reload live; the `app` container watches with polling because
  file events from macOS bind mounts are unreliable.
- **Dependencies:** `node_modules` lives in a container volume (the host's are
  built for macOS); it is reinstalled automatically when `package-lock.json` changes.
- **Only reachable from your Mac** by default (ports bound to `127.0.0.1`). The
  emulators have no authentication — anyone who can reach them can read, change
  or wipe all data. To test from another device (e.g. a tablet) on a **trusted**
  network, start with `BIND_ADDR=0.0.0.0 podman compose up -d` and open
  `http://<your-mac>:5173`; the app connects to the emulators on the same host
  it was loaded from.
- The broadcast overlay links still point to the hosted Fistball Live, which
  reads the real project — they won't show emulator data.

## Open points

- [ ] Decide whether a plain `npm run dev` (without `.env`) should default to
  the emulators instead of the production project, with production only via an
  explicit opt-in (e.g. `VITE_ALLOW_PROD=true`). Affects the maintainers' dev
  workflow — to be checked.
