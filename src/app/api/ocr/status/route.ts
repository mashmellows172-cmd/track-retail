import { NextResponse } from 'next/server';
import { ocrReadiness } from '@/lib/receiptOcr';

export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json(ocrReadiness(process.env), { headers: { 'Cache-Control': 'no-store' } });
}
