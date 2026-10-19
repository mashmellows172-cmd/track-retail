import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { VentaOCR } from '@/types/venta';

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
    const formData = await req.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ninguna imagen' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = (file.type && file.type !== 'application/octet-stream') ? file.type : 'image/jpeg';

    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      }
    });

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      { inlineData: { data: base64Image, mimeType } },
    ]);

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
      console.error('Gemini raw output (non-JSON):', text);
      return NextResponse.json(
        { error: 'La IA no pudo interpretar la boleta. Asegúrate de que la foto esté enfocada y sin sombras.' },
        { status: 422 }
      );
    }

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('Error en /api/ocr:', error);
    const msg = error.message || 'Error interno';
    
    if (msg.includes('429') || msg.includes('quota') || msg.includes('Quota')) {
      return NextResponse.json({ error: 'La API Key de Gemini agotó su cuota gratuita. Por favor, espera unos minutos o cambia a un plan de pago.' }, { status: 429 });
    }
    if (msg.includes('503') || msg.includes('high demand')) {
      return NextResponse.json({ error: 'Los servidores de Google Gemini están saturados. Intenta de nuevo en unos segundos.' }, { status: 503 });
    }

    return NextResponse.json({ error: `Error de la IA: ${msg}` }, { status: 500 });
  }
}
