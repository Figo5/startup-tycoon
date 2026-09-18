# Startup Tycoon — design

A long-form idle company tycoon. You start as a solo founder in a garage with one
product in development, and end by selling, being acquired, or going public — then
do it again, permanently better.

## Core loop

```
payroll ──► engineering output ──► shipped projects ──► quality / reliability / market size
   ▲                                                              │
   │                                                              ▼
cash ◄── revenue ◄── paying customers ◄── users ◄── marketing + sales + word of mouth
   │                                        ▲
   └──► infrastructure, support ────────────┘  (keeps what you acquired)
```

Every loop has a brake so nothing runs away:

- **Market cap.** Each product grows logistically toward an addressable market, so a
  single product cannot compound forever. The market widens with company reputation,
  company stage, research, shipped features and rival share you take back.
- **Marketing saturation.** Dollars past ~2% of a market per day buy steadily fewer users.
- **Cannibalisation.** Two products in one category split that category's market
  (`1 / n^0.75`), so shipping four clones is worse than shipping four different things.
- **Technical debt** slows development, **infra load** raises cost and outage risk, and
  **support demand** raises churn — all three scale with success.

## Three modes of engagement

| Mode | What it looks like |
|---|---|
| Passive | Close the tab. Up to 16 hours of elapsed time is credited on return, once. |
| Management | 30–90 seconds: hire, queue work, set priorities, spend, expand, raise. |
| Active | 3–10 minutes: resolve events, optionally play a 30–90 s puzzle for a real bonus. |

Active play is never required. The conservative branch of every event fires on its own
if you ignore it, and it is always survivable.

## Simulation architecture

The simulation is plain data and pure-ish functions in `src/sim/`. It has **no
dependency on Phaser or the DOM** and is fully exercised by `node --test`.

```
engine.step(state, days)
  ├─ modifiers.computeMods(state)     every research/room/boost/prestige/scenario
  │                                   effect, plus advisors, acquired technology,
  │                                   goal rewards and the roadmap engineering commit
  ├─ workforce.computeWorkforce       employees -> per-department output + payroll
  ├─ products.distributeEngineering   output -> project progress -> project effects
  │                                   (output is reduced by the roadmap commitment)
  ├─ roadmap.tickRoadmaps             initiative effort -> progress -> one-time effects
  ├─ products.tickProducts            growth, churn, conversion, revenue, decay, reputation
  ├─ infra.tickInfra                  load, capacity, cost, reliability, outage rolls
  ├─ economy.tickEconomy              cash, burn, runway, valuation
  ├─ workforce.tickWorkforce          morale, attrition, candidates, auto-hire
  ├─ research / competitors / events
  ├─ acquisitions.refreshAcquisitionTargets
  ├─ goals.tickGoals                  sustained counters + one-time completion
  └─ stages.checkStageUp
```

`step` returns immediately, and `runOffline` returns `null`, once `state.exitResult`
exists: a settled run has nothing left to simulate and nothing left to pay out.

`days` is the only time unit. **1 game day = 2 real minutes** (`REAL_SECONDS_PER_DAY`).
Live play calls `step` with ~0.002 days every 0.25 s; offline catch-up calls it with
0.05-day chunks. Everything in a step is linear in `days`, and probabilities convert
through `perDay(p, days)`, so batching and fine-stepping agree (a test asserts they
stay within 25% over ~0.85 game days).

The renderer is a *view*. `src/render/OfficeScene.js` reads state and draws it.
If pathfinding fails, a sprite simply stands still; no economic value depends on it.

## Transaction invariants

Both bugs reported from play had the same shape: **an action with no record that it
had already happened**. The fix is structural, not a clamp on the result.

| Rule | Where | Why it matters |
|---|---|---|
| Ownership is clamped to `[0,1]` on read and write | `sim/equity.js` | "your stake" can never be negative or above 100% |
| Dilution is one partial sale, and refuses `>= 100%` | `equity.diluteFounder` | a round cannot silently sell the founder out |
| An exit is a one-shot transaction | `equity.sellFounderStake` | the guard and the stake transfer happen before the reward is booked, so a repeat call finds the run ended |
| A second exit is refused by every path | `prestige.performExit`, `funding.exitOptions`, `funding.canExit` | no re-offer of a stake that is already sold |
| A settled run stops simulating | `engine.step`, `engine.runOffline` | reloading or going offline cannot replay anything |
| Upgrades buy one level, at the level's real price, once | `prestige.buyPrestige` | the price comes from authoritative state, never from the rendered card |
| Purchases carry a transaction id kept in the save | `meta.appliedTx` | a replayed click, a reload or an imported save cannot buy a level twice |
| A 450 ms guard refuses repeat triggers of one control | `ui/ui.js` | a double click is one interaction |
| Advisors, acquisitions, roadmap completions and goal rewards are marked before their effects land | `sim/advisors.js`, `sim/acquisitions.js`, `sim/roadmap.js`, `sim/goals.js` | each effect can only be applied once, ever |

`npm run balance` ends with a repeat-claim scan that asserts each of these, and
`test/exploits.test.js` covers them as unit tests.

## Content systems

| System | Data | Notes |
|---|---|---|
| Products | `data/products.js` | 6 categories with genuinely different shapes, 10 project types |
| Roadmaps | `data/roadmaps.js` | 16 initiatives in 4 directions; one per product at a time |
| People | `data/roles.js` | 10 roles, 6 departments, 8 specialties, per-output contribution |
| Advisors | `data/advisors.js` | 11 archetypes, fee + revenue-scaled retainer, 1/2/3 slots |
| Acquisitions | `data/acquisitions.js` | 8 targets, 3 offered at a time from Scale-Up |
| Goals | `data/goals.js` | 8 goals, 3 offered, 1 active, no expiry |
| Stages | `data/stages.js` | 7 stages; each widens every market and unlocks mechanics |
| Research | `data/research.js` | 35 items across 10 branches; several unlock mechanics, not numbers |
| Office | `data/office.js` | 6 tiers, 8 buyable rooms; both redraw the map |
| Funding | `data/funding.js` | 6 rounds priced off revenue multiples, 3 exit types |
| Events | `data/events.js` | 50 events, each with a category and a conservative auto-resolution |
| Competitors | `data/competitors.js` | 7 rivals with per-market share |
| Prestige | `data/prestige.js` | 14 permanent tracks, 4 market scenarios |

Balance numbers live only in `data/`. Nothing in the UI or renderer hardcodes a price.

## Event cadence

The cadence is stage-aware rather than one global timer, because a solo founder and
a five-hundred-person company should not generate the same amount of news.

| Stage | Mean gap (game days) | Inbox cap | Repeat damping |
|---|---|---|---|
| Solo Founder | 5.6 | 2 | 0.50 |
| Tiny Startup | 4.9 | 2 | 0.55 |
| Seed | 4.2 | 3 | 0.60 |
| Growing | 3.6 | 3 | 0.72 |
| Scale-Up | 3.3 | 3 | 0.88 |
| Major Tech | 2.9 | 4 | 1.00 |
| Late Stage | 2.7 | 4 | 1.15 |

Three dampers stack on top: the last event cannot repeat immediately, anything seen
before is suppressed in proportion to how often it has been seen (`1 / (1 + seen *
0.6 * damp)`), and a category that has just fired is suppressed (`1 / (1 + recent *
0.9)`). Later stages also weight money/legal/market events up and personal ones
down, so a large company's inbox is about larger problems.

The cooldown is floored at zero, so a full inbox can never bank a backlog of
spawns to release all at once, and an event whose every option the company cannot
afford lapses instead of holding a slot forever.

Measured with `npm run cadence` (3 seeds × 3 profiles): **8.4 event opportunities
per real hour** against a flat 6.0 before (+40%), and 0.28 per game day against
0.20. Per stage, against the old flat 6.0/h: Solo Founder 5.9 (−5%, quieter for a
learner), Tiny 6.0, Seed 7.0, Growing 8.3, Scale-Up 8.9, Major 10.4, Late 8.8.
`test/event-cadence.test.js` asserts the bounds, the dampers and that the pool
stays reachable.

## Feature power budgeting

The new systems were built to add decisions, not to shorten the game. Each one was
measured in isolation with `node tools/system-attribution.mjs` against the same
three seeds and profiles, because a feature that quietly accelerates pacing is a
balance bug.

Three findings, and what they changed:

1. **Automatic roadmaps were the whole regression.** With a manager planning them
   unprompted, first exit fell from 11.0 h to 8.4 h on the idle profile. Automation
   is now opt-in per product, and only ever picks the conservative initiatives.
2. **Initiatives were unbounded.** The greedy operator shipped 49–68 of them in one
   run, stacking every permanent effect. A run now has capacity for a bounded
   number (3 at Solo Founder, rising to 10 at Major), counted against both shipped
   and in-flight initiatives, and an initiative holds back 55% of engineering while
   it runs.
3. **Quality and efficiency effects are pacing-neutral**; growth and revenue
   multipliers are not. The growth multipliers were cut to roughly a third of their
   first draft, and the conservative initiatives - the ones automation will pick -
   are the mildest of the set. The big initiatives keep their size and their real
   downsides, which is where the strategic play is.

After that, measured first-exit time with each system played eagerly:

| Profile | Nothing | Roadmap | Advisor | Acquisition | Goal | All four | Documented baseline |
|---|---|---|---|---|---|---|---|
| Idle | 11.0 h | 11.0 h | 11.5 h | 10.9 h | 11.0 h | 11.4 h | 11–12.5 h |
| Moderate | 5.1 h | 5.0 h | 5.0 h | 5.1 h | 5.1 h | 4.8 h | 5.0–5.4 h |
| Active | 3.5 h | 3.5 h | 3.4 h | 3.6 h | 3.6 h | 3.5 h | 3.2–3.5 h |

## Progression and pacing

Stages gate on headcount, revenue and valuation together. Measured with a scripted
operator over three seeds (`npm run balance`):

| Player | First hire | Seed stage | Scale-Up | First exit |
|---|---|---|---|---|
| Idle (checks ~30 min) | ~1.0 h | ~2.0–2.5 h | ~6–7.5 h | ~11–12.5 h |
| Moderate (~12 min) | ~0.4–0.8 h | ~1.2–1.4 h | ~2.6–3.2 h | ~5.0–5.4 h |
| Active (~5 min + minigames) | ~0.1 h | ~0.8 h | ~1.8–1.9 h | ~3.2–3.5 h |

A first exit now pays 10–13 Founder Reputation (measured), against prestige tracks
costing 2–12 for their first level — enough for two or three meaningful picks, not
the whole board. `npm run balance` also simulates a second run with the first run's
reputation spent, and prints the upgrade levels that bought.

## Starting over

Three different things, deliberately named apart in the Company panel:

| Control | Keeps | Use it when |
|---|---|---|
| **Start a new company** (Company panel, Save) | the run ends without an exit; Founder Reputation, upgrades and run history all stay | you want a different company with the same founder |
| Prestige / exit | the run is sold once and the meta carries over | you want to bank a run |
| **Reset all progress** (Company panel) | nothing | you want the exact state of a first-ever player |

**Reset all progress** clears the live save, the corrupt-save recovery copy, the
single-tab claim and any older key under the game's storage prefix, then rebuilds
the state with the same constructor a first-ever load uses and persists it once, so
a reload shows the clean game and offline catch-up has nothing to replay. The
implementation is `resetAllProgress()` in `src/sim/save.js`. UI preferences are
stored under a separate prefix (`startup-tycoon/prefs/`) and are never touched. The
confirmation names every loss, and its destructive button is armed only after a
short delay so a stray double click cannot fire it.

## Save strategy

`src/sim/save.js` owns everything persistent. `SAVE_VERSION` is 4.

- Versioned schema with a `MIGRATIONS` chain applied on load. v3 → v4 is additive:
  the new containers (`roadmap` per product, `advisors`, `goals`, `acquisitions`,
  `exitResult`, `company.ownership`, the event category history, `meta.appliedTx`)
  are initialised empty, so **nothing is awarded retroactively** and the migration
  is idempotent (a test loads a migrated save and asserts the result is identical).
- `validate()` structurally checks a blob **before** anything replaces live state;
  a failing or unparseable save is copied to a recovery key and never silently dropped.
- `applyRunDefaults()` repairs rather than trusts: equity is clamped into `[0,1]`,
  founder reputation cannot be negative, upgrade levels are clamped to their
  maximum, missing per-product fields are created, and a save carrying an exit
  comes back paused.
- The RNG is a single serialisable `uint32`, so a reloaded game continues the same
  sequence (asserted by test).
- Offline credit is derived from `time.lastRealMs`, which is written *before* the
  simulation runs, so the same elapsed window can never be replayed. A clock that
  moves backwards yields `null` — no time, no reward. A settled run yields `null` too.
- Export/import is base64 JSON through the same validation path.
- A heartbeat key warns when a second tab opens; the game still runs, last write wins.
