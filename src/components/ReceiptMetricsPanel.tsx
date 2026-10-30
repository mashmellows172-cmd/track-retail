'use client';

import { useCallback, useSyncExternalStore } from 'react';
import Icon from '@/components/Icon';
import {
  clearOcrCorrectionMetrics,
  exportOcrCorrectionMetrics,
  loadOcrCorrectionMetrics,
  OCR_CORRECTION_FIELDS,
  setOcrCorrectionConsent,
  type OcrCorrectionCounts,
  type OcrCorrectionMetricsState,
} from '@/lib/ocrCorrectionMetrics';

const fieldLabels: Record<keyof OcrCorrectionCounts, string> = {
  folio: 'Folio',
  fecha_compra: 'Fecha de compra',
  precio_producto: 'Precio producto',
  cantidad_unidades: 'Cantidad',
  valor_garantia: 'Valor garantía',
  total_boleta: 'Total boleta',
  canal: 'Canal',
  numero_pedido: 'N° pedido',
  anos_garantia: 'Años garantía',
  tipo_garantia: 'Tipo garantía',
};

const EMPTY_COUNTS: OcrCorrectionCounts = {
  folio: 0,
  fecha_compra: 0,
  precio_producto: 0,
  cantidad_unidades: 0,
  valor_garantia: 0,
  total_boleta: 0,
  canal: 0,
  numero_pedido: 0,
  anos_garantia: 0,
  tipo_garantia: 0,
};

const SERVER_SNAPSHOT: OcrCorrectionMetricsState = {
  consent: false,
  counts: EMPTY_COUNTS,
  entries: 0,
  lastUpdated: null,
};

function emitMetricsUpdate() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('trackretail:ocr-metrics'));
  } catch {
    // ignore
  }
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onUpdate = () => callback();
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'trackretail_ocr_correction_metrics_v1' || e.key === 'trackretail_ocr_correction_consent') {
      callback();
    }
  };
  window.addEventListener('trackretail:ocr-metrics', onUpdate);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('trackretail:ocr-metrics', onUpdate);
    window.removeEventListener('storage', onStorage);
  };
}

let cachedSnapshot: OcrCorrectionMetricsState | null = null;
let cachedSnapshotStr = '';

function getSnapshot(): OcrCorrectionMetricsState {
  if (typeof window === 'undefined') {
    return SERVER_SNAPSHOT;
  }
  const state = loadOcrCorrectionMetrics();
  const str = JSON.stringify({
    consent: state.consent,
    entries: state.entries,
    lastUpdated: state.lastUpdated,
    counts: state.counts,
  });
  if (cachedSnapshot && cachedSnapshotStr === str) {
    return cachedSnapshot;
  }
  cachedSnapshot = state;
  cachedSnapshotStr = str;
  return cachedSnapshot;
}

function getServerSnapshot(): OcrCorrectionMetricsState {
  return SERVER_SNAPSHOT;
}

export default function ReceiptMetricsPanel() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const consent = state.consent;

  const toggleConsent = useCallback((next: boolean) => {
    setOcrCorrectionConsent(next);
    emitMetricsUpdate();
  }, []);

  const handleClear = useCallback(() => {
    clearOcrCorrectionMetrics();
    emitMetricsUpdate();
  }, []);

  const handleExport = () => {
    try {
      const json = exportOcrCorrectionMetrics();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ocr-correction-metrics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const totalCorrections = OCR_CORRECTION_FIELDS.reduce((sum, field) => sum + (state.counts[field] || 0), 0);

  return (
    <section aria-labelledby="ocr-metrics-title" className="bg-surface-elevated border border-surface-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 id="ocr-metrics-title" className="font-headline-md text-headline-md text-on-surface mb-1 flex items-center gap-2">
            <Icon className="text-[22px] text-primary">bar_chart</Icon>
            Métricas de corrección OCR (privadas)
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Opt-in desactivado por defecto. Solo se guardan nombres de campo y conteos agregados. Nunca se guardan valores originales/corregidos, folios, vendedores, OCR crudo, fotos o transcripciones. Se cuenta una vez por intento de registro tras lectura OCR revisada (incluyendo campos sin cambio), con consentimiento; no se requiere guardar con éxito. Máximo 50 comparaciones.
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-surface-border bg-surface-base p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => toggleConsent(e.target.checked)}
            className="mt-1 accent-primary"
            aria-describedby="ocr-metrics-consent-help"
          />
          <span>
            <span className="font-label-md text-on-surface">Habilitar recolección de correcciones</span>
            <span id="ocr-metrics-consent-help" className="mt-1 block text-sm text-on-surface-variant">
              Solo se cuenta cuando existe una línea base de OCR revisada explícitamente y se envía el formulario (intento tras revisión). Los borradores manuales/guiados no se cuentan. Solo conteo por campo, agregados y sin valores.
            </span>
          </span>
        </label>
      </div>

      {!consent && (
        <p className="mb-4 text-sm text-on-surface-variant">La recolección está desactivada. Actívala para empezar a acumular conteos agregados locales.</p>
      )}

      {consent && (
        <>
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-surface-border bg-surface-base p-3">
              <p className="text-xs text-on-surface-variant">Comparaciones registradas</p>
              <p className="text-lg font-semibold text-on-surface">{state.entries}</p>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface-base p-3">
              <p className="text-xs text-on-surface-variant">Campos corregidos (total)</p>
              <p className="text-lg font-semibold text-on-surface">{totalCorrections}</p>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface-base p-3">
              <p className="text-xs text-on-surface-variant">Última actualización</p>
              <p className="text-sm text-on-surface break-all">{state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : '—'}</p>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-surface-border bg-surface-base overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left p-3 font-label-sm text-on-surface-variant">Campo</th>
                  <th className="text-right p-3 font-label-sm text-on-surface-variant">Correcciones</th>
                </tr>
              </thead>
              <tbody>
                {OCR_CORRECTION_FIELDS.map((field) => (
                  <tr key={field} className="border-b border-surface-border/60 last:border-0">
                    <td className="p-3 text-on-surface">{fieldLabels[field]}</td>
                    <td className="p-3 text-right text-on-surface tabular-nums">{state.counts[field] || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={handleExport} className="min-h-11 flex-1 border border-surface-border rounded-xl px-4 py-2 text-on-surface hover:bg-surface-base flex items-center justify-center gap-2">
              <Icon className="text-[18px]">download</Icon>
              Exportar JSON (solo agregados)
            </button>
            <button type="button" onClick={handleClear} className="min-h-11 flex-1 border border-error/40 text-error rounded-xl px-4 py-2 hover:bg-error/10 flex items-center justify-center gap-2">
              <Icon className="text-[18px]">delete</Icon>
              Borrar métricas locales
            </button>
          </div>
        </>
      )}
    </section>
  );
}
