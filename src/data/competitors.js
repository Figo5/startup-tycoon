// Rival companies. Simulated far more coarsely than the player: a strength
// score, cash, and market shares that press on the player's addressable market.

export const COMPETITORS = [
  { id: 'nimbus', name: 'Nimbus Labs', strength: 0.35, aggression: 0.6, cash: 2.4e6,
    markets: ['mobile', 'saas'], blurb: 'Two ex-colleagues of yours, moving fast.' },
  { id: 'ferrite', name: 'Ferrite Systems', strength: 0.55, aggression: 0.35, cash: 9e6,
    markets: ['devtool', 'b2b'], blurb: 'Boring, profitable, and never late to a renewal.' },
  { id: 'lumen', name: 'Lumen Interactive', strength: 0.25, aggression: 0.8, cash: 1.1e6,
    markets: ['mobile'], blurb: 'Ships weekly, burns quarterly.' },
  { id: 'obelisk', name: 'Obelisk Software', strength: 0.75, aggression: 0.3, cash: 60e6,
    markets: ['b2b', 'enterprise'], blurb: 'The incumbent. Slow, enormous, well-lawyered.' },
  { id: 'kestrel', name: 'Kestrel AI', strength: 0.45, aggression: 0.9, cash: 22e6,
    markets: ['ai', 'saas'], blurb: 'Raised at a valuation nobody can explain.' },
  { id: 'driftwood', name: 'Driftwood Tools', strength: 0.2, aggression: 0.45, cash: 600000,
    markets: ['devtool'], blurb: 'Beloved, undermonetised, permanently almost-profitable.' },
  { id: 'atlasgrid', name: 'AtlasGrid', strength: 0.65, aggression: 0.5, cash: 140e6,
    markets: ['enterprise', 'ai'], blurb: 'Sells to governments. Has a stadium naming deal.' }
];
