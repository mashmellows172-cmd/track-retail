const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BACKUP_MAX_BYTES,
  BACKUP_PREFERENCE_KEYS,
  BACKUP_SELLER_KEY,
  QUEUE_KEY,
  SALE_DRAFT_KEY,
  buildBackup,
  cardStorageKey,
  markExportStarted,
  parseBackupText,
  previewBackup,
  readLastExportDate,
  readStoredCards,
  restoreBackup,
  serializeBackup,
} = require('../src/lib/backup.ts');
const { initialSaleDraft } = require('../src/lib/guidedSale.ts');

const seller = 'Ana';
const cardA = { id: 'a', openedOn: '2026-10-01', activatedOn: null, base: 1000, activatedTotal: 2000 };
const cardB = { id: 'b', openedOn: '2026-10-02', activatedOn: '2026-10-02', base: 1000, activatedTotal: 2000 };
const cardC = { id: 'c', openedOn: '2026-10-03', activatedOn: null, base: 3000, activatedTotal: 4000 };
const saleA = {
  folio: '00123', fecha_compra: '2026-10-23', precio_producto: 1000, cantidad_unidades: 1,
  valor_garantia: 100, total_boleta: 1100, canal: 'caja', numero_pedido: null,
  anos_garantia: 1, tipo_garantia: 'telefonia', vendedor_id: seller,
};
const draft = { ...initialSaleDraft({ folio: 'BORRADOR', precio_producto: 2000 }, '2026-10-23'), vendedor_id: '' };

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries({ [BACKUP_SELLER_KEY]: seller, ...initial }));
  const writes = [];
  return {
    values,
    writes,
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { writes.push(key); values.set(key, String(value)); },
    removeItem: key => { writes.push(key); values.delete(key); },
  };
}

function lockManager() {
  const names = [];
  return {
    names,
    request: async (name, callback) => { names.push(name); return callback(); },
  };
}

function validBackup() {
  return buildBackup({
    seller,
    exportedAt: '2026-10-23T12:00:00.000Z',
    cards: [cardA, cardB],
    pendingSales: [saleA],
    preferences: [
      { key: 'bryanapp_theme', value: 'dark' },
      { key: 'trackretail_history_view', value: 'list' },
    ],
    draft,
  });
}

test('a backup has explicit version, counts, active seller data and recovery-only pending sales', () => {
  const backup = validBackup();
  assert.equal(backup.format, 'trackretail-backup');
  assert.equal(backup.version, 1);
  assert.equal(backup.seller, seller);
  assert.deepEqual(backup.counts, { cards: 2, pendingSales: 1, preferences: 2, draft: 1 });
  assert.deepEqual(backup.data.cards, [cardA, cardB]);
  assert.deepEqual(backup.pendingSales, [saleA]);
  assert.deepEqual(backup.data.preferences.map(entry => entry.key), BACKUP_PREFERENCE_KEYS);

  assert.throws(() => buildBackup({
    seller,
    exportedAt: '2026-10-23T12:00:00.000Z',
    cards: [],
    pendingSales: [{ ...saleA, vendedor_id: 'Beto' }],
    preferences: [],
    draft: null,
  }), /vendedor|seller/i);
  assert.throws(() => buildBackup({
    seller,
    exportedAt: '2026-10-23T12:00:00.000Z',
    cards: [{ ...cardA, base: 1.5 }],
    pendingSales: [],
    preferences: [],
    draft: null,
  }), /tarjeta|monto/i);
});

test('backup parsing rejects foreign, oversized, malformed and inconsistent files', () => {
  const text = serializeBackup(validBackup());
  const parsed = parseBackupText(text, seller);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.backup.seller, seller);

  const invalid = [
    ['not json', 'inválido|JSON'],
    [JSON.stringify({ ...validBackup(), version: 2 }), 'versión'],
    [JSON.stringify({ ...validBackup(), format: 'other' }), 'formato'],
    [JSON.stringify({ ...validBackup(), seller: 'Beto' }), 'vendedor'],
    [JSON.stringify({ ...validBackup(), exportedAt: 'ayer' }), 'fecha'],
    [JSON.stringify({ ...validBackup(), counts: { cards: 1, pendingSales: 1, preferences: 2, draft: 1 } }), 'conteo|count'],
    [JSON.stringify({ ...validBackup(), data: { ...validBackup().data, cards: [cardA, cardA] } }), 'duplicad'],
    [JSON.stringify({ ...validBackup(), data: { ...validBackup().data, cards: [{ ...cardA, openedOn: '2026-02-30' }] } }), 'fecha|tarjeta'],
    [JSON.stringify({ ...validBackup(), data: { ...validBackup().data, cards: [{ ...cardA, base: -1 }] } }), 'monto|tarjeta'],
    [JSON.stringify({ ...validBackup(), data: { ...validBackup().data, preferences: [{ key: 'secreto', value: 'x' }] }, counts: { cards: 2, pendingSales: 1, preferences: 1, draft: 1 } }), 'preferencia'],
    [JSON.stringify({ ...validBackup(), pendingSales: [{ ...saleA, fecha_compra: '2026-02-30' }] }), 'fecha|venta'],
    [JSON.stringify({ ...validBackup(), pendingSales: [{ ...saleA, vendedor_id: 'Beto' }] }), 'vendedor'],
    [JSON.stringify({ ...validBackup(), data: { ...validBackup().data, draft: { folio: 1 } } }), 'borrador'],
    ['x'.repeat(BACKUP_MAX_BYTES + 1), 'tamaño'],
  ];

  for (const [input, pattern] of invalid) {
    const result = parseBackupText(input, seller);
    assert.equal(result.ok, false, `expected rejection for ${String(input).slice(0, 60)}`);
    assert.match(result.error, new RegExp(pattern, 'i'));
  }
});

test('preview reports merge conflicts, recovery-only omitted data and coverage limits', () => {
  const backup = validBackup();
  const preview = previewBackup(backup, {
    seller,
    cardIds: [cardA.id, cardC.id],
    preferenceKeys: ['bryanapp_theme'],
    hasDraft: true,
  });
  assert.equal(preview.seller, seller);
  assert.deepEqual(preview.cards, { total: 2, new: 1, conflicts: 1 });
  assert.deepEqual(preview.preferences, { total: 2, new: 1, conflicts: 1 });
  assert.deepEqual(preview.draft, { included: true, conflict: true });
  assert.deepEqual(preview.pendingSales, { total: 1, restoration: 'recovery-only' });
  assert.match(preview.omissions.join(' '), /cola|pendiente/i);
  assert.match(preview.omissions.join(' '), /servidor|historial/i);
  assert.match(preview.omissions.join(' '), /stock/i);
});

test('restore merges cards under the same per-seller lock and never overwrites current records', async () => {
  const local = memoryStorage({ [cardStorageKey(seller)]: JSON.stringify([cardA]) });
  const session = memoryStorage();
  const locks = lockManager();

  // Another tab adds a card after the user previewed the file.
  local.setItem(cardStorageKey(seller), JSON.stringify([
    cardA,
    { ...cardC, id: 'concurrent' },
  ]));

  const result = await restoreBackup(validBackup(), {
    seller,
    localStorage: local,
    sessionStorage: session,
    locks,
  });

  assert.equal(result.ok, true);
  assert.equal(result.cards.added, 1);
  assert.equal(result.cards.conflicts, 1);
  const stored = JSON.parse(local.getItem(cardStorageKey(seller)));
  assert.deepEqual(stored.map(record => record.id), ['a', 'concurrent', 'b']);
  assert.deepEqual(stored[0], cardA);
  assert.ok(locks.names.includes(cardStorageKey(seller)), 'restore must use the card panel lock name');
  assert.equal(local.writes.includes(QUEUE_KEY), false, 'pending sales are never written to the active queue');
  assert.equal(result.pendingSales.notRestored, 1);
});

test('restore refuses card writes when Web Locks are unavailable', async () => {
  const local = memoryStorage();
  const before = local.writes.slice();
  const result = await restoreBackup(validBackup(), {
    seller,
    localStorage: local,
    sessionStorage: memoryStorage(),
    locks: null,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /navegador|locks|segura/i);
  assert.deepEqual(local.writes, before);
});

test('restore skips existing preferences and an existing draft without overwriting them', async () => {
  const local = memoryStorage({ bryanapp_theme: 'light', trackretail_history_view: 'grid' });
  const session = memoryStorage({ [SALE_DRAFT_KEY]: JSON.stringify({ ...draft, folio: 'OTRO' }) });
  const result = await restoreBackup(validBackup(), {
    seller,
    localStorage: local,
    sessionStorage: session,
    locks: lockManager(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.preferences.added, 0);
  assert.equal(result.preferences.conflicts, 2);
  assert.equal(result.draft.restored, false);
  assert.equal(result.draft.conflict, true);
  assert.equal(local.getItem('bryanapp_theme'), 'light');
  assert.equal(local.getItem('trackretail_history_view'), 'grid');
  assert.equal(JSON.parse(session.getItem(SALE_DRAFT_KEY)).folio, 'OTRO');
});

test('a partial write failure rolls back only values that were not changed concurrently', async () => {
  const local = memoryStorage();
  const session = memoryStorage();
  let failed = false;
  const originalSet = local.setItem;
  local.setItem = (key, value) => {
    if (key === 'trackretail_history_view' && !failed) {
      failed = true;
      // Simulate another tab updating an earlier key just before this failure.
      originalSet('bryanapp_theme', 'concurrent');
      throw new Error('cuota llena');
    }
    originalSet(key, value);
  };

  const result = await restoreBackup(validBackup(), {
    seller,
    localStorage: local,
    sessionStorage: session,
    locks: lockManager(),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /restaurar|guardar|cuota/i);
  assert.equal(result.rollbackSkipped, 1);
  assert.equal(local.getItem('bryanapp_theme'), 'concurrent');
  assert.equal(local.getItem(cardStorageKey(seller)), null, 'the card write must be rolled back');
  assert.equal(local.getItem('trackretail_history_view'), null);
});

test('restore rechecks the active seller after waiting for a lock', async () => {
  const local = memoryStorage({ [BACKUP_SELLER_KEY]: seller });
  local.setItem(cardStorageKey(seller), '[]');
  const session = memoryStorage();
  const locks = {
    names: [],
    request: async (name, callback) => {
      locks.names.push(name);
      local.setItem(BACKUP_SELLER_KEY, 'Beto');
      return callback();
    },
  };
  const result = await restoreBackup(validBackup(), {
    seller,
    localStorage: local,
    sessionStorage: session,
    locks,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /vendedor/i);
  assert.equal(local.getItem(cardStorageKey(seller)), '[]');
  assert.equal(result.rollbackSkipped, 0);
});

test('backup drafts allow intentionally incomplete values but reject impossible data', () => {
  const input = {
    seller,
    exportedAt: '2026-10-23T12:00:00.000Z',
    cards: [],
    pendingSales: [],
    preferences: [],
  };
  const incomplete = {
    ...draft, folio: '', numero_pedido: '', fecha_compra: '',
    precio_producto: 0, cantidad_unidades: 0, valor_garantia: 0, total_boleta: 0,
  };
  assert.doesNotThrow(() => buildBackup({ ...input, draft: incomplete }));

  const invalidDrafts = [
    { precio_producto: -1 },
    { cantidad_unidades: 1.5 },
    { cantidad_unidades: -1 },
    { valor_garantia: -100 },
    { total_boleta: 1.5 },
    { fecha_compra: '2026-02-30' },
    { folio: 'x'.repeat(121) },
    { numero_pedido: 'x'.repeat(121) },
    { vendedor_id: 'Beto' },
  ];
  for (const change of invalidDrafts) {
    assert.throws(() => buildBackup({ ...input, draft: { ...draft, ...change } }), /borrador|vendedor/i);
  }
});

test('malformed restore input resolves to a safe failure without writes', async () => {
  const local = memoryStorage();
  const session = memoryStorage();
  const good = validBackup();
  const badDraft = {
    ...good,
    data: { ...good.data, draft: { ...draft, precio_producto: -5 } },
  };
  const malformed = [null, {}, { format: 'trackretail-backup' }, { ...good, data: null }, badDraft];

  for (const input of malformed) {
    const localWrites = local.writes.length;
    const sessionWrites = session.writes.length;
    const result = await restoreBackup(input, {
      seller,
      localStorage: local,
      sessionStorage: session,
      locks: lockManager(),
    });
    assert.equal(result.ok, false, `expected a safe failure for ${JSON.stringify(input)?.slice(0, 60)}`);
    assert.equal(local.writes.length, localWrites);
    assert.equal(session.writes.length, sessionWrites);
  }
});

test('restore rejects a different active seller before touching storage', async () => {
  const local = memoryStorage();
  const result = await restoreBackup(validBackup(), {
    seller: 'Beto',
    localStorage: local,
    sessionStorage: memoryStorage(),
    locks: lockManager(),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /vendedor/i);
  assert.deepEqual(local.writes, []);
});

test('card storage helpers read valid records and preserve corrupt data', () => {
  const local = memoryStorage({ [cardStorageKey(seller)]: JSON.stringify([cardA]) });
  assert.deepEqual(readStoredCards(local, seller), [cardA]);
  local.setItem(cardStorageKey(seller), '{broken');
  assert.throws(() => readStoredCards(local, seller), /tarjeta/i);
});

test('the last export date is recorded locally only when a download starts', () => {
  const local = memoryStorage();
  assert.equal(readLastExportDate(local), null);
  markExportStarted(local, new Date('2026-10-23T12:34:56.000Z'));
  assert.equal(readLastExportDate(local), '2026-10-23T12:34:56.000Z');
  local.setItem('trackretail_backup_last_export', 'not-a-date');
  assert.equal(readLastExportDate(local), null);
});
