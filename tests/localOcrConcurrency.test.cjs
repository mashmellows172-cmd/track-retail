const {test}=require('node:test');const assert=require('node:assert/strict');
const {recognizeReceiptLocally}=require('../src/lib/localReceiptOcr.ts');
test('canceling initialization cannot start overlapping heavyweight workers on immediate retry',async()=>{
 let resolveFirst;let starts=0,stopped=0;
 const firstReady=new Promise(resolve=>{resolveFirst=resolve;});
 const worker=()=>({async recognize(){return {data:{text:'TOTAL 10000',confidence:90}};},async terminate(){stopped++;}});
 const factory=async()=>{starts++;return starts===1 ? firstReady : worker();};
 const control=new AbortController();
 const first=recognizeReceiptLocally(new Blob(['fake']),{signal:control.signal,createWorker:factory,assetBaseUrl:'https://track.example/registro',timeoutMs:1000});
 await new Promise(setImmediate);control.abort();await assert.rejects(first);
 const second=recognizeReceiptLocally(new Blob(['fake']),{signal:new AbortController().signal,createWorker:factory,assetBaseUrl:'https://track.example/registro',timeoutMs:1000});
 try {await new Promise(setImmediate);assert.equal(starts,1,'retry must wait for the previous late worker to be stopped');}
 finally {resolveFirst(worker());await second.catch(()=>{});}
 assert.equal(stopped,2);
});

test('abort after worker assignment waits for asynchronous termination before releasing retry',async()=>{
 const control=new AbortController();
 let starts=0,thenReads=0,resolveTermination;
 const termination=new Promise(resolve=>{resolveTermination=resolve;});
 const firstWorker={
  // Promise assimilation reads then once before the startup handler and once
  // when its async return resolves, after worker assignment but before finally.
  get then(){if(++thenReads===2)control.abort();return undefined;},
  async recognize(){return {data:{text:'TOTAL 10000',confidence:90}};},
  async terminate(){await termination;},
 };
 const nextWorker={async recognize(){return {data:{text:'TOTAL 10000',confidence:90}};},async terminate(){}};
 const factory=()=>++starts===1 ? firstWorker : nextWorker;
 const first=recognizeReceiptLocally(new Blob(['fake']),{signal:control.signal,createWorker:factory,assetBaseUrl:'https://track.example/registro',timeoutMs:1000});
 // Startup cancellation returns promptly only after its assigned worker stops;
 // catch immediately so this controlled rejection is never unhandled.
 const firstDone=first.catch(()=>{});
 await new Promise(setImmediate);
 assert.equal(control.signal.aborted,true,'fixture must abort precisely during assigned worker startup');
 const second=recognizeReceiptLocally(new Blob(['fake']),{signal:new AbortController().signal,createWorker:factory,assetBaseUrl:'https://track.example/registro',timeoutMs:1000});
 try{await new Promise(setImmediate);assert.equal(starts,1,'retry must wait until asynchronous termination has finished');}
 finally{resolveTermination();await Promise.all([firstDone,second.catch(()=>{})]);}
});
