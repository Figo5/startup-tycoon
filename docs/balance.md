# Balance methodology

Balance is measured with a seeded scripted operator, not a human win-rate study.
The simulation, prices and pacing were not changed during the portfolio cleanup.

```sh
npm run balance
npm run cadence
npm run probe
node tools/system-attribution.mjs
```

Run these from the repository root. `balance` compares idle, moderate and active
policies; `cadence` measures event opportunities by stage; `probe` checks system
integration; attribution isolates the newer progression systems.

The [preserved balance report](development/balance-report.txt) and
[hardening handoff](development/hardening-handoff.md) are historical measurements.
They are not fresh results for every future commit. Later-run pacing beyond the
second run and human optimization remain unvalidated.
