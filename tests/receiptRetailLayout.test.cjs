const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePrintedReceipt } = require('../src/lib/receiptParser.ts');

// All transcript data below is fictional and only exercises parser rules.
const RETAIL_WITH_PAYMENT_SLIP = [
  'FOLIO:876543210 CAJA:3 LOCAL:99',
  'ARTICULO DEMO 0200012345678 1U 42000',
  'Mas Protecc 3A 200009876543 18000',
  'Subtotal Venta 50420',
  'I.V.A. 9580',
  'TOTAL VENTA 60000',
  'FECHA/HORA:01/10/2026 12:34:56',
  'VENTA DEBITO',
  'TOTAL $60.000',
  'BOLETA:876543210',
  'OPERACION: 556677',
  'AUTORIZACION: 998877',
  'TARJETA: **** **** **** 4321',
].join('\n');

test('retail receipt with lower payment slip keeps retail values and cites the exact source line', () => {
  const result = parsePrintedReceipt(RETAIL_WITH_PAYMENT_SLIP, 92);
  assert.equal(result.fields.folio, '876543210');
  assert.equal(result.fields.precio_producto, 42000);
  assert.equal(result.fields.cantidad_unidades, 1);
  assert.equal(result.fields.valor_garantia, 18000);
  assert.equal(result.fields.total_boleta, 60000);
  assert.equal(result.fields.fecha_compra, '2026-10-01');
  assert.equal(result.fields.canal, 'caja');
  assert.equal(result.fields.anos_garantia, 3);
  assert.equal(result.fields.tipo_garantia, null);
  assert.equal(result.checks.paymentSlipDetected, true);
  assert.equal(result.checks.partsVsTotal, 'match');
  assert.equal(result.evidence.total_boleta.source.text, 'TOTAL VENTA 60000');
  assert.equal(result.evidence.folio.source.text, 'FOLIO:876543210 CAJA:3 LOCAL:99');
  assert.equal(result.evidence.precio_producto.source.text, 'ARTICULO DEMO 0200012345678 1U 42000');
  assert.equal(result.evidence.valor_garantia.source.text, 'Mas Protecc 3A 200009876543 18000');
});

test('header labels after the folio never become additional folio numbers', () => {
  const split = parsePrintedReceipt('FOLIO: 876543210\nCAJA:3\nLOCAL:99\nTOTAL VENTA 1000', 90);
  assert.equal(split.fields.folio, '876543210');
  assert.equal(split.fields.canal, 'caja');
  const sameLine = parsePrintedReceipt('FOLIO:876543210 CAJA:3 LOCAL:99\nTOTAL VENTA 1000', 90);
  assert.equal(sameLine.fields.folio, '876543210');
  assert.equal(sameLine.fields.canal, 'caja');
  assert.equal(sameLine.warnings.some((warning) => /folio/i.test(warning)), false);
});

test('a payment slip alone never pretends to have read product, units or warranty', () => {
  const result = parsePrintedReceipt([
    'VENTA DEBITO',
    'TOTAL $60.000',
    'BOLETA:876543210',
    'OPERACION: 556677',
    'AUTORIZACION: 998877',
    'TARJETA: **** **** **** 4321',
  ].join('\n'), 90);
  assert.equal(result.fields.precio_producto, null);
  assert.equal(result.fields.cantidad_unidades, null);
  assert.equal(result.fields.valor_garantia, null);
  assert.equal(result.fields.anos_garantia, null);
  assert.equal(result.fields.tipo_garantia, null);
  assert.equal(result.fields.numero_pedido, null);
  assert.equal(result.checks.paymentSlipDetected, true);
  assert.ok(result.warnings.some((warning) => /pago|comprobante/i.test(warning)));
});

test('payment-slip totals repeat without becoming a conflict or overriding the retail total', () => {
  const result = parsePrintedReceipt([
    'TOTAL VENTA 60000',
    'VENTA DEBITO',
    'TOTAL $60.000',
    'TOTAL $60.000',
  ].join('\n'), 90);
  assert.equal(result.fields.total_boleta, 60000);
  assert.equal(result.checks.conflictingRetailTotals, false);
  assert.equal(result.warnings.some((warning) => /total aparece/i.test(warning)), false);
});

test('multiple retail product rows stay unassigned instead of inventing one unit price', () => {
  const result = parsePrintedReceipt('ARTICULO UNO 0200012345678 1U 42000\nARTICULO DOS 0200012345679 1U 18000\nTOTAL VENTA 60000', 90);
  assert.equal(result.fields.precio_producto, null);
  assert.equal(result.fields.cantidad_unidades, null);
  assert.equal(result.fields.total_boleta, 60000);
  assert.ok(result.checks.uncertainFields.includes('precio_producto'));
  assert.ok(result.checks.uncertainFields.includes('cantidad_unidades'));
});

test('refunds and negative amounts remain pending instead of becoming positive sales', () => {
  const result = parsePrintedReceipt('TOTAL VENTA -$60.000\nVENTA DEBITO\nTOTAL -$60.000', 90);
  assert.equal(result.fields.total_boleta, null);
  assert.ok(result.warnings.some((warning) => /total/i.test(warning)));
});

test('IU is corrected only in a tight quantity column, never as a blanket replacement', () => {
  const tight = parsePrintedReceipt('ARTICULO DEMO 0200012345678 IU 42000\nTOTAL VENTA 42000', 90);
  assert.equal(tight.fields.precio_producto, 42000);
  assert.equal(tight.fields.cantidad_unidades, 1);
  const prose = parsePrintedReceipt('ARTICULO CIUDAD IU\nTOTAL VENTA 42000', 90);
  assert.equal(prose.fields.cantidad_unidades, null);
  assert.equal(prose.fields.precio_producto, null);
});

test('warranty years come only from explicit warranty-line text; type is never inferred', () => {
  const compact = parsePrintedReceipt('Mas Protecc 3A 200009876543 18000\nTOTAL VENTA 18000', 90);
  assert.equal(compact.fields.anos_garantia, 3);
  assert.equal(compact.fields.tipo_garantia, null);
  // Explicit prose years on a warranty-labelled line are detected; the type
  // remains manual.
  const prose = parsePrintedReceipt('GARANTÍA EXTENDIDA 2 AÑOS $10.000\nTOTAL VENTA $10.000', 90);
  assert.equal(prose.fields.valor_garantia, 10000);
  assert.equal(prose.fields.anos_garantia, 2);
  assert.equal(prose.fields.tipo_garantia, null);
});

test('a printed zero warranty is preserved while a missing warranty remains null', () => {
  const zero = parsePrintedReceipt('ARTICULO DEMO 0200012345678 1U 42000\nMas Protecc 3A 0\nTOTAL VENTA 42000', 90);
  assert.equal(zero.fields.valor_garantia, 0);
  assert.equal(zero.fields.anos_garantia, 3);
  const missing = parsePrintedReceipt('ARTICULO DEMO 0200012345678 1U 42000\nTOTAL VENTA 42000', 90);
  assert.equal(missing.fields.valor_garantia, null);
  assert.equal(missing.fields.anos_garantia, null);
});

test('a retail total that does not match printed parts is kept but flagged as uncertain', () => {
  const result = parsePrintedReceipt([
    'ARTICULO DEMO 0200012345678 1U 42000',
    'Mas Protecc 3A 200009876543 18000',
    'TOTAL VENTA 70000',
  ].join('\n'), 90);
  assert.equal(result.fields.precio_producto, 42000);
  assert.equal(result.fields.valor_garantia, 18000);
  assert.equal(result.fields.total_boleta, 70000);
  assert.equal(result.checks.partsVsTotal, 'mismatch');
  assert.ok(result.warnings.some((warning) => /no cuadra|no coincide/i.test(warning)));
});

test('conflicting retail totals stay pending; payment-slip totals cannot break the tie', () => {
  const result = parsePrintedReceipt([
    'TOTAL VENTA 60000',
    'TOTAL A PAGAR 61000',
    'VENTA DEBITO',
    'TOTAL $61.000',
  ].join('\n'), 90);
  assert.equal(result.fields.total_boleta, null);
  assert.equal(result.checks.conflictingRetailTotals, true);
  assert.ok(result.checks.uncertainFields.includes('total_boleta'));
});

test('layout evidence uses normalized boxes only for the exact line that produced the value', () => {
  const layout = {
    lines: [
      { text: 'FOLIO:876543210 CAJA:3 LOCAL:99', bbox: { x: 0.1, y: 0.05, width: 0.8, height: 0.03 } },
      { text: 'TOTAL VENTA 60000', bbox: { x: 0.1, y: 0.7, width: 0.8, height: 0.03 } },
      { text: 'TOTAL $60.000', bbox: { x: 0.1, y: 0.9, width: 0.8, height: 0.04 } },
      { text: 'TOTAL VENTA 60000', bbox: { x: -1, y: 0.7, width: 0.8, height: 0.03 } },
    ],
  };
  const result = parsePrintedReceipt(RETAIL_WITH_PAYMENT_SLIP, 90, layout);
  assert.deepEqual(result.evidence.total_boleta.source.bbox, { x: 0.1, y: 0.7, width: 0.8, height: 0.03 });
  assert.equal(result.evidence.total_boleta.source.text, 'TOTAL VENTA 60000');
  assert.equal(result.evidence.folio.source.bbox.height, 0.03);
  assert.equal(result.evidence.total_boleta.source.bbox.y, 0.7, 'the invalid duplicate box must not replace the valid one');
});

test('missing or malformed layout keeps the parser usable without evidence boxes', () => {
  for (const layout of [null, undefined, {}, { lines: 'not-an-array' }, { lines: [{ text: 42 }] }]) {
    const result = parsePrintedReceipt('TOTAL VENTA 1000', 90, layout);
    assert.equal(result.fields.total_boleta, 1000);
    assert.equal(result.evidence.total_boleta.source.bbox, undefined);
    assert.equal(result.evidence.total_boleta.source.text, 'TOTAL VENTA 1000');
  }
});

test('blank text keeps empty fields, no evidence values and safe checks', () => {
  const result = parsePrintedReceipt('', 95);
  assert.equal(result.hasUsefulData, false);
  assert.equal(result.fields.total_boleta, null);
  assert.deepEqual(result.evidence, {});
  assert.equal(result.checks.partsVsTotal, 'unknown');
  assert.ok(result.warnings.length > 0);
});
