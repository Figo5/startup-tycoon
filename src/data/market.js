// Market conditions. Two layers, both visible to the player well ahead of time:
//
//   Economy - one company-wide phase (boom, normal, downturn, recession) that
//             lasts weeks of game time. It moves market size, investor appetite,
//             churn and what talent costs.
//   Trends  - named waves in one product category: a hype cycle to ride or a
//             saturated market to avoid. They are the opportunities.
//
// Nothing here is a surprise penalty: each phase is announced when it begins,
// shows how long it is expected to last, and is survivable by doing nothing.

export const ECONOMY = {
  boom: {
    id: 'boom', name: 'Boom', days: [26, 44], color: '#6ec07a',
    blurb: 'Budgets are loose and investors are generous. Talent is expensive.',
    mods: { marketSize: 0.12, fundingValuation: 0.22, payroll: 0.05, churn: -0.04 },
    next: { normal: 0.7, downturn: 0.3 }
  },
  normal: {
    id: 'normal', name: 'Steady', days: [30, 55], color: '#b8b3c8',
    blurb: 'Nothing unusual. Growth is earned the ordinary way.',
    mods: {},
    next: { boom: 0.38, downturn: 0.3, normal: 0.32 }
  },
  downturn: {
    id: 'downturn', name: 'Downturn', days: [24, 40], color: '#f2b134',
    blurb: 'Buyers hesitate and investors lowball. Good people are easier to hire.',
    mods: { marketSize: -0.08, fundingValuation: -0.28, churn: 0.08, payroll: -0.04, hireQuality: 0.1 },
    next: { normal: 0.75, recession: 0.25 }
  },
  recession: {
    id: 'recession', name: 'Recession', days: [20, 32], color: '#ef6f6c',
    blurb: 'Budgets are frozen. Survive it lean and you come out ahead of rivals who did not.',
    mods: { marketSize: -0.16, fundingValuation: -0.45, churn: 0.15, payroll: -0.08, hireQuality: 0.2 },
    next: { normal: 1 }
  }
};

// Trend templates. `cats` is where a wave can form. Positive waves grow the
// market, sharpen launches and warm investors to companies in the category;
// negative ones do the reverse and reward anyone already diversified.
export const TRENDS = [
  { id: 'ai_rush', name: 'AI Gold Rush', cats: ['ai'], days: [30, 45],
    marketSize: 0.4, launch: 0.12, funding: 0.3,
    blurb: 'Every board wants an AI story. Anything AI-shaped sells.' },
  { id: 'ai_winter', name: 'AI Skepticism', cats: ['ai'], days: [22, 34], negative: true,
    marketSize: -0.2, launch: -0.08, funding: -0.2,
    blurb: 'A string of disappointing demos. Buyers want proof, not promises.' },
  { id: 'app_season', name: 'App Store Spotlight', cats: ['mobile', 'games'], days: [20, 32],
    marketSize: 0.3, launch: 0.15, funding: 0.1,
    blurb: 'Storefront editors are featuring small studios. Launches land louder.' },
  { id: 'ad_crunch', name: 'Ad Market Crunch', cats: ['mobile', 'social', 'games'], days: [22, 36], negative: true,
    marketSize: -0.18, launch: -0.05, funding: -0.1,
    blurb: 'Advertisers pulled back. Free-tier revenue is thin for a while.' },
  { id: 'remote_work', name: 'Remote Work Wave', cats: ['saas', 'b2b'], days: [28, 44],
    marketSize: 0.3, launch: 0.08, funding: 0.15,
    blurb: 'Every team is re-buying its tool stack.' },
  { id: 'saas_fatigue', name: 'SaaS Fatigue', cats: ['saas'], days: [22, 34], negative: true,
    marketSize: -0.15, launch: -0.06, funding: -0.1,
    blurb: 'CFOs are auditing subscriptions and cancelling half of them.' },
  { id: 'dev_renaissance', name: 'Developer Renaissance', cats: ['devtool'], days: [28, 40],
    marketSize: 0.45, launch: 0.12, funding: 0.2,
    blurb: 'A new platform shift and every developer is retooling.' },
  { id: 'security_push', name: 'Compliance Deadline', cats: ['enterprise', 'b2b', 'fintech'], days: [26, 40],
    marketSize: 0.25, launch: 0.05, funding: 0.1,
    blurb: 'New regulation lands. Buyers need certified vendors, fast.' },
  { id: 'fintech_boom', name: 'Open Banking Boom', cats: ['fintech'], days: [26, 40],
    marketSize: 0.4, launch: 0.1, funding: 0.3,
    blurb: 'New rails, new customers, and a lot of new money chasing them.' },
  { id: 'fintech_scrutiny', name: 'Regulator Scrutiny', cats: ['fintech'], days: [20, 30], negative: true,
    marketSize: -0.2, launch: -0.1, funding: -0.25,
    blurb: 'The regulator is asking questions. Everyone moves more carefully.' },
  { id: 'console_cycle', name: 'New Console Cycle', cats: ['games'], days: [30, 44],
    marketSize: 0.35, launch: 0.15, funding: 0.15,
    blurb: 'New hardware, new audiences, and players hungry for launch titles.' },
  { id: 'creator_economy', name: 'Creator Economy', cats: ['social', 'mobile'], days: [26, 40],
    marketSize: 0.35, launch: 0.1, funding: 0.2,
    blurb: 'Everyone is a creator now, and they all need somewhere to post.' },
  { id: 'enterprise_freeze', name: 'IT Budget Freeze', cats: ['enterprise', 'b2b'], days: [20, 32], negative: true,
    marketSize: -0.15, launch: -0.05, funding: -0.1,
    blurb: 'Procurement is pushing everything to next fiscal year.' },
  { id: 'outsourcing', name: 'Outsourcing Wave', cats: ['services'], days: [26, 40],
    marketSize: 0.4, launch: 0.05, funding: 0.05,
    blurb: 'Companies want projects delivered, not headcount. Agencies are booked solid.' }
];

export const trendDefById = (id) => TRENDS.find((t) => t.id === id) || null;
