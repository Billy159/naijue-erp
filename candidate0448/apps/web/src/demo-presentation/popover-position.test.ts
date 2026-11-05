import assert from 'node:assert/strict';
import test from 'node:test';
import { positionDemoPopover } from './popover-position.ts';

test('source default below: 360 width, anchor+5, right/left guard and 450 height ceiling', () => {
  assert.deepEqual(positionDemoPopover({ left: 800, top: 110, bottom: 140 }, { width: 1440, height: 1000 }), { width: 360, left: 800, maxHeight: 450, top: 145, bottom: 'auto' });
});
test('source short viewport flips above when more room exists there', () => {
  assert.deepEqual(positionDemoPopover({ left: 400, top: 330, bottom: 358 }, { width: 420, height: 400 }), { width: 360, left: 52, maxHeight: 314, top: 'auto', bottom: 75 });
});
test('narrow viewport caps width at viewport minus24 and right edge at8 minimum', () => {
  assert.deepEqual(positionDemoPopover({ left: 500, top: 100, bottom: 128 }, { width: 320, height: 900 }), { width: 296, left: 16, maxHeight: 450, top: 133, bottom: 'auto' });
});
test('left guard is8 even for a partially offscreen anchor', () => {
  assert.equal(positionDemoPopover({ left: -50, top: 100, bottom: 128 }, { width: 320, height: 900 }).left, 8);
});
test('strict230 boundary stays below even with greater room above', () => {
  const result = positionDemoPopover({ left: 20, top: 326, bottom: 354 }, { width: 900, height: 600 });
  assert.equal(result.top, 359); assert.equal(result.bottom, 'auto'); assert.equal(result.maxHeight, 230);
});
test('229 below flips above, but tied spaces do not', () => {
  assert.equal(positionDemoPopover({ left: 20, top: 327, bottom: 355 }, { width: 900, height: 600 }).top, 'auto');
  assert.equal(positionDemoPopover({ left: 20, top: 186, bottom: 214 }, { width: 900, height: 400 }).top, 219);
});
test('source100 height floor survives a shorter viewport; this is not a guarantee of fit', () => {
  assert.equal(positionDemoPopover({ left: 20, top: 10, bottom: 30 }, { width: 320, height: 80 }).maxHeight, 100);
});
test('pathological sub24 viewport never emits negative CSS width', () => {
  assert.equal(positionDemoPopover({ left: 0, top: 0, bottom: 0 }, { width: 12, height: 100 }).width, 0);
});
test('nonfinite dimensions and negative sizes are rejected, not pushed into CSS', () => {
  assert.throws(() => positionDemoPopover({ left: NaN, top: 1, bottom: 2 }, { width: 320, height: 400 }), TypeError);
  assert.throws(() => positionDemoPopover({ left: 1, top: 1, bottom: 2 }, { width: -1, height: 400 }), TypeError);
});
