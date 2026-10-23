const {test}=require('node:test');const assert=require('node:assert/strict');
const {scoreReceipt}=require('../src/lib/ocrBenchmark.ts');
test('benchmark scores only expected receipt fields and counts missing fields as incorrect',()=>{
 assert.deepEqual(scoreReceipt({folio:'1',total_boleta:15000,valor_garantia:null},{folio:'1',total_boleta:1500}),{correct:1,total:3,byField:{folio:true,total_boleta:false,valor_garantia:false}});
 assert.throws(()=>scoreReceipt({},{}));assert.throws(()=>scoreReceipt({secret:'x'},{}));
});
