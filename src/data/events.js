// Event definitions. Each choice's `apply(ctx)` runs against a small helper API
// (see sim/events.js). `auto` names the choice used when the player ignores the
// event until it expires - always the conservative option.

const live = (s) => s.products.filter((p) => p.stage === 'live');
const consumer = (s) => live(s).filter((p) => ['mobile', 'saas', 'ai'].includes(p.category));
const biggest = (s) => live(s).sort((a, b) => b.revenueDay - a.revenueDay)[0] || null;
const staff = (s) => s.employees.filter((e) => e.id !== 'founder');
const hasManager = (s) => s.employees.some((e) => e.isManager);
const building = (s) => s.products.filter((p) => p.stage !== 'live');
const runwayDays = (s) => (s.stats.netDay < 0 ? s.company.cash / -s.stats.netDay : Infinity);
const rent = (s) => Math.max(1500, s.stats.rentDay * 30);

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
  },
// ---------------------------------------------------------------- people
  {
    id: 'raise_request', title: 'Raise Request', weight: 8, expires: 3, minStage: 'tiny',
    cond: (s) => staff(s).length > 0,
    text: (s) => `${s.pendingEventSubject || 'Someone on the team'} has done the market research on their own salary and would like to discuss it.`,
    choices: [
      { id: 'grant', label: 'Grant the raise', cost: (s) => Math.max(4000, s.stats.payrollDay * 4),
        desc: 'Payroll up 9%, morale up across the team.',
        apply: (c) => { c.api.raiseSalaries(0.09); c.api.morale(0.10); c.api.note('Raises processed. The room relaxed.'); } },
      { id: 'equity', label: 'Offer equity instead of cash', desc: 'Costs no cash, costs 1% of the company.',
        apply: (c) => { c.api.dilute(0.01); c.api.morale(0.06); c.api.note('They took the paper. Cash is intact.'); } },
      { id: 'defer', label: 'Revisit at the next review', desc: 'Free, small morale cost.',
        apply: (c) => { c.api.morale(-0.05); c.api.note('Deferred to the next cycle. They noted the date.'); } }
    ],
    auto: 'defer'
  },
  {
    id: 'promotion', title: 'Promotion Case', weight: 7, expires: 3, minStage: 'growing',
    cond: (s) => staff(s).length >= 5,
    text: (s) => `${s.pendingEventSubject || 'One of your seniors'} has been doing the next job up for two quarters without the title.`,
    choices: [
      { id: 'promote', label: 'Promote them', cost: (s) => Math.max(8000, s.stats.payrollDay * 3),
        desc: 'Retention and morale up; payroll up with it.',
        apply: (c) => { c.api.retainEmployee(0.14); c.api.morale(0.10); c.api.boost('promo', { staffChurn: -0.15 }, 45); c.api.note('Announced on Monday. Nobody was surprised.'); } },
      { id: 'scope', label: 'More scope, same title', desc: 'Free now, they may look elsewhere.',
        apply: (c) => { c.api.morale(-0.04); c.api.boost('scope_creep', { staffChurn: 0.10 }, 30); c.api.note('They took the scope. The title conversation is not over.'); } }
    ],
    auto: 'scope'
  },
  {
    id: 'dept_transfer', title: 'Transfer Request', weight: 6, expires: 3, minStage: 'growing',
    cond: (s) => hasManager(s) && staff(s).length >= 6,
    text: (s) => `${s.pendingEventSubject || 'One of your team'} wants to move to a different department.`,
    choices: [
      { id: 'approve', label: 'Approve the move', desc: 'Morale up; a few slow weeks while they ramp.',
        apply: (c) => { c.api.morale(0.07); c.api.boost('ramping', { devSpeed: -0.08 }, 14); c.api.note('They start in the new team on Monday.'); } },
      { id: 'hold', label: 'Hold them where they are', desc: 'No disruption, and one unhappy person.',
        apply: (c) => { c.api.morale(-0.06); c.api.boost('blocked_transfer', { staffChurn: 0.12 }, 30); c.api.note('Request denied. Noted in their file, and in theirs.'); } }
    ],
    auto: 'approve'
  },
  {
    id: 'manager_conflict', title: 'Management Friction', weight: 6, expires: 3, minStage: 'growing',
    cond: (s) => hasManager(s) && staff(s).length >= 6,
    text: () => 'Two of your managers have been running the same project in two different directions.',
    choices: [
      { id: 'mediate', label: 'Mediate it properly', cost: (s) => Math.max(3000, s.stats.expenseDay * 0.8),
        desc: 'A day of everyone senior in a room. It holds.',
        apply: (c) => { c.api.morale(0.08); c.api.engPenalty(0.6); c.api.boost('aligned', { managerBonus: 0.10 }, 30); c.api.note('One owner, one plan, written down.'); } },
      { id: 'pick', label: 'Pick a side and move on', desc: 'Fast, and half the room remembers it.',
        apply: (c) => { c.api.morale(-0.06); c.api.note('A decision was made. It was not popular.'); } }
    ],
    auto: 'mediate'
  },
  {
    id: 'feature_request', title: 'Customers Want One Thing', weight: 8, expires: 3, minStage: 'seed',
    cond: (s) => live(s).length > 0,
    text: () => 'The same feature request has now arrived from a third of your accounts.',
    choices: [
      { id: 'build', label: 'Put it at the front of the queue', desc: 'Queues priority work; other plans slip.',
        apply: (c) => { c.api.queuePriority('feature'); c.api.boost('reprioritised', { devSpeed: -0.06 }, 10); c.api.note('It is at the top of the board.'); } },
      { id: 'roadmap', label: 'Roadmap it honestly', desc: 'No disruption, some churn from the impatient.',
        apply: (c) => { c.api.churnSpike(0.08, 10); c.api.note('Published a date. Most of them waited.'); } }
    ],
    auto: 'roadmap'
  },
  {
    id: 'launch_delay', title: 'The Date Is Slipping', weight: 8, expires: 2, minStage: 'tiny',
    cond: (s) => building(s).length > 0,
    text: () => 'The launch date was picked optimistically and the build disagrees.',
    choices: [
      { id: 'ship', label: 'Ship on the date anyway', desc: 'Hits the date, ships the debt with it.',
        apply: (c) => { c.api.boost('shipped_hot', { debtRate: 0.25, devSpeed: 0.15 }, 14); c.api.qualityHit(0.03); c.api.note('It went out on time. The backlog grew.'); } },
      { id: 'slip', label: 'Move the date and say so', desc: 'Small reputation cost, a better product.',
        apply: (c) => { c.api.addReputation(-0.05); c.api.boost('breathing_room', { projectQuality: 0.15 }, 14); c.api.note('New date announced. Nobody rioted.'); } }
    ],
    auto: 'slip'
  },
  {
    id: 'copycat', title: 'They Copied The Feature', weight: 7, expires: 3, minStage: 'growing',
    cond: (s) => live(s).length > 0,
    text: (s) => `${s.pendingEventSubject || 'A rival'} shipped your best feature, badly, with a better landing page.`,
    choices: [
      { id: 'deepen', label: 'Go two versions deeper', desc: 'Engineering time now, a real moat after.',
        apply: (c) => { c.api.queuePriority('feature'); c.api.boost('moat', { quality: 0.06, churn: -0.10 }, 30); c.api.note('They can copy the screenshot, not the depth.'); } },
      { id: 'market', label: 'Outspend them on the story', cost: (s) => Math.max(6000, s.stats.revenueDay * 2.5),
        desc: 'Buy the narrative while it is still yours.',
        apply: (c) => { c.api.addReputation(0.12); c.api.boost('narrative', { marketing: 0.2 }, 21); c.api.note('You were the original, loudly, for three weeks.'); } },
      { id: 'shrug', label: 'Let the work speak', desc: 'Free. They take a little share.',
        apply: (c) => { c.api.rivalShare(0.03); c.api.note('No response. A few deals went the other way.'); } }
    ],
    auto: 'shrug'
  },
  {
    id: 'churn_risk', title: 'A Big Account Is Wobbling', weight: 8, expires: 3, minStage: 'growing',
    cond: (s) => s.contracts.length > 0,
    text: () => 'Your largest customer has stopped answering, and their usage chart is pointing down.',
    choices: [
      { id: 'exec', label: 'Fly out and fix it in person', cost: (s) => Math.max(9000, s.stats.revenueDay * 3),
        desc: 'Expensive, usually works.',
        apply: (c) => { if (c.api.chance(0.8)) { c.api.discountContract(0.05); c.api.note('Saved, on a longer term, for slightly less.'); } else { c.api.dropContract(); c.api.note('They had already signed elsewhere.'); } } },
      { id: 'credits', label: 'Offer service credits', desc: 'Cheaper, shrinks the contract.',
        apply: (c) => { c.api.discountContract(0.12); c.api.note('Credits applied. They renewed quietly.'); } },
      { id: 'wait', label: 'Give them space', desc: 'Free, and roughly a coin flip.',
        apply: (c) => { if (c.api.chance(0.45)) { c.api.dropContract(); c.api.note('They churned at the end of the term.'); } else c.api.note('They came back on their own.'); } }
    ],
    auto: 'credits'
  },
  {
    id: 'referral_surge', title: 'Referrals Are Compounding', weight: 6, expires: 2, minStage: 'seed',
    cond: (s) => live(s).length > 0,
    text: () => 'Existing customers are bringing in new ones faster than your ads are.',
    choices: [
      { id: 'reward', label: 'Fund a referral programme', cost: (s) => Math.max(4000, s.stats.revenueDay * 1.5),
        desc: 'Buy the loop while it is running.',
        apply: (c) => { c.api.boost('referral', { conversion: 0.18, marketing: 0.1 }, 21); c.api.note('The loop kept turning for three weeks.'); } },
      { id: 'thanks', label: 'Just thank them publicly', desc: 'Free, smaller, still real.',
        apply: (c) => { c.api.addReputation(0.08); c.api.boost('thanks', { conversion: 0.06 }, 14); c.api.note('A nice note went out. Some of them shared it.'); } }
    ],
    auto: 'thanks'
  },
  {
    id: 'support_backlog', title: 'The Queue Is Not Moving', weight: 7, expires: 2.5, minStage: 'seed',
    cond: (s) => s.stats.customers > 40,
    text: () => 'The support queue has been growing for a week and first-response time shows it.',
    choices: [
      { id: 'contractors', label: 'Bring in contract support', cost: (s) => Math.max(5000, s.stats.expenseDay * 2),
        desc: 'Clears the queue this month, costs cash.',
        apply: (c) => { c.api.boost('surge_support', { support: 0.4 }, 30); c.api.note('Queue cleared. The contractors were good.'); } },
      { id: 'deflect', label: 'Write the answers down instead', desc: 'Engineering time now, permanent deflection after.',
        apply: (c) => { c.api.engPenalty(0.8); c.api.boost('self_serve', { support: 0.18 }, 60); c.api.note('Half the tickets stopped being tickets.'); } },
      { id: 'absorb', label: 'Work through it', desc: 'Free. Churn ticks up while it clears.',
        apply: (c) => { c.api.churnSpike(0.1, 8); c.api.morale(-0.04); c.api.note('It cleared eventually. A few customers did not wait.'); } }
    ],
    auto: 'deflect'
  },
  {
    id: 'account_expansion', title: 'A Small Account Got Big', weight: 6, expires: 3, minStage: 'growing',
    cond: (s) => s.contracts.length > 0,
    text: () => 'A customer you barely noticed has quietly grown into one of your largest users.',
    choices: [
      { id: 'upsell', label: 'Move them onto a real contract', desc: 'A second contract, at a modest size.',
        apply: (c) => { c.api.addContract({ sizeMul: 0.9, sla: false }); c.api.note('Signed and onboarded properly.'); } },
      { id: 'sla', label: 'Push for the enterprise tier', desc: 'Bigger, with SLA penalties attached.',
        apply: (c) => { c.api.addContract({ sizeMul: 1.4, sla: true }); c.api.note('Larger contract, tighter obligations.'); } },
      { id: 'leave', label: 'Leave them alone', desc: 'Free. They stay happy and small.',
        apply: (c) => { c.api.addReputation(0.04); c.api.note('No change. They kept growing anyway.'); } }
    ],
    auto: 'leave'
  },
  {
    id: 'bridge_round', title: 'Bridge Offer', weight: 6, expires: 3, minStage: 'seed',
    cond: (s) => runwayDays(s) < 120 && s.funding.offers.length === 0,
    text: () => 'An existing backer will bridge you to the next round, on bridge terms.',
    choices: [
      { id: 'take', label: 'Take the bridge', desc: 'Cash now, 5% of the company.',
        apply: (c) => { c.api.addCash(Math.max(120000, c.state.stats.expenseDay * 90)); c.api.dilute(0.05); c.api.note('Wired same week. Runway extended.'); } },
      { id: 'cut', label: 'Extend runway by cutting spend', desc: 'Keeps the equity, halves marketing.',
        apply: (c) => { c.api.halveMarketing(); c.api.boost('austerity', { marketSize: -0.1, payroll: -0.04 }, 30); c.api.note('Belt tightened. Growth flattened.'); } }
    ],
    auto: 'cut'
  },
  {
    id: 'term_sheet', title: 'A Clean Term Sheet', weight: 6, expires: 4, minStage: 'growing',
    cond: (s) => s.funding.offers.length === 0,
    text: () => 'A fund you actually like has sent a term sheet with no unusual clauses in it.',
    choices: [
      { id: 'take', label: 'Take the meeting and the terms', desc: 'A funding offer at a 20% better valuation.',
        apply: (c) => { c.api.spawnFundingOffer(1.20); c.api.note('The offer is waiting in Finance.'); } },
      { id: 'shop', label: 'Shop it for a better number', desc: 'Might improve it, might lose it.',
        apply: (c) => { if (c.api.chance(0.5)) { c.api.spawnFundingOffer(1.35); c.api.note('The second fund bid it up.'); } else { c.api.addReputation(-0.04); c.api.note('They pulled it. Word travels.'); } } },
      { id: 'pass', label: 'Not raising right now', desc: 'Keep control.', apply: (c) => c.api.note('You told them the timing was wrong.') }
    ],
    auto: 'pass'
  },
  {
    id: 'strategic_investor', title: 'Strategic Investor', weight: 5, expires: 4, minStage: 'scaleup',
    text: () => 'A large company in an adjacent market wants to invest, and to be told about your roadmap.',
    choices: [
      { id: 'take', label: 'Take the strategic money', desc: 'Cash and distribution, for 8% and less independence.',
        apply: (c) => { c.api.addCash(Math.max(1e6, c.state.stats.revenueDay * 120)); c.api.dilute(0.08); c.api.boost('strategic', { sales: 0.2, marketSize: 0.1 }, 90); c.api.note('Their sales team now mentions you in deals.'); } },
      { id: 'partner', label: 'Partnership without the investment', desc: 'No dilution, a smaller upside.',
        apply: (c) => { c.api.boost('partner_lite', { sales: 0.1 }, 60); c.api.note('A commercial agreement, no cap table changes.'); } },
      { id: 'decline', label: 'Stay independent', desc: 'Reputation up with the other funds.',
        apply: (c) => c.api.addReputation(0.08) }
    ],
    auto: 'decline'
  },
  {
    id: 'competitor_layoffs', title: 'Rival Layoffs', weight: 6, expires: 3, minStage: 'growing',
    text: (s) => `${s.pendingEventSubject || 'A rival'} just cut a third of their staff, and the list is circulating.`,
    choices: [
      { id: 'recruit', label: 'Call their best people', cost: (s) => Math.max(6000, s.stats.payrollDay * 2),
        desc: 'Adds a strong candidate while the market is soft.',
        apply: (c) => { c.api.spawnCandidate({ star: true }); c.api.note('Two good conversations, one in the pipeline.'); } },
      { id: 'customers', label: 'Go after their customers instead', desc: 'Take share while they are distracted.',
        apply: (c) => { c.api.stealShare(0.05); c.api.note('Their accounts started taking meetings.'); } },
      { id: 'nothing', label: 'Stay out of it', desc: 'Free. It is a bad week for people you know.',
        apply: (c) => c.api.addReputation(0.03) }
    ],
    auto: 'nothing'
  },
  {
    id: 'competitor_price_cut', title: 'Rival Price Cut', weight: 7, expires: 3, minStage: 'seed',
    cond: (s) => live(s).length > 0,
    text: (s) => `${s.pendingEventSubject || 'A rival'} has cut their price by a third and is emailing your customers about it.`,
    choices: [
      { id: 'match', label: 'Match the price', desc: 'Holds customers, costs revenue for a month.',
        apply: (c) => { c.api.boost('match_price', { revenue: -0.14, churn: -0.3 }, 30); c.api.note('Prices matched. Nobody left.'); } },
      { id: 'value', label: 'Compete on value instead', desc: 'Keeps the price, some churn at the low end.',
        apply: (c) => { c.api.churnSpike(0.12, 14); c.api.addReputation(0.05); c.api.note('You held the line. The cheap accounts went.'); } }
    ],
    auto: 'value'
  },
  {
    id: 'competitor_acquired', title: 'Rival Gets Acquired', weight: 5, expires: 3, minStage: 'scaleup',
    text: (s) => `${s.pendingEventSubject || 'A rival'} has been bought. Their customers are reading the integration FAQ with suspicion.`,
    choices: [
      { id: 'migrate', label: 'Fund a migration offer', cost: (s) => Math.max(20000, s.stats.revenueDay * 4),
        desc: 'Pay to move their unhappy accounts over.',
        apply: (c) => { c.api.stealShare(0.09); c.api.note('A steady stream of migrations, all quarter.'); } },
      { id: 'hire', label: 'Recruit the people who are leaving', desc: 'Free, adds a strong candidate.',
        apply: (c) => { c.api.spawnCandidate({ star: true }); c.api.note('Post-acquisition vesting does wonders for recruiting.'); } }
    ],
    auto: 'hire'
  },
  {
    id: 'ai_demand', title: 'AI Demand Boom', weight: 6, expires: 2, minStage: 'seed',
    text: () => 'Every buyer in your category suddenly has budget, provided the word "AI" appears somewhere.',
    choices: [
      { id: 'build', label: 'Ship something real', desc: 'Queues AI work; slower, durable.',
        apply: (c) => { c.api.queuePriority('aifeature'); c.api.boost('ai_demand', { marketSize: 0.2 }, 30); c.api.note('Engineering is building the actual thing.'); } },
      { id: 'position', label: 'Reposition the marketing', cost: (s) => Math.max(4000, s.stats.revenueDay * 1.5),
        desc: 'Fast growth now, a credibility bill later.',
        apply: (c) => { c.api.boost('ai_positioning', { marketing: 0.3, marketSize: 0.15 }, 21); if (c.api.chance(0.35)) c.api.addReputation(-0.08); c.api.note('The homepage changed. The product mostly did not.'); } },
      { id: 'ignore', label: 'Stay on message', desc: 'Free. A small, honest amount of growth.',
        apply: (c) => { c.api.boost('steady', { marketSize: 0.06 }, 21); c.api.note('You sold the same thing, to fewer people, more convincingly.'); } }
    ],
    auto: 'ignore'
  },
  {
    id: 'security_scare', title: 'Industry Security Scare', weight: 6, expires: 3, minStage: 'growing',
    text: () => 'A company like yours was breached badly, and now every customer wants your security posture in writing.',
    choices: [
      { id: 'audit', label: 'Commission a real audit', cost: (s) => Math.max(15000, s.stats.revenueDay * 4),
        desc: 'Expensive, and the answer is defensible.',
        apply: (c) => { c.api.security(0.12); c.api.addReputation(0.1); c.api.note('Audited, remediated, and the report closes deals.'); } },
      { id: 'harden', label: 'Queue security work yourselves', desc: 'Engineering time instead of cash.',
        apply: (c) => { c.api.queuePriority('security'); c.api.security(0.06); c.api.note('The obvious gaps are closed.'); } },
      { id: 'respond', label: 'Answer the questionnaires', desc: 'Free. Support spends the week on paperwork.',
        apply: (c) => { c.api.boost('questionnaires', { support: -0.12 }, 14); c.api.note('Forty spreadsheets returned. Nothing changed technically.'); } }
    ],
    auto: 'harden'
  },
  {
    id: 'policy_shift', title: 'Platform Policy Change', weight: 5, expires: 3, minStage: 'major',
    text: () => 'A platform you depend on has rewritten the rules, and a regulator is taking an interest in the category.',
    choices: [
      { id: 'comply', label: 'Comply early and loudly', cost: (s) => Math.max(40000, s.stats.revenueDay * 6),
        desc: 'Costly, and it becomes a selling point.',
        apply: (c) => { c.api.addReputation(0.14); c.api.boost('compliant', { enterpriseConv: 0.12 }, 90); c.api.note('First in the category to be compliant. Sales noticed.'); } },
      { id: 'minimum', label: 'Do the minimum required', desc: 'Free, some engineering drag, some risk.',
        apply: (c) => { c.api.boost('compliance_drag', { devSpeed: -0.08 }, 30); if (c.api.chance(0.25)) c.api.addReputation(-0.08); c.api.note('Checked the boxes. Moved on.'); } }
    ],
    auto: 'minimum'
  },

  // -------------------------------------------------------------- office
  {
    id: 'rent_increase', title: 'The Landlord Called', weight: 6, expires: 3, minStage: 'seed',
    cond: (s) => s.office.tier !== 'garage',
    text: () => 'Your lease is up for renewal and the new number is meaningfully larger.',
    choices: [
      { id: 'renew', label: 'Sign the renewal', cost: (s) => rent(s),
        desc: 'Pay the increase, nobody has to move.',
        apply: (c) => { c.api.note('Signed for another term. Nothing else changes.'); } },
      { id: 'negotiate', label: 'Negotiate a longer term', desc: 'Free, and you are committed for longer.',
        apply: (c) => { if (c.api.chance(0.7)) { c.api.boost('lease_deal', { payroll: -0.02 }, 90); c.api.note('Flat rent for three years, signed.'); } else c.api.note('They would not move. The increase stands.'); } },
      { id: 'remote', label: 'Shrink the footprint', desc: 'Saves money, costs some morale.',
        apply: (c) => { c.api.morale(-0.07); c.api.boost('hot_desking', { payroll: -0.04 }, 90); c.api.note('Half the desks went. So did half the rent.'); } }
    ],
    auto: 'negotiate'
  },
  {
    id: 'equipment_failure', title: 'Equipment Failure', weight: 5, expires: 2, minStage: 'tiny',
    text: () => 'Several machines have died in the same week, and they were not young.',
    choices: [
      { id: 'replace', label: 'Replace the fleet', cost: (s) => Math.max(4000, s.stats.payrollDay * 2),
        desc: 'Faster machines, happier people.',
        apply: (c) => { c.api.boost('new_kit', { devSpeed: 0.08 }, 60); c.api.morale(0.05); c.api.note('New machines all round.'); } },
      { id: 'patch', label: 'Repair what you can', desc: 'Free, and everything stays slow.',
        apply: (c) => { c.api.boost('old_kit', { devSpeed: -0.05 }, 30); c.api.note('Repaired. The fans are still loud.'); } }
    ],
    auto: 'patch'
  },
  {
    id: 'amenity_request', title: 'The Team Wants Something', weight: 5, expires: 3, minStage: 'seed',
    cond: (s) => s.office.rooms.length > 0,
    text: () => 'There is a petition, half-joking, for a real coffee machine and somewhere to sit that is not a desk.',
    choices: [
      { id: 'fund', label: 'Fund it properly', cost: (s) => Math.max(3000, s.stats.payrollDay),
        desc: 'Morale and retention up for a quarter.',
        apply: (c) => { c.api.morale(0.10); c.api.boost('amenities', { staffChurn: -0.12, moraleGain: 0.03 }, 90); c.api.note('It cost less than one resignation.'); } },
      { id: 'partial', label: 'Buy the coffee machine only', desc: 'Cheap, and it does count.',
        apply: (c) => { c.api.spend(600); c.api.morale(0.04); c.api.note('The machine is good. The petition continues.'); } }
    ],
    auto: 'partial'
  },

  // ------------------------------------------------------- opportunities
  {
    id: 'conference_invite', title: 'Conference Keynote', weight: 6, expires: 3, minStage: 'seed',
    text: () => 'The main industry conference wants you on stage for twenty minutes.',
    choices: [
      { id: 'speak', label: 'Take the keynote', cost: (s) => Math.max(3000, s.stats.revenueDay),
        desc: 'Reputation and pipeline, and a week of preparation.',
        apply: (c) => { c.api.addReputation(0.25); c.api.engPenalty(0.8); c.api.boost('keynote', { marketing: 0.15 }, 21); c.api.note('The talk went well. The inbound was better.'); } },
      { id: 'booth', label: 'Send the sales team instead', cost: (s) => Math.max(2000, s.stats.revenueDay * 0.8),
        desc: 'Less reputation, more pipeline, no founder time.',
        apply: (c) => { c.api.boost('booth', { sales: 0.15 }, 21); c.api.note('Four hundred badge scans, thirty of them real.'); } },
      { id: 'skip', label: 'Skip it', desc: 'Free. Keep shipping.', apply: (c) => c.api.note('You stayed home and shipped.') }
    ],
    auto: 'skip'
  },
  {
    id: 'partnership', title: 'Integration Partnership', weight: 6, expires: 4, minStage: 'growing',
    cond: (s) => live(s).length > 0,
    text: () => 'A larger company wants to build a deep integration, and to be first in the marketplace listing.',
    choices: [
      { id: 'deep', label: 'Build the deep integration', desc: 'Engineering time, real distribution after.',
        apply: (c) => { c.api.queuePriority('feature'); c.api.boost('integration', { marketSize: 0.15, sales: 0.12 }, 90); c.api.note('Listed, featured, and shipping mutual customers.'); } },
      { id: 'shallow', label: 'Ship a basic connector', desc: 'Cheap, smaller upside.',
        apply: (c) => { c.api.boost('connector', { marketSize: 0.05 }, 45); c.api.note('It works. It is not exciting.'); } },
      { id: 'decline', label: 'Decline', desc: 'Stay focused.', apply: (c) => c.api.note('Politely declined. The roadmap is untouched.') }
    ],
    auto: 'shallow'
  },
  {
    id: 'institutional_contract', title: 'Public Sector Tender', weight: 5, expires: 4, minStage: 'scaleup',
    text: () => 'A government department has opened a tender you could plausibly win, with a procurement process to match.',
    choices: [
      { id: 'bid', label: 'Bid properly', cost: (s) => Math.max(30000, s.stats.revenueDay * 5),
        desc: 'Months of paperwork for a very large contract.',
        apply: (c) => { if (c.api.chance(0.55)) { c.api.addContract({ sizeMul: 2.2, sla: true }); c.api.addReputation(0.12); } else c.api.note('You lost on a scoring criterion nobody understood.'); } },
      { id: 'partner', label: 'Subcontract under a prime', desc: 'Smaller, cheaper, much likelier.',
        apply: (c) => { c.api.addContract({ sizeMul: 0.9, sla: true }); c.api.note('Signed under someone else’s name on the paperwork.'); } },
      { id: 'skip', label: 'Not this one', desc: 'Free.', apply: (c) => c.api.note('You left the tender alone.') }
    ],
    auto: 'skip'
  },
  {
    id: 'creator_endorsement', title: 'A Creator Likes You', weight: 6, expires: 2.5, minStage: 'tiny',
    cond: (s) => consumer(s).length > 0,
    text: () => 'Someone with a large, genuinely engaged audience uses your product daily and has offered to say so.',
    choices: [
      { id: 'sponsor', label: 'Sponsor them properly', cost: (s) => Math.max(4000, s.stats.revenueDay * 1.5),
        desc: 'Paid, disclosed, and effective.',
        apply: (c) => { const p = consumer(c.state)[0]; if (p) c.api.addUsers(p, p.users * 0.2 + 2000); c.api.addReputation(0.08); c.api.note('The video did numbers. So did sign-ups.'); } },
      { id: 'gift', label: 'Send them a free account and say thanks', desc: 'Free, smaller, more credible.',
        apply: (c) => { const p = consumer(c.state)[0]; if (p) c.api.addUsers(p, p.users * 0.07 + 500); c.api.addReputation(0.05); c.api.note('They posted anyway, unpaid, which landed better.'); } }
    ],
    auto: 'gift'
  },
  {
    id: 'acquisition_target', title: 'Something Worth Buying', weight: 5, expires: 4, minStage: 'scaleup',
    text: () => 'A small team with a good product and no runway would rather join you than shut down.',
    choices: [
      { id: 'acquihire', label: 'Buy the team', cost: (s) => Math.max(250000, s.stats.revenueDay * 30),
        desc: 'Adds strong people; the product gets shelved.',
        apply: (c) => { c.api.spawnCandidate({ star: true }); c.api.spawnCandidate({ star: true, referral: true }); c.api.morale(0.04); c.api.note('Four engineers, one shelved product, one good week.'); } },
      { id: 'tech', label: 'Buy the technology only', cost: (s) => Math.max(120000, s.stats.revenueDay * 12),
        desc: 'Cheaper; a lasting product boost.',
        apply: (c) => { c.api.boost('acquired_tech', { quality: 0.06, devSpeed: 0.08 }, 120); c.api.note('Integrated in a month. Worth it.'); } },
      { id: 'pass', label: 'Pass', desc: 'Free.', apply: (c) => c.api.note('They wound down. Two of them emailed about jobs.') }
    ],
    auto: 'pass'
  },
  {
    id: 'ipo_prep', title: 'Bankers With A Timeline', weight: 5, expires: 5, minStage: 'late',
    text: () => 'Two banks have independently suggested that the window is open and you should be ready for it.',
    choices: [
      { id: 'prepare', label: 'Start the preparation', cost: (s) => Math.max(2e6, s.stats.revenueDay * 20),
        desc: 'Audits, controls and reporting. Slows product, raises the valuation.',
        apply: (c) => { c.api.boost('ipo_prep', { valuation: 0.12, devSpeed: -0.1 }, 180); c.api.addReputation(0.15); c.api.note('Finance has doubled in size and nobody is having fun.'); } },
      { id: 'later', label: 'Stay private for now', desc: 'Free. Keep optionality.',
        apply: (c) => c.api.note('You told them to call when the numbers are bigger.') }
    ],
    auto: 'later'
  },
  {
    id: 'international', title: 'International Expansion', weight: 5, expires: 4, minStage: 'major',
    text: () => 'Two regions are signing up despite having no localisation, no local billing and no support hours.',
    choices: [
      { id: 'invest', label: 'Open a real regional presence', cost: (s) => Math.max(800000, s.stats.revenueDay * 15),
        desc: 'Expensive, and the market gets meaningfully bigger.',
        apply: (c) => { c.api.boost('intl', { marketSize: 0.3, support: -0.08 }, 180); c.api.note('Two offices, local billing, and a support rota that spans time zones.'); } },
      { id: 'light', label: 'Localise the product only', desc: 'Cheaper, smaller, no operational burden.',
        apply: (c) => { c.api.queuePriority('feature'); c.api.boost('localised', { marketSize: 0.12 }, 120); c.api.note('Translated and re-priced. Growth followed, slowly.'); } },
      { id: 'wait', label: 'Serve them as-is', desc: 'Free. They keep signing up regardless.',
        apply: (c) => { c.api.churnSpike(0.06, 20); c.api.note('They kept coming, and some of them kept leaving.'); } }
    ],
    auto: 'wait'
  }
];

export const eventById = (id) => EVENTS.find((e) => e.id === id);
