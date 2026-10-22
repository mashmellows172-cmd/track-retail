const {test}=require('node:test'); const assert=require('node:assert/strict');
const {productKind}=require('../src/lib/productPresentation.ts');
const {extractProductImage}=require('../src/lib/abcReference.ts');
const {productGroup,productGroups,matchesProductGroup}=require('../src/lib/productPresentation.ts');

test('every product family has an icon-filter group, including other products',()=>{
 const examples=[['AUDIO','PARLANTE JBL','audio'],['PEQUEÑOS ELECTRODOMESTICOS','HERVIDOR OSTER','smallappliances'],['ASPIRADORAS','ASP_POLVO THOMAS','cleaning'],['CLIMATIZACION','VENTILADOR','climate'],['CUIDADO PERSONAL','SECADOR GAMA','personal'],['CALZADO','ZAPATILLA','footwear'],['VESTUARIO','POLERON','clothing'],['DEPORTES','MANCUERNA','sports'],['BICICLETAS','MTB','sports'],['DORMITORIO','COLCHON','bedroom'],['MUEBLES','COMEDOR','furniture'],['MENAJE','SARTEN','home'],['MALETAS','XTREM','bags'],['JUGUETERIA','MUÑECA','toys'],['HERRAMIENTAS','TALADRO','tools'],['RELOJERIA','RELOJ','accessories'],['VIDEOJUEGOS','CONSOLA','gaming'],['SIN CLASIFICAR','PRODUCTO DESCONOCIDO','other']];
 for(const [category,description,group] of examples){const p={category,description};assert.equal(productGroup(p),group,category);assert.ok(productGroups.some(g=>g.id===group));assert.ok(matchesProductGroup(p,group));assert.ok(matchesProductGroup(p,''));assert.equal(matchesProductGroup(p,group==='tv'?'phone':'tv'),false);}
});

test('category takes precedence over incidental words in product models',()=>{
 assert.equal(productGroup({category:'MOCHILAS',description:'MOCHILA NOTEBOOK HP'}),'bags');
 assert.equal(productGroup({category:'SOPORTES TV',description:'SOPORTE PARED TELEVISOR'}),'accessories');
 assert.equal(productGroup({category:'CUIDADO PERSONAL',description:'SECADOR CABELLO'}),'personal');
 assert.equal(productGroup({category:'REFRIGERADORES',description:'MIDEA'}),'whitegoods');
 assert.equal(productGroup({category:'IMPRESORAS',description:'HP'}),'computer');
 assert.equal(productKind({category:'',description:'SECAD_ROPA MIDEA'}),'laundry');
 assert.equal(productKind({category:'',description:'COMEDOR DREAMS TOLEDO'}),'furniture');
});

test('recognizes report clothing abbreviations without guessing from gender alone',()=>{
 for(const category of ['JEANS','J.INDIGO','BOXER','BERMUDA','CALCETAS','CALZA','TOP','BOTTOM','PILUCHO','TRAJE DE BAÑO','CASACA','TEJIDO','ABRIGO','PETO','BRALETTE']) {
  assert.equal(productGroup({category,description:'PRODUCTO'}),'clothing',category);
 }
 for(const category of ['NIÑO','MUJER','HOMBRE']) assert.equal(productGroup({category,description:'PRODUCTO'}),'other',category);
});

test('recognizes explicit shoe size categories and real home and beauty categories',()=>{
 const examples=[['BALLERINA','footwear'],['NIÑOS26-33','footwear'],['NIÑOS 26 - 33','footwear'],['TWEENS34-40','footwear'],['LABIAL','personal'],['RUBOR','personal'],['SOMBRA','personal'],['SECAPELOS','personal'],['SMARTWATCH','accessories'],['ASADERA','home'],['WOK','home'],['BATERIA ALUMINIO','home'],['SACAJUGO','smallappliances']];
 for(const [category,group] of examples) assert.equal(productGroup({category,description:'PRODUCTO'}),group,category);
 assert.equal(productGroup({category:'TWEENS',description:'PRODUCTO'}),'other');
 assert.equal(productGroup({category:'MUJER',description:'PRODUCTO'}),'other');
});
test('standardizes category icons across product descriptions',()=>{
 assert.equal(productKind({category:'6477 PANTALLA LED 65 Y MAS',description:'PANTALLA_L SAMSUNG'}),'tv');
 assert.equal(productKind({category:'COMPUTACION',description:'NOTEBOOK HP'}),'computer');
 assert.equal(productKind({category:'REFRIGERADORES',description:'MIDEA'}),'fridge');
 assert.equal(productKind({category:'LAVADORAS',description:'LG'}),'laundry');
 assert.equal(productKind({category:'TELEFONIA',description:'MOTOROLA'}),'phone');
 assert.equal(productKind({category:'OTHER',description:'OTHER'}),'generic');
 assert.notEqual(productKind({category:'COMEDOR',description:'COMEDOR DREAMS TOLEDO'}),'tv');
 assert.notEqual(productKind({category:'SECADORES DE CABELLO',description:'SECADOR GAMA'}),'laundry');
});
test('accepts only matching product images on the ABC HTTPS host',()=>{
 assert.equal(extractProductImage('<meta property="og:image" content="https://www.abc.cl/images/29479976.jpg?sw=800&amp;sh=800">','29479976'),'https://www.abc.cl/images/29479976.jpg?sw=800&sh=800');
 assert.equal(extractProductImage('<meta property="og:image" content="https://evil.example/29479976.jpg">','29479976'),null);
 assert.equal(extractProductImage('<meta property="og:image" content="https://www.abc.cl/images/other.jpg">','29479976'),null);
});
