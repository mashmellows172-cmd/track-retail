const {test}=require('node:test');
const assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
const {GET}=require('../src/app/api/product-reference/route.ts');
const request=(code)=>new NextRequest(`http://localhost/api/product-reference?plu=${encodeURIComponent(code)}`);
test('invalid reference codes never cause upstream requests',async()=>{
 const original=global.fetch; let calls=0; global.fetch=async()=>{calls++;throw new Error();};
 try { const result=await GET(request('https://evil.example')); assert.equal(result.status,400); assert.equal(calls,0); } finally {global.fetch=original;}
});
test('ABC redirect cannot redirect the server to a different host',async()=>{
 const original=global.fetch; const calls=[];
 global.fetch=async(url)=>{calls.push(String(url));return new Response(null,{status:302,headers:{location:'https://evil.example/private'}});};
 try { assert.equal((await GET(request('29479976'))).status,404); assert.equal(calls.length,1); assert.equal(calls[0],'https://www.abc.cl/29479976.html'); } finally {global.fetch=original;}
});
test('valid same-host reference returns matching image and controlled source URL',async()=>{
 const original=global.fetch;
 global.fetch=async()=>new Response('<meta property="og:image" content="https://www.abc.cl/images/29479976.jpg">',{headers:{'content-type':'text/html'}});
 try { const result=await GET(request('29479976')); const body=await result.json(); assert.equal(result.status,200); assert.equal(body.plu,'29479976'); assert.equal(body.image,'https://www.abc.cl/images/29479976.jpg'); } finally {global.fetch=original;}
});

test('overflow stream is canceled before complete buffering',async()=>{
 const original=global.fetch;let canceled=false;let sent=0;
 global.fetch=async()=>new Response(new ReadableStream({pull(controller){sent++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){canceled=true;}}),{headers:{'content-type':'text/html'}});
 try{const result=await GET(request('29479976'));assert.equal(result.status,404);assert.equal(canceled,true);assert.ok(sent<=5);}finally{global.fetch=original;}
});

test('redirect requests share one deadline and bypass upstream cache',async()=>{
 const original=global.fetch;const options=[];
 global.fetch=async(url,opts)=>{options.push(opts);return options.length===1?new Response(null,{status:302,headers:{location:'/same-product'}}):new Response('<meta property="og:image" content="https://www.abc.cl/images/29479976.jpg">',{headers:{'content-type':'text/html'}});};
 try{assert.equal((await GET(request('29479976'))).status,200);assert.equal(options.length,2);assert.equal(options[0].signal,options[1].signal);for(const opts of options){assert.equal(opts.cache,'no-store');assert.equal(opts.next,undefined);}}finally{global.fetch=original;}
});

test('price acquisition timestamp matches returned checkedAt',async()=>{
 const original=global.fetch;
 global.fetch=async()=>new Response('<script type="application/ld+json">{"@type":"Product","sku":"29479976","offers":{"price":99990,"priceCurrency":"CLP"}}</script>',{headers:{'content-type':'text/html'}});
 try{const result=await GET(request('29479976'));assert.equal(result.status,200);const body=await result.json();assert.equal(body.checkedAt,body.prices[0].acquisitionTimestamp);}finally{global.fetch=original;}
});
