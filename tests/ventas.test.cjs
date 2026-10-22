const { test } = require('node:test');
const assert = require('node:assert/strict');
const { POST, GET } = require('../src/app/api/ventas/route.ts');
const valid = { folio: '123', fecha_compra: '2026-10-22', canal: 'caja', vendedor_id: 'Ana', precio_producto: 10000, total_boleta: 15000, valor_garantia: 5000, cantidad_unidades: 1, anos_garantia: 1, tipo_garantia: 'telefonia' };
for (const [name, body] of [
  ['null body', null], ['invalid calendar date', { ...valid, fecha_compra: '2026-02-30' }],
  ['negative money', { ...valid, precio_producto: -1 }], ['fractional pesos', { ...valid, valor_garantia: 1.5 }],
  ['unsupported phone warranty', { ...valid, anos_garantia: 4 }], ['blank seller', { ...valid, vendedor_id: '   ' }],
  ['invalid channel', { ...valid, canal: 'otro' }], ['zero units', { ...valid, cantidad_unidades: 0 }],
]) test(`POST rejects ${name} before database access`, async () => {
  const response = await POST(new Request('http://localhost/api/ventas', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal(response.status, 400);
});
test('POST rejects malformed JSON as a client error', async () => {
  assert.equal((await POST(new Request('http://localhost/api/ventas', { method: 'POST', body: '{' }))).status, 400);
});
for (const month of ['2026-13', '2026-00', 'bad', '2026-1']) test(`GET rejects malformed month ${month}`, async () => {
  const response = await GET(new Request(`http://localhost/api/ventas?vendedor_id=Ana&mes=${month}`));
  assert.equal(response.status, 400);
});
test('retrying an identical sale returns its saved receipt instead of a conflict', async () => {
  globalThis._supabaseClient = { from() {
    let inserting = false;
    return { insert() { inserting = true; return this; }, select() { return this; }, eq() { return this; },
      async single() { return inserting ? { data: null, error: { code: '23505' } } : { data: { ...valid, id: 'saved', comision_calculada: 1200 }, error: null }; } };
  } };
  try {
    const response = await POST(new Request('http://localhost/api/ventas', { method: 'POST', body: JSON.stringify(valid) }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, 'saved');
  } finally { delete globalThis._supabaseClient; }
});
