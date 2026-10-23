const {test}=require('node:test');const assert=require('node:assert/strict');
const {receiptDimensions}=require('../src/lib/receiptImage.ts');
test('local OCR can bound a full camera photo to approximately four megapixels',()=>{
 const image=receiptDimensions(4000,3000,4_000_000);
 assert.ok(image.width*image.height<=4_010_000,'local engine should not receive the full 12 MP photo');
 assert.ok(Math.abs(image.width/image.height-4/3)<0.01);
 const legacy=receiptDimensions(4000,3000);
 assert.ok(legacy.width*legacy.height>image.width*image.height,'cloud preparation keeps its existing resolution budget');
});

test('a tiny compressed large image must keep its resized pixels even if JPEG grows',async()=>{
 const oldImage=global.Image,oldDocument=global.document;
 let canvas;
 global.Image=class {naturalWidth=4000;naturalHeight=3000;set src(value){void value;queueMicrotask(()=>this.onload?.());}};
 global.document={createElement(){canvas={getContext:()=>({fillRect(){},drawImage(){}}),toBlob:callback=>callback(new Blob(['larger JPEG'],{type:'image/jpeg'}))};return canvas;}};
 try {
  const source=new File(['x'],'large.png',{type:'image/png'});
  const result=await require('../src/lib/receiptImage.ts').prepareReceiptImage(source,new AbortController().signal,4_000_000);
  assert.notEqual(result,source,'the smaller byte count cannot override the local pixel budget');
  assert.equal(result.type,'image/jpeg');
 } finally {global.Image=oldImage;global.document=oldDocument;}
});

test('failed local canvas preparation cannot send the full image to the OCR worker',async()=>{
 const oldImage=global.Image,oldDocument=global.document;
 global.Image=class {naturalWidth=4000;naturalHeight=3000;set src(value){void value;queueMicrotask(()=>this.onload?.());}};
 global.document={createElement:()=>({getContext:()=>null})};
 try {
  await assert.rejects(require('../src/lib/receiptImage.ts').prepareReceiptImage(new File(['x'],'large.png',{type:'image/png'}),new AbortController().signal,4_000_000));
 } finally {global.Image=oldImage;global.document=oldDocument;}
});
