const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePrintedReceipt } = require('../src/lib/receiptParser.ts');

const printedReceipt = `FARMACIA Y TIENDA EJEMPLO SPA
RUT: 76.543.210-8
BOLETA ELECTRÓNICA N° 123456
FECHA: 23/10/2026 15:42
CAJA 04
CANAL: CAJA
CANTIDAD: 1
PRECIO UNITARIO $149.990
GARANTÍA EXTENDIDA 2 AÑOS $10.000
SUBTOTAL $134.445
IVA 19% $25.545
TOTAL A PAGAR $159.990
PAGO TARJETA DÉBITO $159.990
CARD 1234 5678 9012 3456
CÓDIGO DE BARRAS 7801234567890
GRACIAS POR SU COMPRA`;

const emptyFields = {
  folio: null,
  fecha_compra: null,
  precio_producto: null,
  cantidad_unidades: null,
  valor_garantia: null,
  total_boleta: null,
  canal: null,
  numero_pedido: null,
  anos_garantia: null,
  tipo_garantia: null,
};

test('lectura local extrae una boleta impresa chilena sin confundir IVA, subtotal, RUT, tarjeta ni código de barras', () => {
  const result = parsePrintedReceipt(printedReceipt, 87);
  assert.deepEqual(result.fields, {
    folio: '123456',
    fecha_compra: '2026-10-23',
    precio_producto: 149990,
    cantidad_unidades: 1,
    valor_garantia: 10000,
    total_boleta: 159990,
    canal: 'caja',
    numero_pedido: null,
    anos_garantia: null,
    tipo_garantia: null,
  });
  assert.equal(result.hasUsefulData, true);
  assert.deepEqual(result.warnings, []);
});

test('lectura local no reconstruye el total sumando precio y garantía cuando falta la etiqueta', () => {
  const result = parsePrintedReceipt(`PRECIO $149.990
GARANTÍA $10.000
SUBTOTAL $134.445
IVA 19% $25.545`, 90);
  assert.equal(result.fields.precio_producto, 149990);
  assert.equal(result.fields.valor_garantia, 10000);
  assert.equal(result.fields.total_boleta, null);
  assert.equal(result.fields.cantidad_unidades, null);
  assert.ok(result.warnings.some((warning) => /total/i.test(warning)));
  assert.doesNotMatch(result.warnings.join(' '), /159\.990|159990/);
});

test('lectura local deja el total y el precio en null ante valores distintos y avisa la ambigüedad', () => {
  const result = parsePrintedReceipt(`PRECIO $149.990
PRECIO $99.990
TOTAL $159.990
TOTAL A PAGAR $149.990`, 80);
  assert.equal(result.fields.precio_producto, null);
  assert.equal(result.fields.total_boleta, null);
  assert.ok(result.warnings.some((warning) => /precio/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /total/i.test(warning)));
  assert.equal(result.hasUsefulData, true);
});

test('lectura local acepta etiquetas repetidas con el mismo monto', () => {
  const result = parsePrintedReceipt(`PRECIO $149.990
PRECIO UNITARIO $149.990
TOTAL $159.990
TOTAL A PAGAR $159.990`, 85);
  assert.equal(result.fields.precio_producto, 149990);
  assert.equal(result.fields.total_boleta, 159990);
});

test('lectura local ignora totales de pago, ahorro, IVA y líneas que no son montos', () => {
  const result = parsePrintedReceipt(`TOTAL $159.990
SUBTOTAL $134.445
IVA 19% $25.545
TOTAL TARJETA $160.000
TOTAL EFECTIVO $0
TOTAL AHORRO $5.000
TOTAL ARTÍCULOS 3
BOLETA ELECTRÓNICA N° 123456
RUT 12.345.678-9
TARJETA 1234 5678 9012 3456`, 78);
  assert.equal(result.fields.total_boleta, 159990);
  assert.equal(result.fields.folio, '123456');
});

test('lectura local no convierte precios ni garantías desde el total cuando faltan etiquetas', () => {
  const result = parsePrintedReceipt('TOTAL $159.990', 88);
  assert.equal(result.fields.total_boleta, 159990);
  assert.equal(result.fields.precio_producto, null);
  assert.equal(result.fields.valor_garantia, null);
  assert.equal(result.hasUsefulData, true);
});

test('lectura local reconoce formatos de folio y rechaza códigos de barras como folio', () => {
  assert.equal(parsePrintedReceipt('FOLIO: 123456', 90).fields.folio, '123456');
  assert.equal(parsePrintedReceipt('N° BOLETA 00123456', 90).fields.folio, '00123456');
  assert.equal(parsePrintedReceipt('NUMERO DE BOLETA: A-1234', 90).fields.folio, 'A-1234');
  const barcode = parsePrintedReceipt('FOLIO 7801234567890\nTOTAL $159.990', 90);
  assert.equal(barcode.fields.folio, null);
  assert.ok(barcode.warnings.some((warning) => /folio/i.test(warning)));
  const card = parsePrintedReceipt('BOLETA N° 1234 5678 9012 3456\nTOTAL $159.990', 90);
  assert.equal(card.fields.folio, null);
});

test('lectura local exige etiqueta de fecha, valida el calendario y no inventa el siglo', () => {
  assert.equal(parsePrintedReceipt('FECHA: 23-10-2026', 90).fields.fecha_compra, '2026-10-23');
  assert.equal(parsePrintedReceipt('FECHA DE EMISION 2026-10-23', 90).fields.fecha_compra, '2026-10-23');
  assert.equal(parsePrintedReceipt('FECHA: 31/02/2026', 90).fields.fecha_compra, null);
  assert.equal(parsePrintedReceipt('FECHA: 23/10/26', 90).fields.fecha_compra, null);
  assert.equal(parsePrintedReceipt('23/10/2026\nTOTAL $159.990', 90).fields.fecha_compra, null);
});

test('lectura local reconoce canal y pedido solo con etiqueta explícita y no los confunde con folio', () => {
  const result = parsePrintedReceipt(`CANAL: INTERNET
N° PEDIDO: WEB-998877
TOTAL $159.990`, 90);
  assert.equal(result.fields.canal, 'internet');
  assert.equal(result.fields.numero_pedido, 'WEB-998877');
  assert.equal(result.fields.folio, null);
  assert.equal(parsePrintedReceipt('CANAL: CAJA', 90).fields.canal, 'caja');
  assert.equal(parsePrintedReceipt('VENDO POR INTERNET', 90).fields.canal, null);
});

test('lectura local conserva años y tipo de garantía en null aunque el texto mencione años', () => {
  const result = parsePrintedReceipt('GARANTÍA EXTENDIDA 2 AÑOS $10.000', 90);
  assert.equal(result.fields.valor_garantia, 10000);
  assert.equal(result.fields.anos_garantia, null);
  assert.equal(result.fields.tipo_garantia, null);
});

test('lectura local advierte baja confianza pero conserva los valores para revisión manual', () => {
  const result = parsePrintedReceipt(printedReceipt, 41);
  assert.equal(result.fields.total_boleta, 159990);
  assert.ok(result.warnings.some((warning) => /confianza/i.test(warning) && /revis/i.test(warning)));
});

test('lectura local no afirma haber leído una boleta vacía o solo con texto irrelevante', () => {
  for (const text of ['', '   \n\n  ', 'GRACIAS POR SU COMPRA\nRUT 76.543.210-8\n7801234567890']) {
    const result = parsePrintedReceipt(text, 95);
    assert.deepEqual(result.fields, emptyFields);
    assert.equal(result.hasUsefulData, false);
    assert.ok(result.warnings.some((warning) => /no pudimos|no se detect/i.test(warning)));
  }
});

test('lectura local acepta montos con punto o coma de miles y rechaza decimales ambiguos', () => {
  assert.equal(parsePrintedReceipt('TOTAL $ 159.990', 90).fields.total_boleta, 159990);
  assert.equal(parsePrintedReceipt('TOTAL: 159,990', 90).fields.total_boleta, 159990);
  assert.equal(parsePrintedReceipt('TOTAL: 159990', 90).fields.total_boleta, 159990);
  assert.equal(parsePrintedReceipt('TOTAL: 159,99', 90).fields.total_boleta, null);
  assert.equal(parsePrintedReceipt('TOTAL: 1.234.567', 90).fields.total_boleta, 1234567);
});

test('lectura local no mezcla cantidades con precios en la misma línea', () => {
  assert.equal(parsePrintedReceipt('CANTIDAD: 2\nTOTAL $159.990', 90).fields.cantidad_unidades, 2);
  assert.equal(parsePrintedReceipt('CANTIDAD: 2 X $149.990', 90).fields.cantidad_unidades, 2);
  assert.equal(parsePrintedReceipt('CANTIDAD: 0\nTOTAL $159.990', 90).fields.cantidad_unidades, null);
  assert.equal(parsePrintedReceipt('CANTIDAD: 10000', 90).fields.cantidad_unidades, null);
});
