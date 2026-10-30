const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getCommissionSummary, parseCardRecords } = require('../src/lib/commissionsSummary.ts');

const OCT_20 = { now: new Date('2026-10-20T12:00:00Z') };
const venta = (fecha, comision) => ({ fecha_compra: fecha, comision_calculada: comision });

test('sums recorded warranty commission only and flags missing or invalid values', () => {
  const ventas = [
    venta('2026-10-01', 1000),
    venta('2026-10-02', 500),
    venta('2026-10-03', 0),
    venta('2026-10-04', undefined),
    venta('2026-10-05', null),
    venta('2026-10-06', -100),
    venta('2026-10-07', 1.5),
    venta('2026-10-08', Number.NaN),
    venta('2026-10-09', Number.POSITIVE_INFINITY),
  ];
  const summary = getCommissionSummary(ventas, [], '2026-10', OCT_20);
  assert.equal(summary.observedWarrantyCommission, 1500);
  assert.equal(summary.cardCommissionTotal, 0);
  assert.equal(summary.totalObserved, 1500);
  assert.equal(summary.invalidRecordCount, 6);
  assert.equal(summary.projection.enabled, false);
  assert.match(summary.projection.reason, /incomplet|inválid|no disponible/i);
});

test('ventas from another month or future dates never enter the selected total', () => {
  const ventas = [
    venta('2026-09-30', 4000),
    venta('2026-10-01', 1000),
    venta('2026-10-21', 9000),
    { fecha_compra: null, comision_calculada: 8000 },
    { fecha_compra: 'not-a-date', comision_calculada: 7000 },
  ];
  const summary = getCommissionSummary(ventas, [], '2026-10', OCT_20);
  assert.equal(summary.observedWarrantyCommission, 1000);
  assert.equal(summary.invalidRecordCount, 2);
  assert.equal(summary.projection.enabled, false);
});

test('card base and same-day top-up are reported separately and counted once', () => {
  const cardRecords = [
    { id: '1', openedOn: '2026-10-10', activatedOn: '2026-10-10', base: 2000, activatedTotal: 5000 },
    { id: '2', openedOn: '2026-10-15', activatedOn: null, base: 1500, activatedTotal: 1500 },
  ];
  const summary = getCommissionSummary([], cardRecords, '2026-10', OCT_20);
  assert.equal(summary.cardBase, 3500);
  assert.equal(summary.cardTopUp, 3000);
  assert.equal(summary.cardCommissionTotal, 6500);
  assert.equal(summary.totalObserved, 6500);
});

test('month boundaries and future cards only count valid opening dates in the selected month', () => {
  const cardRecords = [
    { id: '1', openedOn: '2026-09-30', activatedOn: null, base: 1000, activatedTotal: 1000 },
    { id: '2', openedOn: '2026-10-01', activatedOn: null, base: 2000, activatedTotal: 2000 },
    { id: '3', openedOn: '2026-10-21', activatedOn: null, base: 4000, activatedTotal: 4000 },
    { id: '4', openedOn: '2026-11-01', activatedOn: null, base: 8000, activatedTotal: 8000 },
    { id: '5', openedOn: '2026-10-10', activatedOn: '2026-10-11', base: 2000, activatedTotal: 5000 },
    { id: '6', openedOn: '2026-10-10', activatedOn: null, base: -1, activatedTotal: 100 },
    { id: '7', openedOn: 'not-a-date', activatedOn: null, base: 1000, activatedTotal: 1000 },
  ];
  const summary = getCommissionSummary([], cardRecords, '2026-10', OCT_20);
  assert.equal(summary.cardBase, 2000);
  assert.equal(summary.cardCommissionTotal, 2000);
  assert.equal(summary.invalidRecordCount, 3);
  assert.equal(summary.projection.enabled, false);
});

test('Santiago date decides the current month and day at the UTC boundary', () => {
  const now = new Date('2026-11-01T01:00:00Z'); // 2026-10-31 22:00 in Santiago
  const october = getCommissionSummary([venta('2026-10-05', 5000)], [], '2026-10', { now });
  assert.equal(october.projection.enabled, true);
  assert.equal(october.projection.projectedMonthTotal, 5000);
  assert.match(october.projection.reason, /día 31 de 31/i);

  const november = getCommissionSummary([venta('2026-11-01', 5000)], [], '2026-11', { now });
  assert.equal(november.projection.enabled, false);
  assert.match(november.projection.reason, /mes actual/i);
});

test('historical or future months are observed only and never projected', () => {
  const past = getCommissionSummary([venta('2026-09-10', 1000)], [], '2026-09', OCT_20);
  assert.equal(past.projection.enabled, false);
  assert.match(past.projection.reason, /mes actual/i);
  const future = getCommissionSummary([venta('2026-11-10', 1000)], [], '2026-11', OCT_20);
  assert.equal(future.projection.enabled, false);
  assert.match(future.projection.reason, /mes actual/i);
});

test('projection requires available, current, complete server data and explains calendar-day pace', () => {
  const unavailable = getCommissionSummary([venta('2026-10-01', 1000)], [], '2026-10', { ...OCT_20, hasServerData: false });
  assert.equal(unavailable.projection.enabled, false);
  assert.match(unavailable.projection.reason, /no disponible|desactualiz|sin datos/i);

  const stale = getCommissionSummary([venta('2026-10-01', 1000)], [], '2026-10', { ...OCT_20, hasServerData: true, isStale: true });
  assert.equal(stale.projection.enabled, false);

  const current = getCommissionSummary([venta('2026-10-01', 10_000)], [], '2026-10', {
    now: new Date('2026-10-10T12:00:00Z'),
    hasServerData: true,
  });
  assert.equal(current.projection.enabled, true);
  assert.equal(current.projection.projectedMonthTotal, 31_000);
  assert.match(current.projection.reason, /día 10 de 31/i);
});

test('leap February and month-end projections use chileDate without host timezone drift', () => {
  const leap = getCommissionSummary([venta('2028-02-01', 2900)], [], '2028-02', {
    now: new Date('2028-02-10T12:00:00Z'),
    hasServerData: true,
  });
  assert.equal(leap.projection.enabled, true);
  assert.equal(leap.projection.projectedMonthTotal, 8410);
  assert.match(leap.projection.reason, /día 10 de 29/i);

  const monthEnd = getCommissionSummary([venta('2026-10-31', 5000)], [], '2026-10', {
    now: new Date('2026-10-31T23:30:00Z'),
    hasServerData: true,
  });
  assert.equal(monthEnd.projection.projectedMonthTotal, 5000);
});

test('safe-integer overflow disables totals and projection instead of reporting unsafe numbers', () => {
  const ventas = [
    venta('2026-10-01', Number.MAX_SAFE_INTEGER),
    venta('2026-10-02', 1),
  ];
  const summary = getCommissionSummary(ventas, [], '2026-10', OCT_20);
  assert.equal(summary.overflow, true);
  assert.equal(summary.observedWarrantyCommission, null);
  assert.equal(summary.totalObserved, null);
  assert.equal(summary.projection.enabled, false);
  assert.match(summary.projection.reason, /rango|supera/i);
});

test('an unsafe projection is disabled even when observed totals are safe', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const summary = getCommissionSummary([venta('2026-10-01', 5_000_000_000_000_000)], [], '2026-10', {
    now,
    hasServerData: true,
  });
  assert.equal(summary.overflow, false);
  assert.equal(summary.totalObserved, 5_000_000_000_000_000);
  assert.equal(summary.projection.enabled, false);
  assert.match(summary.projection.reason, /rango|supera/i);
});

test('card record parsing accepts only valid unique records and reports corruption', () => {
  const valid = { id: 'a', openedOn: '2026-10-01', activatedOn: null, base: 1000, activatedTotal: 1000 };
  assert.deepEqual(parseCardRecords(JSON.stringify([valid])), { records: [valid], corrupt: false });
  assert.equal(parseCardRecords('not json').corrupt, true);
  assert.equal(parseCardRecords('{}').corrupt, true);
  assert.equal(parseCardRecords(JSON.stringify([valid, valid])).corrupt, true);
  assert.equal(parseCardRecords(JSON.stringify([{ ...valid, id: 2 }])).corrupt, true);
  assert.equal(parseCardRecords(JSON.stringify([{ ...valid, base: -1 }])).corrupt, true);
  assert.equal(parseCardRecords(null).corrupt, false);
});

test('unavailable server data hides warranty and combined totals but keeps an explicit card subtotal', () => {
  const cardRecords = [{ id: '1', openedOn: '2026-10-10', activatedOn: null, base: 2000, activatedTotal: 2000 }];
  const summary = getCommissionSummary([], cardRecords, '2026-10', { ...OCT_20, hasServerData: false });
  assert.equal(summary.observedWarrantyCommission, null);
  assert.equal(summary.totalObserved, null);
  assert.equal(summary.cardCommissionTotal, 2000);
  assert.equal(summary.projection.enabled, false);
  assert.match(summary.projection.reason, /servidor|no disponible/i);
});

test('corrupt card storage marks card and combined totals unavailable and disables projection', () => {
  const summary = getCommissionSummary([venta('2026-10-01', 1000)], [], '2026-10', { ...OCT_20, cardsCorrupt: true });
  assert.equal(summary.observedWarrantyCommission, 1000);
  assert.equal(summary.cardCommissionTotal, null);
  assert.equal(summary.totalObserved, null);
  assert.equal(summary.projection.enabled, false);
  assert.match(summary.projection.reason, /tarjeta|inv�lid/i);
});

test('a thousand-row server response stays observable but disables the forecast as potentially partial', () => {
  const ventas = Array.from({ length: 1000 }, () => venta('2026-10-01', 1));
  const summary = getCommissionSummary(ventas, [], '2026-10', { ...OCT_20, hasServerData: true });
  assert.equal(summary.totalObserved, 1000);
  assert.equal(summary.projection.enabled, false);
  assert.match(summary.projection.reason, /1000|parcial|incomplet/i);
});
