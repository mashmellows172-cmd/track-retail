import type {
  ParsedPrintedReceipt,
  ReceiptBBox,
  ReceiptLayout,
  ReceiptLayoutLine,
} from '@/lib/receiptParser';
import type { VentaOCR } from '@/types/venta';

export interface ImageSize {
  width: number;
  height: number;
}

export interface ReceiptRetryPlan {
  reason: 'missing-total' | 'missing-price' | 'missing-units' | 'weak-data';
  /** Normalized to the prepared image that the engine actually reads. */
  rect: ReceiptBBox;
}

export interface PixelRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MAX_RETRY_WIDTH = 0.95;
const MAX_RETRY_HEIGHT = 0.6;
const MAX_RETRY_AREA = 0.55;
const MIN_RETRY_WIDTH = 0.2;
const MIN_RETRY_HEIGHT = 0.035;

// The zonal retry only re-reads sale amounts. Header/identity fields are never
// recovered from that crop: doing so could silently resolve a baseline conflict
// that this helper cannot see as an explicit uncertain flag.
const RETRY_FILLABLE_FIELDS = new Set<keyof VentaOCR>([
  'precio_producto',
  'cantidad_unidades',
  'valor_garantia',
  'total_boleta',
]);

function assignReceiptField<K extends keyof VentaOCR>(
  target: VentaOCR,
  key: K,
  value: VentaOCR[K],
): void {
  target[key] = value;
}

const TOTAL_HINT = /\b(?:TOTAL(?:\s+VENTA)?|SUBTOTAL|I\.?V\.?A\.?|MONTO)\b/i;
const PRODUCT_HINT = /\b(?:PRECIO|UNITARIO|ARTICULO|PRODUCTO|CANTIDAD|UNIDAD(?:ES)?|GARANTIA|PROTECC(?:ION)?)\b|\d{1,4}\s*U(?![A-Z0-9])/i;
const ANY_LABEL = /\b(?:FOLIO|FECHA|TOTAL|PRECIO|ARTICULO|PRODUCTO|GARANTIA|PROTECC(?:ION)?|BOLETA|CAJA|LOCAL)\b|\$\s*\d|\d{1,3}(?:[.,]\d{3})+|\b\d{4,}\b/i;

function validImageSize(size: ImageSize | null | undefined): size is ImageSize {
  return !!size && Number.isFinite(size.width) && Number.isFinite(size.height)
    && size.width > 0 && size.height > 0;
}

function normalizedBox(value: unknown, size: ImageSize): ReceiptBBox | null {
  if (!value || typeof value !== 'object') return null;
  const box = value as Record<string, unknown>;
  const { x0, y0, x1, y1 } = box;
  if (![x0, y0, x1, y1].every((part) => typeof part === 'number' && Number.isFinite(part))) return null;
  const left = Math.max(0, Math.min(size.width, x0 as number));
  const top = Math.max(0, Math.min(size.height, y0 as number));
  const right = Math.max(0, Math.min(size.width, x1 as number));
  const bottom = Math.max(0, Math.min(size.height, y1 as number));
  if (right <= left || bottom <= top) return null;
  return {
    x: left / size.width,
    y: top / size.height,
    width: (right - left) / size.width,
    height: (bottom - top) / size.height,
  };
}

/**
 * Converts the engine's real block tree into the plain, optional layout shape
 * consumed by the parser. Boxes are only emitted when the prepared image size
 * is known; a missing or unreliable geometry never becomes a fake coordinate.
 */
export function receiptLayoutFromBlocks(
  blocks: unknown,
  imageSize?: ImageSize | null,
): ReceiptLayout | null {
  if (!Array.isArray(blocks)) return null;
  const lines: ReceiptLayoutLine[] = [];
  for (const block of blocks) {
    const paragraphs = block && typeof block === 'object'
      ? (block as { paragraphs?: unknown }).paragraphs
      : null;
    if (!Array.isArray(paragraphs)) continue;
    for (const paragraph of paragraphs) {
      const rawLines = paragraph && typeof paragraph === 'object'
        ? (paragraph as { lines?: unknown }).lines
        : null;
      if (!Array.isArray(rawLines)) continue;
      for (const rawLine of rawLines) {
        if (!rawLine || typeof rawLine !== 'object') continue;
        const line = rawLine as { text?: unknown; bbox?: unknown };
        if (typeof line.text !== 'string') continue;
        const text = line.text.trim();
        if (!text) continue;
        const bbox = validImageSize(imageSize) ? normalizedBox(line.bbox, imageSize) : null;
        lines.push(bbox ? { text, bbox } : { text });
      }
    }
  }
  return lines.length ? { lines } : null;
}

function validLineBox(line: ReceiptLayoutLine): ReceiptBBox | null {
  const box = line.bbox;
  if (!box) return null;
  const values = [box.x, box.y, box.width, box.height];
  if (!values.every((part) => typeof part === 'number' && Number.isFinite(part))) return null;
  if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) return null;
  if (box.x + box.width > 1.0001 || box.y + box.height > 1.0001) return null;
  return box;
}

function unionBoxes(boxes: ReceiptBBox[]): ReceiptBBox | null {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return {
    x: Math.max(0, left - 0.02),
    y: Math.max(0, top - 0.012),
    width: Math.min(1, right + 0.02) - Math.max(0, left - 0.02),
    height: Math.min(1, bottom + 0.012) - Math.max(0, top - 0.012),
  };
}

function ensureMinimumSize(box: ReceiptBBox): ReceiptBBox {
  let { x, y, width, height } = box;
  if (width < MIN_RETRY_WIDTH) {
    const center = x + width / 2;
    x = Math.max(0, Math.min(1 - MIN_RETRY_WIDTH, center - MIN_RETRY_WIDTH / 2));
    width = MIN_RETRY_WIDTH;
  }
  if (height < MIN_RETRY_HEIGHT) {
    const center = y + height / 2;
    y = Math.max(0, Math.min(1 - MIN_RETRY_HEIGHT, center - MIN_RETRY_HEIGHT / 2));
    height = MIN_RETRY_HEIGHT;
  }
  return { x, y, width, height };
}

function targetBox(
  layout: ReceiptLayout | null | undefined,
  matcher: RegExp,
): ReceiptBBox | null {
  const lines = Array.isArray(layout?.lines) ? layout.lines : [];
  const paymentBoundary = paymentMarkerIndex(lines);
  const boxes: ReceiptBBox[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    // A retry must never target the payment-slip section that follows a bank
    // marker, regardless of where that section sits vertically.
    if (paymentBoundary !== -1 && index > paymentBoundary) continue;
    const line = lines[index];
    if (!line || typeof line.text !== 'string') continue;
    if (!matcher.test(line.text)) continue;
    const box = validLineBox(line);
    if (box) boxes.push(box);
  }
  return unionBoxes(boxes);
}

const BANK_HINT = /\b(?:VENTA\s+(?:DEBITO|CREDITO)|TARJETA|PAGO|BOLETA\s*[:#]?\d{6,}|AUTORIZ|OPERACION|CUOTAS)\b/i;
const RETAIL_HINT = /\b(?:TOTAL\s+VENTA|SUBTOTAL\s+VENTA|FOLIO|CAJA|LOCAL|ARTICULO|PRODUCTO|PRECIO|GARANTIA|PROTECC)\b/i;

function usableRetryBox(box: ReceiptBBox | null): ReceiptBBox | null {
  if (!box) return null;
  const sized = ensureMinimumSize(box);
  if (sized.width > MAX_RETRY_WIDTH || sized.height > MAX_RETRY_HEIGHT) return null;
  if (sized.width * sized.height > MAX_RETRY_AREA) return null;
  return {
    x: Math.max(0, Math.min(1 - sized.width, sized.x)),
    y: Math.max(0, Math.min(1 - sized.height, sized.y)),
    width: Math.min(sized.width, 1),
    height: Math.min(sized.height, 1),
  };
}

function lineBox(line: ReceiptLayoutLine): ReceiptBBox | null {
  const box = validLineBox(line);
  if (!box || typeof line.text !== 'string') return null;
  return box;
}

/**
 * Returns the layout index of the first clean payment/bank marker. Layout order
 * is the reliable provenance: anything after this marker belongs to the payment
 * slip section even if its vertical position looks like a retail total.
 */
function paymentMarkerIndex(lines: ReceiptLayoutLine[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || typeof line.text !== 'string') continue;
    if (BANK_HINT.test(line.text) && !RETAIL_HINT.test(line.text)) return index;
  }
  return -1;
}

function retailTotalBox(layout: ReceiptLayout): ReceiptBBox | null {
  const lines = layout.lines;
  const paymentBoundary = paymentMarkerIndex(lines);
  const candidates: ReceiptBBox[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (paymentBoundary !== -1 && index > paymentBoundary) continue;
    const line = lines[index];
    if (!line || typeof line.text !== 'string') continue;
    if (!TOTAL_HINT.test(line.text)) continue;
    const box = lineBox(line);
    if (!box) continue;
    const text = line.text;
    if (BANK_HINT.test(text) && !RETAIL_HINT.test(text)) continue;
    candidates.push(box);
  }
  return unionBoxes(candidates);
}

/**
 * Decides whether one same-worker retry is useful. It never tries to resolve a
 * conflict or replace a printed value: only missing critical fields with a real
 * labelled location qualify. No layout means the caller keeps the baseline or
 * offers manual entry instead of guessing a rectangle.
 */
export function planReceiptRetry(
  parsed: ParsedPrintedReceipt,
  layout: ReceiptLayout | null | undefined,
): ReceiptRetryPlan | null {
  if (!parsed || !Array.isArray(layout?.lines) || !layout!.lines.length) return null;
  if (parsed.checks.conflictingRetailTotals) return null;
  if (parsed.checks.paymentSlipDetected && !parsed.fields.total_boleta && !parsed.fields.precio_producto && !parsed.fields.cantidad_unidades) {
    // If only the bank slip is visible, don't guess a retail rectangle.
  }

  const uncertain = new Set(parsed.checks.uncertainFields);
  const presentButUncertain = (field: keyof VentaOCR) =>
    parsed.fields[field] !== null && uncertain.has(field);
  if (presentButUncertain('total_boleta')
    || presentButUncertain('precio_producto')
    || presentButUncertain('cantidad_unidades')) {
    return null;
  }
  if (parsed.fields.precio_producto !== null && uncertain.has('precio_producto')) return null;

  const missingTotal = parsed.fields.total_boleta === null;
  const missingPrice = parsed.fields.precio_producto === null;
  const missingUnits = parsed.fields.cantidad_unidades === null;
  if (parsed.hasUsefulData && !missingTotal && !missingPrice && !missingUnits) return null;

  let reason: ReceiptRetryPlan['reason'] | null = null;
  let box: ReceiptBBox | null = null;
  if (missingTotal) {
    box = retailTotalBox(layout);
    if (box) reason = 'missing-total';
  }
  if (!box && missingPrice) {
    box = targetBox(layout, PRODUCT_HINT);
    if (box) reason = 'missing-price';
  }
  if (!box && missingUnits) {
    box = targetBox(layout, PRODUCT_HINT);
    if (box) reason = 'missing-units';
  }
  if (!box && !parsed.hasUsefulData) {
    box = targetBox(layout, ANY_LABEL);
    if (box) reason = 'weak-data';
  }
  const rect = usableRetryBox(box);
  return rect && reason ? { reason, rect } : null;
}

/**
 * Fills only fields that the baseline could not confirm. Existing values,
 * conflicts and warnings are preserved; a conflicting retry can never replace
 * or remove an original ambiguity.
 */
export function mergeRetryParsed(
  baseline: ParsedPrintedReceipt,
  retry: ParsedPrintedReceipt,
): ParsedPrintedReceipt {
  if (!retry.hasUsefulData) {
    const warnings = [...baseline.warnings];
    if (retry.warnings.some((w) => /segunda lectura|zona con dudas/i.test(w))) {
      if (!warnings.some((w) => /segunda lectura|zona con dudas|conserva la lectura original/i.test(w))) {
        warnings.push('No pudimos releer la zona con dudas; se conserva la lectura original.');
      }
    }
    return {
      ...baseline,
      warnings,
      checks: {
        ...baseline.checks,
        conflictingRetailTotals: baseline.checks.conflictingRetailTotals || retry.checks.conflictingRetailTotals,
      },
    };
  }

  if (!baseline.hasUsefulData) {
    return {
      ...retry,
      warnings: [...retry.warnings],
      checks: {
        ...retry.checks,
        paymentSlipDetected: baseline.checks.paymentSlipDetected || retry.checks.paymentSlipDetected,
        conflictingRetailTotals: baseline.checks.conflictingRetailTotals || retry.checks.conflictingRetailTotals,
        uncertainFields: [...new Set([...baseline.checks.uncertainFields, ...retry.checks.uncertainFields])],
      },
    };
  }

  const fields: VentaOCR = { ...baseline.fields };
  const evidence = { ...baseline.evidence };
  const baselineUncertain = new Set<keyof VentaOCR>(baseline.checks.uncertainFields);
  const retryUncertain = new Set<keyof VentaOCR>(retry.checks.uncertainFields);
  let filled = false;
  let conflictIntroduced = baseline.checks.conflictingRetailTotals;
  const warnings = [...baseline.warnings];

  // If the retry reads a different valid total while baseline already has one, treat as conflict.
  if (baseline.fields.total_boleta !== null && retry.fields.total_boleta !== null && retry.fields.total_boleta !== baseline.fields.total_boleta) {
    conflictIntroduced = true;
    if (!baselineUncertain.has('total_boleta')) warnings.push('Total impreso con valores distintos entre pasadas. Confírmalo manualmente; no lo sustituimos.');
    if (!baselineUncertain.has('total_boleta')) (baselineUncertain as Set<keyof VentaOCR>).add('total_boleta');
    if (!evidence.total_boleta) {
      // keep baseline
    }
  } else if (baseline.fields.total_boleta !== null && retry.fields.total_boleta !== null && retry.fields.total_boleta === baseline.fields.total_boleta) {
    // same
  }

  for (const key of Object.keys(fields) as (keyof VentaOCR)[]) {
    // Any field the baseline itself flagged as ambiguous stays unresolved.
    // A second pass can add genuinely missing sale data, but it must never pick
    // a winner for a conflict the first pass already reported.
    if (baselineUncertain.has(key)) continue;
    if (!RETRY_FILLABLE_FIELDS.has(key)) continue;
    if (fields[key] !== null) continue;
    const value = retry.fields[key];
    if (value === null || value === undefined) continue;
    if (retryUncertain.has(key)) continue;
    if (key === 'total_boleta' && conflictIntroduced && retry.fields.total_boleta !== baseline.fields.total_boleta) continue;
    assignReceiptField(fields, key, retry.fields[key]);
    const source = retry.evidence[key];
    if (source) evidence[key] = { field: key, source: source.source };
    filled = true;
  }

  if (filled && !warnings.some((w) => /segunda lectura/i.test(w))) {
    warnings.push('La segunda lectura de la zona amplió campos pendientes. Confírmalos antes de continuar.');
  }

  const uncertainFieldsMerged = Array.from(new Set<keyof VentaOCR>([
    ...baseline.checks.uncertainFields,
    ...Array.from(baselineUncertain),
    ...retry.checks.uncertainFields,
  ]));
  let merged: ParsedPrintedReceipt = {
    fields,
    warnings,
    hasUsefulData: baseline.hasUsefulData || retry.hasUsefulData || filled,
    evidence,
    checks: {
      ...baseline.checks,
      paymentSlipDetected: baseline.checks.paymentSlipDetected || retry.checks.paymentSlipDetected,
      conflictingRetailTotals: conflictIntroduced || baseline.checks.conflictingRetailTotals || retry.checks.conflictingRetailTotals,
      uncertainFields: uncertainFieldsMerged,
    },
  };

  // Re-check parts vs total if we filled components but kept a printed total
  const price = merged.fields.precio_producto;
  const units = merged.fields.cantidad_unidades;
  const warranty = merged.fields.valor_garantia;
  const total = merged.fields.total_boleta;
  if (price !== null && units !== null && total !== null && price > 0 && units > 0) {
    const warrantyVal = warranty ?? 0;
    const parts = price * units + warrantyVal;
    if (parts !== total) {
      merged = {
        ...merged,
        checks: {
          ...merged.checks,
          partsVsTotal: 'mismatch',
          uncertainFields: Array.from(new Set<keyof VentaOCR>([...merged.checks.uncertainFields, 'total_boleta'])),
        },
        warnings: [...merged.warnings, 'El precio por unidades más la garantía no coincide con el total impreso. Revisa los montos; no los corregimos automáticamente.'],
      };
    } else if (merged.checks.partsVsTotal === 'unknown') {
      merged = { ...merged, checks: { ...merged.checks, partsVsTotal: 'match' } };
    }
  }
  return merged;
}

/** Converts a normalized retry box into Tesseract's pixel rectangle. */
export function retryPlanPixels(rect: ReceiptBBox, imageSize: ImageSize): PixelRectangle {
  const width = validImageSize(imageSize) ? imageSize.width : 1;
  const height = validImageSize(imageSize) ? imageSize.height : 1;
  const left = Math.max(0, Math.min(width - 1, Math.round(rect.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(rect.y * height)));
  const right = Math.max(left + 1, Math.min(width, Math.round((rect.x + rect.width) * width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.round((rect.y + rect.height) * height)));
  return { left, top, width: right - left, height: bottom - top };
}
