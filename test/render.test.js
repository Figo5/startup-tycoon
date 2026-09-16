import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, roomLabelPos } from '../src/render/layout.js';
import { TILE, MAX_ZOOM, labelResolution } from '../src/render/art.js';

test('room labels sit on whole pixels', () => {
  // Regression: the anchor was (room.y - 0.35) * TILE, a fractional world
  // position that smeared 9px glyphs across the pixel grid.
  const layout = buildLayout('loft', ['breakroom', 'meeting', 'lab', 'server']);
  assert.ok(layout.rooms.length > 1, 'fixture: several rooms are drawn');
  for (const r of layout.rooms) {
    const pos = roomLabelPos(r, TILE);
    assert.ok(Number.isInteger(pos.x), `${r.id} label x ${pos.x} is fractional`);
    assert.ok(Number.isInteger(pos.y), `${r.id} label y ${pos.y} is fractional`);
  }
});

test('labels rasterise at or above the camera zoom ceiling', () => {
  // Below MAX_ZOOM the label bitmap gets magnified, which is what looked blurry.
  for (const dpr of [1, 1.5, 2, 3]) {
    assert.ok(labelResolution(dpr) >= MAX_ZOOM, `dpr ${dpr}: ${labelResolution(dpr)} < ${MAX_ZOOM}`);
  }
  assert.ok(labelResolution(4) <= 8, 'resolution stays bounded on high-dpr screens');
});
