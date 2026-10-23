const {test}=require('node:test');const assert=require('node:assert/strict');
const {stockQuantityWarning}=require('../src/lib/stock.ts');
test('a sale exceeding listed positive stock warns without promising or reserving units',()=>{
 assert.match(stockQuantityWarning(2,3),/3.*2/);
 for(const [stock,quantity] of [[2,2],[2,1],[0,1],[-1,2],[2,NaN],[2,0]])assert.equal(stockQuantityWarning(stock,quantity),null);
});
