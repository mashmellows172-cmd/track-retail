import type { Venta } from '@/types/venta';
export type ProductArea = 'all' | 'telefonia' | 'lineas_duras';
export function filterSales(ventas: Venta[], area: ProductArea): Venta[] {
  return area === 'all' ? ventas : ventas.filter(venta => venta.tipo_garantia === area);
}
