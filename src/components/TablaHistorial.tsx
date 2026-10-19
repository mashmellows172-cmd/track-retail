'use client';

import { Venta } from '@/types/venta';

interface TablaHistorialProps {
  ventas: Venta[];
}

export default function TablaHistorial({ ventas }: TablaHistorialProps) {
  const exportarExcel = async () => {
    // Dynamic import: solo carga ~500KB de XLSX cuando el usuario lo necesita
    const XLSX = await import('xlsx');
    const datosExportar = ventas.map(v => ({
      'Fecha': v.fecha_compra,
      'Folio': v.folio,
      'Canal': v.canal === 'caja' ? 'Tienda' : 'Internet',
      'Tipo Garantía': v.tipo_garantia === 'telefonia' ? 'Telefonía' : 'Líneas Duras',
      'Años Garantía': v.anos_garantia,
      'Precio Base ($)': v.precio_producto,
      'Valor Garantía ($)': v.valor_garantia,
      'Total Boleta ($)': v.total_boleta,
      'Nº Pedido': v.numero_pedido || 'N/A',
      'Comisión Generada ($)': v.comision_calculada,
    }));
    const ws = XLSX.utils.json_to_sheet(datosExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
    XLSX.writeFile(wb, 'Comisiones_BryanApp_' + new Date().toISOString().split('T')[0] + '.xlsx');
  };


  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-white/5 flex justify-between items-center">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Registro Detallado</h3>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">{ventas.length} registros encontrados</p>
        </div>
        <button
          onClick={exportarExcel}
          disabled={ventas.length === 0}
          className="flex items-center gap-2 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary px-4 py-2 rounded-xl font-label-md text-label-md hover:scale-[1.02] transition-all shadow-[0_0_12px_rgba(78,222,163,0.25)] disabled:opacity-40 disabled:scale-100"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Exportar Excel
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
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
            {ventas.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-on-surface-variant font-body-md text-body-md">
                  No hay ventas registradas en este período.
                </td>
              </tr>
            ) : (
              ventas.map((venta, idx) => (
                <tr key={venta.id || idx} className="hover:bg-white/5 transition-colors group">
                  <td className="p-4 font-label-md text-label-md text-on-surface-variant">{venta.fecha_compra}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded bg-surface-variant flex items-center justify-center text-on-surface-variant group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[14px]">receipt</span>
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
                    <p className="font-label-sm text-label-sm text-on-surface-variant/70">
                      {venta.tipo_garantia === 'telefonia' ? 'Telefonía' : 'L. Duras'}
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
    </div>
  );
}
