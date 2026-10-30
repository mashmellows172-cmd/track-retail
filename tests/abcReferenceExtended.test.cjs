const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractProductImage, extractAbcReference}=require('../src/lib/abcReference.ts');

test('extractProductImage still works for valid og:image',()=>{
  const html='<meta property="og:image" content="https://www.abc.cl/images/29479976.jpg">';
  assert.equal(extractProductImage(html,'29479976'),'https://www.abc.cl/images/29479976.jpg');
});

test('identity-checked JSON-LD: mismatched product returns no price match',()=>{
  const html='<script type="application/ld+json">{"@type":"Product","sku":"11111111","offers":{"@type":"Offer","price":99990,"priceCurrency":"CLP"}}</script>';
  const res = extractAbcReference(html, '29479976');
  // No identity match for different product
  const valid = res.prices.filter(p=>typeof p.price==='number');
  assert.equal(valid.length,0);
});

test('multiple offers ambiguous price',()=>{
  const html='<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":[{"@type":"Offer","price":99990,"priceCurrency":"CLP"},{"@type":"Offer","price":89990,"priceCurrency":"CLP"}]}</script>';
  const res = extractAbcReference(html, '29479976');
  assert.equal(res.hasAmbiguousPrice,true);
});

test('unsupported currencies recorded with null price',()=>{
  const html='<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":99,"priceCurrency":"USD"}}</script>';
  const res = extractAbcReference(html, '29479976');
  assert.equal(res.prices.filter(p=>typeof p.price==='number').length,0);
});

test('malformed amounts give null price',()=>{
  const html='<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":"abc","priceCurrency":"CLP"}}</script>';
  const res = extractAbcReference(html, '29479976');
  assert.equal(res.prices.length>=1,true);
  assert.equal(res.prices[0].price,null);
});

test('URL safety - only https abc.cl same host',()=>{
  const html='<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":99990,"priceCurrency":"CLP","url":"http://evil.example/x"}}</script>';
  const res = extractAbcReference(html, '29479976');
  const valid = res.prices.filter(p=>typeof p.price==='number');
  assert.equal(valid[0].url,null);
});

test('missing card/warranty values not inferred',()=>{
  const html='<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"@type":"Offer","price":99990,"priceCurrency":"CLP"}}</script>';
  const res = extractAbcReference(html, '29479976');
  const valid = res.prices.filter(p=>typeof p.price==='number');
  assert.equal(valid[0].cardPrice,null);
  assert.equal(valid[0].warranty,null);
});
