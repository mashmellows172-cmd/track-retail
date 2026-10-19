'use client';

import { Venta } from '@/types/venta';

interface GraficoDistribucionProps {
  ventas: Venta[];
}

export default function GraficoDistribucion({ ventas }: GraficoDistribucionProps) {
  let telefonia = 0;
  let lineasDuras = 0;

  ventas.forEach(v => {
    if (v.tipo_garantia === 'telefonia') telefonia += v.comision_calculada || 0;
    else if (v.tipo_garantia === 'lineas_duras') lineasDuras += v.comision_calculada || 0;
  });

  const total = telefonia + lineasDuras;
  const telefoniaPct = total > 0 ? Math.round((telefonia / total) * 100) : 0;
  const lineasDurasPct = total > 0 ? 100 - telefoniaPct : 0;

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col justify-center">
      <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4">Distribución por Tipo</h3>
      
      {total === 0 ? (
        <div className="text-center py-4 opacity-70">
          <p className="font-label-md text-label-md text-on-surface-variant">No hay datos aún.</p>
        </div>
      ) : (
        <>
          {/* Barra de Progreso Doble */}
          <div className="w-full h-3 rounded-full overflow-hidden flex bg-surface-container mb-4">
            <div 
              className="bg-secondary transition-all duration-1000"
              style={{ width: `${telefoniaPct}%` }}
              title={`Telefonía: ${telefoniaPct}%`}
            />
            <div 
              className="bg-tertiary transition-all duration-1000"
              style={{ width: `${lineasDurasPct}%` }}
              title={`Líneas Duras: ${lineasDurasPct}%`}
            />
          </div>

          {/* Leyenda */}
          <div className="flex justify-between font-label-sm text-label-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <div className="w-2 h-2 rounded-full bg-secondary"></div>
                Telefonía
              </div>
              <span className="text-on-surface font-semibold text-label-md ml-3.5">
                ${telefonia.toLocaleString('es-CL')} <span className="text-on-surface-variant font-normal">({telefoniaPct}%)</span>
              </span>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <div className="w-2 h-2 rounded-full bg-tertiary"></div>
                L. Duras
              </div>
              <span className="text-on-surface font-semibold text-label-md mr-3.5">
                ${lineasDuras.toLocaleString('es-CL')} <span className="text-on-surface-variant font-normal">({lineasDurasPct}%)</span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
