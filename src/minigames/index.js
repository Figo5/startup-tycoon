// Three short optional activities. All are turn-based - no reflex required -
// and every one is fully playable with the keyboard.
// Each resolves to a score in 0..1 which the caller converts into a bonus.

// Deliberately free of look-alike pairs: no two glyphs differ only by weight or by
// a stroke count you have to squint at. 24 symbols covers the largest trace (18 needed).
const TOKENS = ['λ', '∑', '⧉', '≡', '⊞', '⊕', '△', '◇', '✕', '⌁', '❖', '§',
  '¤', 'Ω', 'Ψ', 'Φ', 'Θ', '⊥', '∅', '≈', '¶', '∞', '♫', '☂'];
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const MINIGAMES = {
  debugging: { name: 'Debugging', blurb: 'Three stack traces. In each one, exactly one frame appears only once. Find it.' },
  incident: { name: 'Incident Response', blurb: 'Route the capacity you have across the services that are failing.' },
  negotiation: { name: 'Negotiation', blurb: 'Read what the buyer actually cares about and counter accordingly.' },
  pitch: { name: 'Investor Pitch', blurb: 'Three questions. Lead with what is genuinely strongest about your company - they will check.' }
};

export function playMinigame(type, host, ctx = null) {
  if (type === 'debugging') return debugging(host);
  if (type === 'incident') return incident(host);
  if (type === 'negotiation') return negotiation(host);
  if (type === 'pitch') return pitch(host, ctx);
  return Promise.resolve(0);
}

// ----------------------------------------------------------------- pitch
// Built from the company's real numbers. Each answer is a talking point with a
// strength in 0..1; the right answer is the strongest one (or, for the one
// question about risks, the honest weakest one). No trick, no timer.
function pitch(host, facts) {
  const f = facts || {};
  const pctS = (v) => `${Math.round(v * 100)}%`;
  const QUESTIONS = [
    { q: 'What makes this company special?', options: [
      { t: `Growth: revenue moving ${f.growth >= 0 ? '+' : ''}${pctS(f.growth || 0)} a month`, s: Math.min(1, Math.max(0, (f.growth || 0) / 0.6)) },
      { t: `Retention: ${pctS(f.monthlyChurn || 0)} of users leave a month`, s: Math.max(0, 1 - (f.monthlyChurn || 0) / 0.5) },
      { t: `Margins: ${pctS(f.margin || 0)} of revenue is profit`, s: Math.min(1, Math.max(0, (f.margin || 0) / 0.5)) }
    ] },
    { q: 'Why will you win?', options: [
      { t: `The team: ${f.people || 1} people, average skill ${(f.skill || 5).toFixed(1)}`, s: Math.min(1, ((f.skill || 5) - 3) / 6) },
      { t: `The product: quality ${pctS(f.quality || 0)}`, s: Math.min(1, f.quality || 0) },
      { t: `The brand: reputation ${(f.reputation || 1).toFixed(1)}`, s: Math.min(1, (f.reputation || 1) / 10) }
    ] },
    { q: 'How big can this get?', options: [
      { t: `We have only ${pctS(f.penetration || 0)} of our market so far`, s: Math.max(0, 1 - (f.penetration || 0)) },
      { t: `We are #${f.rank || 9} of ${f.field || 9} on the leaderboard`, s: Math.max(0, 1 - ((f.rank || 9) - 1) / Math.max(1, (f.field || 9) - 1)) },
      { t: f.trend ? `We are riding the ${f.trend}` : 'The market is steady and predictable', s: f.trend ? 0.8 : 0.2 }
    ] },
    { q: 'Who pays you?', options: [
      { t: `${f.users || 0} users`, s: Math.min(1, Math.log10(1 + (f.users || 0)) / 7) },
      { t: `${pctS(f.conversion || 0)} of users pay`, s: Math.min(1, (f.conversion || 0) / 0.25) },
      { t: `${f.contracts || 0} enterprise contracts`, s: Math.min(1, (f.contracts || 0) / 4) }
    ] },
    { q: 'What keeps you up at night?', worst: true, options: [
      { t: `Churn: ${pctS(f.monthlyChurn || 0)} a month`, s: Math.max(0, 1 - (f.monthlyChurn || 0) / 0.5) },
      { t: `Runway: ${f.runwayText || 'profitable'}`, s: f.runwayDays === Infinity ? 1 : Math.min(1, (f.runwayDays || 0) / 365) },
      { t: `Technical debt: ${pctS(f.debt || 0)}`, s: Math.max(0, 1 - (f.debt || 0)) }
    ] }
  ];
  return new Promise((resolve) => {
    const rounds = shuffle(QUESTIONS.slice()).slice(0, 3);
    let i = 0;
    let points = 0;
    const build = () => {
      const r = rounds[i];
      const opts = shuffle(r.options.slice());
      const bestS = r.worst ? Math.min(...opts.map((o) => o.s)) : Math.max(...opts.map((o) => o.s));
      frame(host, `Investor Pitch — question ${i + 1} of 3`, MINIGAMES.pitch.blurb,
        `<div class="tile"><p><b>The partner asks:</b> ${r.q}</p>${r.worst ? '<p class="small muted">They respect honesty. Name the real weak spot.</p>' : ''}</div>
        <div role="group" aria-label="Answers">
          ${opts.map((o, k) => `<button class="choice" data-o="${k}"><b>${k + 1}. ${o.t}</b></button>`).join('')}
        </div>
        <p class="small muted">Answered well so far: ${Math.round(points * 10) / 10}/${i}</p>`);
      const choose = (k) => {
        const o = opts[k];
        const spread = Math.max(1e-6, Math.max(...opts.map((x) => x.s)) - Math.min(...opts.map((x) => x.s)));
        // Partial credit for a nearly-as-good answer.
        points += r.worst ? 1 - (o.s - bestS) / spread : 1 - (bestS - o.s) / spread;
        host.querySelectorAll('.choice').forEach((el, idx) => {
          el.style.borderColor = opts[idx].s === bestS ? 'var(--good)' : (idx === k ? 'var(--bad)' : '');
        });
        i++;
        setTimeout(() => (i < rounds.length ? build() : resolve(Math.max(0, Math.min(1, points / rounds.length)))), 700);
      };
      host.querySelectorAll('[data-o]').forEach((el) => el.addEventListener('click', () => choose(Number(el.dataset.o))));
      host.querySelector('.choice')?.focus();
    };
    build();
  });
}

function frame(host, title, blurb, body, footer = '') {
  host.innerHTML = `<h2>${title}</h2><p class="muted small">${blurb}</p>${body}${footer}`;
}

// ------------------------------------------------------------- debugging
// Every frame appears exactly twice except one. Sizes are chosen so the count is
// always odd, which keeps that promise literally true - no near-identical glyphs,
// no trick. Fully keyboard-playable: Tab to move, Enter or Space to choose.
function debugging(host) {
  return new Promise((resolve) => {
    const rounds = 3;
    let round = 0;
    let correct = 0;

    const build = () => {
      const size = 4 + round;                         // 4x4 -> 6x6 worth of cells
      const pairs = Math.floor((size * size - 1) / 2); // 7, 12, 17
      const symbols = shuffle(TOKENS.slice()).slice(0, pairs + 1);
      const pool = [];
      for (let i = 0; i < pairs; i++) pool.push(symbols[i], symbols[i]);
      const unique = symbols[pairs];
      pool.push(unique);
      const grid = shuffle(pool);                      // exactly 2*pairs + 1 cells

      frame(host, `Debugging — trace ${round + 1} of ${rounds}`,
        MINIGAMES.debugging.blurb,
        `<div class="mg-grid" style="grid-template-columns:repeat(${size},1fr)" role="group" aria-label="Stack frames">
          ${grid.map((t, i) => `<button class="mg-cell" data-i="${i}" aria-label="frame ${i + 1}, symbol ${t}">${t}</button>`).join('')}
        </div>
        <p class="small muted">Click a frame, or Tab to it and press Enter. Correct so far: ${correct}/${round}</p>
        <button class="btn secondary" data-skip="1">Give up</button>`);

      const finish = (i) => {
        if (grid[i] === unique) correct++;
        host.querySelectorAll('.mg-cell').forEach((el, idx) => {
          if (grid[idx] === unique) el.classList.add('correct');
          else if (idx === i) el.classList.add('wrong');
          el.disabled = true;
        });
        round++;
        setTimeout(() => (round < rounds ? build() : resolve(correct / rounds)), 620);
      };

      host.querySelectorAll('.mg-cell').forEach((el) =>
        el.addEventListener('click', () => finish(Number(el.dataset.i))));
      host.querySelector('[data-skip]').addEventListener('click', () => resolve(correct / rounds));
      host.querySelector('.mg-cell')?.focus();
    };
    build();
  });
}

// -------------------------------------------------------------- incident
function incident(host) {
  return new Promise((resolve) => {
    const names = ['API gateway', 'Database', 'Queue workers', 'Auth service', 'Static edge'];
    const services = shuffle(names).slice(0, 4).map((n) => ({
      name: n, demand: 2 + rnd(7), weight: 1 + rnd(3), given: 0
    }));
    const budget = Math.max(6, Math.round(services.reduce((a, s) => a + s.demand, 0) * 0.72));

    const score = () => {
      let got = 0;
      let best = 0;
      const ideal = services.slice().sort((a, b) => b.weight / b.demand - a.weight / a.demand);
      let left = budget;
      for (const s of ideal) { const give = Math.min(s.demand, left); best += (give / s.demand) * s.weight; left -= give; }
      for (const s of services) got += (Math.min(s.given, s.demand) / s.demand) * s.weight;
      return best > 0 ? Math.min(1, got / best) : 0;
    };

    const render = () => {
      const used = services.reduce((a, s) => a + s.given, 0);
      frame(host, 'Incident Response', MINIGAMES.incident.blurb,
        `<p class="spread"><span>Spare capacity</span><b>${budget - used} / ${budget} units</b></p>
        ${services.map((s, i) => `
          <div class="tile" style="margin-bottom:8px">
            <div class="spread"><b>${s.name}</b><span class="tag">impact x${s.weight}</span></div>
            <div class="spread small"><span>needs ${s.demand} units</span><span>allocated ${s.given}</span></div>
            <div class="bar ${s.given >= s.demand ? 'good' : 'warn'}"><i style="width:${Math.min(100, (s.given / s.demand) * 100)}%"></i></div>
            <div class="row" style="margin-top:6px">
              <button class="ghost" data-d="-1" data-i="${i}" aria-label="remove a unit from ${s.name}">−</button>
              <button class="ghost" data-d="1" data-i="${i}" aria-label="add a unit to ${s.name}">+</button>
            </div>
          </div>`).join('')}
        <div class="row"><button class="btn" data-done="1">Apply routing</button>
        <button class="btn secondary" data-skip="1">Hand it to the team</button></div>
        <p class="small muted">Highest impact per unit first is usually right. Tab reaches every control.</p>`);

      host.querySelectorAll('[data-d]').forEach((el) => el.addEventListener('click', () => {
        const s = services[Number(el.dataset.i)];
        const d = Number(el.dataset.d);
        const used2 = services.reduce((a, x) => a + x.given, 0);
        if (d > 0 && used2 >= budget) return;
        s.given = Math.max(0, s.given + d);
        render();
      }));
      host.querySelector('[data-done]').addEventListener('click', () => resolve(score()));
      host.querySelector('[data-skip]').addEventListener('click', () => resolve(0.35));
    };
    render();
  });
}

// ----------------------------------------------------------- negotiation
const TELLS = [
  { clue: 'They keep asking about uptime guarantees and incident history.', right: 'Offer a stronger SLA instead of a discount' },
  { clue: 'Their procurement lead mentions the fiscal year ends in six weeks.', right: 'Offer a shorter first term with an early renewal' },
  { clue: 'Every question comes back to the per-seat price.', right: 'Offer volume tiers that reward growth' },
  { clue: 'Their security team has already sent a 40-page questionnaire.', right: 'Offer a dedicated compliance review' },
  { clue: 'They mention two competitors by name, repeatedly.', right: 'Offer a paid pilot with a clean exit' },
  { clue: 'The champion is new and needs an obvious early win.', right: 'Offer white-glove onboarding' }
];
const DISTRACTORS = ['Hold firm and wait', 'Offer a 30% discount', 'Bundle an unrelated product',
  'Escalate to their CFO', 'Offer perpetual free support', 'Add unlimited custom development'];

function negotiation(host) {
  return new Promise((resolve) => {
    const rounds = shuffle(TELLS.slice()).slice(0, 3);
    let i = 0;
    let correct = 0;

    const build = () => {
      const r = rounds[i];
      const options = shuffle([r.right, ...shuffle(DISTRACTORS.slice()).slice(0, 2)]);
      frame(host, `Negotiation — round ${i + 1} of 3`, MINIGAMES.negotiation.blurb,
        `<div class="tile"><p><b>They said:</b> ${r.clue}</p></div>
        <div role="group" aria-label="Counter-offers">
          ${options.map((o, k) => `<button class="choice" data-o="${k}"><b>${k + 1}. ${o}</b></button>`).join('')}
        </div>
        <p class="small muted">Correct so far: ${correct}/${i}</p>`);

      const pick = (k) => {
        if (options[k] === r.right) correct++;
        host.querySelectorAll('.choice').forEach((el, idx) => {
          el.style.borderColor = options[idx] === r.right ? 'var(--good)' : (idx === k ? 'var(--bad)' : '');
        });
        i++;
        setTimeout(() => (i < rounds.length ? build() : resolve(correct / rounds.length)), 640);
      };
      host.querySelectorAll('[data-o]').forEach((el) => el.addEventListener('click', () => pick(Number(el.dataset.o))));
      const onKey = (e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= 3) { document.removeEventListener('keydown', onKey); pick(n - 1); }
      };
      document.addEventListener('keydown', onKey, { once: true });
      host.querySelector('.choice')?.focus();
    };
    build();
  });
}
