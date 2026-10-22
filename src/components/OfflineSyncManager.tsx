'use client';

import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useStoredString } from '@/hooks/useStoredString';
import { QUEUE_KEY } from '@/lib/offlineQueue';

export default function OfflineSyncManager() {
  useOfflineSync();
  const stored = useStoredString(QUEUE_KEY);
  let count = 0;
  let invalid = false;
  if (stored) {
    try {
      const queue: unknown = JSON.parse(stored);
      if (Array.isArray(queue)) count = queue.length;
      else invalid = true;
    } catch { invalid = true; }
  }
  if (!count && !invalid) return null;
  return <aside role="status" className="bg-surface-elevated border border-surface-border rounded-xl p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
    <p className="text-sm">{invalid ? 'No se pudo leer la cola local. Conserva los datos de este navegador.' : `${count} boleta(s) pendientes en este dispositivo. La comisión se confirmará al sincronizar.`}</p>
    {!invalid && <button type="button" className="border border-surface-border rounded-lg px-4 py-2 shrink-0" onClick={() => window.dispatchEvent(new Event('trackretail:queue-updated'))}>Reintentar sincronización</button>}
  </aside>;
}
