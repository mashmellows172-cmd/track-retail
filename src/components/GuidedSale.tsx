'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck, TriangleAlert } from 'lucide-react';
import { stockQuantityWarning, type StockProduct } from '@/lib/stock';
import {
  GUIDED_SALE_MAX_AMOUNT,
  GUIDED_SALE_MAX_UNITS,
  buildGuidedSale,
  guidedSaleCommission,
  guidedSaleWarnings,
  parseGuidedPesos,
  parseGuidedQuantity,
  saveGuidedSaleHandoff,
  warrantyYearsFor,
  type GuidedSaleChannel,
  type GuidedSaleErrors,
  type GuidedSaleWarrantyType,
} from '@/lib/guidedSale';

interface GuidedSaleProps {
  product: StockProduct;
  stockDate?: string;
}

const field = 'min-h-12 w-full rounded-xl border border-surface-border bg-surface-base px-3 text-on-surface';
const label = 'block text-sm font-medium text-on-surface-variant mb-2';
const button = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const money = (value: number) => value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export default function GuidedSale({ product, stockDate }: GuidedSaleProps) {
  const router = useRouter();
  const [price, setPrice] = useState(() => (Number.isSafeInteger(product.price) && product.price > 0 ? String(product.price) : ''));
  const [quantity, setQuantity] = useState('1');
  const [channel, setChannel] = useState<GuidedSaleChannel>('caja');
  const [warrantyType, setWarrantyType] = useState<GuidedSaleWarrantyType | ''>('');
  const [warrantyYears, setWarrantyYears] = useState('1');
  const [warrantyValue, setWarrantyValue] = useState('');
  const [errors, setErrors] = useState<GuidedSaleErrors>({});
  const [storageError, setStorageError] = useState('');

  const warnings = useMemo(
    () => {
      const warnings = guidedSaleWarnings({ available: product.available, listPrice: product.price });
      const shortage = stockQuantityWarning(product.available, parseGuidedQuantity(quantity));
      return shortage ? [...warnings, shortage] : warnings;
    },
    [product.available, product.price, quantity],
  );

  const totals = useMemo(() => {
    const unitPrice = parseGuidedPesos(price);
    const units = parseGuidedQuantity(quantity);
    const warranty = warrantyValue.trim() === '' ? 0 : parseGuidedPesos(warrantyValue);
    const commission = warrantyType ? guidedSaleCommission(warrantyType, warrantyValue.trim() === '' ? 0 : warrantyValue, warrantyYears) : 0;
    if (unitPrice === null || units === null || warranty === null) return { total: null, commission };
    const total = unitPrice * units + warranty;
    return {
      total: Number.isSafeInteger(total) && total <= GUIDED_SALE_MAX_AMOUNT ? total : null,
      commission,
    };
  }, [price, quantity, warrantyValue, warrantyType, warrantyYears]);

  const maxYears = warrantyYearsFor(warrantyType);

  function changeType(next: GuidedSaleWarrantyType | '') {
    setWarrantyType(next);
    const limit = warrantyYearsFor(next);
    if (limit > 0 && Number(warrantyYears) > limit) setWarrantyYears('1');
    setErrors(previous => ({ ...previous, tipo_garantia: undefined, anos_garantia: undefined }));
  }

  function prepareSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStorageError('');
    const result = buildGuidedSale({
      product: { plu: product.plu, name: product.description },
      precio_producto: price,
      cantidad_unidades: quantity,
      canal: channel,
      valor_garantia: warrantyValue,
      tipo_garantia: warrantyType,
      anos_garantia: warrantyYears,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!saveGuidedSaleHandoff(result.handoff)) {
      setStorageError('No pudimos preparar el registro en este navegador. Revisa el almacenamiento de la sesión e inténtalo de nuevo.');
      return;
    }
    router.push('/registro');
  }

  const errorList = Object.values(errors).filter((message): message is string => Boolean(message));

  return (
    <section aria-labelledby="guided-sale-title" className="mt-6 border-t border-surface-border pt-6">
      <div className="flex items-start gap-3">
        <ShieldCheck size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-secondary" />
        <div>
          <h3 id="guided-sale-title" className="text-lg font-semibold text-on-surface">Preparar esta venta</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            Calcula el total y la comisión estimada de la garantía antes de pasar al registro. No guarda ni reserva el producto.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-surface-border bg-surface-base p-4">
        <p className="text-sm text-on-surface-variant">
          Stock del informe: <strong className="text-on-surface tabular-nums">{product.available} unidades</strong>
          {stockDate ? <> · {stockDate}</> : null}
        </p>
        {warnings.length > 0 && (
          <ul aria-label="Advertencias de stock y precio" className="mt-3 space-y-2">
            {warnings.map(warning => (
              <li key={warning} className="flex gap-2 text-sm text-on-surface">
                <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-error" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={prepareSale} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="guided-sale-price" className={label}>Precio unitario a cobrar ($)</label>
            <input
              id="guided-sale-price"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              className={field}
              value={price}
              onChange={event => { setPrice(event.target.value); setErrors(previous => ({ ...previous, precio_producto: undefined })); }}
              aria-describedby="guided-sale-price-help"
            />
            <p id="guided-sale-price-help" className="mt-1 text-xs text-on-surface-variant">El precio del listado es referencial; confírmalo en ABC o con el cliente.</p>
          </div>

          <div>
            <label htmlFor="guided-sale-quantity" className={label}>Cantidad de unidades</label>
            <input
              id="guided-sale-quantity"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              className={field}
              value={quantity}
              onChange={event => { setQuantity(event.target.value); setErrors(previous => ({ ...previous, cantidad_unidades: undefined })); }}
            />
            <p className="mt-1 text-xs text-on-surface-variant">Entre 1 y {GUIDED_SALE_MAX_UNITS.toLocaleString('es-CL')} unidades.</p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="guided-sale-channel" className={label}>Canal de venta</label>
            <select
              id="guided-sale-channel"
              className={field}
              value={channel}
              onChange={event => setChannel(event.target.value as GuidedSaleChannel)}
            >
              <option value="caja">Caja (tienda física)</option>
              <option value="internet">Internet (venta asistida)</option>
            </select>
          </div>
        </div>

        <fieldset className="rounded-xl border border-surface-border p-4">
          <legend className="px-1 text-sm font-semibold text-on-surface">Garantía Más Protección</legend>
          <p className="mb-4 text-xs text-on-surface-variant">La comisión es solo la de la garantía según las tablas vigentes; no se estima comisión del producto.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="guided-sale-warranty-type" className={label}>Tipo de garantía</label>
              <select
                id="guided-sale-warranty-type"
                className={field}
                value={warrantyType}
                onChange={event => changeType(event.target.value as GuidedSaleWarrantyType | '')}
                aria-describedby="guided-sale-warranty-help"
              >
                <option value="">Selecciona el tipo…</option>
                <option value="telefonia">Telefonía</option>
                <option value="lineas_duras">Líneas duras (electro / deporte)</option>
              </select>
            </div>

            <div>
              <label htmlFor="guided-sale-warranty-years" className={label}>Años de garantía</label>
              <select
                id="guided-sale-warranty-years"
                className={field}
                value={warrantyYears}
                disabled={!warrantyType}
                onChange={event => setWarrantyYears(event.target.value)}
              >
                {[1, 2, 3, 4].filter(years => years <= maxYears).map(years => (
                  <option key={years} value={years}>{years} {years === 1 ? 'año' : 'años'}</option>
                ))}
                {!warrantyType && <option value="1">Selecciona primero el tipo</option>}
              </select>
            </div>

            <div>
              <label htmlFor="guided-sale-warranty-value" className={label}>Valor de la garantía ($)</label>
              <input
                id="guided-sale-warranty-value"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                className={field}
                value={warrantyValue}
                onChange={event => { setWarrantyValue(event.target.value); setErrors(previous => ({ ...previous, valor_garantia: undefined })); }}
                placeholder="0 si no incluye"
                aria-describedby="guided-sale-warranty-help"
              />
            </div>
          </div>
          <p id="guided-sale-warranty-help" className="mt-3 text-xs text-on-surface-variant">Telefonía admite hasta 2 años; líneas duras, hasta 4. Si no sabes el tipo, no lo supongas: verifícalo antes de continuar.</p>
        </fieldset>

        <div aria-live="polite" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-surface-border bg-surface-elevated p-4">
            <p className="text-sm text-on-surface-variant">Total estimado</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-on-surface">
              {totals.total === null ? 'Completa los montos' : money(totals.total)}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">Precio unitario × cantidad + garantía.</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-surface-elevated p-4">
            <p className="text-sm text-on-surface-variant">Comisión estimada de garantía</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-secondary">{money(totals.commission)}</p>
            <p className="mt-1 text-xs text-on-surface-variant">Solo garantía, según el tipo y los años elegidos.</p>
          </div>
        </div>

        {errorList.length > 0 && (
          <div role="alert" className="rounded-xl border border-error/40 bg-error/10 p-4">
            <p className="font-semibold text-on-surface">Revisa estos datos antes de continuar:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {errorList.map(message => <li key={message}>{message}</li>)}
            </ul>
          </div>
        )}

        {storageError && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-4 text-sm">{storageError}</p>}

        <button type="submit" className={`${button} w-full bg-secondary text-on-secondary font-semibold hover:opacity-90`}>
          Preparar registro
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        <p className="text-center text-xs text-on-surface-variant">La venta se guarda recién al confirmarla en el formulario de registro.</p>
      </form>
    </section>
  );
}
