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
  ├─ modifiers.computeMods(state)     research, rooms, boosts, prestige, scenario, advisors,
  │                                   acquired tech, goal rewards, economy phase, strategic
  │                                   investor perks, department perks/synergies, founder
  │                                   background, and the roadmap engineering commit
  ├─ workforce.computeWorkforce       employees -> per-department output + payroll
  │                                   (traits, energy, pace, leave, streaks)
  ├─ products.distributeEngineering   output -> project progress -> project effects
  ├─ launch.settleCompleted           credit a lead, roll real launches (flop..viral)
  ├─ roadmap.tickRoadmaps             initiative effort -> progress -> one-time effects
  ├─ products.tickProducts            growth, churn, conversion, revenue, decay, reputation
  │                                   (trends, price wars, network effects, security, billing)
  ├─ infra.tickInfra                  load, capacity, cost, reliability, outage rolls
  ├─ economy.tickEconomy              cash, burn, room upkeep, loans, interest, valuation
  ├─ workforce.tickWorkforce          morale, energy, burnout, attrition, candidates
  ├─ research / competitors           rivals take personality-driven turns, entrants, nemesis
  ├─ events.tickEvents                scheduled follow-ups, triggers, cadence draw, auto-resolve
  ├─ market.tickMarket                economy phases and category trends
  ├─ funding.tickFunding              board targets, loan completion
  ├─ acquisitions.refreshAcquisitionTargets
  ├─ goals.tickGoals                  sustained counters + one-time completion
  ├─ stages.checkStageUp
  └─ legacy.tickAchievements          in-play achievements, each paid once, ever
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
| An achievement id is recorded in the meta before its reputation is paid | `sim/legacy.js` | an achievement pays once across every company, reload and import |
| A board target moves from `open` to `hit` or `missed` exactly once | `sim/funding.js` | a target cannot reward or punish twice |
| Records and the hall of fame are written inside the exit transaction | `sim/prestige.js` | a replayed exit cannot add a second record |

`npm run balance` ends with a repeat-claim scan that asserts each of these, and
`test/exploits.test.js` covers them as unit tests.

## Content systems

| System | Data | Notes |
|---|---|---|
| Products | `data/products.js` | 10 categories, 11 project types, 3 build approaches, launch outcomes |
| Launches | `sim/launch.js` | only real launches roll; bonuses beyond quality have diminishing returns |
| Roadmaps | `data/roadmaps.js` | 16 initiatives in 4 directions; one per product at a time |
| People | `data/roles.js`, `data/traits.js` | 10 roles, 6 departments, 8 specialties, 20 traits in 3 rarities, 5 titles, 3 work paces |
| Organisation | `data/org.js` | 19 department perks, 5 synergies, 7 founder actions |
| Advisors | `data/advisors.js` | 11 archetypes, fee + revenue-scaled retainer, 1/2/3 slots |
| Acquisitions | `data/acquisitions.js` | 8 targets, 3 offered at a time from Scale-Up |
| Goals | `data/goals.js` | 8 goals, 3 offered, 1 active, no expiry |
| Stages | `data/stages.js` | 7 stages; each widens every market and unlocks mechanics |
| Research | `data/research.js` | 50 items in 12 branches, including 4 exclusive doctrine pairs |
| Office | `data/office.js` | 6 tiers, 13 rooms with upkeep and per-tier room slots |
| Market | `data/market.js` | 4 economy phases, 14 category trends |
| Funding | `data/funding.js` | 6 rounds x up to 4 investors, board targets, revenue loans, 6 exits |
| Events | `data/events.js`, `data/events_depth.js` | 99 events, 10 triggers, follow-up chains; every one has a conservative auto-resolution |
| Competitors | `data/competitors.js` | 9 rivals, 7 personalities, generated entrants |
| Prestige | `data/prestige.js`, `data/legacy.js` | 18 tracks, 4 market scenarios, 9 backgrounds, 7 challenges, 36 achievements |

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

On top of the random draw, two other sources add decisions without touching the
cadence: **follow-ups** (a choice schedules a named event days later, e.g. an
exhausted engineer who was pushed through a launch resigns) and **triggers** (a
viral launch, a flop, a rival's poaching move, lawsuit, layoffs or copied launch,
an economy shift or a new trend in a market you are not in). Chain-only and
trigger events are never drawn at random, each trigger has its own cooldown, and
both respect the inbox ceiling.

Measured with `npm run cadence` after the depth pass (3 seeds × 3 profiles):
**11.8 decisions per real hour** (was 8.4), 0.40 per game day. Per stage: Solo
Founder 6.8, Tiny 8.5, Seed 9.7, Growing 11.8, Scale-Up 12.9, Major 13.7, Late 16.4.
The mix is people 268 · market 234 · money 121 · product 113 · infra 61 · legal 58 ·
customers 48 over nine runs. `test/event-cadence.test.js` asserts the bounds, the
dampers and that the pool stays reachable; `test/depth-events.test.js` resolves
every choice of every event on a rich and a bare company.

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

Stages gate on headcount, revenue and valuation together. Measured with the scripted
operator over three seeds (`npm run balance`, 2026-09-25, after the depth pass; the
active profile now also uses founder actions):

| Player | First hire | Seed stage | Scale-Up | Major | First exit |
|---|---|---|---|---|---|
| Idle (checks ~30 min) | ~0.5 h | ~2.0 h | ~6.5 h | ~9–10.5 h | ~13.5–16 h |
| Moderate (~12 min) | ~0.4–0.8 h | ~1.2–1.4 h | ~2.8–3.0 h | ~4.6–5.0 h | ~6.2–7.0 h |
| Active (~5 min, minigames, founder actions) | ~0.1 h | ~0.8 h | ~2.0–2.1 h | ~2.6–3.1 h | ~3.6–4.1 h |

That is roughly 15–25% longer than before the pass, from added depth rather than
raised prices. A first exit pays 9–17 Founder Reputation from the exit itself plus
around 15 from one-time achievements, and a second run is not simply faster: in
the measured runs it took as long as the first, because the difference now comes
from backgrounds, starting products, challenges and the co-founder rather than
multipliers alone. See [balance](balance.md) for strategy comparisons.

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

`src/sim/save.js` owns everything persistent. `SAVE_VERSION` is 5.

- v4 → v5 (the depth pass) is additive too: employees and candidates get empty
  trait lists, full energy and an empty story; products get the Standard approach
  and no launch history; the market, rival personalities and valuations, missing
  rivals, funding targets/perks/loans, founder actions and legacy records are
  initialised. No trait, achievement or reputation is granted retroactively, and a
  genuine v4 save from the previous release loads and keeps playing (browser-tested).
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
