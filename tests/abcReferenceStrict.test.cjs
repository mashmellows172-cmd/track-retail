const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractProductImage, extractAbcReference}=require('../src/lib/abcReference.ts');

test('old image extraction tests must stay passing',()=>{
  const html='<meta property="og:image" content="https://www.abc.cl/images/29479976.jpg">';
  assert.equal(extractProductImage(html,'29479976'),'https://www.abc.cl/images/29479976.jpg');
});

test('adversarial: two script tags different products - no cross-contamination',()=>{
  const html = '<script type="application/ld+json">{"@type":"Product","sku":"11111111","offers":{"@type":"Offer","price":111111,"priceCurrency":"CLP"}}</script>' +
               '<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":99990,"priceCurrency":"CLP"}}</script>';
  const res = extractAbcReference(html, '29479976');
  const valid = res.prices.filter(p=>typeof p.price==='number');
  assert.equal(valid.length,1);
  assert.equal(valid[0].price,99990);
});

test('adversarial: same script has two products - only exact match',()=>{
  const html = '<script type="application/ld+json">{"@graph":[{"@type":"Product","sku":"11111111","offers":{"@type":"Offer","price":111111,"priceCurrency":"CLP"}},{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":88880,"priceCurrency":"CLP"}}]}</script>';
  const res = extractAbcReference(html, '29479976');
  const valid = res.prices.filter(p=>typeof p.price==='number');
  assert.equal(valid.length,1);
  assert.equal(valid[0].price,88880);
});

test('parseAmount strict: dots/commas as grouping rejected, only integers or .00',()=>{
  const html1 = '<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":149990.00,"priceCurrency":"CLP"}}</script>';
  const res1 = extractAbcReference(html1,'29479976');
  assert.equal(res1.prices.filter(p=>typeof p.price==='number')[0]?.price,149990);
  
  const html2 = '<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":"149.990","priceCurrency":"CLP"}}</script>';
  const res2 = extractAbcReference(html2,'29479976');
  assert.equal(res2.prices.filter(p=>typeof p.price==='number').length,0);
});

test('currency must be explicitly CLP',()=>{
  const html = '<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":99990}}</script>';
  const res = extractAbcReference(html,'29479976');
  assert.equal(res.prices.filter(p=>typeof p.price==='number').length,0);
});

test('html mentions not inferred as card/warranty',()=>{
  const html = '<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":99990,"priceCurrency":"CLP"}}</script><div>precio con tarjeta garantía</div>';
  const res = extractAbcReference(html,'29479976');
  const valid = res.prices.filter(p=>typeof p.price==='number');
  assert.equal(valid[0].cardPrice,null);
  assert.equal(valid[0].warranty,null);
});

test('identity requires exact match, no substring',()=>{
  const html = '<script type="application/ld+json">{"@type":"Product","sku":"129479976","offers":{"@type":"Offer","price":99990,"priceCurrency":"CLP"}}</script>';
  const res = extractAbcReference(html,'29479976');
  assert.equal(res.prices.filter(p=>typeof p.price==='number').length,0);
});
