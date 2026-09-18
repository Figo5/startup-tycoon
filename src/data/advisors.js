// Advisors. A small pool of archetypes, each with real positive effects and at
// least one real cost. Slot-limited on purpose: choosing matters more than
// collecting.
//
// Two costs, both real:
//   fee         - one-time engagement fee, paid on hire (and again on rehire)
//   retainerRev - share of daily revenue skimmed while they are on staff
//
// Effects are classic modifier keys, merged into computeMods; every key here is
// read somewhere in the simulation (see the README's modifier table).
//
// Prestige reset: advisors are employees of THIS company. They do not follow the
// founder into the next run, and there is deliberately no upgrade that keeps one.

export const ADVISORS = [
  {
    id: 'growth_hacker', name: 'Maya Sandoval', archetype: 'Growth Hacker', unlock: 'seed',
    fee: 45000, retainerRev: 0.030, variant: 0,
    blurb: 'Runs ten experiments a week and kills nine of them.',
    effects: { marketSize: 0.05, conversion: 0.06 },
    tradeoff: 'Growth like this is bought: 3% of daily revenue, every day.'
  },
  {
    id: 'design_lead', name: 'Ines Marchetti', archetype: 'Design Lead', unlock: 'seed',
    fee: 38000, retainerRev: 0.014, variant: 1,
    blurb: 'Deletes more interface than she adds. Users convert better for it.',
    effects: { conversion: 0.09, projectQuality: 0.12, devSpeed: -0.03 },
    tradeoff: 'Design review slows shipping down slightly.'
  },
  {
    id: 'support_sage', name: 'Rosa Delgado', archetype: 'Support Sage', unlock: 'seed',
    fee: 30000, retainerRev: 0.012, variant: 2,
    blurb: 'Turns the queue into the best source of product feedback you have.',
    effects: { churn: -0.09, support: 0.12, marketSize: -0.02 },
    tradeoff: 'Retention work, not acquisition work.'
  },
  {
    id: 'bootstrap_mentor', name: 'Harold Pike', archetype: 'Bootstrapping Mentor', unlock: 'seed',
    fee: 34000, retainerRev: 0.010, variant: 0,
    blurb: 'Has never raised a round and is unreasonably smug about it.',
    effects: { payroll: -0.05, devSpeed: 0.05, fundingValuation: -0.10 },
    tradeoff: 'Investors read his involvement as a lack of ambition: -10% valuations.'
  },
  {
    id: 'veteran_cto', name: 'Priya Raghunathan', archetype: 'Veteran CTO', unlock: 'growing',
    fee: 240000, retainerRev: 0.020, variant: 1,
    blurb: 'Six exits, two of them good. Will not let you ship on a Friday.',
    effects: { devSpeed: 0.10, debtRate: -0.15 },
    tradeoff: 'Expensive, and she says no a lot.'
  },
  {
    id: 'enterprise_operator', name: 'Dan Okafor', archetype: 'Enterprise Operator', unlock: 'growing',
    fee: 210000, retainerRev: 0.018, variant: 2,
    blurb: 'Speaks fluent procurement. Knows what a security review actually wants.',
    effects: { enterpriseConv: 0.22, contractSize: 0.10, churn: 0.03, conversion: -0.03 },
    tradeoff: 'Runs the company at enterprise speed: consumer growth and churn suffer.'
  },
  {
    id: 'cloud_architect', name: 'Sofia Lindqvist', archetype: 'Cloud Architect', unlock: 'growing',
    fee: 190000, retainerRev: 0.016, variant: 0,
    blurb: 'Has never met a bill she could not halve on a whiteboard.',
    effects: { infraCost: -0.15, capacityPerUnit: 0.05, reliability: 0.03, revenue: -0.02 },
    tradeoff: 'Efficiency first: a slightly smaller feature roadmap.'
  },
  {
    id: 'talent_recruiter', name: 'Grace Boateng', archetype: 'Talent Recruiter', unlock: 'growing',
    fee: 170000, retainerRev: 0.015, variant: 1,
    blurb: 'Gets the good ones on the phone before they update their profile.',
    effects: { hireQuality: 2, candidateRefresh: 0.35, payroll: 0.03 },
    tradeoff: 'She negotiates hard, on their behalf: payroll up 3%.'
  },
  {
    id: 'security_chief', name: 'Tomasz Bielski', archetype: 'Security Chief', unlock: 'growing',
    fee: 260000, retainerRev: 0.017, variant: 2,
    blurb: 'Assumes every dependency is hostile, and is usually right.',
    effects: { outageRisk: -0.20, reliability: 0.04, devSpeed: -0.04 },
    tradeoff: 'Security review is a permanent tax on shipping speed.'
  },
  {
    id: 'sales_veteran', name: 'Reggie Vaughn', archetype: 'Sales Veteran', unlock: 'growing',
    fee: 230000, retainerRev: 0.022, variant: 0,
    blurb: 'Closes by asking questions you cannot answer. Then waiting.',
    effects: { sales: 0.15, contractSize: 0.08, staffChurn: 0.06 },
    tradeoff: 'The floor is loud and the culture gets harder.'
  },
  {
    id: 'vc_insider', name: 'Lucas Feinberg', archetype: 'VC Insider', unlock: 'scaleup',
    fee: 1200000, retainerRev: 0.024, variant: 1,
    blurb: 'Every term sheet gets better with him in the room, and he knows it.',
    effects: { fundingValuation: 0.18, contractSize: 0.05, churn: 0.02 },
    tradeoff: 'He expects venture-scale growth, and prices that assume it.'
  }
];

export const advisorById = (id) => ADVISORS.find((a) => a.id === id) || null;

/** Slots by company stage: hiring an advisor has to cost you an alternative. */
export const ADVISOR_SLOTS = { solo: 0, tiny: 0, seed: 1, growing: 2, scaleup: 3, major: 3, late: 3 };
