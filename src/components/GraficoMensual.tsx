'use client';

import Icon from '@/components/Icon';
import { useMemo } from 'react';
import { Venta } from '@/types/venta';
import { chileDate } from '@/lib/validation';

interface GraficoMensualProps {
  ventas: Venta[];
}

export default function GraficoMensual({ ventas }: GraficoMensualProps) {
  const { dias, ventasPorDia, maxVenta } = useMemo(() => {
    const ventasPorDia: Record<string, number> = {};
    const dias: { full: string; display: string }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(`${chileDate()}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = chileDate(d);
      const displayStr = Number(dateStr.slice(8, 10)) + '/' + Number(dateStr.slice(5, 7));
      dias.push({ full: dateStr, display: displayStr });
      ventasPorDia[dateStr] = 0;
    }

    ventas.forEach(v => {
      if (v.fecha_compra && ventasPorDia[v.fecha_compra] !== undefined) {
        ventasPorDia[v.fecha_compra] += (v.comision_calculada || 0);
      }
    });

    const maxVenta = Math.max(...Object.values(ventasPorDia), 1000);
    return { dias, ventasPorDia, maxVenta };
  }, [ventas]);

  return (
    <div className="h-full flex flex-col">
      <h3 className="font-headline-sm text-headline-sm text-on-surface mb-6">Comisiones — Últimos 7 Días</h3>

      {ventas.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 min-h-[160px] opacity-70">
          <Icon className=" text-[48px] text-primary/40 mb-2">trending_up</Icon>
          <p className="font-label-md text-label-md text-on-surface-variant">Sin comisiones esta semana.</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">¡Registra tu primera boleta!</p>
        </div>
      ) : (
        <div className="flex items-end gap-2 h-40 mt-auto">
          {dias.map(dia => {
            const valor = ventasPorDia[dia.full];
            const height = Math.max(4, (valor / maxVenta) * 100);
            const isToday = dia.full === chileDate();

            return (
              <div key={dia.full} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                {/* Etiqueta siempre visible para valores > 0 */}
                {valor > 0 && (
                  <span className="font-label-sm text-[9px] text-on-surface-variant mb-1">
                    ${valor >= 1000 ? (valor/1000).toFixed(0) + 'k' : valor}
                  </span>
                )}
                
                {/* Tooltip */}
                <div className="hidden group-hover:flex absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-container border border-white/10 text-on-surface font-label-sm text-label-sm px-2 py-1 rounded-lg whitespace-nowrap z-10 shadow-xl">
                  {new Date(dia.full + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}: ${valor.toLocaleString('es-CL')}
                </div>

                <div className="w-full flex items-end relative" style={{ height: 'calc(100% - 24px)' }}>
                  <div
                    className={
                      'w-full rounded-t-sm transition-all duration-700 absolute bottom-0 ' +
                      (isToday
                        ? 'bg-gradient-to-t from-secondary-container to-secondary shadow-[0_0_10px_rgba(78,222,163,0.5)]'
                        : 'bg-primary/40 group-hover:bg-primary/70')
                    }
                    style={{ height: height + '%' }}
                  />
                </div>
                <span className={
                  'text-[10px] mt-1 ' +
                  (isToday ? 'text-secondary font-semibold' : 'text-on-surface-variant')
                }>
                  {dia.display}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
