import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { step } from '../src/sim/engine.js';
import { hire, fire, promote, setManager, reassign, computeWorkforce, prioritySplit } from '../src/sim/workforce.js';
import { queueProject, createProduct, autoQueueProjects, suggestProject, availableCategories, maxProducts } from '../src/sim/products.js';
import { checkStageUp, stageProgress } from '../src/sim/stages.js';
import { fundingOffers, raise } from '../src/sim/funding.js';
import { startResearch, researchStatus } from '../src/sim/research.js';
import { upgradeOffice, officeOptions, buyRoom } from '../src/sim/office.js';
import { tickCompetitors, acquire, acquisitionTargets } from '../src/sim/competitors.js';
import { spawnEvent, resolveEvent, tickEvents } from '../src/sim/events.js';
import { computeMods } from '../src/sim/modifiers.js';

test('hiring adds an employee and charges the signing bonus; firing costs severance', () => {
  const s = game(11);
  const c = s.candidates[0];
  const cash = s.company.cash;
  const r = hire(s, c.id, mods(s));
  assert.ok(r.ok, r.reason);
  assert.equal(s.employees.length, 2);
  assert.equal(Math.round(cash - s.company.cash), c.signingBonus);

  const before = s.company.cash;
  const f = fire(s, r.employee.id);
  assert.ok(f.ok);
  assert.equal(s.employees.length, 1);
  assert.ok(s.company.cash < before, 'severance is paid');
});

test('hiring is blocked when every desk is taken', () => {
  const s = game(12);
  s.office.deskCapacity = 1;
  const r = hire(s, s.candidates[0].id, mods(s));
  assert.equal(r.ok, false);
  assert.match(r.reason, /desk/i);
});

test('engineering output completes projects and applies their effects', () => {
  const s = game(13);
  const p = s.products[0];
  assert.equal(p.projects[0].typeId, 'mvp');
  run(s, 12);
  assert.equal(p.stage, 'live', 'the founder alone should finish an MVP inside 12 days');
  const q = p.quality;
  queueProject(s, mods(s), p.id, 'feature');
  run(s, 40);
  assert.ok(p.quality > q, 'a feature update raises quality');
  assert.ok(p.completed.includes('feature'));
});

test('department priority changes what the sales mix looks like', () => {
  const s = game(14);
  s.departments.sales.priority = 'smb';
  const low = prioritySplit(s, 'sales');
  s.departments.sales.priority = 'enterprise';
  assert.ok(prioritySplit(s, 'sales') > low);
});

test('an engineering manager keeps the queue full without the player', () => {
  const s = game(15);
  launch(s);
  s.products[0].projects = [];
  const m = mods(s);
  autoQueueProjects(s, m, null);
  assert.equal(s.products[0].projects.length, 0, 'no manager means no automation');

  const mgr = { ...s.employees[0], id: 'm1', role: 'manager', isManager: true, dept: 'engineering', salary: 100000 };
  s.employees.push(mgr);
  setManager(s, 'engineering', 'm1');
  autoQueueProjects(s, computeMods(s), null);
  assert.ok(s.products[0].projects.length > 0, 'a manager queues sensible work');
});

test('stages unlock in order once their requirements are met', () => {
  const s = game(16);
  assert.equal(s.company.stage, 'solo');
  launch(s);
  s.stats.revenueDay = 1e6;
  for (let i = 0; i < 4; i++) s.employees.push({ ...s.employees[0], id: `x${i}`, salary: 0 });
  assert.ok(checkStageUp(s, null), 'tiny should unlock');
  assert.equal(s.company.stage, 'tiny');
  assert.equal(checkStageUp(s, null)?.id, 'seed', 'only one stage per check');
  assert.ok(stageProgress(s).stage.id === 'growing');
});

test('raising a round adds cash and dilutes the founder', () => {
  const s = game(17);
  s.stats.revenueDay = 5000;
  const offer = fundingOffers(s, mods(s)).find((o) => o.id === 'angel');
  assert.ok(offer.available, offer.reason);
  const cash = s.company.cash;
  const r = raise(s, mods(s), 'angel');
  assert.ok(r.ok);
  assert.ok(s.company.cash > cash);
  assert.ok(Math.abs(s.company.founderEquity - 0.88) < 1e-9, `equity ${s.company.founderEquity}`);
  assert.equal(fundingOffers(s, mods(s)).find((o) => o.id === 'angel').available, false, 'not repeatable');
});

test('research costs cash, takes time, and then applies its modifier', () => {
  const s = game(18);
  s.company.stage = 'seed';
  s.company.cash = 200000;
  const m = mods(s);
  assert.equal(researchStatus(s, m, 'ci_cd').state, 'available');
  const r = startResearch(s, m, 'ci_cd');
  assert.ok(r.ok, r.reason);
  assert.equal(s.company.cash, 192000);
  run(s, 1);
  assert.equal(s.research.completed.length, 0, 'still in progress after one day');
  run(s, 4);
  assert.ok(s.research.completed.includes('ci_cd'));
  assert.ok(computeMods(s).devSpeed > 0.1);
});

test('office upgrades need the stage, cost cash, and add desks', () => {
  const s = game(19);
  s.company.cash = 1e6;
  assert.equal(upgradeOffice(s).ok, false, 'suite needs the tiny stage');
  s.company.stage = 'tiny';
  const r = upgradeOffice(s);
  assert.ok(r.ok, r.reason);
  assert.equal(s.office.tier, 'suite');
  assert.equal(s.office.deskCapacity, 14);
  assert.ok(buyRoom(s, 'breakroom').ok);
  assert.ok(computeMods(s).moraleGain > 0);
});

test('competitors take share, and acquiring one removes them', () => {
  const s = game(20);
  s.company.stage = 'scaleup';
  s.company.cash = 1e9;
  const before = s.competitors[0].shares.mobile;
  for (let i = 0; i < 60; i++) tickCompetitors(s, mods(s), 1, null);
  assert.notEqual(s.competitors[0].shares.mobile, before);
  const t = acquisitionTargets(s)[0];
  const r = acquire(s, mods(s), t.id);
  assert.ok(r.ok, r.reason);
  assert.equal(s.competitors.find((c) => c.id === t.id).acquired, true);
});

test('events resolve by choice and ignored events auto-resolve conservatively', () => {
  const s = game(21);
  launch(s);
  const p = spawnEvent(s, 'press');
  assert.ok(p);
  const rep = s.company.reputation;
  assert.ok(resolveEvent(s, mods(s), p.id, 'interview', null).ok);
  assert.ok(s.company.reputation > rep);
  assert.equal(s.events.pending.length, 0);

  const p2 = spawnEvent(s, 'critical_bug');
  s.time.day = p2.expiresDay + 0.01;
  tickEvents(s, mods(s), 0.05, null);
  assert.equal(s.events.pending.find((x) => x.id === p2.id), undefined, 'expired events resolve themselves');
});

test('a new product costs cash and occupies a slot', () => {
  const s = game(22);
  s.company.stage = 'seed';
  s.company.cash = 1e6;
  const m = mods(s);
  assert.ok(maxProducts(s) >= 3);
  const cats = availableCategories(s, m);
  const saas = cats.find((c) => c.id === 'saas');
  const cash = s.company.cash;
  const r = createProduct(s, m, 'saas');
  assert.ok(r.ok, r.reason);
  assert.equal(Math.round(cash - s.company.cash), saas.cost);
  assert.equal(r.product.projects[0].typeId, 'mvp');
});
