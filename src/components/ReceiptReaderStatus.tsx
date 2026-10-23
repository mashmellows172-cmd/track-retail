'use client';
import { useEffect, useState } from 'react';

type ReaderStatus = { providers: string[]; imageBackup: boolean; pdfSupported: boolean };
const labels: Record<string, string> = { gemini: 'Gemini', qwen: 'Qwen', deepseek: 'DeepSeek', grok: 'Grok' };
export default function ReceiptReaderStatus() {
  const [status, setStatus] = useState<ReaderStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/ocr/status', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!controller.signal.aborted && Array.isArray(data.providers) && data.providers.every((p: unknown) => typeof p === 'string' && Object.hasOwn(labels, p)) && typeof data.imageBackup === 'boolean' && typeof data.pdfSupported === 'boolean') setStatus(data);
    }).catch(() => { /* Capture and manual entry remain available when status cannot be checked. */ });
    return () => controller.abort();
  }, []);
  if (!status) return null;
  return <aside aria-label="Configuración del lector" className="rounded-xl border border-surface-border bg-surface-base p-3 mb-5 text-sm text-on-surface-variant space-y-1">
    <p className="font-medium text-on-surface">{status.providers.length ? `Lector configurado: ${status.providers.map(p => labels[p]).join(' · ')}` : 'Lectura automática sin configurar'}</p>
    <p>{status.imageBackup ? 'Fotos JPG/PNG: respaldo automático si falla el primer servicio.' : 'Sin respaldo independiente. Si el servicio falla, conserva la foto y reintenta o ingresa manualmente.'}</p>
    {!status.pdfSupported && <p>Para lectura automática, utiliza una foto JPG o PNG. PDF no está configurado.</p>}
    <p className="text-xs">La configuración no confirma disponibilidad del servicio. Revisa siempre los datos antes de guardar.</p>
  </aside>;
}
