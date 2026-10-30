import { NextRequest, NextResponse } from 'next/server';
import { extractAbcReference } from '@/lib/abcReference';

const MAX_BYTES = 2 * 1024 * 1024;

async function readBoundedHtml(response: Response): Promise<string | null> {
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return html + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function GET(request: NextRequest) {
  const plu = request.nextUrl.searchParams.get('plu') || '';
  if (!/^\d{8}$/.test(plu)) return NextResponse.json({ error: 'PLU inválido.' }, { status: 400 });
  let url = new URL(`https://www.abc.cl/${plu}.html`);
  const signal = AbortSignal.timeout(10000);
  try {
    for (let redirects = 0; redirects < 4; redirects++) {
      const response = await fetch(url, { redirect: 'manual', signal, cache: 'no-store' });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) break;
        const next = new URL(location, url);
        if (next.protocol !== 'https:' || next.hostname !== 'www.abc.cl' || next.username || next.password || next.port) break;
        url = next;
        continue;
      }
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
        await response.body?.cancel();
        break;
      }
      const html = await readBoundedHtml(response);
      if (html === null) break;
      const ref = extractAbcReference(html, plu);
      if (!ref.image && ref.prices.length === 0) break;
      const checkedAt = ref.prices[0]?.acquisitionTimestamp || new Date().toISOString();
      return NextResponse.json({
        plu, image: ref.image || null, url: url.href, checkedAt,
        prices: ref.prices, hasAmbiguousPrice: ref.hasAmbiguousPrice,
      }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } });
    }
    return NextResponse.json({ error: 'ABC no entregó una referencia verificable para este PLU. Se conserva el catálogo local.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar ABC. El catálogo local sigue disponible.' }, { status: 502 });
  }
}
