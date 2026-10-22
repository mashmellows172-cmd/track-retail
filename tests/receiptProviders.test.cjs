const {test}=require('node:test');
const assert=require('node:assert/strict');
const {callReceiptProvider}=require('../src/lib/receiptProviders.ts');
const input={mimeType:'image/jpeg',base64:'fake'};
test('Qwen and DeepSeek send image and JSON requests only to their fixed server endpoints',async()=>{
 const original=global.fetch;const calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return new Response(JSON.stringify({choices:[{message:{content:'{"folio":"123"}'}}]}));};
 try{
  for(const provider of ['qwen','deepseek'])assert.equal(await callReceiptProvider(provider,input,new AbortController().signal),'{"folio":"123"}');
  assert.match(calls[0].url,/^https:\/\/dashscope-intl\.aliyuncs\.com\//);
  assert.equal(calls[1].url,'https://api.deepseek.com/chat/completions');
  for(const call of calls){assert.equal(call.options.redirect,'error');assert.equal(call.body.response_format.type,'json_object');assert.equal(call.body.messages[0].content[1].image_url.url,'data:image/jpeg;base64,fake');}
 }finally{global.fetch=original;}
});
test('Grok Responses adapter reads output text and maps saturation without exposing upstream content',async()=>{
 const original=global.fetch;
 try{
  global.fetch=async(url,options)=>{assert.equal(url,'https://api.x.ai/v1/responses');assert.equal(JSON.parse(options.body).input[0].content[1].type,'input_image');return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'{"folio":"123"}'}]}]}));};
  assert.equal(await callReceiptProvider('grok',input,new AbortController().signal),'{"folio":"123"}');
  global.fetch=async()=>new Response('secret upstream details',{status:503});
  await assert.rejects(()=>callReceiptProvider('qwen',input,new AbortController().signal),error=>error.status===503&&!error.message.includes('secret'));
 }finally{global.fetch=original;}
});
