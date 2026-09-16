// Original pixel art, generated at runtime from character grids.
// Every sprite is a small string map plus a per-sprite palette, so the whole
// art set is a few kB of source and needs no binary assets.

export const TILE = 16;

const PAL = {
  '.': null,                 // transparent
  o: '#2a2733', O: '#1b1924', // outlines
  f: '#4a4761', F: '#474459', g: '#524e6c', // floor
  c: '#3f5d6b', C: '#365060',                // carpet
  w: '#6f6a87', W: '#57536c', y: '#8d87a8',  // walls
  d: '#8a5a3b', D: '#6b4429', e: '#a9764f',  // wood
  m: '#7f8c9b', M: '#5a6572', n: '#9ba7b4',  // metal
  s: '#6fd3e8', S: '#2b7f92',                // screens
  p: '#4caf50', P: '#2e7d32',                // plants
  k: '#e0b089', K: '#c08f68',                // skin
  h: '#4a3b30', H: '#2f2620',                // hair
  r: '#c0392b', b: '#3d5afe', t: '#f5f0e8',
  x: '#d9534f', z: '#ffd54f', q: '#8e6bd6', v: '#4db6ac',
  u: '#e8e4f0', U: '#b9b3cc'
};

// --- tiles -------------------------------------------------------------
const T = {
  floor: [
    'fffffffffffffffg', 'ffffffgffffffffF', 'fffffffffffFffff', 'ffgfffffffffffff',
    'ffffffffffgfffff', 'fFffffffffffffff', 'ffffffffffffgfff', 'ffffgfffFffffffF',
    'fffffffffffffgff', 'ffffffffffffffff', 'fgffffFffffffFff', 'ffffffffgfffffff',
    'ffffFfffffffffff', 'fffffffffgffffff', 'ffffffffffffffff', 'gffFffffffffgfff'
  ],
  floor2: [
    'ffffffffffffffff', 'fffgffffffffgfff', 'ffffffffgfffffff', 'fgffffffffffffff',
    'ffffffgfffffffff', 'ffffffffffffgfff', 'fffffffffgffffff', 'ffgfffffffffffff',
    'ffffffffffffffgf', 'fffffgffffffffff', 'ffffffffffgfffff', 'fffffffffffffgff',
    'fgffffffffffffff', 'ffffgfffffffffff', 'ffffffffffffffff', 'ffffffgfffffffff'
  ],
  carpet: [
    'cccccccccccccccc', 'cCcCcCcCcCcCcCcC', 'cccccccccccccccc', 'CcCcCcCcCcCcCcCc',
    'cccccccccccccccc', 'cCcCcCcCcCcCcCcC', 'cccccccccccccccc', 'CcCcCcCcCcCcCcCc',
    'cccccccccccccccc', 'cCcCcCcCcCcCcCcC', 'cccccccccccccccc', 'CcCcCcCcCcCcCcCc',
    'cccccccccccccccc', 'cCcCcCcCcCcCcCcC', 'cccccccccccccccc', 'CcCcCcCcCcCcCcCc'
  ],
  wall: [
    'yyyyyyyyyyyyyyyy', 'yyyyyyyyyyyyyyyy', 'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww',
    'WWWWWWWWWWWWWWWW', 'wwwwwwwWwwwwwwww', 'wwwwwwwWwwwwwwww', 'WWWWWWWWWWWWWWWW',
    'wwwWwwwwwwwwwwww', 'wwwWwwwwwwwwwwww', 'WWWWWWWWWWWWWWWW', 'wwwwwwwwwwwWwwww',
    'wwwwwwwwwwwWwwww', 'WWWWWWWWWWWWWWWW', 'OOOOOOOOOOOOOOOO', 'OOOOOOOOOOOOOOOO'
  ],
  window: [
    'yyyyyyyyyyyyyyyy', 'yyyyyyyyyyyyyyyy', 'wwwwwwwwwwwwwwww', 'wOOOOOOOOOOOOOOw',
    'wOssssssOssssssO', 'wOssssssOssssssO', 'wOssssssOssssssO', 'wOOOOOOOOOOOOOOO',
    'wOssssssOssssssO', 'wOssssssOssssssO', 'wOssssssOssssssO', 'wOOOOOOOOOOOOOOw',
    'wwwwwwwwwwwwwwww', 'WWWWWWWWWWWWWWWW', 'OOOOOOOOOOOOOOOO', 'OOOOOOOOOOOOOOOO'
  ],
  door: [
    'yyyyyyyyyyyyyyyy', 'yyyyyyyyyyyyyyyy', 'wwOOOOOOOOOOOOww', 'wwOddddddddddOww',
    'wwOdeeeeeeeedOww', 'wwOdeddddddedOww', 'wwOdeddddddedOww', 'wwOdeddddddedOww',
    'wwOdeddddddedOww', 'wwOdedddzddedOww', 'wwOdeeeeeeeedOww', 'wwOddddddddddOww',
    'wwOOOOOOOOOOOOww', 'WWWWWWWWWWWWWWWW', 'OOOOOOOOOOOOOOOO', 'OOOOOOOOOOOOOOOO'
  ]
};

// --- furniture ---------------------------------------------------------
const F = {
  desk: [
    '................', '....OOOOOOOO....', '....OssssssO....', '....OssssssO....',
    '....OssssssO....', '....OSSSSSSO....', '....OOOOOOOO....', '......OOOO......',
    'OOOOOOOOOOOOOOOO', 'OddddddddddddddO', 'OdeeeeeeeeeeeedO', 'ODDDDDDDDDDDDDDO',
    'OOOOOOOOOOOOOOOO', '.O............O.', '.O............O.', '.O............O.'
  ],
  desk_plain: [
    '................', '................', '................', '......OOOO......',
    '.....OuuuuO.....', '.....OuuuuO.....', '......OOOO......', '................',
    'OOOOOOOOOOOOOOOO', 'OddddddddddddddO', 'OdeeeeeeeeeeeedO', 'ODDDDDDDDDDDDDDO',
    'OOOOOOOOOOOOOOOO', '.O............O.', '.O............O.', '.O............O.'
  ],
  chair: [
    '................', '................', '....OOOOOO......', '....OmmmmO......',
    '....OmmmmO......', '....OmmmmO......', '....OOOOOO......', '...OOOOOOOO.....',
    '...OMMMMMMO.....', '...OMMMMMMO.....', '...OOOOOOOO.....', '......OO........',
    '......OO........', '....OOOOOO......', '....O....O......', '................'
  ],
  plant: [
    '.......pp.......', '....ppPppPpp....', '...pPppppppPp...', '..ppppPppPpppp..',
    '...pPppppppPp...', '....pppPppp.....', '......pPp.......', '.......p........',
    '.......p........', '.....OOOOOO.....', '.....OddddO.....', '.....OdeedO.....',
    '.....OdeedO.....', '.....ODDDDO.....', '.....OOOOOO.....', '................'
  ],
  coffee: [
    '................', '...OOOOOOOOOO...', '...OMMMMMMMMO...', '...OMssssssMO...',
    '...OMssssssMO...', '...OMMMMMMMMO...', '...OMzzzzzzMO...', '...OMMMMMMMMO...',
    '...OM.MMMM.MO...', '...OMMMMMMMMO...', '...OmmmmmmmmO...', '...OmmmmmmmmO...',
    '...OMMMMMMMMO...', '...OOOOOOOOOO...', '....O......O....', '................'
  ],
  server: [
    '..OOOOOOOOOOOO..', '..OMMMMMMMMMMO..', '..OMnnnnnnnnMO..', '..OMpMMMMMMpMO..',
    '..OMnnnnnnnnMO..', '..OMpMMMMMMpMO..', '..OMnnnnnnnnMO..', '..OMpMMMMMMpMO..',
    '..OMnnnnnnnnMO..', '..OMpMMMMMMpMO..', '..OMnnnnnnnnMO..', '..OMzMMMMMMzMO..',
    '..OMMMMMMMMMMO..', '..OOOOOOOOOOOO..', '...O........O...', '................'
  ],
  whiteboard: [
    'OOOOOOOOOOOOOOOO', 'OuuuuuuuuuuuuuuO', 'Ouu..uu...uuuuuO', 'Ouu.uuu.uu.uuuuO',
    'Ouu.uuuuuu.uuuuO', 'Ouuuu...uuuuuuuO', 'Ouu.uuuuu..uuuuO', 'Ouu..u...uuuuuuO',
    'OuuuuuuuuuuuuuuO', 'OUUUUUUUUUUUUUUO', 'OOOOOOOOOOOOOOOO', '....O......O....',
    '....O......O....', '....O......O....', '...OO......OO...', '................'
  ],
  sofa: [
    '................', '..OOOOOOOOOOOO..', '..OqqqqqqqqqqO..', '..OqqqqqqqqqqO..',
    'OOOqqqqqqqqqqOOO', 'OqOOOOOOOOOOOOqO', 'OqqqqqqqqqqqqqqO', 'OqqqqqqqqqqqqqqO',
    'OqqqqqqqqqqqqqqO', 'OOOOOOOOOOOOOOOO', '.O............O.', '.O............O.',
    '................', '................', '................', '................'
  ],
  table: [
    '................', '................', 'OOOOOOOOOOOOOOOO', 'OddddddddddddddO',
    'OdeeeeeeeeeeeedO', 'OdeeeeeeeeeeeedO', 'OdeeeeeeeeeeeedO', 'ODDDDDDDDDDDDDDO',
    'OOOOOOOOOOOOOOOO', '..O..........O..', '..O..........O..', '..O..........O..',
    '..O..........O..', '................', '................', '................'
  ],
  shelf: [
    'OOOOOOOOOOOOOOOO', 'OddddddddddddddO', 'OdrrbbzzvvqqxxdO', 'OdrrbbzzvvqqxxdO',
    'ODDDDDDDDDDDDDDO', 'OddddddddddddddO', 'OdbbxxqqrrzzvvdO', 'OdbbxxqqrrzzvvdO',
    'ODDDDDDDDDDDDDDO', 'OddddddddddddddO', 'OdvvqqrrbbxxzzdO', 'OdvvqqrrbbxxzzdO',
    'ODDDDDDDDDDDDDDO', 'OOOOOOOOOOOOOOOO', '.O............O.', '................'
  ],
  rug: [
    '................', '.DDDDDDDDDDDDDD.', '.DddddddddddddD.', '.DdDDDDDDDDDDdD.',
    '.DdDddddddddDdD.', '.DdDdDDDDDDdDdD.', '.DdDdDddddDdDdD.', '.DdDdDdDDdDdDdD.',
    '.DdDdDdDDdDdDdD.', '.DdDdDddddDdDdD.', '.DdDdDDDDDDdDdD.', '.DdDddddddddDdD.',
    '.DdDDDDDDDDDDdD.', '.DddddddddddddD.', '.DDDDDDDDDDDDDD.', '................'
  ],
  water: [
    '................', '.....OOOOOO.....', '.....OssssO.....', '.....OssssO.....',
    '.....OssssO.....', '.....OSSSSO.....', '.....OOOOOO.....', '......OmmO......',
    '.....OOmmOO.....', '.....OmmmmO.....', '.....OmmmmO.....', '.....OMMMMO.....',
    '.....OmmmmO.....', '.....OOOOOO.....', '................', '................'
  ],
  sign: [
    '................', '................', '..OOOOOOOOOOOO..', '..OzzzzzzzzzzO..',
    '..OzOOOOOOOOzO..', '..OzOzzzzzzOzO..', '..OzOzzzzzzOzO..', '..OzOOOOOOOOzO..',
    '..OzzzzzzzzzzO..', '..OOOOOOOOOOOO..', '......OMMO......', '......OMMO......',
    '......OMMO......', '.....OOMMOO.....', '................', '................'
  ]
};

// --- people ------------------------------------------------------------
// 12x16. 'S' shirt, 'A' shirt shadow, 'P' trousers, 'B' shoes are recoloured.
const BODY = {
  down0: [
    '...HHHHHH...', '..HHHHHHHH..', '..HkkkkkkH..', '..kkkkkkkk..', '..kOkkkkOk..',
    '..kkkkkkkk..', '...kkkkkk...', '..SSSSSSSS..', '.SSSSSSSSSS.', '.kSSSSSSSSk.',
    '.kSAAAAAASk.', '..SSSSSSSS..', '..PPPPPPPP..', '..PPP..PPP..', '..PP....PP..', '..BB....BB..'
  ],
  down1: [
    '...HHHHHH...', '..HHHHHHHH..', '..HkkkkkkH..', '..kkkkkkkk..', '..kOkkkkOk..',
    '..kkkkkkkk..', '...kkkkkk...', '..SSSSSSSS..', '.SSSSSSSSSS.', '.kSSSSSSSSk.',
    '.kSAAAAAASk.', '..SSSSSSSS..', '..PPPPPPPP..', '...PPPPPP...', '...PP.PP...', '...BBBBB....'
  ],
  up0: [
    '...HHHHHH...', '..HHHHHHHH..', '..HHHHHHHH..', '..HHHHHHHH..', '..HHHHHHHH..',
    '..kHHHHHHk..', '...kkkkkk...', '..SSSSSSSS..', '.SSSSSSSSSS.', '.kSSSSSSSSk.',
    '.kSAAAAAASk.', '..SSSSSSSS..', '..PPPPPPPP..', '..PPP..PPP..', '..PP....PP..', '..BB....BB..'
  ],
  up1: [
    '...HHHHHH...', '..HHHHHHHH..', '..HHHHHHHH..', '..HHHHHHHH..', '..HHHHHHHH..',
    '..kHHHHHHk..', '...kkkkkk...', '..SSSSSSSS..', '.SSSSSSSSSS.', '.kSSSSSSSSk.',
    '.kSAAAAAASk.', '..SSSSSSSS..', '..PPPPPPPP..', '...PPPPPP...', '...PP.PP...', '...BBBBB....'
  ],
  side0: [
    '...HHHHH....', '..HHHHHHH...', '..HHkkkkk...', '..Hkkkkkk...', '..kkkkOkk...',
    '..kkkkkkk...', '...kkkkk....', '..SSSSSS....', '.SSSSSSSk...', '.kSSSSSSk...',
    '..SAAAAS....', '..SSSSSS....', '..PPPPPP....', '..PPPPPP....', '..PP..PP....', '..BB..BB....'
  ],
  side1: [
    '...HHHHH....', '..HHHHHHH...', '..HHkkkkk...', '..Hkkkkkk...', '..kkkkOkk...',
    '..kkkkkkk...', '...kkkkk....', '..SSSSSS....', '.SSSSSSSk...', '.kSSSSSSk...',
    '..SAAAAS....', '..SSSSSS....', '..PPPPPP....', '...PPPPP....', '...PPPP.....', '...BBBB.....'
  ],
  sit: [
    '............', '...HHHHHH...', '..HHHHHHHH..', '..HkkkkkkH..', '..kkkkkkkk..',
    '..kOkkkkOk..', '..kkkkkkkk..', '...kkkkkk...', '..SSSSSSSS..', '.SSSSSSSSSS.',
    '.kSSSSSSSSk.', '..SAAAAAAS..', '..PPPPPPPP..', '..PPPPPPPP..', '..BB....BB..', '............'
  ]
};

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function paint(scene, key, rows, palette) {
  if (scene.textures.exists(key)) return key;
  const w = rows[0].length;
  const h = rows.length;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const col = palette[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
  return key;
}

export const SHIRTS = {
  founder: '#f2c14e', engineering: '#5aa9e6', product: '#f2b134', sales: '#ef6f6c',
  marketing: '#e879a8', support: '#6ec07a', infra: '#a184e0', neutral: '#9aa5b1'
};
const HAIRS = ['#3a2c22', '#1d1a17', '#7a4a2a', '#b8b1a5', '#5c3f6b'];
const SKINS = ['#e8bd94', '#d29a6b', '#a9744a', '#7a5334', '#f2d3b3'];

export function personKey(deptId, variant) {
  return `p_${deptId}_${variant}`;
}

export function buildTextures(scene) {
  for (const [k, rows] of Object.entries(T)) paint(scene, `tile_${k}`, rows, PAL);
  for (const [k, rows] of Object.entries(F)) paint(scene, `fx_${k}`, rows, PAL);

  for (const [dept, shirt] of Object.entries(SHIRTS)) {
    for (let v = 0; v < 3; v++) {
      const pal = {
        ...PAL,
        S: shirt, A: shade(shirt, -38), P: '#39364a', B: '#221f2c',
        H: HAIRS[(v * 2) % HAIRS.length], k: SKINS[(v * 2 + 1) % SKINS.length], O: '#1b1924'
      };
      for (const [frame, rows] of Object.entries(BODY)) {
        paint(scene, `${personKey(dept, v)}_${frame}`, rows, pal);
      }
    }
  }

  // A 1x1 white pixel for cheap rectangles and highlights.
  paint(scene, 'px', ['t'], PAL);
  return true;
}

export const FURNITURE_KEYS = Object.keys(F).map((k) => `fx_${k}`);
export { PAL };
