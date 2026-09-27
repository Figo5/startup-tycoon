// Product categories. All rates are per GAME DAY. "users" = total accounts,
// "customers" = the paying subset, split across customer classes.
// Tuning lives here, never inside UI or renderer code.

export const CUSTOMER_CLASSES = ['consumer', 'smb', 'midmarket', 'enterprise'];

export const PRODUCT_CATEGORIES = [
  {
    id: 'mobile',
    name: 'Consumer Mobile App',
    blurb: 'Cheap to build, enormous reach, fickle users. Ad revenue carries the free tier.',
    strategy: 'Consumer growth: marketing and viral quality. Low revenue per user, huge reach.',
    color: 0x4fc3f7,
    mvpWork: 30,
    marketBase: 60000,
    growth: 0.30,
    seedUsers: 250,
    marketingUsers: 3.0,     // users acquired per $ of marketing spend per day
    salesPull: 0.05,         // how much a sales org helps
    viral: 0.55,             // extra organic growth from quality
    conversion: 0.035,
    classMix: { consumer: 1, smb: 0, midmarket: 0, enterprise: 0 },
    arpu: { free: 0.006, consumer: 0.25, smb: 0.9, midmarket: 6, enterprise: 20 },
    churn: 0.020,
    supportLoad: 0.6,        // support units per 1000 paying customers
    infraLoad: 1.2,          // infra units per 1000 users
    enterprisePotential: 0.0,
    unlock: null
  },
  {
    id: 'saas',
    name: 'SaaS Productivity Tool',
    blurb: 'The reliable middle of the road. Prosumers and small teams, steady money.',
    strategy: 'The balanced middle. Rewards steady feature work and a small sales team.',
    color: 0x81c784,
    mvpWork: 70,
    marketBase: 14000,
    growth: 0.22,
    seedUsers: 90,
    marketingUsers: 1.2,
    salesPull: 0.35,
    viral: 0.35,
    conversion: 0.12,
    classMix: { consumer: 0.5, smb: 0.5, midmarket: 0, enterprise: 0 },
    arpu: { free: 0.001, consumer: 0.45, smb: 1.6, midmarket: 9, enterprise: 32 },
    churn: 0.010,
    supportLoad: 1.2,
    infraLoad: 0.6,
    enterprisePotential: 0.25,
    unlock: null
  },
  {
    id: 'devtool',
    name: 'Developer Tool',
    blurb: 'Marketing barely works; word of mouth does. Sticky, cheap to run, loved or ignored.',
    strategy: 'Word of mouth over marketing. Engineers and quality sell it; very low churn.',
    color: 0xba9cf0,
    mvpWork: 60,
    marketBase: 9000,
    growth: 0.28,
    seedUsers: 60,
    marketingUsers: 0.5,
    salesPull: 0.25,
    viral: 1.1,
    conversion: 0.09,
    classMix: { consumer: 0.4, smb: 0.6, midmarket: 0, enterprise: 0 },
    arpu: { free: 0.0, consumer: 0.6, smb: 2.2, midmarket: 11, enterprise: 45 },
    churn: 0.006,
    supportLoad: 0.4,
    infraLoad: 0.4,
    enterprisePotential: 0.4,
    unlock: { stage: 'tiny' }
  },
  {
    id: 'b2b',
    name: 'B2B SaaS Platform',
    blurb: 'Sales-led. Fewer accounts, much larger cheques, and a support queue to match.',
    strategy: 'Sales-led: salespeople, support and enterprise features. Big contracts.',
    color: 0xffb74d,
    mvpWork: 140,
    marketBase: 2600,
    growth: 0.16,
    seedUsers: 25,
    marketingUsers: 0.25,
    salesPull: 1.6,
    viral: 0.15,
    conversion: 0.35,
    classMix: { consumer: 0, smb: 0.5, midmarket: 0.38, enterprise: 0.12 },
    arpu: { free: 0, consumer: 0.8, smb: 2, midmarket: 5, enterprise: 18 },
    churn: 0.004,
    supportLoad: 3.0,
    infraLoad: 1.0,
    enterprisePotential: 0.8,
    unlock: { stage: 'seed' }
  },
  {
    id: 'ai',
    name: 'AI Software Product',
    blurb: 'Grows like wildfire and burns compute like it. Reliability problems get expensive fast.',
    strategy: 'Explosive growth, ruinous compute. Infrastructure and research carry it.',
    color: 0xf06292,
    mvpWork: 220,
    marketBase: 40000,
    growth: 0.34,
    seedUsers: 180,
    marketingUsers: 1.8,
    salesPull: 0.6,
    viral: 0.8,
    conversion: 0.06,
    classMix: { consumer: 0.55, smb: 0.3, midmarket: 0.15, enterprise: 0 },
    arpu: { free: 0.002, consumer: 0.7, smb: 2.2, midmarket: 8, enterprise: 30 },
    churn: 0.022,
    supportLoad: 1.0,
    infraLoad: 9.0,
    enterprisePotential: 0.55,
    unlock: { research: 'ml_platform' }
  },
  {
    id: 'enterprise',
    name: 'Enterprise Software',
    blurb: 'Glacial, procurement-bound, and each logo is worth a small product line.',
    strategy: 'Slow and enormous. A sales machine with a heavy support queue.',
    color: 0x90a4ae,
    mvpWork: 400,
    marketBase: 700,
    growth: 0.10,
    seedUsers: 4,
    marketingUsers: 0.05,
    salesPull: 2.6,
    viral: 0.05,
    conversion: 0.5,
    classMix: { consumer: 0, smb: 0, midmarket: 0.45, enterprise: 0.55 },
    arpu: { free: 0, consumer: 0, smb: 6, midmarket: 20, enterprise: 78 },
    churn: 0.0015,
    supportLoad: 8.0,
    infraLoad: 1.5,
    enterprisePotential: 1.0,
    unlock: { stage: 'scaleup' }
  },
  {
    id: 'services',
    name: 'Consulting Agency',
    blurb: 'Build software for clients. Cash from week one, but investors value hours far below products.',
    strategy: 'Favours sales and support. Great for bootstrapping; valued at a third of a product company.',
    color: 0xa1887f,
    mvpWork: 36,
    marketBase: 260,
    growth: 0.08,
    seedUsers: 3,
    marketingUsers: 0.02,
    salesPull: 1.3,
    viral: 0.1,
    conversion: 0.9,
    classMix: { consumer: 0, smb: 0.7, midmarket: 0.25, enterprise: 0.05 },
    arpu: { free: 0, consumer: 0, smb: 9, midmarket: 22, enterprise: 60 },
    churn: 0.012,
    supportLoad: 30,
    billable: 115,   // $ per unit of delivery capacity per day
    infraLoad: 0.2,
    enterprisePotential: 0.35,
    valuationMul: 0.33,
    unlock: null
  },
  {
    id: 'games',
    name: 'Game Studio',
    blurb: 'Hit-driven. A great launch is a flood of players; a flop is a quiet month. Sequels matter.',
    strategy: 'Launches count double: polish, marketing and hype traits pay off. Players churn fast.',
    color: 0x7986cb,
    mvpWork: 85,
    marketBase: 70000,
    growth: 0.36,
    seedUsers: 300,
    marketingUsers: 2.4,
    salesPull: 0.02,
    viral: 0.9,
    conversion: 0.05,
    classMix: { consumer: 1, smb: 0, midmarket: 0, enterprise: 0 },
    arpu: { free: 0.004, consumer: 0.45, smb: 1, midmarket: 5, enterprise: 20 },
    churn: 0.028,
    supportLoad: 0.5,
    infraLoad: 2.0,
    enterprisePotential: 0,
    hitDriven: true,
    unlock: { stage: 'tiny' }
  },
  {
    id: 'social',
    name: 'Social Network',
    blurb: 'Worth more with every user who joins. Ad-funded, moderation-heavy, and expensive to run.',
    strategy: 'Network effects: growth accelerates with scale. Needs support (moderation) and infrastructure.',
    color: 0x4dd0e1,
    mvpWork: 110,
    marketBase: 110000,
    growth: 0.24,
    seedUsers: 200,
    marketingUsers: 2.0,
    salesPull: 0.05,
    viral: 0.9,
    conversion: 0.012,
    classMix: { consumer: 1, smb: 0, midmarket: 0, enterprise: 0 },
    arpu: { free: 0.011, consumer: 0.3, smb: 1, midmarket: 5, enterprise: 20 },
    churn: 0.016,
    supportLoad: 6,
    infraLoad: 2.6,
    enterprisePotential: 0,
    network: true,
    unlock: { stage: 'seed' }
  },
  {
    id: 'fintech',
    name: 'Fintech App',
    blurb: 'Money is sticky and lucrative, and customers leave the moment they stop trusting you.',
    strategy: 'High revenue per customer. Security below 60% drives churn; security work pays twice.',
    color: 0x66bb6a,
    mvpWork: 170,
    marketBase: 16000,
    growth: 0.18,
    seedUsers: 60,
    marketingUsers: 0.9,
    salesPull: 0.5,
    viral: 0.35,
    conversion: 0.16,
    classMix: { consumer: 0.6, smb: 0.3, midmarket: 0.1, enterprise: 0 },
    arpu: { free: 0, consumer: 0.9, smb: 3.2, midmarket: 14, enterprise: 50 },
    churn: 0.007,
    supportLoad: 2.2,
    infraLoad: 0.9,
    enterprisePotential: 0.5,
    securityCritical: true,
    unlock: { stage: 'seed' }
  }
];

export const categoryById = (id) => PRODUCT_CATEGORIES.find((c) => c.id === id);
/** Categories a brand-new company can start with. */
export const startCategories = () => PRODUCT_CATEGORIES.filter((c) => !c.unlock);

// Development projects a product can have queued. `work` is in engineering-days
// at 1.0 productivity and scales with the category's mvpWork.
export const PROJECT_TYPES = [
  {
    id: 'mvp', name: 'Build MVP', repeatable: false, workMul: 1.0,
    desc: 'Get the first version out the door.',
    effects: { launch: true, quality: 0.0, debt: 0.05 }
  },
  {
    id: 'feature', name: 'Major Feature Update', repeatable: true, workMul: 0.45,
    desc: 'Raises quality and market appeal. Adds a little technical debt.',
    effects: { quality: 0.11, debt: 0.06, version: 0.1, reputation: 0.02, market: 0.05 }
  },
  {
    id: 'reliability', name: 'Reliability Work', repeatable: true, workMul: 0.35,
    desc: 'Fewer outages, lower churn. No new toys for marketing.',
    effects: { reliability: 0.10, debt: -0.03 }
  },
  {
    id: 'refactor', name: 'Pay Down Tech Debt', repeatable: true, workMul: 0.3,
    desc: 'Nothing visible ships. Everything after it ships faster.',
    effects: { debt: -0.22, quality: 0.02 }
  },
  {
    id: 'performance', name: 'Performance Upgrade', repeatable: true, workMul: 0.32,
    desc: 'Cuts infrastructure load per user.',
    effects: { infraEff: 0.14, quality: 0.03 }
  },
  {
    id: 'mobileport', name: 'Mobile Version', repeatable: false, workMul: 0.5,
    desc: 'Widens the addressable market.',
    effects: { market: 0.30, quality: 0.04, debt: 0.05 }
  },
  {
    id: 'enterprise', name: 'Enterprise Features', repeatable: false, workMul: 0.7,
    desc: 'SSO, audit logs, contracts. Unlocks larger customer classes.',
    effects: { enterpriseReady: 0.45, quality: 0.05, debt: 0.08, supportLoad: 0.15 },
    requires: { stage: 'growing' }
  },
  {
    id: 'security', name: 'Security Hardening', repeatable: true, workMul: 0.3,
    desc: 'Lowers the odds and the cost of a breach.',
    effects: { security: 0.25, reliability: 0.03 }
  },
  {
    id: 'aifeature', name: 'AI Feature', repeatable: true, workMul: 0.55,
    desc: 'Big appeal bump, meaningful extra compute load.',
    effects: { quality: 0.09, market: 0.16, infraEff: -0.12, reputation: 0.03 },
    requires: { research: 'ml_platform' }
  },
  {
    id: 'i18n', name: 'Internationalization', repeatable: false, workMul: 0.4,
    desc: 'Ship in more languages, reach more markets.',
    effects: { market: 0.25 },
    requires: { research: 'global_go_to_market' }
  },
  {
    id: 'major', name: 'Next Major Version', repeatable: true, workMul: 1.5, launch: 0.15,
    desc: 'A relaunch: v2, v3... Big quality and market jump, clears some debt, and gets a launch of its own. Needs 4 feature updates for v2, and two more for each version after that.',
    effects: { quality: 0.16, market: 0.22, debt: -0.12, reputation: 0.06, majorVersion: true },
    requires: { featuresSinceMajor: 4 }
  }
];

// Projects that go out to customers as a *launch* get a roll against quality,
// polish, marketing and the people who shipped it. Routine updates just ship.
export const LAUNCHABLE = new Set(['mvp', 'mobileport', 'i18n', 'enterprise', 'major']);

/**
 * How a product team builds. Chosen per product; each queued project keeps the
 * approach it was queued with.
 *   work     multiplier on project size
 *   quality  multiplier on quality gains
 *   debt     multiplier on debt added (and a flat extra)
 *   launch   shift to the launch roll
 */
export const APPROACHES = [
  { id: 'rush', name: 'Rush', work: 0.65, quality: 0.5, debtMul: 1.5, debtAdd: 0.05, launch: -0.12,
    desc: 'Ship a third sooner. Less polish, more debt, shakier launches.' },
  { id: 'standard', name: 'Standard', work: 1, quality: 1, debtMul: 1, debtAdd: 0, launch: 0,
    desc: 'The normal trade-off.' },
  { id: 'polish', name: 'Polish', work: 1.4, quality: 1.35, debtMul: 0.4, debtAdd: -0.02, launch: 0.12,
    desc: 'Takes 40% longer. Better quality, little debt, launches land harder.' }
];
export const approachById = (id) => APPROACHES.find((a) => a.id === id) || APPROACHES[1];

export const LAUNCH_OUTCOMES = [
  { id: 'flop', name: 'Flop', below: 0.2 },
  { id: 'solid', name: 'Solid', below: 0.56 },
  { id: 'hit', name: 'Hit', below: 0.84 },
  { id: 'viral', name: 'Viral', below: Infinity }
];
// Routine updates get a muted launch; firsts and relaunches get the full one.
export const BIG_LAUNCHES = new Set(['mvp', 'major', 'mobileport', 'i18n', 'enterprise']);

export const projectTypeById = (id) => PROJECT_TYPES.find((p) => p.id === id);
