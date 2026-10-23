'use client';

import Icon from '@/components/Icon';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Scanner from '@/components/Scanner';
import ConfirmacionForm from '@/components/ConfirmacionForm';
import { VentaOCR } from '@/types/venta';
import Link from 'next/link';
import { enqueueSale, withQueueLock } from '@/lib/offlineQueue';
import { chileDate } from '@/lib/validation';
import type { Venta } from '@/types/venta';
import { parseSaleDraft, type SaleDraft } from '@/lib/draft';
import {
  SALE_DRAFT_KEY,
  adoptSaleDraft,
  readSaleFormContext,
  clearGuidedSaleHandoff,
  clearSaleFormActive,
  isSaleFormActive,
  loadGuidedSaleHandoff,
  markSaleFormActive,
  type GuidedSaleHandoff,
} from '@/lib/guidedSale';

const money = (value: number) => value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const choiceButton = 'min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-label-md text-label-md transition-colors disabled:opacity-40';

function readDraft(): SaleDraft | null {
  try {
    const saved = sessionStorage.getItem(SALE_DRAFT_KEY);
    return saved ? parseSaleDraft(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

interface InitialSessionState {
  handoff: GuidedSaleHandoff | null;
  draft: SaleDraft | null;
  /** Only an explicitly adopted form reopens; unrelated old drafts still require a choice. */
  active: boolean;
  formContext: { plu: string; name: string } | null;
  adoptionError: string;
}

const EMPTY_SESSION_STATE: InitialSessionState = {
  handoff: null,
  draft: null,
  active: false,
  formContext: null,
  adoptionError: '',
};
let initialSessionState: InitialSessionState | null = null;

function getInitialSessionState(): InitialSessionState {
  if (!initialSessionState) {
    const handoff = loadGuidedSaleHandoff();
    const draft = readDraft();
    if (handoff && draft) {
      initialSessionState = {
        handoff,
        draft,
        active: isSaleFormActive(),
        formContext: handoff.product,
        adoptionError: '',
      };
    } else if (handoff) {
      // Persist the adopted form before consuming the handoff. A failed write
      // keeps the proposal in place and exposes the error instead of losing it.
      const result = adoptSaleDraft(ocrFromHandoff(handoff), undefined, undefined, handoff.product);
      initialSessionState = {
        handoff: result.ok ? null : handoff,
        draft: result.ok ? result.draft : null,
        active: result.ok,
        formContext: handoff.product,
        adoptionError: result.ok ? '' : result.error,
      };
    } else {
      initialSessionState = {
        handoff: null,
        draft,
        active: isSaleFormActive(),
        formContext: readSaleFormContext(),
        adoptionError: '',
      };
    }
  }
  return initialSessionState;
}

function resetInitialSessionState() {
  initialSessionState = null;
}

function subscribeInitialSessionState() {
  return () => {};
}

/**
 * Reads sessionStorage once on the client. useSyncExternalStore keeps the
 * server snapshot empty, so hydration never depends on browser storage.
 */
function useInitialSessionState(): InitialSessionState {
  return useSyncExternalStore(subscribeInitialSessionState, getInitialSessionState, () => EMPTY_SESSION_STATE);
}

function ocrFromDraft(draft: SaleDraft): VentaOCR {
  return {
    folio: draft.folio,
    fecha_compra: draft.fecha_compra,
    precio_producto: draft.precio_producto,
    cantidad_unidades: draft.cantidad_unidades,
    valor_garantia: draft.valor_garantia,
    total_boleta: draft.total_boleta,
    canal: draft.canal,
    numero_pedido: draft.numero_pedido,
    anos_garantia: draft.anos_garantia,
    tipo_garantia: draft.tipo_garantia,
  };
}

function ocrFromHandoff(handoff: GuidedSaleHandoff): VentaOCR {
  return {
    folio: '',
    fecha_compra: chileDate(),
    precio_producto: handoff.sale.precio_producto,
    cantidad_unidades: handoff.sale.cantidad_unidades,
    valor_garantia: handoff.sale.valor_garantia,
    total_boleta: handoff.sale.total_boleta,
    canal: handoff.sale.canal,
    numero_pedido: null,
    anos_garantia: handoff.sale.anos_garantia,
    tipo_garantia: handoff.sale.tipo_garantia,
  };
}

function blankSale(): VentaOCR {
  return {
    folio: '',
    fecha_compra: chileDate(),
    precio_producto: null,
    cantidad_unidades: 1,
    valor_garantia: null,
    total_boleta: null,
    canal: 'caja',
    numero_pedido: null,
    anos_garantia: 1,
    tipo_garantia: 'telefonia',
  };
}

type PendingChoice = {
  handoff: GuidedSaleHandoff | null;
  draft: SaleDraft;
  /** Scanned receipt data competing with an existing draft. */
  incoming?: VentaOCR;
};

export default function RegistroPage() {
  const initial = useInitialSessionState();
  const [resolvedInitial, setResolvedInitial] = useState(false);
  const [scannedData, setScannedData] = useState<VentaOCR | null>(null);
  const [successData, setSuccessData] = useState<{ comision: number, folio: string, pending?: boolean } | null>(null);
  const [productContext, setProductContext] = useState<{ plu: string; name: string } | null>(null);
  const [chosenDraft, setChosenDraft] = useState<SaleDraft | null>(null);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [transitionError, setTransitionError] = useState('');
  const [dismissedAdoptionError, setDismissedAdoptionError] = useState(false);

  useEffect(() => () => resetInitialSessionState(), []);

  const initialChoice: PendingChoice | null = !resolvedInitial && initial.handoff && initial.draft
    ? { handoff: initial.handoff, draft: initial.draft }
    : null;
  const displayedChoice = pendingChoice ?? initialChoice;
  const initialForm = !resolvedInitial && !pendingChoice
    ? initial.active && initial.draft
      ? { initialData: ocrFromDraft(initial.draft), initialDraft: initial.draft, productContext: initial.formContext }
      : initial.handoff
        ? { initialData: ocrFromHandoff(initial.handoff), initialDraft: null, productContext: initial.formContext }
        : null
    : null;
  const displayedScanned = scannedData ?? initialForm?.initialData ?? null;
  const displayedDraft = chosenDraft ?? initialForm?.initialDraft ?? null;
  const displayedProductContext = productContext ?? initialForm?.productContext ?? null;
  const displayedError = successData
    ? ''
    : transitionError || (!dismissedAdoptionError ? initial.adoptionError : '');
  const newChoiceLabel = displayedChoice?.handoff
    ? 'Usar la propuesta nueva'
    : displayedChoice?.incoming
      ? 'Usar la boleta escaneada'
      : 'Empezar una venta nueva';
  const newChoiceHelp = displayedChoice?.handoff
    ? 'La propuesta nueva reemplaza el borrador solo si la eliges. Si continúas el borrador, la propuesta se descarta.'
    : displayedChoice?.incoming
      ? 'La boleta escaneada reemplaza el borrador solo si la eliges. Si continúas el borrador, lo escaneado se descarta.'
      : 'Al empezar una venta nueva se descarta el borrador anterior.';

  const handleScanSuccess = (data: VentaOCR) => {
    const draft = readDraft();
    setResolvedInitial(true);
    setChosenDraft(null);
    setProductContext(null);
    setSuccessData(null);
    setTransitionError('');
    setDismissedAdoptionError(true);
    if (draft) {
      setPendingChoice({ handoff: null, draft, incoming: data });
      return;
    }
    const adoption = adoptSaleDraft(data);
    setScannedData(data);
    if (adoption.ok) setChosenDraft(adoption.draft);
    else setTransitionError(adoption.error);
  };

  const startBlankSale = () => {
    const initial = blankSale();
    const adoption = adoptSaleDraft(initial);
    setResolvedInitial(true);
    setPendingChoice(null);
    setChosenDraft(adoption.ok ? adoption.draft : null);
    setProductContext(null);
    setScannedData(initial);
    setSuccessData(null);
    setTransitionError(adoption.ok ? '' : adoption.error);
    setDismissedAdoptionError(adoption.ok);
  };

  const handleManualEntry = () => {
    setDismissedAdoptionError(true);
    const draft = readDraft();
    if (draft) {
      setTransitionError('');
      setPendingChoice({ handoff: null, draft });
      return;
    }
    startBlankSale();
  };

  const handleDraftSaved = () => {
    // First successful edit after a failed adoption also consumes the handoff,
    // but only because the draft was already persisted by the form.
    clearGuidedSaleHandoff();
    markSaleFormActive();
    setDismissedAdoptionError(true);
    setTransitionError('');
  };

  const continueDraft = () => {
    if (!displayedChoice) return;
    clearGuidedSaleHandoff();
    markSaleFormActive();
    setResolvedInitial(true);
    setChosenDraft(displayedChoice.draft);
    setProductContext(readSaleFormContext());
    setScannedData(ocrFromDraft(displayedChoice.draft));
    setPendingChoice(null);
    setTransitionError('');
    setDismissedAdoptionError(true);
  };

  const useNewProposal = () => {
    if (!displayedChoice) return;
    const handoff = displayedChoice.handoff;
    const incoming = displayedChoice.incoming;
    const initial = incoming ?? (handoff ? ocrFromHandoff(handoff) : blankSale());
    // Persist first; adoptSaleDraft only consumes the handoff after a
    // successful write. On failure the old draft and proposal stay intact.
    const adoption = adoptSaleDraft(initial, undefined, undefined, handoff?.product ?? null);
    if (!adoption.ok) {
      setTransitionError(adoption.error);
      return;
    }
    setResolvedInitial(true);
    setPendingChoice(null);
    setChosenDraft(adoption.draft);
    setProductContext(handoff?.product ?? null);
    setScannedData(initial);
    setSuccessData(null);
    setTransitionError('');
    setDismissedAdoptionError(true);
  };

  const handleConfirm = async (data: unknown) => {
    try {
      const res = await fetch('/api/ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 409) {
          throw new Error('Esta boleta ya fue ingresada (folio duplicado).');
        }
        if (res.status >= 500) {
          throw new Error('SERVER_ERROR');
        }
        throw new Error(errorData.error || 'Error al guardar la venta');
      }

      const savedData = await res.json();
      setSuccessData({
        comision: savedData.comision_calculada || 0,
        folio: savedData.folio || 'Desconocido'
      });
      clearGuidedSaleHandoff();
      clearSaleFormActive();
      setResolvedInitial(true);
      setScannedData(null);
      setProductContext(null);
      setChosenDraft(null);
      setPendingChoice(null);
      setTransitionError('');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error de red';
      // Detectar fallas de red o errores 500 del servidor
      if (error instanceof TypeError || !navigator.onLine || msg === 'SERVER_ERROR' || msg.toLowerCase().includes('network')) {
        try {
          await withQueueLock(() => enqueueSale(localStorage, data as Venta));
          window.dispatchEvent(new Event('trackretail:storage'));
        } catch {
          throw new Error('No se pudo guardar en este dispositivo. Conserva el formulario y vuelve a intentar.');
        }
        
        // Simular éxito para no bloquear al usuario
        setSuccessData({
          comision: 0, 
          folio: (data as VentaOCR).folio || '', pending: true,
        });
        clearGuidedSaleHandoff();
        clearSaleFormActive();
        setResolvedInitial(true);
        setScannedData(null);
        setProductContext(null);
        setChosenDraft(null);
        setPendingChoice(null);
        setTransitionError('');
        return;
      }
      throw error; // Lanzar errores normales (como duplicados 409) para que ConfirmacionForm los atrape
    }
  };

  const handleCancel = () => {
    clearGuidedSaleHandoff();
    clearSaleFormActive();
    setResolvedInitial(true);
    setScannedData(null);
    setProductContext(null);
    setChosenDraft(null);
    setPendingChoice(null);
    setTransitionError('');
    setDismissedAdoptionError(true);
  };

  return (
    <div className="max-w-2xl mx-auto w-full">
      {/* Header */}
      <header className="pb-8 border-b border-white/5 mb-8">
        <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface">
          Nueva Boleta
        </h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-2">
          Escanea o sube una boleta para registrar tu comisión.
        </p>
      </header>

      {displayedError && (
        <div role="alert" className="mb-6 rounded-xl border border-error/40 bg-error/10 p-4 text-sm text-error">
          {displayedError}
        </div>
      )}

      {/* Vistas Principales */}
      {successData ? (
        <div className="glass-panel rounded-2xl p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(78,222,163,0.3)]">
            <Icon className=" text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</Icon>
          </div>
          <h3 className="font-display-md text-display-md text-on-surface mb-2">{successData.pending ? 'Boleta pendiente de sincronización' : '¡Boleta Registrada!'}</h3>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            La boleta folio <strong className="text-on-surface break-all">{successData.folio}</strong> {successData.pending ? 'está guardada únicamente en este dispositivo. Se reintentará al recuperar conexión o abrir la aplicación. No borres los datos del navegador.' : 'fue procesada y guardada exitosamente en tu base de datos.'}
          </p>
          
          <div className="bg-black/20 rounded-xl p-4 inline-block min-w-[200px] mb-8 border border-white/5">
            <p className="font-label-sm text-label-sm text-on-surface-variant mb-1">Comisión Calculada</p>
            <p className="font-headline-lg text-headline-lg text-secondary">{successData.pending ? 'Pendiente' : `$${successData.comision.toLocaleString('es-CL')}`}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/historial"
              className="flex-1 max-w-[200px] mx-auto sm:mx-0 bg-surface-container border border-white/10 text-on-surface font-label-md text-label-md py-3 px-6 rounded-xl hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
            >
              <Icon className=" text-[20px]">receipt_long</Icon>
              Ver Historial
            </Link>
            <button
              onClick={() => setSuccessData(null)}
              className="flex-1 max-w-[200px] mx-auto sm:mx-0 bg-gradient-to-r from-primary-container to-inverse-primary text-on-primary-container font-label-md text-label-md py-3 px-6 rounded-xl hover:scale-[1.02] transition-transform shadow-[0_0_15px_rgba(77,142,255,0.3)] flex items-center justify-center gap-2"
            >
              <Icon className=" text-[20px]">qr_code_scanner</Icon>
              Registrar Otra
            </button>
          </div>
        </div>
      ) : displayedChoice ? (
        <section aria-labelledby="draft-choice-title" className="glass-panel rounded-2xl p-6 space-y-5">
          <div>
            <h3 id="draft-choice-title" className="font-headline-md text-headline-md text-on-surface mb-2">Hay un borrador sin guardar</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              No reemplazamos automáticamente lo que ya estabas registrando. Elige explícitamente cómo continuar.
            </p>
          </div>

          <div className="rounded-xl border border-surface-border bg-surface-base p-4">
            <p className="font-label-sm text-label-sm text-secondary font-semibold mb-1">Borrador anterior</p>
            <p className="text-on-surface">
              {displayedChoice.draft.folio ? <>Folio {displayedChoice.draft.folio} · </> : 'Sin folio · '}
              {displayedChoice.draft.cantidad_unidades} {displayedChoice.draft.cantidad_unidades === 1 ? 'unidad' : 'unidades'} · Total {money(displayedChoice.draft.total_boleta)}
            </p>
            <p className="mt-1 text-sm text-on-surface-variant">Precio {money(displayedChoice.draft.precio_producto)} · Garantía {money(displayedChoice.draft.valor_garantia)}</p>
          </div>

          {displayedChoice.handoff && (
            <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-4">
              <p className="font-label-sm text-label-sm text-secondary font-semibold mb-1">Nueva propuesta desde el catálogo</p>
              <p className="text-on-surface break-words">{displayedChoice.handoff.product.name}</p>
              <p className="mt-1 text-sm text-on-surface-variant">PLU {displayedChoice.handoff.product.plu} · Total propuesto {money(displayedChoice.handoff.sale.total_boleta)}</p>
            </div>
          )}

          {displayedChoice.incoming && (
            <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-4">
              <p className="font-label-sm text-label-sm text-secondary font-semibold mb-1">Boleta escaneada</p>
              <p className="text-on-surface">
                {displayedChoice.incoming.folio ? <>Folio {displayedChoice.incoming.folio} · </> : 'Sin folio · '}
                {displayedChoice.incoming.total_boleta === null ? 'Total sin confirmar' : <>Total {money(displayedChoice.incoming.total_boleta)}</>}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={continueDraft} className={`${choiceButton} bg-secondary text-on-secondary hover:opacity-90`}>
              Continuar borrador anterior
            </button>
            <button type="button" onClick={useNewProposal} className={`${choiceButton} border border-surface-border text-on-surface hover:bg-surface-base`}>
              {newChoiceLabel}
            </button>
          </div>
          <p className="text-xs text-on-surface-variant">{newChoiceHelp}</p>
        </section>
      ) : !displayedScanned ? (
        <Scanner onScanSuccess={handleScanSuccess} onManualEntry={handleManualEntry} />
      ) : (
        <ConfirmacionForm
          initialData={displayedScanned}
          initialDraft={displayedDraft}
          productContext={displayedProductContext}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onDraftSaved={handleDraftSaved}
        />
      )}
    </div>
  );
}
