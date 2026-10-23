const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeRetryParsed,
  planReceiptRetry,
  receiptLayoutFromBlocks,
  retryPlanPixels,
} = require('../src/lib/receiptAnalysis.ts');
const { parsePrintedReceipt } = require('../src/lib/receiptParser.ts');

const IMAGE_SIZE = { width: 1000, height: 2000 };

function parsed(text, layout = null) {
  return parsePrintedReceipt(text, 90, layout);
}

function line(text, y, height = 0.04, x = 0.05, width = 0.9) {
  return { text, bbox: { x, y, width, height } };
}

test('layout from real OCR blocks normalizes line boxes against the prepared image', () => {
  const layout = receiptLayoutFromBlocks([
    {
      paragraphs: [
        {
          lines: [
            { text: '  FOLIO: 123456  ', bbox: { x0: 50, y0: 100, x1: 450, y1: 140 } },
            { text: 'TOTAL VENTA 42000', bbox: { x0: 50, y0: 1500, x1: 950, y1: 1550 } },
          ],
        },
      ],
    },
  ], IMAGE_SIZE);

  assert.deepEqual(layout, {
    lines: [
      { text: 'FOLIO: 123456', bbox: { x: 0.05, y: 0.05, width: 0.4, height: 0.02 } },
      { text: 'TOTAL VENTA 42000', bbox: { x: 0.05, y: 0.75, width: 0.9, height: 0.025 } },
    ],
  });
});

test('layout conversion keeps text but never invents boxes when geometry is missing or malformed', () => {
  const withoutSize = receiptLayoutFromBlocks([
    { paragraphs: [{ lines: [{ text: 'TOTAL 42000', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }] }] },
  ]);
  assert.deepEqual(withoutSize, { lines: [{ text: 'TOTAL 42000' }] });

  const malformed = receiptLayoutFromBlocks([
    { paragraphs: [{ lines: [
      { text: 'TOTAL 42000', bbox: { x0: 10, y0: 10, x1: 10, y1: 20 } },
      { text: '   ' },
      null,
      { text: 42 },
    ] }] },
  ], IMAGE_SIZE);
  assert.deepEqual(malformed, { lines: [{ text: 'TOTAL 42000' }] });

  assert.equal(receiptLayoutFromBlocks(null, IMAGE_SIZE), null);
  assert.equal(receiptLayoutFromBlocks([], IMAGE_SIZE), null);
});

test('a complete baseline is not retried', () => {
  const layout = { lines: [
    line('ARTICULO DEMO 1U 42000', 0.2),
    line('TOTAL VENTA 42000', 0.8),
  ] };
  const baseline = parsed('ARTICULO DEMO 1U 42000\nTOTAL VENTA 42000', layout);
  assert.equal(planReceiptRetry(baseline, layout), null);
});

test('missing total plans one retry around the actual total line box', () => {
  const layout = { lines: [
    line('ARTICULO DEMO 1U 42000', 0.2),
    line('TOTAL VENTA', 0.78, 0.03, 0.1, 0.8),
  ] };
  const baseline = parsed('ARTICULO DEMO 1U 42000\nTOTAL VENTA', layout);
  assert.equal(baseline.fields.total_boleta, null);
  const plan = planReceiptRetry(baseline, layout);
  assert.equal(plan.reason, 'missing-total');
  assert.ok(plan.rect.y <= 0.78 && plan.rect.y + plan.rect.height >= 0.81,
    'the retry must cover the printed total label, not a fixed guess');
  assert.ok(plan.rect.width <= 0.95 && plan.rect.height <= 0.6, 'retry stays targeted');
});

test('missing product data targets the product row and not the whole receipt', () => {
  const layout = { lines: [
    line('FOLIO: 123456', 0.05),
    line('ARTICULO DEMO 0200012345678 20000', 0.35, 0.06),
    line('TOTAL VENTA 20000', 0.75, 0.04),
  ] };
  const baseline = parsed('FOLIO: 123456\nARTICULO DEMO 0200012345678 20000\nTOTAL VENTA 20000', layout);
  assert.equal(baseline.fields.precio_producto, null);
  const plan = planReceiptRetry(baseline, layout);
  assert.equal(plan.reason, 'missing-price');
  assert.ok(plan.rect.y <= 0.35 && plan.rect.y + plan.rect.height >= 0.41);
  assert.ok(plan.rect.height < 0.6);
});

test('missing total without a usable labelled location is not guessed', () => {
  const layout = { lines: [
    line('ARTICULO DEMO 1U 42000', 0.2),
    line('GRACIAS POR SU COMPRA', 0.9),
  ] };
  const baseline = parsed('ARTICULO DEMO 1U 42000\nGRACIAS POR SU COMPRA', layout);
  assert.equal(planReceiptRetry(baseline, layout), null);
});

test('conflicting totals or an uncertain present total never trigger a rewrite retry', () => {
  const layout = { lines: [
    line('TOTAL VENTA 42000', 0.7),
    line('TOTAL VENTA 43000', 0.75),
  ] };
  const baseline = parsed('TOTAL VENTA 42000\nTOTAL VENTA 43000', layout);
  assert.equal(baseline.checks.conflictingRetailTotals, true);
  assert.equal(planReceiptRetry(baseline, layout), null);

  const mismatchLayout = { lines: [
    line('ARTICULO DEMO 1U 42000', 0.2),
    line('GARANTIA 0', 0.4),
    line('TOTAL VENTA 50000', 0.7),
  ] };
  const mismatch = parsed('ARTICULO DEMO 1U 42000\nGARANTIA 0\nTOTAL VENTA 50000', mismatchLayout);
  assert.equal(mismatch.checks.partsVsTotal, 'mismatch');
  assert.equal(planReceiptRetry(mismatch, mismatchLayout), null);
});

test('retry merge only fills missing baseline fields and never overwrites printed values', () => {
  const baseline = parsed('FOLIO: 123456\nTOTAL VENTA 42000');
  const retry = parsed('ARTICULO DEMO 1U 39000\nGARANTIA 3000');
  const merged = mergeRetryParsed(baseline, retry);

  assert.equal(merged.fields.total_boleta, 42000, 'baseline total is preserved');
  assert.equal(merged.fields.precio_producto, 39000);
  assert.equal(merged.fields.cantidad_unidades, 1);
  assert.equal(merged.fields.valor_garantia, 3000);
  assert.equal(merged.evidence.precio_producto.source.bbox, undefined,
    'retry evidence is text-only unless its geometry is independently reliable');
  assert.ok(merged.warnings.some((warning) => /segunda lectura/i.test(warning)));
});

test('retry merge refuses values the retry parser itself flagged as uncertain', () => {
  const baseline = parsed('FOLIO: 123456');
  const retry = parsed('TOTAL VENTA 42000\nTOTAL VENTA 43000');
  const merged = mergeRetryParsed(baseline, retry);
  assert.equal(merged.fields.total_boleta, null);
  assert.equal(merged.checks.conflictingRetailTotals, true);
});

test('retry merge refuses every baseline ambiguity, not only the product price', () => {
  const baseline = parsed('TOTAL VENTA 42000');
  const ambiguous = [
    'folio',
    'fecha_compra',
    'precio_producto',
    'cantidad_unidades',
    'valor_garantia',
    'total_boleta',
    'canal',
    'numero_pedido',
    'anos_garantia',
  ];
  for (const field of ambiguous) baseline.fields[field] = null;
  baseline.checks.uncertainFields = ambiguous;

  const retry = parsed('FOLIO: 123456\nFECHA: 01/01/2026\nARTICULO DEMO 1U 39000\nGARANTIA 1 AÑO 3000\nCANAL: INTERNET\nPEDIDO: 999\nTOTAL VENTA 42000');
  const merged = mergeRetryParsed(baseline, retry);

  for (const field of ambiguous) {
    assert.equal(merged.fields[field], null,
      `${field} was ambiguous in the baseline and must stay null`);
    assert.ok(merged.checks.uncertainFields.includes(field), `${field} must remain marked as uncertain`);
  }
});

test('retry merge never fills header fields from the amount crop even without an uncertainty flag', () => {
  const baseline = parsed('TOTAL VENTA 42000');
  for (const field of ['folio', 'fecha_compra', 'canal', 'numero_pedido', 'anos_garantia']) {
    baseline.fields[field] = null;
  }

  const retry = parsed('FOLIO: 123456\nFECHA: 01/01/2026\nCANAL: INTERNET\nPEDIDO: 999\nGARANTIA 1 AÑO 3000\nTOTAL VENTA 42000');
  const merged = mergeRetryParsed(baseline, retry);

  for (const field of ['folio', 'fecha_compra', 'canal', 'numero_pedido', 'anos_garantia']) {
    assert.equal(merged.fields[field], null,
      `${field} is outside the printed sale-amount crop`);
  }
});

test('an unusable retry preserves the baseline exactly', () => {
  const baseline = parsed('FOLIO: 123456\nTOTAL VENTA 42000');
  const retry = parsed('GRACIAS POR SU COMPRA');
  assert.deepEqual(mergeRetryParsed(baseline, retry), baseline);
});

test('pixel rectangles are clamped to the prepared image and never negative', () => {
  assert.deepEqual(
    retryPlanPixels({ x: 0.1, y: 0.7, width: 0.8, height: 0.2 }, IMAGE_SIZE),
    { left: 100, top: 1400, width: 800, height: 400 },
  );
  assert.deepEqual(
    retryPlanPixels({ x: -0.2, y: 0.9, width: 1.5, height: 0.5 }, IMAGE_SIZE),
    { left: 0, top: 1800, width: 1000, height: 200 },
  );
  assert.deepEqual(
    retryPlanPixels({ x: 0.999, y: 0.999, width: 0.5, height: 0.5 }, IMAGE_SIZE),
    { left: 999, top: 1998, width: 1, height: 2 },
  );
});
