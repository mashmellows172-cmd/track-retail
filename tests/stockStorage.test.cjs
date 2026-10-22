require('fake-indexeddb/auto');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadStock,saveStock}=require('../src/lib/stockStorage.ts');
const snapshot=(date,price,store='10 MAIPU')=>({date,store,source:'synthetic.xlsx',importedAt:'2026-10-22T12:00:00Z',products:[{plu:'12345678',barcodes:['00200012345678'],area:'99',category:'TV',description:'SYNTHETIC TV',available:2,existence:2,price}]});
test('atomic stock loads preserve previous price and refuse older or other-store replacement',async()=>{
 assert.equal(await loadStock(),null);
 await saveStock(snapshot('2026-06-17',100000));
 await saveStock(snapshot('2026-06-18',80000));
 assert.equal((await loadStock()).products[0].previousPrice,100000);
 await saveStock(snapshot('2026-06-18',75000));
 assert.equal((await loadStock()).products[0].previousPrice,100000);
 await assert.rejects(saveStock(snapshot('2026-06-16',50000)));
 await assert.rejects(saveStock(snapshot('2026-06-19',50000,'OTHER STORE')));
 const saved=await loadStock(); assert.equal(saved.date,'2026-06-18'); assert.equal(saved.products[0].price,75000);
});
