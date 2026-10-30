'use client';

import Icon from '@/components/Icon';
import ReceiptFieldReview, { type LocalReviewOutcome } from '@/components/ReceiptFieldReview';
import ReceiptPhotoAdjustments, { type PhotoEnhancement } from '@/components/ReceiptPhotoAdjustments';
import ReceiptReaderStatus from '@/components/ReceiptReaderStatus';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { VentaOCR } from '@/types/venta';
import { Haptics } from '@/lib/haptics';
import { captureOcrBaseline } from '@/lib/ocrCorrectionMetrics';
import {
  prepareReceiptImage,
  prepareReceiptImageForOcr,
  validateReceiptFile,
  validateReceiptSelection,
  type PrepareReceiptImageOptions,
  type PreparedReceiptImage,
} from '@/lib/receiptImage';
import { parsePrintedReceipt } from '@/lib/receiptParser';
import {
  DEFAULT_CROP_EDGES,
  adjustCropEdge,
  cropFromEdges,
  isFullCrop,
  nextRotation,
  type CropEdge,
  type CropEdges,
  type Rotation,
} from '@/lib/receiptAdjustments';
import {
  LOCAL_OCR_MAX_PIXELS,
  LOCAL_OCR_TIMEOUT_MS,
  LocalOcrError,
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

interface PreparedLocal {
  image: PreparedReceiptImage;
  signature: string;
  /** Object URL of the exact prepared file, used for preview and evidence boxes. */
  url: string;
}

const CLOUD_TIMEOUT_MS = 65_000;
const PREVIEW_TIMEOUT_MS = 45_000;
const DEFAULT_ENHANCEMENT: PhotoEnhancement = 'original';

function localSignature(edges: CropEdges, rotation: Rotation, enhancement: PhotoEnhancement): string {
  return `${enhancement}|${rotation}|${edges.left}|${edges.top}|${edges.right}|${edges.bottom}`;
}

export default function Scanner({ onScanSuccess, onManualEntry }: ScannerProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [mode, setMode] = useState<AnalysisMode>('local');
  const [stage, setStage] = useState<'ready' | 'preparing' | 'analyzing'>('ready');
  const [progress, setProgress] = useState<LocalOcrProgress | null>(null);
  const [localOutcome, setLocalOutcome] = useState<LocalReviewOutcome | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [edges, setEdges] = useState<CropEdges>(DEFAULT_CROP_EDGES);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [enhancement, setEnhancement] = useState<PhotoEnhancement>(DEFAULT_ENHANCEMENT);
  const [prepared, setPrepared] = useState<PreparedLocal | null>(null);
  const [applying, setApplying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const previewUrl = useRef<string | null>(null);
  const preparedUrl = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const previewRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = stage !== 'ready';
  const controlsDisabled = busy || applying;
  const localPdf = mode === 'local' && selection?.file.type === 'application/pdf';
  const percent = progress?.percent ?? null;
  const currentSignature = localSignature(edges, rotation, enhancement);
  const preparedMatches = mode === 'local' && prepared?.signature === currentSignature;

  useEffect(() => {
    mounted.current = true;
    const operationGeneration = generation;
    return () => {
      mounted.current = false;
      operationGeneration.current++;
      request.current?.abort();
      previewRequest.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      if (preparedUrl.current) URL.revokeObjectURL(preparedUrl.current);
      previewUrl.current = null;
      preparedUrl.current = null;
    };
  }, []);

  const clearPrepared = () => {
    if (preparedUrl.current) {
      URL.revokeObjectURL(preparedUrl.current);
      preparedUrl.current = null;
    }
    setPrepared(null);
  };

  const storePrepared = (image: PreparedReceiptImage, signature: string): PreparedLocal => {
    if (preparedUrl.current) URL.revokeObjectURL(preparedUrl.current);
    const url = URL.createObjectURL(image.file);
    preparedUrl.current = url;
    const next = { image, signature, url };
    setPrepared(next);
    return next;
  };

  const cancel = () => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    previewRequest.current?.abort();
    previewRequest.current = null;
    setApplying(false);
    clearPrepared();
    setStage('ready');
    setProgress(null);
    setLocalOutcome(null);
    setErrorMsg(null);
    setNotice('Análisis cancelado. Los ajustes se conservan; puedes volver a intentarlo.');
  };

  const changeMode = (next: AnalysisMode) => {
    if (controlsDisabled || next === mode) return;
    clearPrepared();
    setMode(next);
    setErrorMsg(null);
    setPreviewError(null);
    setProgress(null);
    setLocalOutcome(null);
    setNotice(next === 'local'
      ? 'Lectura local seleccionada: el motor OCR se ejecuta en tu dispositivo. Los ajustes de foto solo se aplican al modo local.'
      : 'Lectura en la nube seleccionada. La foto original se enviará a los proveedores configurados; no se aplican recortes, giros ni contraste locales. Puede consumir cuota o generar costos.');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || request.current || previewRequest.current) return;
    const error = validateReceiptSelection(file);
    setErrorMsg(error);
    setLocalOutcome(null);
    setProgress(null);
    setPreviewError(null);
    if (error) return;
    generation.current++;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    if (preparedUrl.current) {
      URL.revokeObjectURL(preparedUrl.current);
      preparedUrl.current = null;
    }
    setPrepared(null);
    const preview = file.type !== 'application/pdf' ? URL.createObjectURL(file) : null;
    previewUrl.current = preview;
    setSelection({ file, preview });
    setEdges(DEFAULT_CROP_EDGES);
    setRotation(0);
    setEnhancement(DEFAULT_ENHANCEMENT);
    setPreviewFailed(false);
    setStage('ready');
    setNotice(file.type === 'application/pdf' && mode === 'local'
      ? 'PDF seleccionado. La lectura local no lee PDF: elige una foto o ingresa los datos manualmente.'
      : 'Archivo listo. Puedes ajustar el recorte o el giro antes de analizar.');
  };

  const currentLocalOptions = (): PrepareReceiptImageOptions => {
    const crop = cropFromEdges(edges);
    return {
      mode: enhancement,
      maxPixels: LOCAL_OCR_MAX_PIXELS,
      rotation,
      ...(isFullCrop(crop) ? {} : { crop }),
    };
  };

  const invalidateForAdjustment = (message: string) => {
    if (preparedUrl.current) {
      URL.revokeObjectURL(preparedUrl.current);
      preparedUrl.current = null;
    }
    setPrepared(null);
    setLocalOutcome(null);
    setProgress(null);
    setPreviewError(null);
    setErrorMsg(null);
    setNotice(message);
  };

  const handleEdgeChange = (edge: CropEdge, value: number) => {
    setEdges((current) => adjustCropEdge(current, edge, value));
    invalidateForAdjustment('Ajustes modificados. Aplica los ajustes para ver y analizar la nueva imagen preparada.');
  };

  const handleRotate = () => {
    setRotation((current) => nextRotation(current));
    invalidateForAdjustment('Ajustes modificados. Aplica los ajustes para ver y analizar la nueva imagen preparada.');
  };

  const handleEnhancementChange = (next: PhotoEnhancement) => {
    setEnhancement(next);
    invalidateForAdjustment('Ajustes modificados. Aplica los ajustes para ver y analizar la nueva imagen preparada.');
  };

  const handleRestore = () => {
    setEdges(DEFAULT_CROP_EDGES);
    setRotation(0);
    setEnhancement('original');
    invalidateForAdjustment('Ajustes restaurados a la foto original.');
  };

  const applyAdjustments = async () => {
    if (!selection || mode !== 'local' || selection.file.type === 'application/pdf' || controlsDisabled) return;
    const controller = new AbortController();
    previewRequest.current?.abort();
    previewRequest.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('preview-timeout'));
    }, PREVIEW_TIMEOUT_MS);

    setApplying(true);
    setPreviewError(null);
    setErrorMsg(null);
    try {
      const image = await prepareReceiptImageForOcr(selection.file, controller.signal, currentLocalOptions());
      if (!mounted.current || controller.signal.aborted) return;
      storePrepared(image, currentSignature);
      setNotice('Vista previa actualizada. El análisis usará exactamente esta imagen preparada.');
    } catch (error: unknown) {
      if (!mounted.current || controller.signal.aborted && !timedOut) return;
      setPreviewError(timedOut
        ? 'La vista previa tardó demasiado. Puedes intentar de nuevo o analizar directamente; conservamos tu foto original.'
        : error instanceof Error ? error.message : 'No se pudo aplicar el ajuste a la foto. Conserva el original e inténtalo otra vez.');
    } finally {
      clearTimeout(timeout);
      if (previewRequest.current === controller) previewRequest.current = null;
      if (mounted.current) setApplying(false);
    }
  };

  const analyze = async () => {
    if (!selection || request.current || applying) return;
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
    const signature = currentSignature;
    const options = currentLocalOptions();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('timeout'));
    }, mode === 'local' ? LOCAL_OCR_TIMEOUT_MS : CLOUD_TIMEOUT_MS);

    setErrorMsg(null);
    setPreviewError(null);
    setNotice('');
    setLocalOutcome(null);
    setProgress(null);
    setStage('preparing');
    Haptics.medium();

    try {
      if (mode === 'local') {
        let preparedForAnalysis = prepared?.signature === signature ? prepared : null;
        if (!preparedForAnalysis) {
          const image = await prepareReceiptImageForOcr(selection.file, controller.signal, options);
          if (!active() || controller.signal.aborted) return;
          preparedForAnalysis = storePrepared(image, signature);
        }
        if (!active() || controller.signal.aborted) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(preparedForAnalysis.image.file.type)) {
          throw new Error('La lectura local necesita una imagen JPG, PNG o WebP. Elige una foto o ingresa los datos manualmente.');
        }

        setStage('analyzing');
        const result = await recognizeReceiptLocally(preparedForAnalysis.image.file, {
          signal: controller.signal,
          onProgress: (value) => { if (active()) setProgress(value); },
          imageSize: {
            width: preparedForAnalysis.image.width,
            height: preparedForAnalysis.image.height,
          },
        });
        if (!active()) return;
        const parsed = result.parsed ?? parsePrintedReceipt(result.text, result.confidence, result.layout ?? null);
        setLocalOutcome({ ...parsed, confidence: result.confidence, transcription: result.text });
        if (parsed.hasUsefulData) {
          setNotice('Lectura local completada. Revisa cada campo y su origen antes de continuar.');
          Haptics.success();
        } else {
          setNotice('');
          Haptics.error();
        }
        return;
      }

      // Cloud mode deliberately prepares and sends the original file flow; local
      // crop/rotation/contrast adjustments are never silently applied here.
      const file = await prepareReceiptImage(selection.file, controller.signal);
      if (!active() || controller.signal.aborted) return;
      const validation = validateReceiptFile(file);
      if (validation) {
        throw new Error(file.size > 8 * 1024 * 1024
          ? 'La foto sigue superando 8 MB después de prepararla. Toma otra foto o elige una imagen de menor tamaño.'
          : validation);
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
        : error instanceof LocalOcrError
          ? localOcrFailureMessage(error)
          : error instanceof Error ? error.message : localOcrFailureMessage(error);
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
    try {
      captureOcrBaseline(data);
    } catch {
      // ignore
    }
    onScanSuccess(data);
  };

  const buttonStyle = 'min-h-12 rounded-xl px-4 py-3 font-label-md flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-50';

  return (
    <section aria-labelledby="receipt-scanner-title" className="bg-surface-elevated border border-surface-border rounded-2xl p-6 md:p-8 shadow-sm">
      <h2 id="receipt-scanner-title" className="font-headline-md text-headline-md text-on-surface mb-1">Escanear boleta</h2>
      <p className="font-body-md text-body-md text-on-surface-variant mb-6">Toma una foto, revisa que se lea bien y analiza los datos.</p>

      <fieldset disabled={controlsDisabled} className={`mb-5 ${controlsDisabled ? 'opacity-60' : ''}`}>
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
              <span className="mt-1 block text-sm text-on-surface-variant">Envía la foto original a los proveedores configurados. La cuota gratuita o el costo no están garantizados.</span>
            </span>
          </label>
        </div>
      </fieldset>

      <ReceiptReaderStatus mode={mode} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={handleFileChange} disabled={controlsDisabled} className="hidden" aria-label="Tomar foto de la boleta" />
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf" onChange={handleFileChange} disabled={controlsDisabled} className="hidden" aria-label="Elegir imagen o PDF de la boleta" />

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={controlsDisabled} onClick={() => cameraInput.current?.click()} className={`${buttonStyle} bg-primary text-on-primary hover:bg-primary/90`}>
          <Icon className="text-[22px]">photo_camera</Icon>{selection ? 'Volver a tomar foto' : 'Tomar foto'}
        </button>
        <button type="button" disabled={controlsDisabled} onClick={() => fileInput.current?.click()} className={`${buttonStyle} border border-surface-border bg-surface-base text-on-surface hover:border-primary/50`}>
          <Icon className="text-[22px]">upload_file</Icon>{selection ? 'Cambiar archivo' : 'Elegir imagen o PDF'}
        </button>
      </div>
      <p className="text-sm text-on-surface-variant mt-3 mb-5">Incluye la boleta completa, con buena luz y sin sombras. Fotos JPG, PNG, WebP o HEIC/HEIF hasta 24 MB; PDF hasta 8 MB solo en modo nube. La lectura local prepara la foto en tu dispositivo y no envía la imagen a proveedores. HEIC/HEIF requiere un navegador que pueda convertirlo.</p>

      {selection && (
        <div className="min-w-0 rounded-2xl border border-surface-border bg-surface-base p-4 mb-4">
          {selection.preview && !previewFailed ? (
            <div className="mb-3 min-w-0">
              {/* Keep the entire local photo visible without cropping or nested scrolling. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={selection.preview} src={selection.preview} onError={() => { if (previewUrl.current === selection.preview) setPreviewFailed(true); }} alt="Vista previa completa de la boleta seleccionada" className="w-full h-auto max-h-[28rem] object-contain rounded-xl bg-white" />
              <button type="button" onClick={() => previewDialog.current?.showModal()} aria-haspopup="dialog" className={`${buttonStyle} mt-2 w-full border border-surface-border text-on-surface`}>
                <Icon className="text-[20px]">zoom_in</Icon>Ampliar foto
              </button>
              <dialog ref={previewDialog} aria-labelledby="receipt-preview-title" className="m-auto w-[calc(100%_-_2rem)] max-w-5xl max-h-[calc(100dvh_-_2rem)] rounded-2xl border border-surface-border bg-surface-elevated p-4 text-on-surface shadow-xl backdrop:bg-black/60">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="receipt-preview-title" className="font-label-md">Foto original de la boleta</h3>
                  <button type="button" onClick={() => previewDialog.current?.close()} className={`${buttonStyle} shrink-0 border border-surface-border text-on-surface`}>
                    <Icon className="text-[20px]">close</Icon>Cerrar
                  </button>
                </div>
                {/* Native modal dialog provides focus trapping, restoration and Escape dismissal. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selection.preview} alt="Boleta original ampliada" className="h-[calc(100dvh_-_11rem)] max-h-[75dvh] w-full rounded-xl bg-white object-contain" />
              </dialog>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-5 text-on-surface mb-3"><Icon className="text-primary text-[32px]">description</Icon><p>{previewFailed ? 'No se pudo mostrar la foto. Si no se puede analizar, elige una imagen JPG o usa «Tomar foto».' : 'PDF listo para analizar'}</p></div>
          )}
          <p className="text-sm font-medium text-on-surface break-all">{selection.file.name}</p>
          <p className="text-sm text-on-surface-variant mt-1 mb-4">{(selection.file.size / (1024 * 1024)).toFixed(1)} MB · {mode === 'local' ? 'La foto original se conserva; la lectura local no admite PDF.' : 'Al analizar, la foto original se enviará a los proveedores de IA configurados.'}</p>

          {mode === 'local' && selection.file.type !== 'application/pdf' && (
            <ReceiptPhotoAdjustments
              edges={edges}
              rotation={rotation}
              enhancement={enhancement}
              disabled={controlsDisabled}
              applying={applying}
              preview={preparedMatches && prepared ? { url: prepared.url, width: prepared.image.width, height: prepared.image.height } : null}
              previewError={previewError}
              onEdgeChange={handleEdgeChange}
              onRotate={handleRotate}
              onEnhancementChange={handleEnhancementChange}
              onRestore={handleRestore}
              onApply={() => { void applyAdjustments(); }}
            />
          )}

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
            <ReceiptFieldReview
              outcome={localOutcome}
              transcription={localOutcome.transcription}
              preparedUrl={preparedMatches && prepared ? prepared.url : null}
              onConfirm={confirmLocalResult}
              onRetry={() => { void analyze(); }}
            />
          ) : localPdf ? (
            <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-on-surface">
              <p className="flex items-center gap-2 font-medium"><Icon className="text-[20px] text-warning">warning</Icon>Este PDF no se puede leer localmente</p>
              <p className="mt-1 text-on-surface-variant">La lectura local solo trabaja con imágenes. Elige una foto JPG, PNG o WebP, o ingresa los datos manualmente. No enviamos el PDF a ningún servicio. Si necesitas analizarlo, cambia explícitamente a «Nube (opcional)» arriba.</p>
            </div>
          ) : (
            <>
              {preparedMatches && prepared && (
                <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                  <Icon className="text-[18px] text-secondary">check_circle</Icon>
                  Imagen preparada aplicada ({prepared.image.width} × {prepared.image.height} px). Se analizará esta misma imagen.
                </p>
              )}
              <button type="button" onClick={() => { void analyze(); }} disabled={applying} className={`${buttonStyle} w-full bg-primary text-on-primary hover:bg-primary/90`}>
                <Icon className="text-[20px]">document_scanner</Icon>{applying ? 'Preparando vista previa…' : errorMsg ? 'Reintentar análisis' : mode === 'local' ? 'Analizar localmente' : 'Analizar en la nube'}
              </button>
            </>
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
