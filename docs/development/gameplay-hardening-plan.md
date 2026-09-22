# Startup Tycoon — gameplay hardening + feature pass (working plan)

Root-cause first, features second. Status legend: TODO / DOING / DONE / BLOCKED.

## Part 1 — invariants
- DONE  root cause A: `performExit` mutated only `meta`; `state` was never marked as
        ended, so the same stake could be liquidated again (measured: 5 exits = 5 payouts).
- DONE  root cause B: founder upgrades were only unaffordable, never transactional —
        the FR to buy them came from A (measured: 6 replayed exits = 54 FR = 7 buys).
- TODO  equity.js: single ownership transaction path, equity clamped to [0,1]
- TODO  exit is a one-shot transaction: guard flag set first, stake transferred, run frozen
- TODO  buyPrestige: authoritative level/price, single deduction, tx-id ledger, MAX state
- TODO  UI: purchase throttle, locked overlay while an exit is unresolved

## Part 2 — event cadence
- TODO  stage-aware MIN_GAP table, cooldown floor, no-immediate-repeat, category damping
- TODO  measure opportunities/real-hour before vs after (tools/event-cadence.mjs)

## Parts 3-6 — features
- TODO  roadmaps (per product, data-driven, manager automation)
- TODO  advisors (slots, retainer, real effects, prestige resets them — stated)
- TODO  acquisitions (one-time targets, integration cost, exactly-once assets)
- TODO  company goals (3 offered, 1 active, one-time reward)

## Part 7 — office visual feedback
- TODO  roadmap huddle, advisor sprite, acquisition integration, goal celebration

## Parts 8-12
- TODO  balance run (+ post-prestige), save v4 migration, regression tests,
        browser playtest, 4 logical commits (no push)
