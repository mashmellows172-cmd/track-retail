const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  GUIDED_SALE_HANDOFF_KEY,
  GUIDED_SALE_TTL_MS,
  SALE_DRAFT_KEY,
  SALE_FORM_ACTIVE_KEY,
  adoptSaleDraft,
  buildGuidedSale,
  clearGuidedSaleHandoff,
  guidedSaleCommission,
  guidedSaleWarnings,
  initialSaleDraft,
  isSaleFormActive,
  loadGuidedSaleHandoff,
  parseGuidedPesos,
  persistSaleDraft,
  saveGuidedSaleHandoff,
} = require('../src/lib/guidedSale.ts');
const { parseSaleDraft } = require('../src/lib/draft.ts');

const product = { plu: '26726760', name: 'AMERICAN TOURISTER MALETA' };
const valid = {
  product,
  precio_producto: '50000',
  cantidad_unidades: '2',
  canal: 'caja',
  valor_garantia: '10000',
  tipo_garantia: 'telefonia',
  anos_garantia: '1',
};

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('a valid guided sale computes total and warranty commission from the shared table', () => {
  const now = 1_700_000_000_000;
  const result = buildGuidedSale(valid, now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.handoff, {
    version: 1,
    createdAt: now,
    product,
    sale: {
      precio_producto: 50000,
      cantidad_unidades: 2,
      canal: 'caja',
      valor_garantia: 10000,
      tipo_garantia: 'telefonia',
      anos_garantia: 1,
      total_boleta: 110000,
    },
  });
  assert.equal(guidedSaleCommission('telefonia', 10000, 1), 1200);
  assert.equal(guidedSaleCommission('lineas_duras', 20001, 4), 2800);
});

test('a blank warranty is zero and never invents a product commission', () => {
  const result = buildGuidedSale({
    ...valid,
    precio_producto: '1000000',
    cantidad_unidades: '1',
    valor_garantia: '',
    tipo_garantia: 'lineas_duras',
    anos_garantia: '1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.handoff.sale.valor_garantia, 0);
  assert.equal(result.handoff.sale.total_boleta, 1_000_000);
  assert.equal(guidedSaleCommission('lineas_duras', 0, 1), 0);
  assert.equal(result.handoff.comision_garantia, undefined);
});

test('invalid money, quantities, channels, warranty types and years are rejected', () => {
  const cases = [
    { precio_producto: '' },
    { precio_producto: '1.5' },
    { precio_producto: '-1000' },
    { precio_producto: '12a' },
    { precio_producto: '9999999999999' },
    { cantidad_unidades: '0' },
    { cantidad_unidades: '10000' },
    { cantidad_unidades: '1.5' },
    { cantidad_unidades: '' },
    { canal: 'web' },
    { tipo_garantia: '' },
    { tipo_garantia: 'hogar' },
    { anos_garantia: '3', tipo_garantia: 'telefonia' },
    { anos_garantia: '5', tipo_garantia: 'lineas_duras' },
    { anos_garantia: '0' },
    { anos_garantia: 'uno' },
    { valor_garantia: '-1' },
    { valor_garantia: '9.990' },
  ];
  for (const change of cases) {
    const result = buildGuidedSale({ ...valid, ...change });
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(change)}`);
    assert.ok(Object.keys(result.errors).length > 0);
  }
  const overflow = buildGuidedSale({ ...valid, precio_producto: '999999999999' });
  assert.equal(overflow.ok, false);
  assert.match(overflow.errors.total_boleta, /total/i);
});

test('an explicitly invalid warranty type requires a selection instead of assuming one', () => {
  const result = buildGuidedSale({ ...valid, tipo_garantia: null, anos_garantia: null });
  assert.equal(result.ok, false);
  assert.match(result.errors.tipo_garantia, /tipo/i);
  assert.match(result.errors.anos_garantia, /año/i);
});

test('stock warnings keep single units conditional and never promise web availability', () => {
  const single = guidedSaleWarnings({ available: 1, listPrice: 59990 }).join(' ');
  assert.match(single, /1 unidad/i);
  assert.match(single, /exhibici/i);
  assert.match(single, /devoluci/i);

  const empty = guidedSaleWarnings({ available: 0, listPrice: 59990 }).join(' ');
  assert.match(empty, /0 unidades/i);
  assert.match(empty, /no prometas|no confirma|no disponible/i);

  const negative = guidedSaleWarnings({ available: -2, listPrice: 59990 }).join(' ');
  assert.match(negative, /negativo/i);
  assert.match(negative, /incidencia/i);

  assert.equal(guidedSaleWarnings({ available: 4, listPrice: 59990 }).length, 0);
  assert.match(guidedSaleWarnings({ available: 1.5, listPrice: 59990 }).join(' '), /disponibilidad/i);
});

test('missing or zero list prices are flagged as unconfirmed', () => {
  for (const listPrice of [0, null, undefined, '59990', 1.5]) {
    const warnings = guidedSaleWarnings({ available: 3, listPrice }).join(' ');
    assert.match(warnings, /precio/i, `expected a price warning for ${String(listPrice)}`);
    assert.match(warnings, /confirm/i);
  }
  assert.doesNotMatch(guidedSaleWarnings({ available: 3, listPrice: 1 }).join(' '), /precio/i);
});

test('parseGuidedPesos accepts only whole safe pesos and rejects ambiguous input', () => {
  assert.equal(parseGuidedPesos('50000'), 50000);
  assert.equal(parseGuidedPesos(50000), 50000);
  assert.equal(parseGuidedPesos('00120'), 120);
  for (const bad of ['', ' ', '1.5', '-1', '1 000', '$1000', '1e5', null, undefined, NaN, Infinity, -1, 1.5, 9999999999999]) {
    assert.equal(parseGuidedPesos(bad), null, `expected null for ${String(bad)}`);
  }
});

test('the handoff round-trips through explicit storage and expires by TTL', () => {
  const storage = memoryStorage();
  const now = 1_700_000_000_000;
  const { handoff } = buildGuidedSale(valid, now);

  assert.equal(saveGuidedSaleHandoff(handoff, storage), true);
  assert.ok(storage.getItem(GUIDED_SALE_HANDOFF_KEY));
  assert.deepEqual(loadGuidedSaleHandoff(storage, now + GUIDED_SALE_TTL_MS - 1), handoff);

  const expired = loadGuidedSaleHandoff(storage, now + GUIDED_SALE_TTL_MS);
  assert.equal(expired, null);
  assert.equal(storage.getItem(GUIDED_SALE_HANDOFF_KEY), null);

  clearGuidedSaleHandoff(storage);
  assert.equal(storage.getItem(GUIDED_SALE_HANDOFF_KEY), null);
});

test('stale, future, malformed or tampered handoffs are rejected', () => {
  const storage = memoryStorage();
  const now = 1_700_000_000_000;
  const { handoff } = buildGuidedSale(valid, now);
  assert.equal(saveGuidedSaleHandoff(handoff, storage), true);

  storage.setItem(GUIDED_SALE_HANDOFF_KEY, JSON.stringify({ ...handoff, createdAt: now + 1 }));
  assert.equal(loadGuidedSaleHandoff(storage, now), null);

  storage.setItem(GUIDED_SALE_HANDOFF_KEY, '{not json');
  assert.equal(loadGuidedSaleHandoff(storage, now), null);

  storage.setItem(GUIDED_SALE_HANDOFF_KEY, JSON.stringify({ ...handoff, product: { plu: '', name: 'TV' } }));
  assert.equal(loadGuidedSaleHandoff(storage, now), null);

  storage.setItem(GUIDED_SALE_HANDOFF_KEY, JSON.stringify({ ...handoff, product: { plu: '1', name: '' } }));
  assert.equal(loadGuidedSaleHandoff(storage, now), null);

  storage.setItem(GUIDED_SALE_HANDOFF_KEY, JSON.stringify({ ...handoff, sale: { ...handoff.sale, precio_producto: 1.5 } }));
  assert.equal(loadGuidedSaleHandoff(storage, now), null);

  storage.setItem(GUIDED_SALE_HANDOFF_KEY, JSON.stringify({ ...handoff, sale: { ...handoff.sale, precio_producto: '50000' } }));
  assert.equal(loadGuidedSaleHandoff(storage, now), null);

  storage.setItem(GUIDED_SALE_HANDOFF_KEY, JSON.stringify({ ...handoff, sale: { ...handoff.sale, cantidad_unidades: '2' } }));
  assert.equal(loadGuidedSaleHandoff(storage, now), null);

  storage.setItem(GUIDED_SALE_HANDOFF_KEY, JSON.stringify({ ...handoff, sale: { ...handoff.sale, total_boleta: 1 } }));
  assert.equal(loadGuidedSaleHandoff(storage, now), null);

  storage.setItem(GUIDED_SALE_HANDOFF_KEY, JSON.stringify({ ...handoff, version: 2 }));
  assert.equal(loadGuidedSaleHandoff(storage, now), null);
});

test('saving an invalid handoff never writes over the previous proposal', () => {
  const storage = memoryStorage();
  const now = 1_700_000_000_000;
  const { handoff } = buildGuidedSale(valid, now);
  saveGuidedSaleHandoff(handoff, storage);
  const before = storage.getItem(GUIDED_SALE_HANDOFF_KEY);

  const tampered = { ...handoff, sale: { ...handoff.sale, total_boleta: 999 } };
  assert.equal(saveGuidedSaleHandoff(tampered, storage), false);
  assert.equal(storage.getItem(GUIDED_SALE_HANDOFF_KEY), before);
});

test('missing storage is a safe no-op and never throws', () => {
  const now = 1_700_000_000_000;
  const { handoff } = buildGuidedSale(valid, now);
  globalThis.sessionStorage = undefined;
  assert.equal(saveGuidedSaleHandoff(handoff), false);
  assert.equal(loadGuidedSaleHandoff(undefined, now), null);
  assert.doesNotThrow(() => clearGuidedSaleHandoff());
});

test('initialSaleDraft mirrors the confirmation form defaults and warranty limits', () => {
  const full = initialSaleDraft({
    folio: null,
    fecha_compra: null,
    canal: 'internet',
    precio_producto: 70000,
    cantidad_unidades: 3,
    valor_garantia: 5000,
    total_boleta: 215000,
    numero_pedido: 'PED-1',
    anos_garantia: 2,
    tipo_garantia: 'telefonia',
  }, '2026-10-23');
  assert.deepEqual(full, {
    folio: '',
    fecha_compra: '2026-10-23',
    canal: 'internet',
    precio_producto: 70000,
    cantidad_unidades: 3,
    valor_garantia: 5000,
    total_boleta: 215000,
    numero_pedido: 'PED-1',
    anos_garantia: 2,
    tipo_garantia: 'telefonia',
    vendedor_id: '',
  });

  const blank = initialSaleDraft({}, '2026-10-23');
  assert.deepEqual(blank, {
    folio: '',
    fecha_compra: '2026-10-23',
    canal: 'caja',
    precio_producto: 0,
    cantidad_unidades: 1,
    valor_garantia: 0,
    total_boleta: 0,
    numero_pedido: '',
    anos_garantia: 1,
    tipo_garantia: 'telefonia',
    vendedor_id: '',
  });
  assert.deepEqual(parseSaleDraft(blank), blank);

  assert.equal(initialSaleDraft({ tipo_garantia: 'telefonia', anos_garantia: 4 }, '2026-10-23').anos_garantia, 1);
  assert.equal(initialSaleDraft({ tipo_garantia: 'lineas_duras', anos_garantia: 4 }, '2026-10-23').anos_garantia, 4);
  assert.equal(initialSaleDraft({ precio_producto: '12.000' }, '2026-10-23').precio_producto, 12000);
});

test('adopting a proposal persists a valid draft before consuming its handoff', () => {
  const storage = memoryStorage();
  const now = 1_700_000_000_000;
  const { handoff } = buildGuidedSale(valid, now);
  assert.equal(saveGuidedSaleHandoff(handoff, storage), true);
  const previous = initialSaleDraft({ folio: 'OLD', precio_producto: 1 }, '2026-10-22');
  storage.setItem(SALE_DRAFT_KEY, JSON.stringify(previous));

  const result = adoptSaleDraft({
    folio: null,
    fecha_compra: null,
    precio_producto: 50000,
    cantidad_unidades: 2,
    valor_garantia: 10000,
    total_boleta: 110000,
    canal: 'caja',
    numero_pedido: null,
    anos_garantia: 1,
    tipo_garantia: 'telefonia',
  }, storage, '2026-10-23');

  assert.equal(result.ok, true);
  assert.equal(storage.getItem(GUIDED_SALE_HANDOFF_KEY), null);
  assert.equal(storage.getItem(SALE_FORM_ACTIVE_KEY), '1');
  assert.equal(isSaleFormActive(storage), true);

  const stored = JSON.parse(storage.getItem(SALE_DRAFT_KEY));
  assert.deepEqual(stored, result.draft);
  assert.deepEqual(parseSaleDraft(stored), result.draft);
  assert.equal(stored.folio, '');
  assert.equal(stored.fecha_compra, '2026-10-23');
});

test('re-entering after adoption keeps the editable draft and does not resurrect the handoff', () => {
  const storage = memoryStorage();
  const now = 1_700_000_000_000;
  const { handoff } = buildGuidedSale(valid, now);
  saveGuidedSaleHandoff(handoff, storage);

  const adopted = adoptSaleDraft({
    precio_producto: handoff.sale.precio_producto,
    cantidad_unidades: handoff.sale.cantidad_unidades,
    valor_garantia: handoff.sale.valor_garantia,
    total_boleta: handoff.sale.total_boleta,
    canal: handoff.sale.canal,
    anos_garantia: handoff.sale.anos_garantia,
    tipo_garantia: handoff.sale.tipo_garantia,
  }, storage, '2026-10-23');
  assert.equal(adopted.ok, true);

  assert.equal(loadGuidedSaleHandoff(storage, now), null);
  assert.equal(isSaleFormActive(storage), true);
  const draft = parseSaleDraft(JSON.parse(storage.getItem(SALE_DRAFT_KEY)));
  assert.deepEqual(draft, adopted.draft);
  assert.equal(draft.cantidad_unidades, 2);
  assert.equal(draft.valor_garantia, 10000);
});

test('adoption writes the new draft before removing the handoff', () => {
  const values = new Map();
  const operations = [];
  const storage = {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { operations.push(`set:${key}`); values.set(key, String(value)); },
    removeItem: key => { operations.push(`remove:${key}`); values.delete(key); },
  };
  const now = 1_700_000_000_000;
  const { handoff } = buildGuidedSale(valid, now);
  assert.equal(saveGuidedSaleHandoff(handoff, storage), true);
  operations.length = 0;

  const result = adoptSaleDraft({ cantidad_unidades: 2, precio_producto: 50000 }, storage, '2026-10-23');
  assert.equal(result.ok, true);
  const draftWrite = operations.indexOf(`set:${SALE_DRAFT_KEY}`);
  const handoffRemoval = operations.indexOf(`remove:${GUIDED_SALE_HANDOFF_KEY}`);
  assert.ok(draftWrite >= 0, 'the adopted draft must be written');
  assert.ok(handoffRemoval > draftWrite, 'the handoff must only be consumed after the draft write');
});

test('a failed draft write preserves the old draft and handoff instead of advancing', () => {
  const storage = memoryStorage();
  const now = 1_700_000_000_000;
  const { handoff } = buildGuidedSale(valid, now);
  saveGuidedSaleHandoff(handoff, storage);
  const previous = initialSaleDraft({ folio: 'OLD', precio_producto: 1 }, '2026-10-22');
  storage.setItem(SALE_DRAFT_KEY, JSON.stringify(previous));
  const beforeDraft = storage.getItem(SALE_DRAFT_KEY);
  const beforeHandoff = storage.getItem(GUIDED_SALE_HANDOFF_KEY);
  const failing = { ...storage, setItem: () => { throw new Error('quota'); } };

  const result = adoptSaleDraft({
    precio_producto: 50000,
    cantidad_unidades: 2,
    valor_garantia: 10000,
    total_boleta: 110000,
    canal: 'caja',
    anos_garantia: 1,
    tipo_garantia: 'telefonia',
  }, failing, '2026-10-23');

  assert.equal(result.ok, false);
  assert.match(result.error, /guardar/i);
  assert.equal(storage.getItem(SALE_DRAFT_KEY), beforeDraft);
  assert.equal(storage.getItem(GUIDED_SALE_HANDOFF_KEY), beforeHandoff);
  assert.equal(storage.getItem(SALE_FORM_ACTIVE_KEY), null);
  assert.deepEqual(parseSaleDraft(JSON.parse(beforeDraft)), previous);
});

test('autosave failure keeps the previous draft and reports false', () => {
  const storage = memoryStorage();
  const previous = initialSaleDraft({ folio: 'OLD', precio_producto: 1 }, '2026-10-22');
  storage.setItem(SALE_DRAFT_KEY, JSON.stringify(previous));
  const before = storage.getItem(SALE_DRAFT_KEY);
  const failing = { ...storage, setItem: () => { throw new Error('quota'); } };

  assert.equal(persistSaleDraft({ ...previous, folio: 'NEW' }, failing), false);
  assert.equal(storage.getItem(SALE_DRAFT_KEY), before);
  assert.equal(persistSaleDraft({ ...previous, folio: 'NEW' }, storage), true);
  assert.equal(JSON.parse(storage.getItem(SALE_DRAFT_KEY)).folio, 'NEW');
});

test('adoption without storage fails instead of pretending the draft was saved', () => {
  const result = adoptSaleDraft({}, null, '2026-10-23');
  assert.equal(result.ok, false);
  assert.match(result.error, /guardar/i);
});

test('the active form retains its product context when revisiting registration',()=>{
 const {markSaleFormActive,isSaleFormActive,readSaleFormContext}=require('../src/lib/guidedSale.ts');
 const storage=memoryStorage();
 assert.equal(markSaleFormActive(storage,product),true);
 assert.equal(isSaleFormActive(storage),true);assert.deepEqual(readSaleFormContext(storage),product);
 markSaleFormActive(storage);assert.deepEqual(readSaleFormContext(storage),product);
 const adopted=adoptSaleDraft({precio_producto:1000},storage,'2026-10-23');
 assert.equal(adopted.ok,true);assert.equal(readSaleFormContext(storage),null);
});
