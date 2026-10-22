'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

export default function ProductBarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    let cancelled = false;
    let stop: (() => void) | undefined;
    async function start() {
      try {
        const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
        if (cancelled || !video.current) return;
        const reader = new BrowserMultiFormatOneDReader();
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video.current, (result, _error, controls) => {
          if (result && !cancelled) { cancelled = true; controls.stop(); onCode(result.getText()); }
        });
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch { if (!cancelled) setError('No pudimos abrir la cámara. Revisa el permiso o busca el código manualmente.'); }
    }
    void start();
    return () => { cancelled = true; stop?.(); };
  }, [onCode]);
  return <dialog ref={dialog} onCancel={onClose} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-surface-border bg-surface-elevated text-on-surface p-5 backdrop:bg-black/70" aria-labelledby="scanner-title">
    <div className="flex items-center justify-between gap-3 mb-4"><h2 id="scanner-title" className="text-xl font-semibold flex gap-2 items-center"><Camera aria-hidden="true" />Escanear producto</h2><button type="button" onClick={onClose} aria-label="Cerrar escáner" className="min-h-11 min-w-11 grid place-items-center rounded-lg border border-surface-border"><X aria-hidden="true" /></button></div>
    <p className="text-on-surface-variant mb-4">Apunta al código de barras. La imagen se procesa en tu dispositivo.</p>
    <video ref={video} muted playsInline className="w-full aspect-video object-cover bg-black rounded-xl" aria-label="Vista de la cámara" />
    {error ? <p role="alert" className="mt-4 text-error">{error}</p> : <p role="status" className="mt-4 text-sm text-on-surface-variant">Buscando código… Acerca el producto y evita reflejos.</p>}
  </dialog>;
}
