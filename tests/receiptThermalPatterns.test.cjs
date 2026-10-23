const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePrintedReceipt } = require('../src/lib/receiptParser.ts');

// Fictional OCR transcripts only; these values mirror thermal-printer
// confusions without representing any real document.

test('FULT0/FULTO label is accepted only inside a CAJA+LOCAL header', () => {
  for (const label of ['FULT0', 'FULTO']) {
    const header = parsePrintedReceipt(`${label}:876543210 CAJA:3 LOCAL:99\nTOTAL VENTA 42000`, 95);
    assert.equal(header.fields.folio, '876543210', `${label} header must keep the scanned folio`);
    assert.equal(header.fields.canal, 'caja');
  }
  const withoutHeader = parsePrintedReceipt('FULT0:876543210\nTOTAL VENTA 42000', 95);
  assert.equal(withoutHeader.fields.folio, null, 'a lone FULT0 token is not enough');
});

test('warranty 3A read as 38 keeps only the amount after the internal barcode', () => {
  const result = parsePrintedReceipt('Mas Protecc 38 200009876543 18000\nTOTAL VENTA 18000', 95);
  assert.equal(result.fields.valor_garantia, 18000);
  assert.equal(result.fields.anos_garantia, null, '38 is not evidence for 3 years');
  assert.equal(result.fields.precio_producto, null);
});

test('warranty without an internal barcode keeps the two-amount ambiguity', () => {
  const result = parsePrintedReceipt('Mas Protecc 38 18000\nTOTAL VENTA 18000', 95);
  assert.equal(result.fields.valor_garantia, null);
  assert.equal(result.fields.anos_garantia, null);
  assert.ok(result.warnings.some((warning) => /garant/i.test(warning)));
});

test('two amounts after the warranty barcode stay pending', () => {
  const result = parsePrintedReceipt('Mas Protecc 38 200009876543 18000 19000\nTOTAL VENTA 18000', 95);
  assert.equal(result.fields.valor_garantia, null);
  assert.equal(result.fields.anos_garantia, null);
  assert.ok(result.warnings.some((warning) => /garant/i.test(warning)));
});

test('an explicit 3A warranty still yields 3 years and its amount', () => {
  const result = parsePrintedReceipt('Mas Protecc 3A 200009876543 18000\nTOTAL VENTA 18000', 95);
  assert.equal(result.fields.valor_garantia, 18000);
  assert.equal(result.fields.anos_garantia, 3);
});

test('plain amounts with a leading zero require manual review', () => {
  for (const token of ['06000', '000']) {
    const result = parsePrintedReceipt(`TOTAL VENTA ${token}`, 95);
    assert.equal(result.fields.total_boleta, null, `${token} must not become a positive total`);
    assert.ok(result.warnings.some((warning) => /total/i.test(warning)));
  }
});

test('a single explicit zero warranty remains valid', () => {
  const result = parsePrintedReceipt('Mas Protecc 3A 0\nTOTAL VENTA 42000', 95);
  assert.equal(result.fields.valor_garantia, 0);
  assert.equal(result.fields.anos_garantia, 3);
});
