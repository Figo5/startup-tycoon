# Startup Tycoon

A long-form idle startup-management game with a live pixel-art office and persistent founder progression.

**[Play in your browser](https://startup-tycoon-yeny.netlify.app/)** · [Gameplay guide](docs/gameplay.md) · [Architecture](docs/architecture.md)

![An expanded pixel-art office with employees, meeting rooms and company activity](docs/media/office.png)

*Expanded office captured during a scripted playtest. A new company starts in a garage.*

## Build a company, then a career

Start as a solo founder, ship products, hire a team and grow toward an acquisition
or IPO. Each exit banks Founder Reputation for permanent upgrades and harder
market scenarios. A first company is designed to unfold over hours of play.

- **Active and idle play:** manage in short check-ins, leave up to 16 hours of
  offline progress, or play optional puzzles for a bonus.
- **A living office:** employees walk between desks, rooms and huddles as the
  business grows through six office tiers. Movement is visual; the simulation
  keeps working independently.
- **Products and people:** plan development, balance technical debt and reliability,
  hire across departments, research automation, and manage funding and ownership.
- **Long-term decisions:** product roadmaps, retained advisors, acquisitions and
  company goals give later stages distinct choices. Events vary with company stage.
- **Persistent progression:** versioned saves, import/export and transactional
  exits/upgrades. **Start a new company** preserves the founder; **Reset all progress**
  explicitly clears both the company and founder progression after confirmation.

## Run locally

Use Node.js 24 and npm:

```sh
git clone https://github.com/Figo5/startup-tycoon.git
cd startup-tycoon
npm ci
npm run dev          # http://localhost:5180
npm run build        # static files in dist/
npm run preview      # preview the production build
```

No backend or account is required. Saves live in the browser's `localStorage`.
Use export/import to move progress between browsers.

## Architecture

JavaScript and Vite, with **Phaser for the office** and a **DOM management UI**.
`src/sim/` contains the simulation without Phaser or DOM dependencies;
`src/data/` contains content and tuning. The renderer reads state without deciding
cash, ownership or progression. Shared transaction paths prevent repeated exits
and purchases from awarding value twice.

See [architecture and save invariants](docs/architecture.md),
[gameplay and controls](docs/gameplay.md), and [balance methodology](docs/balance.md).

## Testing

```sh
npm test             # Node's built-in runner; no browser required
npm run build
npm run probe        # optional system-integration probe
```

Verified on 2026-09-22: **156 tests passed** and the production build passed
(Node.js 26.8.1). Tests cover simulation, transactions, roadmaps, advisors,
acquisitions, goals, events, migrations and full reset. The build reports a large
Phaser bundle warning. The Chromium full-reset check also passed, including
confirmation, reload persistence and a second reset. Historical browser and balance evidence is in
[docs/development](docs/development/README.md).

## Status and limits

A complete, playable single-player game. Desktop/laptop is the intended experience;
mobile is cramped. There is no audio, cloud save or multiplayer. Only one active
save tab is recommended: a second tab is warned, not blocked. Balance measurements
come from scripted policies, with later-run pacing still less well validated.

## License

No license file has been selected for this repository.
