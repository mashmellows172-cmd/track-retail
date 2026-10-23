'use client';
import { useEffect, useState } from 'react';

type ReaderStatus = { providers: string[]; imageBackup: boolean; pdfSupported: boolean };
const labels: Record<string, string> = { gemini: 'Gemini', qwen: 'Qwen', deepseek: 'DeepSeek', grok: 'Grok' };

function CloudReaderStatus() {
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

  return <aside aria-label="Lectura en la nube" className="rounded-xl border border-surface-border bg-surface-base p-3 mb-5 text-sm text-on-surface-variant space-y-1">
    <p className="font-medium text-on-surface">Lectura en la nube (opcional)</p>
    <p>La foto se enviará a los proveedores de IA configurados. La disponibilidad, la cuota gratuita y el costo dependen de cada proveedor: no garantizamos un plan gratuito.</p>
    {status && <>
      <p className="font-medium text-on-surface">{status.providers.length ? `Proveedores configurados: ${status.providers.map(p => labels[p]).join(' · ')}` : 'Lectura automática sin configurar'}</p>
      <p>{status.imageBackup ? 'Fotos JPG/PNG: respaldo automático si falla el primer servicio.' : 'Sin respaldo independiente. Si el servicio falla, conserva la foto y reintenta o ingresa manualmente.'}</p>
      {!status.pdfSupported && <p>Para lectura automática en la nube, utiliza una foto JPG o PNG. PDF no está configurado.</p>}
    </>}
    <p className="text-xs">La configuración no confirma disponibilidad ni costo. Revisa siempre los datos antes de guardar.</p>
  </aside>;
}

export default function ReceiptReaderStatus({ mode }: { mode: 'local' | 'cloud' }) {
  if (mode === 'cloud') return <CloudReaderStatus />;
  return <aside aria-label="Lectura local gratuita" className="rounded-xl border border-surface-border bg-surface-base p-3 mb-5 text-sm text-on-surface-variant space-y-1">
    <p className="font-medium text-on-surface">Lectura local gratuita</p>
    <p>El motor OCR y el idioma español se descargan desde esta misma aplicación la primera vez; después el navegador puede reutilizarlos. La primera lectura puede tardar más.</p>
    <p>La foto se procesa en tu dispositivo y no se envía a proveedores de IA. No necesitas clave de API.</p>
    <p>La calidad depende de la foto. Revisa y confirma cada dato antes de guardar. La lectura local no admite PDF.</p>
  </aside>;
}
