import { parseStockReport } from './stock';
import { readStockRows } from './stockFile';

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; name: string }>) => {
  try {
    const snapshot = parseStockReport(readStockRows(event.data.buffer, event.data.name));
    snapshot.source = event.data.name;
    self.postMessage({ snapshot });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'No se pudo leer el archivo.' }); }
};
