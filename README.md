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
npm test                    # node --test over test/ - 145 simulation tests, no browser
npm run balance             # pacing + per-run repeat-claim scan (HOURS=24 node tools/balance.js)
npm run cadence             # event opportunities per stage and per real hour
npm run probe               # end-to-end probe of every system, with assertions
npm run playtest            # scripted browser playtest, writes screenshots to shots/
node tools/playtest-v2.mjs  # the hardening/feature pass playtest, writes shots-v2/
node tools/system-attribution.mjs   # first-exit time with each new system on its own
```

`tools/playtest*.mjs` need a Playwright install; set `PLAYWRIGHT_PATH` to its
`index.mjs` if it is not at the default path in those files.

## Project structure

```
src/
  data/            balance and content tables - products, roles, research, stages,
                   office tiers, funding, events, competitors, prestige, roadmaps,
                   advisors, acquisitions, goals
  sim/             the simulation. No Phaser, no DOM, fully unit-testable
    state.js       state shape, newGame, employee/product/project constructors
    engine.js      step(state, days) plus offline catch-up
    modifiers.js   collapses every effect source into one modifier bag
    equity.js      the one path for ownership and cash transactions
    products.js    growth, churn, conversion, revenue, development projects
    workforce.js   output, morale, attrition, hiring, managers
    infra.js       capacity, load, cost, reliability, outages
    economy.js     cash flow, contracts, valuation, emergency measures
    roadmap.js     per-product initiatives: cost, progress, one-time effects
    advisors.js    slot-limited retained experts with real effects and costs
    acquisitions.js company purchases: people, revenue, IP, integration pain
    goals.js       one active medium-term goal per run
    research.js funding.js competitors.js events.js stages.js prestige.js office.js
    save.js        versioned schema, validation, migration, export/import, tab guard
  render/          Phaser view layer
    art.js         all sprites, generated at runtime from character grids
    layout.js      office floor plans + BFS pathfinding
    OfficeScene.js tiles, furniture, employee agents, advisors, huddles, camera
  ui/              DOM shell - top bar, inbox, activity feed, management panels
  minigames/       three optional 30-90 second activities
tools/             balance, cadence, attribution, probe, browser playtests
test/              node:test suites
```

## Transaction invariants

Two exploits in this game came from the same root cause: a UI action that could
be triggered more than once, with no record that it had already happened. Both
are now impossible by construction rather than by clamping the result afterwards.

- **Ownership moves through one path** (`sim/equity.js`). `founderEquity` is
  clamped to `[0, 1]` on every read and write, dilution refuses any percentage
  that is not a genuine partial sale, and the exit is a one-shot transaction: the
  guard and the stake transfer happen before the reward is booked, so a second
  call (double click, replayed handler, reload, import) finds the run already
  ended. After an exit the state stops simulating entirely.
- **Founder upgrades are transactional** (`sim/prestige.js`). One level per
  purchase, at the price for the level you actually hold, deducted exactly once,
  capped at the track's maximum, with the control disabled and showing `MAX` at
  the ceiling. Every purchase carries a transaction id recorded in the save, so a
  replayed click, a reload or an imported save cannot buy a level twice.
- The UI refuses a second trigger of the same purchase inside a 450 ms window,
  because a double click is one interaction.

## Gameplay systems

- **Products** — 6 categories (consumer mobile, SaaS productivity, developer tool,
  B2B platform, AI product, enterprise software) with genuinely different growth,
  churn, pricing, support load, infrastructure load and enterprise potential.
  Each tracks users, customers by class, quality, reliability, technical debt and version.
- **Development** — 10 project types per product (MVP, features, reliability, refactor,
  performance, mobile, enterprise features, security, AI features, i18n). Engineering
  output is split across products by priority; technical debt slows it down.
- **Roadmaps** — 16 initiatives across four directions (growth, monetization,
  quality, product). One runs per product at a time, costs cash up front, holds
  back 55% of engineering while it runs, and applies its effect once on
  completion. A run has capacity for a bounded number of them (3 at Solo Founder
  rising to 10 at Major), which is what makes the choice matter: an initiative
  costs you engineering time, a slot, and a different initiative you did not take.
  An engineering manager can pick for you, conservatively, if you turn automation
  on per product.
- **Advisors** — 11 archetypes, unlocked at Seed, with a one-time engagement fee
  and a retainer that scales with revenue. Slots are 1/2/3 by stage, and every
  advisor takes something away as well as adding something. They work for the
  current company only: prestige resets the bench, and there is deliberately no
  upgrade that preserves one.
- **Acquisitions** — 8 fictional targets unlock at Scale-Up, three at a time.
  Each brings people, recurring revenue, infrastructure and support load,
  technology, an integration period with an engineering penalty and a morale hit.
  A target can be bought exactly once and never appears again.
- **Company goals** — 3 on offer at a time, one active, no streaks and no expiry.
  Rewards are cash, reputation and small permanent efficiency effects, paid once.
- **People** — 10 roles across 6 departments, each contributing to specific outputs.
  Skill, productivity, experience, morale, specialties, promotion and reassignment.
- **Departments** — each has a priority setting that changes what its effort buys.
  Managers unlock automation: an engineering manager keeps the top product's queue
  full by itself, and Delivery Playbooks research extends that to every product.
- **Office** — 6 tiers and 8 buyable rooms. Both visibly redraw the map.
- **Infrastructure** — capacity vs load, cost per unit, reliability, outages.
  Autoscaling research removes the manual upkeep entirely.
- **Economy** — cash, revenue, payroll, infra, marketing, rent, advisors, roadmap
  work, overhead, runway, valuation. Running out of cash cuts marketing and lays
  people off; it never hard-fails.
- **Funding** — 6 rounds priced off revenue multiples, each diluting your stake, which
  is exactly what your exit pays out on. Bootstrapping the whole way is viable.
- **Competitors** — 7 rivals with per-market share that presses on your addressable
  market; beat them on revenue to push them back, or buy them outright.
- **Research** — 35 items in 10 branches. Several unlock mechanics (autoscaling,
  auto-hiring, company-wide work automation, the AI product category) rather than numbers.
- **Events** — 50 event types with real decisions, each tagged with a category so
  repeats can be damped; the cadence is stage-aware and busier as the company grows.
- **Prestige** — exit via acquisition, strategic acquisition or IPO. Founder Reputation
  buys 14 permanent tracks, and finishing runs unlocks harder markets that pay more.

## Save behaviour

- Autosaves to `localStorage` every 10 seconds, on tab hide, and on unload.
- Versioned schema (`SAVE_VERSION = 4`) with a forward-migration chain. A v3 save
  loads unchanged; the new systems start empty rather than being back-filled, so
  nothing is awarded retroactively.
- A save is structurally validated **before** it replaces anything. A corrupt or
  invalid save is copied to `startup-tycoon/corrupt` and the game starts fresh rather
  than silently destroying it.
- Out-of-range values are repaired on load: equity is clamped into `[0, 1]`,
  founder reputation can never be negative, and upgrade levels are clamped to
  their configured maximum.
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
| `1`–`9`, `0` | Open a management panel (Company … Advisors, Goals) |
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
- Employee and advisor movement is cosmetic. Sprites walk to desks, rooms and
  huddles, but no economic outcome depends on where they are or whether they arrive.
- Office layouts are generated from the tier and rooms owned, not hand-placed, and
  there is no free-form furniture placement.
- Competitors are simulated coarsely: strength, cash and per-market share. They do
  not have products, employees or balance sheets of their own.
- Acquisitions are a satisfying one-off decision, not a mergers simulator: the
  acquired company becomes revenue, people and technology, and is never modelled as
  a running business again.
- Advisors are deliberately not cumulative across runs, and stacking them is capped
  by slots rather than by an internal limit.
- Balance was tuned against a scripted operator (`npm run balance`), not against a
  human optimiser. A player who micro-optimises project ordering will beat the
  measured pacing.
- No audio.
- Mobile works but is cramped; desktop and laptop are the intended targets.
