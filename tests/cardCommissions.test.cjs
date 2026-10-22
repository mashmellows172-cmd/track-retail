const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cardCommission,cardMonthlyTotal}=require('../src/lib/cardCommissions.ts');
test('activation only adds the difference, never pays both totals',()=>{
 const record={id:'local-1',openedOn:'2026-10-22',activatedOn:'2026-10-22',base:2000,activatedTotal:5000};
 assert.equal(cardCommission(record),5000);
 assert.equal(cardMonthlyTotal([record],'2026-10'),5000);
 assert.equal(cardMonthlyTotal([{...record,activatedOn:null}],'2026-10'),2000);
});
test('only same-day activation qualifies for the higher amount',()=>{
 assert.throws(()=>cardCommission({openedOn:'2026-10-22',activatedOn:'2026-10-23',base:2000,activatedTotal:5000}));
});
test('rejects negative tariffs, total below base, or activation before opening',()=>{
 assert.throws(()=>cardCommission({openedOn:'2026-10-22',activatedOn:null,base:-1,activatedTotal:5000}));
 assert.throws(()=>cardCommission({openedOn:'2026-10-22',activatedOn:null,base:5000,activatedTotal:2000}));
 assert.throws(()=>cardCommission({openedOn:'2026-10-22',activatedOn:'2026-10-21',base:2000,activatedTotal:5000}));
});
