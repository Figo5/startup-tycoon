# Gameplay and save behavior

## Gameplay systems

- **Founding a company** — pick a first product (consumer app, SaaS or consulting at
  first; developer tools, games, fintech, social, B2B and AI open up as you finish
  companies), a founder background, a market scenario and, after the first exit,
  optional challenges.
- **Products** — 10 categories with genuinely different shapes. Consulting bills
  clients up to the delivery capacity of your team and is valued at a third of a
  product company. Games are hit-driven (launches swing harder both ways). Social
  networks grow faster with scale. Fintech customers leave when security slips.
- **Development** — 11 project types. Each product builds Rush (a third faster, more
  debt, shakier launches), Standard or Polish (40% longer, better quality, stronger
  launches). Repeatable work widens a market with diminishing returns.
- **Launches** — an MVP, a major version (v2, v3... each needs more feature work
  than the last), a mobile port, localisation or an enterprise edition rolls a
  launch: flop, solid, hit or viral, from quality, approach, the team's traits,
  marketing, market trends and research. Hits and viral launches bring a burst of
  sign-ups; games swing twice as hard.
- **People** — 10 roles, titles from Junior to Principal, and 20 traits in three
  rarities (Workhorse, Unreliable Genius, Rainmaker, 10x Engineer, Culture Carrier...).
  Energy falls under a crunch and recovers with rest rooms and leave; burnt-out
  people barely work and may quit. Everyone keeps a short story: who they turned down,
  what they shipped, when they burned out. Alumni can come back.
- **Work pace** — Sustainable, Normal or Crunch (+25% output, falling energy).
- **Departments** — priorities, managers, 19 headcount perks (the larger ones need a
  manager) and 5 cross-department synergies.
- **Founder actions** — seven short boosts on cooldowns (All-Nighter, Customer Calls,
  Tweetstorm, Pep Talk, Sales Blitz, Code Cleanup, Investor Coffee).
- **Office** — 6 tiers and 13 rooms; each tier fits a limited number of rooms, and
  every room has upkeep. People use the rooms that fit their job.
- **Market** — an economy that cycles through boom, steady, downturn and recession,
  and 14 category trends (hype waves and saturation) announced as they start.
- **Rivals** — 9 rivals with 7 personalities and valuations on your scale. They
  launch products (and copy your hits), raise, start price wars, poach your people,
  sue, buy each other, stumble and shut down; new entrants arrive when the field
  thins. One becomes your nemesis. The Market panel ranks you on a leaderboard.
- **Funding** — 6 rounds, each offered by up to four investors: a lead investor, a
  small round, a top-tier VC with a board revenue target, and (from Series A) a
  strategic investor with permanent perks and exit preferences. You can pitch the
  lead investor yourself. Revenue-based loans need no equity.
- **Research** — 50 items in 12 branches, including four mutually exclusive doctrine
  pairs (Move Fast / Craftsmanship, Product-Led / Sales-Led, Remote-First / Campus
  Culture, Open Platform / Walled Garden) and nodes that change mechanics.
- **Roadmaps, advisors, acquisitions, goals** — as before: 16 initiatives, 11 advisors,
  8 acquisition targets and 8 company goals.
- **Events** — 99 events. Many are about a named person, rival or product; choices can
  schedule follow-ups days later; and ten triggers turn simulation moments (a viral
  launch, a flop, a rival's layoffs or lawsuit, an economy shift) into decisions.
- **Exits** — acquisition, strategic acquisition and IPO at the Late Stage; an
  acqui-hire from Growing; a private-equity buyout of a profitable Scale-Up; a merger
  with a rival worth at least 40% of you.
- **Founder legacy** — Founder Reputation buys 18 permanent tracks (including a loyal
  co-founder from your hall of fame). 36 achievements pay a little reputation once
  and unlock backgrounds. Records and previous companies live in the Legacy panel.
- **Challenges** — Bootstrapped, Small Office, No Marketing Budget, Small Team,
  Hypercompetitive, Recession Start and Speedrun, each paying more reputation.
- **Starting over** — three separate things, named apart in the Company panel:
  *Start a new company* (run only, founder keeps everything), prestige/exit (bank a
  run), and *Reset all progress* (deletes the company and all founder meta, back to a
  first-ever game). See [architecture](architecture.md#starting-over) for what the full reset clears.

## Save behaviour

- Autosaves to `localStorage` every 10 seconds, on tab hide, and on unload.
- Versioned schema (`SAVE_VERSION = 5`) with a forward-migration chain. v3 and v4
  saves load unchanged; the new systems start empty rather than being back-filled
  (existing employees get no traits, no achievements are paid retroactively).
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
| `L` | Founder legacy panel |
| `Z` `X` `C` `V` `B` `N` `M` | Founder actions (when ready) |
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
- Movement in the office is cosmetic. People walk to rooms that fit their job and
  react to what is happening, but no economic outcome depends on where a sprite is.
- Office layouts are generated from the tier and rooms owned; there is no free-form
  furniture placement.
- Rivals are still simulated coarsely (strength, valuation, cash and per-market share,
  plus the moves their personality chooses); they do not run full companies.
- Acquired companies become revenue, people and technology, not running businesses.
- Balance was tuned against a scripted operator (`npm run balance`), not against a
  human optimiser. A player who micro-optimises will beat the measured pacing.
- No audio.
- Phones get a compact layout suitable for check-ins; desktop remains the main target.
