import Phaser from 'phaser';
import { TILE, MAX_ZOOM, labelResolution, buildTextures, personKey, SHIRTS } from './art.js';
import { buildLayout, findPath, roomLabelPos } from './layout.js';

const SPEED = 3.2;          // tiles per second

/** pixelArt mode filters every texture NEAREST; label canvases are the one
 *  place we want LINEAR, so the high-resolution glyphs resample cleanly at
 *  fractional zoom instead of losing rows of pixels. */
function crispLabel(text) {
  text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return text;
}
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

    this.labelResolution = labelResolution(globalThis.devicePixelRatio || 1);
    this.cameras.main.setBackgroundColor('#15131d');
    this.setupCameraControls();
    this.rebuild();

    this.alertText = crispLabel(this.add.text(8, 8, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffd7d7',
      backgroundColor: '#8b1e1e', padding: { x: 6, y: 3 },
      resolution: this.labelResolution
    })).setScrollFactor(0).setDepth(100).setVisible(false);

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
      const pos = roomLabelPos(r, TILE);
      const t = crispLabel(this.add.text(pos.x, pos.y, r.name, {
        fontFamily: 'monospace', fontSize: '9px', color: '#ffe9a8',
        backgroundColor: '#1b1924', padding: { x: 3, y: 1 },
        resolution: this.labelResolution
      })).setOrigin(0.5, 0);
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
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.0015, 0.7, MAX_ZOOM));
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
      if (a.advisor) continue;
      if (!ids.has(id)) { a.sprite.destroy(); a.pip.destroy(); this.agents.delete(id); }
    }
    for (const e of state.employees) {
      if (!this.agents.has(e.id)) this.spawnAgent(e);
    }
    this.syncAdvisors();
  }

  /**
   * Retained advisors appear in the office as visitors. Purely cosmetic: they
   * hold no desk, run no simulation, and are driven by the same pathing as staff.
   */
  syncAdvisors() {
    const state = this.game$.state;
    const hired = state.advisors?.hired || [];
    const want = new Set(hired.map((h) => `adv_${h.id}`));
    for (const [id, a] of [...this.agents]) {
      if (!a.advisor) continue;
      if (!want.has(id)) { a.sprite.destroy(); a.pip.destroy(); this.agents.delete(id); }
    }
    for (const h of hired) {
      const id = `adv_${h.id}`;
      if (this.agents.has(id)) continue;
      const variant = Math.abs(hash(h.id)) % 3;
      const key = personKey('advisor', variant);
      const start = { x: this.layout.doorX, y: this.layout.h - 2 };
      const sprite = this.add.sprite(start.x * TILE + TILE / 2, start.y * TILE + TILE / 2, `${key}_down0`);
      sprite.setOrigin(0.5, 0.62).setInteractive({ useHandCursor: true });
      const pip = this.add.rectangle(sprite.x, sprite.y - 14, 4, 4, ACTIVITY_COLORS.meeting);
      this.peopleLayer.add(sprite);
      this.peopleLayer.add(pip);
      this.agents.set(id, {
        id, sprite, pip, key, gx: start.x, gy: start.y, path: [], timer: 1,
        facing: 'down', frame: 0, anim: 0, activity: 'meeting', deskSlot: null, advisor: true
      });
    }
  }

  /** A short, self-destructing burst. Cosmetic only, and off under reduced motion. */
  celebrate() {
    if (this.reducedMotion || !this.layout) return;
    const { w, h } = this.layout;
    const cx = (w * TILE) / 2;
    const cy = (h * TILE) / 2;
    const colours = [0xf2c14e, 0x6ec07a, 0x5aa9e6];
    for (let i = 0; i < 24; i++) {
      const r = this.add.rectangle(
        cx + (Math.random() - 0.5) * w * TILE * 0.5,
        cy + (Math.random() - 0.5) * h * TILE * 0.4,
        3, 3, colours[i % colours.length]
      ).setDepth(60);
      this.tweens.add({
        targets: r, y: r.y - 22 - Math.random() * 28, alpha: 0,
        duration: 800 + Math.random() * 500, onComplete: () => r.destroy()
      });
    }
  }

  /** Roadmap work pulls product and engineering people into visible huddles. */
  roadmapActive() {
    return (this.game$.state.products || []).some((p) => p.roadmap?.active);
  }

  chooseAdvisorDestination(agent) {
    const layout = this.layout;
    const room = layout.rooms.find((r) => r.id === 'exec') || layout.rooms.find((r) => r.id === 'meeting');
    let target = null;
    // Mostly the executive or meeting room, sometimes just walking the floor.
    if (room && Math.random() > 0.35) {
      const spots = [[room.x + 1, room.y + 1], [room.x + 2, room.y + 2], [room.x + 1, room.y + 3], [room.x + 2, room.y + 1]];
      for (let i = 0; i < spots.length && !target; i++) {
        const [x, y] = spots[Math.floor(Math.random() * spots.length)];
        if (layout.walkable[y]?.[x]) target = { x, y };
      }
    }
    if (!target) {
      for (let i = 0; i < 12 && !target; i++) {
        const x = 1 + Math.floor(Math.random() * (layout.w - 2));
        const y = 1 + Math.floor(Math.random() * (layout.h - 2));
        if (layout.walkable[y][x]) target = { x, y };
      }
    }
    if (!target) target = { x: agent.gx, y: agent.gy };
    agent.activity = 'meeting';
    agent.pip.setFillStyle(ACTIVITY_COLORS.meeting);
    agent.path = findPath(layout, { x: agent.gx, y: agent.gy }, target);
    agent.timer = 5 + Math.random() * 9;
  }

  chooseDestination(agent, emp) {
    const layout = this.layout;
    let roll = Math.random();
    const roomOf = (id) => layout.rooms.find((r) => r.id === id);
    let target = null;
    let activity = ROLE_ACTIVITY[emp.role] || 'idle';

    // An active roadmap sends product and engineering people to huddle together.
    if (this.roadmapActive() && ['product', 'engineering', 'design'].includes(emp.dept) && !this.reducedMotion && Math.random() < 0.22) {
      const room = roomOf('meeting') || roomOf('lab') || roomOf('salesfloor');
      if (room) {
        target = { x: room.x + 1 + Math.floor(Math.random() * (room.w - 2)), y: room.y + 2 };
        agent.activity = 'meeting';
        agent.pip.setFillStyle(ACTIVITY_COLORS.meeting);
        agent.path = findPath(layout, { x: agent.gx, y: agent.gy }, target);
        agent.timer = 3 + Math.random() * 5;
        return;
      }
    }

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
      if (k.Q.isDown) cam.setZoom(Phaser.Math.Clamp(cam.zoom - dt * 1.5, 0.7, MAX_ZOOM));
      if (k.E.isDown) cam.setZoom(Phaser.Math.Clamp(cam.zoom + dt * 1.5, 0.7, MAX_ZOOM));
    }

    const state = this.game$.state;
    const empById = new Map(state.employees.map((e) => [e.id, e]));
    for (const agent of this.agents.values()) {
      const emp = empById.get(agent.id);
      if (!emp && !agent.advisor) continue;
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
        if (agent.timer <= 0) {
          if (agent.advisor) this.chooseAdvisorDestination(agent);
          else this.chooseDestination(agent, emp);
        }
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
