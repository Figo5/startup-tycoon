// Company goals. Three are offered at a time and one can be active: medium-term
// direction, not a quest log. No streaks, no expiry, nothing that punishes
// coming back after a week away.
//
// `progress(state)` returns { have, need } and `ready(state)` decides completion
// so a goal can require a *sustained* condition rather than a peak. Rewards are
// one-time and modest - the point is to reward a different strategy, not to
// out-earn playing well.

const live = (s) => s.products.filter((p) => p.stage === 'live');
const staff = (s) => s.employees.filter((e) => e.id !== 'founder');
const enterpriseCustomers = (s) => live(s).reduce((a, p) => a + (p.customers.enterprise || 0), 0);
const profitableProducts = (s) => live(s).filter((p) => p.revenueDay > 0).length;

export const GOALS = [
  {
    id: 'growth_push', name: 'Growth Push', unlock: 'seed',
    desc: 'Reach 100,000 active users across the portfolio.',
    progress: (s) => ({ have: s.stats.users || 0, need: 100000 }),
    reward: { cash: 60000, reputation: 0.25 },
    rewardText: '+$60K and +0.25 reputation'
  },
  {
    id: 'enterprise_push', name: 'Enterprise Push', unlock: 'growing',
    desc: 'Hold 5 enterprise customers at once.',
    progress: (s) => ({ have: enterpriseCustomers(s), need: 5 }),
    reward: { cash: 180000, reputation: 0.45, tech: { contractSize: 0.05 } },
    rewardText: '+$180K, +0.45 reputation, permanently better contracts'
  },
  {
    id: 'efficiency_drive', name: 'Efficiency Drive', unlock: 'seed',
    desc: 'Run profitable for 10 straight days with infrastructure load under half of capacity.',
    sustained: 10,
    immediate: (s) => (s.stats.netDay > 0 && s.stats.loadRatio !== undefined ? s.stats.loadRatio < 0.5 : false),
    progress: (s) => ({ have: Math.floor(s.goals.track || 0), need: 10 }),
    reward: { cash: 90000, reputation: 0.2, tech: { infraCost: -0.04 } },
    rewardText: '+$90K, +0.2 reputation, permanent 4% infrastructure saving'
  },
  {
    id: 'talent_builder', name: 'Talent Builder', unlock: 'seed',
    desc: 'Grow engineering to 8 people with a department manager in place.',
    progress: (s) => ({ have: s.employees.filter((e) => e.dept === 'engineering').length, need: 8 }),
    ready: (s) => s.employees.filter((e) => e.dept === 'engineering').length >= 8 && !!s.departments.engineering.managerId,
    reward: { reputation: 0.3, tech: { candidateRefresh: 0.25 }, cash: 40000 },
    rewardText: '+$40K, +0.3 reputation, a faster candidate pipeline'
  },
  {
    id: 'product_company', name: 'Product Company', unlock: 'growing',
    desc: 'Operate 3 profitable products at the same time.',
    progress: (s) => ({ have: profitableProducts(s), need: 3 }),
    reward: { cash: 220000, reputation: 0.35, tech: { projectQuality: 0.10 } },
    rewardText: '+$220K, +0.35 reputation, better project outcomes'
  },
  {
    id: 'reliability_leader', name: 'Reliability Leader', unlock: 'growing',
    desc: 'Keep reliability above 95% and stay outage-free for 15 days.',
    sustained: 15,
    immediate: (s) => (s.infra.reliability > 0.95 && !live(s).some((p) => p.outage > 0)),
    progress: (s) => ({ have: Math.floor(s.goals.track || 0), need: 15 }),
    reward: { reputation: 0.4, tech: { outageRisk: -0.10, reliability: 0.02 }, cash: 120000 },
    rewardText: '+$120K, +0.4 reputation, permanently fewer incidents'
  },
  {
    id: 'bootstrapped_success', name: 'Bootstrapped Success', unlock: 'growing',
    desc: 'Reach a $250M valuation without ever taking a funding round.',
    progress: (s) => ({ have: s.funding.rounds.length === 0 ? (s.stats.valuation || 0) : 0, need: 2.5e8 }),
    ready: (s) => s.funding.rounds.length === 0 && (s.stats.valuation || 0) >= 2.5e8,
    reward: { cash: 400000, reputation: 0.6, founderRep: 3 },
    rewardText: '+$400K, +0.6 reputation, +3 Founder Reputation'
  },
  {
    id: 'lean_machine', name: 'Lean Machine', unlock: 'growing',
    desc: 'Hit $100K/day in revenue with fewer than 40 people on staff.',
    progress: (s) => ({ have: Math.round(s.stats.revenueDay || 0), need: 100000 }),
    ready: (s) => (s.stats.revenueDay || 0) >= 100000 && staff(s).length < 40,
    reward: { cash: 250000, founderRep: 2, reputation: 0.3 },
    rewardText: '+$250K, +2 Founder Reputation, +0.3 reputation'
  }
];

export const goalById = (id) => GOALS.find((g) => g.id === id) || null;
export const OFFERED_GOALS = 3;
