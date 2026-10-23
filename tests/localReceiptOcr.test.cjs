const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  recognizeReceiptLocally,
  localOcrAssetPaths,
  localOcrProgressMessage,
  LocalOcrError,
} = require('../src/lib/localReceiptOcr.ts');

const image = new Blob(['fake receipt'], { type: 'image/jpeg' });
const base = 'https://track.example/registro';

function fakeWorker(overrides = {}) {
  const calls = { recognize: 0, terminate: 0, active: 0, maxActive: 0 };
  const worker = {
    async recognize() {
      calls.recognize += 1;
      return { data: { text: 'TOTAL $159.990', confidence: 82 } };
    },
    async terminate() {
      calls.terminate += 1;
      calls.active -= 1;
    },
    ...overrides,
  };
  return { worker, calls };
}

async function factoryReturning(state, onOptions) {
  return async (langs, oem, options) => {
    state.langs = langs;
    state.oem = oem;
    state.options = options;
    state.calls.active += 1;
    state.calls.maxActive = Math.max(state.calls.maxActive, state.calls.active);
    onOptions?.(options);
    return state.worker;
  };
}

test('las rutas del lector local son del mismo origen y apuntan a los activos self-hosted', () => {
  assert.deepEqual(localOcrAssetPaths(base), {
    workerPath: 'https://track.example/ocr/worker.min.js',
    corePath: 'https://track.example/ocr/core',
    langPath: 'https://track.example/ocr/lang',
  });
  const options = JSON.stringify(localOcrAssetPaths('http://localhost:3000'));
  assert.doesNotMatch(options, /cdn|jsdelivr|tessdata\.projectnaptha/i);
});

test('el progreso local traduce estados reales y no inventa porcentajes', () => {
  assert.deepEqual(localOcrProgressMessage('loading tesseract core', 0.25), {
    message: 'Cargando motor OCR local…',
    percent: 0.25,
  });
  assert.deepEqual(localOcrProgressMessage('loading language traineddata', 0.5), {
    message: 'Cargando idioma español…',
    percent: 0.5,
  });
  assert.deepEqual(localOcrProgressMessage('recognizing text', 0.9), {
    message: 'Leyendo el texto de la boleta…',
    percent: 0.9,
  });
  assert.deepEqual(localOcrProgressMessage('initializing api', 1), {
    message: 'Iniciando lector local…',
    percent: 1,
  });
  assert.deepEqual(localOcrProgressMessage('estado desconocido', Number.NaN), {
    message: 'Preparando lectura local…',
    percent: null,
  });
});

test('la lectura local feliz usa español LSTM, rutas internas, progreso real y termina el worker', async () => {
  const state = fakeWorker();
  state.calls.active = 0;
  const progress = [];
  const stateInfo = { ...state, worker: state.worker };
  const createWorker = await factoryReturning(stateInfo, (options) => {
    options.logger({ status: 'loading language traineddata', progress: 0.4 });
    options.logger({ status: 'recognizing text', progress: 0.8 });
  });
  const result = await recognizeReceiptLocally(image, {
    signal: new AbortController().signal,
    createWorker,
    assetBaseUrl: base,
    onProgress: (item) => progress.push(item),
  });
  assert.equal(stateInfo.langs, 'spa');
  assert.equal(stateInfo.oem, 1);
  assert.equal(stateInfo.options.workerBlobURL, false);
  assert.equal(stateInfo.options.workerPath, 'https://track.example/ocr/worker.min.js');
  assert.deepEqual(result, { text: 'TOTAL $159.990', confidence: 82 });
  assert.deepEqual(progress, [
    { message: 'Cargando idioma español…', percent: 0.4 },
    { message: 'Leyendo el texto de la boleta…', percent: 0.8 },
  ]);
  assert.equal(state.calls.recognize, 1);
  assert.equal(state.calls.terminate, 1);
});

test('la lectura local no crea un worker si la señal ya fue cancelada', async () => {
  const controller = new AbortController();
  controller.abort();
  let factoryCalls = 0;
  await assert.rejects(
    recognizeReceiptLocally(image, {
      signal: controller.signal,
      assetBaseUrl: base,
      createWorker: async () => {
        factoryCalls += 1;
        return fakeWorker().worker;
      },
    }),
    (error) => error instanceof Error,
  );
  assert.equal(factoryCalls, 0);
});

test('cancelar durante el arranque del worker termina el worker tardío y nunca reconoce', async () => {
  const controller = new AbortController();
  const state = fakeWorker();
  let factoryCalls = 0;
  const createWorker = async () => {
    factoryCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return state.worker;
  };
  const pending = recognizeReceiptLocally(image, {
    signal: controller.signal,
    assetBaseUrl: base,
    createWorker,
  });
  setTimeout(() => controller.abort(), 2);
  await assert.rejects(pending, (error) => error instanceof Error);
  // The outer call rejects promptly; the late worker is terminated when its
  // startup eventually finishes.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(factoryCalls, 1);
  assert.equal(state.calls.terminate, 1);
  assert.equal(state.calls.recognize, 0);
});

test('cancelar durante el reconocimiento termina el worker y no deja callbacks tardíos de progreso', async () => {
  const controller = new AbortController();
  const state = fakeWorker({
    recognize() {
      state.calls.recognize += 1;
      return new Promise(() => {});
    },
  });
  const progress = [];
  const stateInfo = { ...state, worker: state.worker };
  const createWorker = await factoryReturning(stateInfo);
  const pending = recognizeReceiptLocally(image, {
    signal: controller.signal,
    assetBaseUrl: base,
    createWorker,
    onProgress: (item) => progress.push(item),
  });
  await new Promise((resolve) => setTimeout(resolve, 1));
  controller.abort();
  await assert.rejects(pending, (error) => error instanceof Error);
  const reportCount = progress.length;
  stateInfo.options.logger({ status: 'recognizing text', progress: 0.99 });
  assert.equal(progress.length, reportCount);
  assert.equal(state.calls.terminate, 1);
});

test('la lectura local respeta el tiempo máximo, termina el worker y explica el límite', async () => {
  const state = fakeWorker({
    recognize() {
      state.calls.recognize += 1;
      return new Promise(() => {});
    },
  });
  const stateInfo = { ...state, worker: state.worker };
  const createWorker = await factoryReturning(stateInfo);
  await assert.rejects(
    recognizeReceiptLocally(image, {
      signal: new AbortController().signal,
      assetBaseUrl: base,
      createWorker,
      timeoutMs: 10,
    }),
    (error) => error instanceof LocalOcrError && error.code === 'timeout' && /tardó demasiado/i.test(error.message),
  );
  assert.equal(state.calls.terminate, 1);
});

test('la lectura local crea y termina un worker por análisis, sin solaparlos', async () => {
  const state = fakeWorker();
  state.calls.active = 0;
  const stateInfo = { ...state, worker: state.worker };
  const createWorker = await factoryReturning(stateInfo);
  for (let run = 0; run < 2; run += 1) {
    const result = await recognizeReceiptLocally(image, {
      signal: new AbortController().signal,
      assetBaseUrl: base,
      createWorker,
    });
    assert.equal(result.text, 'TOTAL $159.990');
  }
  assert.equal(state.calls.recognize, 2);
  assert.equal(state.calls.terminate, 2);
  assert.equal(state.calls.maxActive, 1);
});

test('la lectura local distingue fallos de carga y de reconocimiento y conserva el worker limpio', async () => {
  await assert.rejects(
    recognizeReceiptLocally(image, {
      signal: new AbortController().signal,
      assetBaseUrl: base,
      createWorker: async () => {
        throw new Error('worker script missing');
      },
    }),
    (error) => error instanceof LocalOcrError && error.code === 'load' && /lector local/i.test(error.message),
  );

  const state = fakeWorker({
    async recognize() {
      state.calls.recognize += 1;
      throw new Error('wasm failed');
    },
  });
  const stateInfo = { ...state, worker: state.worker };
  const createWorker = await factoryReturning(stateInfo);
  await assert.rejects(
    recognizeReceiptLocally(image, {
      signal: new AbortController().signal,
      assetBaseUrl: base,
      createWorker,
    }),
    (error) => error instanceof LocalOcrError && error.code === 'recognize' && /no se pudo leer/i.test(error.message),
  );
  assert.equal(state.calls.terminate, 1);
});
