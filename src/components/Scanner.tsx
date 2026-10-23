'use client';

import Icon from '@/components/Icon';
import ReceiptReaderStatus from '@/components/ReceiptReaderStatus';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { VentaOCR } from '@/types/venta';
import { Haptics } from '@/lib/haptics';
import { prepareReceiptImage, validateReceiptFile, validateReceiptSelection } from '@/lib/receiptImage';
import { parsePrintedReceipt, type ParsedPrintedReceipt } from '@/lib/receiptParser';
import {
  LOCAL_OCR_MAX_PIXELS,
  LOCAL_OCR_TIMEOUT_MS,
  localOcrFailureMessage,
  recognizeReceiptLocally,
  type LocalOcrProgress,
} from '@/lib/localReceiptOcr';

interface ScannerProps {
  onScanSuccess: (data: VentaOCR) => void;
  onManualEntry: () => void;
}

type Selection = { file: File; preview: string | null };
type AnalysisMode = 'local' | 'cloud';
type LocalOutcome = ParsedPrintedReceipt & { confidence: number | null };

const CLOUD_TIMEOUT_MS = 65_000;

const money = (value: number | null) => typeof value === 'number'
  ? value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
  : 'Sin confirmar';

function resultRows(data: VentaOCR): [string, string][] {
  return [
    ['Folio', data.folio ?? 'Sin confirmar'],
    ['Fecha', data.fecha_compra ?? 'Sin confirmar'],
    ['Precio del producto', money(data.precio_producto)],
    ['Cantidad', data.cantidad_unidades === null ? 'Sin confirmar' : `${data.cantidad_unidades} ${data.cantidad_unidades === 1 ? 'unidad' : 'unidades'}`],
    ['Garantía', money(data.valor_garantia)],
    ['Total de la boleta', money(data.total_boleta)],
    ['Canal', data.canal === 'caja' ? 'Caja' : data.canal === 'internet' ? 'Internet' : 'Sin confirmar'],
    ['N° de pedido', data.numero_pedido ?? 'Sin confirmar'],
  ];
}

function WarningList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="mt-3">
      <p className="flex items-center gap-2 text-sm font-medium text-on-surface"><Icon className="text-[20px] text-warning">warning</Icon>Avisos de la lectura</p>
      <ul className="mt-1 list-disc space-y-1 pl-7 text-sm text-on-surface-variant">
        {warnings.map((warning) => <li key={warning}>{warning}</li>)}
      </ul>
    </div>
  );
}

export default function Scanner({ onScanSuccess, onManualEntry }: ScannerProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [mode, setMode] = useState<AnalysisMode>('local');
  const [stage, setStage] = useState<'ready' | 'preparing' | 'analyzing'>('ready');
  const [progress, setProgress] = useState<LocalOcrProgress | null>(null);
  const [localOutcome, setLocalOutcome] = useState<LocalOutcome | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const previewUrl = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = stage !== 'ready';
  const localPdf = mode === 'local' && selection?.file.type === 'application/pdf';
  const percent = progress?.percent ?? null;

  useEffect(() => {
    mounted.current = true;
    const operationGeneration = generation;
    return () => {
      mounted.current = false;
      operationGeneration.current++;
      request.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  const cancel = () => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    setStage('ready');
    setProgress(null);
    setLocalOutcome(null);
    setNotice('Análisis cancelado. Puedes volver a intentarlo.');
  };

  const changeMode = (next: AnalysisMode) => {
    if (busy || next === mode) return;
    setMode(next);
    setErrorMsg(null);
    setProgress(null);
    setLocalOutcome(null);
    setNotice(next === 'local'
      ? 'Lectura local seleccionada: el motor OCR se ejecuta en tu dispositivo y no envía la foto a proveedores.'
      : 'Lectura en la nube seleccionada. La foto se enviará a los proveedores configurados y puede consumir cuota o generar costos.');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || request.current) return;
    const error = validateReceiptSelection(file);
    setErrorMsg(error);
    setLocalOutcome(null);
    setProgress(null);
    if (error) return;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const preview = file.type !== 'application/pdf' ? URL.createObjectURL(file) : null;
    previewUrl.current = preview;
    setSelection({ file, preview });
    setPreviewFailed(false);
    setNotice(file.type === 'application/pdf' && mode === 'local'
      ? 'PDF seleccionado. La lectura local no lee PDF: elige una foto o ingresa los datos manualmente.'
      : 'Archivo listo. Revisa la boleta antes de analizar.');
  };

  const analyze = async () => {
    if (!selection || request.current) return;
    if (mode === 'local' && selection.file.type === 'application/pdf') {
      setErrorMsg('La lectura local no puede leer PDF. Elige una foto JPG, PNG o WebP, o ingresa los datos manualmente. El PDF no se envía a ningún servicio.');
      setNotice('Tu PDF sigue seleccionado. También puedes cambiar explícitamente a «Nube (opcional)» si necesitas analizarlo.');
      Haptics.error();
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    const current = ++generation.current;
    const active = () => mounted.current && current === generation.current;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('timeout'));
    }, mode === 'local' ? LOCAL_OCR_TIMEOUT_MS : CLOUD_TIMEOUT_MS);

    setErrorMsg(null);
    setNotice('');
    setLocalOutcome(null);
    setProgress(null);
    setStage('preparing');
    Haptics.medium();

    try {
      const file = await prepareReceiptImage(
        selection.file,
        controller.signal,
        mode === 'local' ? LOCAL_OCR_MAX_PIXELS : undefined,
      );
      if (!active() || controller.signal.aborted) return;

      if (mode === 'cloud') {
        const validation = validateReceiptFile(file);
        if (validation) {
          throw new Error(file.size > 8 * 1024 * 1024
            ? 'La foto sigue superando 8 MB después de prepararla. Toma otra foto o elige una imagen de menor tamaño.'
            : validation);
        }
      } else if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        throw new Error('La lectura local necesita una imagen JPG, PNG o WebP. Elige una foto o ingresa los datos manualmente.');
      }

      if (mode === 'local') {
        setStage('analyzing');
        const result = await recognizeReceiptLocally(file, {
          signal: controller.signal,
          onProgress: (value) => { if (active()) setProgress(value); },
        });
        if (!active()) return;
        const parsed = parsePrintedReceipt(result.text, result.confidence);
        setLocalOutcome({ ...parsed, confidence: result.confidence });
        if (parsed.hasUsefulData) {
          setNotice('Lectura local completada. Revisa los datos antes de continuar.');
          Haptics.success();
        } else {
          setNotice('');
          Haptics.error();
        }
        return;
      }

      const formData = new FormData();
      formData.append('image', file);
      setStage('analyzing');
      const response = await fetch('/api/ocr', { method: 'POST', body: formData, signal: controller.signal });
      const rawText = await response.text();
      if (!active()) return;
      let data: VentaOCR & { error?: string };
      try { data = JSON.parse(rawText); }
      catch { throw new Error('No pudimos leer la respuesta. Intenta otra vez o ingresa los datos manualmente.'); }
      if (!response.ok) throw new Error(data?.error || 'No se pudo analizar la boleta. Intenta con una foto más clara.');
      if (!data || typeof data !== 'object') throw new Error('No se encontraron datos. Prueba con otra foto.');
      Haptics.success();
      onScanSuccess(data);
    } catch (error: unknown) {
      if (!active()) return;
      const localMessage = timedOut
        ? 'La lectura local tardó demasiado. Conserva la foto e intenta con una imagen más pequeña o ingresa los datos manualmente.'
        : localOcrFailureMessage(error);
      const cloudMessage = timedOut
        ? 'El análisis tardó demasiado. Revisa tu conexión y vuelve a intentarlo.'
        : error instanceof TypeError
          ? 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.'
          : error instanceof Error ? error.message : 'No se pudo analizar la boleta. Vuelve a intentarlo.';
      setErrorMsg(mode === 'local' ? localMessage : cloudMessage);
      Haptics.error();
    } finally {
      clearTimeout(timeout);
      if (active()) {
        request.current = null;
        setStage('ready');
      }
    }
  };

  const confirmLocalResult = () => {
    if (!localOutcome?.hasUsefulData) return;
    const data = localOutcome.fields;
    setLocalOutcome(null);
    onScanSuccess(data);
  };

  const buttonStyle = 'min-h-12 rounded-xl px-4 py-3 font-label-md flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-50';

  return (
    <section aria-labelledby="receipt-scanner-title" className="bg-surface-elevated border border-surface-border rounded-2xl p-6 md:p-8 shadow-sm">
      <h2 id="receipt-scanner-title" className="font-headline-md text-headline-md text-on-surface mb-1">Escanear boleta</h2>
      <p className="font-body-md text-body-md text-on-surface-variant mb-6">Toma una foto, revisa que se lea bien y analiza los datos.</p>

      <fieldset disabled={busy} className={`mb-5 ${busy ? 'opacity-60' : ''}`}>
        <legend className="mb-2 font-label-md text-label-md text-on-surface">Método de lectura</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${mode === 'local' ? 'border-primary bg-primary/10' : 'border-surface-border bg-surface-base hover:border-primary/50'}`}>
            <input type="radio" name="ocr-mode" value="local" checked={mode === 'local'} onChange={() => changeMode('local')} className="mt-1 accent-primary" />
            <span>
              <span className="flex items-center gap-2 font-label-md text-on-surface"><Icon className="text-[20px] text-primary">smartphone</Icon>Local (gratis)</span>
              <span className="mt-1 block text-sm text-on-surface-variant">Motor OCR en tu navegador. No necesitas clave de API y la foto no se envía a proveedores.</span>
            </span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${mode === 'cloud' ? 'border-primary bg-primary/10' : 'border-surface-border bg-surface-base hover:border-primary/50'}`}>
            <input type="radio" name="ocr-mode" value="cloud" checked={mode === 'cloud'} onChange={() => changeMode('cloud')} className="mt-1 accent-primary" />
            <span>
              <span className="flex items-center gap-2 font-label-md text-on-surface"><Icon className="text-[20px] text-primary">cloud</Icon>Nube (opcional)</span>
              <span className="mt-1 block text-sm text-on-surface-variant">Envía la foto a los proveedores configurados. La cuota gratuita o el costo no están garantizados.</span>
            </span>
          </label>
        </div>
      </fieldset>

      <ReceiptReaderStatus mode={mode} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={handleFileChange} disabled={busy} className="hidden" aria-label="Tomar foto de la boleta" />
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf" onChange={handleFileChange} disabled={busy} className="hidden" aria-label="Elegir imagen o PDF de la boleta" />

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={() => cameraInput.current?.click()} className={`${buttonStyle} bg-primary text-on-primary hover:bg-primary/90`}>
          <Icon className="text-[22px]">photo_camera</Icon>{selection ? 'Volver a tomar foto' : 'Tomar foto'}
        </button>
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className={`${buttonStyle} border border-surface-border bg-surface-base text-on-surface hover:border-primary/50`}>
          <Icon className="text-[22px]">upload_file</Icon>{selection ? 'Cambiar archivo' : 'Elegir imagen o PDF'}
        </button>
      </div>
      <p className="text-sm text-on-surface-variant mt-3 mb-5">Incluye la boleta completa, con buena luz y sin sombras. Fotos JPG, PNG, WebP o HEIC/HEIF hasta 24 MB; PDF hasta 8 MB solo en modo nube. La lectura local prepara la foto en tu dispositivo y no envía la imagen a proveedores. HEIC/HEIF requiere un navegador que pueda convertirlo.</p>

      {selection && (
        <div className="rounded-2xl border border-surface-border bg-surface-base p-4 mb-4">
          {selection.preview && !previewFailed ? (
            <div className="mb-3">
              {/* Keep the entire local photo visible without cropping or nested scrolling. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={selection.preview} src={selection.preview} onError={() => { if (previewUrl.current === selection.preview) setPreviewFailed(true); }} alt="Vista previa completa de la boleta seleccionada" className="w-full h-auto max-h-[28rem] object-contain rounded-xl bg-white" />
              <button type="button" onClick={() => previewDialog.current?.showModal()} aria-haspopup="dialog" className={`${buttonStyle} mt-2 w-full border border-surface-border text-on-surface`}>
                <Icon className="text-[20px]">zoom_in</Icon>Ampliar foto
              </button>
              <dialog ref={previewDialog} aria-labelledby="receipt-preview-title" className="m-auto w-[calc(100%_-_2rem)] max-w-5xl max-h-[calc(100dvh_-_2rem)] rounded-2xl border border-surface-border bg-surface-elevated p-4 text-on-surface shadow-xl backdrop:bg-black/60">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="receipt-preview-title" className="font-label-md">Foto completa de la boleta</h3>
                  <button type="button" onClick={() => previewDialog.current?.close()} className={`${buttonStyle} shrink-0 border border-surface-border text-on-surface`}>
                    <Icon className="text-[20px]">close</Icon>Cerrar
                  </button>
                </div>
                {/* Native modal dialog provides focus trapping, restoration and Escape dismissal. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selection.preview} alt="Boleta completa ampliada" className="h-[calc(100dvh_-_11rem)] max-h-[75dvh] w-full rounded-xl bg-white object-contain" />
              </dialog>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-5 text-on-surface mb-3"><Icon className="text-primary text-[32px]">description</Icon><p>{previewFailed ? 'No se pudo mostrar la foto. Si no se puede analizar, elige una imagen JPG o usa «Tomar foto».' : 'PDF listo para analizar'}</p></div>
          )}
          <p className="text-sm font-medium text-on-surface break-all">{selection.file.name}</p>
          <p className="text-sm text-on-surface-variant mt-1 mb-4">{(selection.file.size / (1024 * 1024)).toFixed(1)} MB · {mode === 'local' ? 'La foto se procesa en tu dispositivo; la lectura local no admite PDF.' : 'Al analizar, el archivo se enviará a los proveedores de IA configurados.'}</p>

          {busy ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" aria-atomic="true" className="flex items-center gap-2 text-on-surface">
                  <Loader2 aria-hidden="true" size={20} className="animate-spin motion-reduce:animate-none text-primary" />
                  <span>{progress?.message ?? (stage === 'preparing' ? 'Preparando imagen…' : mode === 'local' ? 'Preparando lectura local…' : 'Analizando boleta…')}</span>
                  {percent !== null && <span className="tabular-nums text-on-surface-variant">{Math.round(percent * 100)} %</span>}
                </p>
                <button type="button" onClick={cancel} className={`${buttonStyle} border border-surface-border text-on-surface`}>Cancelar</button>
              </div>
              {percent !== null && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-border" role="progressbar" aria-label="Avance de la lectura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent * 100)}>
                  <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.round(percent * 100)}%` }} />
                </div>
              )}
            </div>
          ) : localOutcome ? (
            <div className={`rounded-xl border p-4 ${localOutcome.hasUsefulData ? 'border-secondary/30 bg-secondary/5' : 'border-error/30 bg-error/10'}`}>
              <h3 className="flex items-center gap-2 font-label-md text-on-surface">
                <Icon className={`text-[20px] ${localOutcome.hasUsefulData ? 'text-secondary' : 'text-error'}`}>{localOutcome.hasUsefulData ? 'check_circle' : 'error'}</Icon>
                {localOutcome.hasUsefulData ? 'Datos leídos en tu dispositivo' : 'No pudimos leer datos útiles'}
              </h3>
              {localOutcome.hasUsefulData ? (
                <>
                  <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    {resultRows(localOutcome.fields).map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3 border-b border-surface-border/60 py-1">
                        <dt className="text-on-surface-variant">{label}</dt>
                        <dd className="text-right font-medium text-on-surface break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {localOutcome.confidence !== null && (
                    <p className="mt-3 text-sm text-on-surface-variant">Confianza estimada del motor: {Math.round(localOutcome.confidence)} %. Es orientativa; confirma cada dato.</p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">Conserva la foto y vuelve a intentarlo con mejor luz, o ingresa los datos manualmente. No inventamos montos ni datos faltantes.</p>
              )}
              <WarningList warnings={localOutcome.warnings} />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                {localOutcome.hasUsefulData && (
                  <button type="button" onClick={confirmLocalResult} className={`${buttonStyle} flex-1 bg-primary text-on-primary hover:bg-primary/90`}>
                    <Icon className="text-[20px]">edit</Icon>Revisar y completar datos
                  </button>
                )}
                <button type="button" onClick={analyze} className={`${buttonStyle} flex-1 border border-surface-border text-on-surface hover:bg-surface-elevated`}>
                  <Icon className="text-[20px]">document_scanner</Icon>{localOutcome.hasUsefulData ? 'Analizar de nuevo' : 'Reintentar análisis'}
                </button>
              </div>
              <p className="mt-3 text-xs text-on-surface-variant">La lectura no guarda la venta. Debes confirmar y completar los datos en el formulario.</p>
            </div>
          ) : localPdf ? (
            <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-on-surface">
              <p className="flex items-center gap-2 font-medium"><Icon className="text-[20px] text-warning">warning</Icon>Este PDF no se puede leer localmente</p>
              <p className="mt-1 text-on-surface-variant">La lectura local solo trabaja con imágenes. Elige una foto JPG, PNG o WebP, o ingresa los datos manualmente. No enviamos el PDF a ningún servicio. Si necesitas analizarlo, cambia explícitamente a «Nube (opcional)» arriba.</p>
            </div>
          ) : (
            <button type="button" onClick={analyze} className={`${buttonStyle} w-full bg-primary text-on-primary hover:bg-primary/90`}><Icon className="text-[20px]">document_scanner</Icon>{errorMsg ? 'Reintentar análisis' : mode === 'local' ? 'Analizar localmente' : 'Analizar en la nube'}</button>
          )}
        </div>
      )}
      {errorMsg && <p role="alert" className="rounded-xl border border-error/30 bg-error/10 text-error p-4 mb-4 text-sm">{errorMsg} {selection && 'Tu archivo sigue seleccionado.'}</p>}
      <p role="status" aria-atomic="true" className="text-sm text-on-surface-variant mb-4">{notice}</p>
      <button type="button" onClick={() => { cancel(); onManualEntry(); }} className={`${buttonStyle} w-full border border-surface-border text-on-surface-variant hover:bg-surface-base hover:text-on-surface`}>
        <Icon className="text-[20px]">keyboard</Icon>Ingresar datos manualmente
      </button>
    </section>
  );
}
