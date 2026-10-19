'use client';

import { useEffect, useCallback } from 'react';
import { useToast } from '@/components/ToastProvider';
import { Haptics } from '@/lib/haptics';

export function useOfflineSync() {
  const { showToast } = useToast();

  const syncQueue = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.onLine) return;

    try {
      const queueStr = localStorage.getItem('trackretail_offline_queue');
      if (!queueStr) return;
      
      const queue = JSON.parse(queueStr);
      if (!Array.isArray(queue) || queue.length === 0) return;

      showToast(`Sincronizando ${queue.length} boleta(s) pendiente(s)...`, 'info');
      let successCount = 0;
      let failedQueue = [];

      for (const item of queue) {
        try {
          const res = await fetch('/api/ventas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          });

          if (res.ok || res.status === 409) {
            // 409 means it was already saved somehow, we can discard it from queue
            successCount++;
          } else {
            failedQueue.push(item);
          }
        } catch (e) {
          failedQueue.push(item);
        }
      }

      if (successCount > 0) {
        showToast(`¡${successCount} boleta(s) offline sincronizada(s)!`, 'success');
        Haptics.success();
      }

      if (failedQueue.length > 0) {
        localStorage.setItem('trackretail_offline_queue', JSON.stringify(failedQueue));
      } else {
        localStorage.removeItem('trackretail_offline_queue');
      }

    } catch (e) {
      console.error('Error sincronizando offline queue', e);
    }
  }, [showToast]);

  useEffect(() => {
    // Intentar sincronizar al cargar la app
    syncQueue();

    // Intentar sincronizar cuando vuelve el internet
    window.addEventListener('online', syncQueue);
    return () => window.removeEventListener('online', syncQueue);
  }, [syncQueue]);
}
