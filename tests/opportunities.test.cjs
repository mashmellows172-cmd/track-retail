const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getOpportunityItems } = require('../src/lib/opportunities.ts');

test('missing or zero previous prices do not create false price drop opportunities', () => {
  const products = [
    { plu: '1', barcodes: [], area: '1', category: 'X', description: 'A', available: 2, existence: null, price: 10000 },
    { plu: '2', barcodes: [], area: '1', category: 'X', description: 'B', available: 2, existence: null, price: 10000, previousPrice: 0 },
    { plu: '3', barcodes: [], area: '1', category: 'X', description: 'C', available: 2, existence: null, price: 10000, previousPrice: undefined },
    { plu: '4', barcodes: [], area: '1', category: 'X', description: 'D', available: 2, existence: null, price: 0, previousPrice: 10000 },
    { plu: '5', barcodes: [], area: '1', category: 'X', description: 'E', available: 2, existence: null, price: 10000, previousPrice: -100 },
    { plu: '6', barcodes: [], area: '1', category: 'X', description: 'F', available: 2, existence: null, price: 10000, previousPrice: 1.5 },
  ];
  const items = getOpportunityItems(products);
  const drops = items.filter(i => i.kind === 'price_drop');
  assert.equal(drops.length, 0);
});

test('real absolute and percentage drops are detected with stable sorting', () => {
  const products = [
    { plu: '2', barcodes: [], area: '1', category: 'X', description: 'B', available: 5, existence: null, price: 9000, previousPrice: 10000 },
    { plu: '1', barcodes: [], area: '1', category: 'X', description: 'A', available: 3, existence: null, price: 8000, previousPrice: 10000 },
  ];
  const items = getOpportunityItems(products);
  assert.equal(items[0].product.plu, '1');
  assert.equal(items[0].kind, 'price_drop');
  assert.equal(items[0].absoluteDrop, 2000);
  assert.equal(items[0].percentageDrop, 20);
  assert.equal(items[1].kind, 'price_drop');
});

test('stock 1/0/negative are never false opportunities and handled separately', () => {
  const products = [
    { plu: '1', barcodes: [], area: '1', category: 'X', description: 'A', available: 1, existence: null, price: 10000, previousPrice: 12000 },
    { plu: '2', barcodes: [], area: '1', category: 'X', description: 'B', available: 0, existence: null, price: 10000, previousPrice: 12000 },
    { plu: '3', barcodes: [], area: '1', category: 'X', description: 'C', available: -1, existence: null, price: 10000, previousPrice: 12000 },
  ];
  const items = getOpportunityItems(products);
  // A real price drop with a single unit is not excluded; it keeps its confirmation state.
  const drops = items.filter(i => i.kind === 'price_drop');
  assert.equal(drops.length, 1);
  assert.equal(drops[0].product.plu, '1');
  assert.match(drops[0].reason, /unidad/i);
  // Zero and negative units are never offered as opportunities.
  assert.equal(items.filter(i => i.product.plu === '2').length, 0);
  assert.equal(items.filter(i => i.product.plu === '3').length, 0);
  const confirm = items.filter(i => i.kind === 'confirm_single');
  assert.equal(confirm.length, 1);
  assert.equal(confirm[0].product.plu, '1');
});
