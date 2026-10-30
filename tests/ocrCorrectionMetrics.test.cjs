const { test } = require('node:test');
const assert = require('node:assert/strict');

// Simple localStorage mock
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const {
  captureOcrBaseline,
  hasOcrBaseline,
  clearOcrBaseline,
  compareOcrBaselineToFinal,
  recordOcrCorrectionsFromFinal,
  loadOcrCorrectionMetrics,
  setOcrCorrectionConsent,
  getOcrCorrectionConsent,
  exportOcrCorrectionMetrics,
  clearOcrCorrectionMetrics,
} = require('../src/lib/ocrCorrectionMetrics.ts');

test('consent is off by default and must be enabled', () => {
  store.clear();
  assert.equal(getOcrCorrectionConsent(), false);
  setOcrCorrectionConsent(true);
  assert.equal(getOcrCorrectionConsent(), true);
  setOcrCorrectionConsent(false);
  assert.equal(getOcrCorrectionConsent(), false);
});

test('baseline only counts when explicitly reviewed OCR present', () => {
  store.clear();
  clearOcrBaseline();
  assert.equal(hasOcrBaseline(), false);
  captureOcrBaseline({ folio: '123', fecha_compra: '2026-10-27', precio_producto: 1000, cantidad_unidades: 1, valor_garantia: 100, total_boleta: 1100, canal: 'caja', numero_pedido: null, anos_garantia: 1, tipo_garantia: 'telefonia' });
  assert.equal(hasOcrBaseline(), true);
  clearOcrBaseline();
  assert.equal(hasOcrBaseline(), false);
});

test('comparison gives 0 or 1 per field and consumes baseline once', () => {
  store.clear();
  clearOcrBaseline();
  const baseline = { folio: '123', fecha_compra: '2026-10-27', precio_producto: 1000, cantidad_unidades: 1, valor_garantia: 100, total_boleta: 1100, canal: 'caja', numero_pedido: null, anos_garantia: 1, tipo_garantia: 'telefonia' };
  captureOcrBaseline(baseline);
  const counts = compareOcrBaselineToFinal({ ...baseline, precio_producto: 1200, folio: '124' });
  assert.equal(hasOcrBaseline(), false);
  assert.equal(counts.precio_producto, 1);
  assert.equal(counts.folio, 1);
  assert.equal(counts.total_boleta, 0);
});

test('manual/guided with no baseline does not count', () => {
  store.clear();
  clearOcrBaseline();
  setOcrCorrectionConsent(true);
  const res = recordOcrCorrectionsFromFinal({ folio: '1', fecha_compra: '2026-10-27', precio_producto: 1000, cantidad_unidades: 1, valor_garantia: 100, total_boleta: 1100, canal: 'caja', numero_pedido: null, anos_garantia: 1, tipo_garantia: 'telefonia' });
  assert.equal(res.entries, 0);
  const loaded = loadOcrCorrectionMetrics();
  assert.equal(loaded.entries, 0);
});

test('consent off prevents writes even if baseline exists', () => {
  store.clear();
  clearOcrBaseline();
  setOcrCorrectionConsent(false);
  const baseline = { folio: '123', fecha_compra: '2026-10-27', precio_producto: 1000, cantidad_unidades: 1, valor_garantia: 100, total_boleta: 1100, canal: 'caja', numero_pedido: null, anos_garantia: 1, tipo_garantia: 'telefonia' };
  captureOcrBaseline(baseline);
  const res = recordOcrCorrectionsFromFinal({ ...baseline, precio_producto: 2000 });
  assert.equal(res.entries, 0);
  clearOcrBaseline();
});

test('retry/duplicate force path must not double increment - once per submission', () => {
  store.clear();
  clearOcrBaseline();
  clearOcrCorrectionMetrics();
  setOcrCorrectionConsent(true);
  const baseline = { folio: '123', fecha_compra: '2026-10-27', precio_producto: 1000, cantidad_unidades: 1, valor_garantia: 100, total_boleta: 1100, canal: 'caja', numero_pedido: null, anos_garantia: 1, tipo_garantia: 'telefonia' };
  captureOcrBaseline(baseline);
  const res1 = recordOcrCorrectionsFromFinal({ ...baseline, precio_producto: 2000 });
  assert.equal(res1.entries, 1);
  // Try to record again without new baseline - should not count
  const res2 = recordOcrCorrectionsFromFinal({ ...baseline, precio_producto: 2000 });
  assert.equal(res2.entries, 1);
});

test('export contains no raw values', () => {
  store.clear();
  clearOcrBaseline();
  clearOcrCorrectionMetrics();
  setOcrCorrectionConsent(true);
  const baseline = { folio: 'ABC', fecha_compra: '2026-10-27', precio_producto: 1000, cantidad_unidades: 1, valor_garantia: 100, total_boleta: 1100, canal: 'caja', numero_pedido: null, anos_garantia: 1, tipo_garantia: 'telefonia' };
  captureOcrBaseline(baseline);
  recordOcrCorrectionsFromFinal({ ...baseline, folio: 'XYZ', total_boleta: 1200 });
  const exported = exportOcrCorrectionMetrics();
  assert.ok(exported.includes('counts'));
  assert.ok(!exported.includes('ABC'));
  assert.ok(!exported.includes('XYZ'));
  assert.ok(!exported.includes('original') && !exported.includes('corrected'));
});
