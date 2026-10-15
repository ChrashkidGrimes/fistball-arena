# Contributing to Fistball Arena

Thanks for your interest in improving Fistball Arena! This project is a
community tool for running fistball (punhobol) tournaments, and contributions
of all kinds are welcome — code, bug reports, documentation, translations and
ideas.

## Ways to help

- **Report a bug** — open an issue with steps to reproduce (see the template).
- **Suggest a feature** — open an issue describing the problem it solves.
- **Improve docs / translations** — the interface is English; localization
  contributions are very welcome.
- **Fix or build something** — pick an open issue (or open one first to discuss)
  and send a pull request.

## Project layout

- **`fistball-arena/`** — the management app (React + Vite + Firebase). Organizers
  sign in, build events, score matches, publish results.
- **`fistball-live/`** — the public spectator app (plain HTML/JS). Read-only; shows
  scores, standings, bracket and schedule from the public Firestore docs.

## Development setup

```bash
npm install
cp .env.example .env     # fill in your own Firebase project config
npm run dev              # local dev server
npm run build            # production build
npm run lint             # oxlint
```

No Firebase project yet? `podman compose up -d --build` (or `docker compose`)
starts the app against the Firebase emulators with demo users and data — see
[docs/local-testing.md](docs/local-testing.md).

Otherwise you need a **Firebase project** (Google Auth + Firestore) — see the
[README](README.md) for the full setup, including publishing `firestore.rules`
and the `members.email` collection-group index.

## Pull request checklist

- Keep changes focused; one topic per PR.
- Match the surrounding code style; `npm run lint` and `npm run build` must pass
  (CI runs both on every PR).
- Do **not** commit secrets or your `.env`. The Firebase web config is
  client-side and not secret, but keep project-specific values out of source.
- Don't add third-party trademarks/logos — the app ships neutral placeholder
  marks on purpose (see *License & branding* in the README).
- Describe what changed and why in the PR body; link the related issue.

## Reporting security issues

If you find a security problem (e.g. a Firestore rules gap), please **do not**
open a public issue — contact the maintainer privately first so it can be fixed
before disclosure.

## Code of Conduct

Be respectful and constructive. By participating you agree to uphold a friendly,
harassment-free environment for everyone. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
