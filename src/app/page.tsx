'use client';

import Icon from '@/components/Icon';
import { useEffect, useState, useCallback } from 'react';
import DashboardCards from '@/components/DashboardCards';
import GraficoMensual from '@/components/GraficoMensual';
import GraficoDistribucion from '@/components/GraficoDistribucion';
import SimuladorComisiones from '@/components/SimuladorComisiones';
import { Venta } from '@/types/venta';
import Link from 'next/link';
import { useStoredString } from '@/hooks/useStoredString';
import { chileDate } from '@/lib/validation';

export default function DashboardPage() {
  const vendedor = useStoredString('trackretail_vendedor');
  return <SellerDashboard key={vendedor || ''} vendedor={vendedor} />;
}

function SellerDashboard({ vendedor }: { vendedor: string | null }) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentMonth = chileDate().slice(0, 7);

  const fetchVentas = useCallback(async (signal: AbortSignal) => {
    if (!vendedor) return;

    try {
      const url = `/api/ventas?vendedor_id=${encodeURIComponent(vendedor)}&mes=${currentMonth}`;
      const res = await fetch(url, { signal });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setVentas(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: unknown) {
      // AbortError es esperado al navegar — no es un error real
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [vendedor, currentMonth]);

  useEffect(() => {
    if (vendedor === undefined) return; // Still initializing

    if (!vendedor) return;

    const controller = new AbortController();
    // Fetch updates state only after the network response or failure; the effect subscribes to remote data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchVentas(controller.signal);
    const refresh = () => { void fetchVentas(controller.signal); };
    window.addEventListener('trackretail:ventas-updated', refresh);

    // Polling cada 30s con cleanup apropiado
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchVentas(controller.signal);
    }, 30000);

    return () => {
      window.removeEventListener('trackretail:ventas-updated', refresh);
      controller.abort(); // Cancela el fetch en vuelo al desmontar
      clearInterval(interval);
    };
  }, [vendedor, fetchVentas]);


  // Still loading localStorage
  if (vendedor === undefined) {
    return <DashboardSkeleton />;
  }

  if (!vendedor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <Icon className=" text-primary text-[40px]">person_add</Icon>
        </div>
        <h2 className="font-display-md text-display-md text-on-surface mb-2">¡Bienvenido!</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mb-8">
          Para comenzar, configura tu nombre usando el selector en la barra superior (o la barra lateral en escritorio).
        </p>
        <Link
          href="/registro"
          className="bg-gradient-to-r from-primary-container to-inverse-primary text-on-primary-container font-label-md px-6 py-3 rounded-xl hover:scale-[1.02] transition-transform"
        >
          Registrar mi primera boleta
        </Link>
      </div>
    );
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <>
      <header className="flex justify-between items-end pb-8 border-b border-surface-border">
        <div>
          <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface">
            Resumen General
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-2">
            Hola, <strong>{vendedor}</strong>. Aquí está tu rendimiento de este mes.
          </p>
        </div>
      </header>

      {error && (
        <div className="text-error bg-red-500/10 p-4 rounded-xl border border-red-500/20 mb-4 flex flex-wrap items-center gap-3">
          <Icon className=" text-[18px]">error</Icon>
          <div className="flex-1">
            <p>{error}</p>
            <p className="mt-1 text-sm">{ventas.length ? 'Se muestran los datos de la última carga correcta.' : 'Los totales no están disponibles hasta recuperar la conexión con la base de datos.'}</p>
          </div>
          <button type="button" className="border border-current rounded-lg px-3 py-2 shrink-0" onClick={() => { setLoading(true); void fetchVentas(new AbortController().signal); }}>Reintentar</button>
        </div>
      )}

      {(!error || ventas.length > 0) && <>
      <DashboardCards ventas={ventas} />

      <section className="flex flex-col gap-4 mt-8">
        <h3 className="font-headline-md text-headline-md text-on-surface">Actividad Reciente</h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Tabla reciente */}
          <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-base">
                    <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Folio</th>
                    <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Fecha</th>
                    <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Garantía</th>
                    <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border font-body-md text-body-md">
                  {ventas.slice(0, 6).map((venta) => (
                    <tr key={venta.id} className="hover:bg-surface-base transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-surface-base flex items-center justify-center text-on-surface-variant group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <Icon className=" text-[14px]">receipt</Icon>
                          </div>
                          <span className="text-on-surface font-medium text-sm">{venta.folio}</span>
                        </div>
                      </td>
                      <td className="p-4 text-on-surface-variant text-sm">{venta.fecha_compra}</td>
                      <td className="p-4 text-on-surface text-sm">${(venta.valor_garantia ?? 0).toLocaleString('es-CL')}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20">
                          ${(venta.comision_calculada ?? 0).toLocaleString('es-CL')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {ventas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-on-surface-variant">
                        No hay ventas este mes. ¡Registra tu primera boleta!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico distribución */}
          <GraficoDistribucion ventas={ventas} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-4">
            <GraficoMensual ventas={ventas} />
          </div>
          <SimuladorComisiones ventas={ventas} />
        </div>
      </section>
      </>}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="w-full flex flex-col gap-8 animate-pulse">
      <div className="w-64 h-10 bg-surface-elevated rounded-lg mt-4"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-surface-elevated rounded-xl"></div>
        ))}
      </div>
      <div className="w-full h-64 bg-surface-elevated rounded-xl"></div>
    </div>
  );
}
