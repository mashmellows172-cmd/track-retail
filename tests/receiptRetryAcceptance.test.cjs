const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePrintedReceipt } = require('../src/lib/receiptParser.ts');
const { mergeRetryParsed, planReceiptRetry } = require('../src/lib/receiptAnalysis.ts');

const parsed = (text, layout = null) => parsePrintedReceipt(text, 95, layout);

// Fictional public-API acceptance cases for conservative retry behavior.
test('a retry cannot resolve an existing baseline price conflict by selecting one value', () => {
  const baseline = parsed('PRECIO 42000\nPRECIO 43000\nTOTAL VENTA 42000');
  assert.equal(baseline.fields.precio_producto, null);
  const merged = mergeRetryParsed(baseline, parsed('ARTICULO DEMO 1U 42000'));
  assert.equal(merged.fields.precio_producto, null);
  assert.ok(merged.checks.uncertainFields.includes('precio_producto'));
});

test('retry planning does not treat a bank-only total location as the missing retail total', () => {
  const layout = { lines: [
    { text: 'ARTICULO DEMO 1U 42000', bbox: { x: 0.1, y: 0.2, width: 0.8, height: 0.03 } },
    { text: 'VENTA DEBITO', bbox: { x: 0.1, y: 0.7, width: 0.8, height: 0.03 } },
    { text: 'TOTAL 99000', bbox: { x: 0.1, y: 0.8, width: 0.8, height: 0.03 } },
  ] };
  const baseline = parsed('ARTICULO DEMO 1U 42000\nVENTA DEBITO\nTOTAL 99000', layout);
  assert.equal(baseline.fields.total_boleta, null);
  assert.equal(planReceiptRetry(baseline, layout), null,
    'there is no retail location supporting a useful missing-field retry');
});

test('different valid totals across passes remain visibly conflicting', () => {
  const merged = mergeRetryParsed(
    parsed('TOTAL VENTA 42000'),
    parsed('ARTICULO DEMO 1U 43000\nTOTAL VENTA 43000'),
  );
  assert.notEqual(merged.fields.total_boleta, 43000, 'retry cannot silently replace the baseline total');
  assert.ok(merged.checks.conflictingRetailTotals || merged.checks.uncertainFields.includes('total_boleta'),
    'cross-pass disagreement must remain marked for review');
  assert.ok(merged.warnings.some((warning) => /total|conflic|distint|discrep|coincid/i.test(warning)),
    'the disagreement needs a user-visible warning');
});

test('merged fields are checked against the retained printed total', () => {
  const merged = mergeRetryParsed(
    parsed('TOTAL VENTA 42000'),
    parsed('ARTICULO DEMO 1U 39000\nGARANTIA 4000'),
  );
  assert.equal(merged.fields.total_boleta, 42000);
  assert.equal(merged.fields.precio_producto, 39000);
  assert.equal(merged.fields.cantidad_unidades, 1);
  assert.equal(merged.fields.valor_garantia, 4000);
  assert.equal(merged.checks.partsVsTotal, 'mismatch');
  assert.ok(merged.warnings.some((warning) => /no cuadra|no coincide|discrep|distint/i.test(warning)));
});

test('baseline quantity ambiguity cannot be resolved by selecting one retry value', () => {
  const baseline = parsed('CANTIDAD 1\nCANTIDAD 2\nTOTAL VENTA 42000');
  assert.equal(baseline.fields.cantidad_unidades, null);
  assert.ok(baseline.checks.uncertainFields.includes('cantidad_unidades'));
  const merged = mergeRetryParsed(baseline, parsed('ARTICULO DEMO 1U 42000'));
  assert.equal(merged.fields.cantidad_unidades, null);
  assert.ok(merged.checks.uncertainFields.includes('cantidad_unidades'));
});

test('bank-only total remains ineligible for retail retry when the slip is in the upper image half', () => {
  const layout = { lines: [
    { text: 'ARTICULO DEMO 1U 42000', bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.03 } },
    { text: 'VENTA DEBITO', bbox: { x: 0.1, y: 0.3, width: 0.8, height: 0.03 } },
    { text: 'TOTAL 99000', bbox: { x: 0.1, y: 0.4, width: 0.8, height: 0.03 } },
  ] };
  const baseline = parsed('ARTICULO DEMO 1U 42000\nVENTA DEBITO\nTOTAL 99000', layout);
  assert.equal(baseline.fields.total_boleta, null);
  assert.equal(planReceiptRetry(baseline, layout), null,
    'moving a payment section vertically must not change its meaning');
});
