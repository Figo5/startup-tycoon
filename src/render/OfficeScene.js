import Phaser from 'phaser';
import { TILE, MAX_ZOOM, labelResolution, buildTextures, buildEmotes, personKey, SHIRTS } from './art.js';
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
  fixing: 0xa184e0, researching: 0x4db6ac, break: 0xf2c14e, idle: 0x8a8a9a, firefight: 0xff4d4d, tired: 0x6b6b80
};

const ROLE_ACTIVITY = {
  founder: 'coding', engineer: 'coding', senior_engineer: 'coding', designer: 'coding',
  pm: 'meeting', marketer: 'selling', sales_rep: 'selling', support_specialist: 'supporting',
  infra_engineer: 'fixing', manager: 'meeting'
};
// The emote someone shows while doing their normal job.
const ROLE_EMOTE = {
  founder: 'idea', engineer: 'code', senior_engineer: 'code', designer: 'idea', pm: 'talk',
  marketer: 'talk', sales_rep: 'money', support_specialist: 'talk', infra_engineer: 'fix', manager: 'talk'
};
// Rooms each role works from when they are away from their desk, best first.
const ROLE_ROOMS = {
  sales_rep: ['salesfloor'], marketer: ['podcast', 'salesfloor'], support_specialist: ['support_center'],
  infra_engineer: ['server', 'datacenter', 'war_room'], designer: ['design_studio', 'meeting'],
  pm: ['meeting', 'design_studio', 'exec'], manager: ['exec', 'meeting'],
  engineer: ['lab'], senior_engineer: ['lab', 'war_room'], founder: ['exec', 'meeting', 'podcast']
};
const BREAK_ROOMS = ['cafeteria', 'breakroom', 'gym'];

export default class OfficeScene extends Phaser.Scene {
  constructor() {
    super('office');
    this.agents = new Map();
    this.layoutKey = null;
    this.reducedMotion = false;
    this.seen = { launchDay: null, stage: null, outage: false };
    this.nextStandup = 0;
  }

  init(data) {
    this.game$ = data.game$;              // { state, onSelectEmployee }
    this.reducedMotion = data.reducedMotion || false;
  }

  create() {
    buildTextures(this);
    buildEmotes(this);
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

    // Late-night lighting while the company is crunching. One rectangle, no shaders.
    this.nightShade = this.add.rectangle(0, 0, 10, 10, 0x0a0820, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(90);

    this.scale.on('resize', () => this.time.delayedCall(40, () => this.clampCamera()));
    const st = this.game$.state;
    this.seen.launchDay = st.lastLaunch?.day ?? null;
    this.seen.stage = st.company.stage;
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
    for (const a of this.agents.values()) { a.deskSlot = null; a.path = []; a.timer = 0; }
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
    cam.setZoom(Phaser.Math.Clamp(fit * 0.95, 0.7, MAX_ZOOM));
    cam.centerOn((w * TILE) / 2, (h * TILE) / 2);
  }

  clampCamera() { if (!this.userPanned) this.recentre(); }

  freeDeskSlot() {
    const taken = new Set([...this.agents.values()].map((a) => a.deskSlot && `${a.deskSlot.x},${a.deskSlot.y}`));
    return this.layout.deskSlots.find((s) => !taken.has(`${s.x},${s.y}`)) || null;
  }

  makeAgent(id, key, extra = {}) {
    const start = { x: this.layout.doorX, y: this.layout.h - 2 };
    const sprite = this.add.sprite(start.x * TILE + TILE / 2, start.y * TILE + TILE / 2, `${key}_down0`);
    sprite.setOrigin(0.5, 0.62).setInteractive({ useHandCursor: true });
    const pip = this.add.rectangle(sprite.x, sprite.y - 14, 4, 4, ACTIVITY_COLORS.idle);
    const emote = this.add.image(sprite.x, sprite.y - 22, 'emo_idea').setVisible(false).setDepth(5000);
    const glow = this.add.image(0, 0, 'fx_screen_on').setOrigin(0, 0).setVisible(false).setDepth(1);
    this.peopleLayer.add(glow);
    this.peopleLayer.add(sprite);
    this.peopleLayer.add(pip);
    this.peopleLayer.add(emote);
    const agent = {
      id, sprite, pip, emote, glow, key, gx: start.x, gy: start.y,
      path: [], timer: 0, facing: 'down', frame: 0, anim: 0,
      activity: 'idle', deskSlot: null, busyUntil: 0, emoteUntil: 0, speed: 1, away: false, ...extra
    };
    this.agents.set(id, agent);
    return agent;
  }

  spawnAgent(emp) {
    const dept = SHIRTS[emp.dept] ? emp.dept : 'neutral';
    const variant = Math.abs(hash(emp.id)) % 3;
    const key = personKey(emp.id === 'founder' ? 'founder' : dept, variant);
    const agent = this.makeAgent(emp.id, key);
    agent.sprite.on('pointerdown', (p, lx, ly, e) => {
      e?.stopPropagation?.();
      this.game$.onSelectEmployee?.(emp.id);
    });
    // Anyone arriving after the first frame is a new hire: they wave hello.
    if (this.booted) this.showEmote(agent, 'heart', 2.5);
    return agent;
  }

  destroyAgent(id) {
    const a = this.agents.get(id);
    if (!a) return;
    a.sprite.destroy(); a.pip.destroy(); a.emote.destroy(); a.glow.destroy();
    this.agents.delete(id);
  }

  syncAgents() {
    const state = this.game$.state;
    const ids = new Set(state.employees.map((e) => e.id));
    for (const [id, a] of this.agents) {
      if (a.advisor) continue;
      if (!ids.has(id)) this.destroyAgent(id);
    }
    for (const e of state.employees) {
      if (!this.agents.has(e.id)) this.spawnAgent(e);
    }
    this.syncAdvisors();
    this.booted = true;
  }

  /**
   * Retained advisors appear in the office as visitors. Purely cosmetic: they
   * hold no desk, run no simulation, and are driven by the same pathing as staff.
   */
  syncAdvisors() {
    const state = this.game$.state;
    // Cosmetic only: anything without a usable id is skipped rather than thrown
    // on, so malformed save data can never stall the frame loop.
    const hired = (state.advisors?.hired || []).filter((h) => typeof h?.id === 'string');
    const want = new Set(hired.map((h) => `adv_${h.id}`));
    for (const [id, a] of [...this.agents]) {
      if (!a.advisor) continue;
      if (!want.has(id)) this.destroyAgent(id);
    }
    for (const h of hired) {
      const id = `adv_${h.id}`;
      if (this.agents.has(id)) continue;
      const variant = Math.abs(hash(h.id)) % 3;
      const a = this.makeAgent(id, personKey('advisor', variant), { advisor: true, timer: 1, activity: 'meeting' });
      a.pip.setFillStyle(ACTIVITY_COLORS.meeting);
    }
  }

  // -------------------------------------------------------------- emotes
  showEmote(agent, key, seconds = 2) {
    if (!agent || !this.textures.exists(`emo_${key}`)) return;
    agent.emote.setTexture(`emo_${key}`).setVisible(true);
    agent.emoteUntil = this.time.now + seconds * 1000;
  }

  /** A short, self-destructing burst. Cosmetic only, and off under reduced motion. */
  celebrate() {
    if (this.reducedMotion || !this.layout) return;
    const { w, h } = this.layout;
    const cx = (w * TILE) / 2;
    const cy = (h * TILE) / 2;
    const colours = [0xf2c14e, 0x6ec07a, 0x5aa9e6, 0xe879a8];
    for (let i = 0; i < 36; i++) {
      const r = this.add.rectangle(
        cx + (Math.random() - 0.5) * w * TILE * 0.7,
        cy + (Math.random() - 0.5) * h * TILE * 0.5,
        3, 3, colours[i % colours.length]
      ).setDepth(60);
      this.tweens.add({
        targets: r, y: r.y - 22 - Math.random() * 28, alpha: 0,
        duration: 800 + Math.random() * 600, onComplete: () => r.destroy()
      });
    }
    for (const a of this.agents.values()) if (!a.away && Math.random() < 0.8) this.showEmote(a, 'star', 2.5);
  }

  // ------------------------------------------------------------ helpers
  roomOf(id) { return this.layout.rooms.find((r) => r.id === id) || null; }

  spotIn(room) {
    for (let i = 0; i < 10; i++) {
      const x = room.x + 1 + Math.floor(Math.random() * Math.max(1, room.w - 1));
      const y = room.y + 1 + Math.floor(Math.random() * Math.max(1, room.h - 1));
      if (this.layout.walkable[y]?.[x]) return { x, y };
    }
    return null;
  }

  randomSpot() {
    const L = this.layout;
    for (let i = 0; i < 14; i++) {
      const x = 1 + Math.floor(Math.random() * (L.w - 2));
      const y = 1 + Math.floor(Math.random() * (L.h - 2));
      if (L.walkable[y][x]) return { x, y };
    }
    return null;
  }

  /** A walkable tile near a point, for huddles. */
  spotNear(p, radius = 2) {
    const L = this.layout;
    for (let i = 0; i < 16; i++) {
      const x = p.x + Math.round((Math.random() - 0.5) * 2 * radius);
      const y = p.y + Math.round((Math.random() - 0.5) * 2 * radius);
      if (L.walkable[y]?.[x]) return { x, y };
    }
    return null;
  }

  goTo(agent, target, activity, seconds) {
    if (!target) target = { x: agent.gx, y: agent.gy };
    agent.activity = activity;
    agent.pip.setFillStyle(ACTIVITY_COLORS[activity] || ACTIVITY_COLORS.idle);
    // Pathfinding is cosmetic: if there is no route the agent simply stays put.
    agent.path = findPath(this.layout, { x: agent.gx, y: agent.gy }, target);
    if (this.reducedMotion && agent.path.length) {
      const last = agent.path[agent.path.length - 1];
      agent.gx = last.x; agent.gy = last.y; agent.path = [];
      agent.sprite.setPosition(last.x * TILE + TILE / 2, last.y * TILE + TILE / 2);
    }
    agent.timer = seconds;
  }

  /** Everyone named gathers around a point for a while. */
  gather(agents, center, emote, seconds = 6, activity = 'meeting') {
    const until = this.time.now + seconds * 1000;
    for (const a of agents) {
      if (a.away) continue;
      this.goTo(a, this.spotNear(center, 2) || center, activity, seconds);
      a.busyUntil = until;
      if (emote) this.showEmote(a, emote, Math.min(3, seconds));
    }
  }

  /** Called by the UI when the player uses a founder action. */
  founderAction(id) {
    const founder = this.agents.get('founder');
    const staff = [...this.agents.values()].filter((a) => !a.advisor && !a.away);
    const empById = new Map(this.game$.state.employees.map((e) => [e.id, e]));
    if (id === 'pep_talk' && founder) {
      this.gather(staff, { x: founder.gx, y: founder.gy }, 'heart', 6);
    } else if (id === 'allnighter' && founder) {
      this.showEmote(founder, 'coffee', 4);
      if (founder.deskSlot) this.goTo(founder, founder.deskSlot, 'coding', 8);
    } else if (id === 'sales_blitz') {
      for (const a of staff) if (['sales_rep', 'marketer'].includes(empById.get(a.id)?.role)) this.showEmote(a, 'money', 4);
      if (founder) this.showEmote(founder, 'money', 4);
    } else if (id === 'tweetstorm' && founder) {
      this.showEmote(founder, 'rocket', 4);
    } else if (id === 'customer_calls') {
      for (const a of staff) if (empById.get(a.id)?.dept === 'support') this.showEmote(a, 'talk', 4);
      if (founder) this.showEmote(founder, 'talk', 4);
    } else if (id === 'code_cleanup') {
      for (const a of staff) if (empById.get(a.id)?.dept === 'engineering') this.showEmote(a, 'fix', 4);
    } else if (id === 'investor_coffee' && founder) {
      this.showEmote(founder, 'coffee', 4);
      const r = this.roomOf('exec') || this.roomOf('meeting');
      if (r) this.goTo(founder, this.spotIn(r), 'meeting', 8);
    }
  }

  /** Once a second: react to what the company is doing. */
  react(time) {
    const state = this.game$.state;
    const L = this.layout;
    const outage = state.products.some((p) => p.outage > 0);
    const staff = [...this.agents.values()].filter((a) => !a.advisor && !a.away);
    const empById = new Map(state.employees.map((e) => [e.id, e]));

    // A fresh launch: celebrate a hit, sulk at a flop.
    const ll = state.lastLaunch;
    if (ll && ll.day !== this.seen.launchDay) {
      this.seen.launchDay = ll.day;
      if (ll.outcome === 'hit' || ll.outcome === 'viral') {
        this.celebrate();
        if (ll.outcome === 'viral') this.gather(staff.filter(() => Math.random() < 0.6), { x: Math.floor(L.w / 3), y: Math.floor(L.h / 2) }, 'rocket', 5);
      } else if (ll.outcome === 'flop') {
        for (const a of staff) if (Math.random() < 0.6) this.showEmote(a, 'sad', 3);
      }
    }
    if (state.company.stage !== this.seen.stage) {
      this.seen.stage = state.company.stage;
      this.celebrate();
    }

    // An outage pulls infrastructure people (and some engineers) into the fire.
    if (outage && !this.seen.outage) {
      const room = this.roomOf('war_room') || this.roomOf('server') || this.roomOf('datacenter');
      const center = room ? { x: room.x + 2, y: room.y + 2 } : { x: Math.floor(L.w / 3), y: Math.floor(L.h / 2) };
      const responders = staff.filter((a) => {
        const e = empById.get(a.id);
        return e && (e.dept === 'infra' || (e.dept === 'engineering' && Math.random() < 0.45));
      });
      this.gather(responders, center, 'alert', 7, 'firefight');
      for (const a of responders) a.speed = 1.8;
    }
    this.seen.outage = outage;

    // A standup every so often: one department huddles for a few seconds.
    if (time > this.nextStandup && !this.reducedMotion) {
      this.nextStandup = time + 25000 + Math.random() * 25000;
      const byDept = {};
      for (const a of staff) {
        const e = empById.get(a.id);
        if (e && time > a.busyUntil) (byDept[e.dept] ||= []).push(a);
      }
      const groups = Object.values(byDept).filter((g) => g.length >= 3);
      if (groups.length) {
        const g = groups[Math.floor(Math.random() * groups.length)];
        const room = this.roomOf('meeting');
        const center = room ? { x: room.x + 2, y: room.y + 2 } : (g[0].deskSlot || { x: g[0].gx, y: g[0].gy });
        this.gather(g.slice(0, 6), center, 'talk', 6);
      }
    }

    const w = this.scale.width;
    const h = this.scale.height;
    this.nightShade.setSize(w, h);
    const target = state.company.pace === 'crunch' ? 0.22 : 0;
    this.nightShade.fillAlpha += (target - this.nightShade.fillAlpha) * 0.3;
  }

  chooseAdvisorDestination(agent) {
    const room = this.roomOf('exec') || this.roomOf('meeting');
    // Mostly the executive or meeting room, sometimes just walking the floor.
    const target = (room && Math.random() > 0.35 ? this.spotIn(room) : null) || this.randomSpot();
    this.goTo(agent, target, 'meeting', 5 + Math.random() * 9);
    if (Math.random() < 0.3) this.showEmote(agent, 'talk', 2);
  }

  chooseDestination(agent, emp) {
    const state = this.game$.state;
    const pace = state.company.pace;
    const tired = (emp.energy ?? 0.9) < 0.25;
    const outage = state.products.some((p) => p.outage > 0);
    agent.speed = tired ? 0.6 : 1;

    // An active roadmap sends product and engineering people to huddle together.
    if (this.roadmapActive() && ['product', 'engineering'].includes(emp.dept) && !this.reducedMotion && Math.random() < 0.12) {
      const room = this.roomOf('meeting') || this.roomOf('design_studio') || this.roomOf('lab');
      if (room) { this.goTo(agent, this.spotIn(room), 'meeting', 3 + Math.random() * 5); return; }
    }

    let roll = this.reducedMotion ? 0 : Math.random();
    if (tired && roll < 0.5) {
      const room = BREAK_ROOMS.map((id) => this.roomOf(id)).find(Boolean);
      this.goTo(agent, room ? this.spotIn(room) : this.randomSpot(), 'tired', 5 + Math.random() * 5);
      this.showEmote(agent, 'zzz', 3);
      return;
    }
    if (outage && (emp.dept === 'infra' || emp.role === 'founder') && roll < 0.7) {
      const room = this.roomOf('war_room') || this.roomOf('server') || this.roomOf('datacenter');
      this.goTo(agent, room ? this.spotIn(room) : agent.deskSlot, 'firefight', 3 + Math.random() * 3);
      this.showEmote(agent, 'alert', 2);
      agent.speed = 1.6;
      return;
    }

    const deskShare = pace === 'crunch' ? 0.82 : pace === 'relaxed' ? 0.45 : 0.56;
    const breakShare = pace === 'crunch' ? 0.03 : pace === 'relaxed' ? 0.22 : 0.12;
    if (roll < deskShare) {
      if (!agent.deskSlot) agent.deskSlot = this.freeDeskSlot();
      this.goTo(agent, agent.deskSlot || this.randomSpot(), ROLE_ACTIVITY[emp.role] || 'coding', 10 + Math.random() * 14);
      if (Math.random() < 0.18) this.showEmote(agent, pace === 'crunch' && Math.random() < 0.5 ? 'sweat' : (ROLE_EMOTE[emp.role] || 'code'), 2);
      if (!agent.deskSlot && Math.random() < 0.3) this.showEmote(agent, 'question', 2);
      return;
    }
    roll -= deskShare;
    if (roll < 0.16) {
      const room = (ROLE_ROOMS[emp.role] || []).map((id) => this.roomOf(id)).find(Boolean);
      if (room && (room.id !== 'lab' || state.research.active.length)) {
        const act = room.id === 'lab' ? 'researching' : ROLE_ACTIVITY[emp.role] || 'meeting';
        this.goTo(agent, this.spotIn(room), act, 4 + Math.random() * 6);
        if (Math.random() < 0.35) this.showEmote(agent, room.id === 'lab' ? 'idea' : ROLE_EMOTE[emp.role] || 'talk', 2);
        return;
      }
    }
    roll -= 0.16;
    if (roll < breakShare) {
      const room = BREAK_ROOMS.map((id) => this.roomOf(id)).find(Boolean);
      if (room) {
        this.goTo(agent, this.spotIn(room), 'break', 3 + Math.random() * 5);
        if (Math.random() < 0.4) this.showEmote(agent, room.id === 'gym' ? 'sweat' : 'coffee', 2);
        return;
      }
    }
    // Otherwise: a walk, a chat at someone else's desk, the water cooler.
    this.goTo(agent, this.randomSpot(), 'idle', 2 + Math.random() * 4);
    if (Math.random() < 0.15) this.showEmote(agent, (emp.morale ?? 0.7) > 0.85 ? 'heart' : 'talk', 1.5);
  }

  /** Roadmap work pulls product and engineering people into visible huddles. */
  roadmapActive() {
    return (this.game$.state.products || []).some((p) => p.roadmap?.active);
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
    if (!this.lastReact || time - this.lastReact > 1000) {
      this.lastReact = time;
      this.react(time);
    }
    // Containers draw in list order, so keep people sorted by depth (y) for
    // correct overlap. Cheap enough at a few times a second.
    if (!this.lastSort || time - this.lastSort > 250) {
      this.lastSort = time;
      this.peopleLayer.sort('depth');
    }

    const empById = new Map(state.employees.map((e) => [e.id, e]));
    for (const agent of this.agents.values()) {
      const emp = empById.get(agent.id);
      if (!emp && !agent.advisor) continue;
      // People on leave are simply not in the office.
      const away = !!emp && (emp.leaveUntil || 0) > state.time.day;
      if (away !== agent.away) {
        agent.away = away;
        agent.sprite.setVisible(!away);
        agent.pip.setVisible(!away);
        if (away) { agent.emote.setVisible(false); agent.glow.setVisible(false); agent.deskSlot = null; }
        else {
          agent.gx = this.layout.doorX; agent.gy = this.layout.h - 2;
          agent.sprite.setPosition(agent.gx * TILE + TILE / 2, agent.gy * TILE + TILE / 2);
          agent.path = []; agent.timer = 0;
        }
      }
      if (away) continue;

      if (agent.path.length) {
        if (agent.glow.visible) agent.glow.setVisible(false);
        const next = agent.path[0];
        const tx = next.x * TILE + TILE / 2;
        const ty = next.y * TILE + TILE / 2;
        const dx = tx - agent.sprite.x;
        const dy = ty - agent.sprite.y;
        const dist = Math.hypot(dx, dy);
        const stepLen = SPEED * TILE * dt * (agent.speed || 1);
        if (dist <= stepLen) {
          agent.sprite.setPosition(tx, ty);
          agent.gx = next.x; agent.gy = next.y;
          agent.path.shift();
        } else {
          agent.sprite.x += (dx / dist) * stepLen;
          agent.sprite.y += (dy / dist) * stepLen;
        }
        agent.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'side_l' : 'side_r') : (dy < 0 ? 'up' : 'down');
        agent.anim += dt * 7 * (agent.speed || 1);
        const f = Math.floor(agent.anim) % 2;
        const base = agent.facing.startsWith('side') ? 'side' : agent.facing;
        agent.sprite.setTexture(`${agent.key}_${base}${f}`);
        agent.sprite.setFlipX(agent.facing === 'side_l');
      } else {
        agent.timer -= dt;
        const atDesk = agent.deskSlot && agent.gx === agent.deskSlot.x && agent.gy === agent.deskSlot.y;
        agent.sprite.setTexture(`${agent.key}_${atDesk ? 'sit' : 'down0'}`);
        if (atDesk) agent.sprite.setFlipX(false);
        // Their monitor is on while they sit at it.
        // Now and then, show what they are working on.
        if (atDesk && !agent.emote.visible && Math.random() < dt * 0.06 && emp) {
          const pace = state.company.pace;
          this.showEmote(agent, pace === 'crunch' && Math.random() < 0.4 ? 'sweat' : (emp.energy ?? 0.9) < 0.3 ? 'zzz' : (ROLE_EMOTE[emp.role] || 'code'), 1.8);
        }
        if (atDesk !== agent.glow.visible) {
          agent.glow.setVisible(!!atDesk);
          if (atDesk) agent.glow.setPosition(agent.deskSlot.x * TILE, agent.deskSlot.deskY * TILE).setDepth(1);
        }
        if (agent.timer <= 0 && time > agent.busyUntil) {
          agent.speed = 1;
          if (agent.advisor) this.chooseAdvisorDestination(agent);
          else this.chooseDestination(agent, emp);
        }
      }
      agent.pip.setPosition(agent.sprite.x, agent.sprite.y - 15);
      agent.sprite.setDepth(agent.sprite.y);
      agent.pip.setDepth(agent.sprite.y + 1);
      if (agent.emote.visible) {
        if (time > agent.emoteUntil) agent.emote.setVisible(false);
        else agent.emote.setPosition(Math.round(agent.sprite.x), Math.round(agent.sprite.y - 21)).setDepth(agent.sprite.y + 2);
      }
    }

    const down = state.products.filter((p) => p.outage > 0);
    if (down.length) {
      this.alertText.setText(`OUTAGE: ${down.map((p) => p.name).join(', ')}`).setVisible(true);
      this.alertText.setAlpha(0.6 + 0.4 * Math.sin(time / 200));
      this.alertText.setPosition(this.scale.width - this.alertText.width - 8, 8);
    } else this.alertText.setVisible(false);
  }
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}
