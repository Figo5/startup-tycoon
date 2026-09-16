import { clamp, sum } from './util.js';
import { chance, perDay } from './rng.js';
import { categoryById, projectTypeById, PROJECT_TYPES, PRODUCT_CATEGORIES, CUSTOMER_CLASSES } from '../data/products.js';
import { stageOrder } from '../data/stages.js';
import { mul, flat, has } from './modifiers.js';
import { prioritySplit } from './workforce.js';
import { makeProject, makeProduct } from './state.js';

const CLASS_ORDER = ['consumer', 'smb', 'midmarket', 'enterprise'];
const CLASS_CHURN = { consumer: 1.0, smb: 0.7, midmarket: 0.45, enterprise: 0.25 };

export const liveProducts = (state) => state.products.filter((p) => p.stage === 'live');
export const totalCustomers = (p) => sum(CLASS_ORDER, (k) => p.customers[k] || 0);

export function rivalPressure(state, categoryId) {
  let share = 0;
  for (const c of state.competitors) {
    if (!c.alive || c.acquired) continue;
    share += c.shares[categoryId] || 0;
  }
  return clamp(share * 0.45, 0, 0.5);
}

export function marketCap(state, mods, product) {
  const cat = categoryById(product.category);
  const rep = Math.pow(Math.max(0.2, state.company.reputation), 0.65);
  // Shipping four near-identical apps splits one market rather than creating four.
  const siblings = state.products.filter((p) => p.category === product.category && p.stage === 'live').length || 1;
  const cannibal = 1 / Math.pow(Math.max(1, siblings), 0.75);
  return cat.marketBase * rep * mods.stageMarketMul * mul(mods, 'marketSize')
    * (1 + product.marketBonus) * (1 - rivalPressure(state, product.category)) * cannibal;
}

export function supportCoverage(state, mods, wf) {
  let demand = 0;
  for (const p of liveProducts(state)) {
    const cat = categoryById(p.category);
    demand += (totalCustomers(p) / 1000) * cat.supportLoad * (1 + p.supportLoadMod);
  }
  for (const c of state.contracts) demand += c.supportLoad;
  if (demand < 0.4) return 1;
  return clamp((wf.out.support || 0) / demand, 0, 1.6);
}

export function classMix(state, mods, product) {
  const cat = categoryById(product.category);
  const salesSplit = prioritySplit(state, 'sales');   // 0 = SMB volume, 1 = enterprise
  const up = clamp(product.enterpriseReady * mul(mods, 'enterpriseConv') * (0.35 + salesSplit * 1.0), 0, 0.62);
  const mix = CLASS_ORDER.map((k) => cat.classMix[k] || 0);
  for (let i = 0; i < 3; i++) { const move = mix[i] * up; mix[i] -= move; mix[i + 1] += move; }
  const t = sum(mix) || 1;
  return Object.fromEntries(CLASS_ORDER.map((k, i) => [k, mix[i] / t]));
}

/** Engineering capacity is split across products that have queued work. */
export function distributeEngineering(state, mods, wf, days) {
  const working = state.products.filter((p) => p.projects.length > 0);
  if (!working.length) return [];
  const weights = working.map((p) => Math.max(0.1, p.priority));
  const total = sum(weights);
  const engSplit = prioritySplit(state, 'engineering');    // 0 = ship, 1 = quality
  const shipMul = 1.08 - engSplit * 0.16;
  const completed = [];

  working.forEach((p, i) => {
    const debtDrag = clamp(1 - p.techDebt * 0.35, 0.35, 1);
    let work = wf.out.eng * (weights[i] / total) * shipMul * debtDrag * days;
    let guard = 0;
    while (work > 0 && p.projects.length && guard++ < 8) {
      const prj = p.projects[0];
      const need = prj.work - prj.done;
      const applied = Math.min(need, work);
      prj.done += applied;
      work -= applied;
      if (prj.done >= prj.work - 1e-9) {
        p.projects.shift();
        applyProjectEffects(state, mods, p, prj);
        completed.push({ product: p, project: prj });
      }
    }
  });
  return completed;
}

export function applyProjectEffects(state, mods, p, prj) {
  const type = projectTypeById(prj.typeId);
  if (!type) return;
  const e = type.effects || {};
  const gainMul = mul(mods, 'projectQuality');
  const debtMul = e.debt > 0 ? mul(mods, 'debtRate', -0.85) : 1;

  if (e.launch) {
    p.stage = 'live';
    p.launchedDay = state.time.day;
    const cat = categoryById(p.category);
    p.users = cat.seedUsers * Math.pow(Math.max(0.3, state.company.reputation), 0.6);
  }
  if (e.quality) p.quality = clamp(p.quality + e.quality * gainMul, 0, 1);
  if (e.reliability) p.reliability = clamp(p.reliability + e.reliability, 0, 1);
  if (e.debt) p.techDebt = clamp(p.techDebt + e.debt * debtMul, 0, 3);
  if (e.version) p.version = Math.round((p.version + e.version) * 10) / 10;
  if (e.market) p.marketBonus += e.market * gainMul;
  if (e.infraEff) p.infraEff = clamp(p.infraEff + e.infraEff, -0.6, 0.8);
  if (e.enterpriseReady) p.enterpriseReady = clamp(p.enterpriseReady + e.enterpriseReady, 0, 1);
  if (e.security) p.security = clamp(p.security + e.security, 0, 1);
  if (e.supportLoad) p.supportLoadMod += e.supportLoad;
  if (e.reputation) state.company.reputation += e.reputation * mul(mods, 'reputationGain');
  if (!p.completed.includes(prj.typeId)) p.completed.push(prj.typeId);
}

export function projectAvailable(state, mods, p, type) {
  if (type.id === 'mvp') return p.stage === 'development' && !p.projects.some((x) => x.typeId === 'mvp');
  if (p.stage !== 'live') return false;
  if (!type.repeatable && (p.completed.includes(type.id) || p.projects.some((x) => x.typeId === type.id))) return false;
  const req = type.requires;
  if (req?.stage && stageOrder(state.company.stage) < stageOrder(req.stage)) return false;
  if (req?.research && !state.research.completed.includes(req.research)) return false;
  return true;
}

export function queueProject(state, mods, productId, typeId) {
  const p = state.products.find((x) => x.id === productId);
  const type = projectTypeById(typeId);
  if (!p || !type) return { ok: false, reason: 'Unknown project.' };
  if (!projectAvailable(state, mods, p, type)) return { ok: false, reason: 'Not available for this product.' };
  if (p.projects.length >= 4) return { ok: false, reason: 'Project queue is full.' };
  p.projects.push(makeProject(p, type));
  return { ok: true };
}

/** What a competent manager would pick next for this product. */
export function suggestProject(state, mods, p) {
  const avail = PROJECT_TYPES.filter((t) => projectAvailable(state, mods, p, t));
  const pickBy = (id) => avail.find((t) => t.id === id);
  if (p.stage === 'development') return pickBy('mvp') || null;
  const split = prioritySplit(state, 'engineering');
  if (p.techDebt > 0.55) return pickBy('refactor') || pickBy('reliability') || avail[0] || null;
  if (p.reliability < 0.78) return pickBy('reliability') || avail[0] || null;
  const infraTight = state.infra.load > state.infra.capacity * 0.85;
  if (infraTight) { const perf = pickBy('performance'); if (perf) return perf; }
  if (split > 0.65) return pickBy('reliability') || pickBy('refactor') || pickBy('security') || avail[0] || null;
  if (split < 0.35) return pickBy('feature') || pickBy('aifeature') || avail[0] || null;
  const ent = has(mods, 'enterprise_features') ? pickBy('enterprise') : null;
  return pickBy('feature') || ent || pickBy('mobileport') || avail[0] || null;
}

export function autoQueueProjects(state, mods, log) {
  const engManaged = !!state.departments.engineering.managerId;
  if (!engManaged) return;
  const all = has(mods, 'autoProjects');
  const targets = all ? state.products : [state.products.slice().sort((a, b) => b.priority - a.priority)[0]];
  for (const p of targets) {
    if (!p || p.projects.length) continue;
    const t = suggestProject(state, mods, p);
    if (!t) continue;
    p.projects.push(makeProject(p, t));
    log?.(`Engineering queued ${t.name} on ${p.name}.`, 'info');
  }
}

export function tickProducts(state, mods, wf, days, log) {
  const coverage = supportCoverage(state, mods, wf);
  state.stats.supportCoverage = coverage;
  const prodSplit = prioritySplit(state, 'product');       // 0 growth, 1 retention
  const supSplit = prioritySplit(state, 'support');        // 0 speed(churn), 1 upsell
  const mktSplit = prioritySplit(state, 'marketing');      // 0 acquisition, 1 brand
  const salesSplit = prioritySplit(state, 'sales');

  const liveList = liveProducts(state);
  const budget = Math.max(0, state.company.marketingBudget);
  const marketingPower = (0.35 + (wf.out.marketing || 0) * 0.02) * (1 - mktSplit * 0.45);
  const prodPower = (wf.out.product || 0) + (wf.out.design || 0) * 0.6;

  const weightTotal = sum(liveList, (p) => Math.max(0.1, p.priority)) || 1;

  let revenue = 0;
  for (const p of state.products) {
    const cat = categoryById(p.category);
    if (p.stage !== 'live') { p.revenueDay = 0; continue; }
    const share = Math.max(0.1, p.priority) / weightTotal;
    const cap = Math.max(50, marketCap(state, mods, p));
    const outage = p.outage > 0;

    // --- acquisition ---
    const qualityMul = 0.45 + 0.85 * p.quality;
    const organic = cat.growth * (1 + cat.viral * (p.quality - 0.5)) * qualityMul;
    // Marketing saturates: the more you pour into one market, the less each dollar buys.
    const spend = budget * share;
    const diminish = 1 / (1 + spend / Math.max(250, cap * 0.02));
    const paid = spend * cat.marketingUsers * marketingPower * diminish;
    const sold = (wf.out.sales || 0) * cat.salesPull * share * 0.6 * (0.7 + salesSplit * 0.6);
    const growthGain = (1 + prodPower * 0.004 * (1 - prodSplit));
    const room = clamp(1 - p.users / cap, -0.5, 1);
    let gain = (organic * p.users * room + (paid + sold) * Math.max(0.05, room)) * growthGain;
    if (outage) gain *= 0.2;

    // --- churn ---
    const covBonus = clamp(coverage, 0, 1.2) * (0.3 + (1 - supSplit) * 0.25);
    let churnRate = cat.churn
      * (1.6 - 0.8 * p.quality)
      * (1 + p.techDebt * 0.5)
      * (1 + (1 - p.reliability * state.infra.reliability) * 1.2)
      * (1 - covBonus * 0.5)
      * (1 - prodSplit * 0.18)
      * mul(mods, 'churn');
    if (coverage < 1) churnRate *= 1 + (1 - coverage) * 0.3;
    if (outage) churnRate *= 2.5;
    churnRate = Math.max(0.0005, churnRate);

    const before = p.users;
    p.users = Math.max(0, p.users + (gain - p.users * churnRate) * days);
    p.growthDay = (p.users - before) / Math.max(days, 1e-6);
    p.churnDay = churnRate;

    // --- paying conversion, moved toward target so batching stays stable ---
    const convTarget = p.users * cat.conversion * (0.6 + 0.8 * p.quality)
      * mul(mods, 'conversion') * (1 + supSplit * 0.2 + coverage * 0.08);
    const cur = totalCustomers(p);
    const next = cur + (convTarget - cur) * clamp(0.25 * days, 0, 1);
    const mix = classMix(state, mods, p);
    const delta = next - cur;
    for (const k of CLASS_ORDER) {
      if (delta >= 0) p.customers[k] = Math.max(0, (p.customers[k] || 0) + delta * mix[k]);
      else p.customers[k] = Math.max(0, (p.customers[k] || 0) * (1 + (delta / Math.max(cur, 1)) * CLASS_CHURN[k]));
    }

    // --- revenue ---
    const paying = totalCustomers(p);
    let rev = Math.max(0, p.users - paying) * cat.arpu.free;
    for (const k of CLASS_ORDER) rev += (p.customers[k] || 0) * (cat.arpu[k] || 0);
    rev *= mul(mods, 'revenue');
    if (outage) rev *= 0.55;
    p.revenueDay = rev;
    revenue += rev;

    // --- decay ---
    p.quality = clamp(p.quality - 0.0016 * days, 0, 1);
    p.techDebt = clamp(p.techDebt + 0.0022 * days * mul(mods, 'debtRate', -0.85), 0, 3);
    p.reliability = clamp(p.reliability - 0.0009 * days, 0, 1);
    if (p.outage > 0) {
      p.outage = Math.max(0, p.outage - days);
      if (p.outage === 0) log?.(`${p.name} is back online.`, 'good');
    }
  }

  // Reputation drifts toward a level justified by scale and product quality.
  const bestQuality = liveList.length ? Math.max(...liveList.map((x) => x.quality)) : 0.4;
  const totalUsers = sum(liveList, (x) => x.users);
  const scaleRep = 1 + Math.log10(1 + revenue / 200) * 0.85 + bestQuality * 0.8
    + Math.log10(1 + totalUsers / 5000) * 0.3;
  const repRate = 0.035 * mul(mods, 'reputationGain') * (1 + mktSplit * 0.8 + (wf.out.marketing || 0) * 0.004);
  state.company.reputation += (scaleRep - state.company.reputation) * clamp(repRate * days, 0, 0.6);
  state.company.reputation = clamp(state.company.reputation, 0.2, 60);

  return { revenue, coverage };
}

export { CLASS_ORDER, CLASS_CHURN };

export function productCost(categoryId, state) {
  const cat = categoryById(categoryId);
  return Math.round(cat.mvpWork * 120 * (1 + state.products.length * 0.25));
}

export function availableCategories(state, mods) {
  return PRODUCT_CATEGORIES.map((cat) => {
    const u = cat.unlock;
    const stageOk = !u?.stage || stageOrder(state.company.stage) >= stageOrder(u.stage);
    const researchOk = !u?.research || state.research.completed.includes(u.research);
    const cost = productCost(cat.id, state);
    const slots = maxProducts(state);
    const roomOk = state.products.length < slots;
    return {
      ...cat, cost,
      available: stageOk && researchOk && roomOk && state.company.cash >= cost,
      reason: !stageOk ? `Needs the ${u.stage} stage`
        : !researchOk ? 'Needs research'
        : !roomOk ? `Product slots full (${slots})`
        : state.company.cash < cost ? 'Not enough cash' : null
    };
  });
}

/** Product slots open up with company stage, so early runs stay focused. */
export function maxProducts(state) {
  return 1 + Math.max(0, stageOrder(state.company.stage));
}

export function createProduct(state, mods, categoryId, name) {
  const opt = availableCategories(state, mods).find((c) => c.id === categoryId);
  if (!opt) return { ok: false, reason: 'Unknown category.' };
  if (!opt.available) return { ok: false, reason: opt.reason || 'Not available.' };
  state.company.cash -= opt.cost;
  const p = makeProduct(state.rng, categoryId, name);
  p.projects.push(makeProject(p, projectTypeById('mvp')));
  state.products.push(p);
  return { ok: true, product: p };
}
