import type { Venta } from '@/types/venta';
import type { SaleDraft } from '@/lib/draft';
import { parseSaleDraft } from '@/lib/draft';
import { cardCommission, type CardCommissionRecord } from '@/lib/cardCommissions';
import { isCalendarDate, saleError } from '@/lib/validation';
import { QUEUE_KEY } from '@/lib/offlineQueue';
import { SALE_DRAFT_KEY } from '@/lib/guidedSale';

export { QUEUE_KEY, SALE_DRAFT_KEY };

export const BACKUP_FORMAT = 'trackretail-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 5 * 1024 * 1024;
export const BACKUP_MAX_CARDS = 10_000;
export const BACKUP_MAX_PENDING = 5_000;
export const BACKUP_MAX_PREFERENCES = 10;
export const BACKUP_LAST_EXPORT_KEY = 'trackretail_backup_last_export';
export const BACKUP_SELLER_KEY = 'trackretail_vendedor';
export const BACKUP_CARD_PREFIX = 'trackretail_cards_';
export const BACKUP_PREFERENCE_KEYS = ['bryanapp_theme', 'trackretail_history_view'] as const;
const MAX_AMOUNT = 999_999_999_999;

export type BackupPreferenceKey = (typeof BACKUP_PREFERENCE_KEYS)[number];

export interface BackupPreference {
  key: BackupPreferenceKey;
  value: string;
}

export interface BackupFileV1 {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  seller: string;
  counts: {
    cards: number;
    pendingSales: number;
    preferences: number;
    draft: 0 | 1;
  };
  data: {
    cards: CardCommissionRecord[];
    preferences: BackupPreference[];
    draft: SaleDraft | null;
  };
  /** Recovery data only: restoring never writes these into the active queue. */
  pendingSales: Venta[];
}

export interface LocalBackupInputs {
  cards: CardCommissionRecord[];
  pendingSales: Venta[];
  preferences: BackupPreference[];
  draft: SaleDraft | null;
  omissions: string[];
}

export interface BackupPreview {
  seller: string;
  cards: { total: number; new: number; conflicts: number };
  preferences: { total: number; new: number; conflicts: number };
  draft: { included: boolean; conflict: boolean };
  pendingSales: { total: number; restoration: 'recovery-only' };
  omissions: string[];
}

export interface BackupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BackupLocks {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

export interface RestoreEnvironment {
  seller: string;
  localStorage: BackupStorage;
  sessionStorage: BackupStorage | null;
  locks: BackupLocks | null;
}

export type RestoreResult =
  | {
      ok: true;
      cards: { added: number; conflicts: number };
      preferences: { added: number; conflicts: number };
      draft: { restored: boolean; conflict: boolean };
      pendingSales: { notRestored: number };
      warnings: string[];
    }
  | { ok: false; error: string; rollbackSkipped: number };

interface FileWrite {
  storage: BackupStorage;
  key: string;
  lockName: string;
  previous: string | null;
  next: string;
}

function normalizedSeller(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const seller = value.trim();
  return seller.length > 0 && seller.length <= 120 ? seller : null;
}

export function cardStorageKey(seller: string): string {
  return `${BACKUP_CARD_PREFIX}${seller}`;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validCard(value: unknown): value is CardCommissionRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > 120) return false;
  if (typeof record.openedOn !== 'string' || !isCalendarDate(record.openedOn)) return false;
  if (record.activatedOn !== null && (typeof record.activatedOn !== 'string' || !isCalendarDate(record.activatedOn))) return false;
  if (typeof record.base !== 'number' || typeof record.activatedTotal !== 'number') return false;
  if (![record.base, record.activatedTotal].every(amount => Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT)) return false;
  try {
    cardCommission(record as unknown as CardCommissionRecord);
    return true;
  } catch {
    return false;
  }
}

function validPreference(value: unknown): value is BackupPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.key !== 'string' || typeof entry.value !== 'string') return false;
  if (!(BACKUP_PREFERENCE_KEYS as readonly string[]).includes(entry.key)) return false;
  if (entry.key === 'bryanapp_theme') return entry.value === 'dark' || entry.value === 'light';
  if (entry.key === 'trackretail_history_view') return entry.value === 'grid' || entry.value === 'list';
  return false;
}

function validPendingSale(value: unknown, seller: string): value is Venta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.vendedor_id !== 'string' || row.vendedor_id.trim() !== seller) return false;
  return saleError(value) === null;
}

function assertCards(cards: CardCommissionRecord[]): void {
  if (!Array.isArray(cards) || cards.length > BACKUP_MAX_CARDS) throw new Error('El respaldo contiene demasiados registros de tarjetas.');
  const ids = new Set<string>();
  for (const card of cards) {
    if (!validCard(card)) throw new Error('El respaldo contiene una tarjeta con fecha o monto inválido.');
    if (ids.has(card.id)) throw new Error('El respaldo contiene tarjetas duplicadas con el mismo ID local.');
    ids.add(card.id);
  }
}

function assertPendingSales(sales: Venta[], seller: string): void {
  if (!Array.isArray(sales) || sales.length > BACKUP_MAX_PENDING) throw new Error('El respaldo contiene demasiadas ventas pendientes.');
  for (const sale of sales) {
    if (!validPendingSale(sale, seller)) throw new Error('El respaldo contiene una venta pendiente inválida o de otro vendedor.');
  }
}

function assertPreferences(preferences: BackupPreference[]): void {
  if (!Array.isArray(preferences) || preferences.length > BACKUP_MAX_PREFERENCES) throw new Error('El respaldo contiene demasiadas preferencias.');
  const keys = new Set<string>();
  for (const entry of preferences) {
    if (!validPreference(entry)) throw new Error('El respaldo contiene una preferencia no permitida o con valor inválido.');
    if (keys.has(entry.key)) throw new Error('El respaldo contiene preferencias duplicadas.');
    keys.add(entry.key);
  }
}

/**
 * parseSaleDraft deliberately accepts anything editable in the form. A backup
 * is stricter, but still allows an intentionally incomplete draft: blank dates
 * and zero amounts are recoverable, impossible dates and negative/fractional
 * values are not.
 */
function validBackupDraft(value: unknown, seller: string): SaleDraft | null {
  const draft = parseSaleDraft(value);
  if (!draft) return null;
  if (draft.folio.length > 120 || draft.numero_pedido.length > 120 || draft.vendedor_id.length > 120) return null;
  if (draft.fecha_compra !== '' && !isCalendarDate(draft.fecha_compra)) return null;
  for (const field of ['precio_producto', 'valor_garantia', 'total_boleta'] as const) {
    const amount = draft[field];
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_AMOUNT) return null;
  }
  if (!Number.isSafeInteger(draft.cantidad_unidades) || draft.cantidad_unidades < 0 || draft.cantidad_unidades > 9999) return null;
  const draftSeller = draft.vendedor_id.trim();
  if (draftSeller && draftSeller !== seller) return null;
  return draft;
}

function assertDraft(value: unknown, seller: string): SaleDraft | null {
  if (value === null) return null;
  const draft = validBackupDraft(value, seller);
  if (!draft) throw new Error('El borrador del respaldo tiene un formato, fecha, monto o vendedor inválido.');
  return draft;
}

export function buildBackup(input: {
  seller: string;
  exportedAt: string;
  cards: CardCommissionRecord[];
  pendingSales: Venta[];
  preferences: BackupPreference[];
  draft: SaleDraft | null;
}): BackupFileV1 {
  const seller = normalizedSeller(input.seller);
  if (!seller) throw new Error('Configura el nombre del vendedor antes de crear el respaldo.');
  if (!isIsoTimestamp(input.exportedAt)) throw new Error('La fecha de exportación no es válida.');
  assertCards(input.cards);
  assertPendingSales(input.pendingSales, seller);
  assertPreferences(input.preferences);
  const draft = assertDraft(input.draft, seller);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: input.exportedAt,
    seller,
    counts: {
      cards: input.cards.length,
      pendingSales: input.pendingSales.length,
      preferences: input.preferences.length,
      draft: draft ? 1 : 0,
    },
    data: { cards: input.cards, preferences: input.preferences, draft },
    pendingSales: input.pendingSales,
  };
}

export function serializeBackup(backup: BackupFileV1): string {
  return JSON.stringify(backup, null, 2);
}

function validateBackupObject(value: unknown, expectedSeller?: string): { ok: true; backup: BackupFileV1 } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'El archivo no contiene un respaldo válido.' };
  const backup = value as Record<string, unknown>;
  if (backup.format !== BACKUP_FORMAT) return { ok: false, error: 'El archivo no tiene el formato de respaldo de TrackRetail.' };
  if (backup.version !== BACKUP_VERSION) return { ok: false, error: 'La versión del respaldo no es compatible.' };
  if (!isIsoTimestamp(backup.exportedAt)) return { ok: false, error: 'La fecha de exportación del respaldo no es válida.' };
  const seller = normalizedSeller(backup.seller);
  if (!seller) return { ok: false, error: 'El respaldo no identifica un vendedor válido.' };
  if (expectedSeller !== undefined && seller !== normalizedSeller(expectedSeller)) {
    return { ok: false, error: 'El respaldo pertenece a otro vendedor. Cambia al vendedor correcto antes de restaurar.' };
  }

  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    return { ok: false, error: 'El respaldo no contiene datos locales válidos.' };
  }
  const data = backup.data as Record<string, unknown>;
  if (!Array.isArray(data.cards)) return { ok: false, error: 'El respaldo no contiene una lista de tarjetas válida.' };
  assertCards(data.cards as CardCommissionRecord[]);
  if (!Array.isArray(backup.pendingSales)) return { ok: false, error: 'El respaldo no contiene una lista de ventas pendientes válida.' };
  assertPendingSales(backup.pendingSales as Venta[], seller);
  if (!Array.isArray(data.preferences)) return { ok: false, error: 'El respaldo no contiene preferencias válidas.' };
  assertPreferences(data.preferences as BackupPreference[]);
  const draft = assertDraft(data.draft, seller);

  if (!backup.counts || typeof backup.counts !== 'object' || Array.isArray(backup.counts)) {
    return { ok: false, error: 'El respaldo no contiene conteos válidos.' };
  }
  const counts = backup.counts as Record<string, unknown>;
  const expected = {
    cards: data.cards.length,
    pendingSales: backup.pendingSales.length,
    preferences: data.preferences.length,
    draft: draft ? 1 : 0,
  };
  if (Object.entries(expected).some(([key, count]) => counts[key] !== count)) {
    return { ok: false, error: 'Los conteos del respaldo no coinciden con sus datos.' };
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: backup.exportedAt,
      seller,
      counts: expected as BackupFileV1['counts'],
      data: {
        cards: data.cards as CardCommissionRecord[],
        preferences: data.preferences as BackupPreference[],
        draft,
      },
      pendingSales: backup.pendingSales as Venta[],
    },
  };
}

export function parseBackupText(text: string, expectedSeller?: string): { ok: true; backup: BackupFileV1 } | { ok: false; error: string } {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'El archivo está vacío.' };
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > BACKUP_MAX_BYTES) return { ok: false, error: 'El archivo supera el tamaño máximo de 5 MB.' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no contiene JSON válido.' };
  }
  try {
    return validateBackupObject(value, expectedSeller);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'El respaldo no es válido.' };
  }
}

export function previewBackup(
  backup: BackupFileV1,
  current: { seller: string; cardIds: string[]; preferenceKeys: string[]; hasDraft: boolean },
): BackupPreview {
  const cardIds = new Set(current.cardIds);
  const preferenceKeys = new Set(current.preferenceKeys);
  return {
    seller: backup.seller,
    cards: {
      total: backup.data.cards.length,
      new: backup.data.cards.filter(card => !cardIds.has(card.id)).length,
      conflicts: backup.data.cards.filter(card => cardIds.has(card.id)).length,
    },
    preferences: {
      total: backup.data.preferences.length,
      new: backup.data.preferences.filter(entry => !preferenceKeys.has(entry.key)).length,
      conflicts: backup.data.preferences.filter(entry => preferenceKeys.has(entry.key)).length,
    },
    draft: {
      included: backup.data.draft !== null,
      conflict: backup.data.draft !== null && current.hasDraft,
    },
    pendingSales: { total: backup.pendingSales.length, restoration: 'recovery-only' },
    omissions: [
      'El historial de ventas del servidor no está incluido: expórtalo desde Historial cuando tengas conexión.',
      'El stock y sus fotos no están incluidos: vuelve a cargar el archivo original (XLSX o CSV) en Catálogo.',
      'Las ventas pendientes se incluyen solo para recuperación; no se agregan a la cola activa ni se envían.',
      'No se incluyen datos de otros vendedores ni claves de almacenamiento ajenas a la lista permitida.',
    ],
  };
}

function parseCards(raw: string | null): CardCommissionRecord[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Los registros locales de tarjetas tienen un formato inválido. No se modificarán.');
  }
  if (!Array.isArray(value)) throw new Error('Los registros locales de tarjetas no son una lista válida. No se modificarán.');
  assertCards(value as CardCommissionRecord[]);
  return value as CardCommissionRecord[];
}

export function readStoredCards(storage: BackupStorage, seller: string): CardCommissionRecord[] {
  return parseCards(storage.getItem(cardStorageKey(seller)));
}

export function readBackupInputs(
  localStorage: BackupStorage,
  sessionStorage: BackupStorage | null,
  sellerValue: string,
): LocalBackupInputs {
  const seller = normalizedSeller(sellerValue);
  if (!seller) throw new Error('Configura el nombre del vendedor antes de crear el respaldo.');
  const cards = readStoredCards(localStorage, seller);

  const pendingSales: Venta[] = [];
  const omissions: string[] = [];
  const queueRaw = localStorage.getItem(QUEUE_KEY);
  if (queueRaw) {
    let queue: unknown;
    try {
      queue = JSON.parse(queueRaw);
    } catch {
      throw new Error('La cola de ventas pendientes no se pudo leer. Consérvala y no borres los datos del navegador.');
    }
    if (!Array.isArray(queue)) throw new Error('La cola de ventas pendientes no es válida. Consérvala y no borres los datos del navegador.');
    let foreign = 0;
    for (const item of queue) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { foreign++; continue; }
      const row = item as Record<string, unknown>;
      if (typeof row.vendedor_id !== 'string' || row.vendedor_id.trim() !== seller) { foreign++; continue; }
      if (!validPendingSale(item, seller)) throw new Error('Una venta pendiente del vendedor activo tiene datos inválidos. Consérvala antes de exportar.');
      pendingSales.push(item);
    }
    if (foreign) omissions.push(`Se omitieron ${foreign} registro(s) de la cola que no se pudieron identificar como del vendedor activo.`);
  }

  const preferences: BackupPreference[] = [];
  for (const key of BACKUP_PREFERENCE_KEYS) {
    const value = localStorage.getItem(key);
    if (value === null) continue;
    const entry = { key, value };
    if (validPreference(entry)) preferences.push(entry);
    else omissions.push(`La preferencia ${key} tiene un valor no admitido y no se incluyó.`);
  }

  let draft: SaleDraft | null = null;
  const draftRaw = sessionStorage?.getItem(SALE_DRAFT_KEY) ?? null;
  if (draftRaw) {
    let parsed: SaleDraft | null = null;
    try {
      parsed = parseSaleDraft(JSON.parse(draftRaw));
    } catch {
      parsed = null;
    }
    if (!parsed) omissions.push('El borrador local no se pudo leer y no se incluyó.');
    else if (parsed.vendedor_id && parsed.vendedor_id.trim() !== seller) omissions.push('El borrador local pertenece a otro vendedor y no se incluyó.');
    else {
      const safe = validBackupDraft(parsed, seller);
      if (!safe) omissions.push('El borrador local tiene fecha o montos inválidos y no se incluyó.');
      else draft = safe;
    }
  }

  return { cards, pendingSales, preferences, draft, omissions };
}

export function readLastExportDate(storage: BackupStorage): string | null {
  const value = storage.getItem(BACKUP_LAST_EXPORT_KEY);
  return isIsoTimestamp(value) ? value : null;
}

export function markExportStarted(storage: BackupStorage, now = new Date()): void {
  const value = now.toISOString();
  if (!isIsoTimestamp(value)) throw new Error('No se pudo registrar la fecha de exportación.');
  storage.setItem(BACKUP_LAST_EXPORT_KEY, value);
}

async function rollbackWrites(writes: FileWrite[], locks: BackupLocks): Promise<number> {
  let skipped = 0;
  for (const write of [...writes].reverse()) {
    try {
      await locks.request(write.lockName, () => {
        let current: string | null;
        try {
          current = write.storage.getItem(write.key);
        } catch {
          skipped++;
          return;
        }
        // Another tab changed this key after our write: never overwrite it.
        if (current !== write.next) {
          skipped++;
          return;
        }
        try {
          if (write.previous === null) write.storage.removeItem(write.key);
          else write.storage.setItem(write.key, write.previous);
        } catch {
          skipped++;
        }
      });
    } catch {
      skipped++;
    }
  }
  return skipped;
}

function writeTracked(writes: FileWrite[], write: FileWrite): void {
  const previous = write.storage.getItem(write.key);
  write.storage.setItem(write.key, write.next);
  // localStorage writes are atomic: only a completed write needs a rollback.
  writes.push({ ...write, previous });
}

function assertActiveSeller(storage: BackupStorage, seller: string): void {
  const active = normalizedSeller(storage.getItem(BACKUP_SELLER_KEY));
  if (active !== seller) {
    throw new Error('El vendedor activo cambió durante la restauración. No se escribieron más datos.');
  }
}

export async function restoreBackup(backupValue: unknown, env: RestoreEnvironment): Promise<RestoreResult> {
  let checked: ReturnType<typeof validateBackupObject>;
  try {
    checked = validateBackupObject(backupValue, env.seller);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'El respaldo no es válido.',
      rollbackSkipped: 0,
    };
  }
  if (!checked.ok) return { ok: false, error: checked.error, rollbackSkipped: 0 };
  const backup = checked.backup;
  const hasWrites = backup.data.cards.length > 0 || backup.data.preferences.length > 0 || backup.data.draft !== null;

  if (hasWrites && !env.locks) {
    return {
      ok: false,
      error: 'Este navegador no permite restaurar de forma segura entre ventanas. Actualiza Chrome, Safari o Edge y reintenta; tus datos actuales no se modificaron.',
      rollbackSkipped: 0,
    };
  }

  const writes: FileWrite[] = [];
  const warnings: string[] = [];
  let cardsAdded = 0;
  let cardConflicts = 0;
  let preferencesAdded = 0;
  let preferenceConflicts = 0;
  let draftRestored = false;
  let draftConflict = false;

  try {
    if (backup.data.cards.length > 0) {
      const key = cardStorageKey(backup.seller);
      await env.locks!.request(key, () => {
        assertActiveSeller(env.localStorage, backup.seller);
        // Re-read inside the same lock as the card panel so concurrent
        // additions survive and existing IDs are never replaced.
        const current = readStoredCards(env.localStorage, backup.seller);
        const ids = new Set(current.map(card => card.id));
        const merged = [...current];
        for (const card of backup.data.cards) {
          if (ids.has(card.id)) {
            cardConflicts++;
            continue;
          }
          ids.add(card.id);
          merged.push(card);
          cardsAdded++;
        }
        if (cardsAdded > 0) {
          writeTracked(writes, {
            storage: env.localStorage,
            key,
            lockName: key,
            previous: null,
            next: JSON.stringify(merged),
          });
        }
      });
    }

    for (const preference of backup.data.preferences) {
      if (!env.locks) break;
      const key = preference.key;
      await env.locks.request(`trackretail_backup_pref_${key}`, () => {
        assertActiveSeller(env.localStorage, backup.seller);
        if (env.localStorage.getItem(key) !== null) {
          preferenceConflicts++;
          return;
        }
        writeTracked(writes, {
          storage: env.localStorage,
          key,
          lockName: `trackretail_backup_pref_${key}`,
          previous: null,
          next: preference.value,
        });
        preferencesAdded++;
      });
    }

    if (backup.data.draft && env.locks) {
      if (!env.sessionStorage) {
        draftConflict = true;
        warnings.push('Este navegador no permite restaurar el borrador en la sesión actual. Los demás datos sí se conservaron.');
      } else {
        await env.locks.request(`trackretail_backup_draft_${SALE_DRAFT_KEY}`, () => {
          assertActiveSeller(env.localStorage, backup.seller);
          if (env.sessionStorage!.getItem(SALE_DRAFT_KEY) !== null) {
            draftConflict = true;
            return;
          }
          writeTracked(writes, {
            storage: env.sessionStorage!,
            key: SALE_DRAFT_KEY,
            lockName: `trackretail_backup_draft_${SALE_DRAFT_KEY}`,
            previous: null,
            next: JSON.stringify(backup.data.draft),
          });
          draftRestored = true;
        });
        if (draftRestored) {
          warnings.push('El borrador se restauró solo para esta sesión. No se activó ni se envió automáticamente.');
        }
      }
    }
    if (backup.pendingSales.length > 0) {
      warnings.push(`Las ${backup.pendingSales.length} venta(s) pendientes del respaldo no se agregaron a la cola activa ni se enviarán automáticamente.`);
    }
  } catch (error) {
    const rollbackSkipped = await rollbackWrites(writes, env.locks!);
    return {
      ok: false,
      error: `No se pudo completar la restauración. ${error instanceof Error ? error.message : 'Revisa el almacenamiento del navegador.'}`,
      rollbackSkipped,
    };
  }

  return {
    ok: true,
    cards: { added: cardsAdded, conflicts: cardConflicts },
    preferences: { added: preferencesAdded, conflicts: preferenceConflicts },
    draft: { restored: draftRestored, conflict: draftConflict },
    pendingSales: { notRestored: backup.pendingSales.length },
    warnings,
  };
}
