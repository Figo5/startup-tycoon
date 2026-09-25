# Balance methodology

Balance is measured with a seeded scripted operator, not a human win-rate study.

```sh
npm run balance
npm run cadence
npm run probe
node tools/system-attribution.mjs
```

Run these from the repository root. `balance` compares idle, moderate and active
policies (the active one also plays minigames and uses founder actions), plays the
roadmap/advisor/acquisition/goal systems, takes the first exit, spends the Founder
Reputation and measures a second run, and ends with a repeat-claim scan of every
"only once" rule. `cadence` measures event opportunities by stage; `probe` checks
system integration; attribution isolates the newer progression systems.

## Current measurements (2026-09-25, after the depth pass)

First exit, three seeds each:

| Profile | First exit | Exit taken |
|---|---|---|
| Idle (checks ~30 min) | 13.5–16.0 h | IPO |
| Moderate (checks ~12 min) | 6.2–7.0 h | IPO |
| Active (~5 min, minigames, founder actions) | 3.6–4.1 h | IPO |

The pass made a first company roughly 15–25% longer. Nothing was made more
expensive; the slowdown comes from bounding an exploit (repeatable work used to
widen a market without limit) and from new systems that cost attention and cash.

Strategy comparison, moderate profile, same operator, three seeds:

| Setup | First exit | Founder Reputation from the exit |
|---|---|---|
| Generalist, consumer app | 5.8–7.6 h | 11–15 |
| Technical founder | 6.0–6.6 h | 12–13 |
| Sales founder | 5.8–7.0 h | 13–15 |
| Design founder | 5.6–7.2 h | 11–15 |
| SaaS start | 6.0–6.2 h | 13 |
| Consulting start | 5.6–6.4 h | 11–13 |
| Bootstrapped challenge | 10.0–10.4 h | 22–26 |
| Small Team challenge | 6.4–8.0 h | 14–17 |

No background or starting product dominates. Bootstrapping is slower and pays
about as much per hour as taking venture money, because keeping the whole company
already roughly doubles the exit payout; its challenge bonus is deliberately small.

Things the simulations caught and the pass fixed:

- Repeatable feature work widened a product's market without limit, and a cheap
  enough product could farm hundreds of launches: a consulting run reached a
  $73T valuation. Market gains from repeatable work now diminish, viral bumps
  respect the market size, only real launches roll, and each major version needs
  more feature work behind it.
- Launch bonuses stacked from perks, rooms, traits and research until nearly every
  launch went viral. Bonuses beyond product quality now have diminishing returns.
- Early exits used an additive stage bonus, so a merger outpaid an IPO at the Late
  Stage and the operator always merged. It is now a floor for early exits.
- The Small Team challenge could never pass Scale-Up because later stages asked for
  45 people.
- Rival consolidation emptied the leaderboard within the first hours; mergers
  between rivals are now rare and new entrants arrive when the field thins.

## Limits

Later-run pacing beyond the second run and human optimisation remain unvalidated.
The [preserved balance report](development/balance-report.txt) and
[hardening handoff](development/hardening-handoff.md) are historical measurements
from before this pass.
