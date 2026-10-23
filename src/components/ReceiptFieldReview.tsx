'use client';

import Icon from '@/components/Icon';
import { useState } from 'react';
import type { ParsedPrintedReceipt } from '@/lib/receiptParser';
import type { VentaOCR } from '@/types/venta';

export interface LocalReviewOutcome extends ParsedPrintedReceipt {
  confidence: number | null;
  /** Raw OCR text kept only in component memory for local review. */
  transcription?: string;
}

interface ReceiptFieldReviewProps {
  outcome: LocalReviewOutcome;
  /** Raw local OCR text; never sent to cloud, logs or storage. */
  transcription?: string;
  /** Object URL of the exact prepared image the OCR engine read. */
  preparedUrl: string | null;
  onConfirm: () => void;
  onRetry: () => void;
}

type FieldKey = keyof VentaOCR;

interface FieldRow {
  key: FieldKey;
  label: string;
  value: string;
  note?: string;
}

const buttonStyle = 'min-h-11 rounded-xl px-3 py-2 font-label-sm text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50';

const money = (value: number | null | undefined) => typeof value === 'number'
  ? value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
  : 'Sin confirmar';

function fieldRows(data: VentaOCR): FieldRow[] {
  return [
    { key: 'folio', label: 'Folio', value: data.folio ?? 'Sin confirmar' },
    { key: 'fecha_compra', label: 'Fecha', value: data.fecha_compra ?? 'Sin confirmar' },
    { key: 'precio_producto', label: 'Precio del producto', value: money(data.precio_producto) },
    {
      key: 'cantidad_unidades',
      label: 'Cantidad',
      value: data.cantidad_unidades === null || data.cantidad_unidades === undefined
        ? 'Sin confirmar'
        : `${data.cantidad_unidades} ${data.cantidad_unidades === 1 ? 'unidad' : 'unidades'}`,
    },
    { key: 'valor_garantia', label: 'Garantía', value: money(data.valor_garantia) },
    { key: 'total_boleta', label: 'Total de la boleta', value: money(data.total_boleta) },
    {
      key: 'canal',
      label: 'Canal',
      value: data.canal === 'caja' ? 'Caja' : data.canal === 'internet' ? 'Internet' : 'Sin confirmar',
    },
    { key: 'numero_pedido', label: 'N° de pedido', value: data.numero_pedido ?? 'Sin confirmar' },
    {
      key: 'anos_garantia',
      label: 'Años de garantía',
      value: typeof data.anos_garantia === 'number'
        ? `${data.anos_garantia} ${data.anos_garantia === 1 ? 'año' : 'años'}`
        : 'Sin confirmar',
      note: 'Solo se muestra si la boleta lo indica de forma explícita.',
    },
    {
      key: 'tipo_garantia',
      label: 'Tipo de garantía',
      value: data.tipo_garantia === 'telefonia'
        ? 'Telefonía'
        : data.tipo_garantia === 'lineas_duras' ? 'Líneas duras' : 'Sin confirmar',
      note: 'No se infiere automáticamente: confírmalo en el formulario.',
    },
  ];
}

function WarningList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="mt-3 min-w-0">
      <p className="flex items-center gap-2 text-sm font-medium text-on-surface">
        <Icon className="text-[20px] text-warning">warning</Icon>Avisos de la lectura
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-7 text-sm text-on-surface-variant">
        {warnings.map((warning) => <li key={warning}>{warning}</li>)}
      </ul>
    </div>
  );
}

export default function ReceiptFieldReview({ outcome, transcription, preparedUrl, onConfirm, onRetry }: ReceiptFieldReviewProps) {
  const [selectedField, setSelectedField] = useState<FieldKey | null>(null);
  const rows = fieldRows(outcome.fields);
  const uncertain = new Set<FieldKey>(outcome.checks.uncertainFields);
  const selected = selectedField ? outcome.evidence[selectedField] : undefined;
  const selectedLabel = selectedField ? rows.find((row) => row.key === selectedField)?.label ?? selectedField : '';

  return (
    <div className={`min-w-0 rounded-xl border p-4 ${outcome.hasUsefulData ? 'border-secondary/30 bg-secondary/5' : 'border-error/30 bg-error/10'}`}>
      <h3 className="flex items-center gap-2 font-label-md text-on-surface">
        <Icon className={`text-[20px] ${outcome.hasUsefulData ? 'text-secondary' : 'text-error'}`}>{outcome.hasUsefulData ? 'check_circle' : 'error'}</Icon>
        {outcome.hasUsefulData ? 'Datos leídos en tu dispositivo' : 'No pudimos leer datos útiles'}
      </h3>

      {outcome.hasUsefulData ? (
        <>
          <p className="mt-1 text-sm text-on-surface-variant">
            Revisa cada campo. «Sin confirmar» o «Revisar» significa que debes completarlo o verificarlo en el formulario.
          </p>
          <dl className="mt-3 min-w-0 text-sm">
            {rows.map((row) => {
              const evidence = outcome.evidence[row.key];
              const needsReview = uncertain.has(row.key) || row.value === 'Sin confirmar';
              return (
                <div key={row.key} className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-surface-border/60 py-2">
                  <div className="min-w-0 flex-1">
                    <dt className="text-on-surface-variant">{row.label}</dt>
                    {row.note && <p className="mt-0.5 text-xs text-on-surface-variant">{row.note}</p>}
                  </div>
                  <div className="min-w-0 max-w-full text-right">
                    <dd className="break-words font-medium text-on-surface">{row.value}</dd>
                    {needsReview && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-on-surface">
                        <Icon className="text-[14px] text-warning">flag</Icon>
                        {row.value === 'Sin confirmar' ? 'Sin confirmar' : 'Revisar'}
                      </span>
                    )}
                    {evidence ? (
                      <button
                        type="button"
                        onClick={() => setSelectedField(selectedField === row.key ? null : row.key)}
                        aria-expanded={selectedField === row.key}
                        aria-controls="receipt-field-origin"
                        className={`${buttonStyle} ml-auto mt-1 border border-surface-border text-on-surface hover:bg-surface-elevated`}
                      >
                        <Icon className="text-[18px]">subject</Icon>
                        {selectedField === row.key ? 'Ocultar origen' : 'Ver origen'}
                      </button>
                    ) : (
                      <p className="mt-1 text-xs text-on-surface-variant">Sin línea de origen disponible.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </dl>

          {selected && (
            <div id="receipt-field-origin" className="mt-3 min-w-0 rounded-xl border border-surface-border bg-surface-elevated p-3">
              <p className="text-sm font-medium text-on-surface">Origen de {selectedLabel}</p>
              <blockquote className="mt-1 break-words rounded-lg bg-surface-base p-2 text-sm text-on-surface">
                «{selected.source.text}»
              </blockquote>
              {selected.source.bbox && preparedUrl ? (
                <div className="mt-2 min-w-0">
                  <div className="relative overflow-hidden rounded-lg border border-surface-border bg-white">
                    {/* The prepared image is the exact OCR input and the boxes are normalized to it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preparedUrl} alt="Imagen preparada con la línea reconocida marcada" className="block h-auto w-full" />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/20"
                      style={{
                        left: `${selected.source.bbox.x * 100}%`,
                        top: `${selected.source.bbox.y * 100}%`,
                        width: `${selected.source.bbox.width * 100}%`,
                        height: `${selected.source.bbox.height * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    La marca usa solo las coordenadas del motor sobre esta misma imagen preparada. Si no es fiable, guíate por la línea de texto.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-on-surface-variant">No hay coordenadas fiables para marcar la imagen; mostramos solo la línea de texto.</p>
              )}
            </div>
          )}

          {outcome.confidence !== null && (
            <p className="mt-3 text-sm text-on-surface-variant">
              Confianza estimada del motor: {Math.round(outcome.confidence)} %. Es orientativa; confirma cada dato.
            </p>
          )}

          {transcription && transcription.trim() && (
            <details className="mt-3 min-w-0 rounded-xl border border-surface-border bg-surface-elevated">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <Icon className="text-[20px] text-on-surface-variant">notes</Icon>
                <span className="min-w-0">Texto leído sin corregir · Ver transcripción completa</span>
              </summary>
              <div className="border-t border-surface-border p-3">
                <pre aria-label="Transcripción completa del texto leído sin corregir" className="max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-base p-2 font-mono text-xs leading-relaxed text-on-surface">{transcription}</pre>
                <p className="mt-2 text-xs text-on-surface-variant">
                  Es el texto crudo del motor local, con posibles errores y datos que no se asignaron a ningún campo. No se envía a la nube, analítica, registros ni almacenamiento.
                </p>
              </div>
            </details>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-on-surface-variant">
          Conserva la foto y vuelve a intentarlo con mejor luz, ajusta la foto o ingresa los datos manualmente. No inventamos montos ni datos faltantes.
        </p>
      )}

      <WarningList warnings={outcome.warnings} />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {outcome.hasUsefulData && (
          <button type="button" onClick={onConfirm} className={`${buttonStyle} min-h-12 flex-1 bg-primary text-on-primary hover:bg-primary/90`}>
            <Icon className="text-[20px]">edit</Icon>Revisar y completar datos
          </button>
        )}
        <button type="button" onClick={onRetry} className={`${buttonStyle} min-h-12 flex-1 border border-surface-border text-on-surface hover:bg-surface-elevated`}>
          <Icon className="text-[20px]">document_scanner</Icon>{outcome.hasUsefulData ? 'Analizar de nuevo' : 'Reintentar análisis'}
        </button>
      </div>
      <p className="mt-3 text-xs text-on-surface-variant">
        La lectura no guarda la venta automáticamente. Debes confirmar y completar los datos en el formulario.
      </p>
    </div>
  );
}
