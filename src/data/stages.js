// Company stages. `req` is checked against a snapshot of the company each tick.
// `unlocks` are flags other systems read; `marketMul` widens every product market.

export const STAGES = [
  {
    id: 'solo', name: 'Solo Founder', order: 0, marketMul: 1.0, valuationMul: 1.0,
    req: {},
    blurb: 'One desk, one laptop, one idea.',
    unlocks: ['hire_basic']
  },
  {
    id: 'tiny', name: 'Tiny Startup', order: 1, marketMul: 1.12, valuationMul: 1.1,
    req: { employees: 2, revenueDay: 120 },
    blurb: 'You have colleagues now. And payroll.',
    unlocks: ['marketing_budget', 'departments', 'second_product', 'angel_funding']
  },
  {
    id: 'seed', name: 'Seed-Stage Startup', order: 2, marketMul: 1.3, valuationMul: 1.25,
    req: { employees: 4, revenueDay: 700, productsLive: 1 },
    blurb: 'Investors return your emails.',
    unlocks: ['office_upgrade', 'infra_team', 'research', 'seed_funding', 'competitor_intel']
  },
  {
    id: 'growing', name: 'Growing Startup', order: 3, marketMul: 1.6, valuationMul: 1.4,
    req: { employees: 10, revenueDay: 4500 },
    blurb: 'Enough people that you cannot remember every name.',
    unlocks: ['managers', 'enterprise_features', 'contracts', 'series_a']
  },
  {
    id: 'scaleup', name: 'Scale-Up', order: 4, marketMul: 2.1, valuationMul: 1.6,
    req: { employees: 22, revenueDay: 32000 },
    blurb: 'Rivals now mention you by name in their board decks.',
    unlocks: ['acquisitions', 'series_b', 'multi_research', 'enterprise_category']
  },
  {
    id: 'major', name: 'Major Tech Company', order: 5, marketMul: 2.8, valuationMul: 1.9,
    req: { employees: 45, revenueDay: 380000, valuation: 620e6 },
    blurb: 'You are the incumbent someone else is trying to disrupt.',
    unlocks: ['global', 'advanced_research', 'series_c', 'campus']
  },
  {
    id: 'late', name: 'Late Stage', order: 6, marketMul: 3.6, valuationMul: 2.3,
    req: { valuation: 4.2e9, revenueDay: 1.4e6 },
    blurb: 'Bankers keep calling. One of them has a number you might accept.',
    unlocks: ['exit', 'ipo']
  }
];

export const stageById = (id) => STAGES.find((s) => s.id === id);
export const stageOrder = (id) => (stageById(id)?.order ?? 0);
