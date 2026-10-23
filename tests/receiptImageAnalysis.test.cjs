const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clampRect, normalizedToPixels, rotateRectForCrop } = require('../src/lib/receiptGeometry.ts');
const { prepareReceiptImage, prepareReceiptImageForOcr, validateReceiptSelection } = require('../src/lib/receiptImage.ts');

test('crop coordinates are clamped and cannot read outside the source image', () => {
  assert.deepEqual(clampRect({ x: -10, y: -5, width: 5000, height: 5000 }, 2000, 3000), { x: 0, y: 0, width: 2000, height: 3000 });
  assert.deepEqual(clampRect({ x: 1500, y: 2500, width: 1000, height: 1000 }, 2000, 3000), { x: 1500, y: 2500, width: 500, height: 500 });
  assert.deepEqual(clampRect({ x: 10, y: 10, width: 0, height: -1 }, 2000, 3000), { x: 10, y: 10, width: 1, height: 1 });
});

test('normalized boxes become pixel crops and rotation maps the crop to the rotated view', () => {
  const px = normalizedToPixels({ x: 0.1, y: 0.2, width: 0.5, height: 0.3 }, 1000, 2000);
  assert.deepEqual(px, { x: 100, y: 400, width: 500, height: 600 });
  const r0 = rotateRectForCrop(px, 1000, 2000, 0);
  assert.equal(r0.targetRotation, 0);
  assert.equal(r0.width, 500);
  assert.equal(r0.height, 600);
  const r90 = rotateRectForCrop({ x: 100, y: 100, width: 200, height: 400 }, 1000, 2000, 90);
  assert.equal(r90.targetRotation, 90);
  assert.equal(r90.width, 400);
  assert.equal(r90.height, 200);
  assert.ok(r90.sourceRect.x >= 0 && r90.sourceRect.y >= 0);
  assert.ok(r90.sourceRect.x + r90.sourceRect.width <= 2000 + 1e-6);
  assert.ok(r90.sourceRect.y + r90.sourceRect.height <= 1000 + 1e-6);
});

test('local selection keeps original photo available and rejects unsupported formats before preparation', () => {
  assert.equal(validateReceiptSelection({ type: 'image/jpeg', size: 5 * 1024 * 1024, name: 'a.jpg' }), null);
  assert.equal(validateReceiptSelection({ type: 'image/png', size: 1, name: 'a.png' }), null);
  assert.equal(validateReceiptSelection({ type: '', size: 100, name: 'IMG.HEIC' }), null);
  assert.match(validateReceiptSelection({ type: 'image/gif', size: 100, name: 'a.gif' }), /JPG/);
  assert.match(validateReceiptSelection({ type: 'application/pdf', size: 8 * 1024 * 1024 + 1, name: 'r.pdf' }), /8 MB/);
});

test('local preparation enforces the 4MP budget, applies bounded contrast without destroying the original selection, and supports original/optimized choice', async () => {
  const oldImage = global.Image;
  const oldDocument = global.document;
  let lastDrawOptions = null;
  global.Image = class {
    naturalWidth = 4000;
    naturalHeight = 3000;
    set src(value) { void value; queueMicrotask(() => this.onload?.()); }
  };
  global.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillStyle: '',
            fillRect() {},
            drawImage() {},
            getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
            putImageData() {},
          };
        },
        toBlob(callback, type, quality) {
          lastDrawOptions = { type, quality };
          callback(new Blob(['opt'], { type: type || 'image/jpeg' }));
        },
      };
    },
  };
  try {
    const source = new File(['original bytes'], 'receipt.jpg', { type: 'image/jpeg' });
    const optimized = await prepareReceiptImageForOcr(source, new AbortController().signal, { mode: 'optimized', maxPixels: 4_000_000 });
    assert.equal(optimized.file.type, 'image/jpeg');
    assert.equal(optimized.prepared, true);
    assert.equal(optimized.original, source);
    assert.ok(optimized.width * optimized.height <= 4_010_000);
    assert.equal(optimized.metadata.budgetPixels, 4_000_000);
    assert.equal(lastDrawOptions.type, 'image/jpeg');
    const original = await prepareReceiptImageForOcr(source, new AbortController().signal, { mode: 'original' });
    assert.equal(original.prepared, false);
    assert.equal(original.file, source);
    assert.equal(original.original, source);
  } finally {
    global.Image = oldImage;
    global.document = oldDocument;
  }
});

test('preparation rejects when canvas cannot be created for local bounded work and never starts parallel workers', async () => {
  const oldImage = global.Image;
  const oldDocument = global.document;
  global.Image = class {
    naturalWidth = 4000;
    naturalHeight = 3000;
    set src(value) { void value; queueMicrotask(() => this.onload?.()); }
  };
  global.document = { createElement() { return { getContext() { return null; } }; } };
  try {
    const source = new File(['x'], 'large.png', { type: 'image/png' });
    await assert.rejects(prepareReceiptImageForOcr(source, new AbortController().signal, { mode: 'optimized', maxPixels: 4_000_000 }));
    await assert.rejects(prepareReceiptImage(source, new AbortController().signal, 4_000_000));
  } finally {
    global.Image = oldImage;
    global.document = oldDocument;
  }
});

test('cancellation aborts preparation without creating overlapping work', async () => {
  const oldImage = global.Image;
  const oldDocument = global.document;
  let started = false;
  global.Image = class {
    naturalWidth = 4000;
    naturalHeight = 3000;
    set src(value) {
      void value;
      started = true;
      setTimeout(() => { if (!aborted) this.onload?.(); }, 20);
    }
  };
  const abort = new AbortController();
  let aborted = false;
  global.document = {
    createElement() {
      return {
        width: 0, height: 0,
        getContext() { return { fillRect() {}, drawImage() {}, getImageData(){return {data:new Uint8ClampedArray(4)};}, putImageData(){} }; },
        toBlob() { assert.fail('should not encode after abort'); },
      };
    },
  };
  try {
    const p = prepareReceiptImageForOcr(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), abort.signal, { mode: 'optimized', maxPixels: 4_000_000 });
    assert.equal(started, true, 'decoding starts only after the abort listener is wired');
    setTimeout(() => { aborted = true; abort.abort(); }, 5);
    await assert.rejects(p);
  } finally {
    global.Image = oldImage;
    global.document = oldDocument;
  }
});

function installTransformCanvas(ops) {
  global.Image = class {
    naturalWidth = 4000;
    naturalHeight = 3000;
    set src(value) { void value; queueMicrotask(() => this.onload?.()); }
  };
  global.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillStyle: '',
            fillRect(...args) { ops.push(['fillRect', ...args]); },
            save() { ops.push(['save']); },
            restore() { ops.push(['restore']); },
            translate(...args) { ops.push(['translate', ...args]); },
            rotate(...args) { ops.push(['rotate', ...args]); },
            drawImage(...args) { ops.push(['drawImage', ...args]); },
          };
        },
        toBlob(callback) { callback(new Blob(['prepared'], { type: 'image/jpeg' })); },
      };
    },
  };
}

test('normalized crop is taken from the original image and rotation is applied afterwards', async () => {
  const oldImage = global.Image;
  const oldDocument = global.document;
  const ops = [];
  installTransformCanvas(ops);
  try {
    const source = new File(['original'], 'receipt.jpg', { type: 'image/jpeg' });
    const prepared = await prepareReceiptImageForOcr(source, new AbortController().signal, {
      mode: 'original',
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      rotation: 90,
      maxPixels: 4_000_000,
    });
    // 4000x3000 crop -> 2000x1500, then 90° -> 1500x2000, still under 4MP.
    assert.equal(prepared.width, 1500);
    assert.equal(prepared.height, 2000);
    assert.ok(prepared.width * prepared.height <= 4_000_000);
    assert.equal(prepared.original, source);
    assert.equal(prepared.prepared, true);
    assert.deepEqual(ops.find((op) => op[0] === 'translate'), ['translate', 1500, 0]);
    assert.deepEqual(ops.find((op) => op[0] === 'rotate'), ['rotate', Math.PI / 2]);
    const draw = ops.find((op) => op[0] === 'drawImage');
    assert.deepEqual(draw.slice(2, 6), [1000, 750, 2000, 1500], 'source rect comes from the unrotated original');
    assert.deepEqual(draw.slice(6), [0, 0, 2000, 1500], 'drawing uses swapped local dimensions');
  } finally {
    global.Image = oldImage;
    global.document = oldDocument;
  }
});

test('rotation 180 and 270 stay bounded by the explicit pixel budget', async () => {
  const oldImage = global.Image;
  const oldDocument = global.document;
  try {
    for (const rotation of [180, 270]) {
      const ops = [];
      installTransformCanvas(ops);
      const prepared = await prepareReceiptImageForOcr(
        new File(['original'], 'receipt.jpg', { type: 'image/jpeg' }),
        new AbortController().signal,
        { mode: 'original', rotation, maxPixels: 4_000_000 },
      );
      assert.ok(prepared.width * prepared.height <= 4_000_000, `${rotation}° exceeds the 4MP budget`);
      assert.equal(prepared.rotation, rotation);
      const draw = ops.find((op) => op[0] === 'drawImage');
      assert.deepEqual(draw.slice(2, 6), [0, 0, 4000, 3000], 'full original crop');
      if (rotation === 270) assert.deepEqual(ops.find((op) => op[0] === 'translate'), ['translate', 0, prepared.height]);
    }
  } finally {
    global.Image = oldImage;
    global.document = oldDocument;
  }
});

test('original mode with an explicit local budget is still bounded instead of returning the 12MP file', async () => {
  const oldImage = global.Image;
  const oldDocument = global.document;
  const ops = [];
  installTransformCanvas(ops);
  try {
    const source = new File(['original'], 'receipt.jpg', { type: 'image/jpeg' });
    const prepared = await prepareReceiptImageForOcr(source, new AbortController().signal, {
      mode: 'original',
      maxPixels: 4_000_000,
    });
    assert.equal(prepared.prepared, true);
    assert.ok(prepared.width * prepared.height <= 4_000_000);
    assert.equal(prepared.original, source);
  } finally {
    global.Image = oldImage;
    global.document = oldDocument;
  }
});

test('invalid crops are rejected before decoding and unusable local encoding rejects', async () => {
  const source = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });
  for (const crop of [
    { x: Number.NaN, y: 0, width: 0.5, height: 0.5 },
    { x: 0, y: 0, width: 0, height: 0.5 },
    { x: 1.2, y: 0, width: 0.5, height: 0.5 },
  ]) {
    await assert.rejects(
      prepareReceiptImageForOcr(source, new AbortController().signal, { mode: 'optimized', crop, maxPixels: 4_000_000 }),
      /recorte/i,
    );
  }
  const oldImage = global.Image;
  const oldDocument = global.document;
  global.Image = class {
    naturalWidth = 4000;
    naturalHeight = 3000;
    set src(value) { void value; queueMicrotask(() => this.onload?.()); }
  };
  global.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() { return { fillStyle: '', fillRect() {}, drawImage() {} }; },
        toBlob(callback) { callback(null); },
      };
    },
  };
  try {
    await assert.rejects(
      prepareReceiptImageForOcr(source, new AbortController().signal, { mode: 'optimized', maxPixels: 4_000_000 }),
      /lectura local/i,
    );
  } finally {
    global.Image = oldImage;
    global.document = oldDocument;
  }
});
