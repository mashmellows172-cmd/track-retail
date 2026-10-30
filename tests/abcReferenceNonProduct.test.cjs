const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractAbcReference}=require('../src/lib/abcReference.ts');

test('non-Product with matching SKU yields no price',()=>{
  const html = '<script type="application/ld+json">{"@type":"Offer","sku":"29479976","price":99990,"priceCurrency":"CLP"}</script>';
  const res = extractAbcReference(html,'29479976');
  assert.equal(res.prices.filter(p=>typeof p.price==='number').length,0);
});
