const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseReceipt,extractReceipt,configuredProviders,OCRFailure}=require('../src/lib/receiptOcr.ts');
const receipt={folio:'1234',fecha_compra:'2026-10-22',precio_producto:10000,cantidad_unidades:1,valor_garantia:5000,total_boleta:15000,canal:'caja',numero_pedido:null};
test('OCR validates useful receipt data rather than accepting empty or invented values',()=>{
 assert.deepEqual(parseReceipt(JSON.stringify(receipt)),receipt);
 for(const bad of [{}, {...receipt,precio_producto:-1},{...receipt,fecha_compra:'2026-02-30'},{...receipt,cantidad_unidades:0}])assert.throws(()=>parseReceipt(JSON.stringify(bad)));
 assert.throws(()=>parseReceipt('{broken'));
});
test('OCR retries a different configured provider after saturation, with a two-provider bound',async()=>{
 const calls=[]; const result=await extractReceipt({mimeType:'image/jpeg',base64:'fake'},new AbortController().signal,['qwen','deepseek','gemini'],async(provider)=>{calls.push(provider);if(provider==='qwen')throw new OCRFailure(503,'busy');return JSON.stringify(receipt);});
 assert.deepEqual(calls,['qwen','deepseek']);assert.deepEqual(result,receipt);
 const failed=[];await assert.rejects(()=>extractReceipt({mimeType:'image/jpeg',base64:'fake'},new AbortController().signal,['qwen','deepseek','gemini'],async p=>{failed.push(p);throw new OCRFailure(503,'busy');}));assert.equal(failed.length,2);
});
test('OCR never calls a provider after cancellation and tries a healthy backup after provider authorization errors',async()=>{
 const control=new AbortController();control.abort();let calls=0;
 await assert.rejects(()=>extractReceipt({mimeType:'image/jpeg',base64:'fake'},control.signal,['qwen'],async()=>{calls++;}));assert.equal(calls,0);
 await assert.rejects(()=>extractReceipt({mimeType:'image/jpeg',base64:'fake'},new AbortController().signal,['qwen','deepseek'],async()=>{calls++;throw new OCRFailure(401,'key');}));assert.equal(calls,2);
});
test('OCR configuration skips missing keys, deduplicates and preserves an existing Gemini setup',()=>{
 assert.deepEqual(configuredProviders({GEMINI_API_KEY:'test'}),['gemini']);
 assert.deepEqual(configuredProviders({OCR_PROVIDERS:'qwen,deepseek,qwen,unknown',QWEN_API_KEY:'test',DEEPSEEK_API_KEY:'test'}),['qwen','deepseek']);
 assert.deepEqual(configuredProviders({OCR_PROVIDERS:'qwen',GEMINI_API_KEY:'test'}),[]);
});

test('OCR skips incompatible Grok WebP and PDF providers before dispatch',async()=>{
 const calls=[];
 await extractReceipt({mimeType:'image/webp',base64:'fake'},new AbortController().signal,['grok','qwen'],async p=>{calls.push(p);return JSON.stringify(receipt);});
 assert.deepEqual(calls,['qwen']);
 calls.length=0;
 await extractReceipt({mimeType:'application/pdf',base64:'fake'},new AbortController().signal,['qwen','gemini'],async p=>{calls.push(p);return JSON.stringify(receipt);});assert.deepEqual(calls,['gemini']);
});
