const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canAddToComparison, isDistinctPlu}=require('../src/lib/productComparison.ts');

test('distinct PLU',()=>{
  assert.equal(isDistinctPlu(['1','2'], '3'), true);
  assert.equal(isDistinctPlu(['1','2'], '2'), false);
});

test('cap at 3',()=>{
  assert.equal(canAddToComparison(['1','2','3'], '4'), false);
  assert.equal(canAddToComparison(['1','2'], '3'), true);
});
