const {test}=require('node:test'); const assert=require('node:assert/strict');
const {productKind}=require('../src/lib/productPresentation.ts');
const {extractProductImage}=require('../src/lib/abcReference.ts');
test('standardizes category icons across product descriptions',()=>{
 assert.equal(productKind({category:'6477 PANTALLA LED 65 Y MAS',description:'PANTALLA_L SAMSUNG'}),'tv');
 assert.equal(productKind({category:'COMPUTACION',description:'NOTEBOOK HP'}),'computer');
 assert.equal(productKind({category:'REFRIGERADORES',description:'MIDEA'}),'fridge');
 assert.equal(productKind({category:'LAVADORAS',description:'LG'}),'laundry');
 assert.equal(productKind({category:'TELEFONIA',description:'MOTOROLA'}),'phone');
 assert.equal(productKind({category:'OTHER',description:'OTHER'}),'generic');
});
test('accepts only matching product images on the ABC HTTPS host',()=>{
 assert.equal(extractProductImage('<meta property="og:image" content="https://www.abc.cl/images/29479976.jpg?sw=800&amp;sh=800">','29479976'),'https://www.abc.cl/images/29479976.jpg?sw=800&sh=800');
 assert.equal(extractProductImage('<meta property="og:image" content="https://evil.example/29479976.jpg">','29479976'),null);
 assert.equal(extractProductImage('<meta property="og:image" content="https://www.abc.cl/images/other.jpg">','29479976'),null);
});
