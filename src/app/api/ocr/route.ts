import { NextRequest, NextResponse } from 'next/server';
import { configuredProviders, extractReceipt, OCRFailure } from '@/lib/receiptOcr';
import { callReceiptProvider } from '@/lib/receiptProviders';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (req.signal.aborted) return NextResponse.json({ error: 'Análisis cancelado.' }, { status: 499 });
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
    const providers = configuredProviders(process.env);
    const receipt = await extractReceipt({ mimeType: file.type, base64: Buffer.from(arrayBuffer).toString('base64') }, req.signal, providers, callReceiptProvider);
    return NextResponse.json(receipt);

  } catch (error: unknown) {
    if (req.signal.aborted) return NextResponse.json({ error: 'Análisis cancelado.' }, { status: 499 });
    const status = error instanceof OCRFailure ? error.status : 500;
    const messages: Record<number, string> = {
      401: 'La clave del lector no es válida. Revisa la configuración del servidor o ingresa manualmente.',
      403: 'El lector no tiene acceso al modelo configurado. Puedes ingresar manualmente.',
      415: 'Este proveedor no admite ese formato. Usa una foto JPG o PNG; PDF requiere Gemini.',
      422: 'No se pudieron leer datos válidos. Revisa enfoque y luz o ingresa manualmente.',
      429: 'El servicio de lectura alcanzó su límite. Prueba más tarde o ingresa manualmente.',
      503: 'El servicio de lectura no está disponible. Prueba nuevamente o ingresa manualmente.',
      504: 'El servicio de lectura tardó demasiado. Reintenta o ingresa manualmente.',
    };
    return NextResponse.json({ error: messages[status] || 'No se pudo analizar la boleta. Intenta nuevamente o ingresa manualmente.' }, { status });
  }
}
