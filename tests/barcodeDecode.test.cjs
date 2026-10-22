const {test}=require('node:test');const assert=require('node:assert/strict');
const {RGBLuminanceSource,BinaryBitmap,HybridBinarizer,MultiFormatReader,BarcodeFormat,DecodeHintType}=require('@zxing/library');
const {barcodeValue}=require('../src/lib/camera.ts');
test('portable decoder reads a synthetic internal EAN13 while preserving its leading zero',()=>{
 const code='0200012345674';
 const left=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
 // A leading zero uses odd parity for all six left-hand symbols.
 const bars='000000000000101'+[...code.slice(1,7)].map(n=>left[Number(n)]).join('')+'01010'+[...code.slice(7)].map(n=>[...left[Number(n)]].map(b=>b==='0'?'1':'0').join('')).join('')+'101000000000000';
 const width=bars.length*3,height=120,pixels=new Uint8ClampedArray(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels[y*width+x]=bars[Math.floor(x/3)]==='1'?0:255;
 const bitmap=new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,width,height)));
 const decoded=new MultiFormatReader().decode(bitmap,new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13]]]));
 assert.equal(barcodeValue(decoded.getText()),code);
});
