const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_CROP_EDGES,
  adjustCropEdge,
  cropFromEdges,
  edgesFromCrop,
  isFullCrop,
  nextRotation,
} = require('../src/lib/receiptAdjustments.ts');

test('photo adjustments start with the full photo and no rotation', () => {
  assert.deepEqual(DEFAULT_CROP_EDGES, { left: 0, top: 0, right: 100, bottom: 100 });
  assert.deepEqual(cropFromEdges(DEFAULT_CROP_EDGES), { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(isFullCrop(cropFromEdges(DEFAULT_CROP_EDGES)), true);
  assert.equal(nextRotation(0), 90);
  assert.equal(nextRotation(90), 180);
  assert.equal(nextRotation(180), 270);
  assert.equal(nextRotation(270), 0);
});

test('crop edges are clamped and keep a usable minimum region', () => {
  assert.deepEqual(adjustCropEdge(DEFAULT_CROP_EDGES, 'left', -20), { ...DEFAULT_CROP_EDGES, left: 0 });
  assert.deepEqual(adjustCropEdge(DEFAULT_CROP_EDGES, 'right', 140), { ...DEFAULT_CROP_EDGES, right: 100 });
  const left = adjustCropEdge(DEFAULT_CROP_EDGES, 'left', 99);
  assert.equal(left.left, 95, 'left edge cannot cross the 5% minimum width');
  const top = adjustCropEdge(DEFAULT_CROP_EDGES, 'top', 99);
  assert.equal(top.top, 95);
});

test('crop edges round-trip to normalized coordinates and back', () => {
  const edges = { left: 10, top: 20, right: 80, bottom: 70 };
  const crop = cropFromEdges(edges);
  assert.deepEqual(crop, { x: 0.1, y: 0.2, width: 0.7, height: 0.5 });
  assert.deepEqual(edgesFromCrop(crop), edges);
  assert.equal(isFullCrop(crop), false);
  assert.equal(isFullCrop({ x: 0.001, y: 0, width: 0.998, height: 1 }), true,
    'sub-percent rounding from a full selection is still treated as full');
});
