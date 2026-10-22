'use client';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Camera, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ExternalLink, Package, Search, Upload, X, AlertTriangle, TrendingDown } from 'lucide-react';
import { channelAdvice, findProduct, type StockProduct, type StockSnapshot } from '@/lib/stock';
import { loadStock, saveStock } from '@/lib/stockStorage';
import ProductBarcodeScanner from './ProductBarcodeScanner';
import ProductVisual from './ProductVisual';
import {productGroup,productGroups,matchesProductGroup,type ProductGroup} from '@/lib/productPresentation';
import {ProductGroupGlyph} from './ProductGlyph';
import {chileDate} from '@/lib/validation';

const money = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const field = 'min-h-12 w-full rounded-xl border border-surface-border bg-surface-base px-3 text-on-surface';
const button = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-surface-border px-4 py-2 transition-colors hover:bg-surface-base disabled:opacity-40 disabled:cursor-not-allowed';
const brands = ['AMERICAN TOURISTER','URSUS TROTTER','UNDER ARMOUR','SAMSUNG','MOTOROLA','XIAOMI','HISENSE','MADEMSA','SINDELEN','SKECHERS','BROTHER','THOMAS','AIROLITE','KENDAL','SIEGEN','JANOME','MIDEA','PHILIPS','ELECTROLUX','OSTER','FENSA','APPLE','HONOR','HUAWEI','LENOVO','ASUS','ACER','SONY','LG','HP','GAMA','CAIXUN','XTREM','HEAD','KAYSER'];
function suggestedBrand(p: StockProduct) { return brands.find(b => (` ${p.description.toUpperCase()} `).includes(` ${b} `)) || ''; }
const advice = { sala: 'Preferir sala', verificar: 'Confirmar estado · 1 unidad', consultar_web: 'Consultar alternativa online', incidencia: 'Stock negativo · revisar' };

export default function StockCatalog() {
  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(null);
  const [preview, setPreview] = useState<StockSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [area, setArea] = useState('');
  const [kind,setKind] = useState<ProductGroup|''>('');
  const [allGroups,setAllGroups] = useState(false);
  const [brand, setBrand] = useState('');
  const [availability, setAvailability] = useState('');
  const [sort, setSort] = useState('name');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<StockProduct | null>(null);
  const [scanning, setScanning] = useState(false);
  const [photos,setPhotos] = useState<Record<string,string>>({});
  const [referenceMessage,setReferenceMessage] = useState<Record<string,string>>({});
  const [referenceBusy,setReferenceBusy] = useState('');
  const worker = useRef<Worker | null>(null);
  const mounted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const detail = useRef<HTMLDialogElement>(null);
  const referenceRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    loadStock().then(data => { if (active) setSnapshot(data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; mounted.current = false; worker.current?.terminate(); referenceRequest.current?.abort(); };
  }, []);
  useEffect(() => { if (selected) detail.current?.showModal(); }, [selected]);
  const products = snapshot?.products;
  const groupCounts = useMemo(()=>{
    const counts=new Map<ProductGroup,number>();
    for(const product of products || []) {const group=productGroup(product);counts.set(group,(counts.get(group)||0)+1);}
    return counts;
  },[products]);
  const availableGroups=productGroups.filter(group=>groupCounts.has(group.id));
  const visibleGroups=allGroups ? availableGroups : availableGroups.filter((group,index)=>index<7 || group.id===kind);
  const areas = useMemo(() => [...new Set(products?.map(p => p.area) || [])].sort((a,b) => Number(a)-Number(b)), [products]);
  const availableBrands = useMemo(() => [...new Set(products?.map(suggestedBrand).filter(Boolean) || [])].sort(), [products]);
  const stats = useMemo(() => ({ positive: products?.filter(p => p.available > 0).length || 0, single: products?.filter(p => p.available === 1).length || 0, reduced: products?.filter(p => p.previousPrice !== undefined && p.price < p.previousPrice).length || 0 }), [products]);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLocaleUpperCase('es');
    return (products || []).filter(p => matchesProductGroup(p,kind) && (!area || p.area === area) && (!brand || suggestedBrand(p) === brand) && (!availability || channelAdvice(p.available) === availability) && (!maxPrice || p.price <= Number(maxPrice)) && (!q || `${p.description} ${p.plu} ${p.barcodes.join(' ')} ${p.category}`.toLocaleUpperCase('es').includes(q)))
      .sort((a,b) => sort === 'price' ? a.price-b.price : sort === 'discount' ? ((b.previousPrice ?? b.price)-b.price)-((a.previousPrice ?? a.price)-a.price) : a.description.localeCompare(b.description,'es'));
  }, [products, deferredQuery, area, kind, brand, availability, maxPrice, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length/24));
  const currentPage = Math.min(page, pageCount-1);
  const onCode = useCallback((code: string) => {
    setScanning(false); setQuery(code); setArea(''); setKind(''); setBrand(''); setAvailability(''); setMaxPrice(''); setPage(0);
    const match = findProduct(snapshot?.products || [], code);
    if (match) { setSelected(match); setError(''); }
    else setError(`Código ${code}: sin coincidencia única en esta carga. Revisa el código o busca por nombre.`);
  }, [snapshot]);
  async function importFile(file: File | undefined) {
    if (!file) return;
    setError(''); setPreview(null);
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 20*1024*1024) { setError('Selecciona un XLSX de hasta 20 MB.'); return; }
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      if (!mounted.current) return;
      worker.current?.terminate();
      const reader = new Worker(new URL('../lib/stock.worker.ts', import.meta.url));
      worker.current = reader;
      reader.onmessage = event => { setBusy(false); if (event.data.error) setError(event.data.error); else setPreview(event.data.snapshot); reader.terminate(); worker.current = null; };
      reader.onerror = () => { setBusy(false); setError('No se pudo procesar el archivo. El stock anterior se conserva.'); reader.terminate(); worker.current = null; };
      reader.postMessage({ buffer, name: file.name }, [buffer]);
    } catch { setBusy(false); setError('No se pudo abrir el archivo seleccionado.'); }
    finally { if (fileInput.current) fileInput.current.value = ''; }
  }
  async function confirmImport() {
    if (!preview) return;
    setBusy(true); setError('');
    try { await saveStock(preview); setSnapshot(await loadStock()); setPreview(null); setPage(0); setQuery(''); setArea(''); setKind(''); setBrand(''); setAvailability(''); }
    catch(e) { setError(e instanceof Error ? e.message : 'No se guardó el stock.'); }
    finally { setBusy(false); }
  }
  async function loadReference(plu:string) {
    referenceRequest.current?.abort();
    const controller=new AbortController(); referenceRequest.current=controller;
    setReferenceBusy(plu);
    try {
      const response=await fetch(`/api/product-reference?plu=${encodeURIComponent(plu)}`,{signal:controller.signal});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || 'No se pudo consultar la foto.');
      if(mounted.current) { setPhotos(prev=>({...prev,[plu]:data.image})); setReferenceMessage(prev=>({...prev,[plu]:'Foto de referencia de ABC. Comprueba modelo y variante antes de vender.'})); }
    } catch(e) { if(!controller.signal.aborted && mounted.current) setReferenceMessage(prev=>({...prev,[plu]:e instanceof Error?e.message:'No se pudo consultar ABC.'})); }
    finally { if(!controller.signal.aborted && mounted.current) setReferenceBusy(''); }
  }
  return <div className="space-y-6 pb-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-secondary font-semibold mb-1">HERRAMIENTAS DE SALA</p><h1 className="text-3xl font-semibold tracking-tight">Catálogo y stock</h1><p className="mt-2 text-on-surface-variant max-w-xl">Encuentra el producto, confirma sus unidades y decide cómo ofrecerlo.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className={button}><Upload size={20} aria-hidden="true" />Cargar Excel</button><input ref={fileInput} type="file" accept=".xlsx" aria-label="Archivo de stock XLSX" className="sr-only" onChange={e => void importFile(e.target.files?.[0])} /></div></header>
    <p className="text-sm text-on-surface-variant">Stock guardado solo en este navegador. No se envía el archivo ni el costo interno a un servidor.</p>
    {error && <div role="alert" className="rounded-xl border border-error/40 bg-error/10 p-4 flex gap-3"><AlertTriangle className="shrink-0" aria-hidden="true" /><p>{error}</p></div>}
    {busy && <p role="status" className="rounded-xl border border-surface-border p-4 animate-pulse">Procesando stock… Puedes seguir usando el resto de la aplicación.</p>}
    {preview && <section aria-labelledby="preview-title" className="rounded-3xl border border-secondary/40 bg-secondary/5 p-5 space-y-4"><h2 id="preview-title" className="text-xl font-semibold">Revisar carga antes de guardar</h2>{preview.warnings?.map(warning => <p key={warning} role="status" className="rounded-xl bg-surface-base p-3 text-sm">{warning}</p>)}<p>{preview.store || 'Tienda sin identificar'} · {preview.date} · {preview.products.length.toLocaleString('es-CL')} productos únicos</p><p className="text-sm text-on-surface-variant">{preview.products.filter(p => p.available < 0).length.toLocaleString('es-CL')} productos con stock negativo. Los códigos alternativos se agruparon sin sumar existencias.</p>{snapshot && <p className="text-sm">Sustituirá la vista actual del {snapshot.date}. Se conserva la carga previa para comparar precios. La fecha debe ser igual o posterior y la tienda debe coincidir.</p>}<div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => void confirmImport()} className={`${button} bg-secondary/15 text-secondary`}>Guardar este stock</button><button disabled={busy} onClick={() => setPreview(null)} className={button}>Cancelar</button></div></section>}
    {!snapshot && !busy && !preview && <section className="rounded-3xl border border-dashed border-surface-border p-8 text-center"><Package size={48} aria-hidden="true" className="mx-auto text-secondary mb-4" /><h2 className="text-xl font-semibold mb-2">Tu sala de ventas, en una búsqueda</h2><p className="text-on-surface-variant max-w-lg mx-auto">Carga el informe XLSX original. No necesitas ordenar columnas ni quitar encabezados. Después podrás buscar por nombre, PLU o código de barras.</p><button onClick={() => fileInput.current?.click()} className={`${button} mt-6`}>Elegir archivo de stock</button></section>}
    {snapshot && <>
      {snapshot.warnings?.map(warning=><p key={warning} role="status" className="rounded-2xl border border-surface-border bg-surface-elevated p-4 text-sm">{warning}</p>)}
      {snapshot.date !== chileDate() && <p role="status" className="rounded-2xl border border-secondary/30 bg-secondary/5 p-4 text-sm"><strong>Este stock no corresponde a hoy.</strong> El informe es del {snapshot.date}. Carga el archivo del día o confirma las unidades antes de ofrecerlas.</p>}
      <section aria-labelledby="sales-assistant-title" className="rounded-3xl border border-secondary/40 bg-secondary/5 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5">
        <div className="flex-1"><p className="text-xs tracking-wider text-secondary font-semibold mb-2">VENTA EN SALA</p><h2 id="sales-assistant-title" className="text-2xl font-semibold">Asistente de venta</h2><p className="mt-2 text-on-surface-variant">Escanea un artículo y consulta sus unidades, precio y referencia en ABC.</p></div>
        <button type="button" disabled={busy} onClick={() => setScanning(true)} className="w-full lg:w-auto lg:min-w-72 min-h-20 rounded-3xl bg-secondary text-on-secondary px-5 py-4 flex items-center justify-center gap-4 font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-40"><Camera size={32} className="shrink-0" aria-hidden="true" /><span className="text-left">Escanear producto<span className="block text-sm font-normal">para vender</span></span></button>
      </section>
      <section aria-label="Tipos de producto" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Explorar por tipo</h2><p className="text-xs text-on-surface-variant">Cantidades de la carga completa</p></div>
        <div id="product-type-groups" role="group" aria-label="Filtrar por tipo de producto" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">{[{id:'' as const,label:'Todo'},...visibleGroups].map(({id,label})=><button type="button" key={id} aria-pressed={kind===id} onClick={()=>{setKind(id);setArea('');setQuery('');setBrand('');setAvailability('');setMaxPrice('');setPage(0);}} className={`min-h-14 min-w-0 flex items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition-colors hover:opacity-90 ${kind===id?'bg-secondary text-on-secondary border-transparent':'bg-surface-elevated text-on-surface border-surface-border'}`}><ProductGroupGlyph group={id}/><span className="min-w-0 flex-1 break-words">{label}</span><span className="text-xs tabular-nums opacity-75">{(id ? groupCounts.get(id)||0 : products?.length||0).toLocaleString('es-CL')}</span></button>)}</div>
        {availableGroups.length>7 && <button type="button" aria-expanded={allGroups} aria-controls="product-type-groups" onClick={()=>setAllGroups(value=>!value)} className={`${button} w-full sm:w-auto text-secondary`}>{allGroups?<ChevronUp size={18} aria-hidden="true"/>:<ChevronDown size={18} aria-hidden="true"/>}{allGroups?'Ver menos categorías':`Ver todas las categorías (${availableGroups.length})`}</button>}
      </section>
      <section aria-label="Resumen del stock" className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['Productos',snapshot.products.length],['Con disponibilidad',stats.positive],['Una unidad · revisar',stats.single],['Bajaron de precio',stats.reduced]].map(([label,value]) => <div key={label} className="rounded-3xl border border-surface-border bg-surface-elevated p-4"><p className="text-sm text-on-surface-variant">{label}</p><p className="text-2xl font-semibold mt-2 tabular-nums">{Number(value).toLocaleString('es-CL')}</p></div>)}</section>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-on-surface-variant"><p>{snapshot.store} · Informe del <strong className="text-on-surface">{snapshot.date}</strong></p><p>Disponibilidad según el informe; confirma antes de vender.</p></div>
      <section aria-label="Buscar y filtrar productos" className="rounded-3xl border border-surface-border bg-surface-elevated p-4 space-y-4"><form onSubmit={e => { e.preventDefault(); onCode(query); }} className="flex flex-wrap gap-2"><label className="flex-1 min-w-0"><span className="block text-sm font-medium mb-2">Nombre, PLU o código de barras</span><span className="relative block"><Search size={20} aria-hidden="true" className="absolute left-3 top-4 text-on-surface-variant" /><input className={`${field} pl-10`} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Busca entre tus productos…" /></span></label><button type="submit" className={`${button} self-end`} aria-label="Buscar código exacto"><Barcode aria-hidden="true" size={20} /></button></form>
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3"><label className="text-sm">Área<select className={`${field} mt-2`} value={area} onChange={e => { setArea(e.target.value); setPage(0); }}><option value="">Todas las áreas</option>{areas.map(a => <option key={a} value={a}>Área {a}</option>)}</select></label><label className="text-sm">Marca orientativa<select className={`${field} mt-2`} value={brand} onChange={e => { setBrand(e.target.value); setPage(0); }}><option value="">Todas las marcas</option>{availableBrands.map(b => <option key={b}>{b}</option>)}</select></label><label className="text-sm">Dónde ofrecer<select className={`${field} mt-2`} value={availability} onChange={e => { setAvailability(e.target.value); setPage(0); }}><option value="">Todo el stock</option>{Object.entries(advice).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">Precio máximo<input className={`${field} mt-2`} type="number" min="0" step="1" value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(0); }} placeholder="Sin límite" /></label><label className="text-sm col-span-2 xl:col-span-1">Ordenar<select className={`${field} mt-2`} value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="name">Nombre</option><option value="price">Menor precio</option><option value="discount">Mayor baja entre cargas</option></select></label></div><p className="text-xs text-on-surface-variant">La marca se identifica por coincidencias en la descripción. Confírmala en la ficha de ABC.</p></section>
      <p role="status" className="text-sm text-on-surface-variant">{filtered.length.toLocaleString('es-CL')} resultados · Página {currentPage+1} de {pageCount}</p>
      <ul aria-label="Productos del stock" className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">{filtered.slice(currentPage*24,currentPage*24+24).map(p => <li key={p.plu}><button type="button" onClick={() => setSelected(p)} className="w-full h-full text-left rounded-3xl border border-surface-border bg-surface-elevated p-5 hover:border-secondary/60 transition-colors space-y-4"><div className="flex gap-3"><ProductVisual key={`${p.plu}-${photos[p.plu] || "icon"}`} product={p} image={photos[p.plu]} /><div className="min-w-0"><p className="text-xs text-on-surface-variant mb-1">Área {p.area} · PLU {p.plu}</p><h2 className="font-semibold break-words">{p.description}</h2><p className="text-sm text-on-surface-variant mt-1">{suggestedBrand(p) || 'Marca por confirmar'}</p></div></div><div className="flex items-end justify-between gap-3"><div><p className="text-xs text-on-surface-variant">Precio del listado</p><p className="text-2xl font-semibold tabular-nums">{p.price ? money(p.price) : 'Sin precio'}</p></div><p className="text-sm text-right"><strong className="block text-xl tabular-nums">{p.available}</strong>disponibles</p></div><p className={`text-sm rounded-lg px-3 py-2 ${p.available >= 2 ? 'bg-secondary/10 text-secondary' : 'bg-surface-base text-on-surface'}`}>{advice[channelAdvice(p.available)]}</p>{p.previousPrice !== undefined && p.price < p.previousPrice && <p className="text-secondary text-sm flex items-center gap-2"><TrendingDown size={18} aria-hidden="true" />Bajó {money(p.previousPrice-p.price)} respecto a la carga anterior</p>}</button></li>)}</ul>
      {!filtered.length && <p className="text-center p-8 text-on-surface-variant">Sin coincidencias. Prueba otro nombre o cambia los filtros.</p>}
      <nav aria-label="Páginas del catálogo" className="flex items-center justify-center gap-4"><button className={button} disabled={currentPage===0} onClick={() => setPage(currentPage-1)}><ChevronLeft size={18} aria-hidden="true" />Anterior</button><span className="text-sm">{currentPage+1} / {pageCount}</span><button className={button} disabled={currentPage===pageCount-1} onClick={() => setPage(currentPage+1)}>Siguiente<ChevronRight size={18} aria-hidden="true" /></button></nav>
    </>}
    {selected && <dialog ref={detail} onCancel={() => setSelected(null)} className="m-auto w-[calc(100%-2rem)] max-w-xl max-h-[85dvh] overflow-y-auto rounded-3xl border border-surface-border bg-surface-elevated p-5 text-on-surface backdrop:bg-black/70" aria-labelledby="product-title"><div className="flex justify-between items-start gap-3"><h2 id="product-title" className="text-xl font-semibold break-words">{selected.description}</h2><button type="button" className={`${button} shrink-0 px-3`} aria-label="Cerrar ficha" onClick={() => setSelected(null)}><X aria-hidden="true" /></button></div><ProductVisual key={`${selected.plu}-${photos[selected.plu] || "icon"}`} product={selected} image={photos[selected.plu]} large /><p className="mt-2 text-sm text-on-surface-variant">PLU {selected.plu} · {selected.category}</p><dl className="grid grid-cols-2 gap-4 my-6">{[['Disponibles',selected.available],['Existencia física',selected.existence ?? 'No incluida en el archivo'],['Precio del listado',selected.price ? money(selected.price) : 'Sin confirmar'],['Marca orientativa',suggestedBrand(selected) || 'Por confirmar'],['Área',selected.area],['Fecha del stock',snapshot?.date]].map(([label,value]) => <div key={label}><dt className="text-sm text-on-surface-variant">{label}</dt><dd className="font-semibold mt-1">{value}</dd></div>)}</dl><p className="rounded-xl bg-surface-base p-4 mb-4">{advice[channelAdvice(selected.available)]}. {selected.available === 1 ? 'Confirma si está sellado, en exhibición o corresponde a una devolución.' : 'Confirma las unidades y su estado antes de ofrecerlo.'}</p><p className="text-sm text-on-surface-variant mb-4">Referencia basada en la descripción del Excel. Características completas, precio web, precio con tarjeta y garantía: pendientes de verificar en ABC. La existencia online es independiente.</p><button type="button" disabled={referenceBusy === selected.plu} onClick={() => void loadReference(selected.plu)} className={`${button} w-full mb-3`}>{referenceBusy === selected.plu ? "Consultando ABC…" : "Obtener foto de referencia de ABC"}</button>{referenceMessage[selected.plu] && <p role="status" className="text-sm text-on-surface-variant mb-3">{referenceMessage[selected.plu]}</p>}<a href={`https://www.abc.cl/${encodeURIComponent(selected.plu)}.html`} target="_blank" rel="noopener noreferrer" className={`${button} w-full text-secondary`}><ExternalLink size={18} aria-hidden="true" />Consultar ficha en ABC</a><p className="text-xs text-on-surface-variant mt-3">Enlace construido con el PLU del informe; puede no existir una ficha online. Códigos: {selected.barcodes.join(', ')}</p></dialog>}
    {scanning && <ProductBarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />}
  </div>;
}
