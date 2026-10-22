const { test } = require('node:test');
const assert = require('node:assert/strict');
const receipt = require('../src/lib/receiptImage.ts');
const { receiptDimensions, validateReceiptFile, prepareReceiptImage } = receipt;

test('receipt resizing preserves readable width on long receipts and bounds memory', () => {
  assert.deepEqual(receiptDimensions(1600, 8000), { width: 1600, height: 8000 });
  assert.deepEqual(receiptDimensions(4000, 20000), { width: 1789, height: 8944 });
  assert.deepEqual(receiptDimensions(6000, 4000), { width: 3600, height: 2400 });
  assert.deepEqual(receiptDimensions(500, 900), { width: 500, height: 900 });
});

test('local photo selection allows optimization without relaxing upload or PDF limits', () => {
  assert.equal(typeof receipt.validateReceiptSelection, 'function');
  for (const type of ['image/jpeg', 'image/heic', 'image/heif']) {
    assert.equal(receipt.validateReceiptSelection({ type, size: 24 * 1024 * 1024, name: 'photo' }), null);
    assert.ok(validateReceiptFile({ type, size: 24 * 1024 * 1024 }));
    assert.ok(receipt.validateReceiptSelection({ type, size: 24 * 1024 * 1024 + 1, name: 'photo' }));
  }
  assert.equal(receipt.validateReceiptSelection({ type: '', size: 20, name: 'IMG_001.HEIC' }), null);
  assert.ok(receipt.validateReceiptSelection({ type: 'application/pdf', size: 8 * 1024 * 1024 + 1, name: 'receipt.pdf' }));
  assert.ok(receipt.validateReceiptSelection({ type: 'image/gif', size: 20, name: 'receipt.gif' }));
});

// Browser decoding/canvas are unavailable in Node: supply their boundary behavior,
// keeping File/Blob and preparation/validation logic real.
async function withBrowserImage(mode, run) {
  const originalImage = global.Image;
  const originalDocument = global.document;
  global.Image = class {
    naturalWidth = 1200;
    naturalHeight = 2400;
    set src(value) {
      void value;
      queueMicrotask(() => mode === 'decode-error' ? this.onerror?.() : this.onload?.());
    }
  };
  global.document = { createElement() {
    return {
      getContext: () => ({ fillStyle: '', fillRect() {}, drawImage() {} }),
      toBlob: (callback) => callback(mode === 'encode-error' ? null : new Blob(['converted JPEG'], { type: 'image/jpeg' })),
    };
  } };
  try { await run(); }
  finally { global.Image = originalImage; global.document = originalDocument; }
}

test('small HEIC and unnamed-MIME HEIF are converted even when JPEG is larger', async () => {
  await withBrowserImage('success', async () => {
    for (const [type, name] of [['image/heic', 'camera.heic'], ['', 'camera.HEIF']]) {
      const source = new File(['x'], name, { type });
      const prepared = await prepareReceiptImage(source, new AbortController().signal);
      assert.equal(prepared.type, 'image/jpeg');
      assert.equal(prepared.name, 'camera.jpg');
      assert.ok(prepared.size > source.size);
      assert.equal(validateReceiptFile(prepared), null);
    }
  });
});

test('unavailable HEIC decoding or encoding fails with an actionable photo fallback', async () => {
  for (const mode of ['decode-error', 'encode-error']) {
    await withBrowserImage(mode, async () => {
      await assert.rejects(
        prepareReceiptImage(new File(['x'], 'camera.heic', { type: 'image/heic' }), new AbortController().signal),
        /JPG.*Tomar foto/,
      );
    });
  }
});

test('receipt validation accepts only supported formats within the upload limit', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
    assert.equal(validateReceiptFile({ type, size: 8 * 1024 * 1024 }), null);
  }
  assert.match(validateReceiptFile({ type: 'image/heic', size: 20 }), /JPG/);
  assert.match(validateReceiptFile({ type: 'image/jpeg', size: 8 * 1024 * 1024 + 1 }), /8 MB/);
  assert.match(validateReceiptFile({ type: 'application/pdf', size: 0 }), /vacío/);
});
