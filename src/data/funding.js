// Funding rounds. Investors value the company off annualised revenue at a
// round-specific multiple, with a floor so pre-revenue rounds still work.

export const FUNDING_ROUNDS = [
  { id: 'angel', name: 'Angel Round', equity: 0.12, multiple: 14, floor: 1.2e6, rep: 0.15,
    req: { revenueDay: 120 }, blurb: 'A few people who made money once and would like to again.' },
  { id: 'seed', name: 'Seed Round', equity: 0.18, multiple: 12, floor: 5e6, rep: 0.30,
    req: { revenueDay: 700, stage: 'seed' }, blurb: 'A real fund, a real term sheet, a real board seat.' },
  { id: 'series_a', name: 'Series A', equity: 0.20, multiple: 11, floor: 18e6, rep: 0.55,
    req: { revenueDay: 4500, stage: 'growing' }, blurb: 'Growth is now the only metric anyone discusses.' },
  { id: 'series_b', name: 'Series B', equity: 0.18, multiple: 10, floor: 70e6, rep: 0.85,
    req: { revenueDay: 32000, stage: 'scaleup' }, blurb: 'Hire ahead of the plan, they said.' },
  { id: 'series_c', name: 'Series C', equity: 0.15, multiple: 9, floor: 300e6, rep: 1.2,
    req: { revenueDay: 380000, stage: 'major' }, blurb: 'Crossover funds, and a whisper of the word IPO.' },
  { id: 'growth', name: 'Growth Round', equity: 0.10, multiple: 8, floor: 900e6, rep: 1.5, repeatable: true,
    req: { revenueDay: 1e6, stage: 'major' }, blurb: 'Late money, on late-money terms.' }
];

export const roundById = (id) => FUNDING_ROUNDS.find((r) => r.id === id);

// Exit options unlocked at the late stage.
export const EXITS = [
  { id: 'acqui', name: 'Acquisition', multiple: 0.9, repMul: 1.0,
    blurb: 'A larger company buys you outright. Clean, fast, slightly cheap.' },
  { id: 'strategic', name: 'Strategic Acquisition', multiple: 1.25, repMul: 1.15, req: { reputation: 4 },
    blurb: 'A bidding war between two rivals who both need what you built.' },
  { id: 'ipo', name: 'IPO', multiple: 1.6, repMul: 1.35, req: { revenueDay: 900000, reputation: 5 },
    blurb: 'Public markets. Maximum value, highest bar to clear.' }
];
