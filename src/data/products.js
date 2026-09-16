// Product categories. All rates are per GAME DAY. "users" = total accounts,
// "customers" = the paying subset, split across customer classes.
// Tuning lives here, never inside UI or renderer code.

export const CUSTOMER_CLASSES = ['consumer', 'smb', 'midmarket', 'enterprise'];

export const PRODUCT_CATEGORIES = [
  {
    id: 'mobile',
    name: 'Consumer Mobile App',
    blurb: 'Cheap to build, enormous reach, fickle users. Ad revenue carries the free tier.',
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
  }
];

export const categoryById = (id) => PRODUCT_CATEGORIES.find((c) => c.id === id);

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
  }
];

export const projectTypeById = (id) => PROJECT_TYPES.find((p) => p.id === id);
