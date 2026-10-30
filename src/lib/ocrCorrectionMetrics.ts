import type { VentaOCR } from '@/types/venta';

const CORRECTION_CONSENT_KEY = 'trackretail_ocr_correction_consent';
const CORRECTION_METRICS_KEY = 'trackretail_ocr_correction_metrics_v1';
const MAX_ENTRIES = 50;
const MAX_COUNT = 1000;

export const OCR_CORRECTION_FIELDS: readonly (keyof VentaOCR)[] = [
  'folio',
  'fecha_compra',
  'precio_producto',
  'cantidad_unidades',
  'valor_garantia',
  'total_boleta',
  'canal',
  'numero_pedido',
  'anos_garantia',
  'tipo_garantia',
] as const;

export interface OcrCorrectionCounts {
  folio: number;
  fecha_compra: number;
  precio_producto: number;
  cantidad_unidades: number;
  valor_garantia: number;
  total_boleta: number;
  canal: number;
  numero_pedido: number;
  anos_garantia: number;
  tipo_garantia: number;
}

export interface OcrCorrectionMetricsState {
  consent: boolean;
  counts: OcrCorrectionCounts;
  entries: number;
  lastUpdated: string | null;
}

interface StoredMetrics {
  counts?: unknown;
  entries?: unknown;
  lastUpdated?: unknown;
}

let memoryBaseline: VentaOCR | null = null;
let baselineConsumed = false;

function emptyCounts(): OcrCorrectionCounts {
  return {
    folio: 0,
    fecha_compra: 0,
    precio_producto: 0,
    cantidad_unidades: 0,
    valor_garantia: 0,
    total_boleta: 0,
    canal: 0,
    numero_pedido: 0,
    anos_garantia: 0,
    tipo_garantia: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
}

function isZeroOrOne(v: unknown): v is 0 | 1 {
  return isFiniteInteger(v) && (v === 0 || v === 1);
}

function isCanonicalIsoTimestamp(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  // Must be canonical UTC ISO produced by toISOString
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (!isoRegex.test(v)) return false;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString() === v;
}

export function setOcrCorrectionConsent(consent: boolean): void {
  try {
    if (consent === true) {
      localStorage.setItem(CORRECTION_CONSENT_KEY, '1');
    } else {
      localStorage.removeItem(CORRECTION_CONSENT_KEY);
    }
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('trackretail:ocr-metrics'));
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

export function getOcrCorrectionConsent(): boolean {
  try {
    return localStorage.getItem(CORRECTION_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function captureOcrBaseline(fields: VentaOCR): void {
  if (!fields || typeof fields !== 'object') return;
  try {
    memoryBaseline = { ...fields };
    baselineConsumed = false;
  } catch {
    memoryBaseline = fields;
    baselineConsumed = false;
  }
}

export function clearOcrBaseline(): void {
  memoryBaseline = null;
  baselineConsumed = true;
}

export function hasOcrBaseline(): boolean {
  return memoryBaseline !== null && !baselineConsumed;
}

function normalizeForCompare(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return String(value);
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(value);
}

function getFieldValue(obj: VentaOCR | Record<string, unknown>, key: keyof VentaOCR): unknown {
  return (obj as Record<string, unknown>)[key];
}

export function compareOcrBaselineToFinal(finalFields: VentaOCR): OcrCorrectionCounts | null {
  if (!hasOcrBaseline() || memoryBaseline === null) return null;
  const baseline = memoryBaseline;
  const counts = emptyCounts();
  for (let i = 0; i < OCR_CORRECTION_FIELDS.length; i++) {
    const field = OCR_CORRECTION_FIELDS[i];
    const b = getFieldValue(baseline, field);
    const f = getFieldValue(finalFields, field);
    if (normalizeForCompare(b) !== normalizeForCompare(f)) {
      counts[field] = 1;
    } else {
      counts[field] = 0;
    }
  }
  baselineConsumed = true;
  return counts;
}

export function loadOcrCorrectionMetrics(): OcrCorrectionMetricsState {
  const consent = getOcrCorrectionConsent();
  const empty = emptyCounts();
  try {
    const raw = localStorage.getItem(CORRECTION_METRICS_KEY);
    if (!raw) {
      return { consent, counts: empty, entries: 0, lastUpdated: null };
    }
    const parsed = JSON.parse(raw) as StoredMetrics;
    if (!isRecord(parsed)) {
      return { consent, counts: empty, entries: 0, lastUpdated: null };
    }
    const countsRaw = parsed.counts;
    const merged = emptyCounts();
    if (isRecord(countsRaw)) {
      for (let i = 0; i < OCR_CORRECTION_FIELDS.length; i++) {
        const field = OCR_CORRECTION_FIELDS[i];
        const v = countsRaw[field];
        if (isFiniteInteger(v) && v >= 0 && v <= MAX_COUNT) {
          merged[field] = v;
        } else {
          merged[field] = 0;
        }
      }
    }
    let entries = 0;
    if (isFiniteInteger(parsed.entries)) {
      const e = parsed.entries;
      if (e >= 0 && e <= MAX_ENTRIES) {
        entries = e;
      }
    }
    let lastUpdated: string | null = null;
    if (isCanonicalIsoTimestamp(parsed.lastUpdated)) {
      lastUpdated = parsed.lastUpdated;
    }
    // Clamp each counter to entries and ensure integer/finite; reject inconsistent totals
    let adjusted = false;
    for (let i = 0; i < OCR_CORRECTION_FIELDS.length; i++) {
      const field = OCR_CORRECTION_FIELDS[i];
      if (merged[field] > entries) {
        merged[field] = entries >= 0 ? Math.min(merged[field], entries) : 0;
        adjusted = true;
      }
      if (merged[field] < 0 || !isFiniteInteger(merged[field])) {
        merged[field] = 0;
        adjusted = true;
      }
      if (merged[field] > MAX_COUNT) {
        merged[field] = MAX_COUNT;
        adjusted = true;
      }
    }
    let total = 0;
    for (let i = 0; i < OCR_CORRECTION_FIELDS.length; i++) {
      total += merged[OCR_CORRECTION_FIELDS[i]];
    }
    if (entries === 0 || total > entries * OCR_CORRECTION_FIELDS.length || adjusted) {
      // if totals imply > entries per field impossible? enforce each <= entries
      for (let i = 0; i < OCR_CORRECTION_FIELDS.length; i++) {
        if (merged[OCR_CORRECTION_FIELDS[i]] > entries) {
          merged[OCR_CORRECTION_FIELDS[i]] = entries;
        }
      }
    }
    if (entries === 0) {
      // zero entries means no recorded samples
      for (let i = 0; i < OCR_CORRECTION_FIELDS.length; i++) {
        merged[OCR_CORRECTION_FIELDS[i]] = 0;
      }
      total = 0;
    }
    if (total > 0 && entries === 0) {
      return { consent, counts: empty, entries: 0, lastUpdated: null };
    }
    return { consent, counts: merged, entries, lastUpdated };
  } catch {
    return { consent, counts: empty, entries: 0, lastUpdated: null };
  }
}

export function recordOcrCorrections(counts: OcrCorrectionCounts): OcrCorrectionMetricsState {
  if (!getOcrCorrectionConsent()) {
    return loadOcrCorrectionMetrics();
  }
  const current = loadOcrCorrectionMetrics();
  if (current.entries >= MAX_ENTRIES) {
    return current;
  }
  const next = emptyCounts();
  for (let i = 0; i < OCR_CORRECTION_FIELDS.length; i++) {
    const field = OCR_CORRECTION_FIELDS[i];
    const c = counts[field];
    const add = isZeroOrOne(c) && c >= 1 ? 1 : 0;
    const newVal = current.counts[field] + add;
    if (isFiniteInteger(newVal) && newVal >= 0 && newVal <= MAX_COUNT) {
      next[field] = newVal;
    } else {
      next[field] = Math.min(current.counts[field], MAX_COUNT);
    }
  }
  // Enforce per-counter <= entries
  for (let i = 0; i < OCR_CORRECTION_FIELDS.length; i++) {
    const field = OCR_CORRECTION_FIELDS[i];
    if (next[field] > Math.min(current.entries + 1, MAX_ENTRIES)) {
      next[field] = Math.min(current.entries + 1, MAX_ENTRIES);
    }
  }
  const now = new Date().toISOString();
  const state: OcrCorrectionMetricsState = {
    consent: true,
    counts: next,
    entries: Math.min(current.entries + 1, MAX_ENTRIES),
    lastUpdated: now,
  };
  try {
    localStorage.setItem(CORRECTION_METRICS_KEY, JSON.stringify({ counts: state.counts, entries: state.entries, lastUpdated: state.lastUpdated }));
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('trackretail:ocr-metrics'));
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return state;
}

export function recordOcrCorrectionsFromFinal(finalFields: VentaOCR): OcrCorrectionMetricsState {
  if (!getOcrCorrectionConsent()) {
    clearOcrBaseline();
    return loadOcrCorrectionMetrics();
  }
  if (!hasOcrBaseline()) {
    return loadOcrCorrectionMetrics();
  }
  const counts = compareOcrBaselineToFinal(finalFields);
  if (!counts) {
    return loadOcrCorrectionMetrics();
  }
  const validated = emptyCounts();
  for (let i = 0; i < OCR_CORRECTION_FIELDS.length; i++) {
    const field = OCR_CORRECTION_FIELDS[i];
    const c = counts[field];
    validated[field] = isZeroOrOne(c) && c >= 1 ? 1 : 0;
  }
  return recordOcrCorrections(validated);
}

export function clearOcrCorrectionMetrics(): OcrCorrectionMetricsState {
  try {
    localStorage.removeItem(CORRECTION_METRICS_KEY);
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('trackretail:ocr-metrics'));
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return loadOcrCorrectionMetrics();
}

export function exportOcrCorrectionMetrics(): string {
  const state = loadOcrCorrectionMetrics();
  return JSON.stringify({
    consent: state.consent,
    entries: state.entries,
    counts: {
      folio: state.counts.folio,
      fecha_compra: state.counts.fecha_compra,
      precio_producto: state.counts.precio_producto,
      cantidad_unidades: state.counts.cantidad_unidades,
      valor_garantia: state.counts.valor_garantia,
      total_boleta: state.counts.total_boleta,
      canal: state.counts.canal,
      numero_pedido: state.counts.numero_pedido,
      anos_garantia: state.counts.anos_garantia,
      tipo_garantia: state.counts.tipo_garantia,
    },
    lastUpdated: state.lastUpdated,
  }, null, 2);
}
