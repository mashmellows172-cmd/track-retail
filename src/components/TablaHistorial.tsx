'use client';

import Icon from '@/components/Icon';
import { useState } from 'react';
import { LayoutGrid, List, Smartphone, Package, Layers } from 'lucide-react';
import { useStoredString, storeString } from '@/hooks/useStoredString';
import { filterSales, type ProductArea } from '@/lib/history';
import { Venta } from '@/types/venta';
import { chileDate } from '@/lib/validation';

interface TablaHistorialProps {
  ventas: Venta[];
}

export default function TablaHistorial({ ventas }: TablaHistorialProps) {
  const storedView = useStoredString('trackretail_history_view');
  const [sessionView, setSessionView] = useState<'grid' | 'list' | null>(null);
  const view = sessionView ?? (storedView === 'list' ? 'list' : 'grid');
  const [area, setArea] = useState<ProductArea>('all');
  const visibleSales = filterSales(ventas, area);
  const chooseView = (next: 'grid' | 'list') => {
    setSessionView(next);
    try { storeString('trackretail_history_view', next); } catch { /* The view still changes when storage is unavailable. */ }
  };
  const areas = [
    { id: 'all' as const, label: 'Todas', icon: Layers },
    { id: 'telefonia' as const, label: 'Telefonía', icon: Smartphone },
    { id: 'lineas_duras' as const, label: 'Líneas Duras', icon: Package },
  ];
  const exportarExcel = async () => {
    // Dynamic import: solo carga ~500KB de XLSX cuando el usuario lo necesita
    const XLSX = await import('xlsx');
    const datosExportar = visibleSales.map(v => ({
      'Fecha': v.fecha_compra,
      'Folio': v.folio,
      'Canal': v.canal === 'caja' ? 'Tienda' : 'Internet',
      'Tipo Garantía': v.tipo_garantia === 'telefonia' ? 'Telefonía' : v.tipo_garantia === 'lineas_duras' ? 'Líneas Duras' : 'General',
      'Años Garantía': v.anos_garantia,
      'Precio Base ($)': v.precio_producto,
      'Unidades': v.cantidad_unidades,
      'Valor Garantía ($)': v.valor_garantia,
      'Total Boleta ($)': v.total_boleta,
      'Nº Pedido': v.numero_pedido || 'N/A',
      'Comisión Generada ($)': v.comision_calculada,
    }));
    const ws = XLSX.utils.json_to_sheet(datosExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
    XLSX.writeFile(wb, 'Comisiones_BryanApp_' + chileDate() + '.xlsx');
  };


  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-surface-border flex flex-col sm:flex-row gap-4 justify-between sm:items-center">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Registro Detallado</h3>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">{visibleSales.length} de {ventas.length} registros</p>
        </div>
        <button
          onClick={exportarExcel}
          disabled={visibleSales.length === 0}
          className="flex items-center gap-2 bg-secondary text-on-secondary px-4 py-2 rounded-xl font-label-md text-label-md hover:scale-[1.02] transition-all shadow-[0_0_12px_rgba(78,222,163,0.25)] disabled:opacity-40 disabled:scale-100"
        >
          <Icon className=" text-[18px]">download</Icon>
          Exportar Excel
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4 border-b border-surface-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-on-surface-variant">Vista del historial</p>
          <div role="group" aria-label="Vista del historial" className="flex gap-1 p-1 rounded-xl bg-surface-base border border-surface-border">
            <button type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')} className={`min-h-11 flex items-center gap-2 px-3 rounded-lg ${view === 'list' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'}`}><List size={18} aria-hidden="true" /> Lista</button>
            <button type="button" aria-pressed={view === 'grid'} onClick={() => chooseView('grid')} className={`min-h-11 flex items-center gap-2 px-3 rounded-lg ${view === 'grid' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'}`}><LayoutGrid size={18} aria-hidden="true" /> Mosaico</button>
          </div>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold mb-2">Área de producto</legend>
          <div className="flex flex-wrap gap-2">
            {areas.map(({ id, label, icon: Glyph }) => <button key={id} type="button" aria-pressed={area === id} onClick={() => setArea(id)} className={`min-h-11 flex items-center gap-2 px-4 py-2 rounded-xl border ${area === id ? 'border-secondary bg-secondary/10 text-secondary' : 'border-surface-border text-on-surface-variant hover:bg-surface-base'}`}><Glyph size={18} aria-hidden="true" />{label}<span className="text-xs">({filterSales(ventas, id).length})</span></button>)}
          </div>
        </fieldset>
        <p role="status" className="text-sm text-on-surface-variant">{visibleSales.length} registro(s) visibles</p>
      </div>

      {view === 'grid' ? <>
        {visibleSales.length === 0 ? <p className="p-8 text-center text-on-surface-variant">No hay ventas en esta área y período.</p> : <ul aria-label="Ventas en mosaico" className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4 p-4">
          {visibleSales.map((venta, index) => <li key={venta.id || index} className="min-w-0 rounded-xl border border-surface-border bg-surface-base p-4">
            <article>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0"><ProductIcon type={venta.tipo_garantia} /></div>
                <div className="min-w-0"><h4 className="font-semibold break-all">Boleta {venta.folio}</h4><p className="text-sm text-on-surface-variant">{venta.fecha_compra}</p></div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-on-surface-variant">Área</dt><dd>{venta.tipo_garantia === 'telefonia' ? 'Telefonía' : venta.tipo_garantia === 'lineas_duras' ? 'Líneas Duras' : 'General'}</dd></div>
                <div><dt className="text-on-surface-variant">Canal</dt><dd>{venta.canal === 'internet' ? 'Internet' : 'Tienda'}</dd></div>
                <div><dt className="text-on-surface-variant">Garantía</dt><dd>{venta.anos_garantia} año(s) · ${(venta.valor_garantia ?? 0).toLocaleString('es-CL')}</dd></div>
                <div><dt className="text-on-surface-variant">Comisión</dt><dd className="font-semibold text-secondary">${(venta.comision_calculada ?? 0).toLocaleString('es-CL')}</dd></div>
              </dl>
            </article>
          </li>)}
        </ul>}
      </> : <>
      {/* Table */}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Historial de ventas, desplaza horizontalmente para ver todas las columnas">
        <table className="w-full min-w-[640px] text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-black/20">
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Fecha</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Folio</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Canal</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Garantía</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Valor</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Comisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visibleSales.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-on-surface-variant font-body-md text-body-md">
                  No hay ventas registradas en este período.
                </td>
              </tr>
            ) : (
              visibleSales.map((venta, idx) => (
                <tr key={venta.id || idx} className="hover:bg-white/5 transition-colors group">
                  <td className="p-4 font-label-md text-label-md text-on-surface-variant">{venta.fecha_compra}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded bg-surface-variant flex items-center justify-center text-on-surface-variant group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                        <ProductIcon type={venta.tipo_garantia} />
                      </div>
                      <span className="font-label-md text-label-md text-on-surface">{venta.folio}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={
                      'inline-flex items-center gap-1 font-label-sm text-label-sm px-2.5 py-1 rounded-full border ' +
                      (venta.canal === 'caja'
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'bg-tertiary/10 text-tertiary border-tertiary/20')
                    }>
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {venta.canal === 'caja' ? 'Tienda' : 'Internet'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="font-label-md text-label-md text-on-surface">
                      {venta.anos_garantia} {venta.anos_garantia === 1 ? 'año' : 'años'}
                    </span>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      {venta.tipo_garantia === 'telefonia' ? 'Telefonía' : venta.tipo_garantia === 'lineas_duras' ? 'L. Duras' : 'General'}
                    </p>
                  </td>
                  <td className="p-4 font-label-md text-label-md text-on-surface">
                    ${venta.valor_garantia?.toLocaleString('es-CL')}
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1 font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/20 shadow-[0_0_8px_rgba(78,222,163,0.2)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                      ${venta.comision_calculada?.toLocaleString('es-CL')}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
}

function ProductIcon({ type }: { type: Venta['tipo_garantia'] }) {
  const Glyph = type === 'telefonia' ? Smartphone : Package;
  return <Glyph size={24} aria-hidden="true" />;
}
