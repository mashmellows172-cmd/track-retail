import type { Venta } from '@/types/venta';

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function saleError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Se requiere una venta válida';
  const data = value as Record<string, unknown>;
  for (const field of ['folio', 'vendedor_id']) {
    if (typeof data[field] !== 'string' || !data[field].trim() || data[field].length > 120) {
      return `${field}: ingresa entre 1 y 120 caracteres`;
    }
  }
  if (!isCalendarDate(data.fecha_compra)) return 'Fecha de compra inválida';
  if (data.canal !== 'caja' && data.canal !== 'internet') return 'Canal de venta inválido';
  if (data.tipo_garantia !== 'telefonia' && data.tipo_garantia !== 'lineas_duras') return 'Tipo de garantía inválido';
  if (!Number.isInteger(data.anos_garantia) || Number(data.anos_garantia) < 1 || Number(data.anos_garantia) > (data.tipo_garantia === 'telefonia' ? 2 : 4)) return 'Años de garantía inválidos para el tipo de producto';
  for (const field of ['precio_producto', 'valor_garantia', 'total_boleta']) {
    if (typeof data[field] !== 'number' || !Number.isSafeInteger(data[field]) || data[field] < 0 || data[field] > 999999999999) return `${field}: ingresa un monto entero válido en pesos`;
  }
  if (!Number.isSafeInteger(data.cantidad_unidades) || Number(data.cantidad_unidades) < 1 || Number(data.cantidad_unidades) > 9999) return 'Cantidad de unidades inválida';
  if (data.numero_pedido != null && (typeof data.numero_pedido !== 'string' || data.numero_pedido.length > 120)) return 'Número de pedido inválido';
  return null;
}

export function normalizeSale(data: Venta) {
  return { ...data, folio: data.folio!.trim(), vendedor_id: data.vendedor_id.trim(), numero_pedido: data.canal === 'internet' ? data.numero_pedido?.trim() || null : null };
}

export function monthRange(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, value] = month.split('-').map(Number);
  if (year < 1 || year > 9999) return null;
  const days = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${days}` };
}

export function chileDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
