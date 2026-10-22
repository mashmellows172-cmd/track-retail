export interface StockProduct {
  plu: string; barcodes: string[]; area: string; category: string; description: string;
  available: number; existence: number; price: number; previousPrice?: number;
}
export interface StockSnapshot {
  date: string; store: string; products: StockProduct[]; importedAt: string; source: string;
}
export function channelAdvice(available: number) {
  return available < 0 ? 'incidencia' : available === 0 ? 'consultar_web' : available === 1 ? 'verificar' : 'sala';
}
export function normalizeCode(value: string) { return value.trim().replace(/^0+(?=\d)/, ''); }
export function findProduct(products: StockProduct[], code: string) {
  const key = normalizeCode(code);
  if (!/^\d+$/.test(key)) return undefined;
  const matches = products.filter(p => normalizeCode(p.plu) === key || p.barcodes.some(b => normalizeCode(b) === key));
  return matches.length === 1 ? matches[0] : undefined;
}
export function parseStockReport(rows: unknown[][]): StockSnapshot {
  let date = '', store = '', last: StockProduct | undefined;
  const products = new Map<string, StockProduct>();
  for (let index = 0; index < rows.length; index++) {
    const line = rows[index].filter(v => v !== null && v !== undefined).map(String).join('');
    const dateMatch = line.match(/FECHA\s+EMISION\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (dateMatch) date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    const storeMatch = line.match(/DEPENDENCIA\s*:\s*(.+)/i);
    if (storeMatch) store = storeMatch[1].trim();
    if (!line.trimStart().startsWith('|')) continue;
    const cells = line.split('|').map(s => s.trim());
    if (!cells[1] && !cells[3] && !cells[5] && /^\d+$/.test(cells[4] || '') && cells.slice(6).every(v => !v)) {
      if (!last) throw new Error(`Código sin producto en fila ${index + 1}.`);
      if (!last.barcodes.includes(cells[4])) last.barcodes.push(cells[4]);
      continue;
    }
    if (!/^\d+$/.test(cells[1] || '') || !/^\d+$/.test(cells[3] || '')) {
      if (cells.length === 13 && cells[5] && (cells[3] || cells[4]) && !/DESCRIPCION PRODUCTO/i.test(cells[5])) throw new Error(`Identificador inválido en fila ${index + 1}.`);
      continue;
    }
    if (cells.length !== 13 || !/^\d+$/.test(cells[4]) || !cells[5] || ![cells[8],cells[9],cells[10]].every(v => /^-?\d+$/.test(v))) {
      throw new Error(`Revisa la fila ${index + 1}: producto incompleto o importe inválido.`);
    }
    const [existence, available, price] = [cells[8],cells[9],cells[10]].map(Number);
    if (![existence, available, price].every(Number.isSafeInteger) || price < 0) throw new Error(`Valor inválido en fila ${index + 1}.`);
    const product: StockProduct = { plu: cells[3], barcodes: [cells[4]], area: cells[1], category: cells[2], description: cells[5], existence, available, price };
    const prior = products.get(product.plu);
    if (prior) {
      if (prior.area !== product.area || prior.category !== product.category || prior.description !== product.description || prior.available !== available || prior.existence !== existence || prior.price !== price) {
        throw new Error(`Datos en conflicto para PLU ${product.plu}, fila ${index + 1}.`);
      }
      if (!prior.barcodes.includes(cells[4])) prior.barcodes.push(cells[4]);
      last = prior;
    } else { products.set(product.plu, product); last = product; }
  }
  if (!products.size || !date) throw new Error('El archivo no contiene un informe de existencias con fecha de emisión.');
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== date) throw new Error('Fecha del informe inválida.');
  return { date, store, products: [...products.values()], importedAt: new Date().toISOString(), source: '' };
}
