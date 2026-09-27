// Employee traits. Every person has at most two, and each one is meant to be
// readable at a glance: a trait changes *how* someone works, not just how much.
//
// Effect keys (all read in sim/workforce.js):
//   out        multiplier delta on everything the person produces
//   outKey     { outputKey: delta } extra multiplier on one output only
//   drain      energy drain delta (+0.5 = tires 50% faster)
//   xp         experience gain delta
//   attrition  resignation risk delta (-0.7 = far less likely to leave)
//   salary     asking-salary delta, applied once when the candidate is rolled
//   skill      flat skill bonus, applied once when the candidate is rolled
//   teamMorale morale nudge for everyone in the same department (aura)
//   streaky    output swings day to day between roughly 0.5x and 1.7x
//   restless   morale drops if not promoted within this many days
//   crisis     output bonus while any product is down
//   launch     improves the launch roll of projects they help ship

export const RARITIES = {
  common: { name: 'Common', color: '#b8b3c8' },
  rare: { name: 'Rare', color: '#5aa9e6' },
  legendary: { name: 'Legendary', color: '#f2b134' }
};

export const TRAITS = [
  // ------------------------------------------------------------- common
  { id: 'workhorse', name: 'Workhorse', rarity: 'common',
    desc: 'Gets a lot done and never says no. Burns out faster than anyone.',
    effects: { out: 0.15, drain: 0.6 } },
  { id: 'steady', name: 'Steady', rarity: 'common',
    desc: 'Same pace every week. Almost impossible to burn out.',
    effects: { drain: -0.5 } },
  { id: 'fast_learner', name: 'Fast Learner', rarity: 'common',
    desc: 'Levels up in half the time.',
    effects: { xp: 1.0 } },
  { id: 'loyal', name: 'Loyal', rarity: 'common',
    desc: 'Will still be here in ten years. Recruiters get nowhere.',
    effects: { attrition: -0.75 } },
  { id: 'team_player', name: 'Team Player', rarity: 'common',
    desc: 'Their whole department is a little happier for having them.',
    effects: { teamMorale: 0.03 } },
  { id: 'ambitious', name: 'Ambitious', rarity: 'common',
    desc: 'Works hard, wants a title. Gets restless if not promoted within 60 days.',
    effects: { out: 0.1, restless: 60 } },
  { id: 'frugal', name: 'Frugal', rarity: 'common',
    desc: 'Asked for less than the market rate, and meant it.',
    effects: { salary: -0.12 } },
  { id: 'social', name: 'Social Butterfly', rarity: 'common',
    desc: 'Knows everyone. Slightly less time at the keyboard.',
    effects: { teamMorale: 0.05, out: -0.06 } },
  { id: 'night_owl', name: 'Night Owl', rarity: 'common',
    desc: 'Does their best work when everyone else has gone home. Loves a crunch.',
    effects: { crunch: 0.2 } },

  // --------------------------------------------------------------- rare
  { id: 'genius', name: 'Unreliable Genius', rarity: 'rare',
    desc: 'On a good week, worth three people. On a bad one, worth nobody.',
    effects: { out: 0.45, streaky: true } },
  { id: 'perfectionist', name: 'Perfectionist', rarity: 'rare',
    desc: 'Ships late, ships right. Launches they touch land better.',
    effects: { out: -0.1, outKey: { quality: 0.8 }, launch: 0.12 } },
  { id: 'firefighter', name: 'Crisis Hero', rarity: 'rare',
    desc: 'Useless in a meeting, unstoppable during an outage.',
    effects: { crisis: 1.5 } },
  { id: 'rainmaker', name: 'Rainmaker', rarity: 'rare',
    desc: 'Customers take their calls. Sales and marketing output far higher.',
    effects: { outKey: { sales: 0.6, marketing: 0.3 } } },
  { id: 'diva', name: 'Diva', rarity: 'rare',
    desc: 'Brilliant and exhausting. Output up, department morale down.',
    effects: { out: 0.3, teamMorale: -0.05 } },
  { id: 'veteran', name: 'Industry Veteran', rarity: 'rare',
    desc: 'Twenty years of pattern-matching. Expensive, calm, learns slowly.',
    effects: { skill: 1.5, salary: 0.2, xp: -0.5, drain: -0.2 } },
  { id: 'hype', name: 'Hype Machine', rarity: 'rare',
    desc: 'Every launch they are near gets talked about.',
    effects: { launch: 0.2, outKey: { marketing: 0.25 } } },

  // ---------------------------------------------------------- legendary
  { id: 'tenx', name: '10x Engineer', rarity: 'legendary',
    desc: 'The myth is real, briefly. Enormous engineering output, enormous salary, fragile.',
    effects: { outKey: { eng: 1.0, quality: 0.5 }, salary: 0.6, drain: 0.4 } },
  { id: 'visionary', name: 'Visionary', rarity: 'legendary',
    desc: 'Sees the product three versions ahead. Product and design output doubled.',
    effects: { outKey: { product: 1.0, design: 1.0 }, launch: 0.15, salary: 0.4 } },
  { id: 'closer', name: 'The Closer', rarity: 'legendary',
    desc: 'Has never lost a deal they cared about.',
    effects: { outKey: { sales: 1.2 }, salary: 0.4 } },
  { id: 'culture_carrier', name: 'Culture Carrier', rarity: 'legendary',
    desc: 'The reason people stay. Lifts morale across the whole company.',
    effects: { teamMorale: 0.06, companyMorale: 0.04, attrition: -0.5 } }
];

export const traitById = (id) => TRAITS.find((t) => t.id === id) || null;

/** Titles by skill band. Purely descriptive, but it tells a story at a glance. */
export const LEVELS = [
  { min: 0, name: 'Junior' },
  { min: 4, name: 'Mid-level' },
  { min: 6, name: 'Senior' },
  { min: 8, name: 'Staff' },
  { min: 10, name: 'Principal' }
];

export function levelName(skill) {
  let n = LEVELS[0].name;
  for (const l of LEVELS) if (skill >= l.min) n = l.name;
  return n;
}

/**
 * Company work pace. A single, readable lever over the whole team's energy:
 * crunch buys output now and pays for it in burnout later.
 */
export const PACES = [
  { id: 'relaxed', name: 'Sustainable', out: -0.08, energy: 0.12, morale: 0.05,
    desc: 'Everyone goes home on time. A little slower, nobody burns out.' },
  { id: 'normal', name: 'Normal', out: 0, energy: 0, morale: 0,
    desc: 'The usual. Some late nights before a launch.' },
  { id: 'crunch', name: 'Crunch', out: 0.25, energy: -0.5, morale: -0.08,
    desc: '+25% output across the company. Energy falls fast; burnt-out people barely work.' }
];
export const paceById = (id) => PACES.find((p) => p.id === id) || PACES[1];

/** "Staff Engineer", "Junior Support Specialist". Role names that already carry a
 *  seniority word lose it, so nobody is ever a "Senior Senior Engineer". */
export function jobTitle(skill, roleName, isFounder = false) {
  if (isFounder) return 'Founder';
  // Managers climb their own ladder.
  if (roleName === 'Manager') return skill >= 10 ? 'VP' : skill >= 8 ? 'Director' : skill >= 6 ? 'Senior Manager' : 'Manager';
  const base = String(roleName || '').replace(/^Senior\s+/, '');
  return `${levelName(skill)} ${base}`;
}
