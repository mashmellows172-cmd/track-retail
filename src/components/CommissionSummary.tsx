'use client';

import { useMemo } from 'react';
import { AlertTriangle, CreditCard, Info, TrendingUp } from 'lucide-react';
import type { Venta } from '@/types/venta';
import { useStoredString } from '@/hooks/useStoredString';
import { chileDate } from '@/lib/validation';
import { getCommissionSummary, parseCardRecords } from '@/lib/commissionsSummary';

const money = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

interface CommissionSummaryProps {
  vendedor: string;
  ventas: Venta[];
  month: string;
  hasServerData: boolean;
  isStale: boolean;
}

export default function CommissionSummary({ vendedor, ventas, month, hasServerData, isStale }: CommissionSummaryProps) {
  const stored = useStoredString(`trackretail_cards_${vendedor}`);
  const parsed = useMemo(() => parseCardRecords(stored), [stored]);
  const today = chileDate();
  const summary = useMemo(
    () => getCommissionSummary(ventas, parsed.records, month, { now: new Date(), hasServerData, isStale, cardsCorrupt: parsed.corrupt }),
    // The projection is day-level; recompute when the local calendar day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ventas, parsed.records, month, hasServerData, isStale, parsed.corrupt, today],
  );

  const unavailable = summary.overflow;
  const projection = summary.projection;

  return (
    <section aria-labelledby="commission-summary-title" className="my-6 rounded-2xl border border-surface-border bg-surface-elevated p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="commission-summary-title" className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp size={22} aria-hidden="true" className="text-secondary" />
            Resumen consolidado de comisiones
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Solo comisiones registradas. No incluye ventas pendientes de sincronizar ni una comisión base por producto que no esté configurada.
          </p>
        </div>
        <p className="text-sm text-on-surface-variant">Mes {month}</p>
      </div>

      {isStale && (
        <p role="status" className="rounded-xl border border-secondary/30 bg-secondary/5 p-3 text-sm">
          Se conservan las últimas ventas cargadas correctamente, pero la actualización falló. Las garantías observadas pueden estar incompletas y la proyección está desactivada.
        </p>
      )}
      {!hasServerData && (
        <p role="status" className="rounded-xl border border-secondary/30 bg-secondary/5 p-3 text-sm">
          Las ventas del servidor no están disponibles: garantías y total combinado aparecen como no disponibles. Solo se muestra el subtotal local de tarjetas y no hay proyección.
        </p>
      )}
      {parsed.corrupt && (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-3 text-sm flex gap-2">
          <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          Los registros locales de tarjetas tienen un formato inválido. El resumen de tarjetas no se calcula.
        </p>
      )}
      {summary.invalidRecordCount > 0 && (
        <p role="status" className="rounded-xl border border-error/40 bg-error/10 p-3 text-sm">
          {summary.invalidRecordCount === 1
            ? 'Hay 1 registro con fecha o comisión inválida; se excluyó del total y no se proyecta.'
            : `Hay ${summary.invalidRecordCount} registros con fecha o comisión inválida; se excluyeron del total y no se proyecta.`}
        </p>
      )}
      {unavailable && (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-3 text-sm">
          Los totales superan el rango seguro y no se muestran. Revisa los registros antes de confiar en estas cifras.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl bg-secondary/10 p-4">
          <p className="text-sm text-on-surface-variant">Total observado</p>
          <p className="mt-2 text-2xl font-semibold text-secondary tabular-nums">{summary.totalObserved === null ? 'No disponible' : money(summary.totalObserved)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Garantías registradas + tarjetas del mes.</p>
        </div>
        <div className="rounded-xl bg-surface-base p-4">
          <p className="text-sm text-on-surface-variant">Garantías (servidor)</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{summary.observedWarrantyCommission === null ? 'No disponible' : money(summary.observedWarrantyCommission)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Suma de la comisión registrada en cada boleta.</p>
        </div>
        <div className="rounded-xl bg-surface-base p-4">
          <p className="text-sm text-on-surface-variant flex items-center gap-1"><CreditCard size={16} aria-hidden="true" />Tarjetas: apertura</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{summary.cardBase === null ? 'No disponible' : money(summary.cardBase)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Monto base, sin duplicar la activación.</p>
        </div>
        <div className="rounded-xl bg-surface-base p-4">
          <p className="text-sm text-on-surface-variant">Tarjetas: activación</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{summary.cardTopUp === null ? 'No disponible' : money(summary.cardTopUp)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Solo el adicional cuando se activó el mismo día.</p>
        </div>
      </div>

      <div aria-live="polite" className={`rounded-xl border p-4 ${projection.enabled ? 'border-secondary/40 bg-secondary/5' : 'border-surface-border bg-surface-base'}`}>
        {projection.enabled ? (
          <>
            <p className="text-sm text-on-surface-variant">Proyección estimada del mes</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{money(projection.projectedMonthTotal!)}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{projection.reason}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium flex items-center gap-2"><Info size={18} aria-hidden="true" />Sin proyección</p>
            <p className="mt-1 text-sm text-on-surface-variant">{projection.reason}</p>
          </>
        )}
        <p className="mt-2 text-xs text-on-surface-variant">La comisión base por venta del producto no está configurada, por lo que no se inventa ni se suma.</p>
      </div>
    </section>
  );
}
