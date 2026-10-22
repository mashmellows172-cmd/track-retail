const {test}=require('node:test');const assert=require('node:assert/strict');
const {cameraError,barcodeValue,zoomRange,stopCamera}=require('../src/lib/camera.ts');
test('barcode recognition accepts only usable numeric product identifiers',()=>{
 assert.equal(barcodeValue(' 0200012345678 '),'0200012345678');
 assert.equal(barcodeValue('200012345678'),'200012345678');
 assert.equal(barcodeValue('12345678'),'12345678');
 for(const value of ['https://evil.example','123','', 'ABC12345678']) assert.equal(barcodeValue(value),null);
});
test('camera errors provide actionable permission and hardware guidance',()=>{
 assert.match(cameraError({name:'NotAllowedError'}),/permiso/i);
 assert.match(cameraError({name:'NotFoundError'}),/cámara/i);
 assert.match(cameraError({name:'NotReadableError'}),/otra/i);
});
test('zoom only exposes a valid adjustable supported range',()=>{
 assert.deepEqual(zoomRange({zoom:{min:1,max:8,step:0.1}}),{min:1,max:4,step:0.1});
 assert.equal(zoomRange({}),null);assert.equal(zoomRange({zoom:{min:1,max:1}}),null);
});
test('cleanup stops only the owned stream, including every track',()=>{
 let stopped=0;const stream={getTracks:()=>[{stop:()=>stopped++},{stop:()=>stopped++}]};
 stopCamera(stream);assert.equal(stopped,2);stopCamera(null);
});
