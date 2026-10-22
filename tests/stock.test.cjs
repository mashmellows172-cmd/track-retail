const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseStockReport, findProduct, channelAdvice } = require('../src/lib/stock.ts');
const line = (plu='26726760', barcode='00200026726766', available=2, price=59990) => ` | 1 |7881 MEDIANA |${plu} |${barcode} |AMERICAN TOURISTER MALETA |(UNI) 3|(UNI) 3|3|${available}|${price}|49994|`;
test('reads report metadata and product split across cells without losing barcode zeros', () => {
 const s = line(); const cut=s.indexOf('MALETA')+3;
 const result=parseStockReport([['FECHA EMISION : 17/06/2026'],['DEPENDENCIA : 10 MAIPU'],[s.slice(0,cut),s.slice(cut)]]);
 assert.equal(result.date,'2026-06-17'); assert.equal(result.store,'10 MAIPU');
 assert.equal(result.products[0].barcodes[0],'00200026726766'); assert.equal(result.products[0].available,2);
 assert.equal(result.products[0].price,59990); assert.equal(result.products[0].existence,3);
 assert.equal('cost' in result.products[0],false);
});
test('merges repeated PLU and continuation barcodes without adding stock', () => {
 const r=parseStockReport([['FECHA EMISION : 17/06/2026'],[line()],[' | | | |07501068898989 | | | | | | | |'],[line('26726760','07501068898989')]]);
 assert.equal(r.products.length,1); assert.equal(r.products[0].available,2); assert.equal(r.products[0].barcodes.length,2);
 assert.equal(findProduct(r.products,'7501068898989').plu,'26726760');
 assert.equal(findProduct(r.products,'26726760').plu,'26726760');
 assert.equal(findProduct(r.products,'bad'),undefined);
});
test('rejects conflicting duplicate stock and malformed product records', () => {
 assert.throws(()=>parseStockReport([['FECHA EMISION : 17/06/2026'],[line()],[line('26726760','00200026726766',9)]]),/conflict/i);
 assert.throws(()=>parseStockReport([['FECHA EMISION : 17/06/2026'],[line().replace('|59990|','|bad|')]]),/fila/i);
 assert.throws(()=>parseStockReport([['hello']]),/informe/i);
});
test('stock advice keeps a single unit conditional and never promises online availability', () => {
 assert.equal(channelAdvice(2),'sala'); assert.equal(channelAdvice(1),'verificar');
 assert.equal(channelAdvice(0),'consultar_web'); assert.equal(channelAdvice(-1),'incidencia');
});
test('does not silently discard malformed identifiers or product rows without area', () => {
 assert.throws(()=>parseStockReport([['FECHA EMISION : 17/06/2026'],[line()],[line('123ABC')]]),/fila/i);
 assert.throws(()=>parseStockReport([['FECHA EMISION : 17/06/2026'],[line()],[line('12345678').replace(' | 1 |',' | |')]]),/fila/i);
 assert.throws(()=>parseStockReport([['FECHA EMISION : 17/06/2026'],[line()],[line('BAD').replace('|2|','|BAD|')]]),/fila/i);
});
test('ambiguous barcode never selects the first product silently', () => {
 const r=parseStockReport([['FECHA EMISION : 17/06/2026'],[line()],[line('12345678')]]);
 assert.equal(findProduct(r.products,'00200026726766'),undefined);
});
