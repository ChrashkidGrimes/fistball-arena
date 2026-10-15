# Fistball Arena

Tournament management for fistball (punhobol): create events, build the
schedule and knockout bracket, register players & staff, score matches on a
digital game report (súmula), and publish live results — including to the
companion spectator app, **Fistball Live**.

React + Vite PWA on Firebase (Google Auth + Firestore). No backend to run: all
data lives in Firestore, secured by rules.

## Features

- Multi-event, with per-event roles (**admin / official / viewer**) and global
  **org-admins** — managed from a single *Users & access* grid.
- Schedule generator (groups, round-robin, knockout, placement matches) with a
  drag-and-drop arranger, court/day windows and per-phase best-of.
- Digital game report with live scoring, locks, cards and PDF export.
- Standings and an auto-advancing bracket; publish to **Fistball Live**.
- Excel/Google-Sheet import for rosters and past events; custom event branding.

## Run your own instance

1. **Create a Firebase project** → enable **Authentication (Google provider)**
   and **Cloud Firestore**.
2. **Configure the app**: copy `.env.example` to `.env` and fill in your
   Firebase web config (Console → Project settings → Your apps). Set
   `VITE_ORG_ADMINS` to your bootstrap admin email(s).
3. **Publish security rules & index**:
   - Copy `firestore.rules` into Console → Firestore → Rules, **edit the
     bootstrap `isOrgAdmin()` email list to your own**, and Publish.
   - Create the collection-group single-field index declared in
     `firestore.indexes.json` (`members.email`, *Collection group* scope) — or
     deploy it with the Firebase CLI (`firebase deploy --only firestore:indexes`).
4. **Develop / build**:
   ```bash
   npm install
   npm run dev      # local dev server
   npm run build    # production build to dist/
   ```
5. **Deploy** the `dist/` folder to any static host (GitHub Pages, Netlify,
   Firebase Hosting, …).

   The reference deployment goes to a staging project first and is promoted
   to production on approval — see [docs/staging.md](docs/staging.md).

## How it works

- The Arena app **writes** everything under `events/{eventId}/…`
  (`games`, `reports`, `results`, `rosters`, `members`, …).
- A few **public** docs are readable without login — `public/live` (which event
  is on air), `public/event_{eventId}` (name/place/dates/logos) and
  `events/{eventId}/results` — so the spectator app **Fistball Live** can show
  scores, standings and the bracket with no authentication.

## Configuration reference

| Env var | Purpose |
| --- | --- |
| `VITE_FIREBASE_*` | Firebase web config (client-side, not secret). |
| `VITE_ORG_ADMINS` | Comma-separated bootstrap org-admin emails. Mirror it in `firestore.rules`. |

## License & branding

Code is released under the [MIT License](LICENSE). **Trademarks and logos are
not covered by this license.** The bundled IFA/PAFA marks and any club logos
belong to their owners and are used here only for the reference deployment —
replace them with your own before publishing a fork (see `public/ifa-mark.png`
and the event-logo/promoter branding).

Contributions welcome — open an issue or a pull request.
