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

// Who leads the round. Every round offers a choice of term sheets, so raising is
// a decision about *what kind* of money, not just whether to take it.
//   valMul    multiplier on the investor valuation
//   size      fraction of the round's standard equity (and so of its cash)
//   repMul    multiplier on the reputation the round brings
//   target    a board growth target: revenue x `revenueMul` within `days`
//   perk      permanent modifiers for the rest of the run
//   exitMod   per-exit value modifiers (a strategic investor wants to buy you)
export const INVESTORS = [
  { id: 'lead', name: 'Lead Investor', valMul: 1, size: 1, repMul: 1,
    blurb: 'A solid fund on standard terms. No surprises.' },
  { id: 'small', name: 'Small Round', valMul: 0.95, size: 0.55, repMul: 0.6,
    blurb: 'Take less money, give up far less of the company.' },
  { id: 'tier1', name: 'Top-Tier VC', valMul: 1.3, size: 1, repMul: 1.8, target: { revenueMul: 2.2, days: 75 },
    blurb: 'A famous partner and a premium price. The board expects revenue to more than double within 75 days.' },
  { id: 'strategic', name: 'Strategic Investor', valMul: 1, size: 0.8, repMul: 1, minRound: 'series_a',
    perk: { marketSize: 0.06, contractSize: 0.08 }, exitMod: { strategic: 0.15, ipo: -0.1 },
    blurb: 'A big company in your market. Opens doors; would much rather buy you than see you go public.' }
];
export const investorById = (id) => INVESTORS.find((i) => i.id === id) || INVESTORS[0];

// Revenue-based financing: cash now, repaid as a slice of revenue. No equity,
// no board, and a real cost for bootstrappers who need runway.
export const REVENUE_LOAN = { minStage: 'tiny', days: 90, repayMul: 1.35, share: 0.1, minRevenue: 100, floor: 20000 };
