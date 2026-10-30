const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { decodeStockText, isStockFile, parseStockReport } = require('../src/lib/stock.ts');
const { readStockRows } = require('../src/lib/stockFile.ts');

const pipeLine = ' | 1 |7880 PEQUEÑA |26726735 |00200026726735 |OLLA A PRESIÓN 5,7 LTS |(UNI) 1|(UNI) 1|1|1|74990|44438|';
const continuation = ' |      |                            |          |07501068898958 |                                      |          |          |          |          |           |           |';

test('decodes Windows-1252 stock text without losing accents', () => {
  const bytes = Buffer.from(`FECHA EMISION : 19/10/2026\r\nDEPENDENCIA : 10 MAIPU\r\n${pipeLine}\r\n`, 'latin1');
  const text = decodeStockText(bytes);
  assert.match(text, /PEQUEÑA/);
  assert.doesNotMatch(text, /\uFFFD/);
  const snapshot = parseStockReport(text.split(/\r?\n/).map(line => [line]));
  assert.equal(snapshot.date, '2026-10-19');
  assert.equal(snapshot.products[0].description, 'OLLA A PRESIÓN 5,7 LTS');
});

test('imports a pipe report saved as Latin-1 CSV end to end', () => {
  const bytes = Buffer.from(['FECHA EMISION : 19/10/2026', 'DEPENDENCIA : 10 MAIPU', pipeLine, continuation].join('\r\n'), 'latin1');
  const snapshot = parseStockReport(readStockRows(bytes, 'OUT-123.csv'));
  assert.equal(snapshot.store, '10 MAIPU');
  assert.equal(snapshot.products.length, 1);
  assert.deepEqual(snapshot.products[0].barcodes, ['0200026726735', '07501068898958']);
});

test('imports UTF-8 CSV with BOM, semicolon headers and accented descriptions', () => {
  const csv = '\uFEFFFECHA EMISION : 19/10/2026\nAREA;NIVEL DE AGREGACION;PLU;CODIGO DE BARRA;DESCRIPCION PRODUCTO;DISPONIBLE;PRECIO\n99;TV;28475969;200028475969;PANTALLA DE 55 PULGADAS;2;669990\n';
  const snapshot = parseStockReport(readStockRows(Buffer.from(csv, 'utf8'), 'stock.csv'));
  assert.equal(snapshot.products[0].description, 'PANTALLA DE 55 PULGADAS');
  assert.equal(snapshot.products[0].available, 2);
});

test('keeps XLSX reading and rejects workbooks with more than one sheet', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['FECHA EMISION : 19/10/2026'], [pipeLine]]), 'Stock');
  const buffer = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })).buffer;
  assert.equal(parseStockReport(readStockRows(buffer, 'stock.xlsx')).products.length, 1);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Otra');
  const multi = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })).buffer;
  assert.throws(() => readStockRows(multi, 'stock.xlsx'), /una sola hoja/);
});

test('accepts only xlsx or csv files up to 20 MB', () => {
  assert.equal(isStockFile({ name: 'OUT-33644917.CSV', size: 20 * 1024 * 1024 }), true);
  assert.equal(isStockFile({ name: 'stock.xlsx', size: 1 }), true);
  assert.equal(isStockFile({ name: 'stock.xls', size: 1 }), false);
  assert.equal(isStockFile({ name: 'stock.txt', size: 1 }), false);
  assert.equal(isStockFile({ name: 'stock.csv', size: 20 * 1024 * 1024 + 1 }), false);
});
