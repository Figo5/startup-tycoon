# Gameplay and save behavior

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
- **Starting over** — three separate things, named apart in the Company panel:
  *Start a new company* (run only, founder keeps everything), prestige/exit (bank a
  run), and *Reset all progress* (deletes the company and all founder meta, back to a
  first-ever game). See [architecture](architecture.md#starting-over) for what the full reset clears.
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
- **Start a new company** keeps Founder Reputation and permanent upgrades.
- **Reset all progress** clears the company and founder progression after explicit confirmation; UI preferences survive.

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
