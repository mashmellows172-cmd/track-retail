import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { VentaOCR } from '@/types/venta';
import { isCalendarDate } from '@/lib/validation';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `Eres un experto en leer boletas de retail chileno (La Polar, Falabella, Ripley, Paris, Hites, etc.).
Extrae los datos de la imagen y responde SOLO con un objeto JSON válido. Sin texto adicional, sin markdown, sin bloques de código.

REGLAS DE EXTRACCIÓN:
1. "folio": Busca "FOLIO:", "Ticket Nro", "Boleta N°". Extrae SOLO el número. Ej: "FOLIO:235761008" → "235761008"
2. "fecha_compra": Busca "FECHA/HORA:" o cualquier fecha. Convierte a formato "YYYY-MM-DD". Ej: "31/07/2026" → "2026-07-31"
3. "precio_producto": El precio del producto principal (microonda, celular, TV, etc.). Es el número al final de esa línea (ignora códigos largos de barras). Ej: "MICROONDA 00200027379886 1U 74990" → 74990
4. "cantidad_unidades": Busca "1U", "2U" etc. Ej: "1U" → 1
5. "valor_garantia": Busca "Mas Protecc", "Garantía Extendida", "Mas Proteccion", "Seguro". El precio está al final de esa línea. Ej: "Mas Protecc 1A 200002700445 18244" → 18244
6. "total_boleta": Busca "TOTAL VENTA" o "TOTAL". Extrae el número final.
7. "canal": Si hay "CAJA:", "LOCAL:", "VENTA DEBITO", "VENTA CREDITO" → "caja". Si hay "Despacho", "Pedido Web", "E-commerce" → "internet".
8. "numero_pedido": Solo para ventas internet. Para caja → null.

IMPORTANTE: Todos los montos deben ser números enteros puros. Elimina puntos de miles y símbolo $. "$74.990" → 74990.

Responde ÚNICAMENTE con este JSON (reemplaza los valores):
{"folio":"...","fecha_compra":"YYYY-MM-DD","precio_producto":0,"cantidad_unidades":1,"valor_garantia":0,"total_boleta":0,"canal":"caja","numero_pedido":null}`;

export async function POST(req: NextRequest) {
  try {
    let formData: FormData;
    try { formData = await req.formData(); }
    catch { return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 }); }
    const file = formData.get('image');

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No se recibió ninguna imagen' }, { status: 400 });
    }

    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      return NextResponse.json({ error: 'Usa una imagen JPG, PNG, WebP o un PDF.' }, { status: 415 });
    }
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'El archivo debe pesar como máximo 8 MB.' }, { status: 413 });
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const prefix = (signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);
    const signatures: Record<string, boolean> = {
      'image/jpeg': prefix([255, 216, 255]),
      'image/png': prefix([137, 80, 78, 71, 13, 10, 26, 10]),
      'image/webp': prefix([82, 73, 70, 70]) && prefix([87, 69, 66, 80], 8),
      'application/pdf': prefix([37, 80, 68, 70, 45]),
    };
    if (!signatures[file.type]) return NextResponse.json({ error: 'El contenido del archivo no coincide con su formato.' }, { status: 415 });
    if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'El escáner no está configurado. Puedes ingresar la boleta manualmente.' }, { status: 503 });
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = (file.type && file.type !== 'application/octet-stream') ? file.type : 'image/jpeg';

    const modelNames = [process.env.GEMINI_MODEL || 'gemini-flash-latest'];
    let result = null;
    let lastError = null;

    for (const modelName of modelNames) {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        }
      }, { timeout: 30000 });

      // Reintento con backoff para absorber picos temporales 503 de Gemini
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await model.generateContent([
            SYSTEM_PROMPT,
            { inlineData: { data: base64Image, mimeType } },
          ]);
          break;
        } catch (err: unknown) {
          lastError = err;
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('503') || msg.includes('high demand')) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          break;
        }
      }
      if (result) break;
    }

    if (!result) {
      throw lastError || new Error('No se pudo obtener respuesta del modelo');
    }

    const text = result.response.text().trim();

    // Strip any markdown wrappers the model may add despite instructions
    const jsonStr = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: VentaOCR;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('OCR returned invalid JSON');
      return NextResponse.json(
        { error: 'La IA no pudo interpretar la boleta. Asegúrate de que la foto esté enfocada y sin sombras.' },
        { status: 422 }
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'La IA no devolvió una boleta válida. Intenta otra foto.' }, { status: 422 });
    }
    const invalidMoney = ['precio_producto', 'valor_garantia', 'total_boleta', 'cantidad_unidades'].some(key => {
      const value = parsed[key as keyof VentaOCR];
      return value != null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 999999999999);
    });
    if (invalidMoney || (parsed.fecha_compra != null && !isCalendarDate(parsed.fecha_compra)) ||
      (parsed.canal != null && !['caja', 'internet'].includes(parsed.canal)) ||
      [parsed.folio, parsed.numero_pedido].some(value => value != null && (typeof value !== 'string' || value.length > 120))) {
      return NextResponse.json({ error: 'Los datos extraídos no son válidos. Intenta otra foto o ingresa manualmente.' }, { status: 422 });
    }
    const receipt: VentaOCR = {
      folio: parsed.folio ?? null, fecha_compra: parsed.fecha_compra ?? null,
      precio_producto: parsed.precio_producto ?? null, cantidad_unidades: parsed.cantidad_unidades ?? 1,
      valor_garantia: parsed.valor_garantia ?? null, total_boleta: parsed.total_boleta ?? null,
      canal: parsed.canal ?? null, numero_pedido: parsed.numero_pedido ?? null,
    };
    return NextResponse.json(receipt);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    console.error('Error en /api/ocr: solicitud al proveedor fallida');
    
    if (msg.includes('429') || msg.includes('quota') || msg.includes('Quota')) {
      return NextResponse.json({ error: 'La API Key de Gemini agotó su cuota gratuita. Por favor, espera unos minutos o cambia a un plan de pago.' }, { status: 429 });
    }
    if (msg.includes('503') || msg.includes('high demand')) {
      return NextResponse.json({ error: 'Los servidores de Google Gemini están saturados. Intenta de nuevo en unos segundos.' }, { status: 503 });
    }

    return NextResponse.json({ error: 'No se pudo analizar la boleta. Intenta nuevamente o ingresa los datos manualmente.' }, { status: 500 });
  }
}
