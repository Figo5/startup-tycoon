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

// Room slots per tier: a floor plan only fits so many rooms, so which rooms you
// build is a real choice until the campus.
export const ROOM_SLOTS = { garage: 0, suite: 2, loft: 4, floor: 6, hq: 9, campus: 13 };

// Rooms are bought once per run and persist through office upgrades. Each has a
// daily upkeep (cleaning, licences, snacks, electricity) on top of the rent.
export const ROOMS = [
  { id: 'breakroom', name: 'Break Room', cost: 9000, upkeep: 20, minTier: 'suite', effect: { moraleGain: 0.08, rest: 0.05 },
    blurb: 'Coffee machine, sofa, a place to not be at a desk. People recharge here.' },
  { id: 'meeting', name: 'Meeting Room', cost: 16000, upkeep: 25, minTier: 'suite', effect: { deptBonus: 0.06 },
    blurb: 'Decisions get made faster when people can shut a door.' },
  { id: 'podcast', name: 'Podcast Studio', cost: 28000, upkeep: 40, minTier: 'suite', effect: { reputationGain: 0.15, marketing: 0.06 },
    blurb: 'Two microphones and a founder who has opinions. The brand grows faster.' },
  { id: 'server', name: 'Server Room', cost: 40000, upkeep: 60, minTier: 'suite', effect: { infraCost: -0.12, capacity: 40 },
    blurb: 'Cheaper than the cloud, up to a point.' },
  { id: 'salesfloor', name: 'Sales Floor', cost: 65000, upkeep: 90, minTier: 'loft', effect: { sales: 0.15 },
    blurb: 'A gong. There is always a gong.' },
  { id: 'support_center', name: 'Support Center', cost: 90000, upkeep: 120, minTier: 'loft', effect: { support: 0.2, churn: -0.03 },
    blurb: 'Headsets, a big queue screen, and customers who get answers.' },
  { id: 'design_studio', name: 'Design Studio', cost: 120000, upkeep: 150, minTier: 'loft', effect: { projectQuality: 0.08, launch: 0.05 },
    blurb: 'Easels, prototypes and good light. What ships looks better.' },
  { id: 'lab', name: 'Research Lab', cost: 220000, upkeep: 300, minTier: 'loft', effect: { researchSpeed: 0.35 },
    blurb: 'Where the long-shot work happens. Adds a research slot.' },
  { id: 'gym', name: 'Gym', cost: 180000, upkeep: 250, minTier: 'floor', effect: { moraleGain: 0.1, staffChurn: -0.2, rest: 0.06 },
    blurb: 'Retention, of the employee kind.' },
  { id: 'war_room', name: 'War Room', cost: 300000, upkeep: 250, minTier: 'floor', effect: { outageDuration: -0.3, launch: 0.04 },
    blurb: 'Screens on every wall. Incidents end sooner and launches are run like operations.' },
  { id: 'cafeteria', name: 'Cafeteria', cost: 350000, upkeep: 600, minTier: 'floor', effect: { rest: 0.08, moraleGain: 0.05, staffChurn: -0.1 },
    blurb: 'Free lunch. Nobody leaves the building, in the good way.' },
  { id: 'exec', name: 'Executive Office', cost: 400000, upkeep: 400, minTier: 'floor', effect: { managerBonus: 0.15, valuation: 0.04 },
    blurb: 'Where the fundraising happens.' },
  { id: 'datacenter', name: 'Private Data Center', cost: 4.2e6, upkeep: 3000, minTier: 'hq', effect: { infraCost: -0.3, capacity: 900 },
    blurb: 'You own the metal now.' }
];

export const roomById = (id) => ROOMS.find((r) => r.id === id);
export const roomSlots = (tierId) => ROOM_SLOTS[tierId] ?? 0;
