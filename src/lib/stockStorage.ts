import type { StockSnapshot } from './stock';
import {formatStockBarcode} from './stock';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('trackretail-stock', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
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
export async function saveStock(snapshot: StockSnapshot): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    const store = tx.objectStore('snapshots');
    const request = store.get('current');
    request.onsuccess = () => {
      const previous = request.result as StockSnapshot | undefined;
      if (previous && (snapshot.store !== previous.store || snapshot.date < previous.date)) { tx.abort(); return; }
      const oldPrices = new Map(previous?.products.map(p => [p.plu, p]) || []);
      const products = snapshot.products.map(p => {
        const old = oldPrices.get(p.plu);
        const previousPrice = previous?.date === snapshot.date ? old?.previousPrice : old?.price;
        return previousPrice === undefined ? p : { ...p, previousPrice };
      });
      if (previous && previous.date !== snapshot.date) store.put(previous, 'previous');
      store.put({ ...snapshot, products }, 'current');
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(new Error('No se guardó la carga. Revisa espacio disponible, tienda y fecha; el stock anterior se conserva.')); };
  });
}
