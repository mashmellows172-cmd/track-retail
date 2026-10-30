const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  duplicateReport,
  normalizeFolio,
  parsePendingQueue,
  parseServerSales,
  serverMonthFor,
  SERVER_DUPLICATE_PAGE_HINT,
} = require('../src/lib/receiptDuplicates.ts');

const candidate = { vendedor_id: 'Ana', folio: ' 00123 ', fecha_compra: '2026-10-23' };
const sale = { id: 's1', vendedor_id: 'Ana', folio: '00123', fecha_compra: '2026-10-23', canal: 'caja' };

test('duplicates match the same seller, calendar date and normalized folio', () => {
  assert.equal(normalizeFolio(' 00123 '), '00123');
  assert.equal(normalizeFolio(' ab-12 '), 'AB-12');
  assert.equal(normalizeFolio(''), null);
  assert.equal(normalizeFolio(null), null);

  assert.deepEqual(duplicateReport(candidate, [sale], []), {
    pending: sale,
    server: null,
    sources: ['pending'],
  });
  assert.deepEqual(duplicateReport(candidate, [], [sale]), {
    pending: null,
    server: sale,
    sources: ['server'],
  });
  assert.deepEqual(duplicateReport(candidate, [sale], [sale]).sources, ['pending', 'server']);
});

test('distinct sellers, dates and folios never produce a false duplicate', () => {
  const differentSeller = { ...sale, vendedor_id: 'Beto' };
  const differentDate = { ...sale, fecha_compra: '2026-10-22' };
  const differentFolio = { ...sale, folio: '00124' };
  const leadingZero = { ...sale, folio: '123' };

  assert.deepEqual(duplicateReport(candidate, [differentSeller], [differentSeller]).sources, []);
  assert.deepEqual(duplicateReport(candidate, [differentDate], [differentDate]).sources, []);
  assert.deepEqual(duplicateReport(candidate, [differentFolio], [differentFolio]).sources, []);
  assert.deepEqual(duplicateReport(candidate, [leadingZero], []).sources, [], 'a real leading zero is not stripped');
  assert.ok(duplicateReport({ ...candidate, folio: '123' }, [leadingZero], []), 'same folio still matches');
});

test('the duplicate warning is channel-agnostic and never rewrites the receipt', () => {
  const internetSale = { ...sale, canal: 'internet' };
  const report = duplicateReport({ ...candidate, canal: 'caja' }, [internetSale], []);
  assert.equal(report.sources.join(','), 'pending');
  assert.equal(report.pending, internetSale);
});

test('an invalid candidate disables the check instead of guessing', () => {
  for (const bad of [
    { ...candidate, folio: '   ' },
    { ...candidate, fecha_compra: '2026-02-30' },
    { ...candidate, vendedor_id: '' },
    { ...candidate, vendedor_id: 12 },
    { ...candidate, folio: 123 },
  ]) {
    assert.equal(duplicateReport(bad, [sale], [sale]), null);
  }
});

test('server payloads are validated before their rows are trusted', () => {
  assert.deepEqual(parseServerSales([sale]), { sales: [sale], possiblyIncomplete: false });
  assert.deepEqual(parseServerSales([]), { sales: [], possiblyIncomplete: false });
  for (const bad of [null, {}, 'rows', [{ ...sale, fecha_compra: 'not-a-date' }], [{ ...sale, folio: '' }], [null]]) {
    assert.equal(parseServerSales(bad), null);
  }
  const capped = Array.from({ length: SERVER_DUPLICATE_PAGE_HINT }, (_, index) => ({
    ...sale,
    id: `s${index}`,
    folio: String(index),
  }));
  const parsed = parseServerSales(capped);
  assert.equal(parsed.sales.length, capped.length);
  assert.equal(parsed.possiblyIncomplete, true);
});

test('queue parsing distinguishes empty, malformed and non-array values', () => {
  assert.deepEqual(parsePendingQueue(null), { sales: [], invalid: false });
  assert.deepEqual(parsePendingQueue('[]'), { sales: [], invalid: false });
  assert.deepEqual(parsePendingQueue(JSON.stringify([sale])), { sales: [sale], invalid: false });
  assert.deepEqual(parsePendingQueue('{broken'), { sales: [], invalid: true });
  assert.deepEqual(parsePendingQueue('{"folio":1}'), { sales: [], invalid: true });
});

test('the lookup month comes only from a valid candidate date', () => {
  assert.equal(serverMonthFor(candidate), '2026-10');
  assert.equal(serverMonthFor({ ...candidate, fecha_compra: '2024-02-29' }), '2024-02');
  assert.equal(serverMonthFor({ ...candidate, fecha_compra: '2023-02-29' }), null);
  assert.equal(serverMonthFor({ ...candidate, fecha_compra: '' }), null);
});
