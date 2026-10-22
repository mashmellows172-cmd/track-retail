const { test } = require('node:test');
const assert = require('node:assert/strict');
const { comisionTelefonia, comisionLineasDuras } = require('../src/lib/commissions.ts');
test('phone commissions follow the configured SQL boundaries', () => {
  for (const [value, years, expected] of [[3999,1,0],[4000,1,1200],[20000,2,1000],[20001,2,2000],[60000,2,2000],[60001,2,4000],[100001,2,6000],[151001,1,5900],[251000,2,9900],[251001,2,15000]]) {
    assert.equal(comisionTelefonia(value, years), expected);
  }
});
test('durable goods commissions follow the configured SQL boundaries', () => {
  for (const [value, years, expected] of [[4000,1,600],[20000,4,1400],[20001,4,2800],[60001,3,4800],[100001,4,8400],[151001,3,12000],[251001,4,21000]]) {
    assert.equal(comisionLineasDuras(value, years), expected);
  }
});
test('invalid warranty combinations and noninteger pesos never create projections', () => {
  assert.equal(comisionTelefonia(50000, 4), 0);
  assert.equal(comisionTelefonia(50000.5, 1), 0);
  assert.equal(comisionLineasDuras(Infinity, 2), 0);
  assert.equal(comisionLineasDuras(50000, 0), 0);
});
