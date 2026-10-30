'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { AlertTriangle, DatabaseBackup, Download, FileJson, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { useStoredString } from '@/hooks/useStoredString';
import {
  BACKUP_MAX_BYTES,
  BACKUP_PREFERENCE_KEYS,
  QUEUE_KEY,
  SALE_DRAFT_KEY,
  buildBackup,
  markExportStarted,
  parseBackupText,
  previewBackup,
  readBackupInputs,
  readLastExportDate,
  readStoredCards,
  restoreBackup,
  serializeBackup,
  type BackupFileV1,
  type BackupLocks,
  type BackupPreview,
  type BackupStorage,
} from '@/lib/backup';
import { parsePendingQueue } from '@/lib/receiptDuplicates';
import { chileDate } from '@/lib/validation';

const button = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-surface-border px-4 py-2 font-label-md text-label-md transition-colors hover:bg-surface-base disabled:opacity-40';
const primaryButton = `${button} border-secondary/40 bg-secondary/15 text-secondary`;

function browserLocks(): BackupLocks | null {
  if (typeof navigator === 'undefined' || !navigator.locks) return null;
  const manager = navigator.locks;
  return {
    request: <T,>(name: string, callback: () => T | Promise<T>): Promise<T> =>
      manager.request(name, () => callback()) as Promise<T>,
  };
}

function storageOrNull(kind: 'localStorage' | 'sessionStorage'): BackupStorage | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function when(value: string): string {
  return new Date(value).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
}

interface Summary {
  cards: number;
  pending: number;
  preferences: number;
  draft: boolean;
  error: string;
}

const EMPTY_SUMMARY: Summary = { cards: 0, pending: 0, preferences: 0, draft: false, error: '' };

function subscribeStorage(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener('trackretail:storage', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('trackretail:storage', callback);
  };
}

function readSummary(seller: string | null): Summary {
  const empty = EMPTY_SUMMARY;
  if (!seller) return empty;
  const local = storageOrNull('localStorage');
  const session = storageOrNull('sessionStorage');
  if (!local) return { ...empty, error: 'No se pudo leer el almacenamiento de este navegador.' };
  try {
    const cards = readStoredCards(local, seller).length;
    const queue = parsePendingQueue(local.getItem(QUEUE_KEY));
    let pending = 0;
    if (!queue.invalid) {
      pending = queue.sales.filter(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const row = item as Record<string, unknown>;
        return typeof row.vendedor_id === 'string' && row.vendedor_id.trim() === seller;
      }).length;
    }
    return {
      cards,
      pending,
      preferences: BACKUP_PREFERENCE_KEYS.filter(key => local.getItem(key) !== null).length,
      draft: Boolean(session?.getItem(SALE_DRAFT_KEY)),
      error: queue.invalid ? 'La cola pendiente no se pudo leer. Consérvala y no borres los datos del navegador.' : '',
    };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : 'No se pudieron leer los datos locales.' };
  }
}

export default function BackupPanel() {
  const seller = useStoredString('trackretail_vendedor');
  // Storage can change in another tab or from the card panel in this one. A
  // snapshot string keeps useSyncExternalStore stable while re-reading it.
  const summaryJson = useSyncExternalStore(
    subscribeStorage,
    () => JSON.stringify(readSummary(seller)),
    () => JSON.stringify(EMPTY_SUMMARY),
  );
  const summary = JSON.parse(summaryJson) as Summary;
  const lastExport = useSyncExternalStore(
    subscribeStorage,
    () => {
      const local = storageOrNull('localStorage');
      if (!local) return null;
      try {
        return readLastExportDate(local);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [omissions, setOmissions] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ backup: BackupFileV1; summary: BackupPreview; fileName: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportBackup = async () => {
    setError('');
    setStatus('');
    setOmissions([]);
    if (!seller) {
      setError('Configura el nombre del vendedor antes de exportar.');
      return;
    }
    const local = storageOrNull('localStorage');
    const session = storageOrNull('sessionStorage');
    if (!local) {
      setError('No se pudo acceder al almacenamiento de este navegador.');
      return;
    }
    setExporting(true);
    try {
      // readBackupInputs owns the queue/privacy filtering and rejects partial reads.
      const fresh = readBackupInputs(local, session, seller);
      const backup = buildBackup({
        seller,
        exportedAt: new Date().toISOString(),
        cards: fresh.cards,
        pendingSales: fresh.pendingSales,
        preferences: fresh.preferences,
        draft: fresh.draft,
      });
      const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeSeller = seller.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'vendedor';
      link.href = url;
      link.download = `respaldo-trackretail-${safeSeller}-${chileDate()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      markExportStarted(local);
      window.dispatchEvent(new Event('trackretail:storage'));
      setOmissions(fresh.omissions);
      setStatus('Descarga iniciada. Guarda el archivo en un lugar seguro; la fecha se registra aunque cierres el navegador antes de completarla.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el respaldo.');
    } finally {
      setExporting(false);
    }
  };

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setStatus('');
    setOmissions([]);
    setPreview(null);
    const file = event.target.files?.[0];
    if (!file) return;
    if (!seller) {
      setError('Configura el nombre del vendedor antes de revisar un respaldo.');
      event.target.value = '';
      return;
    }
    if (file.size > BACKUP_MAX_BYTES) {
      setError('El archivo supera el tamaño máximo de 5 MB.');
      event.target.value = '';
      return;
    }
    try {
      const parsed = parseBackupText(await file.text(), seller);
      if (!parsed.ok) {
        setError(parsed.error);
        event.target.value = '';
        return;
      }
      const local = storageOrNull('localStorage');
      const session = storageOrNull('sessionStorage');
      if (!local) throw new Error('No se pudo leer el almacenamiento de este navegador.');
      const currentCards = readStoredCards(local, seller);
      const currentPreferences = BACKUP_PREFERENCE_KEYS.filter(key => local.getItem(key) !== null);
      const currentDraft = Boolean(session?.getItem(SALE_DRAFT_KEY));
      setPreview({
        backup: parsed.backup,
        summary: previewBackup(parsed.backup, {
          seller,
          cardIds: currentCards.map(card => card.id),
          preferenceKeys: currentPreferences,
          hasDraft: currentDraft,
        }),
        fileName: file.name,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo.');
    } finally {
      event.target.value = '';
    }
  };

  const confirmRestore = async () => {
    if (!preview || !seller || restoring) return;
    setError('');
    setStatus('');
    setRestoring(true);
    const local = storageOrNull('localStorage');
    const session = storageOrNull('sessionStorage');
    if (!local) {
      setError('No se pudo acceder al almacenamiento de este navegador.');
      setRestoring(false);
      return;
    }
    try {
      const result = await restoreBackup(preview.backup, { seller, localStorage: local, sessionStorage: session, locks: browserLocks() });
      if (!result.ok) {
        setError(result.error);
        if (result.rollbackSkipped > 0) {
          setError(`${result.error} Algunos valores cambiaron en otra ventana y se conservaron; revisa tus datos antes de reintentar.`);
        }
        return;
      }
      const parts = [
        `${result.cards.added} tarjeta(s) nueva(s)`,
        `${result.cards.conflicts} tarjeta(s) ya existente(s) sin sobrescribir`,
        `${result.preferences.added} preferencia(s) restaurada(s)`,
        result.draft.restored ? 'borrador restaurado solo en esta sesión' : 'borrador no reemplazado',
      ];
      setStatus(`Restauración completada: ${parts.join(' · ')}. No se envió ninguna venta ni se modificó la cola pendiente.`);
      setOmissions(result.warnings);
      setPreview(null);
      window.dispatchEvent(new Event('trackretail:storage'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo restaurar el respaldo.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="border-b border-surface-border pb-6">
        <h2 className="font-display-lg-mobile text-display-lg-mobile text-on-surface md:font-display-lg md:text-display-lg">
          Respaldo local
        </h2>
        <p className="mt-2 font-body-lg text-body-lg text-on-surface-variant">
          Exporta y revisa una copia de los datos que viven en este navegador para el vendedor activo.
        </p>
      </header>

      {!seller && (
        <div role="alert" className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-on-surface">
          Configura tu nombre en la barra superior para exportar o restaurar un respaldo.
        </div>
      )}

      {summary.error && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-4 text-sm text-error">{summary.error}</p>}
      {error && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-4 text-sm text-error">{error}</p>}
      {status && <p role="status" className="rounded-xl border border-secondary/40 bg-secondary/10 p-4 text-sm text-on-surface">{status}</p>}
      {omissions.length > 0 && (
        <div role="status" className="space-y-2 rounded-xl border border-tertiary/30 bg-tertiary/5 p-4 text-sm">
          {omissions.map(omission => <p key={omission}>{omission}</p>)}
        </div>
      )}

      <section aria-labelledby="backup-scope-title" className="rounded-2xl border border-surface-border bg-surface-elevated p-5">
        <h3 id="backup-scope-title" className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck size={22} aria-hidden="true" /> Qué incluye y qué no
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-surface-base p-4">
            <p className="font-semibold text-secondary">Incluye</p>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              <li>Tarjetas del vendedor activo ({summary.cards}).</li>
              <li>Preferencias permitidas: tema y vista del historial ({summary.preferences}).</li>
              <li>Borrador sin guardar de esta sesión ({summary.draft ? 'presente' : 'sin borrador'}).</li>
              <li>Ventas pendientes del vendedor activo ({summary.pending}), solo para recuperación.</li>
            </ul>
          </div>
          <div className="rounded-xl bg-surface-base p-4">
            <p className="font-semibold text-tertiary">No incluye</p>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              <li>Historial de ventas guardado en el servidor.</li>
              <li>Stock, fotos o precios del catálogo.</li>
              <li>Datos de otros vendedores ni claves ajenas a la lista permitida.</li>
              <li>La cola activa: las ventas pendientes no se restauran ni se envían automáticamente.</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm text-on-surface-variant">
          El stock se puede recuperar volviendo a cargar el archivo original (XLSX o CSV) en Catálogo. Para el historial,
          usa <Link href="/historial" className="text-primary underline underline-offset-2">Exportar Excel en Historial</Link>.
          Revisa el archivo antes de compartirlo: contiene tus ventas pendientes y tu borrador, pero no datos de otros vendedores.
        </p>
      </section>

      <section aria-labelledby="backup-export-title" className="rounded-2xl border border-surface-border bg-surface-elevated p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="backup-export-title" className="flex items-center gap-2 text-xl font-semibold">
              <Download size={22} aria-hidden="true" /> Exportar
            </h3>
            <p className="mt-2 text-sm text-on-surface-variant">
              Archivo JSON versionado ({'versión 1'}). La fecha de último inicio de descarga es informativa y no garantiza que el archivo se haya guardado.
            </p>
          </div>
          <p className="rounded-xl bg-surface-base px-3 py-2 text-sm text-on-surface-variant">
            {lastExport ? `Último inicio: ${when(lastExport)}` : 'Sin exportaciones registradas'}
          </p>
        </div>
        <button type="button" onClick={() => void exportBackup()} disabled={!seller || exporting || Boolean(summary.error)} className={`${primaryButton} mt-5 w-full sm:w-auto`}>
          {exporting ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <FileJson size={18} aria-hidden="true" />}
          {exporting ? 'Preparando…' : 'Descargar respaldo JSON'}
        </button>
        <p className="mt-3 text-xs text-on-surface-variant">
          No se exportan claves arbitrarias ni datos de otros vendedores. Si la cola o las tarjetas están dañadas, la exportación se detiene para no ocultar información.
        </p>
      </section>

      <section aria-labelledby="backup-import-title" className="rounded-2xl border border-surface-border bg-surface-elevated p-5">
        <h3 id="backup-import-title" className="flex items-center gap-2 text-xl font-semibold">
          <Upload size={22} aria-hidden="true" /> Revisar y restaurar
        </h3>
        <p className="mt-2 text-sm text-on-surface-variant">
          Primero se valida todo el archivo y se muestra un resumen. Nada se escribe hasta que confirmes. El respaldo debe pertenecer al vendedor activo.
        </p>
        <label className="mt-4 block text-sm font-semibold" htmlFor="backup-file">Archivo de respaldo (.json)</label>
        <input
          id="backup-file"
          type="file"
          accept="application/json,.json"
          onChange={event => void chooseFile(event)}
          disabled={!seller || restoring}
          className="mt-2 block min-h-12 w-full rounded-xl border border-surface-border bg-surface-base p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary/15 file:px-3 file:py-2 file:text-secondary"
        />
        <p className="mt-2 text-xs text-on-surface-variant">Tamaño máximo: 5 MB. Los archivos inválidos o de otro vendedor no modifican nada.</p>

        {preview && (
          <div className="mt-5 space-y-4 rounded-xl border border-secondary/30 bg-secondary/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Vista previa de {preview.fileName}</p>
                <p className="text-sm text-on-surface-variant">Vendedor: {preview.summary.seller} · Exportado: {when(preview.backup.exportedAt)}</p>
              </div>
              <AlertTriangle size={22} aria-hidden="true" className="shrink-0 text-tertiary" />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-on-surface-variant">Tarjetas nuevas</dt><dd className="text-lg font-semibold">{preview.summary.cards.new}</dd></div>
              <div><dt className="text-on-surface-variant">Tarjetas existentes</dt><dd className="text-lg font-semibold">{preview.summary.cards.conflicts}</dd></div>
              <div><dt className="text-on-surface-variant">Preferencias nuevas</dt><dd className="text-lg font-semibold">{preview.summary.preferences.new}</dd></div>
              <div><dt className="text-on-surface-variant">Ventas pendientes</dt><dd className="text-lg font-semibold">{preview.summary.pendingSales.total}</dd></div>
            </dl>
            <div className="space-y-1 text-sm text-on-surface-variant">
              {preview.summary.cards.conflicts > 0 && <p>Las tarjetas con el mismo ID local se conservan tal como están; no se sobrescriben.</p>}
              {preview.summary.preferences.conflicts > 0 && <p>Las preferencias ya configuradas en este navegador no se reemplazan.</p>}
              {preview.summary.draft.included && <p>{preview.summary.draft.conflict ? 'Ya existe un borrador: se conservará el actual.' : 'El borrador se restaurará solo en esta sesión y no se activará automáticamente.'}</p>}
              <p>Las ventas pendientes del archivo son solo de recuperación: no entran a la cola activa y no se envían.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => void confirmRestore()} disabled={restoring} className={primaryButton}>
                {restoring ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <DatabaseBackup size={18} aria-hidden="true" />}
                {restoring ? 'Restaurando…' : 'Confirmar restauración'}
              </button>
              <button type="button" onClick={() => { setPreview(null); setStatus(''); }} disabled={restoring} className={button}>Cancelar</button>
            </div>
          </div>
        )}
        <p className="mt-4 text-xs text-on-surface-variant">
          La restauración requiere Web Locks para combinar tarjetas entre ventanas. Si el navegador no lo admite, se detiene sin escribir.
        </p>
      </section>

      <p className="text-xs text-on-surface-variant">
        Esta copia no reemplaza el historial del servidor ni el archivo de stock. Mantén tus archivos originales y verifica el historial después de cambiar de dispositivo.
      </p>
    </div>
  );
}
