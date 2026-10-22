'use client';

import Icon from '@/components/Icon';
import { useEffect, useState } from 'react';
import TablaHistorial from '@/components/TablaHistorial';
import { Venta } from '@/types/venta';
import { Loader2 } from 'lucide-react';
import { useStoredString } from '@/hooks/useStoredString';
import { chileDate } from '@/lib/validation';

export default function HistorialPage() {
  const vendedor = useStoredString('trackretail_vendedor');
  return <SellerHistory key={vendedor || ''} vendedor={vendedor} />;
}

function SellerHistory({ vendedor }: { vendedor: string | null }) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const dateObj = new Date(`${chileDate()}T12:00:00Z`);
  const [selectedYear, setSelectedYear] = useState(dateObj.getUTCFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((dateObj.getUTCMonth() + 1).toString().padStart(2, '0'));

  const mesFiltro = `${selectedYear}-${selectedMonth}`;

  useEffect(() => {
    if (vendedor === undefined) return; // still loading localStorage

    if (!vendedor) return;

    const controller = new AbortController();

    const fetchVentas = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/ventas?vendedor_id=${encodeURIComponent(vendedor)}&mes=${mesFiltro}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${res.status}`);
        }
        const data = await res.json();
        setVentas(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Error cargando datos');
        setVentas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVentas();
    return () => controller.abort();
  }, [mesFiltro, vendedor]);

  return (
    <div className="w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-8 border-b border-surface-border mb-8 gap-4">
        <div>
          <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface">
            Historial de Ventas
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-2">
            Revisa y exporta tus ventas de garantías registradas.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-label-sm text-label-sm text-on-surface-variant">Filtrar por mes</label>
          <div className="flex items-center gap-2">
            <select
              aria-label="Mes"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-surface-elevated border border-surface-border text-on-surface font-label-md text-label-md p-2.5 rounded-xl outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={(i + 1).toString().padStart(2, '0')}>
                  {new Date(2000, i, 1).toLocaleString('es-CL', { month: 'long' })}
                </option>
              ))}
            </select>
            <select
              aria-label="Año"
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="bg-surface-elevated border border-surface-border text-on-surface font-label-md text-label-md p-2.5 rounded-xl outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {[0, 1, 2].map(offset => {
                const year = dateObj.getUTCFullYear() - offset;
                return <option key={year} value={year.toString()}>{year}</option>;
              })}
            </select>
          </div>
        </div>
      </header>

      {!vendedor && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
          <Icon className=" text-primary text-[48px] mb-4">person_add</Icon>
          <h3 className="font-headline-md text-on-surface mb-2">Configura tu perfil primero</h3>
          <p className="font-body-md text-on-surface-variant max-w-sm">
            Ingresa tu nombre en la barra superior para ver tu historial de ventas.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-error p-4 rounded-xl mb-6 font-label-md flex items-center gap-2">
          <Icon className=" text-[18px]">error</Icon>
          {error}
        </div>
      )}

      {vendedor && loading ? (
        <div className="flex justify-center p-16">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      ) : vendedor ? (
        <TablaHistorial ventas={ventas} />
      ) : null}
    </div>
  );
}
