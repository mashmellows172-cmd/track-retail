'use client';

import Icon from '@/components/Icon';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { VentaOCR } from '@/types/venta';
import { Haptics } from '@/lib/haptics';
import { prepareReceiptImage, validateReceiptFile, validateReceiptSelection } from '@/lib/receiptImage';

interface ScannerProps {
  onScanSuccess: (data: VentaOCR) => void;
  onManualEntry: () => void;
}

type Selection = { file: File; preview: string | null };

export default function Scanner({ onScanSuccess, onManualEntry }: ScannerProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [stage, setStage] = useState<'ready' | 'preparing' | 'analyzing'>('ready');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = stage !== 'ready';

  useEffect(() => {
    const operationGeneration = generation;
    mounted.current = true;
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
    setNotice('Análisis cancelado. Puedes volver a intentarlo.');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || request.current) return;
    const error = validateReceiptSelection(file);
    setErrorMsg(error);
    if (error) return;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const preview = file.type !== 'application/pdf' ? URL.createObjectURL(file) : null;
    previewUrl.current = preview;
    setSelection({ file, preview });
    setPreviewFailed(false);
    setNotice('Archivo listo. Revisa la boleta antes de analizar.');
  };

  const analyze = async () => {
    if (!selection || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const current = ++generation.current;
    const active = () => mounted.current && current === generation.current;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 65000);
    setErrorMsg(null);
    setNotice('');
    setStage('preparing');
    Haptics.medium();
    try {
      const file = await prepareReceiptImage(selection.file, controller.signal);
      if (!active() || controller.signal.aborted) return;
      const validation = validateReceiptFile(file);
      if (validation) throw new Error(file.size > 8 * 1024 * 1024
        ? 'La foto sigue superando 8 MB después de prepararla. Toma otra foto o elige una imagen de menor tamaño.'
        : validation);
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
      setErrorMsg(timedOut
        ? 'El análisis tardó demasiado. Revisa tu conexión y vuelve a intentarlo.'
        : error instanceof TypeError
          ? 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.'
          : error instanceof Error ? error.message : 'No se pudo analizar la boleta. Vuelve a intentarlo.');
      Haptics.error();
    } finally {
      clearTimeout(timeout);
      if (active()) {
        request.current = null;
        setStage('ready');
      }
    }
  };

  const buttonStyle = 'min-h-12 rounded-xl px-4 py-3 font-label-md flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-50';

  return (
    <section aria-labelledby="receipt-scanner-title" className="bg-surface-elevated border border-surface-border rounded-2xl p-6 md:p-8 shadow-sm">
      <h2 id="receipt-scanner-title" className="font-headline-md text-headline-md text-on-surface mb-1">Escanear boleta</h2>
      <p className="font-body-md text-body-md text-on-surface-variant mb-6">Toma una foto, revisa que se lea bien y analiza los datos.</p>
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
      <p className="text-sm text-on-surface-variant mt-3 mb-5">Incluye la boleta completa, con buena luz y sin sombras. Fotos JPG, PNG, WebP o HEIC/HEIF hasta 24 MB; PDF hasta 8 MB. Las fotos se preparan en tu dispositivo para enviar un máximo de 8 MB. HEIC/HEIF requiere un navegador que pueda convertirlo.</p>

      {selection && (
        <div className="rounded-2xl border border-surface-border bg-surface-base p-4 mb-4">
          {selection.preview && !previewFailed ? (
            <div className="max-h-80 overflow-auto rounded-xl bg-white mb-3">
              {/* A local object URL preserves full receipt detail and supports scrolling. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={selection.preview} src={selection.preview} onError={() => { if (previewUrl.current === selection.preview) setPreviewFailed(true); }} alt="Vista previa de la boleta seleccionada" className="w-full h-auto" />
            </div>
          ) : (
            <div className="flex items-center gap-3 py-5 text-on-surface mb-3"><Icon className="text-primary text-[32px]">description</Icon><p>{previewFailed ? 'No se pudo mostrar la foto. Si no se puede analizar, elige una imagen JPG o usa «Tomar foto».' : 'PDF listo para analizar'}</p></div>
          )}
          <p className="text-sm font-medium text-on-surface break-all">{selection.file.name}</p>
          <p className="text-sm text-on-surface-variant mt-1 mb-4">{(selection.file.size / (1024 * 1024)).toFixed(1)} MB · Al pulsar Analizar, se preparará el archivo y se enviará al servicio de IA si es compatible.</p>
          {busy ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="flex items-center gap-2 text-on-surface"><Loader2 aria-hidden="true" size={20} className="animate-spin motion-reduce:animate-none text-primary" />{stage === 'preparing' ? 'Preparando imagen…' : 'Analizando boleta…'}</p>
              <button type="button" onClick={cancel} className={`${buttonStyle} border border-surface-border text-on-surface`}>Cancelar</button>
            </div>
          ) : (
            <button type="button" onClick={analyze} className={`${buttonStyle} w-full bg-primary text-on-primary hover:bg-primary/90`}><Icon className="text-[20px]">document_scanner</Icon>{errorMsg ? 'Reintentar análisis' : 'Analizar boleta'}</button>
          )}
        </div>
      )}
      {errorMsg && <p role="alert" className="rounded-xl border border-error/30 bg-error/10 text-error p-4 mb-4 text-sm">{errorMsg} {selection && 'Tu archivo sigue seleccionado.'}</p>}
      <p role="status" className="text-sm text-on-surface-variant mb-4">{notice}</p>
      <button type="button" onClick={() => { cancel(); onManualEntry(); }} className={`${buttonStyle} w-full border border-surface-border text-on-surface-variant hover:bg-surface-base hover:text-on-surface`}>
        <Icon className="text-[20px]">keyboard</Icon>Ingresar datos manualmente
      </button>
    </section>
  );
}
