'use client';

import Icon from '@/components/Icon';
import { useRef, useState } from 'react';
import { VentaOCR, Venta } from '@/types/venta';
import { useToast } from '@/components/ToastProvider';
import { Haptics } from '@/lib/haptics';
import { saleError } from '@/lib/validation';
import type { SaleDraft } from '@/lib/draft';
import { clearSaleDraft, initialSaleDraft, persistSaleDraft } from '@/lib/guidedSale';
import { QUEUE_KEY } from '@/lib/offlineQueue';
import {
  duplicateReport,
  parsePendingQueue,
  parseServerSales,
  serverMonthFor,
  type DuplicateSource,
} from '@/lib/receiptDuplicates';
import { recordOcrCorrectionsFromFinal } from '@/lib/ocrCorrectionMetrics';

type DuplicateCheck =
  | { status: 'clear' }
  | { status: 'duplicate'; sources: DuplicateSource[] }
  | { status: 'notice'; message: string };

async function checkDuplicate(seller: string, draft: SaleDraft): Promise<DuplicateCheck> {
  const candidate = { ...draft, vendedor_id: seller };
  const month = serverMonthFor(candidate);
  let pending: ReturnType<typeof parsePendingQueue> = { sales: [], invalid: false };
  try {
    pending = parsePendingQueue(localStorage.getItem(QUEUE_KEY));
  } catch {
    pending = { sales: [], invalid: true };
  }

  let serverSales: Venta[] = [];
  let possiblyIncomplete = false;
  let serverNotice = '';
  if (!navigator.onLine) {
    serverNotice = 'Sin conexión: no se pudo revisar el historial del servidor. La venta se conservará como pendiente si el envío falla.';
  } else if (month) {
    try {
      const response = await fetch(
        `/api/ventas?vendedor_id=${encodeURIComponent(seller)}&mes=${month}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const parsed = parseServerSales(await response.json());
      if (!parsed) throw new Error('Respuesta inesperada');
      serverSales = parsed.sales;
      possiblyIncomplete = parsed.possiblyIncomplete;
    } catch {
      serverNotice = 'No se pudo completar la revisión en línea. El servidor seguirá siendo la autoridad al guardar.';
    }
  } else {
    serverNotice = 'La fecha no permite revisar el mes en línea. Corrige la fecha o revisa el folio manualmente.';
  }

  const report = duplicateReport(candidate, pending.sales, serverSales);
  if (report && report.sources.length > 0) return { status: 'duplicate', sources: report.sources };

  const notices = [
    pending.invalid ? 'No se pudo leer la cola local; no se borrará. Revisa el folio manualmente.' : '',
    serverNotice,
    possiblyIncomplete ? 'La revisión en línea puede estar incompleta por el volumen del mes; el servidor validará el folio al guardar.' : '',
  ].filter(Boolean);
  return notices.length ? { status: 'notice', message: notices.join(' ') } : { status: 'clear' };
}

function duplicateSourceLabel(sources: DuplicateSource[]): string {
  if (sources.includes('pending') && sources.includes('server')) return 'tu cola pendiente y el historial del servidor';
  return sources.includes('pending') ? 'tu cola de ventas pendientes' : 'el historial del servidor';
}

interface ConfirmacionFormProps {
  initialData: VentaOCR;
  /** Explicitly chosen draft. The form never reads storage during initialization. */
  initialDraft?: SaleDraft | null;
  /** Product reference shown as context only; it is not saved with the sale. */
  productContext?: { plu: string; name: string } | null;
  onConfirm: (data: Omit<Venta, 'id' | 'created_at' | 'comision_calculada'>) => Promise<void>;
  onCancel: () => void;
  /** Called only after the edited draft was persisted successfully. */
  onDraftSaved?: (draft: SaleDraft) => void;
}

const inputClass = 'w-full bg-surface-base border border-surface-border rounded-lg p-2.5 text-on-surface focus:border-primary/60 focus:ring-1 focus:ring-primary/30 outline-none transition-colors font-body-md text-body-md';
const labelClass = 'block font-label-sm text-label-sm text-on-surface-variant mb-1.5';

export default function ConfirmacionForm({ initialData, initialDraft = null, productContext = null, onConfirm, onCancel, onDraftSaved }: ConfirmacionFormProps) {
  const [formData, setFormData] = useState<SaleDraft>(() => {
    // Only an explicit draft choice restores storage. Manual entry and guided
    // proposals must never pick up an unrelated draft by accident.
    return initialDraft ?? initialSaleDraft(initialData);
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ seller: string; folio: string; fecha: string; sources: DuplicateSource[] } | null>(null);
  const [checkNotice, setCheckNotice] = useState('');
  const submittingRef = useRef(false);
  const formRef = useRef<SaleDraft>(formData);
  const { showToast } = useToast();

  const isLocked = isSubmitting || isChecking;

  const updateForm = (next: SaleDraft) => {
    formRef.current = next;
    setFormData(next);
  };

  const submitSale = async (force: boolean) => {
    if (submittingRef.current) return;
    const pendingWarning = duplicateWarning;
    submittingRef.current = true;
    setIsSubmitting(true);
    setDuplicateWarning(null);
    setCheckNotice('');
    Haptics.medium();

    // Freeze the exact values that were checked so a slow network check can
    // never cause different data to be saved than what the user reviewed.
    const draftSnapshot = formRef.current;
    const snapshotKey = JSON.stringify(draftSnapshot);
    let savedVendedor: string | null = null;
    try {
      savedVendedor = localStorage.getItem('trackretail_vendedor');
    } catch {
      console.warn('LocalStorage inaccesible');
    }

    const seller = savedVendedor?.trim() ?? '';
    if (!seller) {
      showToast('Configura tu nombre en la barra superior antes de registrar.', 'error');
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }
    const validationError = saleError({ ...draftSnapshot, vendedor_id: seller });
    if (validationError) {
      showToast(validationError, 'error');
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    // "Registrar de todos modos" only bypasses the warning it was shown for.
    // If the active seller changed meanwhile, run the check again for the new seller.
    const skipDuplicateCheck = force && pendingWarning?.seller === seller;
    if (!skipDuplicateCheck) {
      setIsChecking(true);
      try {
        const check = await checkDuplicate(seller, draftSnapshot);
        // Guard against edits made while the duplicate check was in flight (use live ref).
        let currentVendedor = seller;
        try {
          currentVendedor = localStorage.getItem('trackretail_vendedor')?.trim() ?? '';
        } catch {
          currentVendedor = seller;
        }
        if (JSON.stringify(formRef.current) !== snapshotKey || currentVendedor !== seller) {
          setIsChecking(false);
          setIsSubmitting(false);
          submittingRef.current = false;
          setCheckNotice('Los datos o el vendedor cambiaron mientras se revisaban los duplicados. Vuelve a intentar.');
          showToast('Los datos o el vendedor cambiaron mientras se revisaban los duplicados.', 'info');
          return;
        }
        if (check.status === 'duplicate') {
          setDuplicateWarning({ seller, folio: draftSnapshot.folio.trim(), fecha: draftSnapshot.fecha_compra, sources: check.sources });
          setIsChecking(false);
          setIsSubmitting(false);
          submittingRef.current = false;
          return;
        }
        if (check.status === 'notice') {
          setCheckNotice(check.message);
          showToast(check.message, 'info');
        }
      } catch {
        const message = 'No se pudo completar la revisión de duplicados. El servidor seguirá siendo la autoridad al guardar.';
        setCheckNotice(message);
        showToast(message, 'info');
      } finally {
        setIsChecking(false);
      }
    } else {
      let currentVendedor = seller;
      try {
        currentVendedor = localStorage.getItem('trackretail_vendedor')?.trim() ?? '';
      } catch {
        currentVendedor = seller;
      }
      if (JSON.stringify(formRef.current) !== snapshotKey || currentVendedor !== seller) {
        setIsSubmitting(false);
        submittingRef.current = false;
        setCheckNotice('Los datos o el vendedor cambiaron mientras se procesaba. Vuelve a intentar.');
        showToast('Los datos o el vendedor cambiaron mientras se procesaba.', 'info');
        return;
      }
    }

    try {
      let currentVendedor = seller;
      try {
        currentVendedor = localStorage.getItem('trackretail_vendedor')?.trim() ?? '';
      } catch {
        currentVendedor = seller;
      }
      if (JSON.stringify(formRef.current) !== snapshotKey || currentVendedor !== seller) {
        setIsSubmitting(false);
        submittingRef.current = false;
        setCheckNotice('Los datos o el vendedor cambiaron antes de guardar. Vuelve a intentar.');
        showToast('Los datos o el vendedor cambiaron antes de guardar.', 'info');
        return;
      }
      // Record on the reviewed attempt (before/at save point); only counts if explicit OCR baseline exists, once per baseline
      try {
        const finalForMetrics: Venta = { ...(draftSnapshot as unknown as Venta), vendedor_id: seller };
        recordOcrCorrectionsFromFinal(finalForMetrics);
      } catch {
        // ignore
      }
      await onConfirm({ ...draftSnapshot, vendedor_id: seller });
      clearSaleDraft();
      setDuplicateWarning(null);
      setCheckNotice('');
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido al guardar';
      showToast(errorMsg, 'error');
      console.error(error);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitSale(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (isLocked) return;
    const { name, value } = e.target;
    const numFields = ['precio_producto', 'cantidad_unidades', 'valor_garantia', 'total_boleta', 'anos_garantia'];
    const next: SaleDraft = {
      ...formRef.current,
      [name]: numFields.includes(name) ? Number(value) : value,
      ...(name === 'tipo_garantia' && value === 'telefonia' && (formRef.current.anos_garantia as number) > 2 ? { anos_garantia: 2 as const } : {}),
    };
    updateForm(next);
    // A warning or notice describes the previous values; editing invalidates it.
    setDuplicateWarning(null);
    setCheckNotice('');
    const saved = persistSaleDraft(next);
    setDraftSaveError(!saved);
    if (saved) onDraftSaved?.(next);
  };

  return (
    <form onSubmit={handleSubmit} className={`bg-surface-elevated border border-surface-border rounded-2xl p-4 sm:p-6 shadow-sm ${isLocked ? 'opacity-90' : ''}`}>
      <fieldset disabled={isLocked} className={isLocked ? 'pointer-events-none' : undefined}>
      <h2 className="font-headline-md text-headline-md text-on-surface mb-1">Confirmar Datos</h2>
      {draftSaveError && <p role="alert" className="my-3 rounded-xl border border-error/40 bg-error/10 p-3 text-sm">Los cambios están en pantalla, pero no se pudo actualizar el borrador. Conserva estos datos antes de salir.</p>}
      <p className="font-label-md text-label-md text-on-surface-variant mb-6">
        Revisa los datos antes de guardar la venta.
      </p>

      {productContext && (
        <div className="mb-6 rounded-xl border border-secondary/30 bg-secondary/5 p-4">
          <p className="font-label-sm text-label-sm text-secondary font-semibold">Producto seleccionado en el catálogo</p>
          <p className="font-semibold text-on-surface mt-1 break-words">{productContext.name}</p>
          <p className="text-sm text-on-surface-variant mt-1">PLU {productContext.plu} · Contexto para identificar la venta; no se guarda como dato de la boleta.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="venta-folio" className={labelClass}>Folio Boleta</label>
          <input required disabled={isLocked} type="text" id="venta-folio" name="folio" value={formData.folio} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-fecha_compra" className={labelClass}>Fecha de Compra</label>
          <input required disabled={isLocked} type="date" id="venta-fecha_compra" name="fecha_compra" value={formData.fecha_compra} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-canal" className={labelClass}>Canal de Venta</label>
          <select disabled={isLocked} id="venta-canal" name="canal" value={formData.canal} onChange={handleChange} className={inputClass}>
            <option value="caja">Caja (Tienda física)</option>
            <option value="internet">Internet (Venta asistida)</option>
          </select>
        </div>

        {formData.canal === 'internet' && (
          <div>
            <label htmlFor="venta-numero_pedido" className={labelClass}>Nº Pedido Online</label>
            <input disabled={isLocked} type="text" id="venta-numero_pedido" name="numero_pedido" value={formData.numero_pedido} onChange={handleChange} className={inputClass} />
          </div>
        )}

        <div>
          <label htmlFor="venta-precio_producto" className={labelClass}>Precio Producto ($)</label>
          <input required disabled={isLocked} type="number" min="0" max="999999999999" step="1" inputMode="numeric" id="venta-precio_producto" name="precio_producto" value={formData.precio_producto} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-total_boleta" className={labelClass}>Total Boleta ($)</label>
          <input required disabled={isLocked} type="number" min="0" max="999999999999" step="1" inputMode="numeric" id="venta-total_boleta" name="total_boleta" value={formData.total_boleta} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-cantidad_unidades" className={labelClass}>Cantidad de Unidades</label>
          <input required disabled={isLocked} id="venta-cantidad_unidades" type="number" min="1" max="9999" step="1" inputMode="numeric" name="cantidad_unidades" value={formData.cantidad_unidades} onChange={handleChange} className={inputClass} />
        </div>

        {/* Divider */}
        <div className="col-span-1 md:col-span-2 pt-4 mt-2 border-t border-surface-border">
          <p className="font-label-md text-label-md text-tertiary flex items-center gap-2">
            <Icon className=" text-[18px]">shield</Icon>
            Detalle Garantía — Más Protección
          </p>
        </div>

        <div>
          <label htmlFor="venta-valor_garantia" className={labelClass}>Valor Garantía ($)</label>
          <input required disabled={isLocked} type="number" min="0" max="999999999999" step="1" inputMode="numeric" id="venta-valor_garantia" name="valor_garantia" value={formData.valor_garantia} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-anos_garantia" className={labelClass}>Años Garantía</label>
          <select disabled={isLocked} id="venta-anos_garantia" name="anos_garantia" value={formData.anos_garantia} onChange={handleChange} className={inputClass}>
            <option value={1}>1 Año</option>
            <option value={2}>2 Años</option>
            {formData.tipo_garantia === 'lineas_duras' && <option value={3}>3 Años</option>}
            {formData.tipo_garantia === 'lineas_duras' && <option value={4}>4 Años</option>}
          </select>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="venta-tipo_garantia" className={labelClass}>Tipo de Producto</label>
          <select disabled={isLocked} id="venta-tipo_garantia" name="tipo_garantia" value={formData.tipo_garantia} onChange={handleChange} className={inputClass}>
            <option value="telefonia">Telefonía</option>
            <option value="lineas_duras">Líneas Duras (Electro / Deporte)</option>
          </select>
        </div>
      </div>

      {duplicateWarning && (
        <div role="alert" aria-live="assertive" className="mt-6 rounded-xl border border-tertiary/50 bg-tertiary/10 p-4">
          <p className="flex items-start gap-2 font-label-md text-label-md text-on-surface">
            <Icon className="text-[20px] text-tertiary mt-0.5">warning</Icon>
            Posible boleta duplicada
          </p>
          <p className="mt-2 text-sm text-on-surface">
            El folio <strong className="break-words">{duplicateWarning.folio || '(sin folio)'}</strong> con fecha{' '}
            <strong>{duplicateWarning.fecha}</strong> ya aparece en {duplicateSourceLabel(duplicateWarning.sources)} para
            el vendedor <strong>{duplicateWarning.seller}</strong>.
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">
            Revisa la boleta antes de continuar. Si es una venta distinta, puedes registrarla de todos modos; el servidor seguirá validando folio, fecha y canal al guardar.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              disabled={isLocked}
              className="min-h-11 flex-1 border border-surface-border hover:bg-surface-base text-on-surface-variant px-4 py-2.5 rounded-xl font-label-md text-label-md transition-colors disabled:opacity-50"
            >
              Revisar datos
            </button>
            <button
              type="button"
              onClick={() => void submitSale(true)}
              disabled={isLocked}
              className="min-h-11 flex-1 bg-tertiary text-on-tertiary px-4 py-2.5 rounded-xl font-label-md text-label-md transition-colors disabled:opacity-50"
            >
              Registrar de todos modos
            </button>
          </div>
        </div>
      )}

      <p role="status" aria-live="polite" className="mt-6 text-xs text-on-surface-variant">
        {checkNotice
          || 'La revisión compara folio y fecha con tu cola local y el mes del historial. Puede ser limitada; el servidor mantiene la validación final al guardar.'}
      </p>

      <div className="flex gap-3 mt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLocked}
          className="min-h-11 flex-1 border border-surface-border hover:bg-surface-base text-on-surface-variant py-3 rounded-xl font-label-md text-label-md transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isLocked}
          aria-busy={isSubmitting || isChecking}
          className="min-h-11 flex-1 bg-secondary text-on-secondary py-3 rounded-xl font-label-md text-label-md hover:scale-[1.02] transition-all shadow-sm disabled:opacity-50 disabled:scale-100"
        >
          {isChecking ? 'Revisando duplicados...' : isSubmitting ? 'Guardando...' : 'Confirmar Venta ✓'}
        </button>
      </div>
      </fieldset>
    </form>
  );
}
