export function receiptDimensions(width: number, height: number) {
  // Keep long receipt text readable: constrain the short edge independently.
  const scale = Math.min(1, 2400 / Math.min(width, height), 12000 / Math.max(width, height), Math.sqrt(16000000 / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function isHeic(file: Pick<File, 'type' | 'name'>) {
  return ['image/heic', 'image/heif'].includes(file.type) || /\.(heic|heif)$/i.test(file.name);
}

export function validateReceiptSelection(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  if (file.type === 'application/pdf') return validateReceiptFile(file);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && !isHeic(file)) {
    return 'Usa una imagen JPG, PNG, WebP, HEIC/HEIF o un PDF.';
  }
  if (!file.size) return 'El archivo está vacío. Elige otra foto o PDF.';
  if (file.size > 24 * 1024 * 1024) return 'La foto debe pesar como máximo 24 MB para prepararla en este dispositivo.';
  return null;
}

export function validateReceiptFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
    return 'Usa una imagen JPG, PNG, WebP o un PDF.';
  }
  if (!file.size) return 'El archivo está vacío. Elige otra foto o PDF.';
  if (file.size > 8 * 1024 * 1024) return 'El archivo debe pesar como máximo 8 MB.';
  return null;
}

export async function prepareReceiptImage(file: File, signal: AbortSignal): Promise<File> {
  signal.throwIfAborted();
  const requiresConversion = isHeic(file);
  if (!requiresConversion && (!file.type.startsWith('image/') || file.size <= 1024 * 1024)) return file;

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => {
      URL.revokeObjectURL(url);
      signal.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
    };
    const abort = () => { cleanup(); reject(signal.reason); };
    const unavailable = () => {
      cleanup();
      if (requiresConversion) reject(new Error('Este navegador no pudo convertir la foto HEIC/HEIF. Elige una imagen JPG o usa «Tomar foto» para capturar otra boleta.'));
      else resolve(file);
    };
    signal.addEventListener('abort', abort, { once: true });
    image.onerror = unavailable;
    image.onload = () => {
      if (signal.aborted) { abort(); return; }
      try {
        const { width, height } = receiptDimensions(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) { unavailable(); return; }
        // PNG/WebP alpha must become paper white, not black, in JPEG.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          canvas.width = 0;
          canvas.height = 0;
          cleanup();
          if (signal.aborted) { reject(signal.reason); return; }
          if (!blob && requiresConversion) { unavailable(); return; }
          resolve(blob && (requiresConversion || blob.size < file.size)
            ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified })
            : file);
        }, 'image/jpeg', 0.92);
      } catch {
        unavailable();
      }
    };
    image.src = url;
  });
}
