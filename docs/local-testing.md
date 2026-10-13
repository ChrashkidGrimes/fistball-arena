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
rosters, referees and a schedule built by the same generator as the Settings
wizard. It is also set as the live event. An archived event fills the timeline.

## Data & reset

Emulator data is saved to the `emulator-data` volume when the emulators stop
(`podman compose stop` or `down`) and reloaded on the next start. The seed
skips if the demo event already exists.

```bash
podman compose run --rm seed --reset   # wipe ALL emulator data and reseed
podman compose down -v                 # remove containers AND volumes (data + node_modules)
```

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
