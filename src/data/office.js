// Office expansion tiers. Each tier is a hand-authored map (see render/maps.js)
// plus a set of optional rooms the player can buy inside that tier.

export const OFFICE_TIERS = [
  {
    id: 'garage', name: 'Garage Office', cost: 0, rent: 40, desks: 6, unlock: 'solo',
    blurb: 'A converted garage with questionable wiring.',
    moraleBase: 0.55
  },
  {
    id: 'suite', name: 'Startup Suite', cost: 45000, rent: 190, desks: 14, unlock: 'tiny',
    blurb: 'Two rooms above a bakery. It smells wonderful.',
    moraleBase: 0.65
  },
  {
    id: 'loft', name: 'Loft Office', cost: 280000, rent: 720, desks: 32, unlock: 'seed',
    blurb: 'Exposed brick, standing desks, one very tired plant.',
    moraleBase: 0.72
  },
  {
    id: 'floor', name: 'Full Office Floor', cost: 1.6e6, rent: 2600, desks: 68, unlock: 'growing',
    blurb: 'An entire floor with your logo at reception.',
    moraleBase: 0.78
  },
  {
    id: 'hq', name: 'Corporate Headquarters', cost: 14e6, rent: 9800, desks: 140, unlock: 'scaleup',
    blurb: 'Badge readers, a real cafeteria, and an executive floor.',
    moraleBase: 0.82
  },
  {
    id: 'campus', name: 'Tech Campus', cost: 110e6, rent: 38000, desks: 280, unlock: 'major',
    blurb: 'Several buildings, a lake nobody swims in, and a shuttle bus.',
    moraleBase: 0.88
  }
];

export const tierById = (id) => OFFICE_TIERS.find((t) => t.id === id);
export const tierIndex = (id) => OFFICE_TIERS.findIndex((t) => t.id === id);

// Rooms are bought once per run and persist through office upgrades.
export const ROOMS = [
  { id: 'breakroom', name: 'Break Room', cost: 9000, minTier: 'suite', effect: { moraleGain: 0.08 },
    blurb: 'Coffee machine, sofa, a place to not be at a desk.' },
  { id: 'meeting', name: 'Meeting Room', cost: 16000, minTier: 'suite', effect: { deptBonus: 0.06 },
    blurb: 'Decisions get made faster when people can shut a door.' },
  { id: 'server', name: 'Server Room', cost: 40000, minTier: 'suite', effect: { infraCost: -0.12, capacity: 40 },
    blurb: 'Cheaper than the cloud, up to a point.' },
  { id: 'salesfloor', name: 'Sales Floor', cost: 65000, minTier: 'loft', effect: { sales: 0.15 },
    blurb: 'A gong. There is always a gong.' },
  { id: 'lab', name: 'Research Lab', cost: 220000, minTier: 'loft', effect: { researchSpeed: 0.35 },
    blurb: 'Where the long-shot work happens.' },
  { id: 'gym', name: 'Gym', cost: 180000, minTier: 'floor', effect: { moraleGain: 0.1, staffChurn: -0.2 },
    blurb: 'Retention, of the employee kind.' },
  { id: 'exec', name: 'Executive Office', cost: 400000, minTier: 'floor', effect: { managerBonus: 0.15, valuation: 0.04 },
    blurb: 'Where the fundraising happens.' },
  { id: 'datacenter', name: 'Private Data Center', cost: 4.2e6, minTier: 'hq', effect: { infraCost: -0.3, capacity: 900 },
    blurb: 'You own the metal now.' }
];

export const roomById = (id) => ROOMS.find((r) => r.id === id);
