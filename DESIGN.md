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
  ├─ modifiers.computeMods(state)     every research/room/boost/prestige/scenario effect
  ├─ workforce.computeWorkforce       employees -> per-department output + payroll
  ├─ products.distributeEngineering   output -> project progress -> project effects
  ├─ products.tickProducts            growth, churn, conversion, revenue, decay, reputation
  ├─ infra.tickInfra                  load, capacity, cost, reliability, outage rolls
  ├─ economy.tickEconomy              cash, burn, runway, valuation
  ├─ workforce.tickWorkforce          morale, attrition, candidates, auto-hire
  ├─ research / competitors / events
  └─ stages.checkStageUp
```

`days` is the only time unit. **1 game day = 2 real minutes** (`REAL_SECONDS_PER_DAY`).
Live play calls `step` with ~0.002 days every 0.25 s; offline catch-up calls it with
0.05-day chunks. Everything in a step is linear in `days`, and probabilities convert
through `perDay(p, days)`, so batching and fine-stepping agree (a test asserts they
stay within 25% over ~0.85 game days).

The renderer is a *view*. `src/render/OfficeScene.js` reads state and draws it.
If pathfinding fails, a sprite simply stands still; no economic value depends on it.

## Content systems

| System | Data | Notes |
|---|---|---|
| Products | `data/products.js` | 6 categories with genuinely different shapes, 10 project types |
| People | `data/roles.js` | 10 roles, 6 departments, 8 specialties, per-output contribution |
| Stages | `data/stages.js` | 7 stages; each widens every market and unlocks mechanics |
| Research | `data/research.js` | 35 items across 10 branches; several unlock mechanics, not numbers |
| Office | `data/office.js` | 6 tiers, 8 buyable rooms; both redraw the map |
| Funding | `data/funding.js` | 6 rounds priced off revenue multiples, 3 exit types |
| Events | `data/events.js` | 20 events, each with a conservative auto-resolution |
| Competitors | `data/competitors.js` | 7 rivals with per-market share |
| Prestige | `data/prestige.js` | 14 permanent tracks, 4 market scenarios |

Balance numbers live only in `data/`. Nothing in the UI or renderer hardcodes a price.

## Progression and pacing

Stages gate on headcount, revenue and valuation together. Measured with a scripted
operator over three seeds (`npm run balance`):

| Player | First hire | Seed stage | Scale-Up | First exit |
|---|---|---|---|---|
| Idle (checks ~30 min) | ~1.0 h | ~2.0–2.5 h | ~6–7 h | ~14.5–16 h |
| Moderate (~12 min) | ~0.4–0.8 h | ~1.2–1.4 h | ~2.6–3.0 h | ~7.6–7.8 h |
| Active (~5 min + minigames) | ~0.1 h | ~0.8 h | ~1.8–2.0 h | ~5.2–5.6 h |

A first exit pays 10–13 Founder Reputation, against prestige tracks costing 2–12 for
their first level — enough for two or three meaningful picks, not the whole board.

## Save strategy

`src/sim/save.js` owns everything persistent.

- Versioned schema (`SAVE_VERSION`), with a `MIGRATIONS` chain applied on load.
- `validate()` structurally checks a blob **before** anything replaces live state;
  a failing or unparseable save is copied to a recovery key and never silently dropped.
- The RNG is a single serialisable `uint32`, so a reloaded game continues the same
  sequence (asserted by test).
- Offline credit is derived from `time.lastRealMs`, which is written *before* the
  simulation runs, so the same elapsed window can never be replayed. A clock that
  moves backwards yields `null` — no time, no reward.
- Export/import is base64 JSON through the same validation path.
- A heartbeat key warns when a second tab opens; the game still runs, last write wins.
