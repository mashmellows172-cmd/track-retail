import type { StockSnapshot } from './stock';
import {formatStockBarcode} from './stock';

const DB_NAME = 'trackretail-stock';
const DB_VERSION = 2;

export interface ProductHistoryEntry {
  date: string;
  store: string;
  price: number;
  available: number;
  existence: number | null;
}

function historyKey(plu: string): string {
  return `ph:${plu}`;
}

function mergeHistoryEntries(existing: ProductHistoryEntry[], incoming: ProductHistoryEntry[], maxDates = 30): ProductHistoryEntry[] {
  const map = new Map<string, ProductHistoryEntry>();
  for (const e of existing) {
    const k = `${e.store}|${e.date}`;
    map.set(k, e);
  }
  for (const e of incoming) {
    const k = `${e.store}|${e.date}`;
    map.set(k, e);
  }
  const arr = Array.from(map.values());
  arr.sort((a, b) => a.date.localeCompare(b.date));
  if (arr.length > maxDates) {
    return arr.slice(arr.length - maxDates);
  }
  return arr;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion || 0;
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots');
      }
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history');
      }
      if (oldVersion === 1) {
        const upgradeTx = request.transaction;
        if (!upgradeTx) return;
        const snapStore = upgradeTx.objectStore('snapshots');
        const histStore = upgradeTx.objectStore('history');
        const prevReq = snapStore.get('previous');
        const currReq = snapStore.get('current');
        currReq.onsuccess = () => {
          const current = currReq.result as StockSnapshot | undefined;
          const previous = prevReq.result as StockSnapshot | undefined;
          if (!current || !Array.isArray(current.products)) return;
          const byPlu = new Map<string, ProductHistoryEntry[]>();
          if (previous && previous.store === current.store && Array.isArray(previous.products)) {
            for (const p of previous.products) {
              if (!p.plu) continue;
              const entries = byPlu.get(p.plu) || [];
              entries.push({
                date: previous.date,
                store: previous.store,
                price: p.price,
                available: p.available,
                existence: p.existence,
              });
              byPlu.set(p.plu, entries);
            }
          }
          for (const p of current.products) {
            if (!p.plu) continue;
            const entries = byPlu.get(p.plu) || [];
            entries.push({
              date: current.date,
              store: current.store,
              price: p.price,
              available: p.available,
              existence: p.existence,
            });
            byPlu.set(p.plu, entries);
          }
          for (const [plu, incoming] of byPlu.entries()) {
            const key = historyKey(plu);
            const merged = mergeHistoryEntries([], incoming, 30);
            histStore.put(merged, key);
          }
        };
      }
    };
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento de stock.'));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadStock(): Promise<StockSnapshot | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const request = tx.objectStore('snapshots').get('current');
    tx.oncomplete = () => {
      db.close();
      const snapshot=request.result as StockSnapshot | undefined;
      resolve(snapshot ? {...snapshot,products:snapshot.products.map(p=>({...p,barcodes:[...new Set(p.barcodes.map(formatStockBarcode))]}))} : null);
    };
    tx.onabort = () => { db.close(); reject(new Error('No se pudo leer el stock guardado.')); };
  });
}

export async function loadProductHistory(plu: string): Promise<ProductHistoryEntry[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', 'readonly');
    const request = tx.objectStore('history').get(historyKey(plu));
    tx.oncomplete = () => {
      db.close();
      const result = request.result;
      if (Array.isArray(result)) {
        resolve(result as ProductHistoryEntry[]);
      } else {
        resolve([]);
      }
    };
    tx.onabort = () => { db.close(); reject(new Error('No se pudo leer el historial.')); };
  });
}

export async function saveStock(snapshot: StockSnapshot): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['snapshots', 'history'], 'readwrite');
    const store = tx.objectStore('snapshots');
    const histStore = tx.objectStore('history');
    const request = store.get('current');
    request.onsuccess = () => {
      const previous = request.result as StockSnapshot | undefined;
      if (previous && (snapshot.store !== previous.store || snapshot.date < previous.date)) { 
        tx.abort(); 
        return; 
      }
      const oldPrices = new Map(previous?.products.map(p => [p.plu, p]) || []);
      const products = snapshot.products.map(p => {
        const old = oldPrices.get(p.plu);
        const previousPrice = previous?.date === snapshot.date ? old?.previousPrice : old?.price;
        return previousPrice === undefined ? p : { ...p, previousPrice };
      });
      if (previous && previous.date !== snapshot.date) store.put(previous, 'previous');
      store.put({ ...snapshot, products }, 'current');
      for (const p of snapshot.products) {
        const key = historyKey(p.plu);
        const getReq = histStore.get(key);
        getReq.onsuccess = () => {
          let history: ProductHistoryEntry[] = [];
          if (Array.isArray(getReq.result)) {
            history = getReq.result as ProductHistoryEntry[];
          }
          const idx = history.findIndex(h => h.date === snapshot.date && h.store === snapshot.store);
          if (idx >= 0) {
            history[idx] = {
              date: snapshot.date,
              store: snapshot.store,
              price: p.price,
              available: p.available,
              existence: p.existence,
            };
          } else {
            history.push({
              date: snapshot.date,
              store: snapshot.store,
              price: p.price,
              available: p.available,
              existence: p.existence,
            });
          }
          history.sort((a, b) => a.date.localeCompare(b.date));
          if (history.length > 30) {
            history = history.slice(history.length - 30);
          }
          histStore.put(history, key);
        };
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(new Error('No se guardó la carga. Revisa espacio disponible, tienda y fecha; el stock anterior se conserva.')); };
  });
}
