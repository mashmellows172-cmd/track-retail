const { test } = require('node:test');
const assert = require('node:assert/strict');
const { syncPendingSales, enqueueSale, QUEUE_KEY } = require('../src/lib/offlineQueue.ts');
function storage(initial = []) {
  let value = JSON.stringify(initial);
  return { getItem: () => value, setItem: (_, next) => { value = next; }, removeItem: () => { value = null; } };
}
test('sync preserves a sale queued while another request is in flight', async () => {
  const first = { folio: '1' }, next = { folio: '2' };
  const store = storage([first]);
  const result = await syncPendingSales(store, async () => {
    enqueueSale(store, next);
    return { ok: true, status: 200 };
  });
  assert.equal(result.saved, 1);
  assert.deepEqual(JSON.parse(store.getItem(QUEUE_KEY)), [next]);
});
test('sync retains rejected sales and removes acknowledged duplicates', async () => {
  const store = storage([{ folio: '1' }, { folio: '2' }]);
  await syncPendingSales(store, async sale => ({ ok: sale.folio === '1', status: sale.folio === '1' ? 200 : 400 }));
  assert.deepEqual(JSON.parse(store.getItem(QUEUE_KEY)), [{ folio: '2' }]);
});
test('network failure retains the complete queue', async () => {
  const store = storage([{ folio: '1' }]);
  await syncPendingSales(store, async () => { throw new TypeError('fetch failed'); });
  assert.deepEqual(JSON.parse(store.getItem(QUEUE_KEY)), [{ folio: '1' }]);
});
test('malformed queue is never overwritten by enqueue', () => {
  const store = storage();
  store.setItem(QUEUE_KEY, '{broken');
  assert.throws(() => enqueueSale(store, { folio: '2' }));
  assert.equal(store.getItem(QUEUE_KEY), '{broken');
});
test('a conflicting duplicate is retained until the server acknowledges the same sale', async () => {
  const store = storage([{ folio: '1', vendedor_id: 'Ana' }]);
  await syncPendingSales(store, async () => ({ ok: false, status: 409, acknowledged: false }));
  assert.deepEqual(JSON.parse(store.getItem(QUEUE_KEY)), [{ folio: '1', vendedor_id: 'Ana' }]);
});
