# Handoff — Startup Tycoon (gameplay hardening + feature pass)

Factual state of the build after the hardening/feature pass. Numbers here come from
`npm test`, `npm run balance`, `npm run cadence`, `npm run probe` and
`node tools/playtest-v2.mjs` as run on this machine.

## What this pass was for

Two exploits reported from play (founder upgrades maxed instantly; the same equity
cashed out repeatedly) and four new long-term systems (roadmaps, advisors,
acquisitions, company goals), plus a busier event cadence. Full build details below.

## The two exploits: root cause and fix

| Symptom | Root cause | Fix |
|---|---|---|
| A run's stake could be cashed out repeatedly, driving the "sold" total past 100% | `performExit` mutated only the permanent `meta` bag. `state` was never marked as ended, so the exit overlay could be dismissed, the company kept running, and the same 100% stake was sold again — measured as 5 payouts for one company, 9 FR each | The exit is now a one-shot transaction in `sim/equity.js`: the guard and the ownership transfer happen before the reward is booked, the stake goes to 0, `exitOptions`/`canExit` refuse afterwards, and `engine.step`/`runOffline` do nothing once `state.exitResult` exists |
| Founder upgrades could be maxed instantly | `buyPrestige` was correct in isolation — the reputation was the problem: replayed exits inflated FR without limit (measured: 6 replayed exits = 54 FR = 7 purchases). There was also no transaction record, so a double click could buy two levels | One authoritative purchase: price from state (never the rendered card), one level per call, capped at the track maximum with the control disabled and `MAX` shown, a transaction id kept in the save (a replayed click/reload/import is refused), and a 450 ms UI guard so a double click is one interaction |

Both are now enforced rather than clamped: `test/exploits.test.js` (15 tests) plus a
repeat-claim scan at the end of `npm run balance` (17/17 checks pass).

## Implemented systems

| System | State | Notes |
|---|---|---|
| Simulation engine | complete | frozen after an exit; live and offline share one path |
| Ownership / cash transactions | complete | `sim/equity.js`, the only path that mutates equity or spends cash |
| Products | complete | 6 categories, 10 project types, logistic growth, 4 customer classes |
| Roadmaps | new | 16 initiatives, 4 directions, per-product, bounded per run |
| Advisors | new | 11 archetypes, slots 1/2/3, fee + revenue-scaled retainer, real tradeoffs |
| Acquisitions | new | 8 targets from Scale-Up, people/revenue/tech/integration, one-time |
| Company goals | new | 3 offered, 1 active, no expiry, one-time rewards |
| Events | retuned | 50 events, all categorised; stage-aware cadence |
| Employees / departments | complete | unchanged apart from advisor hooks |
| Office / infrastructure / economy / funding / competitors / research | complete | economy gained acquired-revenue, advisor and roadmap cost lines |
| Prestige | complete | 14 tracks, 4 scenarios; advisors reset by prestige (stated, not silent) |
| Save | complete | v4, additive migration, repairs out-of-range values |
| Renderer | complete | advisor visitor sprites, roadmap huddles, goal celebration burst |
| UI | complete | 10 panels, purchase guards, `MAX` state, run-ended handling |
| Audio | not implemented | deliberately out of scope |

## Test results

`npm test` — **145 tests, 145 pass, 0 fail** (~3 s). 68 existed before this pass; the
new ones cover:

- `exploits.test.js` (15) — refuse unaffordable upgrades, exact one-level purchase,
  one-level-per-interaction, maximum enforcement and `MAX`, non-negative reputation,
  save/reload/import cannot replay a purchase, exit pays once, ownership never
  negative or above 100%, dilution bounds, refused mutations after an exit, a settled
  run stops simulating, funding rounds dilute once, cash spending refused, fresh run
  after an exit.
- `roadmaps.test.js` (13) — effect keys wired to the sim, single start and single
  charge, unaffordable refusal, one-time effects, save/reload without re-applying,
  stage/department/product prerequisites, cancel keeps the fee, opt-in automation,
  the per-run capacity cap (including in-flight initiatives), the 55% engineering
  commitment measured against project throughput, effort split across two products,
  effect clamping.
- `advisors.test.js` (8) — every archetype has a real cost and wired effects, stage
  unlock and slot curve, fee charged once, slot cap enforced from state, effects and
  downsides measured in the modifier bag, retainer in the cost lines, bounded
  stacking, persistence, prestige reset.
- `acquisitions.test.js` (10) — every target's fields, stage gating and offer count,
  one-time purchase, unaffordable refusal with nothing changed, people/revenue/tech
  applied once, integration drag and its expiry, load and support wiring, save/reload,
  valuation-based pricing, refused after an exit.
- `goals.test.js` (11) — every goal completable and one-time, three offered from
  reachable stages, one active with free switching, reward paid once, FR reward
  banked once, sustained goals accumulate/complete/reset, save/reload, rewards reach
  the modifier system, sane progress numbers.
- `event-cadence.test.js` (11) — every event categorised, stage-aware gaps, shorter
  than the old fixed window, measured spawn rate, inbox cap and cooldown floor, no
  back-to-back repeat, category damping, whole pool reachable, unattended
  auto-resolution, stage gating, empty-pool safety.
- `migration.test.js` (9) — v3 → v4 preserves everything, new state initialised empty
  with nothing awarded retroactively, idempotent, keeps playing, can use every new
  system, out-of-range values repaired, settled runs reload settled, version guard,
  `normalizeMeta` safe on junk.

`npm test` previously ran `node --test test/`, which Node 24 rejects (the directory
form was removed); it is now `node --test --test-reporter=spec "test/*.test.js"`.

## Balance results

`npm run balance` (3 seeds × 3 profiles, 24 real-hour horizon). Full output in
`balance-report.txt`.

First exit, hours of real play:

| Profile | Documented baseline | This build, baseline operator | This build, all four systems played |
|---|---|---|---|
| Idle (~30 min checks) | 11.0–12.5 h | 10.5–11.5 h | 11.0–11.5 h |
| Moderate (~12 min) | 5.0–5.4 h | 4.8–5.2 h | 4.8–5.2 h |
| Active (~5 min + minigames) | 3.2–3.5 h | 3.4–3.6 h | 3.1–3.6 h |

`node tools/system-attribution.mjs` isolates each system (first exit, seeds averaged):

| Profile | Nothing | Roadmap | Advisor | Acquisition | Goal | All four |
|---|---|---|---|---|---|---|
| Idle | 11.0 h | 11.0 h | 11.5 h | 10.9 h | 11.0 h | 11.4 h |
| Moderate | 5.1 h | 5.0 h | 5.0 h | 5.1 h | 5.1 h | 4.8 h |
| Active | 3.5 h | 3.5 h | 3.4 h | 3.6 h | 3.6 h | 3.5 h |

Two genuine balance bugs were found this way and fixed rather than papered over:

1. **Automatic roadmaps were a free multiplier.** With an engineering manager
   planning them unprompted, idle first exit fell to 8.4 h. Automation is now opt-in
   per product (`Auto: off (you pick)` by default) and only ever picks conservative
   initiatives.
2. **Initiatives were unbounded.** The greedy operator shipped **49–68** of them per
   run and stacked every permanent effect. A run now has capacity for a bounded
   number (3 at Solo Founder → 10 at Major), counted against both shipped and
   in-flight initiatives; an active initiative also holds back 55% of engineering
   from the product queue, which is the "significant engineering time" the cards
   warn about. Growth/revenue multipliers were cut to roughly a third of the first
   draft; quality and efficiency effects were left at full strength because they
   measured as pacing-neutral.

The post-prestige section buys the first run's reputation and runs a second company
with it; the repeat-claim scan at the end covers upgrades, exits, advisors,
acquisitions, roadmap effects and goal rewards (17/17).

## Event cadence

`npm run cadence` (3 seeds × 3 profiles, first exit or 16 real hours):

| Stage | Before: mean gap | After: mean gap | Inbox cap | Repeat damping |
|---|---|---|---|---|
| Solo Founder | 5.0 d (flat) | 5.6 d | 2 | 0.50 |
| Tiny Startup | 5.0 d | 4.9 d | 2 | 0.55 |
| Seed | 5.0 d | 4.2 d | 3 | 0.60 |
| Growing | 5.0 d | 3.6 d | 3 | 0.72 |
| Scale-Up | 5.0 d | 3.3 d | 3 | 0.88 |
| Major Tech | 5.0 d | 2.9 d | 4 | 1.00 |
| Late Stage | 5.0 d | 2.7 d | 4 | 1.15 |

Overall: **8.4 event opportunities per real hour, against 6.0 before (+40%)** and
0.28 per game day against 0.20. Per stage against the old flat 6.0/h: Solo 5.9
(quieter for a learner), Tiny 6.0, Seed 7.0, Growing 8.3, Scale-Up 8.9, Major 10.4,
Late 8.8. Measured at both trees with the same operator; the before numbers come from
a worktree of the previous commit.

## Browser playtest

`node tools/playtest-v2.mjs` — Playwright/Chromium against the production build.
**87 checks, 0 failures, 0 console errors, 0 page errors**, 32 screenshots in
`shots-v2/`. What was actually done through the UI:

1. Fresh save boots, canvas renders.
2. A v3 save (built in Node, injected into `localStorage`, then reloaded) loads with
   cash, equity, headcount, founder reputation and upgrade level intact, schema 4,
   and the new systems empty. (The blob is injected after overriding `app.save` so
   the running page's unload handler cannot overwrite it — the same trick the old
   offline test uses.)
3. Founder upgrades: two clicks dispatched on the same control buy one level and
   charge one price; a real browser double-click buys exactly one more; the track
   stops at 5/5 showing `MAX` with no buy control left and reputation never negative.
4. Cash-out: an exit is taken from the Company panel; ownership goes to 0, the run is
   paused and marked ended, the summary shows; the panel then offers no exit control
   at all, further simulated days pay nothing more, and equity stays at 0.
5. A new company starts clean (equity 1, no advisors/goals/acquisitions/roadmap
   history) while keeping run history and the maxed founder upgrade.
6. 60 game days of unattended event cadence: more than one event every five days, the
   inbox never over its cap, no negative cooldown.
7. Roadmap: an initiative is chosen in the panel, the fee is charged once, the
   engineering commitment is live, then it completes exactly once with the effect on
   the product.
8. Advisor: retained through the panel, effects visible in the modifier bag, retainer
   on the daily cost line.
9. Acquisition: bought through the panel — people joined, technology gained,
   integration running, the target off the market and not re-buyable.
10. Goal: accepted, completed once through the simulation, not completed again.
11. Save → reload: cash, headcount, advisors, completed goals, acquisitions, shipped
    roadmaps, acquired technology and founder upgrades all persisted; no reward
    replayed.
12. Layout at 1366×768 and 1440×900: no panel overlap, nothing off-screen, no
    horizontal overflow, no text below the 10px design floor, and no text size drift
    between the two viewports. A separate element-level probe confirmed no panel
    overflows its drawer at either size.
13. All ten panels render with content and no `undefined`/`NaN`.
14. Keyboard: `9` opens Advisors, `0` opens Goals, Space toggles pause.

Visual review was done on the screenshots (not from source): the retained advisor
appears in the office as a distinct gold-shirted visitor sprite separate from the
founder and staff; the Advisors panel shows effects, fees, retainers and each
advisor's downside; the Competitors panel shows the "Companies for sale" cards with
price, users, revenue, people, integration and technology; the Goals panel shows
three offers with progress and rewards plus the completed one. Room labels and panel
text are crisp; no blurry text was introduced (the label rasterisation rule from the
previous pass is unchanged).

## Save / migration

`SAVE_VERSION` 4. v3 → v4 is additive and idempotent:

- New per-product `roadmap`, per-run `advisors` / `goals` / `acquisitions` /
  `exitResult`, `company.ownership`, event category history and `meta.appliedTx`.
- Nothing is awarded retroactively: a migrated save has no completed initiatives, no
  advisors, no goals, no acquisitions and no exit record.
- `applyRunDefaults` repairs rather than trusts: equity clamped to `[0,1]`, founder
  reputation non-negative, upgrade levels clamped to their maximum, a settled run
  comes back paused. Rivals saved before blurbs were stored get theirs back (this was
  a pre-existing `<p>undefined</p>` in the Competitors panel, found while verifying).
- Existing saves keep cash, employees, products, office, research, funding/equity,
  founder upgrades, events and prestige progression; a browser test proves it.

## File map (changed)

```
src/sim/equity.js            NEW  the only path for ownership and cash transactions
src/sim/roadmap.js           NEW  initiatives: cost, progress, capacity, one-time effects
src/sim/advisors.js          NEW  slots, fees, retainers, effect bag
src/sim/acquisitions.js      NEW  targets, integration, exactly-once assets
src/sim/goals.js             NEW  offers, one active goal, one-time rewards
src/data/roadmaps.js         NEW  16 initiatives
src/data/advisors.js         NEW  11 archetypes
src/data/acquisitions.js     NEW  8 targets
src/data/goals.js            NEW  8 goals
src/sim/prestige.js          exit is a transaction; buyPrestige hardened; normalizeMeta
src/sim/funding.js           dilution and exits route through equity.js; refused after an exit
src/sim/events.js            stage-aware cadence, category damping, cooldown floor
src/data/events.js           every event tagged with a category
src/sim/state.js             SAVE_VERSION 4, meta normalisation, new containers
src/sim/save.js              v3 -> v4 migration, applyRunDefaults
src/sim/engine.js            roadmap/goal/acquisition ticks; frozen after an exit
src/sim/modifiers.js         merges advisor, acquisition, goal effects and the roadmap commit
src/sim/economy.js           acquired revenue, advisor retainer and roadmap cost lines
src/sim/infra.js             acquired load; utilisation exposed for goals
src/sim/products.js          roadmap multipliers; acquired support load; engineering commit
src/ui/panels.js             roadmap, advisors, goals, acquisitions, run-ended, MAX
src/ui/ui.js                 purchase guard, new actions, ten-panel keyboard order
src/render/OfficeScene.js    advisor visitors, roadmap huddles, goal celebration
src/render/art.js            advisor shirt colour
index.html                   two new tabs
tools/balance.js             systems section, post-prestige run, repeat-claim scan
tools/balance_lib.js         optional new-system play, per-system skip flags
tools/event-cadence.mjs      NEW  cadence measurement
tools/systems-probe.mjs      NEW  end-to-end probe with assertions
tools/system-attribution.mjs NEW  per-system pacing attribution
tools/playtest-v2.mjs        NEW  browser playtest for this pass
test/exploits|roadmaps|advisors|acquisitions|goals|event-cadence|migration.test.js  NEW
```

## Known issues / unverified behaviour

- Balance beyond the second run is still inferred: `npm run balance` simulates one
  post-prestige run, not a third.
- The playtest injects a hand-built v3 save; a real player's save was not available to
  test against directly, though the migration path is the same code the unit tests
  cover with the same shape.
- Advisors are cosmetic in the office: the sprite shows they are on staff; nothing
  economic depends on where they walk.
- Goals are offered from a pool with a stage gate, so a Solo Founder sees none until
  Seed. The panel says so, but there is no notification when the first ones appear.
- Only Chromium was tested. Firefox/Safari and touch input remain untested.
- Long-session memory performance still unprofiled; the office now also draws up to
  three advisor sprites and short-lived celebration rectangles.

## Recommended next steps

1. Simulate a third run, with several founder tracks maxed, and tune the scenario
   reputation multipliers against those measurements.
2. A tutorial pass for the first ten minutes, which now also has to explain roadmaps
   and goals without overwhelming a new player.
3. Wall-clock soak test for the Phaser agent layer now that advisors and huddles are
   in the scene.
4. Consider surfacing *why* an initiative is unavailable directly on its button
   (currently the reason is in the tooltip and in the "Also on the board" line).
