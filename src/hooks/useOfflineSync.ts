'use client';
import { useEffect, useCallback } from 'react';
import { useToast } from '@/components/ToastProvider';
import { syncPendingSales } from '@/lib/offlineQueue';
let syncing = false;
export function useOfflineSync() {
  const { showToast } = useToast();
  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    syncing = true;
    const sync = async () => {
      try {
        const { saved, pending } = await syncPendingSales(localStorage, item => fetch('/api/ventas', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item),
          signal: AbortSignal.timeout(20000),
        }));
        window.dispatchEvent(new Event('trackretail:storage'));
        if (saved) {
          showToast(`${saved} boleta(s) sincronizada(s).`, 'success');
          window.dispatchEvent(new Event('trackretail:ventas-updated'));
        }
        if (pending) showToast(`${pending} boleta(s) siguen pendientes en este dispositivo.`, 'info');
      } catch {
        showToast('No se pudo leer la cola pendiente. Conserva los datos de este navegador.', 'error');
      }
    };
    try {
      if (navigator.locks) await navigator.locks.request('trackretail-sync', { ifAvailable: true }, lock => lock ? sync() : undefined);
      else await sync();
    } finally { syncing = false; }
  }, [showToast]);
  useEffect(() => {
    // Intentar sincronizar al cargar la app
    void syncQueue();
    // Intentar sincronizar cuando vuelve el internet
    window.addEventListener('online', syncQueue);
    window.addEventListener('trackretail:queue-updated', syncQueue);
    return () => {
      window.removeEventListener('online', syncQueue);
      window.removeEventListener('trackretail:queue-updated', syncQueue);
    };
  }, [syncQueue]);
}
