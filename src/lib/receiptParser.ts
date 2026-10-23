import type { VentaOCR } from '@/types/venta';
import { isCalendarDate } from '@/lib/validation';

/** Normalized (0..1) box for the OCR line that produced a value. */
export interface ReceiptBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReceiptSourceSnippet {
  /** Original OCR line, trimmed. Values are never synthesized into this text. */
  text: string;
  /** Present only when the engine returned a valid normalized box for this line. */
  bbox?: ReceiptBBox;
}

export interface ReceiptFieldEvidence {
  field: keyof VentaOCR;
  source: ReceiptSourceSnippet;
}

export interface ReceiptLayoutLine {
  text: string;
  bbox?: ReceiptBBox;
}

/** Minimal layout shape accepted from the local engine; extra engine fields are ignored. */
export interface ReceiptLayout {
  lines: ReceiptLayoutLine[];
}

export type ReceiptPartsVsTotal = 'match' | 'mismatch' | 'unknown';

export interface ParsedReceiptChecks {
  /** True when text from a bank/payment slip was detected below the retail section. */
  paymentSlipDetected: boolean;
  /** Distinct printed totals inside the retail section disagree. */
  conflictingRetailTotals: boolean;
  /** price × units + warranty compared with the printed retail total. */
  partsVsTotal: ReceiptPartsVsTotal;
  /** Fields that need human confirmation because values conflicted or were rejected. */
  uncertainFields: (keyof VentaOCR)[];
}

export interface ParsedPrintedReceipt {
  fields: VentaOCR;
  warnings: string[];
  /** True when the page contained at least one supported receipt label, even if its value was ambiguous. */
  hasUsefulData: boolean;
  /** Source line (and optional layout box) per field; absent for values not confirmed. */
  evidence: Partial<Record<keyof VentaOCR, ReceiptFieldEvidence>>;
  checks: ParsedReceiptChecks;
}

const MONEY_MAX = 999_999_999_999;
const LOW_CONFIDENCE = 60;

const TOTAL_LABEL = /\bTOTAL\b/;
const TOTAL_EXCLUDED = /\b(?:IVA|IMPUESTO|NETO|DESCUENTO|AHORRO|TARJETA|DEBITO|CREDITO|EFECTIVO|PAGO|VUELTO|CAMBIO|PROPINA|ABONO|ARTICULOS|UNIDADES|ITEMS)\b/;
const PRICE_LABEL = /\b(?:PRECIO|VALOR\s+UNITARIO|UNITARIO|P\.?\s*UNIT\.?)\b/;
const PRICE_EXCLUDED = /\b(?:TOTAL|SUBTOTAL|GARANTIA|SEGURO|IVA|IMPUESTO|NETO|DESCUENTO|ENVIO|AHORRO)\b/;
const WARRANTY_LABEL = /\b(?:GARANTIA|SEGURO|MAS\s+PROTECC(?:ION)?)\b/;
const UNITS_LABEL = /\b(?:CANTIDAD|CANT\.?|UNIDADES|UNID\.?)\b/;
const ITEM_UNITS = /(?<![A-Z0-9])(\d{1,4})\s*(?:UNIDAD(?:ES)?|UNID\.?|UN|U)(?![A-Z0-9])/;
const DATE_LABEL = /\bFECHA(?:\s+DE)?(?:\s+(?:EMISION|COMPRA|VENTA))?\b/;
const FOLIO_LABEL = /\b(?:FOLIO\b|N(?:[°º]|UMERO|RO)?\.?\s*(?:DE\s*)?BOLETA\b|BOLETA\b(?:\s+ELECTRONICA)?\s*(?:N(?:[°º]|UMERO|RO)?\.?\s*)?)\s*[:#°º.\-]*\s*/;
// Thermal OCR can read the FOLIO label as FULT0/FULTO. Accept that only
// inside a real receipt header that also carries bounded CAJA and LOCAL ids,
// never as a standalone token or as a correction of the value itself.
const FOLIO_OCR_VARIANT = /\b(?:FULT0|FULTO)\b/;
const HEADER_CAJA = /\bCAJA\b\s*[:#.\-]*\s*\d+\b/;
const HEADER_LOCAL = /\bLOCAL\b\s*[:#.\-]*\s*\d+\b/;
const INTERNAL_BARCODE = /\b\d{12,13}\b/;
const ORDER_LABEL = /\b(?:N(?:[°º]|UMERO|RO)?\.?\s*(?:DE\s*)?PEDIDO\b|PEDIDO\b\s*(?:N(?:[°º]|UMERO|RO)?\.?)?|ORDEN\b\s*(?:DE\s+COMPRA)?\s*(?:N(?:[°º]|UMERO|RO)?\.?)?)\s*[:#°º.\-]*\s*/;

const DATE_TOKEN = /\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}|\d{4}-\d{2}-\d{2})\b/g;
const RUT_TOKEN = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dK]\b/g;
const CARD_TOKEN = /\b(?:\d{4}[ -]){2,}\d{4}\b/g;
// Long unformatted digit strings are barcodes/identifiers, not CLP prices.
const LONG_DIGITS = /\b\d{11,}\b/g;
const AMOUNT_TOKEN = /(?<![\d.,])((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?)(?![\d.,])/g;
const PLAIN_INTEGER = /(?<![\d.,])(\d+)(?![\d.,])/g;

// The lower payment/bank slip is a separate printed section. Product, unit,
// warranty and total parsing must not treat it as another retail sale.
const PAYMENT_SECTION = /\b(?:VENTA\s+(?:DEBITO|CREDITO)|PAGO\s+(?:CON\s+)?(?:TARJETA|DEBITO|CREDITO|EFECTIVO|TRANSFERENCIA)|TARJETA\s+(?:DEBITO|CREDITO)|COMPROBANTE\s+DE\s+PAGO|CUPON\s+DE\s+PAGO)\b/;
const REFUND_SECTION = /\b(?:NOTA\s+DE\s+CREDITO|DEVOLUCION|ANULACION|ANULADO)\b/;

const EMPTY_FIELDS: VentaOCR = {
  folio: null,
  fecha_compra: null,
  precio_producto: null,
  cantidad_unidades: null,
  valor_garantia: null,
  total_boleta: null,
  canal: null,
  numero_pedido: null,
  anos_garantia: null,
  tipo_garantia: null,
};

export function normalizeReceiptLine(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

/**
 * Removes numbers that look like dates, RUTs, cards, barcodes, phones, years or
 * percentages. Amount extraction then only sees plausible money tokens.
 */
function maskNonMoney(line: string): string {
  return line
    .replace(DATE_TOKEN, ' ')
    .replace(RUT_TOKEN, ' ')
    .replace(/\b\+?\d{1,2}\s?\d{4}\s?\d{4}\b/g, ' ')
    .replace(/\b\d{1,3}(?:[.,]\d{3})*\s*%/g, ' ')
    .replace(/(?<![A-Z0-9])\d{1,2}\s*(?:ANOS?|MESES?|A)(?![A-Z0-9])/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(CARD_TOKEN, ' ')
    .replace(LONG_DIGITS, ' ');
}

export function parseClpAmount(token: string): number | null {
  if (!/^\d[\d.,]*$/.test(token)) return null;
  if (/[^\d.,]/.test(token)) return null;
  let digits: string;
  if (token.includes('.') && token.includes(',')) {
    const decimalSeparator = token.lastIndexOf(',') > token.lastIndexOf('.') ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    const parts = token.split(decimalSeparator);
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return null;
    // CLP receipt amounts are whole pesos. A non-zero fraction is ambiguous.
    if (parts[1] !== '00') return null;
    const integerPattern = new RegExp(`^\\d{1,3}(?:\\${thousandsSeparator}\\d{3})+$`);
    if (!integerPattern.test(parts[0])) return null;
    digits = parts[0].split(thousandsSeparator).join('');
  } else if (token.includes('.')) {
    if (!/^\d{1,3}(?:\.\d{3})+$/.test(token)) return null;
    digits = token.replace(/\./g, '');
  } else if (token.includes(',')) {
    // A comma with two trailing digits is a decimal amount; CLP prices are
    // printed as whole pesos, so guessing its thousands value is unsafe.
    if (!/^\d{1,3}(?:,\d{3})+$/.test(token)) return null;
    digits = token.replace(/,/g, '');
  } else {
    digits = token;
  }
  if (!/^\d+$/.test(digits)) return null;
  // A leading zero on a multi-digit plain amount is an OCR/format error, not a
  // safe value ("06000" must not silently become 6000). A single 0 stays valid
  // so an explicit zero warranty can still be recorded.
  if (digits.length > 1 && digits.startsWith('0')) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value >= 0 && value <= MONEY_MAX ? value : null;
}

function amountsIn(value: string): number[] {
  const amounts: number[] = [];
  const masked = maskNonMoney(value);
  for (const match of masked.matchAll(AMOUNT_TOKEN)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    const before = masked.slice(Math.max(0, start - 5), start).replace(/[$.\s]/g, '');
    const after = masked.slice(end, end + 3);
    // Refunds, credits and accounting parentheses must stay ambiguous instead
    // of becoming a positive sale amount.
    if (/[-+(]$/.test(before) || /^\s*[-)]/.test(after)) continue;
    if (/[A-Z]/.test(match[1])) continue;
    // An OCR letter glued to the number ("42000O") makes the whole token
    // unreadable; do not salvage the numeric prefix.
    if (/[A-Z]/i.test(masked[start - 1] ?? '') || /[A-Z]/i.test(masked[end] ?? '')) continue;
    if (/[.,]\d{1}$/.test(match[1]) && /[.,]\d{1}[.,]\d{3}$/.test(match[1])) continue;
    const amount = parseClpAmount(match[1]);
    if (amount !== null) amounts.push(amount);
  }
  return amounts;
}

function amountsAfterLabel(line: string, label: RegExp): number[] {
  const match = line.match(label);
  if (!match || match.index === undefined) return [];
  return amountsIn(line.slice(match.index + match[0].length));
}

/**
 * Warranty rows often print "Mas Protecc <short token> <internal barcode>
 * <price>". When a 12/13-digit internal barcode is present, only amounts after
 * it belong to the warranty; the preceding short token may be an OCR reading of
 * the plan years and must not become an amount or a year.
 */
function warrantyAmountsIn(line: string): number[] {
  const match = line.match(WARRANTY_LABEL);
  if (!match || match.index === undefined) return [];
  const remainder = line.slice(match.index + match[0].length);
  const barcode = remainder.match(INTERNAL_BARCODE);
  if (!barcode || barcode.index === undefined) return amountsIn(remainder);
  return amountsIn(remainder.slice(barcode.index + barcode[0].length));
}

function folioLabelIn(line: string): RegExpMatchArray | null {
  const canonical = line.match(FOLIO_LABEL);
  if (canonical) return canonical;
  if (!FOLIO_OCR_VARIANT.test(line) || !HEADER_CAJA.test(line) || !HEADER_LOCAL.test(line)) return null;
  return line.match(/\b(?:FULT0|FULTO)\b\s*[:#°º.\-]*\s*/);
}

interface ItemRow {
  units: number;
  amount: number | null;
  raw: string;
  index?: number;
}

/**
 * Reads the common Chilean item form "PRODUCTO 1U $149.990" without guessing
 * from unlabeled totals. A multi-unit row may be a line total, so its amount is
 * not used as a unit price.
 */
function itemRow(line: string, raw: string): ItemRow | null {
  if (TOTAL_LABEL.test(line) || PRICE_LABEL.test(line) || WARRANTY_LABEL.test(line) || UNITS_LABEL.test(line)) {
    return null;
  }
  let units: number | null = null;
  let amountStart = 0;
  const match = line.match(ITEM_UNITS);
  if (match && match.index !== undefined) {
    units = Number(match[1]);
    amountStart = match.index + match[0].length;
  } else {
    // OCR often prints the quantity column as "IU". Correct it only when the
    // token sits alone between a long product code and the amount column.
    const iu = line.match(/(?<![A-Z0-9])IU(?![A-Z0-9])(?=\s*\$?\s*\d)/);
    if (!iu || iu.index === undefined) return null;
    if (!/\b\d{8,}\s*$/.test(line.slice(0, iu.index))) return null;
    units = 1;
    amountStart = iu.index + iu[0].length;
  }
  if (!Number.isSafeInteger(units) || units < 1 || units > 99) return null;
  const amounts = amountsIn(line.slice(amountStart));
  return { units, amount: amounts.length === 1 ? amounts[0] : null, raw };
}

function plainIntegersAfterLabel(line: string, label: RegExp): number[] {
  const match = line.match(label);
  if (!match || match.index === undefined) return [];
  const values: number[] = [];
  for (const item of maskNonMoney(line.slice(match.index + match[0].length)).matchAll(PLAIN_INTEGER)) {
    const value = Number(item[1]);
    if (Number.isSafeInteger(value) && value >= 1 && value <= 9999) values.push(value);
  }
  return values;
}

interface Candidate<T> {
  value: T;
  raw: string;
  index?: number;
}

function uniqueValues<T>(items: Candidate<T>[]): T[] {
  return [...new Set(items.map((item) => item.value))];
}

function singleCandidate<T>(items: Candidate<T>[]): Candidate<T> | null {
  const values = uniqueValues(items);
  if (values.length !== 1) return null;
  return items.find((item) => item.value === values[0]) ?? null;
}

function folioCandidates(line: string): { candidates: string[]; rejected: boolean } {
  const match = folioLabelIn(line);
  if (!match || match.index === undefined) return { candidates: [], rejected: false };
  const rawRemainder = line.slice(match.index + match[0].length);
  // Mask cards, RUTs and dates, but keep 9-digit folios: the general money
  // mask would treat them as phone numbers and discard a valid folio.
  const maskedRemainder = rawRemainder
    .replace(CARD_TOKEN, ' ')
    .replace(RUT_TOKEN, ' ')
    .replace(DATE_TOKEN, ' ');
  // Only the value directly after the label is the folio. A header such as
  // "FOLIO:876543210 CAJA:3 LOCAL:99" must not collect 3 and 99 as folios.
  const token = maskedRemainder.match(/[A-Z0-9]+(?:-[A-Z0-9]+)*/);
  if (!token) return { candidates: [], rejected: /\d/.test(rawRemainder) };
  const value = token[0];
  const digits = value.replace(/\D/g, '');
  if (!digits || digits.length > 10 || value.length > 20) {
    return { candidates: [], rejected: /\d/.test(rawRemainder) };
  }
  return { candidates: [value], rejected: false };
}

function orderCandidates(line: string): string[] {
  const match = line.match(ORDER_LABEL);
  if (!match || match.index === undefined) return [];
  const candidates: string[] = [];
  for (const token of maskNonMoney(line.slice(match.index + match[0].length)).matchAll(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g)) {
    const value = token[0];
    if (/\d/.test(value) && value.length <= 120) candidates.push(value);
  }
  return [...new Set(candidates)];
}

function channelIn(line: string): 'caja' | 'internet' | null {
  const labelled = line.match(/\bCANAL\s*[:.\-]*\s*(INTERNET|WEB|ONLINE|CAJA|PRESENCIAL|TIENDA)\b/);
  if (labelled) return ['INTERNET', 'WEB', 'ONLINE'].includes(labelled[1]) ? 'internet' : 'caja';
  if (/\bVENTA\s+(?:POR\s+)?(?:INTERNET|WEB|ONLINE)\b/.test(line)) return 'internet';
  if (/\bCAJA\s*[:#.\-]*\s*\d+\b/.test(line)) return 'caja';
  return null;
}

function dateIn(line: string): { date: string | null; sawDate: boolean; rejected: boolean } {
  const match = line.match(DATE_LABEL);
  if (!match || match.index === undefined) return { date: null, sawDate: false, rejected: false };
  const remainder = line.slice(match.index + match[0].length);
  const found: string[] = [];
  let sawMalformed = false;
  for (const item of remainder.matchAll(/\b(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}))\b/g)) {
    sawMalformed = true;
    const [year, month, day] = item[1]
      ? [item[1], item[2], item[3]]
      : [item[6], item[5], item[4]];
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    if (isCalendarDate(iso)) found.push(iso);
  }
  const distinct = [...new Set(found)];
  return { date: distinct.length === 1 ? distinct[0] : null, sawDate: true, rejected: distinct.length === 0 && sawMalformed };
}

/**
 * Warranty years are read only from a compact plan token attached to a
 * warranty line ("Mas Protecc 3A"). Generic prose such as "2 AÑOS" keeps the
 * existing manual-review behavior, and the type is never inferred.
 */
function warrantyYearsIn(line: string): number | null {
  if (!WARRANTY_LABEL.test(line)) return null;
  const compact = line.match(/\b([1-9])A\b/);
  if (compact) return Number(compact[1]);
  // Explicit prose is accepted only on a warranty-labelled line; the type is
  // still never inferred and bare year mentions elsewhere are ignored.
  const prose = line.match(/\b([1-9]\d?)\s*(?:ANOS?|AÑOS?)\b/);
  return prose ? Number(prose[1]) : null;
}

function validBBox(value: unknown): ReceiptBBox | null {
  if (!value || typeof value !== 'object') return null;
  const box = value as Record<string, unknown>;
  const { x, y, width, height } = box;
  if (![x, y, width, height].every((part) => typeof part === 'number' && Number.isFinite(part))) return null;
  const [left, top, w, h] = [x as number, y as number, width as number, height as number];
  if (left < 0 || top < 0 || w <= 0 || h <= 0) return null;
  if (left + w > 1.0001 || top + h > 1.0001) return null;
  return { x: left, y: top, width: w, height: h };
}

function layoutBoxes(layout: ReceiptLayout | null | undefined): Array<{ key: string; bbox: ReceiptBBox | null }> {
  const boxes: Array<{ key: string; bbox: ReceiptBBox | null }> = [];
  const lines = Array.isArray(layout?.lines) ? layout.lines : [];
  for (const line of lines) {
    if (!line || typeof line.text !== 'string') continue;
    const key = normalizeReceiptLine(line.text);
    if (!key) continue;
    // Keep entries with an invalid box so occurrence order still identifies
    // the real line instead of silently promoting a different duplicate.
    boxes.push({ key, bbox: validBBox(line.bbox) });
  }
  return boxes;
}

export function parsePrintedReceipt(
  rawText: string,
  confidence: number | null = null,
  optionalLayout: ReceiptLayout | null = null,
): ParsedPrintedReceipt {
  const text = typeof rawText === 'string' ? rawText : '';
  const lines = text
    .split(/\r?\n/)
    .map((raw) => ({ raw: raw.trim(), normalized: normalizeReceiptLine(raw) }))
    .filter((line) => line.normalized);
  const warnings: string[] = [];
  const boxes = layoutBoxes(optionalLayout);
  const sourceFor = (raw: string, index: number): ReceiptSourceSnippet => {
    // Match the candidate to the layout by occurrence order of its normalized
    // text. A duplicate must keep its own (possibly invalid) box rather than
    // borrowing a valid box from another retail/bank section.
    const key = normalizeReceiptLine(raw);
    if (!key) return { text: raw };
    let occurrence = 0;
    for (let i = 0; i < lines.length && i <= index; i += 1) {
      if (lines[i].normalized === key) occurrence += 1;
    }
    occurrence -= 1;
    if (occurrence < 0) return { text: raw };
    const matches = boxes.filter((entry) => entry.key === key);
    // If the text repeats more often than the layout, the box cannot be tied
    // to a specific occurrence (a lone bank box would otherwise be borrowed).
    const textOccurrences = lines.filter((line) => line.normalized === key).length;
    if (matches.length < textOccurrences) return { text: raw };
    const candidate = matches[occurrence];
    if (!candidate?.bbox) return { text: raw };
    return { text: raw, bbox: candidate.bbox };
  };

  if (!lines.length) {
    return {
      fields: { ...EMPTY_FIELDS },
      warnings: ['No pudimos leer texto en la imagen. Conserva la foto y prueba con una imagen más clara o el ingreso manual.'],
      hasUsefulData: false,
      evidence: {},
      checks: {
        paymentSlipDetected: false,
        conflictingRetailTotals: false,
        partsVsTotal: 'unknown',
        uncertainFields: [],
      },
    };
  }

  const retailTotals: Candidate<number>[] = [];
  const paymentTotals: Candidate<number>[] = [];
  const prices: Candidate<number>[] = [];
  const warranties: Candidate<number>[] = [];
  const warrantyYears: Candidate<number>[] = [];
  const unitCounts: Candidate<number>[] = [];
  const itemRows: ItemRow[] = [];
  const folios: Candidate<string>[] = [];
  const dates: Candidate<string>[] = [];
  const channels: Candidate<'caja' | 'internet'>[] = [];
  const orders: Candidate<string>[] = [];
  let sawLabel = false;
  let sawRetailProduct = false;
  let rejectedFolio = false;
  let invalidDate = false;
  let paymentSlipDetected = false;
  let firstPaymentLine = -1;

  // Refund context applies to the whole document; amounts printed above the
  // heading are still refund/credit amounts, never ordinary positive sales.
  let refundSection = lines.some((line) => REFUND_SECTION.test(line.normalized));
  for (let i = 0; i < lines.length; i += 1) {
    const { raw, normalized: line } = lines[i];
    if (REFUND_SECTION.test(line)) refundSection = true;
    if (PAYMENT_SECTION.test(line)) {
      if (firstPaymentLine === -1) firstPaymentLine = i;
      if (sawLabel && sawRetailProduct) paymentSlipDetected = true;
    }
    const retailSection = !paymentSlipDetected;
    const retailAccepted = retailSection && !refundSection;

    if (TOTAL_LABEL.test(line) && !TOTAL_EXCLUDED.test(line)) {
      sawLabel = true;
      const amounts = amountsAfterLabel(line, TOTAL_LABEL).filter((amount) => amount > 0);
      if (amounts.length) sawRetailProduct = true;
      if (retailAccepted) {
        for (const value of amounts) {
          retailTotals.push({ value, raw, index: i });
        }
      } else if (retailSection && !refundSection) {
        for (const value of amounts) {
          paymentTotals.push({ value, raw, index: i });
        }
      }
    }
    if (retailAccepted && PRICE_LABEL.test(line) && !PRICE_EXCLUDED.test(line)) {
      sawLabel = true;
      sawRetailProduct = true;
      for (const value of amountsAfterLabel(line, PRICE_LABEL).filter((amount) => amount > 0)) {
        prices.push({ value, raw, index: i });
      }
    }
    if (retailAccepted && WARRANTY_LABEL.test(line)) {
      sawLabel = true;
      sawRetailProduct = true;
      for (const value of warrantyAmountsIn(line)) warranties.push({ value, raw, index: i });
      const years = warrantyYearsIn(line);
      if (years !== null) warrantyYears.push({ value: years, raw, index: i });
    }
    if (retailAccepted && UNITS_LABEL.test(line)) {
      sawLabel = true;
      sawRetailProduct = true;
      for (const value of plainIntegersAfterLabel(line, UNITS_LABEL)) unitCounts.push({ value, raw, index: i });
    } else if (retailAccepted) {
      const item = itemRow(line, raw);
      if (item) {
        sawLabel = true;
        sawRetailProduct = true;
        itemRows.push({ ...item, index: i });
      }
    }
    if (folioLabelIn(line)) {
      sawLabel = true;
      if (retailAccepted) {
        const folio = folioCandidates(line);
        for (const value of folio.candidates) folios.push({ value, raw, index: i });
        rejectedFolio ||= folio.rejected && !folio.candidates.length;
      }
    }
    if (ORDER_LABEL.test(line)) {
      sawLabel = true;
      if (retailAccepted) {
        for (const value of orderCandidates(line)) orders.push({ value, raw, index: i });
      }
    }
    if (DATE_LABEL.test(line)) {
      sawLabel = true;
      if (retailAccepted) {
        const parsed = dateIn(line);
        if (parsed.date) dates.push({ value: parsed.date, raw, index: i });
        invalidDate ||= parsed.rejected;
      }
    }
    const channel = channelIn(line);
    if (channel) {
      sawLabel = true;
      if (retailAccepted) {
        channels.push({ value: channel, raw, index: i });
      }
    }
  }

  // A transcript that starts directly with a bank/payment marker and has no
  // retail product evidence is a payment slip, not a sale receipt. Only then
  // may amounts after the marker be treated as bank totals.
  const paymentBeforeRetail = firstPaymentLine !== -1 && !retailTotals.some((candidate) => {
    const index = candidate.index;
    return index !== undefined && index < firstPaymentLine;
  });
  if (paymentBeforeRetail && !itemRows.length && !prices.length && !warranties.length && !unitCounts.length) {
    paymentSlipDetected = true;
    retailTotals.length = 0;
  }

  if (itemRows.length === 1) {
    const [item] = itemRows;
    unitCounts.push({ value: item.units, raw: item.raw, index: item.index });
    if (item.units === 1 && item.amount !== null) prices.push({ value: item.amount, raw: item.raw, index: item.index });
  }

  const totalPool = retailTotals.length ? retailTotals : paymentTotals;
  const totalSource = retailTotals.length ? singleCandidate(retailTotals) : singleCandidate(paymentTotals);
  const priceSource = singleCandidate(prices);
  const warrantySource = singleCandidate(warranties);
  const yearsSource = singleCandidate(warrantyYears);
  const unitsSource = singleCandidate(unitCounts);
  const folioSource = singleCandidate(folios);
  const dateSource = singleCandidate(dates);
  const channelSource = singleCandidate(channels);
  const orderSource = singleCandidate(orders);

  const total = totalSource?.value ?? null;
  const price = priceSource?.value ?? null;
  const warranty = warrantySource?.value ?? null;
  const units = unitsSource?.value ?? null;
  const folio = folioSource?.value ?? null;
  const date = dateSource?.value ?? null;
  const channel = channelSource?.value ?? null;
  const order = orderSource?.value ?? null;
  const years = yearsSource?.value ?? null;

  const uncertain = new Set<keyof VentaOCR>();
  const conflictingRetailTotals = uniqueValues(retailTotals).length > 1;

  if (typeof confidence === 'number' && Number.isFinite(confidence) && confidence < LOW_CONFIDENCE && sawLabel) {
    warnings.push(`La lectura local tiene baja confianza (${Math.round(confidence)} %). Revisa cada dato antes de continuar.`);
  }
  if (uniqueValues(totalPool).length > 1) {
    warnings.push('El total aparece con más de un valor. Confírmalo manualmente; no elegimos ni sumamos montos al azar.');
    uncertain.add('total_boleta');
  } else if (total === null && sawLabel) {
    warnings.push('No pudimos confirmar el total. Ingrésalo manualmente; no lo calculamos sumando otros montos.');
    uncertain.add('total_boleta');
  }
  if (itemRows.length > 1) {
    warnings.push('La boleta muestra varias líneas de productos. Revisa el precio y la cantidad manualmente; no combinamos esas líneas.');
    uncertain.add('precio_producto');
    uncertain.add('cantidad_unidades');
  } else if (itemRows.length === 1 && itemRows[0].units > 1) {
    warnings.push('La línea de producto indica más de una unidad. No tomamos su monto como precio unitario; revísalo manualmente.');
    uncertain.add('precio_producto');
  }
  if (uniqueValues(prices).length > 1) {
    warnings.push('El precio del producto aparece con más de un valor. Ingrésalo manualmente.');
    uncertain.add('precio_producto');
  }
  if (uniqueValues(warranties).length > 1) {
    warnings.push('La garantía aparece con más de un valor. Ingrésala manualmente.');
    uncertain.add('valor_garantia');
  }
  if (uniqueValues(unitCounts).length > 1) {
    warnings.push('La cantidad de unidades aparece con más de un valor. Ingrésala manualmente.');
    uncertain.add('cantidad_unidades');
  }
  if (uniqueValues(folios).length > 1) {
    warnings.push('El folio aparece con más de un valor. Ingrésalo manualmente.');
    uncertain.add('folio');
  } else if (rejectedFolio) {
    warnings.push('No pudimos confirmar el folio; puede ser un código de barras o un número de tarjeta. Ingrésalo manualmente.');
    uncertain.add('folio');
  }
  if (invalidDate) {
    warnings.push('La fecha detectada no es válida. Revísala antes de continuar.');
    uncertain.add('fecha_compra');
  } else if (uniqueValues(dates).length > 1) {
    warnings.push('La fecha aparece con más de un valor. Revísala antes de continuar.');
    uncertain.add('fecha_compra');
  }
  if (uniqueValues(channels).length > 1) {
    warnings.push('El canal aparece con más de un valor. Selecciónalo manualmente.');
    uncertain.add('canal');
  }

  let partsVsTotal: ReceiptPartsVsTotal = 'unknown';
  if (price !== null && units !== null && warranty !== null && total !== null && price > 0 && units > 0) {
    partsVsTotal = price * units + warranty === total ? 'match' : 'mismatch';
    if (partsVsTotal === 'mismatch') {
      warnings.push('El precio por unidades más la garantía no coincide con el total impreso. Revisa los montos; no los corregimos automáticamente.');
      uncertain.add('total_boleta');
    }
  }

  if (paymentSlipDetected && !retailTotals.length && !itemRows.length && !prices.length && !warranties.length && !unitCounts.length) {
    warnings.push('Solo detectamos la sección de pago o comprobante. No asumimos producto, unidades ni garantía; ingrésalos manualmente si corresponden.');
  }
  if (refundSection && sawLabel && total === null && price === null && warranty === null && units === null) {
    warnings.push('Documento de devolución detectado. Los montos deben revisarse manualmente; no asumimos un total de venta positivo.');
  }

  if (!sawLabel) {
    warnings.push('No pudimos leer datos útiles de la boleta. Conserva la foto y prueba con una imagen más clara o el ingreso manual.');
  }

  const evidence: Partial<Record<keyof VentaOCR, ReceiptFieldEvidence>> = {};
  const addEvidence = <T>(field: keyof VentaOCR, candidate: Candidate<T> | null) => {
    if (!candidate) return;
    const idx = typeof candidate.index === 'number' ? candidate.index : 0;
    evidence[field] = { field, source: sourceFor(candidate.raw, idx) };
  };
  addEvidence('folio', folioSource);
  addEvidence('fecha_compra', dateSource);
  addEvidence('precio_producto', priceSource);
  addEvidence('cantidad_unidades', unitsSource);
  addEvidence('valor_garantia', warrantySource);
  addEvidence('total_boleta', totalSource);
  addEvidence('canal', channelSource);
  addEvidence('numero_pedido', orderSource);
  addEvidence('anos_garantia', yearsSource);

  return {
    fields: {
      folio,
      fecha_compra: date,
      precio_producto: price,
      cantidad_unidades: units,
      valor_garantia: warranty,
      total_boleta: total,
      canal: channel,
      numero_pedido: order,
      anos_garantia: years,
      tipo_garantia: null,
    },
    warnings,
    hasUsefulData: sawLabel,
    evidence,
    checks: {
      paymentSlipDetected,
      conflictingRetailTotals,
      partsVsTotal,
      uncertainFields: [...uncertain],
    },
  };
}
