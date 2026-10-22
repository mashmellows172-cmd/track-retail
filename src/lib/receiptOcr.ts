import type { VentaOCR } from '@/types/venta';
import { isCalendarDate } from '@/lib/validation';

export type ReceiptProvider = 'gemini' | 'qwen' | 'deepseek' | 'grok';
export type ReceiptInput = { mimeType: string; base64: string };
export class OCRFailure extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const keys = { gemini: 'GEMINI_API_KEY', qwen: 'QWEN_API_KEY', deepseek: 'DEEPSEEK_API_KEY', grok: 'XAI_API_KEY' };
export function configuredProviders(env: Record<string, string | undefined>): ReceiptProvider[] {
  const order = (env.OCR_PROVIDERS ?? 'qwen,deepseek,gemini,grok').split(',').map(p => p.trim());
  return [...new Set(order.filter((p): p is ReceiptProvider => Object.hasOwn(keys, p) && !!env[keys[p as ReceiptProvider]]))];
}
export function parseReceipt(text: string): VentaOCR {
  // Strip any markdown wrappers the model may add despite instructions.
  let parsed: VentaOCR;
  try { parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()); }
  catch { throw new OCRFailure(422, 'Invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new OCRFailure(422, 'Invalid receipt');
  const invalidMoney = ['precio_producto', 'valor_garantia', 'total_boleta', 'cantidad_unidades'].some(key => {
    const value = parsed[key as keyof VentaOCR];
    return value != null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 999999999999);
  });
  if (invalidMoney || (parsed.cantidad_unidades != null && parsed.cantidad_unidades < 1) ||
    (parsed.fecha_compra != null && !isCalendarDate(parsed.fecha_compra)) ||
    (parsed.canal != null && !['caja', 'internet'].includes(parsed.canal)) ||
    [parsed.folio, parsed.numero_pedido].some(value => value != null && (typeof value !== 'string' || !value.trim() || value.length > 120)) ||
    !(parsed.folio || (typeof parsed.total_boleta === 'number' && parsed.total_boleta > 0))) throw new OCRFailure(422, 'Invalid extracted fields');
  return { folio: parsed.folio ?? null, fecha_compra: parsed.fecha_compra ?? null,
    precio_producto: parsed.precio_producto ?? null, cantidad_unidades: parsed.cantidad_unidades ?? 1,
    valor_garantia: parsed.valor_garantia ?? null, total_boleta: parsed.total_boleta ?? null,
    canal: parsed.canal ?? null, numero_pedido: parsed.numero_pedido ?? null };
}
export async function extractReceipt(input: ReceiptInput, signal: AbortSignal, providers: ReceiptProvider[],
  call: (provider: ReceiptProvider, input: ReceiptInput, signal: AbortSignal) => Promise<string>): Promise<VentaOCR> {
  signal.throwIfAborted();
  const compatible = providers.filter(p => (input.mimeType !== 'application/pdf' || p === 'gemini') &&
    (p !== 'grok' || ['image/jpeg', 'image/png'].includes(input.mimeType))).slice(0, 2);
  if (!compatible.length) throw new OCRFailure(providers.length ? 415 : 503, 'No compatible configured provider');
  let lastError: unknown;
  for (const provider of compatible) {
    signal.throwIfAborted();
    try { const text = await call(provider, input, signal); signal.throwIfAborted(); return parseReceipt(text); }
    catch (error) {
      signal.throwIfAborted();
      lastError = error;
      // Input validation happens before dispatch; a provider configuration failure may still have a healthy backup.
    }
  }
  throw lastError instanceof OCRFailure ? lastError : new OCRFailure(503, 'Providers unavailable');
}
