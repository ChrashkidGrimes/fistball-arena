# Staging

Merges to `main` no longer go straight to production. They go to **staging**
first, a separate Firebase project with its own data, logins and rules; once
tested there, the same commit is **promoted** to production.

```
PR ──merge──▶ main ──auto──▶ STAGING  (Firebase Hosting + rules of fistball-arena-staging)
                                │ test
                                ▼
                 promote (approval required)
                                ▼
                         PRODUCTION  (GitHub Pages + optionally the rules of fistball-arena)
```

| | Staging | Production |
|---|---|---|
| App | Firebase Hosting, e.g. `https://fistball-arena-staging.web.app` | GitHub Pages, `https://c-englert.github.io/fistball-arena/` (unchanged) |
| Data | project `fistball-arena-staging` — demo / test events | project `fistball-arena` |
| Deployed by | `.github/workflows/deploy-staging.yml`, on every push to `main` | `.github/workflows/deploy.yml`, on approval |
| Firestore rules | deployed with every staging deploy | by hand today; optionally by the workflow |

Staging can't touch production data: it is a different Firebase project.
Its builds show an orange **STAGING** badge and `[STAGING]` in the tab title.
Both stages serve `/version.json` with the deployed commit.

## Promoting to production

Two triggers are prepared in `deploy.yml`; we keep the one we agree on:

- **A — button**: Actions → "Deploy production (GitHub Pages)" → *Run workflow*
  (default `main`, or a specific commit / tag).
- **B — release tag**: `git tag v1.4.0 && git push origin v1.4.0`.

Either way the job runs in the GitHub environment **production**; with a
required reviewer it waits for approval. Before building, it warns if the
commit isn't the one running on staging.

## One-time setup (repository owner)

1. **Firebase project** `fistball-arena-staging` (Spark / free plan is enough):
   - Build → Authentication → enable the **Google** provider.
     (`*.web.app` / `*.firebaseapp.com` are authorized domains by default.)
   - Build → Firestore → create the database (same region as production).
   - Build → Hosting → get started (no CLI steps needed).
   - Project settings → Your apps → add a **web app**, note its config.
2. **Service account for the staging deploy**: Google Cloud console of the
   staging project → IAM → Service accounts → create, role **Firebase Admin**
   (it's only the staging project) → Keys → add key (JSON).
3. **GitHub** (c-englert/fistball-arena → Settings):
   - Environments → **staging**:
     - secret `FIREBASE_SERVICE_ACCOUNT_STAGING` = the JSON key;
     - variables `STAGING_FIREBASE_API_KEY`, `STAGING_FIREBASE_AUTH_DOMAIN`,
       `STAGING_FIREBASE_PROJECT_ID`, `STAGING_FIREBASE_STORAGE_BUCKET`,
       `STAGING_FIREBASE_MESSAGING_SENDER_ID`, `STAGING_FIREBASE_APP_ID`
       (web app config, not secret), `STAGING_ORG_ADMINS` (comma-separated).
   - Variable `STAGING_URL` at repository level (the deploy of production
     reads it for the "same commit" check), e.g. `https://fistball-arena-staging.web.app`.
   - Environments → **production** → *Required reviewers*: yourself
     (optionally *Deployment branches and tags*: `main` and `v*`).
   - Optional, to deploy the production rules with the app: secret
     `FIREBASE_SERVICE_ACCOUNT_PROD` in the production environment, a service
     account of `fistball-arena` with only the rules / index roles
     (Firebase Rules Admin, Cloud Datastore Index Admin). Without it the rules
     stay a manual step.
4. Run "Deploy staging" once from the Actions tab, sign in on the staging URL,
   add testers (Access page → org admins, or event members).

Until step 3 is done, the staging workflow skips with a notice, and
production is only deployed through the new trigger(s).

## Open points

- Trigger A (button) or B (release tag) — or both?
- Production Firestore rules: deployed by the workflow with the app, or still
  by hand?
- Test data on staging: demo events (seed script for a real project) or a
  copy of production (personal data — names, birthdays, photos)?
- Fork PRs get no secrets, so per-PR preview URLs (Firebase Hosting preview
  channels) only work for branches in this repository.
- Fistball Live (overlay, public site) reads production only; its links from
  staging lead nowhere.
