// Acquisition targets. Bought out right, once each, at Scale-Up or later.
//
// An acquisition is never free money: every target carries an integration
// period, a morale hit, people to pay, infrastructure and support load, and
// usually some technical debt. `tech` is a permanent modifier bag merged once on
// completion (see sim/acquisitions.js).
//
// Asking price = max(floor, company valuation * priceShare), so a bargain early
// is expensive later and never trivial.

export const ACQUISITION_POOL = [
  {
    id: 'chartly', name: 'Chartly', category: 'analytics', difficulty: 'Low',
    blurb: 'A tidy little product-analytics tool with a loyal SMB base.',
    sellerReason: 'Two founders, no revenue model, out of runway.',
    priceShare: 0.030, floor: 450000,
    users: 42000, revenueShare: 0.0035, infraLoad: 6, supportLoad: 1.2,
    employees: [['engineer', 1], ['pm', 1]],
    integrationDays: 14, moraleHit: 0.03, debt: 0.03,
    tech: { conversion: 0.04, researchSpeed: 0.05 },
    techNote: 'Their event pipeline is better than yours.'
  },
  {
    id: 'forgekit', name: 'Forgekit', category: 'devtools', difficulty: 'Medium',
    blurb: 'Build tooling with a cult following among infrastructure people.',
    sellerReason: 'Profitable, but the founders want to build something else.',
    priceShare: 0.055, floor: 1200000,
    users: 26000, revenueShare: 0.006, infraLoad: 8, supportLoad: 1.5,
    employees: [['senior_engineer', 2], ['engineer', 1]],
    integrationDays: 26, moraleHit: 0.05, debt: 0.05,
    tech: { devSpeed: 0.12, debtRate: -0.08 },
    techNote: 'Strong engineers, better internal tooling.'
  },
  {
    id: 'bramble', name: 'Bramble', category: 'consumer', difficulty: 'High',
    blurb: 'A direct competitor with a large, unmonetised user base.',
    sellerReason: 'Burning $4 for every $1 of revenue and losing the argument.',
    priceShare: 0.075, floor: 2200000,
    users: 320000, revenueShare: 0.004, infraLoad: 26, supportLoad: 3.5,
    employees: [['marketer', 2], ['support_specialist', 2], ['engineer', 1]],
    integrationDays: 45, moraleHit: 0.12, debt: 0.12,
    tech: { marketSize: 0.06, churn: 0.04 },
    techNote: 'Reach, plus a churn problem you now own.'
  },
  {
    id: 'halcyon', name: 'Halcyon Research', category: 'ai', difficulty: 'High',
    blurb: 'Twelve researchers and a model somebody else is already paying for.',
    sellerReason: 'Compute bills arrived and the round did not.',
    priceShare: 0.11, floor: 9000000,
    users: 9000, revenueShare: 0.008, infraLoad: 60, supportLoad: 2.5,
    employees: [['senior_engineer', 3], ['infra_engineer', 2], ['pm', 1]],
    integrationDays: 60, moraleHit: 0.15, debt: 0.18,
    tech: { researchSpeed: 0.35, revenue: 0.05, infraCost: 0.10 },
    techNote: 'Serious research capability, and an inference bill to match.'
  },
  {
    id: 'pocketworks', name: 'Pocketworks', category: 'mobile', difficulty: 'Medium',
    blurb: 'A small studio that ships beautiful mobile apps on a two-week cadence.',
    sellerReason: 'Out of contract work and tired of agencies.',
    priceShare: 0.040, floor: 900000,
    users: 78000, revenueShare: 0.0045, infraLoad: 10, supportLoad: 1.8,
    employees: [['designer', 2], ['senior_engineer', 1]],
    integrationDays: 30, moraleHit: 0.06, debt: 0.06,
    tech: { conversion: 0.08, projectQuality: 0.12 },
    techNote: 'Design muscle you were going to hire anyway.'
  },
  {
    id: 'ledgerly', name: 'Ledgerly', category: 'payments', difficulty: 'Medium',
    blurb: 'Billing and invoicing infrastructure with enterprise contracts attached.',
    sellerReason: 'A bank bought their biggest customer and they cannot replace it.',
    priceShare: 0.065, floor: 1400000,
    users: 15000, revenueShare: 0.012, infraLoad: 12, supportLoad: 2.4,
    employees: [['sales_rep', 2], ['support_specialist', 1], ['manager', 1]],
    integrationDays: 34, moraleHit: 0.07, debt: 0.07,
    tech: { contractSize: 0.12, revenue: 0.04, reliability: 0.03 },
    techNote: 'Money handling requires real reliability.'
  },
  {
    id: 'warden', name: 'Warden Security', category: 'security', difficulty: 'Low',
    blurb: 'A two-person security shop with a reputation far larger than its headcount.',
    sellerReason: 'They would rather test than sell.',
    priceShare: 0.028, floor: 600000,
    users: 4000, revenueShare: 0.003, infraLoad: 4, supportLoad: 0.8,
    employees: [['infra_engineer', 1], ['engineer', 1]],
    integrationDays: 16, moraleHit: 0.03, debt: 0.02,
    tech: { outageRisk: -0.22, reliability: 0.05 },
    techNote: 'Everything they touch stops catching fire.'
  },
  {
    id: 'meridian_local', name: 'Meridian Local', category: 'regional', difficulty: 'Medium',
    blurb: 'A regional reseller with the localisation and payments work already done.',
    sellerReason: 'Distribution is a treadmill and they want off.',
    priceShare: 0.045, floor: 1100000,
    users: 56000, revenueShare: 0.007, infraLoad: 9, supportLoad: 2.0,
    employees: [['sales_rep', 2], ['support_specialist', 1], ['marketer', 1]],
    integrationDays: 28, moraleHit: 0.06, debt: 0.05,
    tech: { marketSize: 0.09, sales: 0.06 },
    techNote: 'Two markets you did not have to open yourself.'
  }
];

export const targetById = (id) => ACQUISITION_POOL.find((t) => t.id === id) || null;

/** How many offers stand at once, by stage. Kept small: these are decisions. */
export const OFFERS_BY_STAGE = { solo: 0, tiny: 0, seed: 0, growing: 1, scaleup: 3, major: 3, late: 3 };
