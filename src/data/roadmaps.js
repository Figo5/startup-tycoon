// Product roadmaps. One initiative at a time per product, chosen by the player
// (or by an engineering manager when automation is on).
//
// `work` is initiative effort-days, accumulated by product/design/engineering
// staff - see sim/roadmap.js for the exact driver. `cost` is paid once, when the
// initiative starts. `effects` land once, on completion.
//
// Every effect maps onto a field the simulation actually reads:
//   acqMul/revMul/churnMul/convMul -> acquisition, ARPU, churn, conversion
//   marketBonus, infraEff, supportLoadMod, enterpriseReady, quality, reliability,
//   security, techDebt          -> existing product fields
// Keep it that way: an effect nobody reads is a lie in the UI.

export const ROADMAP_CATEGORIES = [
  { id: 'growth', name: 'Growth', desc: 'Make the market bigger, or cheaper to reach.' },
  { id: 'monetization', name: 'Monetization', desc: 'Extract more per customer, and take on the cost of doing it.' },
  { id: 'quality', name: 'Quality', desc: 'Spend engineering time on the parts nobody thanks you for.' },
  { id: 'product', name: 'Product', desc: 'New surface area, and new things to support.' }
];

export const ROADMAPS = [
  // ---------------------------------------------------------------- growth
  { id: 'referral', cat: 'growth', name: 'Referral System', cost: 25000, work: 34,
    desc: 'Existing users bring new ones. Cheap, compounding, slow to start.',
    effects: { acqMul: 0.06, convMul: 0.02 },
    conservative: true },
  { id: 'mobile_launch', cat: 'growth', name: 'Mobile Launch', cost: 90000, work: 75, requires: { stage: 'seed' },
    desc: 'A real app on both stores. Enormous reach, another platform to keep alive.',
    effects: { acqMul: 0.11, infraEff: -0.06, supportLoadMod: 0.08, churnMul: 0.02 },
    tradeoff: 'Another client to release, patch and support.' },
  { id: 'free_tier', cat: 'growth', name: 'Free Tier', cost: 40000, work: 52,
    desc: 'Let anyone in the door. Growth now, revenue per user later.',
    effects: { acqMul: 0.13, convMul: 0.05, revMul: -0.08, infraEff: -0.05, supportLoadMod: 0.12 },
    tradeoff: 'Free users cost money to serve and dilute average revenue.' },
  { id: 'localization', cat: 'growth', name: 'Localization', cost: 150000, work: 96, requires: { stage: 'growing' },
    desc: 'Six languages, four currencies, one support queue that never sleeps.',
    effects: { marketBonus: 0.10, supportLoadMod: 0.10, acqMul: 0.02 },
    tradeoff: 'Localised support is expensive to staff properly.' },

  // ---------------------------------------------------------- monetization
  { id: 'premium_plan', cat: 'monetization', name: 'Premium Plan', cost: 30000, work: 44,
    desc: 'A higher tier for the people who already love it.',
    effects: { revMul: 0.07, churnMul: 0.03 },
    conservative: true },
  { id: 'usage_pricing', cat: 'monetization', name: 'Usage-Based Pricing', cost: 120000, work: 86, requires: { stage: 'seed' },
    desc: 'Pay for what you use. The heaviest users start paying properly.',
    effects: { revMul: 0.11, churnMul: 0.09 },
    tradeoff: 'Bills that surprise people are a churn machine.' },
  { id: 'enterprise_tier', cat: 'monetization', name: 'Enterprise Tier', cost: 200000, work: 114, requires: { stage: 'growing' },
    desc: 'SSO, audit logs, procurement paperwork. The contracts that pay the rent.',
    effects: { enterpriseReady: 0.22, revMul: 0.04, supportLoadMod: 0.16 },
    tradeoff: 'Enterprise support load, and reliability people can sue you over.' },
  { id: 'addon_marketplace', cat: 'monetization', name: 'Add-On Marketplace', cost: 260000, work: 135, requires: { stage: 'scaleup' },
    desc: 'Let other people build on it, and take a cut.',
    effects: { revMul: 0.06, acqMul: 0.02, supportLoadMod: 0.08 },
    tradeoff: 'A platform you now have to keep stable for third parties.' },

  // --------------------------------------------------------------- quality
  { id: 'reliability_sprint', cat: 'quality', name: 'Reliability Sprint', cost: 25000, work: 39,
    desc: 'Two weeks of nothing but on-call pain and postmortems.',
    effects: { reliability: 0.12, churnMul: -0.04 },
    conservative: true },
  { id: 'ux_redesign', cat: 'quality', name: 'UX Redesign', cost: 70000, work: 65,
    desc: 'Every screen gets a second look, and a few get deleted.',
    effects: { convMul: 0.09, churnMul: -0.05, acqMul: 0.02 },
    tradeoff: 'Existing users have to relearn the product.' },
  { id: 'performance_rewrite', cat: 'quality', name: 'Performance Rewrite', cost: 60000, work: 88,
    minDept: { engineering: 3 },
    desc: 'The hot path, rewritten properly. Fewer servers, fewer pages.',
    effects: { infraEff: 0.18, reliability: 0.05, techDebt: -0.25 },
    tradeoff: 'A quarter of engineering spent on code nobody can see.' },
  { id: 'security_hardening', cat: 'quality', name: 'Security Hardening', cost: 90000, work: 73, requires: { stage: 'seed' },
    desc: 'Penetration tests, a bug bounty, and encryption everywhere.',
    effects: { security: 0.30, reliability: 0.05, enterpriseReady: 0.10 },
    tradeoff: 'Costs money now to avoid a much larger bill later.' },

  // --------------------------------------------------------------- product
  { id: 'analytics_dashboard', cat: 'product', name: 'Analytics Dashboard', cost: 55000, work: 57,
    desc: 'Customers can finally see what they are paying for.',
    effects: { convMul: 0.05, revMul: 0.03, churnMul: -0.03 },
    conservative: true },
  { id: 'collaboration', cat: 'product', name: 'Collaboration Features', cost: 140000, work: 94, requires: { stage: 'growing' },
    desc: 'Teams, permissions, comments, shared views.',
    effects: { enterpriseReady: 0.14, acqMul: 0.02, supportLoadMod: 0.06 },
    tradeoff: 'Permissions are the hardest thing in software.' },
  { id: 'api_platform', cat: 'product', name: 'API Platform', cost: 220000, work: 125, requires: { stage: 'growing' },
    desc: 'Everything the UI can do, documented and versioned.',
    effects: { marketBonus: 0.08, revMul: 0.05, enterpriseReady: 0.10, supportLoadMod: 0.08 },
    tradeoff: 'An API is a promise you can never break.' },
  { id: 'ai_assistant', cat: 'product', name: 'AI Assistant', cost: 400000, work: 161, requires: { stage: 'scaleup' },
    minDept: { engineering: 5, product: 1 },
    desc: 'A model that does the boring half of the job. It is not cheap to run.',
    effects: { revMul: 0.10, acqMul: 0.04, infraEff: -0.18, supportLoadMod: 0.05 },
    tradeoff: 'Inference costs land on every single request.' }
];

export const roadmapById = (id) => ROADMAPS.find((r) => r.id === id) || null;
export const roadmapsByCat = (cat) => ROADMAPS.filter((r) => r.cat === cat);
