'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { VentaOCR } from '@/types/venta';
import { Haptics } from '@/lib/haptics';

interface ScannerProps {
  onScanSuccess: (data: VentaOCR) => void;
  onManualEntry: () => void;
}

export default function Scanner({ onScanSuccess, onManualEntry }: ScannerProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX = 1200;
          if (width > height && width > MAX) { height *= MAX / width; width = MAX; }
          else if (height > MAX) { width *= MAX / height; height = MAX; }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            else reject(new Error('Error al comprimir'));
          }, 'image/jpeg', 0.82);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const processFile = async (rawFile: File) => {
    setLoading(true);
    setProgress(10);
    setLoadingText('Preparando imagen...');
    setErrorMsg(null);
    Haptics.medium();

    try {
      let file = rawFile;

      if (file.type.startsWith('image/') && file.size > 1024 * 1024) {
        setProgress(30);
        setLoadingText('Optimizando calidad...');
        try { file = await compressImage(rawFile); }
        catch { /* use original if compress fails */ }
      }

      setProgress(50);
      setLoadingText('Analizando con IA...');

      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/ocr', { method: 'POST', body: formData });

      setProgress(80);
      setLoadingText('Extrayendo datos...');

      const rawText = await res.text();
      let data: VentaOCR;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error('La IA no pudo leer la boleta. Intenta con una foto más clara y sin sombras.');
      }

      if (!res.ok) {
        throw new Error((data as unknown as { error?: string }).error || 'Error procesando la boleta.');
      }

      setProgress(100);
      setLoadingText('¡Datos extraídos!');
      Haptics.success();

      setTimeout(() => {
        setLoading(false);
        onScanSuccess(data);
      }, 700);

    } catch (err: unknown) {
      setLoading(false);
      setErrorMsg(err instanceof Error ? err.message : 'Error de conexión. Revisa tu red.');
      Haptics.error();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = ''; // allow re-selecting same file
  };

  return (
    <div className="bg-surface-elevated border border-surface-border rounded-2xl p-6 md:p-8 shadow-sm">
      <h2 className="font-headline-md text-headline-md text-on-surface mb-1">Escanear Boleta</h2>
      <p className="font-body-md text-body-md text-on-surface-variant mb-6">
        Sube la foto y la IA extraerá los datos automáticamente.
      </p>

      {/* Error inline — siempre visible */}
      {errorMsg && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-red-400 text-[20px] mt-0.5 shrink-0">error</span>
          <div className="flex-1">
            <p className="font-label-md text-red-400 mb-2">{errorMsg}</p>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs text-red-400/70 underline hover:text-red-400"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Opción 1: Cámara */}
        <label className="block cursor-pointer">
          <div className="bg-surface-base border border-surface-border rounded-xl p-4 hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[20px]">photo_camera</span>
              </div>
              <div>
                <p className="font-label-md text-on-surface">Tomar Foto</p>
                <p className="font-label-sm text-on-surface-variant text-xs">Cámara trasera</p>
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              disabled={loading}
              className="block w-full text-sm text-on-surface-variant
                file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:font-medium file:bg-primary/10 file:text-primary
                hover:file:bg-primary/20 cursor-pointer disabled:opacity-40"
            />
          </div>
        </label>

        {/* Opción 2: Galería */}
        <label className="block cursor-pointer">
          <div className="bg-surface-base border border-surface-border rounded-xl p-4 hover:border-secondary/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary text-[20px]">image</span>
              </div>
              <div>
                <p className="font-label-md text-on-surface">Subir desde Galería</p>
                <p className="font-label-sm text-on-surface-variant text-xs">Imagen o PDF</p>
              </div>
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              disabled={loading}
              className="block w-full text-sm text-on-surface-variant
                file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:font-medium file:bg-secondary/10 file:text-secondary
                hover:file:bg-secondary/20 cursor-pointer disabled:opacity-40"
            />
          </div>
        </label>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-surface-border"></div>
          <span className="text-on-surface-variant text-xs font-label-sm">O</span>
          <div className="flex-1 h-px bg-surface-border"></div>
        </div>

        {/* Manual */}
        <button
          onClick={onManualEntry}
          disabled={loading}
          className="w-full border border-surface-border text-on-surface-variant py-3 rounded-xl font-label-md
            flex items-center justify-center gap-2 hover:bg-surface-base hover:text-on-surface transition-colors disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[18px]">keyboard</span>
          Ingresar datos manualmente
        </button>
      </div>

      {/* OVERLAY DE CARGA — PANTALLA COMPLETA */}
      {loading && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,15,15,0.97)' }}
          className="flex flex-col items-center justify-center px-8 text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-surface-elevated border border-surface-border flex items-center justify-center mb-6 shadow-xl">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xs h-2 bg-surface-base rounded-full overflow-hidden mb-3 border border-surface-border">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-on-surface font-bold text-lg mb-1">{progress}%</p>
          <p className="text-on-surface-variant text-sm animate-pulse">{loadingText}</p>
        </div>
      )}
    </div>
  );
}
