# Zilch

`zilch.jacobdanderson.net` is a browser edition of Jacob Anderson's six-dice push-your-luck game. It combines the shared rules from the C++, Java, and computer-simulation versions in a responsive Nuxt interface.

## What is included

- Solo play against Easy, Medium, or simulation-trained Hard computer opponents
- Local pass-and-play for one to six people
- The shared 5,000-point target and 1,000-point opening defaults
- Singles, multiples, later-roll multiple extensions, straights, and three pairs
- Hot dice, first-roll mercy, Final Chase, optional ties, and optional Stealing
- Device-local save and resume with no account or server-side game data
- A strategy Tips page with simulation-tested banking guidance, variant findings, and clearly labeled endgame heuristics
- Keyboard, touch, reduced-motion, and screen-reader support

Hard mode ports the strongest tested policies from the companion `Computers_vs_Zilch` simulator, including a separate policy when Stealing is enabled. Medium adds score-aware finish and buffer decisions, while Easy uses a straightforward 600-point turn target. See [`docs/strategy-research.md`](docs/strategy-research.md) for the reproducible policy inputs, holdouts, and limitations.

## Local development

Use Node `24.18.1` and npm `12.0.2` from the repository root.

```bash
npm ci
```

Then keep the API running in one terminal:

```bash
npm run server
```

Start the frontend from a second terminal:

```bash
npm run dev
```

The Nuxt frontend runs on `127.0.0.1:3333`. The minimal read-only Express health API runs on `127.0.0.1:3006`, and local browser requests reach it through the same-origin `/api` path.

## Validation

```bash
npm run audit:all
npm run audit:prod
npm run validate
npm run a11y
```

`npm run validate` runs game-rule tests, API tests, linting, type checks, both production builds, native-binding checks, and deployment-output checks.

## Structure

- `front-end/` contains the Nuxt game, pure TypeScript rules engine, components, and game tests.
- `back-end/` contains the loopback-only Express health API.
- `deploy/` contains the direct Nginx and systemd release path for `zilch.jacobdanderson.net`.
- `netlify/` preserves the separate Netlify adapter.

Game state is stored only in browser local storage. The API exposes no player names, scores, analytics, accounts, sessions, or mutable routes.

## Production

Production serves the generated Nuxt files directly from Nginx and proxies `/api` to a dedicated loopback-only Node process on port `3018`. The service runs with Node 24.18.1 and npm 12.0.2 from `/opt/node-24.18.1/bin` without replacing the host-wide runtime. Releases are immutable, version-tagged runtime trees under `/srv/zilch.jacobdanderson.net/releases`, promoted through an atomic `current` symlink with automatic rollback on failed health, identity, header, or dual-stack checks.

See [`deploy/README.md`](deploy/README.md) for the first-install and promotion procedure.

## Repository lineage

`origin` is the dedicated `anderson-webops/zilch.jacobdanderson.net` repository. `template` preserves the hardened Nuxt monorepo template lineage, and `upstream` remains connected to `antfu/vitesse-nuxt` for selective upstream review.

## License

The web application is available under the [MIT License](LICENSE). It implements game rules independently and does not copy the GPLv3 C++ renderer, model, shader, font, or other asset files. Bundled font notices are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
