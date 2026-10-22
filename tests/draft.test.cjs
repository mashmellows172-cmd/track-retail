const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSaleDraft } = require('../src/lib/draft.ts');
const draft = { folio: '', fecha_compra: '', canal: 'caja', precio_producto: 12345, cantidad_unidades: 0, valor_garantia: -1, total_boleta: 0, numero_pedido: '', anos_garantia: 1, tipo_garantia: 'telefonia', vendedor_id: '' };
test('draft restoration keeps unfinished dates and temporarily invalid amounts', () => {
  assert.deepEqual(parseSaleDraft(draft), draft);
});
test('draft restoration rejects malformed shapes without coercing values', () => {
  assert.equal(parseSaleDraft({ ...draft, precio_producto: '12345' }), null);
  assert.equal(parseSaleDraft({ ...draft, anos_garantia: '1' }), null);
  assert.equal(parseSaleDraft(null), null);
});
