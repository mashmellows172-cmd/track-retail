const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterSales } = require('../src/lib/history.ts');
const sales = [{ id: 'phone', tipo_garantia: 'telefonia' }, { id: 'goods', tipo_garantia: 'lineas_duras' }, { id: 'legacy', tipo_garantia: null }];
test('area selection shows only matching sales without changing the original records', () => {
  assert.deepEqual(filterSales(sales, 'telefonia').map(v => v.id), ['phone']);
  assert.deepEqual(filterSales(sales, 'lineas_duras').map(v => v.id), ['goods']);
  assert.equal(sales.length, 3);
});
test('all areas retain legacy records with no product category', () => {
  assert.deepEqual(filterSales(sales, 'all').map(v => v.id), ['phone', 'goods', 'legacy']);
});
