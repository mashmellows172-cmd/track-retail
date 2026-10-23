export interface VentaOCR {
  folio: string | null;
  fecha_compra: string | null; // ISO 8601 YYYY-MM-DD
  precio_producto: number | null;
  cantidad_unidades: number | null;
  valor_garantia: number | null;
  total_boleta: number | null;
  canal: 'caja' | 'internet' | null;
  numero_pedido: string | null;
  anos_garantia?: number | null;
  tipo_garantia?: 'telefonia' | 'lineas_duras' | null;
}

export interface Venta extends VentaOCR {
  id?: string;
  anos_garantia: 1 | 2 | 3 | 4 | null;
  tipo_garantia: 'telefonia' | 'lineas_duras' | null;
  vendedor_id: string;
  comision_calculada?: number;
  created_at?: string;
}
