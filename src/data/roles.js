// Employee roles and departments. Salaries are annual; payroll accrues daily.

export const DEPARTMENTS = [
  {
    id: 'engineering', name: 'Engineering', color: 0x64b5f6, unlock: 'solo',
    blurb: 'Turns payroll into shipped software.',
    priorities: [
      { id: 'ship', name: 'Ship Features', desc: 'Prefer feature work. Faster growth, more debt.' },
      { id: 'balanced', name: 'Balanced', desc: 'Mix of features and upkeep.' },
      { id: 'quality', name: 'Quality & Upkeep', desc: 'Reliability and refactors first.' }
    ]
  },
  {
    id: 'product', name: 'Product', color: 0xffd54f, unlock: 'tiny',
    blurb: 'Decides what is worth building, and keeps users from leaving.',
    priorities: [
      { id: 'growth', name: 'Growth', desc: 'Push addressable market and conversion.' },
      { id: 'balanced', name: 'Balanced', desc: 'Even split.' },
      { id: 'retention', name: 'Retention', desc: 'Cut churn hard.' }
    ]
  },
  {
    id: 'sales', name: 'Sales', color: 0xff8a65, unlock: 'tiny',
    blurb: 'Lands the customers marketing cannot reach.',
    priorities: [
      { id: 'smb', name: 'Volume (SMB)', desc: 'Many small accounts.' },
      { id: 'balanced', name: 'Balanced', desc: 'Work the whole funnel.' },
      { id: 'enterprise', name: 'Enterprise', desc: 'Fewer, far larger accounts.' }
    ]
  },
  {
    id: 'marketing', name: 'Marketing', color: 0xf06292, unlock: 'tiny',
    blurb: 'Buys attention, and slowly builds a name.',
    priorities: [
      { id: 'acquisition', name: 'Acquisition', desc: 'Maximum users per dollar.' },
      { id: 'balanced', name: 'Balanced', desc: 'Some of each.' },
      { id: 'brand', name: 'Brand', desc: 'Grow company reputation, which grows every market.' }
    ]
  },
  {
    id: 'support', name: 'Customer Support', color: 0x81c784, unlock: 'tiny',
    blurb: 'Keeps paying customers paying.',
    priorities: [
      { id: 'speed', name: 'Response Speed', desc: 'Lower churn.' },
      { id: 'balanced', name: 'Balanced', desc: 'Even split.' },
      { id: 'upsell', name: 'Success & Upsell', desc: 'Convert more free users, grow accounts.' }
    ]
  },
  {
    id: 'infra', name: 'Infrastructure', color: 0x9575cd, unlock: 'seed',
    blurb: 'Keeps the lights on and the cloud bill survivable.',
    priorities: [
      { id: 'cost', name: 'Cost Efficiency', desc: 'Cheaper compute per unit.' },
      { id: 'balanced', name: 'Balanced', desc: 'Even split.' },
      { id: 'reliability', name: 'Reliability', desc: 'Fewer and shorter outages.' }
    ]
  }
];

export const departmentById = (id) => DEPARTMENTS.find((d) => d.id === id);

// output keys: eng, product, design, sales, marketing, support, infra, manage
export const ROLES = [
  {
    id: 'founder', name: 'Founder', dept: 'engineering', salary: 0, unlock: 'solo',
    skill: [5, 7], output: { eng: 1.1, product: 0.5, sales: 0.45, marketing: 0.35, support: 0.3 },
    blurb: 'You. Mediocre at everything, which is exactly what a company of one needs.'
  },
  {
    id: 'engineer', name: 'Software Engineer', dept: 'engineering', salary: 95000, unlock: 'solo',
    skill: [3, 6], output: { eng: 1.2 },
    blurb: 'Writes the product.'
  },
  {
    id: 'senior_engineer', name: 'Senior Engineer', dept: 'engineering', salary: 168000, unlock: 'tiny',
    skill: [6, 9], output: { eng: 1.35, quality: 0.35 },
    blurb: 'Writes the product, and stops it rotting.'
  },
  {
    id: 'designer', name: 'Designer', dept: 'product', salary: 118000, unlock: 'tiny',
    skill: [4, 8], output: { design: 1.1, product: 0.25 },
    blurb: 'Raises product quality, which raises everything downstream.'
  },
  {
    id: 'pm', name: 'Product Manager', dept: 'product', salary: 132000, unlock: 'seed',
    skill: [4, 8], output: { product: 1.2, eng: 0.1 },
    blurb: 'Points engineering at work that matters.'
  },
  {
    id: 'marketer', name: 'Marketer', dept: 'marketing', salary: 96000, unlock: 'tiny',
    skill: [3, 7], output: { marketing: 1.2 },
    blurb: 'Makes every marketing dollar go further.'
  },
  {
    id: 'sales_rep', name: 'Sales Representative', dept: 'sales', salary: 92000, unlock: 'tiny',
    skill: [3, 7], output: { sales: 1.2 },
    blurb: 'The only way business customers ever show up.'
  },
  {
    id: 'support_specialist', name: 'Support Specialist', dept: 'support', salary: 64000, unlock: 'tiny',
    skill: [2, 6], output: { support: 1.3 },
    blurb: 'Answers the tickets nobody else will.'
  },
  {
    id: 'infra_engineer', name: 'Infrastructure Engineer', dept: 'infra', salary: 145000, unlock: 'seed',
    skill: [5, 9], output: { infra: 1.2, eng: 0.2 },
    blurb: 'Cheaper servers, fewer 3am pages.'
  },
  {
    id: 'manager', name: 'Manager', dept: 'engineering', salary: 178000, unlock: 'growing',
    skill: [5, 9], output: { manage: 1.0 }, anyDept: true,
    blurb: 'Runs a department so you do not have to. Automates idle work.'
  }
];

export const roleById = (id) => ROLES.find((r) => r.id === id);

export const FIRST_NAMES = ['Ada', 'Bo', 'Cleo', 'Dev', 'Enzo', 'Farah', 'Gus', 'Hana', 'Idris', 'Jae',
  'Kira', 'Lars', 'Mina', 'Nils', 'Oona', 'Pia', 'Quinn', 'Rafa', 'Sana', 'Tobias', 'Uma', 'Vik',
  'Wren', 'Xiu', 'Yara', 'Zane', 'Amara', 'Bruno', 'Cato', 'Dara', 'Elif', 'Fen', 'Gita', 'Hugo',
  'Ines', 'Juno', 'Kai', 'Lena', 'Marek', 'Noor', 'Otto', 'Perrin', 'Rosa', 'Sten', 'Thea', 'Ugo'];

export const LAST_NAMES = ['Abara', 'Boquet', 'Castellan', 'Drexler', 'Eriksen', 'Falk', 'Gundersen',
  'Haddad', 'Imamura', 'Jovanovic', 'Kaur', 'Lindqvist', 'Maroun', 'Nwosu', 'Okafor', 'Petrov',
  'Quiroga', 'Rasmussen', 'Salgado', 'Takahashi', 'Ubeda', 'Varga', 'Wexler', 'Ximenes', 'Yates',
  'Zubiri', 'Almeida', 'Bergman', 'Cho', 'Dumas', 'Enright', 'Fontaine', 'Ghosh', 'Hollis'];

export const SPECIALTIES = [
  { id: 'fast', name: 'Fast Shipper', effect: { eng: 0.18 } },
  { id: 'meticulous', name: 'Meticulous', effect: { quality: 0.3, eng: -0.05 } },
  { id: 'firefighter', name: 'Firefighter', effect: { infra: 0.2 } },
  { id: 'closer', name: 'Closer', effect: { sales: 0.25 } },
  { id: 'storyteller', name: 'Storyteller', effect: { marketing: 0.25 } },
  { id: 'empath', name: 'Empath', effect: { support: 0.22, morale: 0.1 } },
  { id: 'generalist', name: 'Generalist', effect: { eng: 0.06, product: 0.06, support: 0.06 } },
  { id: 'mentor', name: 'Mentor', effect: { teamXp: 0.35 } }
];
