import * as XLSX from 'xlsx';
import { decodeStockText } from './stock';

const options = { cellFormula: false, cellHTML: false, sheetRows: 100001 } as const;

function sheetRows(workbook: XLSX.WorkBook): unknown[][] {
  if (workbook.SheetNames.length !== 1) throw new Error('Selecciona un informe de existencias con una sola hoja.');
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null });
}

export function readStockRows(buffer: ArrayBuffer | Uint8Array, name: string): unknown[][] {
  let rows: unknown[][];
  if (/\.csv$/i.test(name)) {
    const text = decodeStockText(buffer);
    const lines = text.split(/\r?\n/);
    // El reporte real trae filas con | que SheetJS partiría en columnas; el parser las espera enteras.
    rows = lines.some(line => /^\s*\|/.test(line))
      ? lines.map(line => [line])
      : sheetRows(XLSX.read(text, { type: 'string', ...options }));
  } else {
    rows = sheetRows(XLSX.read(buffer, { type: 'array', ...options }));
  }
  if (rows.length > 100000) throw new Error('El informe supera las 100.000 filas permitidas.');
  return rows;
}
