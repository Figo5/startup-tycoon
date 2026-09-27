// Department perks and cross-department synergies.
//
// A department grows into named capabilities as it gains people; the larger
// ones also need a manager, which is what makes managers worth their salary
// beyond automation. Synergies reward a sensible *mix* of departments rather
// than stacking one. Everything here is a modifier bag read by computeMods.

export const DEPT_PERKS = {
  engineering: [
    { size: 3, name: 'Code Review Rota', mods: { debtRate: -0.08 }, desc: 'Every change gets a second pair of eyes.' },
    { size: 8, name: 'Platform Team', mods: { devSpeed: 0.08 }, desc: 'Someone owns the build, the deploys and the shared libraries.' },
    { size: 15, name: 'Release Train', manager: true, mods: { launch: 0.05, debtRate: -0.08 }, desc: 'Predictable releases, fewer surprises at launch.' },
    { size: 30, name: 'Engineering Org', manager: true, mods: { devSpeed: 0.1, projectQuality: 0.1 }, desc: 'Staff engineers, guilds, an architecture review. It works.' }
  ],
  product: [
    { size: 2, name: 'User Research', mods: { launch: 0.05 }, desc: 'You talk to users before you build, not after.' },
    { size: 5, name: 'Design System', mods: { projectQuality: 0.1 }, desc: 'Every screen looks like it belongs to the same product.' },
    { size: 10, name: 'Product Council', manager: true, mods: { conversion: 0.08, launch: 0.05 }, desc: 'Roadmaps with evidence behind them.' }
  ],
  sales: [
    { size: 2, name: 'Pipeline Reviews', mods: { sales: 0.08 }, desc: 'Every Monday, every deal, honestly.' },
    { size: 5, name: 'Enterprise Desk', mods: { enterpriseConv: 0.1, contractSize: 0.08 }, desc: 'People who know what a procurement portal is.' },
    { size: 12, name: 'Channel Partners', manager: true, mods: { sales: 0.12, marketSize: 0.04 }, desc: 'Resellers and agencies selling on your behalf.' }
  ],
  marketing: [
    { size: 2, name: 'Content Calendar', mods: { marketing: 0.1 }, desc: 'Something useful goes out every week.' },
    { size: 5, name: 'Brand Team', mods: { reputationGain: 0.2 }, desc: 'A voice, a look, and people who guard them.' },
    { size: 10, name: 'Growth Lab', manager: true, mods: { marketSize: 0.06, launch: 0.05 }, desc: 'Experiments on every channel, all the time.' }
  ],
  support: [
    { size: 3, name: 'Knowledge Base', mods: { support: 0.12 }, desc: 'Answers written down once, read a thousand times.' },
    { size: 8, name: 'Success Managers', mods: { churn: -0.06 }, desc: 'Big accounts have a named human.' },
    { size: 15, name: 'Follow-the-Sun', manager: true, mods: { churn: -0.05, conversion: 0.05 }, desc: 'Someone answers at every hour, in every time zone.' }
  ],
  infra: [
    { size: 2, name: 'On-Call Rota', mods: { outageDuration: -0.2 }, desc: 'Someone is always holding the pager.' },
    { size: 5, name: 'SRE Practice', mods: { outageRisk: -0.2, reliability: 0.02 }, desc: 'Error budgets, postmortems, fewer 3am pages.' },
    { size: 10, name: 'Platform Engineering', manager: true, mods: { infraCost: -0.1, capacityPerUnit: 0.1 }, desc: 'Internal platforms that make every team cheaper to run.' }
  ]
};

// Synergies between departments. `ok(counts)` receives headcount by department.
export const SYNERGIES = [
  { id: 'design_eng', name: 'Design Partnership', desc: 'At least one product/design person for every six engineers.',
    ok: (c) => c.engineering >= 3 && c.product * 6 >= c.engineering, mods: { projectQuality: 0.06, launch: 0.03 } },
  { id: 'sales_support', name: 'Customer Handoff', desc: 'Support at least half the size of sales, so new customers stay.',
    ok: (c) => c.sales >= 2 && c.support * 2 >= c.sales, mods: { churn: -0.05 } },
  { id: 'product_marketing', name: 'Go-To-Market Loop', desc: 'Product and marketing both staffed: launches have a story.',
    ok: (c) => c.product >= 1 && c.marketing >= 2, mods: { launch: 0.06, marketing: 0.05 } },
  { id: 'eng_infra', name: 'You Build It, You Run It', desc: 'One infrastructure engineer for every eight engineers.',
    ok: (c) => c.infra >= 1 && c.infra * 8 >= c.engineering, mods: { outageRisk: -0.12, debtRate: -0.05 } },
  { id: 'balanced', name: 'Balanced Company', desc: 'Every department has at least two people.',
    ok: (c) => ['engineering', 'product', 'sales', 'marketing', 'support', 'infra'].every((d) => (c[d] || 0) >= 2),
    mods: { deptBonus: 0.05, moraleGain: 0.03 } }
];

// Founder actions: short, optional, on a cooldown. They reward someone who is
// watching without being required by someone who is not.
export const FOUNDER_ACTIONS = [
  { id: 'allnighter', name: 'All-Nighter', key: 'Z', cooldown: 4, days: 1, minStage: 'solo',
    desc: 'Ship faster for a day: +40% engineering. Costs you energy.',
    mods: { devSpeed: 0.4 }, founderEnergy: -0.22 },
  { id: 'customer_calls', name: 'Customer Calls', key: 'X', cooldown: 5, days: 3, minStage: 'solo',
    desc: 'Phone your unhappiest customers yourself: churn -20% for 3 days.',
    mods: { churn: -0.2 } },
  { id: 'tweetstorm', name: 'Tweetstorm', key: 'C', cooldown: 7, days: 3, minStage: 'solo',
    desc: 'Post about your best product: a burst of sign-ups. Sometimes it backfires.',
    hype: 0.3, backfire: 0.2 },
  { id: 'pep_talk', name: 'Pep Talk', key: 'V', cooldown: 8, minStage: 'tiny',
    desc: 'Rally the team: morale and energy up for everyone.',
    morale: 0.07, energy: 0.08 },
  { id: 'sales_blitz', name: 'Sales Blitz', key: 'B', cooldown: 6, days: 2, minStage: 'tiny',
    desc: 'Work the phones with sales: +60% sales output for 2 days.',
    mods: { sales: 0.6 } },
  { id: 'code_cleanup', name: 'Code Cleanup', key: 'N', cooldown: 6, minStage: 'tiny',
    desc: 'Spend a day deleting code: technical debt down on your busiest product.',
    debt: -0.1 },
  { id: 'investor_coffee', name: 'Investor Coffee', key: 'M', cooldown: 15, minStage: 'seed',
    desc: 'Keep investors warm: your next round is priced 8% higher.',
    fundingBonus: 1.08 }
];
export const founderActionById = (id) => FOUNDER_ACTIONS.find((a) => a.id === id) || null;
