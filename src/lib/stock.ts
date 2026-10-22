export interface StockProduct {
  plu: string; barcodes: string[]; area: string; category: string; description: string;
  available: number; existence: number | null; price: number; previousPrice?: number;
}
export interface StockSnapshot {
  date: string; store: string; products: StockProduct[]; importedAt: string; source: string; warnings?: string[];
}
export function channelAdvice(available: number) {
  return available < 0 ? 'incidencia' : available === 0 ? 'consultar_web' : available === 1 ? 'verificar' : 'sala';
}
export function normalizeCode(value: string) { return value.trim().replace(/^0+(?=\d)/, ''); }
export function formatStockBarcode(value:string) {
  const compact=normalizeCode(value);
  return /^2000\d{8}$/.test(compact) ? compact.padStart(13,'0') : value.trim();
}
export function findProduct(products: StockProduct[], code: string) {
  const key = normalizeCode(code);
  if (!/^\d+$/.test(key)) return undefined;
  const matches = products.filter(p => normalizeCode(p.plu) === key || p.barcodes.some(b => normalizeCode(b) === key));
  return matches.length === 1 ? matches[0] : undefined;
}
function columnReport(rows: unknown[][]) {
  const normalize=(v:unknown)=>String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const header=rows.find(row=>row.some(v=>normalize(v)==='PLU') && row.some(v=>normalize(v)==='DISPONIBLE'));
  if(!header) return {rows,hasExistence:true,warnings:[] as string[]};
  const labels=header.map(normalize);
  const column=(name:string)=>labels.findIndex(v=>v===name || v.startsWith(`${name} `));
  const columns={area:column('AREA'),category:column('NIVEL DE AGREGACION'),plu:column('PLU'),barcode:column('CODIGO DE BARRA'),description:column('DESCRIPCION PRODUCTO'),available:column('DISPONIBLE'),price:column('PRECIO'),existence:column('EXISTENCIA')};
  if(Object.entries(columns).some(([name,index])=>name!=='existence' && index<0)) throw new Error('Faltan columnas del informe: área, categoría, PLU, código, descripción, disponible o precio.');
  let detached=0;
  const converted=rows.map((row,index)=>{
    const get=(key:keyof typeof columns)=>{
      const value=row[columns[key]];
      if(typeof value==='number' && !Number.isSafeInteger(value)) throw new Error(`Número impreciso en fila ${index+1}. Conserva los códigos como texto.`);
      return String(value ?? '').trim();
    };
    const plu=get('plu'),barcode=get('barcode'),description=get('description'),area=get('area');
    if(!plu && /^\d+$/.test(barcode) && !description && !area && !get('category') && !get('available') && !get('price')) {detached++;return [''];}
    if(normalize(row[columns.plu])==='PLU') return row;
    // Preserve metadata and page separators, which can appear in any spreadsheet column.
    if(/FECHA\s*:|DEPENDENCIA\s*:|FECHA\s+EMISION\s*:|PAGINA\s*:/.test(row.map(normalize).join(' '))) return row;
    if(!plu) {
      if(/^\d+$/.test(area) || (description && (barcode || get('category') || /^-?\d+$/.test(get('available')) || /^-?\d+$/.test(get('price'))))) throw new Error(`Falta el PLU en fila ${index+1}.`);
      return row;
    }
    return [`|${area}|${get('category')}|${plu}|${barcode}|${description}|||${get('existence')}|${get('available')}|${get('price')}||`];
  });
  return {rows:converted,hasExistence:columns.existence>=0,warnings:detached ? [`Se omitieron ${detached.toLocaleString('es-CL')} códigos alternativos sin PLU asociado. Podrás buscar esos productos por su PLU o código principal.`] : []};
}
export function parseStockReport(rows: unknown[][]): StockSnapshot {
  const normalized=columnReport(rows);
  rows=normalized.rows;
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
      const barcode=formatStockBarcode(cells[4]);
      if (!last.barcodes.includes(barcode)) last.barcodes.push(barcode);
      continue;
    }
    if (!/^\d+$/.test(cells[1] || '') || !/^\d+$/.test(cells[3] || '')) {
      if (cells.length === 13 && cells[5] && (cells[3] || cells[4]) && !/DESCRIPCION PRODUCTO/i.test(cells[5])) throw new Error(`Identificador inválido en fila ${index + 1}.`);
      continue;
    }
    if (cells.length !== 13 || !/^\d+$/.test(cells[4]) || !cells[5] || !(normalized.hasExistence ? [cells[8],cells[9],cells[10]] : [cells[9],cells[10]]).every(v => /^-?\d+$/.test(v))) {
      throw new Error(`Revisa la fila ${index + 1}: producto incompleto o importe inválido.`);
    }
    const existence=normalized.hasExistence ? Number(cells[8]) : null;
    const [available, price] = [cells[9],cells[10]].map(Number);
    if (!([available, price,...(existence === null ? [] : [existence])]).every(Number.isSafeInteger) || price < 0) throw new Error(`Valor inválido en fila ${index + 1}.`);
    const barcode=formatStockBarcode(cells[4]);
    const product: StockProduct = { plu: cells[3], barcodes: [barcode], area: cells[1], category: cells[2], description: cells[5], existence, available, price };
    const prior = products.get(product.plu);
    if (prior) {
      if (prior.area !== product.area || prior.category !== product.category || prior.description !== product.description || prior.available !== available || prior.existence !== existence || prior.price !== price) {
        throw new Error(`Datos en conflicto para PLU ${product.plu}, fila ${index + 1}.`);
      }
      if (!prior.barcodes.includes(barcode)) prior.barcodes.push(barcode);
      last = prior;
    } else { products.set(product.plu, product); last = product; }
  }
  if (!products.size || !date) throw new Error('El archivo no contiene un informe de existencias con fecha de emisión.');
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== date) throw new Error('Fecha del informe inválida.');
  return { date, store, products: [...products.values()], importedAt: new Date().toISOString(), source: '',warnings:normalized.warnings };
}
