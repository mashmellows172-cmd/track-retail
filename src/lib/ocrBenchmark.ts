const fields = new Set(['folio', 'fecha_compra', 'precio_producto', 'cantidad_unidades', 'valor_garantia', 'total_boleta', 'canal', 'numero_pedido']);
export function scoreReceipt(expected: Record<string, unknown>, actual: Record<string, unknown>) {
  const entries = Object.entries(expected);
  if (!entries.length || entries.some(([key]) => !fields.has(key))) throw new Error('Expected receipt must contain known fields');
  const byField = Object.fromEntries(entries.map(([key, value]) => [key, Object.hasOwn(actual, key) && actual[key] === value]));
  return { correct: Object.values(byField).filter(Boolean).length, total: entries.length, byField };
}
