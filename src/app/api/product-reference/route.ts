import { NextRequest, NextResponse } from 'next/server';
import { extractProductImage } from '@/lib/abcReference';

export async function GET(request: NextRequest) {
  const plu=request.nextUrl.searchParams.get('plu') || '';
  if(!/^\d{8}$/.test(plu)) return NextResponse.json({error:'PLU inválido.'},{status:400});
  let url=new URL(`https://www.abc.cl/${plu}.html`);
  try {
    for(let redirects=0;redirects<4;redirects++) {
      const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000),next:{revalidate:86400}});
      if([301,302,303,307,308].includes(response.status)) {
        const location=response.headers.get('location');
        if(!location) break;
        const next=new URL(location,url);
        if(next.protocol!=='https:' || next.hostname!=='www.abc.cl' || next.username || next.password || next.port) break;
        url=next; continue;
      }
      if(!response.ok || !response.headers.get('content-type')?.includes('text/html')) break;
      if(Number(response.headers.get('content-length') || 0)>2*1024*1024) break;
      const html=await response.text();
      if(html.length>2*1024*1024) break;
      const image=extractProductImage(html,plu);
      if(!image) break;
      return NextResponse.json({plu,image,url:url.href,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=3600, s-maxage=86400'}});
    }
    return NextResponse.json({error:'ABC no entregó una foto verificable para este PLU. Se conserva el icono de categoría.'},{status:404});
  } catch { return NextResponse.json({error:'No se pudo consultar ABC. El catálogo y sus iconos siguen disponibles.'},{status:502}); }
}
