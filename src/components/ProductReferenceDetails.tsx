'use client';
import type {AbcPriceInfo} from '@/lib/abcReference';

const money = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export default function ProductReferenceDetails({
  reportPrice,
  reference,
}: {
  reportPrice?: number | null;
  reference?: {
    prices?: AbcPriceInfo[];
    hasAmbiguousPrice?: boolean;
    checkedAt?: string;
  } | null;
}) {
  if (!reference) {
    return (
      <div className="rounded-xl bg-surface-base p-4 mb-4 space-y-2 text-sm">
        <p className="font-medium">Referencia ABC (pendiente de consultar)</p>
        <p className="text-on-surface-variant">Sin datos verificados. No se inventan precios.</p>
      </div>
    );
  }

  const checkedAt = reference.checkedAt ? new Date(reference.checkedAt).toLocaleString('es-CL') : 'Sin verificar';
  const prices: AbcPriceInfo[] = reference.prices || [];
  const identityVerified = prices.filter((p: AbcPriceInfo) => p.matchedIdentity === true);
  const hasAmbiguous = reference.hasAmbiguousPrice === true;
  const unambiguous = identityVerified.length === 1 && !hasAmbiguous;
  const single = unambiguous ? identityVerified[0] : null;
  const webPrice = single && typeof single.price === 'number' ? single.price : null;

  return (
    <div className="rounded-xl bg-surface-base p-4 mb-4 space-y-2 text-sm">
      <p className="font-medium">Referencia ABC</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-on-surface-variant">Precio del listado (informe)</p>
          <p className="font-semibold tabular-nums">{typeof reportPrice === 'number' ? money(reportPrice) : 'Sin verificar'}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">Precio web ABC (identidad verificada, sin ambigüedad)</p>
          <p className="font-semibold tabular-nums">{webPrice !== null ? money(webPrice) : 'Sin verificar'}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-on-surface-variant">
        <p>Precio con tarjeta: {single?.cardPrice === null || single?.cardPrice === undefined ? 'Sin verificar' : single?.cardPrice ? 'Sí' : 'No'}</p>
        <p>Garantía: {single?.warranty === null || single?.warranty === undefined ? 'Sin verificar' : single?.warranty ? 'Sí' : 'No'}</p>
      </div>
      <p className="text-xs text-on-surface-variant">Consultado: {checkedAt}. Puede estar en caché. No se muestran precios ambiguos o no verificados.</p>
    </div>
  );
}
