export interface SaleDraft {
  folio: string;
  fecha_compra: string;
  canal: 'caja' | 'internet';
  precio_producto: number;
  cantidad_unidades: number;
  valor_garantia: number;
  total_boleta: number;
  numero_pedido: string;
  anos_garantia: 1 | 2 | 3 | 4;
  tipo_garantia: 'telefonia' | 'lineas_duras';
  vendedor_id: string;
}

/** A draft can be incomplete or invalid for submission while still containing valuable input. */
export function parseSaleDraft(value: unknown): SaleDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (['folio', 'fecha_compra', 'numero_pedido', 'vendedor_id'].some(key => typeof data[key] !== 'string')) return null;
  if (['precio_producto', 'cantidad_unidades', 'valor_garantia', 'total_boleta'].some(key => typeof data[key] !== 'number' || !Number.isFinite(data[key]))) return null;
  if (!['caja', 'internet'].includes(String(data.canal)) || !['telefonia', 'lineas_duras'].includes(String(data.tipo_garantia)) || typeof data.anos_garantia !== 'number' || ![1, 2, 3, 4].includes(data.anos_garantia)) return null;
  return data as unknown as SaleDraft;
}
