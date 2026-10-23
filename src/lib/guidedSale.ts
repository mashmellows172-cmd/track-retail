import { comisionLineasDuras, comisionTelefonia } from '@/lib/commissions';
import type { SaleDraft } from '@/lib/draft';
import { chileDate } from '@/lib/validation';

export const GUIDED_SALE_HANDOFF_KEY = 'trackretail_handoff_venta_guiada';
export const SALE_DRAFT_KEY = 'trackretail_draft_venta';
export const SALE_FORM_ACTIVE_KEY = 'trackretail_venta_activa';
export const GUIDED_SALE_TTL_MS = 15 * 60 * 1000;
export const GUIDED_SALE_MAX_AMOUNT = 999_999_999_999;
export const GUIDED_SALE_MAX_UNITS = 9999;

export type GuidedSaleChannel = 'caja' | 'internet';
export type GuidedSaleWarrantyType = 'telefonia' | 'lineas_duras';
export type GuidedSaleWarrantyYears = 1 | 2 | 3 | 4;

export interface GuidedSaleProduct {
  plu: string;
  name: string;
}

export interface GuidedSaleSale {
  precio_producto: number;
  cantidad_unidades: number;
  canal: GuidedSaleChannel;
  valor_garantia: number;
  tipo_garantia: GuidedSaleWarrantyType;
  anos_garantia: GuidedSaleWarrantyYears;
  total_boleta: number;
}

export interface GuidedSaleHandoff {
  version: 1;
  createdAt: number;
  product: GuidedSaleProduct;
  sale: GuidedSaleSale;
}

export interface GuidedSaleInput {
  product?: { plu?: unknown; name?: unknown };
  precio_producto?: unknown;
  cantidad_unidades?: unknown;
  canal?: unknown;
  valor_garantia?: unknown;
  tipo_garantia?: unknown;
  anos_garantia?: unknown;
}

export type GuidedSaleErrorField =
  | 'product'
  | 'precio_producto'
  | 'cantidad_unidades'
  | 'canal'
  | 'valor_garantia'
  | 'tipo_garantia'
  | 'anos_garantia'
  | 'total_boleta';

export type GuidedSaleErrors = Partial<Record<GuidedSaleErrorField, string>>;

export type GuidedSaleResult =
  | { ok: true; handoff: GuidedSaleHandoff }
  | { ok: false; errors: GuidedSaleErrors };

export interface GuidedSaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function warrantyYearsFor(type: unknown): number {
  if (type === 'telefonia') return 2;
  if (type === 'lineas_duras') return 4;
  return 0;
}

export function parseGuidedPesos(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 && value <= GUIDED_SALE_MAX_AMOUNT ? value : null;
  }
  if (typeof value !== 'string') return null;
  const compact = value.trim();
  if (!/^\d+$/.test(compact)) return null;
  const parsed = Number(compact);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= GUIDED_SALE_MAX_AMOUNT ? parsed : null;
}

export function parseGuidedQuantity(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const compact = String(value).trim();
  if (!/^\d+$/.test(compact)) return null;
  const parsed = Number(compact);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= GUIDED_SALE_MAX_UNITS ? parsed : null;
}

export function parseGuidedYears(value: unknown, type: unknown): GuidedSaleWarrantyYears | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const compact = String(value).trim();
  if (!/^\d+$/.test(compact)) return null;
  const parsed = Number(compact);
  const max = warrantyYearsFor(type);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) return null;
  return parsed as GuidedSaleWarrantyYears;
}

export function guidedSaleCommission(type: unknown, value: unknown, years: unknown): number {
  const amount = parseGuidedPesos(value);
  const parsedYears = parseGuidedYears(years, type);
  if (amount === null || parsedYears === null) return 0;
  if (type === 'telefonia') return comisionTelefonia(amount, parsedYears);
  if (type === 'lineas_duras') return comisionLineasDuras(amount, parsedYears);
  return 0;
}

/** Stock and price are advisory: the report does not reserve units or confirm online availability. */
export function guidedSaleWarnings(input: { available?: unknown; listPrice?: unknown }): string[] {
  const warnings: string[] = [];
  const available = typeof input.available === 'number' && Number.isSafeInteger(input.available) ? input.available : null;
  if (available === null) {
    warnings.push('La disponibilidad del informe no es válida. Confirma las unidades antes de ofrecer este producto.');
  } else if (available < 0) {
    warnings.push('El informe indica stock negativo. Revisa la incidencia antes de ofrecer este producto.');
  } else if (available === 0) {
    warnings.push('El informe indica 0 unidades. No prometas disponibilidad web ni en sala: confirma una alternativa.');
  } else if (available === 1) {
    warnings.push('Solo hay 1 unidad en el informe. Confirma si está sellada, en exhibición o corresponde a una devolución.');
  }
  const listPrice = typeof input.listPrice === 'number' && Number.isSafeInteger(input.listPrice) && input.listPrice > 0 ? input.listPrice : null;
  if (listPrice === null) {
    warnings.push('El precio del listado no está confirmado. Ingresa el precio real antes de preparar el registro.');
  }
  return warnings;
}

function validateProduct(value: GuidedSaleInput['product']): GuidedSaleProduct | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const plu = typeof value.plu === 'string' ? value.plu.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!plu || plu.length > 40 || !name || name.length > 300) return null;
  return { plu, name };
}

function validateSale(input: GuidedSaleInput, allowBlankWarranty: boolean): { sale: GuidedSaleSale } | { errors: GuidedSaleErrors } {
  const errors: GuidedSaleErrors = {};

  const precio = parseGuidedPesos(input.precio_producto);
  if (precio === null) errors.precio_producto = 'Ingresa un precio unitario entero en pesos, sin decimales.';

  const cantidad = parseGuidedQuantity(input.cantidad_unidades);
  if (cantidad === null) errors.cantidad_unidades = 'La cantidad debe ser un entero entre 1 y 9999.';

  const canal: GuidedSaleChannel | null = input.canal === 'caja' || input.canal === 'internet' ? input.canal : null;
  if (canal === null) errors.canal = 'Selecciona un canal de venta válido.';

  let valorGarantia: number | null = null;
  const blankWarranty = input.valor_garantia === '' || input.valor_garantia === null || input.valor_garantia === undefined;
  if (allowBlankWarranty && blankWarranty) valorGarantia = 0;
  else valorGarantia = parseGuidedPesos(input.valor_garantia);
  if (valorGarantia === null) errors.valor_garantia = 'Ingresa un valor de garantía entero en pesos o déjalo en blanco.';

  const tipo: GuidedSaleWarrantyType | null =
    input.tipo_garantia === 'telefonia' || input.tipo_garantia === 'lineas_duras' ? input.tipo_garantia : null;
  if (tipo === null) errors.tipo_garantia = 'Selecciona el tipo de garantía del producto.';

  const anos = tipo === null ? null : parseGuidedYears(input.anos_garantia, tipo);
  if (anos === null) {
    errors.anos_garantia = tipo === 'telefonia'
      ? 'La garantía de telefonía admite 1 o 2 años.'
      : tipo === 'lineas_duras'
        ? 'La garantía de líneas duras admite entre 1 y 4 años.'
        : 'Selecciona el tipo de garantía para validar los años.';
  }

  if (precio !== null && cantidad !== null && valorGarantia !== null) {
    const total = precio * cantidad + valorGarantia;
    if (!Number.isSafeInteger(total) || total > GUIDED_SALE_MAX_AMOUNT) {
      errors.total_boleta = 'El total supera el monto máximo permitido. Revisa el precio o la cantidad.';
    } else if (Object.keys(errors).length === 0) {
      return {
        sale: {
          precio_producto: precio,
          cantidad_unidades: cantidad,
          canal: canal as GuidedSaleChannel,
          valor_garantia: valorGarantia,
          tipo_garantia: tipo as GuidedSaleWarrantyType,
          anos_garantia: anos as GuidedSaleWarrantyYears,
          total_boleta: total,
        },
      };
    }
  }
  return { errors };
}

export function buildGuidedSale(input: GuidedSaleInput, now = Date.now()): GuidedSaleResult {
  const product = validateProduct(input.product);
  if (!product) {
    return { ok: false, errors: { product: 'No pudimos identificar el producto del stock. Vuelve a seleccionarlo.' } };
  }
  const validated = validateSale(input, true);
  if ('errors' in validated) return { ok: false, errors: validated.errors };
  if (!Number.isSafeInteger(now) || now < 0) {
    return { ok: false, errors: { product: 'No se pudo preparar el registro en este dispositivo.' } };
  }
  return {
    ok: true,
    handoff: { version: 1, createdAt: now, product, sale: validated.sale },
  };
}

function handoffShape(value: unknown): value is GuidedSaleHandoff {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (data.version !== 1) return false;
  if (typeof data.createdAt !== 'number' || !Number.isSafeInteger(data.createdAt) || data.createdAt < 0) return false;
  const product = validateProduct(data.product as GuidedSaleInput['product']);
  if (!product) return false;
  const sale = data.sale;
  if (!sale || typeof sale !== 'object' || Array.isArray(sale)) return false;
  const saleFields = sale as Record<string, unknown>;
  for (const field of ['precio_producto', 'cantidad_unidades', 'valor_garantia', 'anos_garantia', 'total_boleta']) {
    if (typeof saleFields[field] !== 'number') return false;
  }
  const validated = validateSale(sale as GuidedSaleInput, false);
  if ('errors' in validated) return false;
  const expectedTotal = validated.sale.precio_producto * validated.sale.cantidad_unidades + validated.sale.valor_garantia;
  return saleFields.total_boleta === expectedTotal;
}

export function isValidGuidedSaleHandoff(value: unknown, now = Date.now()): value is GuidedSaleHandoff {
  if (!handoffShape(value)) return false;
  if (!Number.isSafeInteger(now) || now < value.createdAt) return false;
  return now - value.createdAt < GUIDED_SALE_TTL_MS;
}

function defaultStorage(): GuidedSaleStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function saveGuidedSaleHandoff(handoff: unknown, storage: GuidedSaleStorage | null = defaultStorage()): boolean {
  if (!storage || !handoffShape(handoff)) return false;
  try {
    storage.setItem(GUIDED_SALE_HANDOFF_KEY, JSON.stringify(handoff));
    return true;
  } catch {
    return false;
  }
}

export function loadGuidedSaleHandoff(
  storage: GuidedSaleStorage | null = defaultStorage(),
  now = Date.now(),
): GuidedSaleHandoff | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(GUIDED_SALE_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearGuidedSaleHandoff(storage);
    return null;
  }
  if (!isValidGuidedSaleHandoff(parsed, now)) {
    clearGuidedSaleHandoff(storage);
    return null;
  }
  return parsed;
}

export function clearGuidedSaleHandoff(storage: GuidedSaleStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(GUIDED_SALE_HANDOFF_KEY);
  } catch {
    /* Storage can be unavailable or full; the form still works without it. */
  }
}

/** Subset of a scanned or guided sale used to seed the confirmation form. */
export interface InitialSaleValues {
  folio?: unknown;
  fecha_compra?: unknown;
  precio_producto?: unknown;
  cantidad_unidades?: unknown;
  valor_garantia?: unknown;
  total_boleta?: unknown;
  canal?: unknown;
  numero_pedido?: unknown;
  anos_garantia?: unknown;
  tipo_garantia?: unknown;
}

function draftAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  if (!value) return 0;
  return Number(String(value).replace(/[^0-9]/g, '')) || 0;
}

/**
 * Builds the exact draft the confirmation form would create from initial
 * values. Keeping this shared avoids the page persisting a different shape.
 */
export function initialSaleDraft(initial: InitialSaleValues, today = chileDate()): SaleDraft {
  const tipoGarantia: SaleDraft['tipo_garantia'] =
    initial.tipo_garantia === 'lineas_duras' ? 'lineas_duras' : 'telefonia';
  const maxYears = tipoGarantia === 'telefonia' ? 2 : 4;
  const requestedYears = draftAmount(initial.anos_garantia);
  const years = (requestedYears >= 1 && requestedYears <= maxYears ? requestedYears : 1) as SaleDraft['anos_garantia'];

  return {
    folio: typeof initial.folio === 'string' ? initial.folio : '',
    fecha_compra: typeof initial.fecha_compra === 'string' && initial.fecha_compra ? initial.fecha_compra : today,
    canal: initial.canal === 'internet' ? 'internet' : 'caja',
    precio_producto: draftAmount(initial.precio_producto),
    cantidad_unidades: draftAmount(initial.cantidad_unidades) || 1,
    valor_garantia: draftAmount(initial.valor_garantia),
    total_boleta: draftAmount(initial.total_boleta),
    numero_pedido: typeof initial.numero_pedido === 'string' ? initial.numero_pedido : '',
    anos_garantia: years,
    tipo_garantia: tipoGarantia,
    vendedor_id: '',
  };
}

export function persistSaleDraft(draft: SaleDraft, storage: GuidedSaleStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SALE_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearSaleDraft(storage: GuidedSaleStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SALE_DRAFT_KEY);
  } catch {
    /* Storage can be unavailable or full; the form still works without it. */
  }
}

export function markSaleFormActive(storage: GuidedSaleStorage | null = defaultStorage(), product?: GuidedSaleProduct | null): boolean {
  if (!storage) return false;
  try {
    const context = product === undefined ? readSaleFormContext(storage) : product;
    storage.setItem(SALE_FORM_ACTIVE_KEY, context ? JSON.stringify(context) : '1');
    return true;
  } catch {
    return false;
  }
}

export function clearSaleFormActive(storage: GuidedSaleStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SALE_FORM_ACTIVE_KEY);
  } catch {
    /* The draft remains available for an explicit restore. */
  }
}

export function isSaleFormActive(storage: GuidedSaleStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SALE_FORM_ACTIVE_KEY) === '1' || readSaleFormContext(storage) !== null;
  } catch {
    return false;
  }
}
export function readSaleFormContext(storage: GuidedSaleStorage | null = defaultStorage()): GuidedSaleProduct | null {
  if (!storage) return null;
  try { return validateProduct(JSON.parse(storage.getItem(SALE_FORM_ACTIVE_KEY) || 'null')); }
  catch { return null; }
}

export type SaleDraftAdoption =
  | { ok: true; draft: SaleDraft }
  | { ok: false; error: string };

/**
 * Persists the chosen initialization first. Only a successful write consumes
 * the guided handoff or marks the form as active, so a storage failure leaves
 * the previous draft and proposal untouched.
 */
export function adoptSaleDraft(
  initial: InitialSaleValues,
  storage: GuidedSaleStorage | null = defaultStorage(),
  today = chileDate(),
  product: GuidedSaleProduct | null = null,
): SaleDraftAdoption {
  const draft = initialSaleDraft(initial, today);
  if (!persistSaleDraft(draft, storage)) {
    return {
      ok: false,
      error: 'No pudimos guardar el borrador en este navegador. Conservamos los datos anteriores; reintenta antes de continuar.',
    };
  }
  clearGuidedSaleHandoff(storage);
  markSaleFormActive(storage, product);
  return { ok: true, draft };
}
