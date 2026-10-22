import * as XLSX from 'xlsx';
import { parseStockReport } from './stock';

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; name: string }>) => {
  try {
    const workbook = XLSX.read(event.data.buffer, { type: 'array', cellFormula: false, cellHTML: false, sheetRows: 100001 });
    if (workbook.SheetNames.length !== 1) throw new Error('Selecciona un informe de existencias con una sola hoja.');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null });
    if (rows.length > 100000) throw new Error('El informe supera las 100.000 filas permitidas.');
    const snapshot = parseStockReport(rows);
    snapshot.source = event.data.name;
    self.postMessage({ snapshot });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'No se pudo leer el Excel.' }); }
};
