const {test}=require('node:test');const assert=require('node:assert/strict');
const {parsePrintedReceipt}=require('../src/lib/receiptParser.ts');
test('product words containing identifier labels do not become receipt identifiers',()=>{
 const {fields}=parsePrintedReceipt('PORTAFOLIO MARCA 1234\nORDENADOR MODELO 5678\nTOTAL VENTA 10000',90);
 assert.equal(fields.folio,null);assert.equal(fields.numero_pedido,null);
});
test('refund signs and fractional pesos are never silently converted to positive whole sales',()=>{
 for(const text of ['TOTAL VENTA -$10.000','TOTAL VENTA $-10.000','TOTAL VENTA (10.000)','TOTAL VENTA $1.234,56'])assert.equal(parsePrintedReceipt(text,90).fields.total_boleta,null,text);
});
test('a typical one-unit retail line and Mas Proteccion are recognized without an API',()=>{
 const {fields}=parsePrintedReceipt('FOLIO: 12345678\nFECHA: 23/10/2026\nCAJA: 05\nTELEVISOR PRUEBA 1U $149.990\nMAS PROTECCION 2A $10.000\nSUBTOTAL $134.445\nIVA 19% $25.545\nTOTAL VENTA $159.990',94);
 assert.equal(fields.precio_producto,149990);assert.equal(fields.cantidad_unidades,1);assert.equal(fields.valor_garantia,10000);assert.equal(fields.total_boleta,159990);assert.equal(fields.canal,'caja');
});
test('retail barcode is not a warranty amount and multiple item rows do not invent unit price',()=>{
 const {fields}=parsePrintedReceipt('TV 1U $149.990\nRADIO 1U $10.000\nMas Protecc 1A 200002700445 18244\nTOTAL VENTA $178.234',90);
 assert.equal(fields.precio_producto,null);assert.equal(fields.cantidad_unidades,null);assert.equal(fields.valor_garantia,18244);
});
test('a multi-unit retail line does not guess whether its printed amount is a unit price',()=>{
 const {fields}=parsePrintedReceipt('FOLIO: 123\nTELEVISOR 2U $200.000\nTOTAL $200.000',90);
 assert.equal(fields.precio_producto,null);assert.equal(fields.cantidad_unidades,2);
});
