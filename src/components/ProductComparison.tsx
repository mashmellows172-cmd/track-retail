'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search } from 'lucide-react';
import type { StockProduct } from '@/lib/stock';
import { canAddToComparison } from '@/lib/productComparison';

const money = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const button = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-surface-border px-4 py-2 transition-colors hover:bg-surface-base disabled:opacity-40 disabled:cursor-not-allowed';

function suggestedBrand(p: StockProduct) {
  const brands = ['AMERICAN TOURISTER','URSUS TROTTER','UNDER ARMOUR','SAMSUNG','MOTOROLA','XIAOMI','HISENSE','MADEMSA','SINDELEN','SKECHERS','BROTHER','THOMAS','AIROLITE','KENDAL','SIEGEN','JANOME','MIDEA','PHILIPS','ELECTROLUX','OSTER','FENSA','APPLE','HONOR','HUAWEI','LENOVO','ASUS','ACER','SONY','LG','HP','GAMA','CAIXUN','XTREM','HEAD','KAYSER'];
  return brands.find(b => (` ${p.description.toUpperCase()} `).includes(` ${b} `)) || '';
}

export default function ProductComparison({ products, onClose, reportDate }: { products: StockProduct[]; onClose: () => void; reportDate?: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const items = products.filter(p => selected.includes(p.plu));
  
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  
  const addProduct = (plu: string) => {
    if (canAddToComparison(selected, plu)) {
      setSelected([...selected, plu]);
    }
  };
  
  const removeProduct = (plu: string) => {
    setSelected(selected.filter(s => s !== plu));
  };
  
  const clearAll = () => setSelected([]);
  
  const matches = useMemo(() => {
    const q = query.trim().toLocaleUpperCase('es');
    if (!q) return [];
    return products
      .filter(p => !selected.includes(p.plu))
      .filter(p => 
        p.description.toLocaleUpperCase('es').includes(q) || 
        p.plu.includes(q) || 
        p.barcodes.some(b => b.toLocaleUpperCase('es').includes(q))
      )
      .slice(0, 30);
  }, [products, query, selected]);
  
  return (
    <dialog ref={dialogRef} onCancel={(e) => { e.preventDefault(); onClose(); }} className="m-auto w-[calc(100%-1rem)] max-w-6xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-surface-border bg-surface-elevated p-4 sm:p-6 text-on-surface backdrop:bg-black/70" aria-labelledby="comparison-title">
      <div className="flex justify-between items-start gap-3 mb-4">
        <div>
          <h2 id="comparison-title" className="text-xl font-semibold">Comparación de productos (hasta 3)</h2>
          <p className="text-sm text-on-surface-variant">Solo se usan hechos confirmados del stock. Las marcas son indicativas. {reportDate ? `Informe: ${reportDate}.` : ''}</p>
        </div>
        <button type="button" className={`${button} min-h-11 min-w-11 shrink-0 px-3`} aria-label="Cerrar comparación" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      
      <div className="space-y-3 mb-4">
        <div>
          <label htmlFor="comparison-search" className="block text-sm font-medium mb-2">Buscar producto por nombre, PLU o código</label>
          <div className="relative">
            <Search size={18} aria-hidden="true" className="absolute left-3 top-3.5 text-on-surface-variant" />
            <input id="comparison-search" className="min-h-12 w-full rounded-xl border border-surface-border bg-surface-base pl-9 pr-3" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en todo el stock..." />
          </div>
          {query.trim() && <p className="text-xs text-on-surface-variant mt-1">{matches.length} coincidencias (máx. 30)</p>}
        </div>
        {query.trim() && matches.length > 0 && (
          <div className="rounded-xl border border-surface-border overflow-hidden">
            {matches.map(p => (
              <button key={p.plu} type="button" disabled={!canAddToComparison(selected, p.plu)} onClick={() => { addProduct(p.plu); setQuery(''); }} className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-surface-base disabled:opacity-40 disabled:cursor-not-allowed border-b border-surface-border last:border-b-0">
                <div>
                  <p className="font-medium">{p.description}</p>
                  <p className="text-xs text-on-surface-variant">PLU {p.plu} · Área {p.area} · {p.available >= 0 ? `${p.available} disp.` : 'Stock negativo'}</p>
                </div>
                <span className="text-xs text-secondary">Agregar</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={clearAll} className={button} disabled={selected.length === 0}>Limpiar</button>
        </div>
      </div>
      
      {items.length === 0 && <p className="text-center text-on-surface-variant py-8">Agrega hasta 3 productos distintos para comparar (desde todo el stock).</p>}
      
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left p-3 text-sm font-medium">Campo</th>
                {items.map(item => (
                  <th key={item.plu} className="text-left p-3 min-w-[200px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold break-words">{item.description}</p>
                        <p className="text-xs text-on-surface-variant">PLU {item.plu}</p>
                      </div>
                      <button type="button" onClick={() => removeProduct(item.plu)} className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 hover:bg-surface-base rounded-xl" aria-label={`Quitar ${item.description}`}><X size={18} aria-hidden="true" /></button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-surface-border">
                <td className="p-3 text-sm text-on-surface-variant">Precio (listado)</td>
                {items.map(item => <td key={item.plu} className="p-3 font-semibold tabular-nums">{item.price ? money(item.price) : 'Sin precio'}</td>)}
              </tr>
              <tr className="border-b border-surface-border">
                <td className="p-3 text-sm text-on-surface-variant">Disponibles</td>
                {items.map(item => <td key={item.plu} className="p-3 tabular-nums">{item.available} {item.available < 0 ? '(negativo)' : item.available === 0 ? '(cero)' : item.available === 1 ? '(1 unidad)' : ''}</td>)}
              </tr>
              <tr className="border-b border-surface-border">
                <td className="p-3 text-sm text-on-surface-variant">Existencia física</td>
                {items.map(item => <td key={item.plu} className="p-3">{item.existence ?? 'No incluida'}</td>)}
              </tr>
              <tr className="border-b border-surface-border">
                <td className="p-3 text-sm text-on-surface-variant">Categoría</td>
                {items.map(item => <td key={item.plu} className="p-3">{item.category}</td>)}
              </tr>
              <tr className="border-b border-surface-border">
                <td className="p-3 text-sm text-on-surface-variant">Marca (orientativa)</td>
                {items.map(item => <td key={item.plu} className="p-3">{suggestedBrand(item) || 'Por confirmar'}</td>)}
              </tr>
              <tr className="border-b border-surface-border">
                <td className="p-3 text-sm text-on-surface-variant">Área</td>
                {items.map(item => <td key={item.plu} className="p-3">Área {item.area}</td>)}
              </tr>
              <tr>
                <td className="p-3 text-sm text-on-surface-variant">Códigos de barras</td>
                {items.map(item => <td key={item.plu} className="p-3 text-xs">{item.barcodes.slice(0,2).join(', ')}{item.barcodes.length>2?` +${item.barcodes.length-2}`:''}</td>)}
              </tr>
            <tr>
                <td className="p-3 text-sm text-on-surface-variant">Ficha de referencia</td>
                {items.map(item => <td key={item.plu} className="p-3">{/^\d{8}$/.test(item.plu) ? <a href={`https://www.abc.cl/${encodeURIComponent(item.plu)}.html`} target="_blank" rel="noopener noreferrer" className={`${button} text-secondary`}>Consultar en ABC<span className="sr-only">: {item.description}</span></a> : 'PLU sin enlace verificable'}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      
      <p className="text-xs text-on-surface-variant mt-4">Comparación solo con hechos confirmados del stock. Especificaciones técnicas no inventadas. Las unidades 0/negativas se muestran con cautela.</p>
    </dialog>
  );
}
