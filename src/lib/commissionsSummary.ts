import type { Venta } from '@/types/venta';
import type { CardCommissionRecord } from '@/lib/cardCommissions';
import { cardCommission } from '@/lib/cardCommissions';
import { chileDate, monthRange } from '@/lib/validation';

export interface CommissionSummary {
  /** Recorded warranty commission from server sales, null when the total overflows. */
  observedWarrantyCommission: number | null;
  /** Card base tariff, reported separately from the same-day activation top-up. */
  cardBase: number | null;
  /** Extra amount granted only when the card was activated on its opening day. */
  cardTopUp: number | null;
  /** Base + top-up per card, counted exactly once. */
  cardCommissionTotal: number | null;
  /** Observed warranty plus card commission. Never includes offline pending sales. */
  totalObserved: number | null;
  /** Records ignored because their date or recorded commission was invalid. */
  invalidRecordCount: number;
  /** True when safe-integer totals cannot be represented; totals are null. */
  overflow: boolean;
  projection: {
    enabled: boolean;
    projectedMonthTotal?: number;
    reason?: string;
  };
}

export interface CommissionSummaryOptions {
  now?: Date;
  hasServerData?: boolean;
  isStale?: boolean;
  cardsCorrupt?: boolean;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function addSafe(current: number, amount: number): number | null {
  const next = current + amount;
  return Number.isSafeInteger(next) ? next : null;
}

export function parseCardRecords(raw: string | null): { records: CardCommissionRecord[]; corrupt: boolean } {
  if (raw === null || raw === '') return { records: [], corrupt: false };
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('not an array');
    const ids = new Set<string>();
    for (const record of data) {
      if (!record || typeof record !== 'object' || typeof (record as CardCommissionRecord).id !== 'string') throw new Error('bad id');
      if (ids.has((record as CardCommissionRecord).id)) throw new Error('duplicate id');
      cardCommission(record as CardCommissionRecord);
      ids.add((record as CardCommissionRecord).id);
    }
    return { records: data as CardCommissionRecord[], corrupt: false };
  } catch {
    return { records: [], corrupt: true };
  }
}

export function getCommissionSummary(
  ventas: Venta[],
  cardRecords: CardCommissionRecord[],
  month: string,
  options: CommissionSummaryOptions = {},
): CommissionSummary {
  const now = options.now ?? new Date();
  const hasServerData = options.hasServerData !== false;
  const isStale = options.isStale === true;
  const cardsCorrupt = options.cardsCorrupt === true;
  const range = monthRange(month);

  let today = '';
  try {
    today = chileDate(now);
  } catch {
    today = '';
  }
  const currentMonth = today ? today.slice(0, 7) : '';
  const currentDay = today ? Number(today.slice(8, 10)) : 0;

  let observedWarrantyCommission = 0;
  let cardBase = 0;
  let cardTopUp = 0;
  let cardCommissionTotal = 0;
  let invalidRecordCount = 0;
  let overflow = false;

  if (!range) {
    return {
      observedWarrantyCommission: null,
      cardBase: null,
      cardTopUp: null,
      cardCommissionTotal: null,
      totalObserved: null,
      invalidRecordCount: 0,
      overflow: false,
      projection: { enabled: false, reason: 'Mes inválido' },
    };
  }

  for (const venta of ventas) {
    const fecha = venta?.fecha_compra;
    if (!isValidDate(fecha)) {
      invalidRecordCount += 1;
      continue;
    }
    if (fecha.slice(0, 7) !== month) continue;
    // A future-dated sale is excluded from observed totals and the pace.
    if (today && fecha > today) continue;
    if (!isValidAmount(venta.comision_calculada)) {
      invalidRecordCount += 1;
      continue;
    }
    const next = addSafe(observedWarrantyCommission, venta.comision_calculada);
    if (next === null) overflow = true;
    else observedWarrantyCommission = next;
  }

  for (const record of cardRecords) {
    let commission: number;
    try {
      commission = cardCommission(record);
    } catch {
      invalidRecordCount += 1;
      continue;
    }
    if (!record || typeof record.openedOn !== 'string') {
      invalidRecordCount += 1;
      continue;
    }
    if (record.openedOn.slice(0, 7) !== month) continue;
    // A future-dated card is excluded from observed totals and the pace.
    if (today && record.openedOn > today) continue;

    const base = addSafe(cardBase, record.base);
    if (base === null) overflow = true;
    else cardBase = base;

    const topUpAmount = record.activatedOn ? record.activatedTotal - record.base : 0;
    const topUp = addSafe(cardTopUp, topUpAmount);
    if (topUp === null) overflow = true;
    else cardTopUp = topUp;

    const total = addSafe(cardCommissionTotal, commission);
    if (total === null) overflow = true;
    else cardCommissionTotal = total;
  }

  const observedTotal = addSafe(observedWarrantyCommission, cardCommissionTotal);
  if (observedTotal === null) overflow = true;
  let totalObserved = overflow ? null : observedTotal;
  let observedWarrantyOut = overflow ? null : observedWarrantyCommission;
  let cardBaseOut = overflow ? null : cardBase;
  let cardTopUpOut = overflow ? null : cardTopUp;
  let cardCommissionOut = overflow ? null : cardCommissionTotal;

  // Without a successful server load, warranties and any combined total are
  // unknown. Local card records may still be shown as an explicit subtotal.
  if (!hasServerData) {
    observedWarrantyOut = null;
    totalObserved = null;
  }
  // Corrupt local card storage makes cards and the combined total unavailable.
  if (cardsCorrupt) {
    cardBaseOut = null;
    cardTopUpOut = null;
    cardCommissionOut = null;
    totalObserved = null;
  }

  const summary: CommissionSummary = {
    observedWarrantyCommission: observedWarrantyOut,
    cardBase: cardBaseOut,
    cardTopUp: cardTopUpOut,
    cardCommissionTotal: cardCommissionOut,
    totalObserved,
    invalidRecordCount,
    overflow,
    projection: { enabled: false },
  };

  if (month !== currentMonth) {
    summary.projection = { enabled: false, reason: 'La proyección solo está disponible para el mes actual.' };
    return summary;
  }
  if (!hasServerData) {
    summary.projection = { enabled: false, reason: 'Ventas del servidor no disponibles: no se muestra una proyección. Las tarjetas locales aparecen solo como subtotal.' };
    return summary;
  }
  if (isStale) {
    summary.projection = { enabled: false, reason: 'Datos desactualizados: la proyección se desactiva hasta refrescar las ventas.' };
    return summary;
  }
  if (cardsCorrupt) {
    summary.projection = { enabled: false, reason: 'Los registros locales de tarjetas son inválidos; no se proyecta.' };
    return summary;
  }
  if (overflow || totalObserved === null) {
    summary.projection = { enabled: false, reason: 'Los totales superan el rango seguro y no se muestran.' };
    return summary;
  }
  if (invalidRecordCount > 0) {
    summary.projection = { enabled: false, reason: 'Hay registros incompletos o inválidos; corrige el origen para proyectar.' };
    return summary;
  }
  if (ventas.length >= 1000) {
    summary.projection = { enabled: false, reason: 'La respuesta del servidor alcanzó 1000 registros y puede estar incompleta; no se proyecta.' };
    return summary;
  }
  if (!today || currentDay < 1) {
    summary.projection = { enabled: false, reason: 'Sin datos suficientes para proyectar.' };
    return summary;
  }

  const daysInMonth = Number(range.end.slice(8, 10));
  const projectedMonthTotal = Math.round((totalObserved / currentDay) * daysInMonth);
  if (!Number.isSafeInteger(projectedMonthTotal)) {
    summary.projection = { enabled: false, reason: 'La proyección supera el rango seguro y no se muestra.' };
    return summary;
  }
  summary.projection = {
    enabled: true,
    projectedMonthTotal,
    reason: `Estimación según el ritmo observado al día ${currentDay} de ${daysInMonth}. No es una garantía.`,
  };
  return summary;
}
