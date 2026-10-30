const { test } = require('node:test');
const assert = require('node:assert/strict');

const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const sessionStore = new Map();
global.sessionStorage = {
  getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
  setItem: (k, v) => sessionStore.set(k, String(v)),
  removeItem: (k) => sessionStore.delete(k),
  clear: () => sessionStore.clear(),
};

const {
  loadCameraTrials,
  saveCameraTrials,
  addCameraTrial,
  clearCameraTrials,
  startCameraTrialTimer,
  validateAndConsumeCameraTrialTimer,
  getActiveCameraTrialTimer,
  clearCameraTrialTimer,
} = require('../src/lib/cameraTrials.ts');

test('device/browser survive navigation via timer snapshot', () => {
  sessionStore.clear();
  store.clear();
  const t = startCameraTrialTimer('barcode', { device: 'iPhone', browser: 'Safari' });
  assert.ok(t.device);
  assert.ok(t.browser);
  const res = validateAndConsumeCameraTrialTimer(t.startedAt + 100);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.device, 'iPhone');
    assert.equal(res.browser, 'Safari');
    assert.equal(res.kind, 'barcode');
  }
});

test('only allowlisted enums', () => {
  store.clear();
  const bad = [
    { device: 'Windows', browser: 'Chrome', kind: 'barcode', status: 'readable', elapsedMs: 100, timestamp: new Date().toISOString() },
  ];
  assert.deepEqual(saveCameraTrials(bad), []);
});

test('elapsedMs integer 0..600000', () => {
  store.clear();
  const ok = { device: 'Android', browser: 'Chrome', kind: 'barcode', status: 'readable', elapsedMs: 0, timestamp: new Date().toISOString() };
  assert.equal(saveCameraTrials([ok]).length, 1);
  const bad1 = { ...ok, elapsedMs: -1 };
  const bad2 = { ...ok, elapsedMs: 600001 };
  const bad3 = { ...ok, elapsedMs: 1.5 };
  assert.equal(saveCameraTrials([bad1]).length, 0);
  assert.equal(saveCameraTrials([bad2]).length, 0);
  assert.equal(saveCameraTrials([bad3]).length, 0);
});

test('timestamp must be ISO', () => {
  store.clear();
  const bad = { device: 'iPhone', browser: 'Safari', kind: 'receipt', status: 'failed', elapsedMs: 100, timestamp: 'not-a-date' };
  assert.equal(saveCameraTrials([bad]).length, 0);
});

test('cap 100', () => {
  store.clear();
  const trials = [];
  for (let i = 0; i < 150; i++) {
    trials.push({ device: 'Android', browser: 'Chrome', kind: 'barcode', status: i % 2 === 0 ? 'readable' : 'failed', elapsedMs: i, timestamp: new Date(Date.now() + i).toISOString() });
  }
  const saved = saveCameraTrials(trials);
  assert.equal(saved.length, 100);
});

test('active timer in sessionStorage survives route change conceptually and rejects malformed/stale/future', () => {
  sessionStore.clear();
  const t = startCameraTrialTimer('barcode');
  assert.ok(getActiveCameraTrialTimer());
  // future: clock earlier than saved start
  const future = validateAndConsumeCameraTrialTimer(t.startedAt - 10000);
  assert.equal(future.ok, false);
  // start again
  sessionStore.clear();
  const tStale = startCameraTrialTimer('receipt');
  // stale
  const stale = validateAndConsumeCameraTrialTimer(tStale.startedAt + 700000);
  assert.equal(stale.ok, false);
  // malformed
  sessionStore.clear();
  sessionStore.set('trackretail_camera_trial_timer_v1', '{bad json');
  const malformed = validateAndConsumeCameraTrialTimer(Date.now());
  assert.equal(malformed.ok, false);
  // valid
  sessionStore.clear();
  const t2 = startCameraTrialTimer('barcode');
  const ok = validateAndConsumeCameraTrialTimer(t2.startedAt + 500);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.elapsedMs >= 0, true);
    assert.equal(ok.kind, 'barcode');
  }
  // consumed
  const consumed = validateAndConsumeCameraTrialTimer(t2.startedAt + 1000);
  assert.equal(consumed.ok, false);
});
