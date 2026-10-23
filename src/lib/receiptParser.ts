import type { VentaOCR } from '@/types/venta';
import { isCalendarDate } from '@/lib/validation';

export interface ParsedPrintedReceipt {
  fields: VentaOCR;
  warnings: string[];
  /** True when the page contained at least one supported receipt label, even if its value was ambiguous. */
  hasUsefulData: boolean;
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
const ORDER_LABEL = /\b(?:N(?:[°º]|UMERO|RO)?\.?\s*(?:DE\s*)?PEDIDO\b|PEDIDO\b\s*(?:N(?:[°º]|UMERO|RO)?\.?)?|ORDEN\b\s*(?:DE\s+COMPRA)?\s*(?:N(?:[°º]|UMERO|RO)?\.?)?)\s*[:#°º.\-]*\s*/;

const DATE_TOKEN = /\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}|\d{4}-\d{2}-\d{2})\b/g;
const RUT_TOKEN = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dK]\b/g;
const CARD_TOKEN = /\b(?:\d{4}[ -]){2,}\d{4}\b/g;
// Long unformatted digit strings are barcodes/identifiers, not CLP prices.
const LONG_DIGITS = /\b\d{11,}\b/g;
const AMOUNT_TOKEN = /(?<![\d.,])((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?)(?!\d)/g;
const PLAIN_INTEGER = /(?<![\d.,])(\d+)(?![\d.,])/g;

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
    const after = masked.slice(end, end + 2);
    // Refunds, credits and accounting parentheses must stay ambiguous instead
    // of becoming a positive sale amount.
    if (/[-+(]$/.test(before) || /^\s*[-)]/.test(after)) continue;
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

interface ItemRow {
  units: number;
  amount: number | null;
}

/**
 * Reads the common Chilean item form "PRODUCTO 1U $149.990" without guessing
 * from unlabeled totals. A multi-unit row may be a line total, so its amount is
 * not used as a unit price.
 */
function itemRow(line: string): ItemRow | null {
  if (TOTAL_LABEL.test(line) || PRICE_LABEL.test(line) || WARRANTY_LABEL.test(line) || UNITS_LABEL.test(line)) {
    return null;
  }
  const match = line.match(ITEM_UNITS);
  if (!match || match.index === undefined) return null;
  const units = Number(match[1]);
  if (!Number.isSafeInteger(units) || units < 1 || units > 99) return null;
  const amounts = amountsIn(line.slice(match.index + match[0].length));
  return { units, amount: amounts.length === 1 ? amounts[0] : null };
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function singleValue<T>(values: T[]): T | null {
  const distinct = unique(values);
  return distinct.length === 1 ? distinct[0] : null;
}

function folioCandidates(line: string): { candidates: string[]; rejected: boolean } {
  const match = line.match(FOLIO_LABEL);
  if (!match || match.index === undefined) return { candidates: [], rejected: false };
  const rawRemainder = line.slice(match.index + match[0].length);
  const maskedRemainder = maskNonMoney(rawRemainder);
  const candidates: string[] = [];
  for (const token of maskedRemainder.matchAll(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g)) {
    const value = token[0];
    const digits = value.replace(/\D/g, '');
    if (!digits || digits.length > 10 || value.length > 20) continue;
    candidates.push(value);
  }
  return {
    candidates: unique(candidates),
    rejected: /\d/.test(rawRemainder) && candidates.length === 0,
  };
}

function orderCandidates(line: string): string[] {
  const match = line.match(ORDER_LABEL);
  if (!match || match.index === undefined) return [];
  const candidates: string[] = [];
  for (const token of maskNonMoney(line.slice(match.index + match[0].length)).matchAll(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g)) {
    const value = token[0];
    if (/\d/.test(value) && value.length <= 120) candidates.push(value);
  }
  return unique(candidates);
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
  const distinct = unique(found);
  return { date: distinct.length === 1 ? distinct[0] : null, sawDate: true, rejected: distinct.length === 0 && sawMalformed };
}

export function parsePrintedReceipt(rawText: string, confidence: number | null = null): ParsedPrintedReceipt {
  const text = typeof rawText === 'string' ? rawText : '';
  const lines = text.split(/\r?\n/).map(normalizeReceiptLine).filter(Boolean);
  const warnings: string[] = [];
  if (!lines.length) {
    return {
      fields: { ...EMPTY_FIELDS },
      warnings: ['No pudimos leer texto en la imagen. Conserva la foto y prueba con una imagen más clara o el ingreso manual.'],
      hasUsefulData: false,
    };
  }

  const totals: number[] = [];
  const prices: number[] = [];
  const warranties: number[] = [];
  const unitCounts: number[] = [];
  const itemRows: ItemRow[] = [];
  const folios: string[] = [];
  const dates: string[] = [];
  const channels: ('caja' | 'internet')[] = [];
  const orders: string[] = [];
  let sawLabel = false;
  let rejectedFolio = false;
  let invalidDate = false;

  for (const line of lines) {
    if (TOTAL_LABEL.test(line) && !TOTAL_EXCLUDED.test(line)) {
      sawLabel = true;
      totals.push(...amountsAfterLabel(line, TOTAL_LABEL).filter((amount) => amount > 0));
    }
    if (PRICE_LABEL.test(line) && !PRICE_EXCLUDED.test(line)) {
      sawLabel = true;
      prices.push(...amountsAfterLabel(line, PRICE_LABEL).filter((amount) => amount > 0));
    }
    if (WARRANTY_LABEL.test(line)) {
      sawLabel = true;
      warranties.push(...amountsAfterLabel(line, WARRANTY_LABEL));
    }
    if (UNITS_LABEL.test(line)) {
      sawLabel = true;
      unitCounts.push(...plainIntegersAfterLabel(line, UNITS_LABEL));
    } else {
      const item = itemRow(line);
      if (item) {
        sawLabel = true;
        itemRows.push(item);
      }
    }
    if (FOLIO_LABEL.test(line)) {
      sawLabel = true;
      const folio = folioCandidates(line);
      folios.push(...folio.candidates);
      rejectedFolio ||= folio.rejected;
    }
    if (ORDER_LABEL.test(line)) {
      sawLabel = true;
      orders.push(...orderCandidates(line));
    }
    if (DATE_LABEL.test(line)) {
      sawLabel = true;
      const parsed = dateIn(line);
      if (parsed.date) dates.push(parsed.date);
      invalidDate ||= parsed.rejected;
    }
    const channel = channelIn(line);
    if (channel) {
      sawLabel = true;
      channels.push(channel);
    }
  }

  if (itemRows.length === 1) {
    const [item] = itemRows;
    unitCounts.push(item.units);
    if (item.units === 1 && item.amount !== null) prices.push(item.amount);
  }

  const total = singleValue(totals);
  const price = singleValue(prices);
  const warranty = singleValue(warranties);
  const units = singleValue(unitCounts);
  const folio = singleValue(folios);
  const date = singleValue(dates);
  const channel = singleValue(channels);
  const order = singleValue(orders);

  if (typeof confidence === 'number' && Number.isFinite(confidence) && confidence < LOW_CONFIDENCE && sawLabel) {
    warnings.push(`La lectura local tiene baja confianza (${Math.round(confidence)} %). Revisa cada dato antes de continuar.`);
  }
  if (unique(totals).length > 1) {
    warnings.push('El total aparece con más de un valor. Confírmalo manualmente; no elegimos ni sumamos montos al azar.');
  } else if (total === null && sawLabel) {
    warnings.push('No pudimos confirmar el total. Ingrésalo manualmente; no lo calculamos sumando otros montos.');
  }
  if (itemRows.length > 1) {
    warnings.push('La boleta muestra varias líneas de productos. Revisa el precio y la cantidad manualmente; no combinamos esas líneas.');
  } else if (itemRows.length === 1 && itemRows[0].units > 1) {
    warnings.push('La línea de producto indica más de una unidad. No tomamos su monto como precio unitario; revísalo manualmente.');
  }
  if (unique(prices).length > 1) {
    warnings.push('El precio del producto aparece con más de un valor. Ingrésalo manualmente.');
  }
  if (unique(warranties).length > 1) {
    warnings.push('La garantía aparece con más de un valor. Ingrésala manualmente.');
  }
  if (unique(unitCounts).length > 1) {
    warnings.push('La cantidad de unidades aparece con más de un valor. Ingrésala manualmente.');
  }
  if (unique(folios).length > 1) {
    warnings.push('El folio aparece con más de un valor. Ingrésalo manualmente.');
  } else if (rejectedFolio) {
    warnings.push('No pudimos confirmar el folio; puede ser un código de barras o un número de tarjeta. Ingrésalo manualmente.');
  }
  if (invalidDate) {
    warnings.push('La fecha detectada no es válida. Revísala antes de continuar.');
  } else if (unique(dates).length > 1) {
    warnings.push('La fecha aparece con más de un valor. Revísala antes de continuar.');
  }
  if (unique(channels).length > 1) {
    warnings.push('El canal aparece con más de un valor. Selecciónalo manualmente.');
  }

  if (!sawLabel) {
    warnings.push('No pudimos leer datos útiles de la boleta. Conserva la foto y prueba con una imagen más clara o el ingreso manual.');
  }

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
      anos_garantia: null,
      tipo_garantia: null,
    },
    warnings,
    hasUsefulData: sawLabel,
  };
}
