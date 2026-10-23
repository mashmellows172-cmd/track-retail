const {test}=require('node:test');const assert=require('node:assert/strict');
const {GET}=require('../src/app/api/ocr/status/route.ts');
test('public OCR status is uncached and returns only the configuration contract',async()=>{
 const response=await GET();const body=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(Object.keys(body).sort(),['imageBackup','pdfSupported','providers']);
 assert.ok(Array.isArray(body.providers));assert.equal(typeof body.imageBackup,'boolean');
});
