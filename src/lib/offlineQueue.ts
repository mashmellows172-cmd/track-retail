import type { Venta } from '@/types/venta';
export const QUEUE_KEY = 'trackretail_offline_queue';
type QueueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Send = (sale: Venta) => Promise<{ ok: boolean; status: number }>;

function readQueue(store: QueueStore): Venta[] {
  const value: unknown = JSON.parse(store.getItem(QUEUE_KEY) || '[]');
  if (!Array.isArray(value)) throw new Error('La cola pendiente no es válida. Conserva los datos locales para recuperarlos.');
  return value;
}

export async function withQueueLock<T>(work: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(QUEUE_KEY, work);
  return work();
}

export function enqueueSale(store: QueueStore, sale: Venta) {
  const queue = readQueue(store);
  queue.push(sale);
  store.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function syncPendingSales(store: QueueStore, send: Send) {
  const queue = readQueue(store);
  let saved = 0;
  for (const item of queue) {
    try {
      const response = await send(item);
      if (response.ok) {
        await withQueueLock(() => {
          const latest = readQueue(store);
          const index = latest.findIndex(value => JSON.stringify(value) === JSON.stringify(item));
          if (index !== -1) latest.splice(index, 1);
          if (latest.length) store.setItem(QUEUE_KEY, JSON.stringify(latest));
          else store.removeItem(QUEUE_KEY);
        });
        saved++;
      }
    } catch { /* Keep unacknowledged sales for a later attempt. */ }
  }
  return { saved, pending: readQueue(store).length };
}
