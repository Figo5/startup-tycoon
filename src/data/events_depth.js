// The depth pass event batch. Same shape as data/events.js, plus:
//   subject(state)  picks who or what the event is about: { name, id, data }
//   chainOnly       never drawn at random; only scheduled by an earlier choice
//   trigger         never drawn at random; spawned by TRIGGERS below
//   show(state, p)  hides a choice that makes no sense right now
// Text receives (state, pending) so it can name the people involved.
//
// Most of these are about a person, a rival or a product rather than a number,
// and several have follow-ups that arrive days later. The conservative `auto`
// choice is always survivable.

const live = (s) => s.products.filter((p) => p.stage === 'live');
const biggest = (s) => live(s).sort((a, b) => b.revenueDay - a.revenueDay)[0] || null;
const staff = (s) => s.employees.filter((e) => e.id !== 'founder');
const withTrait = (s, id) => staff(s).filter((e) => Array.isArray(e.traits) && e.traits.includes(id));
const best = (arr) => arr.slice().sort((a, b) => b.skill - a.skill)[0] || null;
const who = (e) => (e ? { name: e.name, id: e.id } : null);
const alive = (s) => s.competitors.filter((c) => c.alive && !c.acquired);
const rivalIn = (s) => {
  const mine = new Set(live(s).map((p) => p.category));
  const inMine = alive(s).filter((c) => c.markets.some((m) => mine.has(m)));
  return (inMine.length ? inMine : alive(s)).sort((a, b) => b.strength - a.strength)[0] || null;
};
const nem = (s) => alive(s).find((c) => c.id === s.rivalState?.nemesis) || null;
const rivalSubj = (c) => (c ? { name: c.name, data: { rivalId: c.id } } : null);
const P = (s) => s.pendingEvent || {};
const nm = (s) => s.pendingEventSubject || 'Someone';
const payrollDays = (s, d) => Math.max(3000, s.stats.payrollDay * d);
const revDays = (s, d, floor = 5000) => Math.max(floor, s.stats.revenueDay * d);
const catName = (id) => ({ mobile: 'consumer mobile', saas: 'SaaS', devtool: 'developer tools', b2b: 'B2B',
  ai: 'AI', enterprise: 'enterprise', games: 'games', fintech: 'fintech', social: 'social', services: 'services' }[id] || id);

export const DEPTH_EVENTS = [
  // ================================================================ people
  {
    id: 'genius_vanished', cat: 'people', title: 'The Genius Has Gone Quiet', weight: 5, expires: 3, minStage: 'tiny',
    cond: (s) => withTrait(s, 'genius').length > 0 && live(s).length > 0,
    subject: (s) => who(withTrait(s, 'genius')[0]),
    text: (s) => `${nm(s)} has not been seen in three days. Their commits say they are rewriting the core of ${(biggest(s) || {}).name || 'the product'} over a weekend.`,
    choices: [
      { id: 'cook', label: 'Let them cook', desc: 'Could be brilliant. Could be a very large pile of debt.',
        apply: (c) => { c.api.chain('genius_return', 4); c.api.note('You told everyone to leave them alone.'); } },
      { id: 'recall', label: 'Pull them back to the roadmap', desc: 'Safe. They will be annoyed.',
        apply: (c) => { c.api.moraleOf(c.api.employee(), -0.12); c.api.note('They came back. They are sulking in a meeting room.'); } }
    ],
    auto: 'recall'
  },
  {
    id: 'genius_return', cat: 'people', title: 'The Rewrite Is In', weight: 1, expires: 3, chainOnly: true,
    text: (s) => `${nm(s)} resurfaced with a pull request touching every file in the repository.`,
    choices: [
      { id: 'merge', label: 'Merge it', desc: 'Find out.',
        apply: (c) => {
          const p = c.api.product(); const e = c.api.employee();
          if (c.api.chance(0.55)) {
            if (p) { p.quality = Math.min(1, p.quality + 0.12); p.techDebt = Math.max(0, p.techDebt - 0.25); }
            c.api.story(e, 'Rewrote the core in a weekend. It worked.');
            c.api.note('It works. It is faster, cleaner and nobody quite understands it.');
          } else {
            if (p) p.techDebt = Math.min(3, p.techDebt + 0.3);
            c.api.story(e, 'Rewrote the core in a weekend. It did not work.');
            c.api.note('It compiles. That is the best thing anyone can say about it.');
          }
        } },
      { id: 'shelve', label: 'Keep it on a branch', desc: 'Admire it from a distance.',
        apply: (c) => { c.api.moraleOf(c.api.employee(), -0.06); c.api.note('The branch is called "someday".'); } }
    ],
    auto: 'shelve'
  },
  {
    id: 'burnout_warning', cat: 'people', title: 'Running On Fumes', weight: 7, expires: 2.5, minStage: 'tiny',
    cond: (s) => staff(s).some((e) => (e.energy ?? 0.9) < 0.32 && !((e.leaveUntil || 0) > s.time.day)),
    subject: (s) => who(staff(s).filter((e) => (e.energy ?? 0.9) < 0.32 && !((e.leaveUntil || 0) > s.time.day)).sort((a, b) => b.skill - a.skill)[0]),
    text: (s) => `${nm(s)} fell asleep in stand-up. Twice.`,
    choices: [
      { id: 'leave', label: 'Send them home for a week', desc: 'No output from them for 7 days. They come back whole.',
        apply: (c) => { const e = c.api.employee(); c.api.leave(e, 7); c.api.moraleOf(e, 0.1); c.api.note('They argued, then went.'); } },
      { id: 'ease', label: 'Ease the whole company off', desc: 'Switch the company to a Sustainable pace.',
        apply: (c) => { c.api.setPace('relaxed'); c.api.morale(0.04); c.api.note('Everyone is going home at six. It feels strange.'); } },
      { id: 'push', label: 'We need them for the launch', desc: 'They keep going. They might not keep going for long.',
        apply: (c) => { const e = c.api.employee(); c.api.energyOf(e, -0.08); if (c.api.chance(0.4)) c.api.chain('burnout_quit', 6); c.api.note('They nodded and went back to their desk.'); } }
    ],
    auto: 'leave'
  },
  {
    id: 'burnout_quit', cat: 'people', title: 'Resignation, Effective Immediately', weight: 1, expires: 1.5, chainOnly: true,
    cond: (s, x) => s.employees.some((e) => e.id === x?.subjectId),
    text: (s) => `${nm(s)} resigned by email at 3am. "I have nothing left."`,
    choices: [
      { id: 'accept', label: 'Accept it, with a good reference', desc: 'You lose them. The team notices how you handle it.',
        apply: (c) => { c.api.lose(c.api.employee()); c.api.morale(0.02); c.api.note('You wrote the reference yourself.'); } },
      { id: 'sabbatical', label: 'Offer a paid sabbatical instead', cost: (s) => payrollDays(s, 3),
        desc: 'A month away, fully paid. They might come back.',
        apply: (c) => { const e = c.api.employee(); if (c.api.chance(0.7)) { c.api.leave(e, 20); c.api.addTrait(e, 'loyal'); c.api.story(e, 'Came back from a sabbatical'); c.api.note('They took it, and promised to come back.'); } else { c.api.lose(e); c.api.note('They thanked you and left anyway.'); } } }
    ],
    auto: 'accept'
  },
  {
    id: 'competing_offer', cat: 'people', title: 'A Competing Offer', weight: 6, expires: 2.5, minStage: 'seed',
    cond: (s) => staff(s).length >= 4 && alive(s).length > 0,
    subject: (s) => {
      const e = best(staff(s).filter((x) => !(x.traits || []).includes('loyal')));
      const r = rivalIn(s);
      return e && r ? { name: e.name, id: e.id, data: { rivalId: r.id } } : null;
    },
    text: (s) => { const r = s.competitors.find((c) => c.id === P(s).data?.rivalId); return `${nm(s)}, one of your strongest people, has an offer from ${r?.name || 'a rival'} for 40% more.`; },
    choices: [
      { id: 'match', label: 'Match it', desc: 'A 25% raise. They stay, and they remember.',
        apply: (c) => { const e = c.api.employee(); c.api.raiseOf(e, 0.25); c.api.moraleOf(e, 0.15); c.api.story(e, `Turned down ${c.api.rival()?.name || 'a rival'}`); c.api.note('They stayed.'); } },
      { id: 'mission', label: 'Appeal to the mission', desc: 'Free. Works on people who are happy here.',
        apply: (c) => { const e = c.api.employee(); if (e && e.morale > 0.72 && c.api.chance(0.75)) { c.api.addTrait(e, 'loyal'); c.api.story(e, 'Stayed for the mission'); c.api.note('They stayed, and seemed to mean it.'); } else { c.api.lose(e, c.api.rival()); } } },
      { id: 'go', label: 'Let them go', desc: 'They join the rival.',
        apply: (c) => c.api.lose(c.api.employee(), c.api.rival()) }
    ],
    auto: 'match'
  },
  {
    id: 'side_project', cat: 'people', title: 'A Weekend Side Project', weight: 5, expires: 3, minStage: 'tiny',
    cond: (s) => staff(s).some((e) => ['engineering', 'product'].includes(e.dept)) && live(s).length > 0,
    subject: (s) => who(best(staff(s).filter((e) => ['engineering', 'product'].includes(e.dept)))),
    text: (s) => `${nm(s)} built a little tool over the weekend. The beta users who found it will not stop talking about it.`,
    choices: [
      { id: 'feature', label: 'Fold it into the product', desc: 'A quality bump and a feature for marketing to talk about.',
        apply: (c) => { const p = c.api.product(); if (p) { p.quality = Math.min(1, p.quality + 0.05); p.marketBonus += 0.03; } c.api.story(c.api.employee(), 'Their side project shipped in the product'); c.api.note('It ships next week with their name in the changelog.'); } },
      { id: 'keep', label: 'Let them keep it as theirs', desc: 'Nothing for the company, a lot for the person.',
        apply: (c) => { const e = c.api.employee(); c.api.moraleOf(e, 0.2); c.api.addTrait(e, 'loyal'); c.api.story(e, 'Was allowed to keep their side project'); c.api.note('They were visibly moved.'); } },
      { id: 'ignore', label: 'Remind everyone about focus', desc: 'Free.',
        apply: (c) => { c.api.moraleOf(c.api.employee(), -0.05); c.api.note('The side project went quiet.'); } }
    ],
    auto: 'feature'
  },
  {
    id: 'architecture_feud', cat: 'people', title: 'The Architecture Argument', weight: 5, expires: 3, minStage: 'seed',
    cond: (s) => s.employees.filter((e) => e.dept === 'engineering' && e.id !== 'founder').length >= 3,
    subject: (s) => {
      const eng = s.employees.filter((e) => e.dept === 'engineering' && e.id !== 'founder').sort((a, b) => b.skill - a.skill);
      return eng.length >= 2 ? { name: eng[0].name, id: eng[0].id, data: { otherId: eng[1].id, otherName: eng[1].name } } : null;
    },
    text: (s) => `${nm(s)} and ${P(s).data?.otherName || 'a colleague'} disagree about the architecture. Loudly, and in the kitchen.`,
    choices: [
      { id: 'a', label: (s) => `Back ${s.pendingEventSubject || 'the first'}`, desc: 'A clean decision. The other side loses face.',
        apply: (c) => { c.api.moraleOf(c.api.employee(), 0.1); c.api.moraleOf(c.api.employeeById(c.pending.data?.otherId), -0.18); const p = c.api.product(); if (p) p.techDebt = Math.max(0, p.techDebt - 0.06); c.api.note('Decision made. One person is very quiet today.'); } },
      { id: 'b', label: (s) => `Back ${s.pendingEvent?.data?.otherName || 'the second'}`, desc: 'A clean decision the other way.',
        apply: (c) => { c.api.moraleOf(c.api.employeeById(c.pending.data?.otherId), 0.1); c.api.moraleOf(c.api.employee(), -0.18); const p = c.api.product(); if (p) p.techDebt = Math.max(0, p.techDebt - 0.06); c.api.note('Decision made. One person is very quiet today.'); } },
      { id: 'prototype', label: 'Make them build both, together', desc: 'Two days of engineering. Either a partnership or a resignation.',
        apply: (c) => { c.api.engPenalty(1); const a = c.api.employee(); const b = c.api.employeeById(c.pending.data?.otherId);
          if (c.api.chance(0.65)) { c.api.moraleOf(a, 0.12); c.api.moraleOf(b, 0.12); c.api.story(a, `Became close collaborators with ${b?.name || 'a colleague'}`); c.api.story(b, `Became close collaborators with ${a?.name || 'a colleague'}`); const p = c.api.product(); if (p) p.quality = Math.min(1, p.quality + 0.04); c.api.note('The hybrid design is better than either. They are friends now.'); }
          else { c.api.lose(b); c.api.note('The prototype settled it. One of them did not take it well.'); } } }
    ],
    auto: 'prototype'
  },
  {
    id: 'hackathon', cat: 'people', title: 'Hackathon Weekend?', weight: 4, expires: 3, minStage: 'seed',
    cond: (s) => staff(s).length >= 5 && live(s).length > 0,
    text: () => 'The team wants to run a 48-hour hackathon. Pizza, sleeping bags, questionable ideas.',
    choices: [
      { id: 'run', label: 'Run it', cost: (s) => Math.max(4000, staff(s).length * 400), desc: 'Costs a day of engineering. Ideas, morale, and sometimes a gem.',
        apply: (c) => { c.api.engPenalty(0.5); c.api.morale(0.08); c.api.energy(-0.05); const p = c.api.product();
          if (c.api.chance(0.35) && p) { p.quality = Math.min(1, p.quality + 0.06); p.marketBonus += 0.04; c.api.note('One hack is going straight into the product.'); }
          else c.api.note('Nothing shippable, but everyone had a great time.'); } },
      { id: 'skip', label: 'Not this quarter', desc: 'Free.', apply: (c) => { c.api.morale(-0.02); c.api.note('Maybe next quarter.'); } }
    ],
    auto: 'skip'
  },
  {
    id: 'equity_question', cat: 'people', title: 'The All-Hands Question', weight: 4, expires: 3, minStage: 'seed',
    cond: (s) => staff(s).length >= 6,
    text: () => 'At the all-hands, someone asks what their equity is actually worth. The room goes quiet.',
    choices: [
      { id: 'refresh', label: 'Refresh equity for everyone', desc: 'Dilutes you 1.5%. Staff attrition drops sharply for four months.',
        apply: (c) => { c.api.dilute(0.015, 'event:equity_refresh'); c.api.morale(0.12); c.api.boost('equity_refresh_evt', { staffChurn: -0.4 }, 120); c.api.note('New grants went out. People are doing the maths and smiling.'); } },
      { id: 'bonus', label: 'Announce a cash bonus pool', cost: (s) => payrollDays(s, 10), desc: 'Costs ten days of payroll. Morale up.',
        apply: (c) => { c.api.morale(0.1); c.api.note('Bonuses are cash. Cash is popular.'); } },
      { id: 'honest', label: 'Be honest: not yet', desc: 'Free. Some people will update their CVs.',
        apply: (c) => { c.api.morale(-0.04); c.api.note('Honesty was appreciated. Mostly.'); } }
    ],
    auto: 'honest'
  },
  {
    id: 'remote_request', cat: 'people', title: 'Remote Days', weight: 4, expires: 3, minStage: 'tiny',
    cond: (s) => staff(s).length >= 4,
    text: () => 'Half the team would like to work from home two days a week.',
    choices: [
      { id: 'allow', label: 'Allow it', desc: 'Happier, more rested people; slightly slower collaboration for three months.',
        apply: (c) => { c.api.boost('hybrid', { moraleGain: 0.05, rest: 0.05, deptBonus: -0.03, deskBonus: 3 }, 90); c.api.note('Tuesdays and Fridays are quiet now.'); } },
      { id: 'office', label: 'Office first', desc: 'Tighter collaboration, grumpier team for three months.',
        apply: (c) => { c.api.boost('office_first', { moraleGain: -0.05, deptBonus: 0.04 }, 90); c.api.note('The whiteboards are busier. So is the rumour mill.'); } }
    ],
    auto: 'allow'
  },
  {
    id: 'interns', cat: 'people', title: 'University Internships', weight: 4, expires: 4, minStage: 'seed',
    text: () => 'A university wants to place three computer science interns with you for a season.',
    choices: [
      { id: 'take', label: 'Take them on', desc: 'Three cheap, eager, very junior engineer candidates. They learn fast.',
        apply: (c) => { for (let i = 0; i < 3; i++) c.api.candidate({ role: 'engineer', skill: c.api.rand(2, 3.5), salaryMul: 0.4, traits: ['fast_learner'], referral: true, days: 10 }); c.api.note('Three intern candidates are waiting in Employees.'); } },
      { id: 'no', label: 'Not this year', desc: 'Free.', apply: (c) => c.api.note('Maybe next year.') }
    ],
    auto: 'no'
  },
  {
    id: 'founder_tired', cat: 'people', title: 'You Need A Break', weight: 5, expires: 3, minStage: 'solo',
    cond: (s) => (s.employees.find((e) => e.id === 'founder')?.energy ?? 0.9) < 0.35,
    text: () => 'You have not had a day off in months. You read the same email four times this morning.',
    choices: [
      { id: 'rest', label: 'Take a week off', desc: 'No founder output for 6 days. You come back sharp.',
        apply: (c) => { const f = c.api.employeeById('founder'); c.api.leave(f, 6); c.api.note('Phone off. It was terrifying, then wonderful.'); } },
      { id: 'grind', label: 'Keep grinding', desc: 'You keep going. Your body may disagree.',
        apply: (c) => { if (c.api.chance(0.35)) c.api.chain('health_scare', 5, { subjectId: 'founder', subject: 'You' }); c.api.note('Another coffee.'); } }
    ],
    auto: 'rest'
  },
  {
    id: 'health_scare', cat: 'people', title: 'A Warning Sign', weight: 1, expires: 1.5, chainOnly: true,
    text: () => 'You ended up in urgent care with chest pains. It was stress. This time.',
    choices: [
      { id: 'recover', label: 'Take two weeks, properly', desc: 'Two weeks without you. A changed founder afterwards.',
        apply: (c) => { const f = c.api.employeeById('founder'); c.api.leave(f, 14); c.api.story(f, 'Learned to take weekends off'); c.api.note('The team covered. That was its own lesson.'); } },
      { id: 'lighter', label: 'Come back part-time, and slow everyone down', desc: 'Five days off, then the whole company moves to a Sustainable pace.',
        apply: (c) => { const f = c.api.employeeById('founder'); c.api.leave(f, 5); c.api.setPace('relaxed'); c.api.note('Everyone is going home on time now, including you.'); } }
    ],
    auto: 'recover'
  },
  {
    id: 'legend_available', cat: 'people', title: 'A Legend Is Looking', weight: 2, expires: 3, minStage: 'growing',
    text: () => 'Someone whose name you have heard at every conference is quietly looking for their next thing.',
    choices: [
      { id: 'court', label: 'Court them', cost: (s) => Math.max(40000, s.stats.revenueDay * 2),
        desc: 'Dinner, a demo, a very good pitch. They join the candidate pool with a legendary trait.',
        apply: (c) => { const t = ['tenx', 'visionary', 'closer', 'culture_carrier'][Math.floor(c.api.rand(0, 3.999))];
          const role = { tenx: 'senior_engineer', visionary: 'pm', closer: 'sales_rep', culture_carrier: 'manager' }[t];
          c.api.candidate({ role, star: true, trait: t, days: 10 }); c.api.note('They are interested. The offer is in Employees.'); } },
      { id: 'pass', label: 'Not at their price', desc: 'Free.', apply: (c) => c.api.note('They joined a rival a month later.') }
    ],
    auto: 'pass'
  },
  {
    id: 'boomerang', cat: 'people', title: 'They Want To Come Back', weight: 4, expires: 3, minStage: 'seed',
    cond: (s) => (s.alumni || []).some((a) => a.why !== 'let go' && !s.employees.some((e) => e.name === a.name)),
    subject: (s) => { const a = (s.alumni || []).find((x) => x.why !== 'let go' && !s.employees.some((e) => e.name === x.name)); return a ? { name: a.name, data: { role: a.role, skill: a.skill, traits: a.traits } } : null; },
    text: (s) => `${nm(s)}, who left a while ago, emailed. The grass was not greener.`,
    choices: [
      { id: 'welcome', label: 'Welcome them back', desc: 'They rejoin the candidate pool with more skill and no signing bonus.',
        apply: (c) => { const d = c.pending.data || {}; const e = c.api.candidate({ role: d.role || 'engineer', name: c.pending.subject, skill: (d.skill || 5) + 0.8, traits: d.traits || [], referral: true, days: 8 }); c.api.story(e, 'Came back after leaving'); c.api.note('They are in the candidate list.'); } },
      { id: 'no', label: 'Politely decline', desc: 'Free.', apply: (c) => c.api.note('You wished them well.') }
    ],
    auto: 'no'
  },
  {
    id: 'offsite', cat: 'people', title: 'Team Offsite', weight: 4, expires: 3, minStage: 'seed',
    cond: (s) => staff(s).length >= 6,
    text: () => 'Operations found a cabin that fits everyone. It has a lake and, crucially, no wifi.',
    choices: [
      { id: 'go', label: 'Book it', cost: (s) => Math.max(8000, staff(s).length * 1500), desc: 'A few days of lost output. Everyone comes back rested and closer.',
        apply: (c) => { c.api.engPenalty(0.6); c.api.energy(0.3); c.api.morale(0.12); c.api.note('Canoes, a bonfire, and a whiteboard nobody needed.'); } },
      { id: 'no', label: 'Maybe next year', desc: 'Free.', apply: (c) => c.api.note('Maybe next year.') }
    ],
    auto: 'no'
  },
  {
    id: 'mentorship', cat: 'people', title: 'Mentorship Program', weight: 4, expires: 3, minStage: 'growing',
    cond: (s) => staff(s).filter((e) => e.skill < 5).length >= 3 && staff(s).some((e) => e.skill >= 8),
    subject: (s) => who(best(staff(s))),
    text: (s) => `${nm(s)} offered to mentor the junior people, formally, one afternoon a week.`,
    choices: [
      { id: 'yes', label: 'Make it official', desc: 'The mentor gives up some output; juniors level up faster.',
        apply: (c) => { const m = c.api.employee(); c.api.energyOf(m, -0.05); for (const e of c.state.employees) if (e.skill < 5) e.skill = Math.round((e.skill + 0.6) * 10) / 10; c.api.story(m, 'Started a mentorship program'); c.api.addTrait(m, 'team_player'); c.api.note('Thursday afternoons are for mentoring now.'); } },
      { id: 'no', label: 'Keep them on the roadmap', desc: 'Free.', apply: (c) => c.api.note('Output first.') }
    ],
    auto: 'yes'
  },

  // =============================================================== product
  {
    id: 'launch_stampede', cat: 'product', title: 'The Launch Is Taking Off', weight: 1, expires: 1.5, trigger: true,
    text: (s) => `${(s.products.find((p) => p.id === P(s).data?.productId) || {}).name || 'The launch'} is trending, and the servers are starting to feel it.`,
    choices: [
      { id: 'scale', label: 'Throw capacity at it', cost: (s) => Math.max(5000, s.stats.infraDay * 6),
        desc: 'More servers now. The buzz lasts longer.',
        apply: (c) => { c.state.infra.capacity = Math.round(c.state.infra.capacity * 1.4); const p = c.api.product(); c.api.hype(p, p?.hype?.acq || 0.3, 6, 'Extended buzz'); c.api.note('Graphs up and to the right, pager quiet.'); } },
      { id: 'waitlist', label: 'Start a waitlist', desc: 'Fewer sign-ups now, and the exclusivity is good press.',
        apply: (c) => { const p = c.api.product(); if (p?.hype) p.hype.acq *= 0.6; c.api.addReputation(0.08); c.api.note('The waitlist became its own story.'); } },
      { id: 'ride', label: 'Ride it with what we have', desc: 'Free. Might fall over.',
        apply: (c) => { if (c.api.chance(0.45)) c.api.startOutage(); c.api.note('Fingers crossed.'); } }
    ],
    auto: 'ride'
  },
  {
    id: 'launch_flop_response', cat: 'product', title: 'The Reviews Are In', weight: 1, expires: 2.5, trigger: true,
    text: (s) => `${(s.products.find((p) => p.id === P(s).data?.productId) || {}).name || 'The launch'} is getting hammered in reviews.`,
    choices: [
      { id: 'apologise', label: 'Apologise and fix it in public', desc: 'A focused sprint: quality up, reputation recovers.',
        apply: (c) => { const p = c.api.product(); c.api.engPenalty(0.8); if (p) p.quality = Math.min(1, p.quality + 0.06); c.api.addReputation(0.06); c.api.note('The changelog post was humble and specific. It helped.'); } },
      { id: 'reposition', label: 'Reposition the marketing', cost: (s) => revDays(s, 2), desc: 'Aim it at the people who did like it.',
        apply: (c) => { const p = c.api.product(); if (p) p.marketBonus += 0.03; c.api.note('New landing page, narrower audience, better numbers.'); } },
      { id: 'ignore', label: 'Ignore the noise', desc: 'Free. Reputation takes a little more damage.',
        apply: (c) => { c.api.addReputation(-0.04); c.api.note('It blew over, mostly.'); } }
    ],
    auto: 'ignore'
  },
  {
    id: 'launch_party', cat: 'people', title: 'Launch Party?', weight: 1, expires: 2, trigger: true,
    text: () => 'The launch went brilliantly. Someone has already found a venue.',
    choices: [
      { id: 'party', label: 'Throw the party', cost: (s) => Math.max(3000, staff(s).length * 600), desc: 'Morale and energy up.',
        apply: (c) => { c.api.morale(0.08); c.api.energy(0.12); c.api.note('There were speeches. Some were coherent.'); } },
      { id: 'pizza', label: 'Pizza in the office', cost: 400, desc: 'A small thank-you.',
        apply: (c) => { c.api.morale(0.03); c.api.note('Pineapple was divisive.'); } }
    ],
    auto: 'pizza'
  },
  {
    id: 'debt_crisis', cat: 'product', title: 'The Codebase Is Fighting Back', weight: 6, expires: 3, minStage: 'tiny',
    cond: (s) => live(s).some((p) => p.techDebt > 0.85),
    subject: (s) => { const p = live(s).sort((a, b) => b.techDebt - a.techDebt)[0]; return p ? { name: p.name, data: { productId: p.id } } : null; },
    text: (s) => `Every change to ${nm(s)} breaks two other things. Estimates have stopped meaning anything.`,
    choices: [
      { id: 'freeze', label: 'Feature freeze and refactor', desc: 'A few days of lost output, a lot less debt.',
        apply: (c) => { const p = c.api.product(); c.api.engPenalty(1.5); if (p) p.techDebt = Math.max(0, p.techDebt - 0.35); c.api.note('Two weeks of deleting code. It felt wonderful.'); } },
      { id: 'contractors', label: 'Bring in contractors', cost: (s) => payrollDays(s, 8), desc: 'Money instead of time.',
        apply: (c) => { const p = c.api.product(); if (p) p.techDebt = Math.max(0, p.techDebt - 0.2); c.api.note('The contractors were good. Expensive, but good.'); } },
      { id: 'live', label: 'Live with it', desc: 'Free today. Reliability slides.',
        apply: (c) => { const p = c.api.product(); if (p) p.reliability = Math.max(0, p.reliability - 0.05); c.api.note('Nobody touches the billing module anymore.'); } }
    ],
    auto: 'live'
  },
  {
    id: 'platform_fees', cat: 'product', title: 'The Platform Changed The Rules', weight: 4, expires: 3, minStage: 'tiny',
    cond: (s) => live(s).some((p) => ['mobile', 'games', 'social'].includes(p.category)),
    text: () => 'The app store raised its cut and changed its review rules, effective next month.',
    choices: [
      { id: 'comply', label: 'Comply', desc: 'Revenue from app-store products down 8% for two months.',
        apply: (c) => { c.api.boost('store_fees', { revenue: -0.08 }, 60); c.api.note('You updated the pricing page and sighed.'); } },
      { id: 'web', label: 'Push users to the web', desc: 'Days of engineering; higher margins on mobile products for good, a slightly smaller market.',
        apply: (c) => { c.api.engPenalty(2); for (const p of live(c.state)) if (['mobile', 'games', 'social'].includes(p.category)) { p.revMul = (p.revMul || 0) + 0.05; p.marketBonus -= 0.04; } c.api.note('The web checkout converts better than anyone expected.'); } },
      { id: 'fight', label: 'Fight it publicly', desc: 'Free. The industry may rally behind you, or not.',
        apply: (c) => { if (c.api.chance(0.5)) { c.api.addReputation(0.15); c.api.note('Other developers joined in. You are a small hero.'); } else { c.api.addReputation(-0.06); c.api.boost('store_fees', { revenue: -0.08 }, 60); c.api.note('The platform did not blink.'); } } }
    ],
    auto: 'comply'
  },
  {
    id: 'api_sunset', cat: 'product', title: 'A Dependency Is Going Away', weight: 4, expires: 3, minStage: 'seed',
    cond: (s) => live(s).length > 0,
    text: () => 'A service half your product quietly depends on is shutting down its API in ninety days.',
    choices: [
      { id: 'rebuild', label: 'Rebuild it in-house', desc: 'Several days of engineering. Cheaper to run afterwards.',
        apply: (c) => { c.api.engPenalty(2.5); for (const p of live(c.state)) p.infraEff = Math.min(0.8, p.infraEff + 0.04); c.api.note('You own it now, for better and worse.'); } },
      { id: 'enterprise', label: 'Pay for their enterprise tier', desc: 'Infrastructure costs 10% more for four months.',
        apply: (c) => { c.api.boost('api_tier', { infraCost: 0.1 }, 120); c.api.note('The API survives, for a price.'); } },
      { id: 'cheap', label: 'Switch to a cheap alternative', desc: 'Free. Less reliable.',
        apply: (c) => { for (const p of live(c.state)) p.reliability = Math.max(0, p.reliability - 0.05); c.api.note('It mostly works.'); } }
    ],
    auto: 'enterprise'
  },
  {
    id: 'data_breach', cat: 'infra', title: 'Customer Data Exposed', weight: 3, expires: 2, minStage: 'growing',
    cond: (s) => live(s).some((p) => p.security < 0.55),
    text: () => 'A misconfigured bucket exposed customer records. A journalist has already asked for comment.',
    choices: [
      { id: 'disclose', label: 'Full disclosure and credit monitoring', cost: (s) => revDays(s, 6, 40000),
        desc: 'Expensive and painful, but clean.',
        apply: (c) => { c.api.addReputation(-0.15); c.api.churnSpike(0.1, 10); c.api.security(0.2); c.api.note('The disclosure was frank. The response was grudging respect.'); } },
      { id: 'minimal', label: 'Minimal statement', desc: 'Cheap now. The regulator might follow up.',
        apply: (c) => { if (c.api.chance(0.5)) { c.api.addReputation(-0.5); c.api.churnSpike(0.3, 14); c.api.note('The full story came out anyway.'); } else c.api.addReputation(-0.1); c.api.security(0.1); c.api.chain('regulator_inquiry', 18); } }
    ],
    auto: 'disclose'
  },
  {
    id: 'regulator_inquiry', cat: 'legal', title: 'The Regulator Would Like A Word', weight: 1, expires: 3, chainOnly: true,
    text: () => 'A regulator has opened an inquiry into how you handled the data incident.',
    choices: [
      { id: 'cooperate', label: 'Cooperate fully', cost: (s) => revDays(s, 4, 30000), desc: 'Lawyers and audits. Closes it cleanly.',
        apply: (c) => { c.api.addReputation(0.05); c.api.note('The inquiry closed with recommendations, not fines.'); } },
      { id: 'fight', label: 'Lawyer up and contest it', cost: (s) => revDays(s, 2, 15000), desc: 'Cheaper up front; could end in a fine.',
        apply: (c) => { if (c.api.chance(0.45)) { c.api.spend(c.state.stats.revenueDay * 12); c.api.addReputation(-0.15); c.api.note('The fine was large and public.'); } else c.api.note('The regulator dropped it.'); } }
    ],
    auto: 'cooperate'
  },
  {
    id: 'accessibility_audit', cat: 'product', title: 'An Accessibility Audit', weight: 4, expires: 3, minStage: 'seed',
    cond: (s) => live(s).length > 0,
    text: (s) => `An accessibility advocate published a detailed audit of ${(biggest(s) || {}).name || 'your product'}. It is fair, and it is not flattering.`,
    choices: [
      { id: 'fix', label: 'Fix everything they found', desc: 'A few days of engineering. Quality and reputation up.',
        apply: (c) => { c.api.engPenalty(1.2); for (const p of live(c.state)) { p.quality = Math.min(1, p.quality + 0.04); p.marketBonus += 0.03; } c.api.addReputation(0.12); c.api.note('They published a follow-up praising the fixes.'); } },
      { id: 'worst', label: 'Fix the worst issues', desc: 'A day of engineering.',
        apply: (c) => { c.api.engPenalty(0.5); const p = biggest(c.state); if (p) p.quality = Math.min(1, p.quality + 0.02); c.api.note('The critical issues are fixed.'); } },
      { id: 'dispute', label: 'Dispute the findings', desc: 'Free. Looks bad.', apply: (c) => { c.api.addReputation(-0.08); c.api.note('That did not go well.'); } }
    ],
    auto: 'worst'
  },
  {
    id: 'beta_program', cat: 'product', title: 'Power Users Want In Early', weight: 4, expires: 3, minStage: 'tiny',
    cond: (s) => live(s).length > 0,
    text: () => 'A group of power users asks for a beta channel. They promise feedback. So much feedback.',
    choices: [
      { id: 'yes', label: 'Launch a beta program', desc: 'Every launch for the next two months lands better.',
        apply: (c) => { c.api.boost('beta_program', { launch: 0.1, support: -0.05 }, 60); c.api.note('The beta channel has 400 people and a very busy forum.'); } },
      { id: 'no', label: 'Keep releases simple', desc: 'Free.', apply: (c) => c.api.note('One release channel it is.') }
    ],
    auto: 'no'
  },
  {
    id: 'open_source', cat: 'product', title: 'Open Source The Core?', weight: 4, expires: 4, minStage: 'seed',
    cond: (s) => live(s).some((p) => p.category === 'devtool'),
    text: () => 'Your engineers want to open source the core of the developer tool. Sales is nervous.',
    choices: [
      { id: 'open', label: 'Open source it', desc: 'Much bigger developer market and reputation; a bit less revenue per user.',
        apply: (c) => { for (const p of live(c.state)) if (p.category === 'devtool') { p.marketBonus += 0.25; p.revMul = (p.revMul || 0) - 0.06; } c.api.addReputation(0.2); c.api.morale(0.06); c.api.note('The repository hit the front page. Stars are pouring in.'); } },
      { id: 'closed', label: 'Keep it closed', desc: 'Free.', apply: (c) => c.api.note('The source stays closed.') }
    ],
    auto: 'closed'
  },
  {
    id: 'promised_feature', cat: 'customers', title: 'Sales Promised Something', weight: 5, expires: 2.5, minStage: 'growing',
    cond: (s) => staff(s).some((e) => e.dept === 'sales') && live(s).length > 0,
    text: () => 'A sales rep promised a big prospect a feature that does not exist. The contract is ready to sign.',
    choices: [
      { id: 'build', label: 'Build it', desc: 'Two days of engineering. You win the deal.',
        apply: (c) => { c.api.engPenalty(1.5); c.api.addContract({ sizeMul: 1.1, sla: false }); } },
      { id: 'fake', label: 'Fake it with manual work', desc: 'Win the deal; support carries the weight for months.',
        apply: (c) => { c.api.addContract({ sizeMul: 1.0, sla: false }); c.api.boost('manual_work', { support: -0.15 }, 90); } },
      { id: 'no', label: 'Walk it back', desc: 'No deal. Sales is unhappy.',
        apply: (c) => { for (const e of c.state.employees) if (e.dept === 'sales') e.morale = Math.max(0, e.morale - 0.1); c.api.note('The rep was not thrilled.'); } }
    ],
    auto: 'no'
  },
  {
    id: 'celebrity_user', cat: 'market', title: 'A Celebrity Uses Your Product On Camera', weight: 2, expires: 1.5, minStage: 'tiny',
    cond: (s) => live(s).some((p) => ['mobile', 'games', 'social', 'saas', 'ai'].includes(p.category)),
    subject: (s) => { const p = live(s).filter((x) => ['mobile', 'games', 'social', 'saas', 'ai'].includes(x.category)).sort((a, b) => b.users - a.users)[0]; return p ? { name: p.name, data: { productId: p.id } } : null; },
    text: (s) => `A very famous person just used ${nm(s)} on a talk show. Unprompted.`,
    choices: [
      { id: 'sponsor', label: 'Sign them as an ambassador', cost: (s) => revDays(s, 5, 15000), desc: 'Enormous buzz for weeks.',
        apply: (c) => { c.api.hype(c.api.product(), 0.9, 12, 'Celebrity buzz'); c.api.addReputation(0.15); c.api.note('The billboard is enormous.'); } },
      { id: 'share', label: 'Just share the clip', desc: 'Free. A short burst.',
        apply: (c) => { c.api.hype(c.api.product(), 0.35, 5, 'Celebrity moment'); c.api.note('The clip did the rounds for a week.'); } }
    ],
    auto: 'share'
  },

  // ============================================================== rivals
  {
    id: 'rival_poach', cat: 'people', title: 'A Rival Is Poaching', weight: 1, expires: 2, trigger: true,
    text: (s) => { const r = s.competitors.find((c) => c.id === P(s).data?.rivalId); const e = s.employees.find((x) => x.id === P(s).subjectId); return `${r?.name || 'A rival'} made ${e?.name || 'one of your best people'} an offer that is hard to refuse.`; },
    choices: [
      { id: 'counter', label: 'Counter-offer', cost: (s) => { const e = s.employees.find((x) => x.id === s.pendingEvent?.subjectId); return Math.max(5000, (e?.salary || 100000) * 0.25); },
        desc: 'A retention bonus and a 15% raise.',
        apply: (c) => { const e = c.api.employee(); c.api.raiseOf(e, 0.15); c.api.moraleOf(e, 0.12); c.api.story(e, `Stayed despite an offer from ${c.api.rival()?.name || 'a rival'}`); c.api.note('They stayed.'); } },
      { id: 'mission', label: 'Remind them why they joined', desc: 'Free. Works if they are happy.',
        apply: (c) => { const e = c.api.employee(); if (e && e.morale > 0.7 && c.api.chance(0.7)) { c.api.story(e, 'Stayed for the mission'); c.api.note('They stayed.'); } else c.api.lose(e, c.api.rival()); } },
      { id: 'go', label: 'Let them go', desc: 'They take their knowledge to the rival.', apply: (c) => c.api.lose(c.api.employee(), c.api.rival()) }
    ],
    auto: 'mission'
  },
  {
    id: 'rival_lawsuit', cat: 'legal', title: 'Served By A Rival', weight: 1, expires: 3, trigger: true,
    text: (s) => `${s.pendingEventSubject || 'A rival'} filed a patent suit against ${(biggest(s) || {}).name || 'your product'}.`,
    choices: [
      { id: 'settle', label: 'Settle', cost: (s) => revDays(s, 8, 30000), desc: 'Make it go away.',
        apply: (c) => c.api.note('Settled. The terms are confidential and annoying.') },
      { id: 'fight', label: 'Fight it', cost: (s) => revDays(s, 3, 12000), desc: 'Win and they look foolish. Lose and it costs more.',
        apply: (c) => { if (c.api.chance(0.6)) { c.api.addReputation(0.15); c.api.rivalHit(c.api.rival(), -0.05); c.api.note('Case dismissed. Their stock of goodwill took a hit.'); } else { c.api.spend(c.state.stats.revenueDay * 12); c.api.note('You lost. It cost more than settling would have.'); } } },
      { id: 'countersue', label: 'Countersue', cost: (s) => revDays(s, 5, 20000), desc: 'Escalate. High stakes both ways.',
        apply: (c) => { if (c.api.chance(0.45)) { c.api.rivalHit(c.api.rival(), -0.1, -0.03); c.api.addReputation(0.1); c.api.note('They withdrew and paid your costs.'); } else { c.api.spend(c.state.stats.revenueDay * 16); c.api.addReputation(-0.08); c.api.note('That escalated badly.'); } } }
    ],
    auto: 'settle'
  },
  {
    id: 'rival_layoffs_opportunity', cat: 'market', title: 'A Rival Is Struggling', weight: 1, expires: 3, trigger: true,
    text: (s) => `${s.pendingEventSubject || 'A rival'} just laid off a third of its staff. Their best people are on the market, and so are their customers.`,
    choices: [
      { id: 'hire', label: 'Hire their best people', desc: 'Two strong candidates with rare traits.',
        apply: (c) => { for (let i = 0; i < 2; i++) c.api.candidate({ star: true, days: 8 }); c.api.note('Two very good candidates are in Employees.'); } },
      { id: 'customers', label: 'Go after their customers', cost: (s) => revDays(s, 3, 8000), desc: 'A switching campaign aimed at their users.',
        apply: (c) => { const r = c.api.rival(); c.api.rivalHit(r, -0.06, -0.05); const p = biggest(c.state); if (p) c.api.hype(p, 0.25, 8, 'Switchers'); c.api.note('Switchers are arriving daily.'); } },
      { id: 'kind', label: 'Stay classy', desc: 'Free. A little reputation.', apply: (c) => c.api.addReputation(0.04) }
    ],
    auto: 'kind'
  },
  {
    id: 'rival_copy_response', cat: 'market', title: 'They Cloned Your Launch', weight: 1, expires: 3, trigger: true,
    text: (s) => `${s.pendingEventSubject || 'A rival'} shipped something that looks exactly like your last hit.`,
    choices: [
      { id: 'outship', label: 'Out-ship them', desc: 'Queue a polished feature push on your best product.',
        apply: (c) => { const p = biggest(c.state); if (p) { p.approach = 'polish'; c.api.queueOn(p, 'feature'); } c.api.note('Polish mode, feature queued. Let them chase.'); } },
      { id: 'undercut', label: 'Undercut them on price', desc: 'Revenue down 10% for three weeks; they bleed more.',
        apply: (c) => { c.api.boost('undercut', { revenue: -0.1, churn: -0.15 }, 21); c.api.rivalHit(c.api.rival(), -0.07, -0.03); c.api.note('Price war, on your terms.'); } },
      { id: 'ignore', label: 'Flattery. Ignore it.', desc: 'Free.', apply: (c) => { c.api.rivalHit(c.api.rival(), 0.02, 0.02); c.api.note('They got a little traction.'); } }
    ],
    auto: 'ignore'
  },
  {
    id: 'nemesis_taunt', cat: 'market', title: 'Your Nemesis Took A Shot', weight: 4, expires: 2.5, minStage: 'seed',
    cond: (s) => !!nem(s),
    subject: (s) => rivalSubj(nem(s)),
    text: (s) => `${nm(s)}'s CEO called you "a feature, not a company" in a keynote. It is everywhere.`,
    choices: [
      { id: 'clapback', label: 'Respond on social', desc: 'Risky. Could land, could backfire.',
        apply: (c) => { if (c.api.chance(0.55)) { c.api.addReputation(0.15); c.api.morale(0.05); c.api.note('Your reply got more likes than their keynote.'); } else { c.api.addReputation(-0.08); c.api.note('That did not land the way you hoped.'); } } },
      { id: 'ship', label: 'Let the product answer', desc: 'The team is fired up. A feature goes to the top of the queue.',
        apply: (c) => { c.api.morale(0.06); const p = biggest(c.state); if (p) c.api.queueOn(p, 'feature'); c.api.note('Engineering took it personally, in the good way.'); } },
      { id: 'ignore', label: 'Ignore it', desc: 'Free.', apply: (c) => c.api.note('Silence. Dignified, possibly.') }
    ],
    auto: 'ignore'
  },
  {
    id: 'rival_partnership', cat: 'customers', title: 'An Unlikely Partnership', weight: 3, expires: 4, minStage: 'growing',
    cond: (s) => alive(s).some((c) => c.id !== s.rivalState?.nemesis && c.strength > 0.25),
    subject: (s) => rivalSubj(alive(s).filter((c) => c.id !== s.rivalState?.nemesis && c.strength > 0.25).sort((a, b) => b.strength - a.strength)[0]),
    text: (s) => `${nm(s)} proposes an integration partnership: their customers get your product, yours get theirs.`,
    choices: [
      { id: 'partner', label: 'Partner', desc: 'Your markets grow; so do they. Rivalry cools.',
        apply: (c) => { const r = c.api.rival(); for (const p of live(c.state)) if (r?.markets.includes(p.category)) p.marketBonus += 0.06; if (r) { r.rivalry = Math.max(0, r.rivalry - 0.3); r.strength = Math.min(1.2, r.strength + 0.03); } c.api.note('The integration shipped in a joint announcement.'); } },
      { id: 'no', label: 'Decline', desc: 'Free.', apply: (c) => c.api.note('You passed.') }
    ],
    auto: 'no'
  },
  {
    id: 'analyst_report', cat: 'market', title: 'The Analyst Rankings', weight: 4, expires: 3, minStage: 'growing',
    text: () => 'A major analyst firm is ranking your category this quarter. They offer a "briefing".',
    choices: [
      { id: 'brief', label: 'Pay for the briefing', cost: (s) => revDays(s, 2, 20000), desc: 'You will be described as a leader.',
        apply: (c) => { c.api.addReputation(0.14); c.api.boost('analyst', { enterpriseConv: 0.1 }, 90); c.api.note('Top-right quadrant. Enterprise buyers noticed.'); } },
      { id: 'skip', label: 'Let the product speak', desc: 'Free. You may be described as a niche player.',
        apply: (c) => { c.api.addReputation(-0.03); c.api.note('"Niche player." Fine.'); } }
    ],
    auto: 'skip'
  },

  // ============================================================== economy
  {
    id: 'downturn_talent', cat: 'market', title: 'Great People Are Available', weight: 1, expires: 3, trigger: true,
    text: () => 'The downturn put a lot of very good people on the market, and they are not asking for much.',
    choices: [
      { id: 'hire', label: 'Recruit aggressively', desc: 'Three strong candidates, at a discount.',
        apply: (c) => { for (let i = 0; i < 3; i++) c.api.candidate({ skill: c.api.rand(6, 9), salaryMul: 0.85, days: 10 }); c.api.note('Three excellent candidates are waiting.'); } },
      { id: 'lean', label: 'Go lean and bank the runway', desc: 'Marketing halved; payroll a little lighter for a while.',
        apply: (c) => { c.api.halveMarketing(); c.api.boost('lean', { payroll: -0.05 }, 45); c.api.note('Belts tightened.'); } },
      { id: 'hold', label: 'Hold steady', desc: 'Free.', apply: (c) => c.api.note('Steady as she goes.') }
    ],
    auto: 'hold'
  },
  {
    id: 'boom_money', cat: 'money', title: 'Money Is Everywhere', weight: 1, expires: 4, trigger: true,
    text: () => 'The boom has investors cold-emailing you. One of them is offering terms before seeing a deck.',
    choices: [
      { id: 'raise', label: 'Take a meeting', desc: 'Your next funding round is priced 25% higher.',
        apply: (c) => { c.api.spawnFundingOffer(1.25); c.api.note('Finance has a very generous number to look at.'); } },
      { id: 'disciplined', label: 'Stay disciplined', desc: 'Free. Serious investors notice.', apply: (c) => { c.api.addReputation(0.04); c.api.note('You told them you would call.'); } }
    ],
    auto: 'disciplined'
  },
  {
    id: 'trend_opportunity', cat: 'market', title: 'A Wave Is Forming', weight: 1, expires: 4, trigger: true,
    text: (s) => `${P(s).data?.trendName || 'A trend'} is building in ${catName(P(s).data?.cat)}. You are not in that market yet.`,
    choices: [
      { id: 'explore', label: 'Start exploratory work', desc: 'Starting a product in that category costs half for a month.',
        apply: (c) => { c.api.discountCategory(c.pending.data?.cat, 0.5, 30); c.api.note('Product has a one-pager and a budget.'); } },
      { id: 'focus', label: 'Stay focused', desc: 'Free.', apply: (c) => c.api.note('Focus is a strategy too.') }
    ],
    auto: 'focus'
  },
  {
    id: 'tax_credit', cat: 'money', title: 'R&D Tax Credit', weight: 4, expires: 4, minStage: 'seed',
    cond: (s) => s.employees.filter((e) => e.dept === 'engineering').length >= 3,
    text: () => 'Your accountant thinks your engineering work qualifies for a research tax credit.',
    choices: [
      { id: 'claim', label: 'File it yourselves', desc: 'A day of founder time, some money back.',
        apply: (c) => { c.api.addCash(Math.max(3000, c.state.stats.payrollDay * 12)); c.api.engPenalty(0.3); c.api.note('The credit came through.'); } },
      { id: 'specialist', label: 'Hire a specialist', cost: (s) => Math.max(2000, s.stats.payrollDay * 3), desc: 'Costs a little; claims a lot more.',
        apply: (c) => { c.api.addCash(Math.max(6000, c.state.stats.payrollDay * 22)); c.api.note('The specialist found things you did not know existed.'); } },
      { id: 'skip', label: 'Not worth the paperwork', desc: 'Free.', apply: (c) => c.api.note('Skipped.') }
    ],
    auto: 'skip'
  },
  {
    id: 'bank_failure', cat: 'money', title: 'Your Bank Is Wobbling', weight: 1.5, expires: 1.5, minStage: 'seed',
    cond: (s) => s.company.cash > 250000,
    text: () => 'Rumours say your bank is in trouble. Founders in every group chat are moving money.',
    choices: [
      { id: 'move', label: 'Move everything now', desc: 'Fees and a lost day, but safe.',
        apply: (c) => { c.api.spend(c.state.company.cash * 0.01); c.api.engPenalty(0.2); c.api.note('Moved. The wire fees were a rounding error.'); } },
      { id: 'wait', label: 'It will be fine', desc: 'Free. Probably.',
        apply: (c) => { if (c.api.chance(0.3)) { c.api.spend(c.state.company.cash * 0.12); c.api.note('It was not fine. Some of the money is gone for now.'); } else c.api.note('It was fine.'); } }
    ],
    auto: 'move'
  },
  {
    id: 'acquisition_rumor', cat: 'money', title: 'Acquisition Rumours', weight: 2, expires: 3, minStage: 'growing',
    text: () => 'A newsletter claims you are in talks to be acquired. You are not.',
    choices: [
      { id: 'deny', label: 'Deny it firmly', desc: 'The team relaxes.', apply: (c) => { c.api.morale(0.05); c.api.note('Denied.'); } },
      { id: 'nocomment', label: '"No comment"', desc: 'Your valuation benefits from the mystery; the team gets nervous.',
        apply: (c) => { c.api.boost('rumour', { valuation: 0.08 }, 30); c.api.morale(-0.05); c.api.note('Inbound interest from bankers is up.'); } }
    ],
    auto: 'deny'
  },
  {
    id: 'award', cat: 'market', title: 'Startup Of The Year', weight: 2, expires: 3, minStage: 'growing',
    cond: (s) => s.company.reputation > 3,
    text: () => 'You won an industry award. There is a trophy, a gala, and a speech to give.',
    choices: [
      { id: 'speech', label: 'Accept it on stage yourself', desc: 'Reputation up; a day of founder time gone.',
        apply: (c) => { c.api.addReputation(0.22); c.api.engPenalty(0.3); c.api.note('The speech went well. You thanked the team by name.'); } },
      { id: 'team', label: 'Send the team to accept it', desc: 'Morale up.', apply: (c) => { c.api.morale(0.1); c.api.addReputation(0.08); c.api.note('The photos are on the office wall now.'); } }
    ],
    auto: 'team'
  },

  // =============================================================== office
  {
    id: 'coffee_machine', cat: 'people', title: 'The Coffee Machine Died', weight: 4, expires: 2, minStage: 'solo', maxStage: 'growing',
    cond: (s) => s.employees.length >= 2,
    text: () => 'The coffee machine made a noise like a jet engine and stopped. Productivity has visibly dropped.',
    choices: [
      { id: 'espresso', label: 'Buy a proper espresso machine', cost: 2500, desc: 'Morale up. Everyone is suddenly a barista.',
        apply: (c) => { c.api.morale(0.05); c.api.energy(0.05); c.api.note('The latte art is getting competitive.'); } },
      { id: 'wait', label: 'Wait for the repair', desc: 'Free. A slow few days.',
        apply: (c) => { c.api.boost('no_coffee', { devSpeed: -0.06 }, 3); c.api.note('Three very slow days.'); } }
    ],
    auto: 'wait'
  },
  {
    id: 'office_dog', cat: 'people', title: 'Someone Brought A Dog', weight: 3, expires: 3, minStage: 'tiny',
    cond: (s) => s.employees.length >= 3,
    text: () => 'Someone brought their dog in. Nobody has done any work for an hour. Nobody regrets it.',
    choices: [
      { id: 'yes', label: 'Dogs are welcome', desc: 'Morale and energy up for months; a little distraction.',
        apply: (c) => { c.api.boost('office_dog', { moraleGain: 0.05, rest: 0.04, devSpeed: -0.02 }, 120); c.api.note('There is now a dog bed by the window.'); } },
      { id: 'no', label: 'No pets, sorry', desc: 'Free.', apply: (c) => { c.api.morale(-0.02); c.api.note('The dog went home. Sad faces all round.'); } }
    ],
    auto: 'yes'
  },
  {
    id: 'garage_neighbours', cat: 'legal', title: 'The Neighbours Are Complaining', weight: 4, expires: 3, minStage: 'solo',
    cond: (s) => s.office.tier === 'garage' && s.employees.length >= 2,
    text: () => 'The neighbours have complained about the late-night typing, the deliveries and "the whiteboard in the driveway".',
    choices: [
      { id: 'soundproof', label: 'Soundproof the garage', cost: 1800, desc: 'Peace restored.', apply: (c) => { c.api.morale(0.03); c.api.note('Egg-box foam everywhere.'); } },
      { id: 'cookies', label: 'Bring them cookies', cost: 60, desc: 'Cheap. Might work.', apply: (c) => { if (c.api.chance(0.6)) c.api.note('The cookies worked.'); else { c.api.boost('neighbours', { moraleGain: -0.04 }, 20); c.api.note('They were not cookie people.'); } } },
      { id: 'ignore', label: 'Ignore them', desc: 'Free. Tension.', apply: (c) => { c.api.boost('neighbours', { moraleGain: -0.04 }, 20); c.api.note('Frosty looks every morning.'); } }
    ],
    auto: 'cookies'
  },
  {
    id: 'packed_office', cat: 'people', title: 'Standing Room Only', weight: 5, expires: 3, minStage: 'tiny',
    cond: (s) => s.employees.length > s.office.deskCapacity,
    text: () => 'People are working from the kitchen and the stairwell. Someone took a call in the supply closet.',
    choices: [
      { id: 'overflow', label: 'Rent overflow space', cost: (s) => Math.max(3000, (s.stats.rentDay || 40) * 30), desc: 'Six extra desks for two months.',
        apply: (c) => { c.api.boost('overflow', { deskBonus: 6 }, 60); c.api.note('A co-working space down the road has your name on six desks.'); } },
      { id: 'shifts', label: 'Stagger schedules', desc: 'Free. Tiring.', apply: (c) => { c.api.boost('shifts', { deskBonus: 3, rest: -0.08 }, 45); c.api.note('Early birds and night owls, officially.'); } },
      { id: 'cope', label: 'We will cope', desc: 'Free.', apply: (c) => c.api.note('Someone bought a bean bag.') }
    ],
    auto: 'cope'
  },
  {
    id: 'pipe_burst', cat: 'infra', title: 'A Pipe Burst', weight: 3, expires: 2, minStage: 'tiny',
    cond: (s) => s.office.tier !== 'garage',
    text: () => 'A pipe burst over the far end of the office. There is a lot of water and a lot of wet laptops.',
    choices: [
      { id: 'repair', label: 'Emergency repairs tonight', cost: (s) => Math.max(4000, (s.stats.rentDay || 200) * 12), desc: 'Back to normal tomorrow.',
        apply: (c) => c.api.note('Plumbers, fans and new laptops. Normal service tomorrow.') },
      { id: 'wfh', label: 'Everyone works from home for a week', desc: 'Free. Collaboration suffers.',
        apply: (c) => { c.api.boost('wfh_week', { deptBonus: -0.12 }, 7); c.api.energy(0.05); c.api.note('A week of video calls.'); } }
    ],
    auto: 'wfh'
  }
];

// Reactions to things that just happened in the simulation. `check` returns a
// subject for spawnEvent, or null. Each trigger has its own cooldown.
export const TRIGGERS = [
  { event: 'launch_stampede', cooldown: 25,
    check: (s) => (s.lastLaunch && s.lastLaunch.outcome === 'viral' && s.time.day - s.lastLaunch.day < 1
      ? { name: null, data: { productId: s.lastLaunch.product } } : null) },
  { event: 'launch_flop_response', cooldown: 20,
    check: (s) => (s.lastLaunch && s.lastLaunch.outcome === 'flop' && s.time.day - s.lastLaunch.day < 1
      ? { name: null, data: { productId: s.lastLaunch.product } } : null) },
  { event: 'launch_party', cooldown: 30,
    check: (s) => (s.lastLaunch && s.lastLaunch.outcome === 'hit' && s.time.day - s.lastLaunch.day < 1 && staff(s).length >= 4
      ? { name: null, data: { productId: s.lastLaunch.product } } : null) },
  { event: 'rival_poach', cooldown: 20,
    check: (s) => {
      const r = s.rivalState?.poachRequest;
      if (!r || s.time.day - r.day > 3) return null;
      s.rivalState.poachRequest = null;
      const rival = s.competitors.find((c) => c.id === r.rival && c.alive && !c.acquired);
      const e = best(staff(s).filter((x) => !(x.traits || []).includes('loyal')));
      return rival && e ? { name: rival.name, id: e.id, data: { rivalId: rival.id } } : null;
    } },
  { event: 'rival_lawsuit', cooldown: 40,
    check: (s) => {
      const r = s.rivalState?.lawsuit;
      if (!r || s.time.day - r.day > 3) return null;
      s.rivalState.lawsuit = null;
      const rival = s.competitors.find((c) => c.id === r.rival && c.alive && !c.acquired);
      return rival && live(s).length ? rivalSubj(rival) : null;
    } },
  { event: 'rival_layoffs_opportunity', cooldown: 30,
    check: (s) => {
      const r = s.rivalState?.lastStumble;
      if (!r || s.time.day - r.day > 2 || r.used) return null;
      r.used = true;
      const rival = s.competitors.find((c) => c.id === r.rival && c.alive && !c.acquired);
      return rival && staff(s).length >= 2 ? rivalSubj(rival) : null;
    } },
  { event: 'rival_copy_response', cooldown: 25,
    check: (s) => {
      const m = s.rivalState?.lastMove;
      if (!m || m.kind !== 'copy' || !m.aimed || s.time.day - m.day > 2 || m.used) return null;
      m.used = true;
      return rivalSubj(s.competitors.find((c) => c.id === m.rival));
    } },
  { event: 'downturn_talent', cooldown: 60,
    check: (s) => (['downturn', 'recession'].includes(s.market?.economy) && s.market.history?.[0]?.kind === 'economy'
      && s.time.day - s.market.history[0].day < 2 && s.employees.length >= 2 ? { name: null } : null) },
  { event: 'boom_money', cooldown: 60,
    check: (s) => (s.market?.economy === 'boom' && s.market.history?.[0]?.kind === 'economy'
      && s.time.day - s.market.history[0].day < 2 && s.company.stage !== 'solo' ? { name: null } : null) },
  { event: 'trend_opportunity', cooldown: 45,
    check: (s) => {
      const h = s.market?.history?.[0];
      if (!h || h.kind !== 'trend' || s.time.day - h.day > 2) return null;
      if (s.products.some((p) => p.category === h.cat)) return null;
      const t = (s.market.trends || []).find((x) => x.cat === h.cat);
      if (!t) return null;
      const names = { ai_rush: 'The AI Gold Rush', app_season: 'An App Store spotlight', remote_work: 'A remote-work wave',
        dev_renaissance: 'A developer renaissance', security_push: 'A compliance deadline', fintech_boom: 'An open banking boom',
        console_cycle: 'A new console cycle', creator_economy: 'The creator economy', outsourcing: 'An outsourcing wave' };
      if (!names[t.id]) return null;
      return { name: null, data: { cat: h.cat, trendName: names[t.id] } };
    } }
];
