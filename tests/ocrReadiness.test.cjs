const {test}=require('node:test');const assert=require('node:assert/strict');
const {ocrReadiness}=require('../src/lib/receiptOcr.ts');
test('reader readiness describes configuration without exposing credentials or claiming service health',()=>{
 const info=ocrReadiness({GEMINI_API_KEY:'never-output-this'});
 assert.deepEqual(info,{providers:['gemini'],imageBackup:false,pdfSupported:true});
 assert.equal(JSON.stringify(info).includes('never-output-this'),false);
 assert.deepEqual(ocrReadiness({QWEN_API_KEY:'a',DEEPSEEK_API_KEY:'b'}),{providers:['qwen','deepseek'],imageBackup:true,pdfSupported:false});
 assert.deepEqual(ocrReadiness({}),{providers:[],imageBackup:false,pdfSupported:false});
});
