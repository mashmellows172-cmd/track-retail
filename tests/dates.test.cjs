const { test } = require('node:test');
const assert = require('node:assert/strict');
const { monthRange, chileDate, isCalendarDate, saleError } = require('../src/lib/validation.ts');
test('Chile business date stays in the previous month before local midnight', () => {
  assert.equal(chileDate(new Date('2026-11-01T01:00:00Z')), '2026-10-31');
  assert.equal(chileDate(new Date('2026-11-01T04:00:00Z')), '2026-11-01');
});
test('month ranges include leap days without local timezone conversion', () => {
  assert.deepEqual(monthRange('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(monthRange('2026-12'), { start: '2026-12-01', end: '2026-12-31' });
  assert.equal(isCalendarDate('2026-02-29'), false);
  assert.equal(isCalendarDate('2024-02-29'), true);
});
test('valid complete sale passes boundary validation', () => {
  assert.equal(saleError({ folio: ' 123 ', vendedor_id: 'Ana', fecha_compra: '2026-10-22', canal: 'caja', precio_producto: 10000, valor_garantia: 5000, total_boleta: 15000, cantidad_unidades: 1, tipo_garantia: 'telefonia', anos_garantia: 2 }), null);
});
