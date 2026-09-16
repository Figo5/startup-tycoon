// Event definitions. Each choice's `apply(ctx)` runs against a small helper API
// (see sim/events.js). `auto` names the choice used when the player ignores the
// event until it expires - always the conservative option.

const live = (s) => s.products.filter((p) => p.stage === 'live');
const consumer = (s) => live(s).filter((p) => ['mobile', 'saas', 'ai'].includes(p.category));
const biggest = (s) => live(s).sort((a, b) => b.revenueDay - a.revenueDay)[0] || null;

export const EVENTS = [
  {
    id: 'viral_post', title: 'Something Went Viral', weight: 10, expires: 2.5,
    cond: (s) => consumer(s).length > 0,
    text: (s) => `A post about ${(consumer(s)[0] || {}).name} is climbing every feed. The window is hours, not weeks.`,
    choices: [
      { id: 'amplify', label: 'Pour $ into ads behind it', cost: (s) => Math.max(5000, s.stats.revenueDay * 4),
        desc: 'Buy attention while attention is cheap.',
        apply: (c) => { const p = consumer(c.state)[0]; if (p) c.api.addUsers(p, p.users * 0.55 + 4000); c.api.addReputation(0.18); c.api.note('The spike held. Sign-ups tripled for a day.'); } },
      { id: 'ride', label: 'Ride it out', desc: 'Free, smaller, no risk.',
        apply: (c) => { const p = consumer(c.state)[0]; if (p) c.api.addUsers(p, p.users * 0.18 + 900); c.api.addReputation(0.06); c.api.note('A pleasant bump, then back to normal.'); } }
    ],
    auto: 'ride'
  },
  {
    id: 'outage', title: 'Service Outage', weight: 12, expires: 1.5, minStage: 'tiny',
    cond: (s) => live(s).length > 0,
    text: () => 'Everything is down. The status page is the only thing still up.',
    choices: [
      { id: 'allhands', label: 'All hands on deck', cost: (s) => Math.max(2000, s.stats.expenseDay * 1.5),
        desc: 'Fastest recovery, costs money and a day of engineering.',
        apply: (c) => { c.api.endOutage(0.15); c.api.engPenalty(1.0); c.api.note('Back up in under an hour. Nobody slept.'); } },
      { id: 'infra', label: 'Let infrastructure handle it', desc: 'Slower, cheaper, some churn.',
        apply: (c) => { c.api.endOutage(c.api.infraCoverage() > 0.9 ? 0.5 : 1.4); c.api.note('Restored. The postmortem is on the wiki.'); } },
      { id: 'minigame', label: 'Run the incident yourself', minigame: 'incident',
        desc: 'Route capacity by hand. Do well and it barely registers.' }
    ],
    auto: 'infra'
  },
  {
    id: 'security', title: 'Security Disclosure', weight: 6, expires: 3, minStage: 'seed',
    cond: (s) => live(s).length > 0,
    text: () => 'A researcher emailed a working exploit and a 90-day clock.',
    choices: [
      { id: 'bounty', label: 'Pay the bounty and patch now', cost: (s) => Math.max(15000, s.stats.revenueDay * 6),
        desc: 'Expensive, clean, reputation intact.',
        apply: (c) => { c.api.addReputation(0.08); c.api.security(0.15); c.api.note('Patched and credited. The writeup was flattering.'); } },
      { id: 'quiet', label: 'Quiet fix, no disclosure', desc: 'Free unless it leaks.',
        apply: (c) => { if (c.api.chance(0.4)) { c.api.addReputation(-0.55); c.api.churnSpike(0.3, 6); c.api.note('It leaked. The coverage was not flattering.'); } else c.api.note('Fixed quietly. Nobody noticed.'); } }
    ],
    auto: 'bounty'
  },
  {
    id: 'star_candidate', title: 'Exceptional Candidate', weight: 9, expires: 3, minStage: 'tiny',
    text: () => 'Someone genuinely excellent is between jobs and likes what you are building.',
    choices: [
      { id: 'hire', label: 'Hire at a premium', desc: 'Adds a high-skill candidate at +35% salary.',
        apply: (c) => { c.api.spawnCandidate({ star: true }); c.api.note('They are in the pipeline. Go make the offer.'); } },
      { id: 'pass', label: 'Pass for now', desc: 'Keep the payroll where it is.', apply: (c) => c.api.note('You passed. They joined a rival.') }
    ],
    auto: 'pass'
  },
  {
    id: 'resignation', title: 'Resignation Letter', weight: 8, expires: 2, minStage: 'tiny',
    cond: (s) => s.employees.length > 2,
    text: (s) => `${s.pendingEventSubject || 'One of your team'} is leaving unless something changes.`,
    choices: [
      { id: 'counter', label: 'Counter-offer', cost: (s) => 24000 + s.stats.expenseDay * 2,
        desc: 'Keeps them, raises their salary 12%.',
        apply: (c) => { c.api.retainEmployee(0.12); c.api.note('They stayed. Word gets around about that.'); } },
      { id: 'let_go', label: 'Wish them well', desc: 'You lose the person and their work in progress.',
        apply: (c) => { c.api.loseEmployee(); c.api.note('They left. The handover was three bullet points.'); } }
    ],
    auto: 'let_go'
  },
  {
    id: 'enterprise_inquiry', title: 'Enterprise Inquiry', weight: 10, expires: 4, minStage: 'growing',
    cond: (s) => live(s).some((p) => p.enterpriseReady > 0.2),
    text: () => 'A company with a procurement department wants a serious conversation.',
    choices: [
      { id: 'sla', label: 'Accept their SLA', desc: 'Large contract, but outages now cost penalties.',
        apply: (c) => c.api.addContract({ sizeMul: 1.6, sla: true }) },
      { id: 'smaller', label: 'Negotiate something smaller', desc: 'Safe, modest, no penalty clause.',
        apply: (c) => c.api.addContract({ sizeMul: 0.7, sla: false }) },
      { id: 'minigame', label: 'Negotiate it personally', minigame: 'negotiation',
        desc: 'Read the room and push for better terms.' },
      { id: 'decline', label: 'Decline', desc: 'Stay focused on the core product.', apply: (c) => c.api.note('Declined. Support is grateful.') }
    ],
    auto: 'smaller'
  },
  {
    id: 'press', title: 'Press Interest', weight: 7, expires: 2.5, minStage: 'tiny',
    text: () => 'A reporter wants twenty minutes about how you got here.',
    choices: [
      { id: 'interview', label: 'Do the interview', desc: 'Reputation up, one founder-day gone.',
        apply: (c) => { c.api.addReputation(0.22); c.api.engPenalty(0.4); c.api.note('The piece ran well. Inbound doubled for a week.'); } },
      { id: 'decline', label: 'Decline politely', desc: 'Keep shipping.', apply: (c) => c.api.addReputation(0.02) }
    ],
    auto: 'decline'
  },
  {
    id: 'investor_interest', title: 'Investor Interest', weight: 6, expires: 4, minStage: 'tiny',
    cond: (s) => s.funding.offers.length === 0,
    text: () => 'A fund has been watching your growth and would like to talk terms.',
    choices: [
      { id: 'talk', label: 'Take the meeting', desc: 'Generates a funding offer at a 10% better valuation.',
        apply: (c) => { c.api.spawnFundingOffer(1.10); c.api.note('There is an offer waiting in Finance.'); } },
      { id: 'ignore', label: 'Not now', desc: 'Stay in control.', apply: (c) => c.api.note('You told them to call back next quarter.') }
    ],
    auto: 'ignore'
  },
  {
    id: 'competitor_launch', title: 'Rival Product Launch', weight: 9, expires: 3, minStage: 'seed',
    cond: (s) => live(s).length > 0,
    text: (s) => `${s.pendingEventSubject || 'A rival'} just launched straight at your best product.`,
    choices: [
      { id: 'sprint', label: 'Answer with a feature sprint', desc: 'Queue priority work; costs engineering time.',
        apply: (c) => { c.api.queuePriority('feature'); c.api.note('Engineering is on it.'); } },
      { id: 'price', label: 'Cut prices to hold the line', desc: 'Keeps customers, costs 12% revenue for two weeks.',
        apply: (c) => { c.api.boost('pricecut', { revenue: -0.12, churn: -0.25 }, 14); c.api.note('Prices cut. Churn held.'); } },
      { id: 'ignore', label: 'Ignore it', desc: 'They lose a little share to the rival.',
        apply: (c) => { c.api.rivalShare(0.05); c.api.note('You lost a slice of the market.'); } }
    ],
    auto: 'ignore'
  },
  {
    id: 'competitor_outage', title: 'Rival Is Down', weight: 6, expires: 2, minStage: 'seed',
    text: (s) => `${s.pendingEventSubject || 'A rival'} has been offline for six hours and counting.`,
    choices: [
      { id: 'campaign', label: 'Run a switch campaign', cost: (s) => Math.max(8000, s.stats.revenueDay * 3),
        desc: 'Buy their unhappy users while they are unhappy.',
        apply: (c) => { c.api.stealShare(0.08); c.api.note('A wave of migrations landed overnight.'); } },
      { id: 'classy', label: 'Stay classy', desc: 'Small reputation gain.', apply: (c) => c.api.addReputation(0.05) }
    ],
    auto: 'classy'
  },
  {
    id: 'poaching', title: 'Recruiters Circling', weight: 7, expires: 2.5, minStage: 'growing',
    cond: (s) => s.employees.length > 5,
    text: () => 'A rival is calling your best people with numbers you did not budget for.',
    choices: [
      { id: 'match', label: 'Match the offers', cost: (s) => s.stats.payrollDay * 12,
        desc: 'Raises salaries 8% across the company, morale up.',
        apply: (c) => { c.api.raiseSalaries(0.08); c.api.morale(0.12); c.api.note('Nobody left. Payroll noticed.'); } },
      { id: 'walk', label: 'Let them walk', desc: 'You will probably lose someone.',
        apply: (c) => { if (c.api.chance(0.6)) { c.api.loseEmployee(); c.api.morale(-0.08); } c.api.note('Two resignations, one retracted.'); } }
    ],
    auto: 'walk'
  },
  {
    id: 'market_boom', title: 'Market Upswing', weight: 5, expires: 1, minStage: 'seed',
    text: () => 'Budgets loosened across the sector. Everything is a little easier for a while.',
    choices: [{ id: 'ok', label: 'Make the most of it', desc: '+25% market size for three weeks.',
      apply: (c) => { c.api.boost('boom', { marketSize: 0.25 }, 21); c.api.note('Ride it.'); } }],
    auto: 'ok'
  },
  {
    id: 'market_slowdown', title: 'Market Slowdown', weight: 5, expires: 2, minStage: 'seed',
    text: () => 'Procurement froze across half your pipeline. Everyone is "revisiting next quarter".',
    choices: [
      { id: 'cut', label: 'Cut marketing spend', desc: 'Halve marketing budget for two weeks, preserve cash.',
        apply: (c) => { c.api.boost('slowdown', { marketSize: -0.15 }, 18); c.api.halveMarketing(); c.api.note('Spend cut, growth flat, cash intact.'); } },
      { id: 'spend', label: 'Spend through it', desc: 'Keep growing while rivals retreat - if you can afford it.',
        apply: (c) => { c.api.boost('slowdown_push', { marketSize: -0.15, marketing: 0.3 }, 18); c.api.note('You kept buying while they stopped.'); } }
    ],
    auto: 'cut'
  },
  {
    id: 'cloud_bill', title: 'Surprise Cloud Bill', weight: 7, expires: 2, minStage: 'seed',
    cond: (s) => s.infra.load > 8,
    text: () => 'A misconfigured job ran all month. The invoice reflects that.',
    choices: [
      { id: 'pay', label: 'Pay it', cost: (s) => Math.max(6000, s.stats.infraDay * 12),
        desc: 'Painful, instant, over with.', apply: (c) => c.api.note('Paid. A budget alert has been configured.') },
      { id: 'optimize', label: 'Emergency optimization sprint', desc: 'Free, but two days of engineering.',
        apply: (c) => { c.api.engPenalty(2); c.api.boost('cloudopt', { infraCost: -0.12 }, 30); c.api.note('Costs down 12% for a month.'); } }
    ],
    auto: 'pay'
  },
  {
    id: 'patent_demand', title: 'Patent Demand Letter', weight: 4, expires: 3, minStage: 'growing',
    text: () => 'A company that makes nothing believes you owe them something.',
    choices: [
      { id: 'settle', label: 'Settle', cost: (s) => Math.max(25000, s.stats.revenueDay * 10), desc: 'Make it go away.',
        apply: (c) => c.api.note('Settled under seal.') },
      { id: 'fight', label: 'Fight it', cost: (s) => Math.max(10000, s.stats.revenueDay * 4),
        desc: 'Cheaper up front, slower, better for reputation if you win.',
        apply: (c) => { if (c.api.chance(0.65)) { c.api.addReputation(0.2); c.api.note('Dismissed. The industry noticed.'); } else { c.api.spend(c.state.stats.revenueDay * 14); c.api.note('You lost, and it cost more than settling.'); } } }
    ],
    auto: 'settle'
  },
  {
    id: 'critical_bug', title: 'Critical Bug', weight: 9, expires: 2, minStage: 'tiny',
    cond: (s) => live(s).length > 0,
    text: (s) => `A data-corrupting edge case in ${(biggest(s) || {}).name || 'the product'} is confirmed reproducible.`,
    choices: [
      { id: 'hotfix', label: 'Hotfix immediately', desc: 'One day of engineering, no customer damage.',
        apply: (c) => { c.api.engPenalty(1); c.api.note('Shipped a fix before support saw a ticket.'); } },
      { id: 'schedule', label: 'Schedule it properly', desc: 'Some churn, some quality loss.',
        apply: (c) => { c.api.churnSpike(0.2, 5); c.api.qualityHit(0.04); c.api.note('It made it into the next release. A few customers left first.'); } },
      { id: 'minigame', label: 'Debug it yourself', minigame: 'debugging', desc: 'Find it fast and take a boost with it.' }
    ],
    auto: 'schedule'
  },
  {
    id: 'accelerator', title: 'Accelerator Invitation', weight: 3, expires: 4, maxStage: 'seed',
    text: () => 'A well-known accelerator has a spot for you in the next batch.',
    choices: [
      { id: 'join', label: 'Join the batch', desc: '$80k and real reputation, for 8% of the company.',
        apply: (c) => { c.api.addCash(80000); c.api.dilute(0.08); c.api.addReputation(0.45); c.api.note('Demo day is in three months.'); } },
      { id: 'decline', label: 'Decline', desc: 'Keep the equity.', apply: (c) => c.api.note('You stayed independent.') }
    ],
    auto: 'decline'
  },
  {
    id: 'renewal', title: 'Contract Renewal', weight: 7, expires: 3, minStage: 'growing',
    cond: (s) => s.contracts.length > 0,
    text: () => 'Your largest contract is up. Their procurement team has discovered leverage.',
    choices: [
      { id: 'hold', label: 'Hold the price', desc: 'Might lose them; keeps the revenue if they stay.',
        apply: (c) => { if (c.api.chance(0.55)) { c.api.dropContract(); c.api.note('They left. Someone undercut you.'); } else c.api.note('They renewed at full price.'); } },
      { id: 'discount', label: 'Discount to keep them', desc: 'Contract shrinks 20% but renews for longer.',
        apply: (c) => { c.api.discountContract(0.2); c.api.note('Renewed at a discount, for three years.'); } },
      { id: 'upsell', label: 'Negotiate an upgrade', minigame: 'negotiation', desc: 'Push for more scope instead of less price.' }
    ],
    auto: 'discount'
  },
  {
    id: 'referral', title: 'Team Referral', weight: 8, expires: 3, minStage: 'tiny',
    cond: (s) => s.employees.length > 1,
    text: () => 'Someone on the team vouches hard for a former colleague.',
    choices: [
      { id: 'accept', label: 'Bring them in', desc: 'Adds a solid candidate, no signing bonus.',
        apply: (c) => { c.api.spawnCandidate({ referral: true }); c.api.note('They are in the hiring list, bonus waived.'); } },
      { id: 'pass', label: 'Not hiring right now', desc: 'Small morale hit.', apply: (c) => c.api.morale(-0.03) }
    ],
    auto: 'accept'
  },
  {
    id: 'acquisition_offer', title: 'Acquisition Offer', weight: 5, expires: 5, minStage: 'scaleup',
    text: () => 'A strategic buyer has put a real number on the table.',
    choices: [
      { id: 'consider', label: 'Open the data room', desc: 'Adds a standing offer you can accept from the Company panel.',
        apply: (c) => { c.api.spawnExitOffer(); c.api.note('The offer is live in the Company panel.'); } },
      { id: 'decline', label: 'Not for sale', desc: 'Reputation up, offer gone.', apply: (c) => c.api.addReputation(0.1) }
    ],
    auto: 'decline'
  }
];

export const eventById = (id) => EVENTS.find((e) => e.id === id);
