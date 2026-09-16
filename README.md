# Startup Tycoon

A long-form idle startup tycoon with a top-down pixel-art office. You begin as a solo
founder in a garage with one product in development and a few weeks of runway, and
finish by selling the company, being acquired, or going public — then start again with
permanent founder progression.

The company runs whether you are watching or not. Checking in for a minute is enough;
playing a puzzle is optional and rewarded.

## Install

```sh
npm install
```

## Run

```sh
npm run dev          # development server at http://localhost:5180
npm run build        # static build into dist/
npm run preview      # serve the built files
```

`dist/` is plain static files. Any static host will serve it; there is no backend,
no account, no network calls at runtime.

## Test

```sh
npm test             # node --test over test/ - 42 simulation tests, no browser needed
npm run balance      # long-horizon pacing simulation (HOURS=40 to shorten it)
node tools/playtest.mjs   # scripted browser playtest, writes screenshots to shots/
```

`tools/playtest.mjs` needs a Playwright install; set `PLAYWRIGHT_PATH` to its
`index.mjs` if it is not at the default path in that file.

## Project structure

```
src/
  data/            balance and content tables - products, roles, research, stages,
                   office tiers, funding, events, competitors, prestige
  sim/             the simulation. No Phaser, no DOM, fully unit-testable
    state.js       state shape, newGame, employee/product/project constructors
    engine.js      step(state, days) plus offline catch-up
    modifiers.js   collapses every effect source into one modifier bag
    products.js    growth, churn, conversion, revenue, development projects
    workforce.js   output, morale, attrition, hiring, managers
    infra.js       capacity, load, cost, reliability, outages
    economy.js     cash flow, contracts, valuation, emergency measures
    research.js funding.js competitors.js events.js stages.js prestige.js office.js
    save.js        versioned schema, validation, migration, export/import, tab guard
  render/          Phaser view layer
    art.js         all sprites, generated at runtime from character grids
    layout.js      office floor plans + BFS pathfinding
    OfficeScene.js tiles, furniture, employee agents, camera
  ui/              DOM shell - top bar, inbox, activity feed, management panels
  minigames/       three optional 30-90 second activities
tools/             balance simulation and browser playtest
test/              node:test suites
```

## Gameplay systems

- **Products** — 6 categories (consumer mobile, SaaS productivity, developer tool,
  B2B platform, AI product, enterprise software) with genuinely different growth,
  churn, pricing, support load, infrastructure load and enterprise potential.
  Each tracks users, customers by class, quality, reliability, technical debt and version.
- **Development** — 10 project types per product (MVP, features, reliability, refactor,
  performance, mobile, enterprise features, security, AI features, i18n). Engineering
  output is split across products by priority; technical debt slows it down.
- **People** — 10 roles across 6 departments, each contributing to specific outputs.
  Skill, productivity, experience, morale, specialties, promotion and reassignment.
- **Departments** — each has a priority setting that changes what its effort buys.
  Managers unlock automation: an engineering manager keeps the top product's queue
  full by itself, and Delivery Playbooks research extends that to every product.
- **Office** — 6 tiers and 8 buyable rooms. Both visibly redraw the map.
- **Infrastructure** — capacity vs load, cost per unit, reliability, outages.
  Autoscaling research removes the manual upkeep entirely.
- **Economy** — cash, revenue, payroll, infra, marketing, rent, overhead, runway,
  valuation. Running out of cash cuts marketing and lays people off; it never hard-fails.
- **Funding** — 6 rounds priced off revenue multiples, each diluting your stake, which
  is exactly what your exit pays out on. Bootstrapping the whole way is viable.
- **Competitors** — 7 rivals with per-market share that presses on your addressable
  market; beat them on revenue to push them back, or buy them outright.
- **Research** — 35 items in 10 branches. Several unlock mechanics (autoscaling,
  auto-hiring, company-wide work automation, the AI product category) rather than numbers.
- **Events** — 20 event types with real decisions; three of them offer a minigame.
- **Prestige** — exit via acquisition, strategic acquisition or IPO. Founder Reputation
  buys 14 permanent tracks, and finishing runs unlocks harder markets that pay more.

## Save behaviour

- Autosaves to `localStorage` every 10 seconds, on tab hide, and on unload.
- Versioned schema with a forward-migration chain.
- A save is structurally validated **before** it replaces anything. A corrupt or
  invalid save is copied to `startup-tycoon/corrupt` and the game starts fresh rather
  than silently destroying it.
- The RNG state is saved, so a reloaded game continues the same random sequence.
- Export/import is base64 text through the same validation path.
- Opening a second tab warns you; the game keeps running, last write wins.
- **Reset** keeps Founder Reputation and permanent upgrades, and asks first.

## Offline progression

- Elapsed wall-clock time is simulated in 0.05-day chunks when you return, capped at
  **16 hours**.
- Credit is derived from a timestamp written *before* simulating, so the same window
  can never be replayed by reloading.
- A system clock that moves backwards earns exactly nothing.
- You get one concise summary — time away, revenue, expenses, net cash, users,
  customers, team change, shipped work, and up to a dozen notable events.
  Everything in it is already banked; there is nothing to collect.

## Controls

| Input | Action |
|---|---|
| `1`–`8` | Open a management panel |
| `Space` | Pause / resume |
| `Esc` | Close the panel or dialog |
| `W A S D` / arrows | Pan the office |
| `Q` / `E` / wheel | Zoom |
| drag | Pan the office |
| `?` | Help |

Every panel is reachable by keyboard, focus outlines are visible, status is never
communicated by colour alone, and `prefers-reduced-motion` stops sprites wandering.

## Known limitations

- Single save slot, one tab at a time. The second tab is warned, not blocked.
- Employee movement is cosmetic. Sprites walk to desks and rooms, but no economic
  outcome depends on where they are or whether they arrive.
- Office layouts are generated from the tier and rooms owned, not hand-placed, and
  there is no free-form furniture placement.
- Competitors are simulated coarsely: strength, cash and per-market share. They do
  not have products, employees or balance sheets of their own.
- Balance was tuned against a scripted operator (`npm run balance`), not against a
  human optimiser. A player who micro-optimises project ordering will beat the
  measured pacing.
- No audio.
- Mobile works but is cramped; desktop and laptop are the intended targets.
