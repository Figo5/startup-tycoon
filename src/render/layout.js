import { tierById, roomById } from '../data/office.js';

// Floor plans are generated deterministically from the office tier and the
// rooms the player owns, so buying either visibly redraws the map.
// Tile chars: '#' wall, '=' window, '+' door, '.' floor, ',' floor variant, 'c' carpet.

const ROOM_W = 7;
const ROOM_H = 6;

const ROOM_DECOR = {
  breakroom: [['sofa', 1, 1], ['coffee', 4, 1], ['table', 2, 3], ['plant', 4, 3]],
  meeting: [['table', 1, 2], ['table', 3, 2], ['whiteboard', 2, 1], ['chair', 1, 3], ['chair', 4, 3]],
  server: [['server', 1, 1], ['server', 2, 1], ['server', 4, 1], ['server', 1, 3], ['server', 4, 3]],
  salesfloor: [['desk', 1, 1], ['desk', 4, 1], ['sign', 2, 2], ['desk', 1, 3], ['desk', 4, 3]],
  lab: [['server', 1, 1], ['whiteboard', 3, 1], ['shelf', 4, 1], ['desk_plain', 2, 3], ['plant', 4, 3]],
  gym: [['rug', 1, 1], ['rug', 3, 1], ['shelf', 4, 3], ['water', 1, 3]],
  exec: [['desk', 2, 1], ['shelf', 4, 1], ['plant', 1, 3], ['sofa', 3, 3]],
  datacenter: [['server', 1, 1], ['server', 2, 1], ['server', 3, 1], ['server', 4, 1],
    ['server', 1, 3], ['server', 2, 3], ['server', 3, 3], ['server', 4, 3]]
};

export function buildLayout(tierId, ownedRooms = []) {
  const tier = tierById(tierId);
  const desks = tier.desks;
  const cols = Math.max(3, Math.min(14, Math.ceil(Math.sqrt(desks * 1.5))));
  const rows = Math.ceil(desks / cols);

  const deskAreaW = cols * 2 - 1;
  const deskAreaH = rows * 3;
  const roomCount = ownedRooms.length;
  const roomCols = roomCount > 0 ? Math.ceil(roomCount / Math.max(1, Math.floor((deskAreaH + 4) / ROOM_H))) : 0;
  const stripW = roomCols * ROOM_W;

  const W = Math.max(11, 2 + deskAreaW + 2 + stripW + (stripW ? 1 : 0));
  const H = Math.max(9, Math.max(deskAreaH + 4, roomCount ? Math.min(roomCount, Math.floor((deskAreaH + 4) / ROOM_H) || 1) * ROOM_H + 3 : 0));

  const tiles = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      row.push(edge ? '#' : ((x + y * 3) % 7 === 0 ? ',' : '.'));
    }
    tiles.push(row);
  }
  // Windows along the top wall, a door at the bottom.
  for (let x = 2; x < W - 2; x += 3) tiles[0][x] = '=';
  const doorX = Math.max(2, Math.floor(deskAreaW / 2) + 1);
  tiles[H - 1][doorX] = '+';

  const furniture = [];
  const deskSlots = [];
  const startX = 1;
  const startY = 2;
  let placed = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols && placed < desks; c++, placed++) {
      const x = startX + c * 2;
      const y = startY + r * 3;
      if (x >= W - 1 - stripW - (stripW ? 1 : 0) || y + 1 >= H - 1) continue;
      furniture.push({ key: 'desk', x, y });
      furniture.push({ key: 'chair', x, y: y + 1 });
      deskSlots.push({ x, y: y + 1, deskY: y });
    }
  }

  // Entrance dressing
  if (H > 4) {
    furniture.push({ key: 'rug', x: doorX, y: H - 2 });
    if (doorX + 2 < W - 1) furniture.push({ key: 'plant', x: doorX + 2, y: H - 2 });
    if (doorX - 2 > 0) furniture.push({ key: 'water', x: doorX - 2, y: H - 2 });
  }

  const rooms = [];
  if (roomCount) {
    const perCol = Math.max(1, Math.floor((H - 2) / ROOM_H));
    ownedRooms.forEach((id, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const rx = W - 1 - stripW + col * ROOM_W;
      const ry = 1 + row * ROOM_H;
      if (rx < 1 || ry + ROOM_H > H - 1) return;
      const def = roomById(id);
      rooms.push({ id, name: def?.name || id, x: rx, y: ry, w: ROOM_W - 1, h: ROOM_H - 1 });
      for (let y = ry; y < ry + ROOM_H - 1; y++) {
        for (let x = rx; x < rx + ROOM_W - 1; x++) {
          if (x >= W - 1 || y >= H - 1) continue;
          const onEdge = x === rx || y === ry || x === rx + ROOM_W - 2 || y === ry + ROOM_H - 2;
          tiles[y][x] = onEdge ? '#' : 'c';
        }
      }
      const dx = rx;
      const dy = ry + Math.floor((ROOM_H - 1) / 2);
      if (tiles[dy]?.[dx] !== undefined) tiles[dy][dx] = '+';
      for (const [key, ox, oy] of (ROOM_DECOR[id] || [])) {
        const fx = rx + ox;
        const fy = ry + oy;
        if (fx < rx + ROOM_W - 2 && fy < ry + ROOM_H - 2 && fx < W - 1 && fy < H - 1) {
          furniture.push({ key, x: fx, y: fy, room: id });
        }
      }
    });
  }

  const blocked = new Set();
  for (const f of furniture) {
    if (['rug', 'chair'].includes(f.key)) continue;
    blocked.add(`${f.x},${f.y}`);
  }

  const walkable = tiles.map((row, y) => row.map((ch, x) =>
    ch !== '#' && ch !== '=' && !blocked.has(`${x},${y}`)));

  return { tierId, w: W, h: H, tiles, furniture, deskSlots, rooms, walkable, doorX };
}

/** 4-way BFS path on the walkable grid. Returns [] when there is no route. */
export function findPath(layout, from, to) {
  const { w, h, walkable } = layout;
  const key = (x, y) => y * w + x;
  if (!walkable[to.y]?.[to.x]) return [];
  const prev = new Int32Array(w * h).fill(-1);
  const seen = new Uint8Array(w * h);
  const q = [from];
  seen[key(from.x, from.y)] = 1;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      let k = key(cur.x, cur.y);
      while (k !== -1 && k !== key(from.x, from.y)) {
        path.push({ x: k % w, y: Math.floor(k / w) });
        k = prev[k];
      }
      return path.reverse();
    }
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = key(nx, ny);
      if (seen[nk] || !walkable[ny][nx]) continue;
      seen[nk] = 1;
      prev[nk] = key(cur.x, cur.y);
      q.push({ x: nx, y: ny });
    }
  }
  return [];
}
