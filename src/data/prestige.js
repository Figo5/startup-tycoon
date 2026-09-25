// Permanent, cross-run upgrades bought with Founder Reputation (FR).
// `max` is the number of times a track can be bought; cost grows per level.

export const PRESTIGE_UPGRADES = [
  { id: 'capital', name: 'Seed Capital', cost: 2, growth: 1.8, max: 5,
    desc: 'Start each company with +$25,000 per level.', effect: { startCash: 25000 } },
  { id: 'founder_skill', name: 'Sharper Founder', cost: 3, growth: 2.0, max: 4,
    desc: 'Your founder starts with +1 skill per level.', effect: { founderSkill: 1 } },
  { id: 'brand_equity', name: 'Brand Equity', cost: 3, growth: 1.9, max: 5,
    desc: 'Start with +0.35 company reputation per level. Reputation widens every market.', effect: { startReputation: 0.35 } },
  { id: 'talent_network', name: 'Talent Network', cost: 4, growth: 2.0, max: 4,
    desc: 'Candidates roll +0.6 skill per level, and the pool refreshes faster.', effect: { candidateSkill: 0.6 } },
  { id: 'veteran_team', name: 'Veteran Team', cost: 6, growth: 2.4, max: 3,
    desc: 'Begin with one extra senior engineer per level, already on payroll.', effect: { startEngineers: 1 } },
  { id: 'lean_ops', name: 'Lean Operations', cost: 5, growth: 2.1, max: 5,
    desc: 'Payroll costs 4% less per level.', effect: { payroll: -0.04 } },
  { id: 'cloud_credits', name: 'Cloud Credits', cost: 4, growth: 1.9, max: 4,
    desc: 'Infrastructure costs 10% less per level.', effect: { infraCost: -0.10 } },
  { id: 'market_insight', name: 'Market Insight', cost: 6, growth: 2.2, max: 5,
    desc: 'Every product market is 12% larger per level.', effect: { marketSize: 0.12 } },
  { id: 'research_head_start', name: 'Research Head Start', cost: 5, growth: 2.5, max: 3,
    desc: 'Begin with CI/CD, Content Engine and Help Center already done (one per level).',
    effect: { startResearch: ['ci_cd', 'content', 'helpcenter'] } },
  { id: 'warm_intros', name: 'Warm Introductions', cost: 7, growth: 2.3, max: 3,
    desc: 'Investors value you 15% higher per level, so rounds cost less equity.', effect: { fundingValuation: 0.15 } },
  { id: 'office_lease', name: 'Standing Lease', cost: 9, growth: 3.0, max: 1,
    desc: 'Start in the Startup Suite instead of the garage.', effect: { startTier: 'suite' } },
  { id: 'playbook', name: 'Operator Playbook', cost: 8, growth: 2.4, max: 4,
    desc: 'All departments are 8% more effective per level.', effect: { deptBonus: 0.08 } },
  { id: 'deal_flow', name: 'Deal Flow', cost: 6, growth: 2.2, max: 3,
    desc: 'Enterprise contracts are 20% larger per level.', effect: { contractSize: 0.20 } },
  { id: 'exit_multiple', name: 'Reputation Premium', cost: 12, growth: 2.6, max: 4,
    desc: 'Exits pay 15% more Founder Reputation per level.', effect: { exitRep: 0.15 } },
  { id: 'cofounder', name: 'Loyal Co-Founder', cost: 8, growth: 1, max: 1,
    desc: 'One of the best people from a previous company joins every new company on day one, traits and all.', effect: { cofounder: 1 } },
  { id: 'legendary_network', name: 'Legendary Network', cost: 6, growth: 2.2, max: 3,
    desc: 'Legendary candidates turn up more often (+1.5% per level).', effect: { legendaryTalent: 0.015 } },
  { id: 'prime_location', name: 'Prime Location', cost: 7, growth: 2.3, max: 2,
    desc: 'Every office fits one more room per level.', effect: { roomSlots: 1 } },
  { id: 'venture_studio', name: 'Venture Studio', cost: 14, growth: 1, max: 1,
    desc: 'One extra product slot at every stage, so a second product can start on day one.', effect: { productSlots: 1 } }
];

export const prestigeById = (id) => PRESTIGE_UPGRADES.find((p) => p.id === id);

export function prestigeCost(up, level) {
  return Math.ceil(up.cost * Math.pow(up.growth, level));
}

// Optional harder scenarios unlocked by prior runs; they pay more FR.
export const SCENARIOS = [
  { id: 'standard', name: 'Standard Market', repMul: 1.0, mods: {}, unlockRuns: 0,
    desc: 'The market you already know.' },
  { id: 'crowded', name: 'Crowded Market', repMul: 1.35, unlockRuns: 1,
    mods: { competitorStrength: 0.4, marketSize: -0.15 },
    desc: 'Rivals start stronger and every market is tighter.' },
  { id: 'downturn', name: 'Funding Winter', repMul: 1.6, unlockRuns: 2,
    mods: { fundingValuation: -0.45, churn: 0.15, marketSize: -0.05 },
    desc: 'Cheap money is gone. Customers churn harder and investors lowball.' },
  { id: 'hypergrowth', name: 'Hyper-Growth Bubble', repMul: 1.45, unlockRuns: 3,
    mods: { marketSize: 0.5, infraCost: 0.5, payroll: 0.35, churn: 0.2 },
    desc: 'Enormous markets, ruinous costs, and no patience from anyone.' }
];
