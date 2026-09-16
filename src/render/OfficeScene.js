import Phaser from 'phaser';
import { TILE, buildTextures, personKey, SHIRTS } from './art.js';
import { buildLayout, findPath } from './layout.js';

const SPEED = 3.2;          // tiles per second
const ACTIVITY_COLORS = {
  coding: 0x5aa9e6, meeting: 0xf2b134, selling: 0xef6f6c, supporting: 0x6ec07a,
  fixing: 0xa184e0, researching: 0x4db6ac, break: 0xf2c14e, idle: 0x8a8a9a
};

const ROLE_ACTIVITY = {
  founder: 'coding', engineer: 'coding', senior_engineer: 'coding', designer: 'coding',
  pm: 'meeting', marketer: 'selling', sales_rep: 'selling', support_specialist: 'supporting',
  infra_engineer: 'fixing', manager: 'meeting'
};

export default class OfficeScene extends Phaser.Scene {
  constructor() {
    super('office');
    this.agents = new Map();
    this.layoutKey = null;
    this.reducedMotion = false;
  }

  init(data) {
    this.game$ = data.game$;              // { state, onSelectEmployee }
    this.reducedMotion = data.reducedMotion || false;
  }

  create() {
    buildTextures(this);
    this.floorRT = null;
    this.peopleLayer = this.add.container(0, 0).setDepth(10);
    this.labelLayer = this.add.container(0, 0).setDepth(20);

    this.cameras.main.setBackgroundColor('#15131d');
    this.setupCameraControls();
    this.rebuild();

    this.alertText = this.add.text(8, 8, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffd7d7',
      backgroundColor: '#8b1e1e', padding: { x: 6, y: 3 }
    }).setScrollFactor(0).setDepth(100).setVisible(false);

    this.scale.on('resize', () => this.time.delayedCall(40, () => this.clampCamera()));
  }

  /** Rebuilds the floor when the office tier or rooms change. */
  rebuild() {
    const state = this.game$.state;
    const key = `${state.office.tier}|${state.office.rooms.slice().sort().join(',')}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    this.layout = buildLayout(state.office.tier, state.office.rooms);

    const { w, h, tiles, furniture } = this.layout;
    // Recreated rather than resized: a RenderTexture keeps its original backing
    // texture size, so a resized one silently clips everything outside it.
    this.floorRT?.destroy();
    this.floorRT = this.add.renderTexture(0, 0, w * TILE, h * TILE).setOrigin(0, 0).setDepth(0);
    this.floorRT.beginDraw();
    const tileKey = { '#': 'tile_wall', '=': 'tile_window', '+': 'tile_door', '.': 'tile_floor', ',': 'tile_floor2', c: 'tile_carpet' };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.floorRT.batchDraw(tileKey[tiles[y][x]] || 'tile_floor', x * TILE, y * TILE);
      }
    }
    for (const f of furniture) this.floorRT.batchDraw(`fx_${f.key}`, f.x * TILE, f.y * TILE);
    this.floorRT.endDraw();

    this.labelLayer.removeAll(true);
    for (const r of this.layout.rooms) {
      const t = this.add.text((r.x + r.w / 2) * TILE, (r.y - 0.35) * TILE, r.name, {
        fontFamily: 'monospace', fontSize: '9px', color: '#ffe9a8',
        backgroundColor: '#1b1924', padding: { x: 3, y: 1 }
      }).setOrigin(0.5, 0);
      this.labelLayer.add(t);
    }

    this.cameras.main.setBounds(-TILE * 2, -TILE * 2, w * TILE + TILE * 4, h * TILE + TILE * 4);
    this.recentre();
    this.time.delayedCall(80, () => this.recentre());
    for (const a of this.agents.values()) a.deskSlot = null;
  }

  setupCameraControls() {
    const cam = this.cameras.main;
    cam.setZoom(2);
    this.input.on('pointermove', (p) => {
      if (!p.isDown || this.dragTarget) return;
      this.userPanned = true;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('wheel', (p, over, dx, dy) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.0015, 0.7, 4));
    });
    const keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,Q,E');
    this.camKeys = keys;
  }

  recentre() {
    if (!this.layout) return;
    const { w, h } = this.layout;
    const cam = this.cameras.main;
    const fit = Math.min(cam.width / (w * TILE), cam.height / (h * TILE));
    cam.setZoom(Phaser.Math.Clamp(fit * 0.95, 0.7, 3.2));
    cam.centerOn((w * TILE) / 2, (h * TILE) / 2);
  }

  clampCamera() { if (!this.userPanned) this.recentre(); }

  freeDeskSlot() {
    const taken = new Set([...this.agents.values()].map((a) => a.deskSlot && `${a.deskSlot.x},${a.deskSlot.y}`));
    return this.layout.deskSlots.find((s) => !taken.has(`${s.x},${s.y}`)) || null;
  }

  spawnAgent(emp) {
    const dept = SHIRTS[emp.dept] ? emp.dept : 'neutral';
    const variant = Math.abs(hash(emp.id)) % 3;
    const key = personKey(emp.id === 'founder' ? 'founder' : dept, variant);
    const start = { x: this.layout.doorX, y: this.layout.h - 2 };
    const sprite = this.add.sprite(start.x * TILE + TILE / 2, start.y * TILE + TILE / 2, `${key}_down0`);
    sprite.setOrigin(0.5, 0.62).setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', (p, lx, ly, e) => {
      e?.stopPropagation?.();
      this.game$.onSelectEmployee?.(emp.id);
    });
    const pip = this.add.rectangle(sprite.x, sprite.y - 14, 4, 4, ACTIVITY_COLORS.idle);
    this.peopleLayer.add(sprite);
    this.peopleLayer.add(pip);
    const agent = {
      id: emp.id, sprite, pip, key, gx: start.x, gy: start.y,
      path: [], timer: 0, facing: 'down', frame: 0, anim: 0,
      activity: 'idle', deskSlot: null
    };
    this.agents.set(emp.id, agent);
    return agent;
  }

  syncAgents() {
    const state = this.game$.state;
    const ids = new Set(state.employees.map((e) => e.id));
    for (const [id, a] of this.agents) {
      if (!ids.has(id)) { a.sprite.destroy(); a.pip.destroy(); this.agents.delete(id); }
    }
    for (const e of state.employees) {
      if (!this.agents.has(e.id)) this.spawnAgent(e);
    }
  }

  chooseDestination(agent, emp) {
    const layout = this.layout;
    let roll = Math.random();
    const roomOf = (id) => layout.rooms.find((r) => r.id === id);
    let target = null;
    let activity = ROLE_ACTIVITY[emp.role] || 'idle';

    if (this.reducedMotion) roll = 0;
    if (roll < 0.62) {
      if (!agent.deskSlot) agent.deskSlot = this.freeDeskSlot();
      target = agent.deskSlot;
      activity = ROLE_ACTIVITY[emp.role] || 'coding';
    } else if (roll < 0.74 && roomOf('breakroom')) {
      const r = roomOf('breakroom');
      target = { x: r.x + 1 + Math.floor(Math.random() * (r.w - 2)), y: r.y + 1 + Math.floor(Math.random() * (r.h - 2)) };
      activity = 'break';
    } else if (roll < 0.84 && roomOf('meeting')) {
      const r = roomOf('meeting');
      target = { x: r.x + 1 + Math.floor(Math.random() * (r.w - 2)), y: r.y + 2 };
      activity = 'meeting';
    } else if (roll < 0.9 && roomOf('lab')) {
      const r = roomOf('lab');
      target = { x: r.x + 2, y: r.y + 2 };
      activity = 'researching';
    } else {
      for (let i = 0; i < 12 && !target; i++) {
        const x = 1 + Math.floor(Math.random() * (layout.w - 2));
        const y = 1 + Math.floor(Math.random() * (layout.h - 2));
        if (layout.walkable[y][x]) target = { x, y };
      }
      activity = 'idle';
    }
    if (!target) target = { x: agent.gx, y: agent.gy };
    agent.activity = activity;
    agent.pip.setFillStyle(ACTIVITY_COLORS[activity] || ACTIVITY_COLORS.idle);
    // Pathfinding is cosmetic: if there is no route the agent simply stays put.
    agent.path = findPath(layout, { x: agent.gx, y: agent.gy }, target);
    if (this.reducedMotion && agent.path.length) {
      const last = agent.path[agent.path.length - 1];
      agent.gx = last.x; agent.gy = last.y; agent.path = [];
      agent.sprite.setPosition(last.x * TILE + TILE / 2, last.y * TILE + TILE / 2);
    }
    agent.timer = 2 + Math.random() * 6;
  }

  update(time, delta) {
    if (!this.layout) return;
    const dt = Math.min(delta, 100) / 1000;
    this.rebuild();
    this.syncAgents();

    const cam = this.cameras.main;
    const k = this.camKeys;
    if (k) {
      const pan = 320 * dt / cam.zoom;
      if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= pan;
      if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += pan;
      if (k.W.isDown || k.UP.isDown) cam.scrollY -= pan;
      if (k.S.isDown || k.DOWN.isDown) cam.scrollY += pan;
      if (k.Q.isDown) cam.setZoom(Phaser.Math.Clamp(cam.zoom - dt * 1.5, 0.7, 4));
      if (k.E.isDown) cam.setZoom(Phaser.Math.Clamp(cam.zoom + dt * 1.5, 0.7, 4));
    }

    const state = this.game$.state;
    const empById = new Map(state.employees.map((e) => [e.id, e]));
    for (const agent of this.agents.values()) {
      const emp = empById.get(agent.id);
      if (!emp) continue;
      if (agent.path.length) {
        const next = agent.path[0];
        const tx = next.x * TILE + TILE / 2;
        const ty = next.y * TILE + TILE / 2;
        const dx = tx - agent.sprite.x;
        const dy = ty - agent.sprite.y;
        const dist = Math.hypot(dx, dy);
        const stepLen = SPEED * TILE * dt;
        if (dist <= stepLen) {
          agent.sprite.setPosition(tx, ty);
          agent.gx = next.x; agent.gy = next.y;
          agent.path.shift();
        } else {
          agent.sprite.x += (dx / dist) * stepLen;
          agent.sprite.y += (dy / dist) * stepLen;
        }
        agent.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'side_l' : 'side_r') : (dy < 0 ? 'up' : 'down');
        agent.anim += dt * 7;
        const f = Math.floor(agent.anim) % 2;
        const base = agent.facing.startsWith('side') ? 'side' : agent.facing;
        agent.sprite.setTexture(`${agent.key}_${base}${f}`);
        agent.sprite.setFlipX(agent.facing === 'side_l');
      } else {
        agent.timer -= dt;
        const atDesk = agent.deskSlot && agent.gx === agent.deskSlot.x && agent.gy === agent.deskSlot.y;
        agent.sprite.setTexture(`${agent.key}_${atDesk ? 'sit' : 'down0'}`);
        if (atDesk) agent.sprite.setFlipX(false);
        if (agent.timer <= 0) this.chooseDestination(agent, emp);
      }
      agent.pip.setPosition(agent.sprite.x, agent.sprite.y - 15);
      agent.sprite.setDepth(agent.sprite.y);
      agent.pip.setDepth(agent.sprite.y + 1);
    }

    const down = state.products.filter((p) => p.outage > 0);
    if (down.length) {
      this.alertText.setText(`OUTAGE: ${down.map((p) => p.name).join(', ')}`).setVisible(true);
      this.alertText.setAlpha(0.6 + 0.4 * Math.sin(time / 200));
    } else this.alertText.setVisible(false);
  }
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}
