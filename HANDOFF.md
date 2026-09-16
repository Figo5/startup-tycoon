# Handoff — Startup Tycoon v1

Factual state of the build. Numbers here come from `npm test`, `npm run balance`
and `node tools/playtest.mjs` as run on this machine.

## Implemented systems

| System | State | Notes |
|---|---|---|
| Simulation engine | complete | `step(state, days)`; live and offline use the same path |
| Products | complete | 6 categories, 10 project types, logistic growth, 4 customer classes |
| Development | complete | Engineering output split by product priority, tech debt drag |
| Employees | complete | 10 roles, skill/productivity/experience/morale/specialty, promote, reassign, fire |
| Departments | complete | 6 departments, 3 priorities each, managers, manager-driven automation |
| Office | complete | 6 tiers, 8 rooms, both redraw the generated floor plan |
| Infrastructure | complete | capacity/load/cost/reliability/outages, autoscaling research |
| Economy | complete | cash, burn, runway, valuation, contracts, non-fatal emergency measures |
| Funding | complete | 6 rounds, dilution tracked and applied to the exit payout |
| Competitors | complete | 7 rivals, per-market share, expansion, failure, acquisition |
| Research | complete | 35 items, 10 branches, prereqs, slots, mechanic unlocks |
| Events | complete | 20 types, decision branches, conservative auto-resolution |
| Minigames | complete | 3 activities, keyboard-playable, wired to event branches |
| Prestige | complete | 3 exit types, 14 permanent tracks, 4 scenarios, run history, achievements |
| Save | complete | versioned, validated, migrating, export/import, tab guard, corrupt recovery |
| Offline | complete | 16-hour cap, single credit, backward-clock safe, one summary |
| Renderer | complete | generated pixel art, generated floor plans, BFS pathing, camera controls |
| UI | complete | top bar, inbox, activity feed, 8 panels, keyboard shortcuts |
| Audio | not implemented | deliberately out of scope |

## File map

```
index.html                     shell: top bar, office, inbox, tab strip, drawer, overlay
src/main.js                    boot, game loop, offline catch-up, save wiring, exit flow
src/ui/ui.js                   top bar, inbox, action dispatch, minigame hosting
src/ui/panels.js               all eight management panels + employee and prestige cards
src/ui/styles.css              theme, layout, responsive and reduced-motion rules
src/minigames/index.js         debugging, incident response, negotiation
src/render/art.js              every sprite, as character grids + palettes
src/render/layout.js           floor plan generation + BFS pathfinding
src/render/OfficeScene.js      tile/furniture stamping, employee agents, camera
src/sim/*.js                   the simulation (see README for the per-file breakdown)
src/data/*.js                  all balance and content tables
tools/balance.js               milestone/checkpoint report (uses tools/balance_lib.js)
tools/balance_lib.js           the scripted operator that drives balance runs
tools/diag.js                  one-run product-by-product diagnostic
tools/playtest.mjs             scripted browser playtest, writes shots/
test/*.test.js                 46 tests: economy, company, save, events, prestige, active play
```

## Test results

`npm test` — **46 tests, 46 pass, 0 fail** (~0.7 s).

Coverage by area:

- **economy.test.js** (7) — revenue generation, payroll scaling, burn, infrastructure
  cost and reliability under overload, valuation response, contracts, no hard bankruptcy.
- **company.test.js** (12) — hiring, desk limits, firing/severance, project completion
  and effects, department priorities, manager automation, stage unlock ordering,
  funding/dilution, research cost-time-effect, office upgrade gating, competitor
  share and acquisition, event resolution, product creation.
- **save.test.js** (10) — exact round-trip, RNG determinism after reload, rejection of
  malformed and out-of-range saves, forward migration, export/import, offline credited
  once, offline cap, backward clock earning nothing, batched-vs-fine step agreement.
- **events.test.js** (6) — content-table targets and reference integrity, every event
  has a non-minigame conservative fallback, **every event × every non-minigame choice**
  spawns/describes/resolves without producing a non-finite value, ignored events stay
  survivable, stage gating, 400 unattended game days without breakage.
- **active.test.js** (4) — three activities exist and each pays out, a perfect incident
  run beats a poor one by more than 3x, a company that skips every minigame still works,
  a manager measurably multiplies their department.
- **prestige.test.js** (7) — exit gating, reputation scaling with retained equity, run
  recording and meta preservation, next-run reset semantics, upgrade cost curve and
  caps, meta effects reaching the modifier system, scenario modifiers.

## Balance simulation results

`npm run balance` — three seeds (11, 202, 3003) × three player profiles, 40 real-hour
horizon. Full output in `balance-report.txt`.
Second product lands at 0.3–1.5 h, the first manager at 1.4–5.0 h, the first funding
round at 0.5–1.0 h and the first enterprise customer at 1.4–3.5 h, depending on profile.

Assumptions, stated as the tool prints them: 1 game day = 2 real minutes; offline time
is credited identically to online time up to the 16-hour cap, so a multi-day horizon
assumes the player returns at least once every 16 hours; the scripted operator is
competent but not optimal (hires on need, reinvests ~28% of revenue in marketing, takes
funding only when runway is short or the round is large, never micro-optimises project
order, and only exits at the Late Stage).

| Profile | First hire | Seed | Growing | Scale-Up | Major | First exit | FR |
|---|---|---|---|---|---|---|---|
| Idle (~30 min checks) | 1.0 h | 2.0–2.5 h | 4.0–5.0 h | 6.0–7.0 h | 9.0–10.5 h | 14.5–16.0 h | 9–11 |
| Moderate (~12 min) | 0.4–0.8 h | 1.2–1.4 h | 1.8–2.0 h | 2.6–2.8 h | 4.2–4.6 h | 7.4–7.7 h | 12–13 |
| Active (~5 min + minigames) | 0.1 h | 0.7–0.9 h | 1.4–1.9 h | 1.9–2.3 h | 3.1–3.6 h | 4.1–5.0 h | 11–13 |

Checked for the failure modes the spec calls out:

- **No dead zone.** Checkpoints at 10 min / 1 h / 4 h / 8 h / 24 h show continuously
  rising cash, revenue, headcount and product count. The one flat stretch found during
  tuning (a Tiny-stage deadlock where the office upgrade required a stage that required
  more desks) was fixed by re-gating office tiers.
- **No instant snowball.** Four brakes are in place and were each added in response to
  an observed runaway: logistic market caps, marketing saturation, same-category
  cannibalisation (`1/n^0.75`), and competitor share pressure.
- **No exponential exploit found.** The most obvious one — shipping four copies of the
  cheapest product — was measured at $10.6K/day and now splits one market instead of
  creating four.
- **No early prestige farming.** Exits are gated behind the Late Stage or a scale-up
  acquisition offer. An early acquisition exit pays roughly half the reputation of a
  Late-Stage IPO, so cashing out early is a real but costly choice.

`node tools/diag.js <hours>` prints a per-product breakdown of a single run
(users vs market cap, quality, debt, revenue, cost lines, role mix) for tuning.

## Browser validation performed

Playwright (Chromium, headless) against the production build via `vite preview`.
Script: `tools/playtest.mjs`; screenshots in `shots/`; result in `playtest-report.txt`.

Twelve steps, all passing, **zero console errors and zero page errors**:

1. Fresh start renders, canvas present, help dialog dismissible.
2. Twelve game days simulated — the MVP ships and the product goes live.
3. Employees panel opens; a candidate is hired through the UI and headcount rises.
4. Products panel opens; a project is queued through the UI.
5. Office panel: tier upgrade purchased, three rooms built.
6. Office repopulated with 10 staff; sprites path to desks and rooms.
7. `critical_bug` event spawned; the debugging minigame is played to completion and
   the resulting boost appears in state.
8. Save, reload, and confirm cash / day / headcount / office tier persisted.
9. Save timestamp rewound three hours; on reload the offline summary appears.
10. Company, Departments, Research, Finance and Competitors panels all render content.
11. Viewports 1920×1080, 1366×768, 1024×700 — no horizontal document overflow.
12. Keyboard: number key opens a panel, Escape closes it, Space pauses.

Three real defects were found this way and fixed:

- The management drawer was `position: fixed` over the whole window, covering the tab
  strip so no second panel could be opened. It now lives inside `<main>`.
- The floor `RenderTexture` was created at 10×10 and resized; Phaser keeps the original
  backing texture size, so the entire office was clipped to a 10×10 pixel corner. It is
  now recreated at the correct size whenever the layout changes.
- Reviewing a minigame screenshot showed the debugging puzzle's "unique" frame was a
  glyph with a combining dot — visually identical to its pair — and the padding loop
  could leave a second singleton. The generator now emits exactly `2k+1` cells from a
  curated, look-alike-free symbol set, so "exactly one appears once" is literally true.

Visual review was done on the screenshots, not from source: sprite readability, desk and
room layout, room labels sitting clear of furniture, floor tile variation (an early
version produced distracting dark blotches and was flattened), employee dept colours,
and the office visibly changing between the garage and the suite-plus-rooms.

## Known bugs

None outstanding that reproduce. Minor rough edges:

- On very large offices (Tech Campus, 280 desks) the generated floor plan is 39×64
  tiles, which is tall; the camera zooms out to fit and sprites get small.
- The Finance panel's marketing preset buttons wrap onto a second line on narrow
  drawers. Cosmetic.
- Sprite depth sorting is by y-position only, so a person standing directly behind a
  desk overlaps it rather than being occluded.

## Known unverified behaviour

- Only tested on Chromium via Playwright on macOS. Firefox and Safari are untested.
- The multi-tab warning path is implemented and its storage logic is straightforward,
  but it was not exercised with two real tabs.
- Balance beyond the first prestige is inferred, not measured: the balance tool always
  starts from an empty meta. Second-run pacing with purchased Founder upgrades and a
  harder scenario has not been simulated end to end.
- Long-session memory/performance was not profiled. `stats.history` is capped at 500
  points and the event log at 60 entries, but no multi-hour real-time soak test was run.
- Touch input is untested; the office pans via pointer events that should work, but no
  mobile device or emulation pass was done.

## Recommended next steps

1. Simulate second and third runs with populated meta upgrades and the harder scenarios,
   and tune `SCENARIOS` reputation multipliers against real measurements.
2. Profile a multi-hour live session for leaks in the Phaser agent layer.
3. Occlusion or a simple y-sorted furniture layer so people can stand behind desks.
4. Hand-authored floor plans for the two largest tiers, which the generator handles
   correctly but blandly.
5. A short first-run tutorial pass: the first ten minutes are currently "watch the MVP
   bar and optionally hire", which works but does not teach the loop explicitly.
6. Firefox and Safari passes, and a touch-input pass for tablets.
