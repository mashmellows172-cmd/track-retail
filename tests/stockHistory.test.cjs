require('fake-indexeddb/auto');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadStock,saveStock,loadProductHistory}=require('../src/lib/stockStorage.ts');
const snapshot=(date,price,store='10 MAIPU')=>({date,store,source:'synthetic.xlsx',importedAt:'2026-10-22T12:00:00Z',products:[{plu:'12345678',barcodes:['00200012345678'],area:'99',category:'TV',description:'SYNTHETIC TV',available:2,existence:2,price}]});
const removeDb=()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('trackretail-stock');r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('DB blocked'));});
const openV1=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('trackretail-stock',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});

test('v1 upgrade preserves current/previous and seeds exact two history dates',async()=>{
 await removeDb();
 const db=await openV1();
 const old=snapshot('2026-06-17',100000),current=snapshot('2026-06-18',80000);
 await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(old,'previous');tx.objectStore('snapshots').put(current,'current');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 assert.equal((await loadStock()).date,current.date);
 const hist=await loadProductHistory('12345678');
 assert.deepEqual(hist.map(h=>[h.date,h.price]),[['2026-06-17',100000],['2026-06-18',80000]]);
 const upgraded=await new Promise((resolve,reject)=>{const r=indexedDB.open('trackretail-stock',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const savedPrevious=await new Promise((resolve,reject)=>{const tx=upgraded.transaction('snapshots','readonly');const r=tx.objectStore('snapshots').get('previous');tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});upgraded.close();
 assert.deepEqual(savedPrevious,old);
});

test('same-day history replaces once and rejected imports mutate neither stock nor history',async()=>{
 await removeDb();
 await saveStock(snapshot('2026-06-17',100000));await saveStock(snapshot('2026-06-18',80000));await saveStock(snapshot('2026-06-18',75000));
 assert.deepEqual((await loadProductHistory('12345678')).map(h=>[h.date,h.price]),[['2026-06-17',100000],['2026-06-18',75000]]);
 const beforeStock=await loadStock(),beforeHistory=await loadProductHistory('12345678');
 await assert.rejects(saveStock(snapshot('2026-06-16',1)));
 await assert.rejects(saveStock(snapshot('2026-06-19',1,'OTHER STORE')));
 assert.deepEqual(await loadStock(),beforeStock);assert.deepEqual(await loadProductHistory('12345678'),beforeHistory);
});

test('31 report dates retain exactly most recent30 in chronological order',async()=>{
 await removeDb();
 for(let day=1;day<=31;day++) await saveStock(snapshot(`2026-07-${String(day).padStart(2,'0')}`,day*1000));
 const history=await loadProductHistory('12345678');assert.equal(history.length,30);
 assert.equal(history[0].date,'2026-07-02');assert.equal(history[29].date,'2026-07-31');
 assert.equal(new Set(history.map(h=>h.date)).size,30);
});
