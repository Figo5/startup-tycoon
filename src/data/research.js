// Research / upgrades. `mods` are additive modifier deltas read by the sim;
// `flags` unlock mechanics outright. `days` is research time at speed 1.0.

export const RESEARCH_CATEGORIES = [
  { id: 'tooling', name: 'Development Tooling', color: 0x64b5f6 },
  { id: 'automation', name: 'Automation', color: 0x4db6ac },
  { id: 'infra', name: 'Infrastructure', color: 0x9575cd },
  { id: 'analytics', name: 'Product Analytics', color: 0xffd54f },
  { id: 'marketing', name: 'Marketing', color: 0xf06292 },
  { id: 'sales', name: 'Sales', color: 0xff8a65 },
  { id: 'support', name: 'Customer Support', color: 0x81c784 },
  { id: 'culture', name: 'Company Culture', color: 0xa1887f },
  { id: 'ai', name: 'AI-Assisted Development', color: 0xe57373 },
  { id: 'cloud', name: 'Cloud Optimization', color: 0x4fc3f7 }
];

export const RESEARCH = [
  // --- Development tooling ---
  { id: 'ci_cd', cat: 'tooling', name: 'CI/CD Pipeline', cost: 8000, days: 3, req: [],
    desc: 'Automated builds and deploys. Everything ships faster.', mods: { devSpeed: 0.12 } },
  { id: 'code_review', cat: 'tooling', name: 'Code Review Culture', cost: 19000, days: 4, req: ['ci_cd'],
    desc: 'Slower merges, much slower rot.', mods: { debtRate: -0.20, quality: 0.05 } },
  { id: 'test_suite', cat: 'tooling', name: 'Automated Test Suite', cost: 48000, days: 6, req: ['ci_cd'],
    desc: 'Regressions get caught before customers find them.', mods: { debtRate: -0.25, reliability: 0.08 } },
  { id: 'monorepo', cat: 'tooling', name: 'Unified Build System', cost: 170000, days: 8, req: ['test_suite'],
    desc: 'One build, one graph, no more twenty-minute cold starts.', mods: { devSpeed: 0.18 } },
  { id: 'ai_pair', cat: 'ai', name: 'AI Pair Programmer', cost: 950000, days: 12, req: ['ml_platform', 'monorepo'],
    desc: 'Every engineer effectively works alongside another one.', mods: { devSpeed: 0.35, debtRate: 0.05 } },

  // --- Automation ---
  { id: 'onboarding', cat: 'automation', name: 'Onboarding Playbook', cost: 22000, days: 4, req: [],
    desc: 'New hires are productive in days instead of weeks.', mods: { hireQuality: 0.15, moraleGain: 0.03 } },
  { id: 'applicant_tracking', cat: 'automation', name: 'Applicant Tracking', cost: 72000, days: 5, req: ['onboarding'],
    desc: 'A deeper, fresher candidate pool.', mods: { candidateSlots: 2, candidateRefresh: 0.5 } },
  { id: 'recruiting_pipeline', cat: 'automation', name: 'Recruiting Pipeline', cost: 680000, days: 10, req: ['applicant_tracking'],
    desc: 'Open desks fill themselves, within the budget you set.', mods: {}, flags: ['autoHire'] },
  { id: 'delivery_playbooks', cat: 'automation', name: 'Delivery Playbooks', cost: 320000, days: 8, req: ['code_review'],
    desc: 'Managed departments queue sensible work across every product.', mods: {}, flags: ['autoProjects'] },
  { id: 'ops_runbooks', cat: 'automation', name: 'Ops Runbooks', cost: 125000, days: 6, req: [],
    desc: 'Incidents get shorter because nobody has to improvise.', mods: { outageDuration: -0.35 } },

  // --- Infrastructure ---
  { id: 'cdn', cat: 'infra', name: 'Global CDN', cost: 30000, days: 4, req: [],
    desc: 'Serve bytes from close to the user.', mods: { infraCost: -0.10, reliability: 0.05 } },
  { id: 'autoscaling', cat: 'infra', name: 'Autoscaling', cost: 185000, days: 6, req: ['cdn'],
    desc: 'Capacity follows load automatically. No more manual server buying.', mods: {}, flags: ['autoscale'] },
  { id: 'multiregion', cat: 'infra', name: 'Multi-Region Failover', cost: 1.1e6, days: 10, req: ['autoscaling'],
    desc: 'One region can fall over without taking the company with it.', mods: { reliability: 0.15, outageRisk: -0.40 } },
  { id: 'chaos', cat: 'infra', name: 'Chaos Engineering', cost: 2.6e6, days: 12, req: ['multiregion'],
    desc: 'Break it on purpose, on a Tuesday, at 10am.', mods: { reliability: 0.10, outageRisk: -0.30 } },

  // --- Product analytics ---
  { id: 'analytics', cat: 'analytics', name: 'Product Analytics', cost: 26000, days: 4, req: [],
    desc: 'Find out which half of the product anyone uses.', mods: { conversion: 0.12 } },
  { id: 'experimentation', cat: 'analytics', name: 'Experimentation Platform', cost: 145000, days: 7, req: ['analytics'],
    desc: 'Every shipped project lands harder.', mods: { conversion: 0.10, projectQuality: 0.20 } },
  { id: 'churn_model', cat: 'analytics', name: 'Churn Prediction', cost: 430000, days: 8, req: ['experimentation'],
    desc: 'Catch accounts before they leave.', mods: { churn: -0.12 } },

  // --- Marketing ---
  { id: 'content', cat: 'marketing', name: 'Content Engine', cost: 15000, days: 3, req: [],
    desc: 'Cheap, compounding, slightly embarrassing.', mods: { marketing: 0.20 } },
  { id: 'brand', cat: 'marketing', name: 'Brand Campaign', cost: 215000, days: 7, req: ['content'],
    desc: 'Reputation grows faster, and reputation grows every market.', mods: { reputationGain: 0.50, marketSize: 0.10 } },
  { id: 'global_go_to_market', cat: 'marketing', name: 'Global Go-To-Market', cost: 1.9e6, days: 12, req: ['brand'], stage: 'scaleup',
    desc: 'Sell everywhere. Unlocks internationalization work on products.', mods: { marketSize: 0.45 } },

  // --- Sales ---
  { id: 'crm', cat: 'sales', name: 'CRM System', cost: 36000, days: 4, req: [],
    desc: 'Stop losing deals in a spreadsheet.', mods: { sales: 0.18 } },
  { id: 'sales_playbook', cat: 'sales', name: 'Sales Playbook', cost: 195000, days: 6, req: ['crm'],
    desc: 'Repeatable motion instead of heroics.', mods: { sales: 0.20, enterpriseConv: 0.10 } },
  { id: 'solution_engineering', cat: 'sales', name: 'Solution Engineering', cost: 920000, days: 9, req: ['sales_playbook'],
    desc: 'Technical pre-sales closes the contracts nobody else can.', mods: { enterpriseConv: 0.25, contractSize: 0.20 } },

  // --- Support ---
  { id: 'helpcenter', cat: 'support', name: 'Self-Serve Help Center', cost: 20000, days: 3, req: [],
    desc: 'Most tickets never need a human.', mods: { support: 0.30 } },
  { id: 'support_automation', cat: 'support', name: 'Support Automation', cost: 270000, days: 7, req: ['helpcenter'],
    desc: 'Triage, routing and canned fixes handled for you.', mods: { support: 0.50 } },
  { id: 'success_team', cat: 'support', name: 'Customer Success Program', cost: 720000, days: 8, req: ['support_automation'],
    desc: 'Proactive outreach instead of reactive apologies.', mods: { churn: -0.15, conversion: 0.10 } },

  // --- Culture ---
  { id: 'handbook', cat: 'culture', name: 'Company Handbook', cost: 12000, days: 3, req: [],
    desc: 'Written-down answers to the questions everyone asks.', mods: { moraleGain: 0.06 } },
  { id: 'equity_refresh', cat: 'culture', name: 'Equity Refresh Program', cost: 255000, days: 6, req: ['handbook'],
    desc: 'People stop taking the recruiter calls.', mods: { staffChurn: -0.40, moraleGain: 0.05 } },
  { id: 'remote', cat: 'culture', name: 'Distributed Work', cost: 520000, days: 7, req: ['handbook'],
    desc: 'Headcount is no longer capped by floor space.', mods: { deskBonus: 14, moraleGain: 0.04 } },
  { id: 'leadership', cat: 'culture', name: 'Leadership Development', cost: 1.45e6, days: 9, req: ['equity_refresh'],
    desc: 'Managers who actually multiply their departments.', mods: { managerBonus: 0.25 } },

  // --- AI ---
  { id: 'ml_platform', cat: 'ai', name: 'ML Platform', cost: 490000, days: 9, req: ['analytics'], stage: 'seed',
    desc: 'Training and serving infrastructure. Unlocks AI products and AI features.', mods: {} },
  { id: 'inference_opt', cat: 'ai', name: 'Inference Optimization', cost: 2.3e6, days: 10, req: ['ml_platform', 'autoscaling'],
    desc: 'The same model, a quarter of the bill.', mods: { infraCost: -0.25 } },

  // --- Cloud optimization ---
  { id: 'reserved', cat: 'cloud', name: 'Reserved Capacity', cost: 92000, days: 5, req: [],
    desc: 'Commit up front, pay less per unit.', mods: { infraCost: -0.15 } },
  { id: 'finops', cat: 'cloud', name: 'FinOps Practice', cost: 620000, days: 8, req: ['reserved'],
    desc: 'Someone finally owns the bill.', mods: { infraCost: -0.20, payroll: -0.03 } },
  { id: 'custom_silicon', cat: 'cloud', name: 'Custom Silicon', cost: 19e6, days: 16, req: ['finops'], stage: 'major',
    desc: 'Your own accelerators. Absurd up front, transformative after.', mods: { infraCost: -0.35, capacityPerUnit: 0.50 } }
];

export const researchById = (id) => RESEARCH.find((r) => r.id === id);
