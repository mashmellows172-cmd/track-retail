const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePrintedReceipt } = require('../src/lib/receiptParser.ts');
const { receiptDimensions } = require('../src/lib/receiptImage.ts');

// Fictional transcripts only; these acceptance cases exercise public helpers.
for (const heading of ['NOTA DE CREDITO', 'DEVOLUCION']) {
  test(`unsigned ${heading} amounts are not ordinary positive sale amounts`, () => {
    const result = parsePrintedReceipt(`${heading}\nFOLIO: 7654321\nARTICULO DEMO 1U 42000\nPRECIO UNITARIO 42000\nTOTAL VENTA 42000`, 95);
    assert.equal(result.fields.total_boleta, null, 'refund context must not become a positive sale total');
    assert.equal(result.fields.precio_producto, null, 'refund context must not become a positive sale price');
    assert.ok(result.warnings.length > 0, 'refund context requires manual review');
  });
}

for (const token of ['42.00O', '42.000,5']) {
  test(`malformed TOTAL ${token} does not salvage a numeric fragment`, () => {
    const result = parsePrintedReceipt(`TOTAL ${token}`, 95);
    assert.equal(result.fields.total_boleta, null);
    assert.ok(result.warnings.length > 0, 'unreadable total requires manual review');
  });
}

for (const [width, height] of [[4032, 3024], [3024, 4032], [3000, 9000], [9000, 3000], [3840, 2160], [2160, 3840], [1600, 10000], [500, 900]]) {
  test(`local prepared dimensions ${width}x${height} strictly respect the 4MP budget`, () => {
    const prepared = receiptDimensions(width, height, 4_000_000);
    assert.ok(Number.isInteger(prepared.width) && prepared.width > 0);
    assert.ok(Number.isInteger(prepared.height) && prepared.height > 0);
    assert.ok(prepared.width * prepared.height <= 4_000_000,
      `${prepared.width}x${prepared.height} exceeds 4,000,000 pixels`);
    assert.ok(prepared.width <= width && prepared.height <= height, 'preparation must not upscale');
  });
}

test('a rejected signed retail total cannot silently inherit a positive bank total', () => {
  const result = parsePrintedReceipt('ARTICULO DEMO 1U 42000\nTOTAL VENTA -60000\nVENTA DEBITO\nTOTAL 60000', 95);
  assert.equal(result.fields.total_boleta, null);
  assert.ok(result.warnings.length > 0, 'the rejected retail amount requires review');
});

test('lower payment identifiers and dates do not contaminate retail header fields', () => {
  const result = parsePrintedReceipt([
    'FOLIO:123456', 'FECHA:01/10/2026', 'CANAL:CAJA',
    'ARTICULO DEMO 1U 42000', 'TOTAL VENTA 42000',
    'VENTA DEBITO', 'BOLETA:999999', 'FECHA:02/10/2026',
    'PEDIDO:778899', 'CANAL:INTERNET',
  ].join('\n'), 95);
  assert.equal(result.fields.folio, '123456');
  assert.equal(result.fields.fecha_compra, '2026-10-01');
  assert.equal(result.fields.canal, 'caja');
  assert.equal(result.fields.numero_pedido, null);
});

test('duplicate retail and bank text cannot assign the bank box to retail evidence', () => {
  const total = 'TOTAL VENTA 42000';
  const result = parsePrintedReceipt(`${total}\nVENTA DEBITO\n${total}`, 95, {
    lines: [
      { text: total, bbox: { x: -1, y: 0.2, width: 0.8, height: 0.05 } },
      { text: 'VENTA DEBITO', bbox: { x: 0.1, y: 0.6, width: 0.8, height: 0.05 } },
      { text: total, bbox: { x: 0.1, y: 0.8, width: 0.8, height: 0.05 } },
    ],
  });
  assert.equal(result.fields.total_boleta, 42000);
  assert.equal(result.evidence.total_boleta.source.text, total);
  assert.equal(result.evidence.total_boleta.source.bbox, undefined,
    'omit an unreliable retail box rather than borrowing the duplicate bank box');
});

test('payment method text before genuine retail rows does not discard those rows', () => {
  const result = parsePrintedReceipt('PAGO TARJETA DEBITO\nARTICULO DEMO 1U 42000\nTOTAL VENTA 42000', 95);
  assert.equal(result.fields.precio_producto, 42000);
  assert.equal(result.fields.cantidad_unidades, 1);
  assert.equal(result.fields.total_boleta, 42000);
  assert.equal(result.warnings.some((warning) => /solo detectamos.*(?:pago|comprobante)/i.test(warning)), false);
});

test('payment method after a retail header still preserves subsequent product rows', () => {
  const result = parsePrintedReceipt('FOLIO:123456\nPAGO TARJETA DEBITO\nARTICULO DEMO 1U 42000\nTOTAL VENTA 42000', 95);
  assert.equal(result.fields.precio_producto, 42000);
  assert.equal(result.fields.cantidad_unidades, 1);
  assert.equal(result.fields.total_boleta, 42000);
});

test('an OCR letter attached to a whole-peso total cannot be silently discarded', () => {
  const result = parsePrintedReceipt('TOTAL 42000O', 95);
  assert.equal(result.fields.total_boleta, null);
  assert.ok(result.warnings.length > 0);
});

test('refund context after printed amounts still prevents an ordinary positive sale', () => {
  const result = parsePrintedReceipt('PRECIO UNITARIO 42000\nTOTAL VENTA 42000\nDEVOLUCION', 95);
  assert.equal(result.fields.total_boleta, null);
  assert.equal(result.fields.precio_producto, null);
  assert.ok(result.warnings.length > 0);
});

test('partial duplicate layout cannot identify a bank box as retail evidence', () => {
  const total = 'TOTAL VENTA 42000';
  const result = parsePrintedReceipt(`${total}\nVENTA DEBITO\n${total}`, 95, {
    lines: [{ text: total, bbox: { x: 0.1, y: 0.8, width: 0.8, height: 0.05 } }],
  });
  assert.equal(result.fields.total_boleta, 42000);
  assert.equal(result.evidence.total_boleta.source.bbox, undefined,
    'duplicate occurrence identity is ambiguous when layout omits one occurrence');
});

test('product price and unit evidence retain the actual product line index', () => {
  const row = 'ARTICULO DEMO 1U 42000';
  const bbox = { x: 0.1, y: 0.3, width: 0.8, height: 0.05 };
  const result = parsePrintedReceipt(`FOLIO:123456\n${row}\nTOTAL VENTA 42000`, 95, {
    lines: [{ text: row, bbox }],
  });
  assert.equal(result.fields.precio_producto, 42000);
  assert.equal(result.fields.cantidad_unidades, 1);
  assert.deepEqual(result.evidence.precio_producto.source.bbox, bbox);
  assert.deepEqual(result.evidence.cantidad_unidades.source.bbox, bbox);
});
