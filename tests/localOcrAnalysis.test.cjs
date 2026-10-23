const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recognizeReceiptLocally, LocalOcrError } = require('../src/lib/localReceiptOcr.ts');

const image = new Blob(['fake receipt'], { type: 'image/jpeg' });
const base = 'https://track.example/registro';
const imageSize = { width: 1000, height: 2000 };

function line(text, y, height = 0.04, x = 0.05, width = 0.9) {
  return { text, bbox: { x0: x * 1000, y0: y * 2000, x1: (x + width) * 1000, y1: (y + height) * 2000 } };
}

function workerWith(recognize) {
  const calls = { recognize: 0, terminate: 0, options: [], outputs: [] };
  const worker = {
    async recognize(_image, options, output) {
      calls.recognize += 1;
      calls.options.push(options);
      calls.outputs.push(output);
      return recognize(calls.recognize, options);
    },
    async terminate() {
      calls.terminate += 1;
    },
  };
  return { worker, calls };
}

function factoryFor(state) {
  return async () => state.worker;
}

test('baseline requests real blocks and returns parsed layout evidence and one pass', async () => {
  const text = 'ARTICULO DEMO 1U 42000\nTOTAL VENTA 42000';
  const state = workerWith(async () => ({
    data: {
      text,
      confidence: 92,
      blocks: [{
        paragraphs: [{
          lines: [
            line('ARTICULO DEMO 1U 42000', 0.2),
            line('TOTAL VENTA 42000', 0.75),
          ],
        }],
      }],
    },
  }));
  const result = await recognizeReceiptLocally(image, {
    signal: new AbortController().signal,
    createWorker: factoryFor(state),
    assetBaseUrl: base,
    imageSize,
  });

  assert.equal(result.passCount, 1);
  assert.equal(result.parsed.fields.total_boleta, 42000);
  assert.equal(result.parsed.fields.precio_producto, 42000);
  assert.equal(result.layout.lines.length, 2);
  assert.ok(result.parsed.evidence.total_boleta.source.bbox);
  assert.equal(state.calls.recognize, 1);
  assert.equal(state.calls.terminate, 1);
  assert.deepEqual(state.calls.outputs[0], { text: true, blocks: true });
});

test('missing total still triggers one bounded retry but never resolves baseline uncertainty', async () => {
  const baselineText = 'ARTICULO DEMO 1U 42000\nTOTAL VENTA';
  const state = workerWith(async (call) => {
    if (call === 1) {
      return {
        data: {
          text: baselineText,
          confidence: 80,
          blocks: [{
            paragraphs: [{
              lines: [
                line('ARTICULO DEMO 1U 42000', 0.35, 0.06),
                line('TOTAL VENTA', 0.78, 0.03, 0.1, 0.8),
              ],
            }],
          }],
        },
      };
    }
    return { data: { text: 'TOTAL VENTA 42000', confidence: 88 } };
  });

  const result = await recognizeReceiptLocally(image, {
    signal: new AbortController().signal,
    createWorker: factoryFor(state),
    assetBaseUrl: base,
    imageSize,
  });

  assert.equal(state.calls.recognize, 2);
  assert.equal(state.calls.terminate, 1, 'both passes use one owned worker');
  assert.deepEqual(state.calls.options[1].rectangle, { left: 80, top: 1536, width: 840, height: 108 });
  assert.equal(state.calls.outputs[1].blocks, false, 'the retry only needs text');
  assert.equal(result.passCount, 2);
  assert.equal(result.parsed.fields.total_boleta, null,
    'the baseline flagged the total as uncertain; the retry must not pick a winner');
  assert.ok(result.parsed.checks.uncertainFields.includes('total_boleta'));
  assert.equal(result.parsed.fields.precio_producto, 42000, 'baseline product value is not replaced');
  assert.equal(result.layout.lines.length, 2, 'exposed layout remains the baseline geometry');
  assert.ok(result.parsed.warnings.some((warning) => /no pudimos confirmar el total|total/i.test(warning)));
});

test('a non-fatal retry error keeps the baseline result and the worker clean', async () => {
  const baselineText = 'ARTICULO DEMO 1U 42000\nTOTAL VENTA';
  const state = workerWith(async (call) => {
    if (call === 1) {
      return {
        data: {
          text: baselineText,
          confidence: 80,
          blocks: [{ paragraphs: [{ lines: [
            line('ARTICULO DEMO 1U 42000', 0.35, 0.06),
            line('TOTAL VENTA', 0.78, 0.03, 0.1, 0.8),
          ] }] }],
        },
      };
    }
    throw new Error('retry engine failed');
  });

  const result = await recognizeReceiptLocally(image, {
    signal: new AbortController().signal,
    createWorker: factoryFor(state),
    assetBaseUrl: base,
    imageSize,
  });

  assert.equal(result.passCount, 2);
  assert.equal(result.parsed.fields.total_boleta, null);
  assert.equal(result.parsed.fields.precio_producto, 42000);
  assert.ok(result.parsed.warnings.some((warning) => /segunda lectura/i.test(warning)));
  assert.equal(state.calls.recognize, 2);
  assert.equal(state.calls.terminate, 1);
});

test('cancelling before the retry prevents the second recognition', async () => {
  const controller = new AbortController();
  const baselineText = 'ARTICULO DEMO 1U 42000\nTOTAL VENTA';
  const state = workerWith(async () => ({
    data: {
      text: baselineText,
      confidence: 80,
      blocks: [{ paragraphs: [{ lines: [
        line('ARTICULO DEMO 1U 42000', 0.35, 0.06),
        line('TOTAL VENTA', 0.78, 0.03, 0.1, 0.8),
      ] }] }],
    },
  }));

  await assert.rejects(
    recognizeReceiptLocally(image, {
      signal: controller.signal,
      createWorker: factoryFor(state),
      assetBaseUrl: base,
      imageSize,
      onProgress: (progress) => {
        if (/zona/i.test(progress.message)) controller.abort();
      },
    }),
    (error) => {
      if (error instanceof LocalOcrError && error.code === 'cancelled') return true;
      return error instanceof DOMException && error.name === 'AbortError';
    },
  );
  assert.equal(state.calls.recognize, 1);
  assert.equal(state.calls.terminate, 1);
});

test('the overall timeout includes both sequential passes', async () => {
  const baselineText = 'ARTICULO DEMO 1U 42000\nTOTAL VENTA';
  const state = workerWith(async (call) => {
    if (call === 1) {
      return {
        data: {
          text: baselineText,
          confidence: 80,
          blocks: [{ paragraphs: [{ lines: [
            line('ARTICULO DEMO 1U 42000', 0.35, 0.06),
            line('TOTAL VENTA', 0.78, 0.03, 0.1, 0.8),
          ] }] }],
        },
      };
    }
    return new Promise(() => {});
  });

  await assert.rejects(
    recognizeReceiptLocally(image, {
      signal: new AbortController().signal,
      createWorker: factoryFor(state),
      assetBaseUrl: base,
      imageSize,
      timeoutMs: 20,
    }),
    (error) => error instanceof LocalOcrError && error.code === 'timeout',
  );
  assert.equal(state.calls.recognize, 2);
  assert.equal(state.calls.terminate, 1);
});

test('conflicting retail totals never start a second pass', async () => {
  const text = 'TOTAL VENTA 42000\nTOTAL VENTA 43000';
  const state = workerWith(async () => ({
    data: {
      text,
      confidence: 90,
      blocks: [{ paragraphs: [{ lines: [
        line('TOTAL VENTA 42000', 0.7),
        line('TOTAL VENTA 43000', 0.75),
      ] }] }],
    },
  }));

  const result = await recognizeReceiptLocally(image, {
    signal: new AbortController().signal,
    createWorker: factoryFor(state),
    assetBaseUrl: base,
    imageSize,
  });

  assert.equal(state.calls.recognize, 1);
  assert.equal(result.passCount, 1);
  assert.equal(result.parsed.checks.conflictingRetailTotals, true);
  assert.equal(result.parsed.fields.total_boleta, null);
});

test('missing blocks fall back to parsed text with no invented geometry and no retry', async () => {
  const state = workerWith(async () => ({
    data: { text: 'FOLIO: 123456\nTOTAL VENTA 42000', confidence: 85 },
  }));

  const result = await recognizeReceiptLocally(image, {
    signal: new AbortController().signal,
    createWorker: factoryFor(state),
    assetBaseUrl: base,
    imageSize,
  });

  assert.equal(state.calls.recognize, 1);
  assert.equal(result.passCount, 1);
  assert.equal(result.layout, undefined);
  assert.equal(result.parsed.fields.total_boleta, 42000);
  assert.equal(result.parsed.evidence.total_boleta.source.bbox, undefined);
});
