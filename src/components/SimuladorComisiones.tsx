'use client';

import Icon from '@/components/Icon';
import { useState } from 'react';
import { useStoredString } from '@/hooks/useStoredString';
import { chileDate } from '@/lib/validation';
import { Venta } from '@/types/venta';
import { comisionTelefonia, comisionLineasDuras } from '@/lib/commissions';

export default function SimuladorComisiones({ ventas }: { ventas: Venta[] }) {
  const [modo, setModo] = useState<'A' | 'B'>('A');
  const [tipo, setTipo] = useState<'telefonia' | 'lineas_duras'>('telefonia');
  const [valorGarantia, setValorGarantia] = useState(50000);
  const [anos, setAnos] = useState(1);
  const [cantidad, setCantidad] = useState(1);

  const currentMonth = chileDate().slice(0, 7);
  const storedMeta = useStoredString(`trackretail_meta_${currentMonth}`);
  const meta = Number(storedMeta) > 0 ? Number(storedMeta) : 150000;

  const totalComisiones = ventas.reduce((acc, v) => acc + (v.comision_calculada || 0), 0);

  // Cálculo Modo A
  const comisionUnitaria = tipo === 'telefonia' ? comisionTelefonia(valorGarantia, anos) : comisionLineasDuras(valorGarantia, anos);
  const comisionTotalSimulada = comisionUnitaria * cantidad;

  // Cálculo Modo B
  const falta = Math.max(0, meta - totalComisiones);

  return (
    <div className="glass-panel rounded-xl p-6 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
            <Icon className=" text-primary">calculate</Icon>
            Simulador Inteligente
          </h3>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
            Estima tus ganancias con la tabla de comisiones configurada.
          </p>
        </div>

        <div className="flex bg-surface-container rounded-lg p-1">
          <button
            className={`px-3 py-1.5 rounded-md font-label-sm text-label-sm transition-all ${modo === 'A' ? 'bg-primary/20 text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setModo('A')}
          >
            Proyectar Venta
          </button>
          <button
            className={`px-3 py-1.5 rounded-md font-label-sm text-label-sm transition-all ${modo === 'B' ? 'bg-secondary/20 text-secondary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setModo('B')}
          >
            Alcanzar Meta
          </button>
        </div>
      </div>

      {modo === 'A' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-4">
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">Tipo de Garantía</label>
              <div className="flex gap-2">
                <button
                  className={`flex-1 py-2 rounded-lg border font-label-md text-label-md transition-colors ${tipo === 'telefonia' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-transparent border-white/10 text-on-surface-variant hover:bg-white/5'}`}
                  onClick={() => { setTipo('telefonia'); if(anos > 2) setAnos(2); }}
                >
                  Telefonía
                </button>
                <button
                  className={`flex-1 py-2 rounded-lg border font-label-md text-label-md transition-colors ${tipo === 'lineas_duras' ? 'bg-tertiary/10 border-tertiary/30 text-tertiary' : 'bg-transparent border-white/10 text-on-surface-variant hover:bg-white/5'}`}
                  onClick={() => setTipo('lineas_duras')}
                >
                  Líneas Duras
                </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="font-label-sm text-label-sm text-on-surface-variant">Valor de la Garantía</label>
                <span className="font-label-md text-label-md text-on-surface font-semibold">${valorGarantia.toLocaleString('es-CL')}</span>
              </div>
              <input
                aria-label="Valor de la garantía"
                type="range" min="4000" max="300000" step="1000"
                value={valorGarantia} onChange={e => setValorGarantia(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">Años</label>
                <select
                  aria-label="Años de garantía simulados"
                  value={anos} onChange={e => setAnos(Number(e.target.value))}
                  className="w-full bg-surface-container border border-white/10 text-on-surface font-label-md text-label-md p-2 rounded-lg outline-none"
                >
                  <option value={1}>1 Año</option>
                  <option value={2}>2 Años</option>
                  {tipo === 'lineas_duras' && <option value={3}>3 Años</option>}
                  {tipo === 'lineas_duras' && <option value={4}>4 Años</option>}
                </select>
              </div>
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">Cantidad</label>
                <input
                  aria-label="Cantidad de garantías simuladas"
                  type="number" min="1" max="100" step="1"
                  value={cantidad} onChange={e => setCantidad(Math.max(1, Math.min(100, Math.floor(Number(e.target.value)) || 1)))}
                  className="w-full bg-surface-container border border-white/10 text-on-surface font-label-md text-label-md p-2 rounded-lg outline-none text-center"
                />
              </div>
            </div>
          </div>

          <div className="bg-black/20 rounded-xl p-6 flex flex-col justify-center border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Icon className=" text-[100px]">monetization_on</Icon>
            </div>
            <p className="font-label-md text-label-md text-on-surface-variant mb-1 relative z-10">Ganancia Proyectada</p>
            <p className="font-display-md text-display-md text-primary drop-shadow-[0_0_15px_rgba(77,142,255,0.3)] relative z-10">
              ${comisionTotalSimulada.toLocaleString('es-CL')}
            </p>

            <div className="mt-4 pt-4 border-t border-white/10 relative z-10 flex justify-between items-center">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Comisión Unitaria:</span>
              <span className="font-label-md text-label-md text-on-surface font-medium">${comisionUnitaria.toLocaleString('es-CL')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-secondary/10 border border-secondary/20">
            <div>
              <p className="font-label-sm text-label-sm text-secondary">Brecha para Meta (${meta.toLocaleString('es-CL')})</p>
              <p className="font-headline-md text-headline-md text-on-surface">Faltan ${falta.toLocaleString('es-CL')}</p>
            </div>
            {falta === 0 && (
              <div className="px-4 py-2 bg-secondary text-on-secondary font-label-md text-label-md rounded-lg shadow-[0_0_10px_rgba(78,222,163,0.4)]">
                ¡Meta lograda! 🎉
              </div>
            )}
          </div>

          {falta > 0 && (
            <div>
              <p className="font-label-md text-label-md text-on-surface-variant mb-4">Puedes llegar a tu meta vendiendo aproximadamente:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-surface-container rounded-lg p-3 border border-white/5">
                  <p className="font-headline-md text-headline-md text-on-surface">{Math.ceil(falta / 9900)}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant leading-tight">Garantías Telefonía<br/>(Tramo 5 / 2 Años)</p>
                </div>
                <div className="bg-surface-container rounded-lg p-3 border border-white/5">
                  <p className="font-headline-md text-headline-md text-on-surface">{Math.ceil(falta / 6000)}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant leading-tight">Garantías L. Duras<br/>(Tramo 4 / 2 Años)</p>
                </div>
                <div className="bg-surface-container rounded-lg p-3 border border-white/5">
                  <p className="font-headline-md text-headline-md text-on-surface">{Math.ceil(falta / 2400)}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant leading-tight">Garantías Mixtas<br/>(Tramo Medio)</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
