import type { Venta } from '@/types/venta';
import { isCalendarDate } from '@/lib/validation';

/**
 * The server keeps folio/date/canal uniqueness. This client-side check is only
 * an early warning for the active seller: it trims whitespace and ignores case,
 * but never strips digits, changes punctuation or guesses a different date.
 */
export const SERVER_DUPLICATE_PAGE_HINT = 1000;

export interface DuplicateCandidate {
  vendedor_id?: unknown;
  folio?: unknown;
  fecha_compra?: unknown;
  canal?: unknown;
}

export interface DuplicateLookup {
  vendedor: string;
  folio: string;
  fecha: string;
}

export type DuplicateSource = 'pending' | 'server';

export interface DuplicateReport {
  pending: Venta | null;
  server: Venta | null;
  sources: DuplicateSource[];
}

export function normalizeFolio(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 && normalized.length <= 120 ? normalized : null;
}

export function duplicateLookup(candidate: DuplicateCandidate): DuplicateLookup | null {
  if (!candidate || typeof candidate !== 'object') return null;
  if (typeof candidate.vendedor_id !== 'string') return null;
  const vendedor = candidate.vendedor_id.trim();
  if (!vendedor || vendedor.length > 120) return null;
  const folio = normalizeFolio(candidate.folio);
  if (!folio) return null;
  if (!isCalendarDate(candidate.fecha_compra)) return null;
  return { vendedor, folio, fecha: candidate.fecha_compra };
}

export function serverMonthFor(candidate: DuplicateCandidate): string | null {
  const lookup = duplicateLookup(candidate);
  return lookup ? lookup.fecha.slice(0, 7) : null;
}

function matchesLookup(value: unknown, lookup: DuplicateLookup): Venta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.vendedor_id !== 'string' || row.vendedor_id.trim() !== lookup.vendedor) return null;
  if (normalizeFolio(row.folio) !== lookup.folio) return null;
  if (row.fecha_compra !== lookup.fecha) return null;
  return value as Venta;
}

export function findDuplicateSale(candidate: DuplicateCandidate, sales: unknown): Venta | null {
  const lookup = duplicateLookup(candidate);
  if (!lookup || !Array.isArray(sales)) return null;
  for (const sale of sales) {
    const match = matchesLookup(sale, lookup);
    if (match) return match;
  }
  return null;
}

export function duplicateReport(
  candidate: DuplicateCandidate,
  pendingSales: unknown,
  serverSales: unknown,
): DuplicateReport | null {
  const lookup = duplicateLookup(candidate);
  if (!lookup) return null;
  const pending = findDuplicateSale(candidate, pendingSales);
  const server = findDuplicateSale(candidate, serverSales);
  const sources: DuplicateSource[] = [];
  if (pending) sources.push('pending');
  if (server) sources.push('server');
  return { pending, server, sources };
}

export interface ParsedServerSales {
  sales: Venta[];
  /** A full page may hide older rows; the notice must say the check can be incomplete. */
  possiblyIncomplete: boolean;
}

/**
 * Rejects an unexpected payload instead of silently treating it as "no
 * duplicates". A malformed row could otherwise hide a real match.
 */
export function parseServerSales(value: unknown): ParsedServerSales | null {
  if (!Array.isArray(value)) return null;
  const sales: Venta[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.folio !== 'string' || !normalizeFolio(row.folio)) return null;
    if (typeof row.fecha_compra !== 'string' || !isCalendarDate(row.fecha_compra)) return null;
    if (typeof row.vendedor_id !== 'string' || !row.vendedor_id.trim() || row.vendedor_id.length > 120) return null;
    sales.push(item as Venta);
  }
  return { sales, possiblyIncomplete: value.length >= SERVER_DUPLICATE_PAGE_HINT };
}

export interface ParsedPendingQueue {
  sales: unknown[];
  invalid: boolean;
}

export function parsePendingQueue(raw: string | null): ParsedPendingQueue {
  if (!raw) return { sales: [], invalid: false };
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? { sales: value, invalid: false } : { sales: [], invalid: true };
  } catch {
    return { sales: [], invalid: true };
  }
}
