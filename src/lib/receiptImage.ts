import { normalizedToPixels, type Rect } from '@/lib/receiptGeometry';

export function receiptDimensions(width: number, height: number, maxPixels?: number) {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  // An explicit budget (local OCR) is strict. The legacy default keeps its
  // rounded dimensions for cloud preparation, whose own limit is looser.
  const strictBudget = typeof maxPixels === 'number' && Number.isFinite(maxPixels) && maxPixels > 0;
  const budget = strictBudget ? (maxPixels as number) : 16_000_000;
  // Keep long receipt text readable: constrain the short edge independently.
  let scale = Math.min(1, 2400 / Math.min(width, height), 12000 / Math.max(width, height), Math.sqrt(budget / (width * height)));
  if (scale <= 0) scale = Number.MIN_VALUE;
  let w = Math.max(1, Math.round(width * scale));
  let h = Math.max(1, Math.round(height * scale));
  if (strictBudget) {
    // Enforce a strict pixel budget by trimming integer rounding overshoot.
    while (w * h > budget && (w > 1 || h > 1)) {
      if (w >= h && w > 1) w -= 1;
      else if (h > 1) h -= 1;
    }
  }
  return { width: w, height: h };
}

export interface PreparedReceiptImage {
  file: File;
  original: File;
  prepared: boolean;
  width: number;
  height: number;
  /** Applied rotations in 90-degree steps (0/90/180/270). */
  rotation: 0 | 90 | 180 | 270;
  /** Normalized crop used when the image was framed; absent for full-image analysis. */
  crop?: { x: number; y: number; width: number; height: number };
  metadata: {
    budgetPixels: number;
    maxPixels: number;
    usedLightEnhancement: boolean;
  };
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

function applyLightContrast(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  if (typeof context.getImageData !== 'function' || typeof context.putImageData !== 'function') return false;
  try {
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    // Bounded, reversible-friendly enhancement: gentle stretch on luminance only.
    // Avoids aggressive thresholding that would destroy faint thermal text.
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const factor = 1.08;
      const offset = -4;
      r = Math.min(255, Math.max(0, gray * factor + offset));
      g = r;
      b = r;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    context.putImageData(imageData, 0, 0);
    return true;
  } catch {
    return false;
  }
}

export async function prepareReceiptImage(file: File, signal: AbortSignal, maxPixels?: number): Promise<File> {
  const prepared = await prepareReceiptImageForOcr(file, signal, { mode: maxPixels !== undefined ? 'optimized' : 'original', maxPixels });
  return prepared.file;
}

export interface PrepareReceiptImageOptions {
  mode?: 'original' | 'optimized';
  maxPixels?: number;
  rotation?: 0 | 90 | 180 | 270;
  crop?: { x: number; y: number; width: number; height: number };
}

function cropIsValid(crop: NonNullable<PrepareReceiptImageOptions['crop']>): boolean {
  const parts = [crop.x, crop.y, crop.width, crop.height];
  return parts.every((part) => typeof part === 'number' && Number.isFinite(part))
    && crop.x >= 0 && crop.y >= 0
    && crop.x < 1 && crop.y < 1
    && crop.width > 0 && crop.height > 0;
}

function drawReceiptImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  crop: Rect,
  rotation: 0 | 90 | 180 | 270,
  width: number,
  height: number,
): void {
  const canTransform = typeof context.translate === 'function' && typeof context.rotate === 'function';
  if (rotation === 0 || !canTransform) {
    // Crop first against the original image; the fallback keeps older canvas
    // shims (which lack transforms) usable without changing the public API.
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    return;
  }
  context.save?.();
  if (rotation === 90) {
    context.translate(width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, height, width);
  } else if (rotation === 180) {
    context.translate(width, height);
    context.rotate(Math.PI);
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  } else {
    context.translate(0, height);
    context.rotate(-Math.PI / 2);
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, height, width);
  }
  context.restore?.();
}

export async function prepareReceiptImageForOcr(
  file: File,
  signal: AbortSignal,
  options: PrepareReceiptImageOptions = {},
): Promise<PreparedReceiptImage> {
  signal.throwIfAborted();
  const mode = options.mode ?? 'optimized';
  const maxPixels = options.maxPixels;
  const rotation = options.rotation ?? 0;
  const crop = options.crop;
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new Error('La rotación de la boleta no es válida. Vuelve a intentar la lectura local.');
  }
  if (crop !== undefined && !cropIsValid(crop)) {
    throw new Error('El recorte de la boleta no es válido. Vuelve a encuadrar la foto e intenta de nuevo.');
  }
  const requiresConversion = isHeic(file);
  const hasGeometry = rotation !== 0 || crop !== undefined;
  const requiresCanvasWork = maxPixels !== undefined || hasGeometry;
  const budgetPixels = typeof maxPixels === 'number' && Number.isFinite(maxPixels) ? maxPixels : 16_000_000;

  // Cloud preparation may keep its original file when nothing needs decoding.
  // Local OCR (explicit pixel budget) and any crop/rotation always decode so a
  // large phone photo cannot bypass the in-browser memory budget.
  if (mode === 'original' && !requiresConversion && !requiresCanvasWork && (!file.type.startsWith('image/') || file.size <= 1024 * 1024)) {
    return {
      file,
      original: file,
      prepared: false,
      width: 0,
      height: 0,
      rotation,
      crop,
      metadata: { budgetPixels, maxPixels: budgetPixels, usedLightEnhancement: false },
    };
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };
    const cleanup = () => {
      URL.revokeObjectURL(url);
      signal.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
    };
    const abort = () => {
      cleanup();
      settle(() => reject(signal.reason));
    };
    const unavailable = () => {
      cleanup();
      if (requiresConversion) {
        settle(() => reject(new Error('Este navegador no pudo convertir la foto HEIC/HEIF. Elige una imagen JPG o usa «Tomar foto» para capturar otra boleta.')));
      } else if (maxPixels !== undefined) {
        settle(() => reject(new Error('Este navegador no pudo preparar la foto para la lectura local. Elige otra imagen JPG o usa «Tomar foto» para capturar otra boleta.')));
      } else if (hasGeometry) {
        settle(() => reject(new Error('Este navegador no pudo aplicar el recorte o la rotación de la boleta. Elige otra imagen JPG o usa «Tomar foto» para capturar otra boleta.')));
      } else {
        settle(() => resolve({
          file,
          original: file,
          prepared: false,
          width: image.naturalWidth || 0,
          height: image.naturalHeight || 0,
          rotation,
          crop,
          metadata: { budgetPixels, maxPixels: budgetPixels, usedLightEnhancement: false },
        }));
      }
    };
    signal.addEventListener('abort', abort, { once: true });
    image.onerror = unavailable;
    image.onload = () => {
      if (signal.aborted) { abort(); return; }
      try {
        const srcW = image.naturalWidth;
        const srcH = image.naturalHeight;
        if (!(srcW > 0 && srcH > 0)) { unavailable(); return; }
        const sourceCrop = crop ? normalizedToPixels(crop, srcW, srcH) : { x: 0, y: 0, width: srcW, height: srcH };
        const rotatedWidth = rotation === 90 || rotation === 270 ? sourceCrop.height : sourceCrop.width;
        const rotatedHeight = rotation === 90 || rotation === 270 ? sourceCrop.width : sourceCrop.height;
        // Crop coordinates refer to the original image; rotation is applied
        // afterwards, so dimensions swap before the final budget is enforced.
        const { width, height } = receiptDimensions(rotatedWidth, rotatedHeight, maxPixels);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) { unavailable(); return; }
        // PNG/WebP alpha must become paper white, not black, in JPEG.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        drawReceiptImage(context, image, sourceCrop, rotation, width, height);
        const usedLightEnhancement = mode === 'optimized' ? applyLightContrast(context, width, height) : false;
        canvas.toBlob((blob) => {
          canvas.width = 0;
          canvas.height = 0;
          cleanup();
          if (signal.aborted) { settle(() => reject(signal.reason)); return; }
          if (!blob && (requiresConversion || requiresCanvasWork)) { unavailable(); return; }
          if (blob && (requiresConversion || requiresCanvasWork || blob.size < file.size || mode === 'optimized')) {
            settle(() => resolve({
              file: new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified }),
              original: file,
              prepared: true,
              width,
              height,
              rotation,
              crop,
              metadata: { budgetPixels, maxPixels: budgetPixels, usedLightEnhancement },
            }));
            return;
          }
          settle(() => resolve({
            file,
            original: file,
            prepared: false,
            width,
            height,
            rotation,
            crop,
            metadata: { budgetPixels, maxPixels: budgetPixels, usedLightEnhancement: false },
          }));
        }, 'image/jpeg', 0.92);
      } catch {
        unavailable();
      }
    };
    image.src = url;
  });
}
