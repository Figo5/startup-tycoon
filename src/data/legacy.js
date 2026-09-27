// Founder legacy: who you are when you start a company, what extra rules you
// choose to play under, and what you have achieved across every company.
//
// Backgrounds are sidegrades with a real downside; the stronger ones are
// earned. Challenges make a run harder in one specific way and pay more
// Founder Reputation for it. Achievements pay a little Founder Reputation
// once, ever, and several of them unlock backgrounds.

export const BACKGROUNDS = [
  { id: 'generalist', name: 'Generalist', mods: { deptBonus: 0.05 },
    desc: 'Good enough at everything to help every department a little. No weaknesses.' },
  { id: 'technical', name: 'Technical Founder', mods: { devSpeed: 0.12, debtRate: -0.12, sales: -0.2, marketing: -0.1 },
    desc: 'You can build anything. Selling it is someone else\'s job.' },
  { id: 'seller', name: 'Sales Founder', mods: { sales: 0.3, contractSize: 0.12, marketing: 0.1, devSpeed: -0.1 },
    desc: 'You sold it before it existed. Engineering is still catching up.' },
  { id: 'designer', name: 'Design Founder', mods: { projectQuality: 0.15, launch: 0.08, conversion: 0.05, devSpeed: -0.06 },
    desc: 'Everything you ship is beautiful, and it takes a little longer.' },
  { id: 'serial', name: 'Serial Founder', unlock: { exits: 1 }, mods: { fundingValuation: 0.12, reputationGain: 0.15, candidateRefresh: 0.2 },
    startCash: 30000, desc: 'You have done this before. Investors take the meeting and good people take the call.' },
  { id: 'operator', name: 'Operator', unlock: { achievement: 'pe_exit' }, mods: { payroll: -0.06, infraCost: -0.1, moraleGain: 0.04, rest: 0.04 },
    desc: 'A spreadsheet for everything. The company runs cheaper and calmer.' },
  { id: 'hacker', name: 'Growth Hacker', unlock: { achievement: 'viral' }, mods: { launch: 0.1, marketing: 0.15, reliability: -0.03 },
    desc: 'You know how to make things spread, and occasionally break them.' },
  { id: 'veteran_ceo', name: 'Public Company Veteran', unlock: { achievement: 'went_public' }, mods: { valuation: 0.08, fundingValuation: 0.15, managerBonus: 0.15 },
    desc: 'You have rung the bell. Markets and managers trust you.' },
  { id: 'dealmaker', name: 'Dealmaker', unlock: { achievement: 'merger' }, mods: { contractSize: 0.15, enterpriseConv: 0.12, valuation: 0.04 },
    desc: 'Every relationship is a deal waiting to happen.' }
];
export const backgroundById = (id) => BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];

export const CHALLENGES = [
  { id: 'bootstrap', name: 'Bootstrapped', frMul: 0.15, desc: 'No equity funding rounds (revenue loans are allowed). You keep the whole company, which already pays well at exit.' },
  { id: 'lean_office', name: 'Small Office', frMul: 0.25, desc: 'You can never move beyond the Loft.' },
  { id: 'no_marketing', name: 'No Marketing Budget', frMul: 0.3, desc: 'Paid marketing is locked at zero. Word of mouth only.' },
  { id: 'small_team', name: 'Small Team', frMul: 0.2, desc: 'Never more than 25 people. Stages stop asking for headcount you cannot have.' },
  { id: 'hard_rivals', name: 'Hypercompetitive', frMul: 0.3, desc: 'Every rival starts much stronger and richer.' },
  { id: 'recession_start', name: 'Recession Start', frMul: 0.2, desc: 'The economy opens in a recession.' },
  { id: 'speedrun', name: 'Speedrun', frMul: 0.5, desc: 'The bonus only pays if you exit before day 220.' }
];
export const challengeById = (id) => CHALLENGES.find((c) => c.id === id) || null;
/** Challenges unlock once you have finished a company at least once. */
export const CHALLENGE_UNLOCK_EXITS = 1;

// Starting product categories open up as you finish companies.
export const START_UNLOCKS = [
  { exits: 0, cats: ['mobile', 'saas', 'services'] },
  { exits: 1, cats: ['devtool', 'games'] },
  { exits: 2, cats: ['fintech', 'social'] },
  { exits: 3, cats: ['b2b', 'ai'] }
];

// Achievements. `check(state)` runs during play (cheap, and only until
// earned); `atExit(state, exit)` runs when a company is sold. `fr` is paid once,
// ever: milestones every company reaches pay nothing, harder feats pay more.
const live = (s) => s.products.filter((p) => p.stage === 'live');
const L = (s) => s.stats.launches || {};
export const ACHIEVEMENTS = [
  { id: 'first_hire', name: 'First Hire', desc: 'Hire your first employee.', fr: 0, check: (s) => s.employees.length >= 2 },
  { id: 'shipped', name: 'Shipped It', desc: 'Launch your first product.', fr: 0, check: (s) => live(s).length >= 1 },
  { id: 'viral', name: 'Gone Viral', desc: 'Have a launch go viral. Unlocks the Growth Hacker background.', fr: 1, check: (s) => (L(s).viral || 0) >= 1 },
  { id: 'hit_parade', name: 'Hit Parade', desc: 'Ten hit or viral launches in one company.', fr: 1, check: (s) => (L(s).hit || 0) + (L(s).viral || 0) >= 10 },
  { id: 'ten_people', name: 'Ten People', desc: 'Grow to ten people.', fr: 0, check: (s) => s.employees.length >= 10 },
  { id: 'big_company', name: 'Hundred Club', desc: 'Grow to a hundred people.', fr: 1, check: (s) => s.employees.length >= 100 },
  { id: 'legend', name: 'A Living Legend', desc: 'Employ someone with a legendary trait.', fr: 1,
    check: (s) => s.employees.some((e) => (e.traits || []).some((t) => ['tenx', 'visionary', 'closer', 'culture_carrier'].includes(t))) },
  { id: 'unicorn', name: 'Unicorn', desc: 'Reach a $1B valuation.', fr: 0, check: (s) => (s.stats.valuation || 0) >= 1e9 },
  { id: 'decacorn', name: 'Decacorn', desc: 'Reach a $10B valuation.', fr: 1, check: (s) => (s.stats.valuation || 0) >= 1e10 },
  { id: 'million_day', name: 'A Million A Day', desc: 'Earn $1M of revenue in a single day.', fr: 1, check: (s) => (s.stats.revenueDay || 0) >= 1e6 },
  { id: 'top_dog', name: 'Top Of The Table', desc: 'Be the most valuable company on the leaderboard.', fr: 2,
    check: (s) => s.competitors.filter((c) => c.alive && !c.acquired).every((c) => c.valuation < (s.stats.valuation || 0)) && (s.stats.valuation || 0) > 1e9 },
  { id: 'nemesis', name: 'Nemesis Overtaken', desc: 'Become worth more than your nemesis.', fr: 1,
    check: (s) => { const n = s.competitors.find((c) => c.id === s.rivalState?.nemesis); return !!n && (s.stats.valuation || 0) > n.valuation; } },
  { id: 'last_standing', name: 'Last One Standing', desc: 'See three rivals shut down or get bought in one company.', fr: 1,
    check: (s) => s.competitors.filter((c) => !c.alive).length >= 3 },
  { id: 'acquirer', name: 'Acquirer', desc: 'Buy a rival outright.', fr: 1, check: (s) => s.competitors.some((c) => c.acquiredBy === 'player') },
  { id: 'series_c', name: 'Late Money', desc: 'Raise a Series C.', fr: 0, check: (s) => s.funding.rounds.some((r) => r.id === 'series_c') },
  { id: 'board_hit', name: 'Promises Kept', desc: 'Hit a board growth target.', fr: 1, check: (s) => (s.funding.targets || []).some((t) => t.status === 'hit') },
  { id: 'debt_free', name: 'Debt Free', desc: 'Pay off a revenue loan.', fr: 1, check: (s) => !!s.flags?.loanRepaid },
  { id: 'version_five', name: 'Version Five', desc: 'Ship v5 of a product.', fr: 1, check: (s) => s.products.some((p) => p.version >= 5) },
  { id: 'sold_line', name: 'Portfolio Pruning', desc: 'Sell a product line.', fr: 0, check: (s) => (s.soldProducts || []).length >= 1 },
  { id: 'portfolio', name: 'Portfolio', desc: 'Run five live products at once.', fr: 1, check: (s) => live(s).length >= 5 },
  { id: 'synergy', name: 'Well Oiled', desc: 'Have every department synergy active at once.', fr: 1, check: (s) => !!s.flags?.allSynergies },
  { id: 'campus', name: 'Campus Life', desc: 'Move into the Tech Campus.', fr: 0, check: (s) => s.office.tier === 'campus' },
  { id: 'full_house', name: 'Full House', desc: 'Build nine rooms.', fr: 0, check: (s) => s.office.rooms.length >= 9 },
  { id: 'scholar', name: 'Research Institute', desc: 'Complete twenty research projects in one company.', fr: 1, check: (s) => s.research.completed.length >= 20 },
  { id: 'recession_profit', name: 'Weathered It', desc: 'Stay profitable through a recession.', fr: 2,
    check: (s) => s.market?.economy === 'recession' && (s.stats.netDay || 0) > 0 && s.company.stage !== 'solo' },
  // --- at exit ---
  { id: 'bootstrapped', name: 'Bootstrapped', desc: 'Exit still owning the whole company.', fr: 2, atExit: (s) => s.company.founderEquity > 0.99 || (s.exitResult?.equity ?? 0) > 0.99 },
  { id: 'went_public', name: 'Ring The Bell', desc: 'Take a company public. Unlocks the Public Company Veteran background.', fr: 2, atExit: (s, x) => x.id === 'ipo' },
  { id: 'fast_exit', name: 'Speed Run', desc: 'Exit before day 200.', fr: 2, atExit: (s) => s.time.day < 200 },
  { id: 'pe_exit', name: 'Cash Machine', desc: 'Sell to private equity. Unlocks the Operator background.', fr: 1, atExit: (s, x) => x.id === 'pe' },
  { id: 'merger', name: 'Merger Of Equals', desc: 'Merge with a rival. Unlocks the Dealmaker background.', fr: 2, atExit: (s, x) => x.id === 'merger' },
  { id: 'acquihire', name: 'Soft Landing', desc: 'Sell the team in an acqui-hire.', fr: 1, atExit: (s, x) => x.id === 'acquihire' },
  { id: 'consultancy', name: 'From Client Work', desc: 'Exit a company that started as a consulting agency.', fr: 1, atExit: (s) => s.startCategory === 'services' },
  { id: 'challenger', name: 'Challenger', desc: 'Exit with at least one challenge active.', fr: 2, atExit: (s) => (s.challenges || []).length >= 1 },
  { id: 'masochist', name: 'Glutton For Punishment', desc: 'Exit with three challenges active.', fr: 3, atExit: (s) => (s.challenges || []).length >= 3 },
  { id: 'winter', name: 'Funding Winter', desc: 'Exit a company in the Funding Winter market.', fr: 2, atExit: (s) => s.scenarioId === 'downturn' },
  { id: 'serial_five', name: 'Serial Founder', desc: 'Finish five companies.', fr: 3, atExit: (s) => (s.meta?.runs?.length || 0) >= 4 }
];
export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) || null;
