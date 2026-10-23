export const LOCAL_OCR_ASSET_PATH = '/ocr';
export const LOCAL_OCR_TIMEOUT_MS = 120_000;
/** Keep the in-browser recognizer within a mobile-friendly memory budget. */
export const LOCAL_OCR_MAX_PIXELS = 4_000_000;

export type LocalOcrErrorCode = 'cancelled' | 'timeout' | 'load' | 'recognize';

export class LocalOcrError extends Error {
  constructor(public code: LocalOcrErrorCode, message: string) {
    super(message);
    this.name = 'LocalOcrError';
  }
}

export interface LocalOcrProgress {
  message: string;
  /** Real engine progress from 0 to 1, or null when the engine did not report a percentage. */
  percent: number | null;
}

export interface LocalOcrResult {
  text: string;
  confidence: number | null;
}

export interface LocalOcrLoggerMessage {
  status: string;
  progress: number;
}

export interface LocalOcrWorkerOptions {
  workerPath: string;
  corePath: string;
  langPath: string;
  workerBlobURL: boolean;
  logger: (message: LocalOcrLoggerMessage) => void;
}

export interface LocalOcrWorker {
  recognize(
    image: Blob,
    options?: Record<string, unknown>,
    output?: { text: boolean },
  ): Promise<{ data: { text?: string; confidence?: number } }>;
  terminate(): Promise<unknown>;
}

export type LocalOcrWorkerFactory = (
  langs: string,
  oem: number,
  options: LocalOcrWorkerOptions,
) => Promise<LocalOcrWorker>;

export interface LocalOcrOptions {
  signal: AbortSignal;
  onProgress?: (progress: LocalOcrProgress) => void;
  timeoutMs?: number;
  assetBaseUrl?: string;
  createWorker?: LocalOcrWorkerFactory;
}

export function localOcrAssetPaths(baseUrl: string) {
  const base = new URL(LOCAL_OCR_ASSET_PATH, baseUrl).href.replace(/\/$/, '');
  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
  };
}

export function localOcrProgressMessage(status: string, progress: number): LocalOcrProgress {
  const normalized = typeof status === 'string' ? status.toLowerCase() : '';
  let message = 'Preparando lectura local…';
  if (normalized.includes('loading tesseract core')) message = 'Cargando motor OCR local…';
  else if (normalized.includes('loading language')) message = 'Cargando idioma español…';
  else if (normalized.includes('initializing')) message = 'Iniciando lector local…';
  else if (normalized.includes('recognizing text')) message = 'Leyendo el texto de la boleta…';
  const percent = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : null;
  return { message, percent };
}

export function localOcrFailureMessage(error: unknown): string {
  if (error instanceof LocalOcrError) return error.message;
  return 'No se pudo completar la lectura local. Conserva la foto e intenta otra vez o ingresa los datos manualmente.';
}

function abortReason(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  return new LocalOcrError('cancelled', 'La lectura local fue cancelada.');
}

async function safeTerminate(worker: LocalOcrWorker): Promise<void> {
  try {
    await worker.terminate();
  } catch {
    // The worker may already be gone after an abort or a crash.
  }
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function defaultAssetBaseUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    throw new LocalOcrError('load', 'La lectura local solo está disponible en este navegador.');
  }
  return window.location.href;
}

const defaultWorkerFactory: LocalOcrWorkerFactory = async (langs, oem, options) => {
  const tesseract = await import('tesseract.js');
  const worker = await tesseract.createWorker(
    langs,
    oem,
    options as Parameters<typeof tesseract.createWorker>[2],
  );
  return worker as unknown as LocalOcrWorker;
};

// Heavy WebAssembly workers are created one at a time. A cancelled startup may
// still finish in the background, so the next analysis waits until that late
// worker is terminated before creating another one.
let workerQueue: Promise<void> = Promise.resolve();

/**
 * Recognizes one receipt photo entirely in this browser. Assets are fetched
 * from the app's own /ocr directory; no provider or CDN receives the photo.
 * Every call owns and terminates its worker, including when the engine is
 * still starting up after the caller cancelled.
 */
export async function recognizeReceiptLocally(
  image: Blob,
  options: LocalOcrOptions,
): Promise<LocalOcrResult> {
  const externalSignal = options.signal;
  if (externalSignal.aborted) throw abortReason(externalSignal);

  const controller = new AbortController();
  const forwardAbort = () => controller.abort(externalSignal.reason);
  externalSignal.addEventListener('abort', forwardAbort, { once: true });

  const timeoutMs = options.timeoutMs ?? LOCAL_OCR_TIMEOUT_MS;
  const timer = setTimeout(() => {
    controller.abort(new LocalOcrError(
      'timeout',
      'La lectura local tardó demasiado. Puedes reintentar con una foto más pequeña o ingresar los datos manualmente.',
    ));
  }, timeoutMs);

  let worker: LocalOcrWorker | null = null;
  let terminating: Promise<void> | null = null;
  const terminate = (): Promise<void> => {
    if (terminating) return terminating;
    if (!worker) return Promise.resolve();
    const current = worker;
    worker = null;
    terminating = safeTerminate(current);
    return terminating;
  };
  const onAbort = () => { void terminate(); };
  controller.signal.addEventListener('abort', onAbort, { once: true });

  const previousWorker = workerQueue;
  let releaseQueue!: () => void;
  const currentSlot = new Promise<void>((resolve) => { releaseQueue = resolve; });
  workerQueue = previousWorker.then(() => currentSlot);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseQueue();
  };
  let startupStarted = false;
  let startupSettled = false;

  try {
    await raceWithAbort(previousWorker, controller.signal);
    controller.signal.throwIfAborted();
    const paths = localOcrAssetPaths(options.assetBaseUrl ?? defaultAssetBaseUrl());
    const create = options.createWorker ?? defaultWorkerFactory;
    startupStarted = true;
    const createdPromise = Promise.resolve().then(() => create('spa', 1, {
      ...paths,
      workerBlobURL: false,
      logger: (message) => {
        if (controller.signal.aborted) return;
        try {
          options.onProgress?.(localOcrProgressMessage(message.status, message.progress));
        } catch {
          // A progress listener must never break recognition.
        }
      },
    })).then(async (created) => {
      if (controller.signal.aborted) {
        await safeTerminate(created);
        return null;
      }
      worker = created;
      return created;
    }).finally(async () => {
      startupSettled = true;
      if (controller.signal.aborted) {
        await terminate();
        release();
      }
    });

    let created: LocalOcrWorker | null;
    try {
      created = await raceWithAbort(createdPromise, controller.signal);
    } catch {
      if (controller.signal.aborted) throw abortReason(controller.signal);
      throw new LocalOcrError(
        'load',
        'No se pudo cargar el lector local. Conserva la foto, revisa la conexión e intenta otra vez o ingresa los datos manualmente.',
      );
    }
    if (!created) throw abortReason(controller.signal);
    controller.signal.throwIfAborted();

    let recognized: { data: { text?: string; confidence?: number } };
    try {
      recognized = await raceWithAbort(
        created.recognize(image, {}, { text: true }),
        controller.signal,
      );
    } catch {
      if (controller.signal.aborted) throw abortReason(controller.signal);
      throw new LocalOcrError(
        'recognize',
        'No se pudo leer la boleta en este dispositivo. Conserva la foto, intenta con mejor luz o ingresa los datos manualmente.',
      );
    }
    controller.signal.throwIfAborted();

    const text = typeof recognized?.data?.text === 'string' ? recognized.data.text : '';
    const rawConfidence = recognized?.data?.confidence;
    const confidence = typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
      ? rawConfidence
      : null;
    return { text, confidence };
  } finally {
    clearTimeout(timer);
    externalSignal.removeEventListener('abort', forwardAbort);
    controller.signal.removeEventListener('abort', onAbort);
    await terminate();
    // If startup is still pending, its late-worker handler releases the queue
    // after terminating the worker it eventually receives.
    if (startupSettled || !startupStarted) release();
  }
}
