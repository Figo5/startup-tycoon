// Rival companies. Still simulated far more coarsely than the player, but each
// one now has a personality that decides what it does with its turn: launch,
// raise, start a price war, poach, buy a smaller rival, or quietly run out of
// money. Valuations are on the same scale as yours, so the leaderboard is a
// real race: small rivals are passed in the first hour, the incumbents only
// much later, if at all.

export const PERSONALITIES = {
  copycat: {
    name: 'Fast Follower', blurb: 'Watches your launches and ships a clone within weeks.',
    weights: { launch: 3, raise: 1.5, pricewar: 1, poach: 1, copy: 4 }
  },
  steady: {
    name: 'Steady Operator', blurb: 'Profitable, patient, rarely makes the first move.',
    weights: { launch: 2, raise: 0.5, pricewar: 1.5, poach: 0.5, acquire: 1 }
  },
  blitz: {
    name: 'Blitzscaler', blurb: 'Ships constantly, raises constantly, burns constantly.',
    weights: { launch: 4, raise: 3, pricewar: 1, poach: 1.5 }
  },
  incumbent: {
    name: 'Incumbent', blurb: 'Slow and enormous. Buys threats instead of competing with them.',
    weights: { launch: 1, raise: 0.3, pricewar: 2, poach: 1, acquire: 3, lawsuit: 1.5 }
  },
  hype: {
    name: 'Hype Machine', blurb: 'Raises at valuations nobody can explain. Could implode.',
    weights: { launch: 2, raise: 4, pricewar: 0.5, poach: 2.5 }
  },
  indie: {
    name: 'Indie Darling', blurb: 'Beloved by users, allergic to monetisation. A natural acquisition.',
    weights: { launch: 2.5, raise: 0.3, pricewar: 0.3, poach: 0.2 }
  },
  statesman: {
    name: 'Enterprise Giant', blurb: 'Sells to governments and banks. Wins on contracts, not products.',
    weights: { launch: 1, raise: 0.5, pricewar: 1, poach: 1.5, acquire: 2, lawsuit: 1 }
  }
};

export const COMPETITORS = [
  { id: 'nimbus', name: 'Nimbus Labs', strength: 0.35, aggression: 0.6, cash: 2.4e6, personality: 'copycat',
    valuation: 14e6, growth: 0.0075, headcount: 18,
    markets: ['mobile', 'saas'], blurb: 'Two ex-colleagues of yours, moving fast.' },
  { id: 'ferrite', name: 'Ferrite Systems', strength: 0.55, aggression: 0.35, cash: 9e6, personality: 'steady',
    valuation: 210e6, growth: 0.0045, headcount: 120,
    markets: ['devtool', 'b2b'], blurb: 'Boring, profitable, and never late to a renewal.' },
  { id: 'lumen', name: 'Lumen Interactive', strength: 0.25, aggression: 0.8, cash: 1.1e6, personality: 'blitz',
    valuation: 6e6, growth: 0.009, headcount: 9,
    markets: ['mobile', 'games'], blurb: 'Ships weekly, burns quarterly.' },
  { id: 'obelisk', name: 'Obelisk Software', strength: 0.75, aggression: 0.3, cash: 60e6, personality: 'incumbent',
    valuation: 9e9, growth: 0.0022, headcount: 4200,
    markets: ['b2b', 'enterprise'], blurb: 'The incumbent. Slow, enormous, well-lawyered.' },
  { id: 'kestrel', name: 'Kestrel AI', strength: 0.45, aggression: 0.9, cash: 22e6, personality: 'hype',
    valuation: 450e6, growth: 0.009, headcount: 140,
    markets: ['ai', 'saas'], blurb: 'Raised at a valuation nobody can explain.' },
  { id: 'driftwood', name: 'Driftwood Tools', strength: 0.2, aggression: 0.45, cash: 600000, personality: 'indie',
    valuation: 3e6, growth: 0.006, headcount: 6,
    markets: ['devtool'], blurb: 'Beloved, undermonetised, permanently almost-profitable.' },
  { id: 'atlasgrid', name: 'AtlasGrid', strength: 0.65, aggression: 0.5, cash: 140e6, personality: 'statesman',
    valuation: 24e9, growth: 0.0016, headcount: 11000,
    markets: ['enterprise', 'ai', 'fintech'], blurb: 'Sells to governments. Has a stadium naming deal.' },
  { id: 'pixelforge', name: 'Pixelforge', strength: 0.3, aggression: 0.55, cash: 3e6, personality: 'blitz',
    valuation: 40e6, growth: 0.0075, headcount: 60,
    markets: ['games', 'social'], blurb: 'A games studio that mostly makes sequels. Profitably.' },
  { id: 'tallybank', name: 'Tally', strength: 0.4, aggression: 0.5, cash: 30e6, personality: 'hype',
    valuation: 900e6, growth: 0.006, headcount: 300,
    markets: ['fintech', 'services'], blurb: 'A neobank with more marketing than banking licences.' }
];

// Names rivals give their products. Picked at random; a rival never reuses one.
export const RIVAL_PRODUCT_NAMES = ['Swiftly', 'Orbitly', 'Clarion', 'Hexa', 'Zenith', 'Pulse', 'Vanta',
  'Nova', 'Glint', 'Forge', 'Sonar', 'Prism', 'Relay', 'Keel', 'Ember', 'Atlas One', 'Brisk', 'Quill',
  'Stack+', 'Lattice', 'Mosaic', 'Tempo', 'Ripple', 'Summit', 'Fable', 'Arcade', 'Ledgerly', 'Crux'];

export const rivalById = (id) => COMPETITORS.find((c) => c.id === id) || null;

// New entrants keep the market alive after the originals fall away.
export const ENTRANT_PREFIX = ['Hyper', 'Blue', 'North', 'Quick', 'Open', 'Bright', 'Deep', 'True', 'Iron',
  'Silver', 'Red', 'Loop', 'Flux', 'Kite', 'Arc', 'Pine', 'Wave', 'Nano'];
export const ENTRANT_SUFFIX = ['ly', 'stack', 'base', 'works', 'labs', 'mint', 'cast', 'hub', 'grid', 'loop',
  'shift', 'pilot', 'bit', 'wing'];
export const ENTRANT_BLURBS = [
  'Fresh out of an accelerator, aimed straight at your customers.',
  'Founded by people who left your biggest rival. They know your playbook.',
  'Tiny team, huge ambition, and a demo that went viral.',
  'Backed by a famous fund that needs a win this year.',
  'A spin-out from a bigger company, with its customers already signed.'
];
export const ENTRANT_PERSONALITIES = ['copycat', 'blitz', 'hype', 'indie', 'steady'];
