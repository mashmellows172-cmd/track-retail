# TrackRetail - Código Fuente Completo del Proyecto

> Documento generado para análisis y auditoría técnica con modelos de lenguaje (Qwen / Claude / GPT).

==================================================
### ARCHIVO: src\app\api\ocr\route.ts
==================================================
`typescript
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

`

==================================================
### ARCHIVO: src\app\api\ventas\route.ts
==================================================
`typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Venta } from '@/types/venta';

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as Venta;

    if (!data.folio || !data.fecha_compra || !data.canal || !data.vendedor_id) {
      return NextResponse.json({ error: 'Faltan campos obligatorios: folio, fecha_compra, canal, vendedor_id' }, { status: 400 });
    }

    const { data: insertedData, error } = await supabase
      .from('ventas')
      .insert([{
        folio: data.folio,
        fecha_compra: data.fecha_compra,
        canal: data.canal,
        precio_producto: data.precio_producto ?? 0,
        cantidad_unidades: data.cantidad_unidades ?? 1,
        valor_garantia: data.valor_garantia ?? 0,
        anos_garantia: data.anos_garantia ?? 1,
        tipo_garantia: data.tipo_garantia ?? 'lineas_duras',
        total_boleta: data.total_boleta ?? 0,
        numero_pedido: data.numero_pedido ?? null,
        vendedor_id: data.vendedor_id,
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Esta boleta ya fue ingresada (folio duplicado)' }, { status: 409 });
      }
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(insertedData);

  } catch (error: unknown) {
    console.error('Error en POST /api/ventas:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vendedor_id = searchParams.get('vendedor_id');
    const mes = searchParams.get('mes');

    if (!vendedor_id) {
      return NextResponse.json({ error: 'Se requiere vendedor_id' }, { status: 400 });
    }

    let query = supabase
      .from('ventas')
      .select('*')
      .eq('vendedor_id', vendedor_id)
      .order('fecha_compra', { ascending: false });

    if (mes) {
      const [year, month] = mes.split('-').map(Number);
      const startDate = `${mes}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      query = query.gte('fecha_compra', startDate).lte('fecha_compra', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);

  } catch (error: unknown) {
    console.error('Error en GET /api/ventas:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

`

==================================================
### ARCHIVO: src\app\globals.css
==================================================
`css
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700&display=swap');

@import "tailwindcss";
@config "../../tailwind.config.ts";

@layer base {
  :root {
    /* Light Mode (Sleek Minimal) */
    --color-background: #FAFAFA;
    --color-surface-base: #FFFFFF;
    --color-surface-elevated: #FFFFFF;
    --color-surface-border: #E5E5E5;
    --color-on-surface: #111827;
    --color-on-surface-variant: #6B7280;
    
    --color-primary: #0F172A;
    --color-on-primary: #FFFFFF;
    --color-primary-container: #F1F5F9;
    --color-on-primary-container: #0F172A;
    
    --color-secondary: #D97757;
    --color-on-secondary: #FFFFFF;
    --color-secondary-container: #FDE8E1;
    --color-on-secondary-container: #9B3D20;
    
    --color-tertiary: #10B981;
    --color-error: #EF4444;
  }
  
  .dark {
    /* Dark Mode (Anthropic/Notion style) */
    --color-background: #0F0F0F;
    --color-surface-base: #141414;
    --color-surface-elevated: #1B1B1B;
    --color-surface-border: #2A2A2A;
    --color-on-surface: #EDEDED;
    --color-on-surface-variant: #A0A0A0;
    
    --color-primary: #FFFFFF;
    --color-on-primary: #000000;
    --color-primary-container: #262626;
    --color-on-primary-container: #FFFFFF;
    
    --color-secondary: #D97757;
    --color-on-secondary: #FFFFFF;
    --color-secondary-container: #4A2214;
    --color-on-secondary-container: #FFD4C4;
    
    --color-tertiary: #10B981;
    --color-error: #EF4444;
  }
}

/* Base Styles */
body {
  background-color: var(--color-background);
  color: var(--color-on-surface);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Surface Cards (Replacing Glassmorphism) */
.glass-card, .glass-panel {
  background-color: var(--color-surface-elevated);
  border: 1px solid var(--color-surface-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
  border-radius: 0.75rem;
}

.dark .glass-card, .dark .glass-panel {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2);
}

/* Removiendo glow de neon */
.neon-glow-primary, .neon-glow-secondary {
  filter: none;
}

/* Hide scrollbar for clean UI */
::-webkit-scrollbar {
    display: none;
}

`

==================================================
### ARCHIVO: src\app\historial\page.tsx
==================================================
`tsx
'use client';

import { useEffect, useState } from 'react';
import TablaHistorial from '@/components/TablaHistorial';
import { Venta } from '@/types/venta';
import { Loader2 } from 'lucide-react';

export default function HistorialPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendedor, setVendedor] = useState<string | null>(null);

  const dateObj = new Date();
  const [selectedYear, setSelectedYear] = useState(dateObj.getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((dateObj.getMonth() + 1).toString().padStart(2, '0'));

  const mesFiltro = `${selectedYear}-${selectedMonth}`;

  useEffect(() => {
    try {
      const v = localStorage.getItem('trackretail_vendedor');
      setVendedor(v);
    } catch {
      setVendedor(null);
    }
  }, []);

  useEffect(() => {
    if (vendedor === undefined) return; // still loading localStorage
    
    const fetchVentas = async () => {
      if (!vendedor) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const url = `/api/ventas?vendedor_id=${encodeURIComponent(vendedor)}&mes=${mesFiltro}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${res.status}`);
        }
        const data = await res.json();
        setVentas(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error cargando datos');
        setVentas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVentas();
  }, [mesFiltro, vendedor]);

  return (
    <div className="w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-8 border-b border-surface-border mb-8 gap-4">
        <div>
          <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface">
            Historial de Ventas
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-2">
            Revisa y exporta tus ventas de garantías registradas.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-label-sm text-label-sm text-on-surface-variant">Filtrar por mes</label>
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-surface-elevated border border-surface-border text-on-surface font-label-md text-label-md p-2.5 rounded-xl outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={(i + 1).toString().padStart(2, '0')}>
                  {new Date(2000, i, 1).toLocaleString('es-CL', { month: 'long' })}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="bg-surface-elevated border border-surface-border text-on-surface font-label-md text-label-md p-2.5 rounded-xl outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {[0, 1, 2].map(offset => {
                const year = new Date().getFullYear() - offset;
                return <option key={year} value={year.toString()}>{year}</option>;
              })}
            </select>
          </div>
        </div>
      </header>

      {!vendedor && !loading && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
          <span className="material-symbols-outlined text-primary text-[48px] mb-4">person_add</span>
          <h3 className="font-headline-md text-on-surface mb-2">Configura tu perfil primero</h3>
          <p className="font-body-md text-on-surface-variant max-w-sm">
            Ingresa tu nombre en la barra superior para ver tu historial de ventas.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-6 font-label-md flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-16">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      ) : vendedor ? (
        <TablaHistorial ventas={ventas} />
      ) : null}
    </div>
  );
}

`

==================================================
### ARCHIVO: src\app\layout.tsx
==================================================
`tsx
import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import VendedorSelector from "@/components/VendedorSelector";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import { ToastProvider } from "@/components/ToastProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import OfflineSyncManager from "@/components/OfflineSyncManager";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const outfit = Outfit({ subsets: ["latin"], variable: '--font-outfit' });

export const metadata: Metadata = {
  title: "BryanApp",
  description: "Sales Intelligence",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BryanApp",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#10131a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const bodyClass = [
    inter.variable,
    outfit.variable,
    'bg-background',
    'text-on-surface',
    'font-body-md',
    'overflow-x-hidden',
    'min-h-[100dvh]',
    'relative',
    'flex',
    'flex-col',
    'md:flex-row',
  ].join(' ');

  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className={bodyClass}>
        <ErrorBoundary>
          {/* Mobile Top Header (Hidden on Desktop) */}
          <div className="md:hidden flex items-center justify-between p-4 border-b border-surface-border bg-surface-base sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-background text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
              </div>
              <span className="font-headline-sm text-on-surface font-bold text-lg">BryanApp</span>
            </div>
            <div className="w-1/2 max-w-[150px] flex items-center gap-2">
              <ThemeToggle />
              <VendedorSelector />
            </div>
          </div>

          {/* Desktop SideNavBar */}
          <aside className="hidden md:flex flex-col fixed left-4 top-4 bottom-4 w-64 rounded-xl border border-surface-border bg-surface-elevated py-8 z-50">
            {/* Logo */}
            <div className="px-6 mb-8 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                <span
                  className="material-symbols-outlined text-background"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  insights
                </span>
              </div>
              <div className="flex-1">
                <h1 className="font-headline-md text-headline-md font-bold text-on-surface">BryanApp</h1>
                <p className="font-label-sm text-label-sm text-on-surface-variant/70">Inteligencia de Ventas</p>
              </div>
              <ThemeToggle />
            </div>

            {/* CTA */}
            <div className="px-6 mb-8">
              <Link
                href="/registro"
                className="w-full bg-gradient-to-r from-primary-container to-inverse-primary text-on-primary-container font-label-md text-label-md py-3 rounded-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-[0_0_15px_rgba(77,142,255,0.3)]"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
                Nuevo Registro
              </Link>
            </div>

            {/* Nav Links */}
            <nav className="flex-1 flex flex-col gap-1 px-2">
              <Link
                href="/"
                className="flex items-center gap-3 px-4 py-3 text-on-surface-variant/70 hover:text-on-surface hover:bg-white/10 mx-2 rounded-lg hover:translate-x-1 transition-all duration-200"
              >
                <span className="material-symbols-outlined">dashboard</span>
                <span className="font-label-md text-label-md">Panel de Control</span>
              </Link>
              <Link
                href="/registro"
                className="flex items-center gap-3 px-4 py-3 text-on-surface-variant/70 hover:text-on-surface hover:bg-white/10 mx-2 rounded-lg hover:translate-x-1 transition-all duration-200"
              >
                <span className="material-symbols-outlined">qr_code_scanner</span>
                <span className="font-label-md text-label-md">Registrar Boleta</span>
              </Link>
              <Link
                href="/historial"
                className="flex items-center gap-3 px-4 py-3 text-on-surface-variant/70 hover:text-on-surface hover:bg-white/10 mx-2 rounded-lg hover:translate-x-1 transition-all duration-200"
              >
                <span className="material-symbols-outlined">receipt_long</span>
                <span className="font-label-md text-label-md">Historial</span>
              </Link>
            </nav>

            {/* User */}
            <div className="mt-auto px-4">
              <VendedorSelector />
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 w-full md:ml-[280px] p-4 md:p-10 min-h-[100dvh] flex flex-col gap-8 pb-24 md:pb-10 relative">
            <ToastProvider>
              <OfflineSyncManager />
              {children}
            </ToastProvider>
          </main>

          {/* Mobile Bottom Nav */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface-elevated border-t border-surface-border z-50 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] px-4 flex justify-around items-center">
            <Link href="/" className="flex flex-col items-center gap-1 p-2 text-on-surface-variant hover:text-secondary transition-colors">
              <span className="material-symbols-outlined">dashboard</span>
              <span className="font-label-sm text-[10px]">Inicio</span>
            </Link>
            <div className="relative -top-5">
              <Link
                href="/registro"
                className="w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-primary-container text-on-primary-container flex items-center justify-center shadow-[0_0_20px_rgba(77,142,255,0.5)] border-2 border-surface-container"
              >
                <span className="material-symbols-outlined text-[28px]">add</span>
              </Link>
            </div>
            <Link href="/historial" className="flex flex-col items-center gap-1 p-2 text-on-surface-variant hover:text-secondary transition-colors">
              <span className="material-symbols-outlined">receipt_long</span>
              <span className="font-label-sm text-[10px]">Historial</span>
            </Link>
          </nav>
          <div className="md:hidden h-20 w-full" />
        </ErrorBoundary>
      </body>
    </html>
  );
}

`

==================================================
### ARCHIVO: src\app\page.module.css
==================================================
`css
.page {
  --background: #fafafa;
  --foreground: #fff;

  --text-primary: #000;
  --text-secondary: #666;

  --button-primary-hover: #383838;
  --button-secondary-hover: #f2f2f2;
  --button-secondary-border: #ebebeb;

  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: var(--font-geist-sans);
  background-color: var(--background);
}

.main {
  display: flex;
  flex: 1;
  width: 100%;
  max-width: 800px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  background-color: var(--foreground);
  padding: 120px 60px;
}

.intro {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 24px;
}

.intro h1 {
  max-width: 320px;
  font-size: 40px;
  font-weight: 600;
  line-height: 48px;
  letter-spacing: -2.4px;
  text-wrap: balance;
  color: var(--text-primary);
}

.intro p {
  max-width: 440px;
  font-size: 18px;
  line-height: 32px;
  text-wrap: balance;
  color: var(--text-secondary);
}

.intro a {
  font-weight: 500;
  color: var(--text-primary);
}

.ctas {
  display: flex;
  flex-direction: row;
  width: 100%;
  max-width: 440px;
  gap: 16px;
  font-size: 14px;
}

.ctas a {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border-radius: 128px;
  border: 1px solid transparent;
  transition: 0.2s;
  cursor: pointer;
  width: fit-content;
  font-weight: 500;
}

a.primary {
  background: var(--text-primary);
  color: var(--background);
  gap: 8px;
}

a.secondary {
  border-color: var(--button-secondary-border);
}

/* Enable hover only on non-touch devices */
@media (hover: hover) and (pointer: fine) {
  a.primary:hover {
    background: var(--button-primary-hover);
    border-color: transparent;
  }

  a.secondary:hover {
    background: var(--button-secondary-hover);
    border-color: transparent;
  }
}

@media (max-width: 600px) {
  .main {
    padding: 48px 24px;
  }

  .intro {
    gap: 16px;
  }

  .intro h1 {
    font-size: 32px;
    line-height: 40px;
    letter-spacing: -1.92px;
  }
}

@media (prefers-color-scheme: dark) {
  .logo {
    filter: invert();
  }

  .page {
    --background: #000;
    --foreground: #000;

    --text-primary: #ededed;
    --text-secondary: #999;

    --button-primary-hover: #ccc;
    --button-secondary-hover: #1a1a1a;
    --button-secondary-border: #1a1a1a;
  }
}

`

==================================================
### ARCHIVO: src\app\page.tsx
==================================================
`tsx
'use client';

import { useEffect, useState } from 'react';
import DashboardCards from '@/components/DashboardCards';
import GraficoMensual from '@/components/GraficoMensual';
import GraficoDistribucion from '@/components/GraficoDistribucion';
import SimuladorComisiones from '@/components/SimuladorComisiones';
import { Venta } from '@/types/venta';
import Link from 'next/link';

export default function DashboardPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendedor, setVendedor] = useState<string | null | undefined>(undefined);

  const currentMonth = new Date().toISOString().split('T')[0].substring(0, 7);

  // Read vendedor from localStorage on mount
  useEffect(() => {
    try {
      const v = localStorage.getItem('trackretail_vendedor');
      setVendedor(v);
    } catch {
      setVendedor(null);
    }
  }, []);

  useEffect(() => {
    if (vendedor === undefined) return; // Still initializing

    if (!vendedor) {
      setLoading(false);
      return;
    }

    const fetchVentas = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/ventas?vendedor_id=${encodeURIComponent(vendedor)}&mes=${currentMonth}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${res.status}`);
        }
        const data = await res.json();
        setVentas(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchVentas();
    const interval = setInterval(fetchVentas, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [currentMonth, vendedor]);

  // Still loading localStorage
  if (vendedor === undefined) {
    return <DashboardSkeleton />;
  }

  if (!vendedor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-primary text-[40px]">person_add</span>
        </div>
        <h2 className="font-display-md text-display-md text-on-surface mb-2">¡Bienvenido!</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mb-8">
          Para comenzar, configura tu nombre usando el selector en la barra superior (o la barra lateral en escritorio).
        </p>
        <Link
          href="/registro"
          className="bg-gradient-to-r from-primary-container to-inverse-primary text-on-primary-container font-label-md px-6 py-3 rounded-xl hover:scale-[1.02] transition-transform"
        >
          Registrar mi primera boleta
        </Link>
      </div>
    );
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <>
      <header className="flex justify-between items-end pb-8 border-b border-surface-border">
        <div>
          <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface">
            Resumen General
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-2">
            Hola, <strong>{vendedor}</strong>. Aquí está tu rendimiento de este mes.
          </p>
        </div>
      </header>

      {error && (
        <div className="text-red-400 bg-red-500/10 p-4 rounded-xl border border-red-500/20 mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      <DashboardCards ventas={ventas} />

      <section className="flex flex-col gap-4 mt-8">
        <h3 className="font-headline-md text-headline-md text-on-surface">Actividad Reciente</h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Tabla reciente */}
          <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-base">
                    <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Folio</th>
                    <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Fecha</th>
                    <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Garantía</th>
                    <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border font-body-md text-body-md">
                  {ventas.slice(0, 6).map((venta) => (
                    <tr key={venta.id} className="hover:bg-surface-base transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-surface-base flex items-center justify-center text-on-surface-variant group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-[14px]">receipt</span>
                          </div>
                          <span className="text-on-surface font-medium text-sm">{venta.folio}</span>
                        </div>
                      </td>
                      <td className="p-4 text-on-surface-variant text-sm">{venta.fecha_compra}</td>
                      <td className="p-4 text-on-surface text-sm">${(venta.valor_garantia ?? 0).toLocaleString('es-CL')}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20">
                          ${(venta.comision_calculada ?? 0).toLocaleString('es-CL')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {ventas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-on-surface-variant">
                        No hay ventas este mes. ¡Registra tu primera boleta!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico distribución */}
          <GraficoDistribucion ventas={ventas} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-4">
            <GraficoMensual ventas={ventas} />
          </div>
          <SimuladorComisiones ventas={ventas} />
        </div>
      </section>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="w-full flex flex-col gap-8 animate-pulse">
      <div className="w-64 h-10 bg-surface-elevated rounded-lg mt-4"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-surface-elevated rounded-xl"></div>
        ))}
      </div>
      <div className="w-full h-64 bg-surface-elevated rounded-xl"></div>
    </div>
  );
}

`

==================================================
### ARCHIVO: src\app\registro\page.tsx
==================================================
`tsx
'use client';

import { useState } from 'react';
import Scanner from '@/components/Scanner';
import ConfirmacionForm from '@/components/ConfirmacionForm';
import { VentaOCR } from '@/types/venta';
import Link from 'next/link';

export default function RegistroPage() {
  const [scannedData, setScannedData] = useState<VentaOCR | null>(null);
  const [successData, setSuccessData] = useState<{ comision: number, folio: string } | null>(null);

  const handleScanSuccess = (data: VentaOCR) => {
    setScannedData(data);
    setSuccessData(null);
  };

  const handleConfirm = async (data: unknown) => {
    try {
      const res = await fetch('/api/ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 409) {
          throw new Error('Esta boleta ya fue ingresada (folio duplicado).');
        }
        if (res.status >= 500) {
          throw new Error('SERVER_ERROR');
        }
        throw new Error(errorData.error || 'Error al guardar la venta');
      }

      const savedData = await res.json();
      setSuccessData({
        comision: savedData.comision_calculada || 0,
        folio: savedData.folio || 'Desconocido'
      });
      setScannedData(null);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error de red';
      // Detectar fallas de red o errores 500 del servidor
      if (msg === 'Failed to fetch' || msg === 'SERVER_ERROR' || msg.toLowerCase().includes('network')) {
        const queueStr = localStorage.getItem('trackretail_offline_queue');
        const queue = queueStr ? JSON.parse(queueStr) : [];
        queue.push(data);
        localStorage.setItem('trackretail_offline_queue', JSON.stringify(queue));
        
        // Simular éxito para no bloquear al usuario
        setSuccessData({
          comision: 0, 
          folio: (data as VentaOCR).folio + ' (Offline)'
        });
        setScannedData(null);
        throw new Error('Sin conexión. La boleta se guardó localmente y se sincronizará automáticamente.');
      }
      throw error; // Lanzar errores normales (como duplicados 409) para que ConfirmacionForm los atrape
    }
  };

  const handleManualEntry = () => {
    setScannedData({
      folio: '',
      fecha_compra: new Date().toISOString().split('T')[0],
      precio_producto: null,
      cantidad_unidades: 1,
      valor_garantia: null,
      total_boleta: null,
      canal: 'caja',
      numero_pedido: null,
    });
  };

  const handleCancel = () => setScannedData(null);

  return (
    <div className="max-w-2xl mx-auto w-full">
      {/* Header */}
      <header className="pb-8 border-b border-white/5 mb-8">
        <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface">
          Nueva Boleta
        </h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-2">
          Escanea o sube una boleta para registrar tu comisión.
        </p>
      </header>

      {/* Vistas Principales */}
      {successData ? (
        <div className="glass-panel rounded-2xl p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(78,222,163,0.3)]">
            <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <h3 className="font-display-md text-display-md text-on-surface mb-2">¡Boleta Registrada!</h3>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            La boleta folio <strong className="text-on-surface">{successData.folio}</strong> fue procesada y guardada exitosamente en tu base de datos.
          </p>
          
          <div className="bg-black/20 rounded-xl p-4 inline-block min-w-[200px] mb-8 border border-white/5">
            <p className="font-label-sm text-label-sm text-on-surface-variant mb-1">Comisión Calculada</p>
            <p className="font-headline-lg text-headline-lg text-secondary">${successData.comision.toLocaleString('es-CL')}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/historial"
              className="flex-1 max-w-[200px] mx-auto sm:mx-0 bg-surface-container border border-white/10 text-on-surface font-label-md text-label-md py-3 px-6 rounded-xl hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
              Ver Historial
            </Link>
            <button
              onClick={() => setSuccessData(null)}
              className="flex-1 max-w-[200px] mx-auto sm:mx-0 bg-gradient-to-r from-primary-container to-inverse-primary text-on-primary-container font-label-md text-label-md py-3 px-6 rounded-xl hover:scale-[1.02] transition-transform shadow-[0_0_15px_rgba(77,142,255,0.3)] flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
              Registrar Otra
            </button>
          </div>
        </div>
      ) : !scannedData ? (
        <Scanner onScanSuccess={handleScanSuccess} onManualEntry={handleManualEntry} />
      ) : (
        <ConfirmacionForm
          initialData={scannedData}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

`

==================================================
### ARCHIVO: src\components\BackgroundShader.tsx
==================================================
`tsx
'use client';

import { useEffect, useRef } from 'react';

const VERTEX_SHADER = [
  'attribute vec2 a_position;',
  'varying vec2 v_texCoord;',
  'void main() {',
  '  v_texCoord = a_position * 0.5 + 0.5;',
  '  gl_Position = vec4(a_position, 0.0, 1.0);',
  '}',
].join('\n');

const FRAGMENT_SHADER = [
  'precision highp float;',
  'varying vec2 v_texCoord;',
  'uniform float u_time;',
  'uniform vec2 u_resolution;',
  'void main() {',
  '  vec2 uv = v_texCoord;',
  '  vec3 color1 = vec3(0.06, 0.07, 0.1);',
  '  vec3 color2 = vec3(0.12, 0.08, 0.2);',
  '  vec3 color3 = vec3(0.05, 0.1, 0.15);',
  '  float noise1 = sin(uv.x * 2.0 + u_time * 0.2) * 0.5 + 0.5;',
  '  float noise2 = cos(uv.y * 3.0 - u_time * 0.3) * 0.5 + 0.5;',
  '  vec3 finalColor = mix(color1, color2, noise1);',
  '  finalColor = mix(finalColor, color3, noise2 * 0.5);',
  '  float glow = smoothstep(0.8, 0.2, distance(uv, vec2(',
  '    0.5 + 0.2 * sin(u_time * 0.1),',
  '    0.5 + 0.2 * cos(u_time * 0.15)',
  '  )));',
  '  finalColor += vec3(0.05, 0.02, 0.1) * glow;',
  '  gl_FragColor = vec4(finalColor, 1.0);',
  '}',
].join('\n');

export default function BackgroundShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function syncSize() {
      if (!canvas) return;
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null;
    if (ro) ro.observe(canvas);
    syncSize();

    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return;

    function createShader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, createShader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');

    let raf: number;
    function render(t: number) {
      if (!canvas || !gl) return;
      if (!ro) syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
  }, []);

  return (
    <>
      <div className="fixed inset-0 w-full h-full -z-20">
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
      <div className="fixed inset-0 bg-background/80 -z-10 pointer-events-none" />
    </>
  );
}

`

==================================================
### ARCHIVO: src\components\ConfirmacionForm.tsx
==================================================
`tsx
'use client';

import { useState, useEffect } from 'react';
import { VentaOCR, Venta } from '@/types/venta';
import { useToast } from '@/components/ToastProvider';
import { Haptics } from '@/lib/haptics';

interface ConfirmacionFormProps {
  initialData: VentaOCR;
  onConfirm: (data: Omit<Venta, 'id' | 'created_at' | 'comision_calculada'>) => Promise<void>;
  onCancel: () => void;
}

const inputClass = 'w-full bg-surface-base border border-surface-border rounded-lg p-2.5 text-on-surface focus:border-primary/60 focus:ring-1 focus:ring-primary/30 outline-none transition-colors font-body-md text-body-md';
const labelClass = 'block font-label-sm text-label-sm text-on-surface-variant mb-1.5';

export default function ConfirmacionForm({ initialData, onConfirm, onCancel }: ConfirmacionFormProps) {
  const sanitizeNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/[^0-9]/g, '');
    return Number(str);
  };

  const [formData, setFormData] = useState(() => {
    // Si es ingreso manual (folio vacío), intentar recuperar borrador
    if (!initialData.folio) {
      try {
        const savedDraft = sessionStorage.getItem('trackretail_draft_venta');
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      } catch (e) {}
    }
    
    // Si es OCR o no hay borrador, sanear los datos de la IA
    return {
      folio: initialData.folio || '',
      fecha_compra: initialData.fecha_compra || new Date().toISOString().split('T')[0],
      canal: (initialData.canal || 'caja') as 'caja' | 'internet',
      precio_producto: sanitizeNumber(initialData.precio_producto),
      cantidad_unidades: sanitizeNumber(initialData.cantidad_unidades) || 1,
      valor_garantia: sanitizeNumber(initialData.valor_garantia),
      total_boleta: sanitizeNumber(initialData.total_boleta),
      numero_pedido: initialData.numero_pedido || '',
      anos_garantia: (sanitizeNumber(initialData.anos_garantia) || 1) as 1 | 2 | 3 | 4,
      tipo_garantia: 'telefonia' as 'telefonia' | 'lineas_duras',
      vendedor_id: '',
    };
  });

  useEffect(() => {
    sessionStorage.setItem('trackretail_draft_venta', JSON.stringify(formData));
  }, [formData]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    Haptics.medium();

    let savedVendedor = null;
    try {
      savedVendedor = localStorage.getItem('trackretail_vendedor');
    } catch (e) {
      console.warn('LocalStorage inaccesible');
    }
    
    if (!savedVendedor) {
      showToast('Configura tu nombre en la barra superior antes de registrar.', 'error');
      setIsSubmitting(false);
      return;
    }
    try {
      await onConfirm({ ...formData, vendedor_id: savedVendedor });
      sessionStorage.removeItem('trackretail_draft_venta');
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido al guardar';
      showToast(errorMsg, 'error');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const numFields = ['precio_producto', 'cantidad_unidades', 'valor_garantia', 'total_boleta', 'anos_garantia'];
    setFormData(prev => ({
      ...prev,
      [name]: numFields.includes(name) ? Number(value) : value,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface-elevated border border-surface-border rounded-2xl p-6 shadow-sm">
      <h2 className="font-headline-md text-headline-md text-on-surface mb-1">Confirmar Datos</h2>
      <p className="font-label-md text-label-md text-on-surface-variant mb-6">
        Revisa los datos antes de guardar la venta.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Folio Boleta</label>
          <input required type="text" name="folio" value={formData.folio} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Fecha de Compra</label>
          <input required type="date" name="fecha_compra" value={formData.fecha_compra} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Canal de Venta</label>
          <select name="canal" value={formData.canal} onChange={handleChange} className={inputClass}>
            <option value="caja">Caja (Tienda física)</option>
            <option value="internet">Internet (Venta asistida)</option>
          </select>
        </div>

        {formData.canal === 'internet' && (
          <div>
            <label className={labelClass}>Nº Pedido Online</label>
            <input type="text" name="numero_pedido" value={formData.numero_pedido} onChange={handleChange} className={inputClass} />
          </div>
        )}

        <div>
          <label className={labelClass}>Precio Producto ($)</label>
          <input required type="number" name="precio_producto" value={formData.precio_producto} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Total Boleta ($)</label>
          <input required type="number" name="total_boleta" value={formData.total_boleta} onChange={handleChange} className={inputClass} />
        </div>

        {/* Divider */}
        <div className="col-span-1 md:col-span-2 pt-4 mt-2 border-t border-surface-border">
          <p className="font-label-md text-label-md text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">shield</span>
            Detalle Garantía — Más Protección
          </p>
        </div>

        <div>
          <label className={labelClass}>Valor Garantía ($)</label>
          <input required type="number" name="valor_garantia" value={formData.valor_garantia} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Años Garantía</label>
          <select name="anos_garantia" value={formData.anos_garantia} onChange={handleChange} className={inputClass}>
            <option value={1}>1 Año</option>
            <option value={2}>2 Años</option>
            {formData.tipo_garantia === 'lineas_duras' && <option value={3}>3 Años</option>}
            {formData.tipo_garantia === 'lineas_duras' && <option value={4}>4 Años</option>}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>Tipo de Producto</label>
          <select name="tipo_garantia" value={formData.tipo_garantia} onChange={handleChange} className={inputClass}>
            <option value="telefonia">Telefonía</option>
            <option value="lineas_duras">Líneas Duras (Electro / Deporte)</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 border border-surface-border hover:bg-surface-base text-on-surface-variant py-3 rounded-xl font-label-md text-label-md transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary py-3 rounded-xl font-label-md text-label-md hover:scale-[1.02] transition-all shadow-sm disabled:opacity-50 disabled:scale-100"
        >
          {isSubmitting ? 'Guardando...' : 'Confirmar Venta ✓'}
        </button>
      </div>
    </form>
  );
}

`

==================================================
### ARCHIVO: src\components\DashboardCards.tsx
==================================================
`tsx
import { useState, useEffect, useRef } from 'react';
import { Venta } from '@/types/venta';
import { getMetaMensual, setMetaMensual } from '@/lib/meta';

interface DashboardCardsProps {
  ventas: Venta[];
}

export default function DashboardCards({ ventas }: DashboardCardsProps) {
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [metaMensual, setMetaMensualState] = useState(150000);
  const [simuladorPrecio, setSimuladorPrecio] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const currentMonth = new Date().toISOString().split('T')[0].substring(0, 7);

  useEffect(() => {
    setMetaMensualState(getMetaMensual(currentMonth));
  }, [currentMonth]);

  const handleSaveMeta = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (metaMensual < 10000) setMetaMensualState(10000);
    setMetaMensual(currentMonth, Math.max(metaMensual, 10000));
    setIsEditingMeta(false);
  };

  const totalComisiones = ventas.reduce((acc, v) => acc + (v.comision_calculada || 0), 0);
  const garantiasVendidas = ventas.length;

  const progresoMeta = Math.min(100, Math.round((totalComisiones / metaMensual) * 100));
  const faltaParaMeta = Math.max(0, metaMensual - totalComisiones);
  const internetSales = ventas.filter(v => v.canal === 'internet').length;
  // Blindaje matemático contra división por cero
  const internetPercent = garantiasVendidas > 0 ? Math.round((internetSales / garantiasVendidas) * 100) : 0;
  const promedioComision = garantiasVendidas > 0 ? Math.round(totalComisiones / garantiasVendidas) : 0;

  // Lógica de Meta Diaria
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const currentDay = today.getDate();
  const remainingDays = daysInMonth - currentDay + 1;
  const metaDiaria = remainingDays > 0 ? Math.ceil(faltaParaMeta / remainingDays) : faltaParaMeta;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
      {/* Featured Card: Projected Bonus (Spans 2 cols) */}
      <div className="glass-card rounded-xl p-6 md:col-span-2 group hover:scale-[1.01] transition-all duration-300 relative overflow-hidden border-secondary/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-secondary/10 via-transparent to-transparent pointer-events-none"></div>
        <div className="flex flex-col h-full justify-between relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-secondary/20 text-secondary flex items-center justify-center border border-secondary/30 neon-glow-secondary">
                <span className="material-symbols-outlined">redeem</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Bono Proyectado</h3>
            </div>
            <button 
              onClick={() => {
                setIsEditingMeta(true);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="text-on-surface-variant hover:text-secondary transition-colors"
              title="Editar meta"
            >
              <span className="material-symbols-outlined text-[20px]">edit</span>
            </button>
          </div>
          <div className="mt-auto">
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <p className="text-[32px] md:text-[40px] font-bold leading-none text-secondary drop-shadow-[0_0_10px_rgba(78,222,163,0.5)] tracking-tight">
                ${totalComisiones.toLocaleString('es-CL')}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant">estimado</p>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-surface-base rounded-full h-1.5 mt-4 border border-surface-border overflow-hidden">
              <div 
                className="bg-secondary h-1.5 rounded-full relative"
                style={{ width: progresoMeta + '%' }}
              >
              </div>
            </div>
            <div className="flex justify-between items-end mt-2 font-label-sm text-label-sm">
              <span className={progresoMeta >= 100 ? "text-secondary font-bold" : "text-on-surface-variant"}>
                {progresoMeta >= 100 ? '¡Meta superada!' : `Faltan $${faltaParaMeta.toLocaleString('es-CL')}`}
                {progresoMeta < 100 && (
                  <span className="block text-secondary/80 text-[12px] mt-1.5 font-medium">
                    Meta diaria sugerida: ${metaDiaria.toLocaleString('es-CL')} / día
                  </span>
                )}
              </span>
              
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant">Meta:</span>
                {isEditingMeta ? (
                  <form onSubmit={handleSaveMeta} className="flex items-center gap-1">
                    <span className="text-secondary">$</span>
                    <input
                      ref={inputRef}
                      type="number"
                      value={metaMensual}
                      onChange={e => setMetaMensualState(Number(e.target.value))}
                      onBlur={() => handleSaveMeta()}
                      className="bg-surface-base border border-surface-border text-secondary rounded px-2 py-0.5 w-24 outline-none focus:border-secondary font-bold text-right"
                    />
                  </form>
                ) : (
                  <span 
                    className="text-on-surface font-bold cursor-pointer hover:text-secondary transition-colors"
                    onClick={() => {
                      setIsEditingMeta(true);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                  >
                    ${metaMensual.toLocaleString('es-CL')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Total Sales (Garantías) */}
      <div className="glass-card rounded-xl p-6 group hover:scale-[1.02] transition-all duration-300 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-primary/20"></div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
            <span className="material-symbols-outlined">receipt_long</span>
          </div>
        </div>
        <div className="relative z-10">
          <h3 className="font-label-md text-label-md text-on-surface-variant mb-1">Garantías Totales</h3>
          <div className="flex items-baseline gap-2">
            <p className="font-headline-md text-headline-md text-on-surface">{garantiasVendidas}</p>
            <p className="font-label-sm text-label-sm text-primary">vendidas</p>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-3 border-t border-surface-border pt-3">
            Promedio: <span className="text-on-surface font-medium">${promedioComision.toLocaleString('es-CL')}</span> c/u
          </p>
        </div>
      </div>

      {/* Card 3: Internet vs Physical */}
      <div className="glass-card rounded-xl p-6 group hover:scale-[1.02] transition-all duration-300 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary/10 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-tertiary/20"></div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="w-10 h-10 rounded-lg bg-tertiary/10 text-tertiary flex items-center justify-center border border-tertiary/20">
            <span className="material-symbols-outlined">shopping_cart</span>
          </div>
          <span className="bg-tertiary/10 text-tertiary font-label-sm text-label-sm px-2 py-0.5 rounded-full border border-tertiary/20">
            {internetPercent}%
          </span>
        </div>
        <div className="relative z-10">
          <h3 className="font-label-md text-label-md text-on-surface-variant mb-1">Ventas Web</h3>
          <div className="flex items-baseline gap-2">
            <p className="font-headline-md text-headline-md text-on-surface">
              {internetSales}
            </p>
            <p className="font-label-sm text-label-sm text-tertiary">boletas</p>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-3 border-t border-surface-border pt-3">
            Física: <span className="text-on-surface font-medium">{garantiasVendidas - internetSales}</span> boletas
          </p>
        </div>
      </div>

      {/* Card 4: Simulador Rápido */}
      <div className="glass-card rounded-xl p-6 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary-container/10 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-primary-container/20"></div>
        <div className="relative z-10 h-full flex flex-col justify-between">
          <div>
            <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">calculate</span>
              Simulador de Comisión
            </h3>
            <div className="flex gap-2 items-center mb-3">
              <span className="text-on-surface-variant font-medium">$</span>
              <input 
                type="number"
                placeholder="Valor producto"
                value={simuladorPrecio}
                onChange={(e) => setSimuladorPrecio(e.target.value)}
                className="w-full bg-surface-base border border-surface-border text-on-surface rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-surface-border mt-auto">
            <span className="text-label-sm text-on-surface-variant">Comisión (3%):</span>
            <span className="font-bold text-secondary text-[18px]">
              ${simuladorPrecio ? Math.round(Number(simuladorPrecio) * 0.03).toLocaleString('es-CL') : '0'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

`

==================================================
### ARCHIVO: src\components\ErrorBoundary.tsx
==================================================
`tsx
'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-error/10 border border-error/20 rounded-2xl animate-in fade-in">
          <div className="w-16 h-16 bg-error/20 text-error rounded-full flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[32px]">warning</span>
          </div>
          <h2 className="font-headline-sm text-error mb-2">Algo salió mal</h2>
          <p className="font-body-sm text-on-surface-variant text-center max-w-xs mb-6">
            La aplicación ha encontrado un problema inesperado en esta sección.
          </p>
          <button
            className="bg-error/20 text-error px-6 py-2 rounded-full font-label-md hover:bg-error/30 transition-colors"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Intentar de nuevo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

`

==================================================
### ARCHIVO: src\components\GraficoDistribucion.tsx
==================================================
`tsx
'use client';

import { Venta } from '@/types/venta';

interface GraficoDistribucionProps {
  ventas: Venta[];
}

export default function GraficoDistribucion({ ventas }: GraficoDistribucionProps) {
  let telefonia = 0;
  let lineasDuras = 0;

  ventas.forEach(v => {
    if (v.tipo_garantia === 'telefonia') telefonia += v.comision_calculada || 0;
    else if (v.tipo_garantia === 'lineas_duras') lineasDuras += v.comision_calculada || 0;
  });

  const total = telefonia + lineasDuras;
  const telefoniaPct = total > 0 ? Math.round((telefonia / total) * 100) : 0;
  const lineasDurasPct = total > 0 ? 100 - telefoniaPct : 0;

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col justify-center">
      <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4">Distribución por Tipo</h3>
      
      {total === 0 ? (
        <div className="text-center py-4 opacity-70">
          <p className="font-label-md text-label-md text-on-surface-variant">No hay datos aún.</p>
        </div>
      ) : (
        <>
          {/* Barra de Progreso Doble */}
          <div className="w-full h-3 rounded-full overflow-hidden flex bg-surface-container mb-4">
            <div 
              className="bg-secondary transition-all duration-1000"
              style={{ width: `${telefoniaPct}%` }}
              title={`Telefonía: ${telefoniaPct}%`}
            />
            <div 
              className="bg-tertiary transition-all duration-1000"
              style={{ width: `${lineasDurasPct}%` }}
              title={`Líneas Duras: ${lineasDurasPct}%`}
            />
          </div>

          {/* Leyenda */}
          <div className="flex justify-between font-label-sm text-label-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <div className="w-2 h-2 rounded-full bg-secondary"></div>
                Telefonía
              </div>
              <span className="text-on-surface font-semibold text-label-md ml-3.5">
                ${telefonia.toLocaleString('es-CL')} <span className="text-on-surface-variant font-normal">({telefoniaPct}%)</span>
              </span>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <div className="w-2 h-2 rounded-full bg-tertiary"></div>
                L. Duras
              </div>
              <span className="text-on-surface font-semibold text-label-md mr-3.5">
                ${lineasDuras.toLocaleString('es-CL')} <span className="text-on-surface-variant font-normal">({lineasDurasPct}%)</span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

`

==================================================
### ARCHIVO: src\components\GraficoMensual.tsx
==================================================
`tsx
'use client';

import { Venta } from '@/types/venta';

interface GraficoMensualProps {
  ventas: Venta[];
}

export default function GraficoMensual({ ventas }: GraficoMensualProps) {
  const ventasPorDia: Record<string, number> = {};

  const dias: { full: string; display: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const displayStr = d.getDate() + '/' + (d.getMonth() + 1);
    dias.push({ full: dateStr, display: displayStr });
    ventasPorDia[dateStr] = 0;
  }

  ventas.forEach(v => {
    if (v.fecha_compra && ventasPorDia[v.fecha_compra] !== undefined) {
      ventasPorDia[v.fecha_compra] += (v.comision_calculada || 0);
    }
  });

  const maxVenta = Math.max(...Object.values(ventasPorDia), 1000);

  return (
    <div className="h-full flex flex-col">
      <h3 className="font-headline-sm text-headline-sm text-on-surface mb-6">Comisiones — Últimos 7 Días</h3>

      {ventas.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 min-h-[160px] opacity-70">
          <span className="material-symbols-outlined text-[48px] text-primary/40 mb-2">trending_up</span>
          <p className="font-label-md text-label-md text-on-surface-variant">Sin comisiones esta semana.</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant/70">¡Registra tu primera boleta!</p>
        </div>
      ) : (
        <div className="flex items-end gap-2 h-40 mt-auto">
          {dias.map(dia => {
            const valor = ventasPorDia[dia.full];
            const height = Math.max(4, (valor / maxVenta) * 100);
            const isToday = dia.full === new Date().toISOString().split('T')[0];

            return (
              <div key={dia.full} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                {/* Etiqueta siempre visible para valores > 0 */}
                {valor > 0 && (
                  <span className="font-label-sm text-[9px] text-on-surface-variant/80 mb-1">
                    ${valor >= 1000 ? (valor/1000).toFixed(0) + 'k' : valor}
                  </span>
                )}
                
                {/* Tooltip */}
                <div className="hidden group-hover:flex absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-container border border-white/10 text-on-surface font-label-sm text-label-sm px-2 py-1 rounded-lg whitespace-nowrap z-10 shadow-xl">
                  {new Date(dia.full + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}: ${valor.toLocaleString('es-CL')}
                </div>

                <div className="w-full flex items-end relative" style={{ height: 'calc(100% - 24px)' }}>
                  <div
                    className={
                      'w-full rounded-t-sm transition-all duration-700 absolute bottom-0 ' +
                      (isToday
                        ? 'bg-gradient-to-t from-secondary-container to-secondary shadow-[0_0_10px_rgba(78,222,163,0.5)]'
                        : 'bg-primary/40 group-hover:bg-primary/70')
                    }
                    style={{ height: height + '%' }}
                  />
                </div>
                <span className={
                  'text-[10px] mt-1 ' +
                  (isToday ? 'text-secondary font-semibold' : 'text-on-surface-variant')
                }>
                  {dia.display}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

`

==================================================
### ARCHIVO: src\components\OfflineSyncManager.tsx
==================================================
`tsx
'use client';

import { useOfflineSync } from '@/hooks/useOfflineSync';

export default function OfflineSyncManager() {
  useOfflineSync();
  return null;
}

`

==================================================
### ARCHIVO: src\components\Scanner.tsx
==================================================
`tsx
'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { VentaOCR } from '@/types/venta';
import { Haptics } from '@/lib/haptics';

interface ScannerProps {
  onScanSuccess: (data: VentaOCR) => void;
  onManualEntry: () => void;
}

export default function Scanner({ onScanSuccess, onManualEntry }: ScannerProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX = 1200;
          if (width > height && width > MAX) { height *= MAX / width; width = MAX; }
          else if (height > MAX) { width *= MAX / height; height = MAX; }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            else reject(new Error('Error al comprimir'));
          }, 'image/jpeg', 0.82);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const processFile = async (rawFile: File) => {
    setLoading(true);
    setProgress(10);
    setLoadingText('Preparando imagen...');
    setErrorMsg(null);
    Haptics.medium();

    try {
      let file = rawFile;

      if (file.type.startsWith('image/') && file.size > 1024 * 1024) {
        setProgress(30);
        setLoadingText('Optimizando calidad...');
        try { file = await compressImage(rawFile); }
        catch { /* use original if compress fails */ }
      }

      setProgress(50);
      setLoadingText('Analizando con IA...');

      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/ocr', { method: 'POST', body: formData });

      setProgress(80);
      setLoadingText('Extrayendo datos...');

      const rawText = await res.text();
      let data: VentaOCR;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error('La IA no pudo leer la boleta. Intenta con una foto más clara y sin sombras.');
      }

      if (!res.ok) {
        throw new Error((data as unknown as { error?: string }).error || 'Error procesando la boleta.');
      }

      setProgress(100);
      setLoadingText('¡Datos extraídos!');
      Haptics.success();

      setTimeout(() => {
        setLoading(false);
        onScanSuccess(data);
      }, 700);

    } catch (err: unknown) {
      setLoading(false);
      setErrorMsg(err instanceof Error ? err.message : 'Error de conexión. Revisa tu red.');
      Haptics.error();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = ''; // allow re-selecting same file
  };

  return (
    <div className="bg-surface-elevated border border-surface-border rounded-2xl p-6 md:p-8 shadow-sm">
      <h2 className="font-headline-md text-headline-md text-on-surface mb-1">Escanear Boleta</h2>
      <p className="font-body-md text-body-md text-on-surface-variant mb-6">
        Sube la foto y la IA extraerá los datos automáticamente.
      </p>

      {/* Error inline — siempre visible */}
      {errorMsg && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-red-400 text-[20px] mt-0.5 shrink-0">error</span>
          <div className="flex-1">
            <p className="font-label-md text-red-400 mb-2">{errorMsg}</p>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs text-red-400/70 underline hover:text-red-400"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Opción 1: Cámara */}
        <label className="block cursor-pointer">
          <div className="bg-surface-base border border-surface-border rounded-xl p-4 hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[20px]">photo_camera</span>
              </div>
              <div>
                <p className="font-label-md text-on-surface">Tomar Foto</p>
                <p className="font-label-sm text-on-surface-variant text-xs">Cámara trasera</p>
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              disabled={loading}
              className="block w-full text-sm text-on-surface-variant
                file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:font-medium file:bg-primary/10 file:text-primary
                hover:file:bg-primary/20 cursor-pointer disabled:opacity-40"
            />
          </div>
        </label>

        {/* Opción 2: Galería */}
        <label className="block cursor-pointer">
          <div className="bg-surface-base border border-surface-border rounded-xl p-4 hover:border-secondary/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary text-[20px]">image</span>
              </div>
              <div>
                <p className="font-label-md text-on-surface">Subir desde Galería</p>
                <p className="font-label-sm text-on-surface-variant text-xs">Imagen o PDF</p>
              </div>
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              disabled={loading}
              className="block w-full text-sm text-on-surface-variant
                file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:font-medium file:bg-secondary/10 file:text-secondary
                hover:file:bg-secondary/20 cursor-pointer disabled:opacity-40"
            />
          </div>
        </label>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-surface-border"></div>
          <span className="text-on-surface-variant text-xs font-label-sm">O</span>
          <div className="flex-1 h-px bg-surface-border"></div>
        </div>

        {/* Manual */}
        <button
          onClick={onManualEntry}
          disabled={loading}
          className="w-full border border-surface-border text-on-surface-variant py-3 rounded-xl font-label-md
            flex items-center justify-center gap-2 hover:bg-surface-base hover:text-on-surface transition-colors disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[18px]">keyboard</span>
          Ingresar datos manualmente
        </button>
      </div>

      {/* OVERLAY DE CARGA — PANTALLA COMPLETA */}
      {loading && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,15,15,0.97)' }}
          className="flex flex-col items-center justify-center px-8 text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-surface-elevated border border-surface-border flex items-center justify-center mb-6 shadow-xl">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xs h-2 bg-surface-base rounded-full overflow-hidden mb-3 border border-surface-border">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-on-surface font-bold text-lg mb-1">{progress}%</p>
          <p className="text-on-surface-variant text-sm animate-pulse">{loadingText}</p>
        </div>
      )}
    </div>
  );
}

`

==================================================
### ARCHIVO: src\components\SimuladorComisiones.tsx
==================================================
`tsx
'use client';

import { useState, useEffect } from 'react';
import { getMetaMensual } from '@/lib/meta';
import { Venta } from '@/types/venta';

// Tablas de comisión replicadas de database.sql
const comisionTelefonia = (valor: number, anos: number) => {
  if (valor < 4000) return 0;
  if (valor <= 20000) return anos === 1 ? 1200 : 1000;
  if (valor <= 60000) return anos === 1 ? 1200 : 2000;
  if (valor <= 100000) return anos === 1 ? 2400 : 4000;
  if (valor <= 151000) return anos === 1 ? 3600 : 6000;
  if (valor <= 251000) return anos === 1 ? 5900 : 9900;
  return anos === 1 ? 9100 : 15000;
};

const comisionLineasDuras = (valor: number, anos: number) => {
  if (valor < 4000) return 0;
  if (valor <= 20000) return anos === 1 ? 600 : anos === 2 ? 1000 : anos === 3 ? 1200 : 1400;
  if (valor <= 60000) return anos === 1 ? 1200 : anos === 2 ? 2000 : anos === 3 ? 2400 : 2800;
  if (valor <= 100000) return anos === 1 ? 2400 : anos === 2 ? 4000 : anos === 3 ? 4800 : 5600;
  if (valor <= 151000) return anos === 1 ? 3600 : anos === 2 ? 6000 : anos === 3 ? 7200 : 8400;
  if (valor <= 251000) return anos === 1 ? 5900 : anos === 2 ? 9900 : anos === 3 ? 12000 : 14000;
  return anos === 1 ? 9100 : anos === 2 ? 15000 : anos === 3 ? 18000 : 21000;
};

export default function SimuladorComisiones({ ventas }: { ventas: Venta[] }) {
  const [modo, setModo] = useState<'A' | 'B'>('A');
  const [tipo, setTipo] = useState<'telefonia' | 'lineas_duras'>('telefonia');
  const [valorGarantia, setValorGarantia] = useState(50000);
  const [anos, setAnos] = useState(1);
  const [cantidad, setCantidad] = useState(1);
  
  const [meta, setMeta] = useState(150000);
  
  const currentMonth = new Date().toISOString().split('T')[0].substring(0, 7);

  useEffect(() => {
    setMeta(getMetaMensual(currentMonth));
  }, [currentMonth]);

  const totalComisiones = ventas.reduce((acc, v) => acc + (v.comision_calculada || 0), 0);
  
  // Cálculo Modo A
  const comisionUnitaria = tipo === 'telefonia' ? comisionTelefonia(valorGarantia, anos) : comisionLineasDuras(valorGarantia, anos);
  const comisionTotalSimulada = comisionUnitaria * cantidad;
  
  // Cálculo Modo B
  const falta = Math.max(0, meta - totalComisiones);
  
  return (
    <div className="glass-panel rounded-xl p-6 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
      
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">calculate</span>
            Simulador Inteligente
          </h3>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
            Calcula tus ganancias exactas usando la tabla oficial de comisiones.
          </p>
        </div>
        
        <div className="flex bg-surface-container rounded-lg p-1">
          <button 
            className={`px-3 py-1.5 rounded-md font-label-sm text-label-sm transition-all ${modo === 'A' ? 'bg-primary/20 text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setModo('A')}
          >
            Proyectar Venta
          </button>
          <button 
            className={`px-3 py-1.5 rounded-md font-label-sm text-label-sm transition-all ${modo === 'B' ? 'bg-secondary/20 text-secondary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setModo('B')}
          >
            Alcanzar Meta
          </button>
        </div>
      </div>

      {modo === 'A' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-4">
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">Tipo de Garantía</label>
              <div className="flex gap-2">
                <button 
                  className={`flex-1 py-2 rounded-lg border font-label-md text-label-md transition-colors ${tipo === 'telefonia' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-transparent border-white/10 text-on-surface-variant hover:bg-white/5'}`}
                  onClick={() => { setTipo('telefonia'); if(anos > 2) setAnos(2); }}
                >
                  Telefonía
                </button>
                <button 
                  className={`flex-1 py-2 rounded-lg border font-label-md text-label-md transition-colors ${tipo === 'lineas_duras' ? 'bg-tertiary/10 border-tertiary/30 text-tertiary' : 'bg-transparent border-white/10 text-on-surface-variant hover:bg-white/5'}`}
                  onClick={() => setTipo('lineas_duras')}
                >
                  Líneas Duras
                </button>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="font-label-sm text-label-sm text-on-surface-variant">Valor de la Garantía</label>
                <span className="font-label-md text-label-md text-on-surface font-semibold">${valorGarantia.toLocaleString('es-CL')}</span>
              </div>
              <input 
                type="range" min="4000" max="300000" step="1000" 
                value={valorGarantia} onChange={e => setValorGarantia(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">Años</label>
                <select 
                  value={anos} onChange={e => setAnos(Number(e.target.value))}
                  className="w-full bg-surface-container border border-white/10 text-on-surface font-label-md text-label-md p-2 rounded-lg outline-none"
                >
                  <option value={1}>1 Año</option>
                  <option value={2}>2 Años</option>
                  {tipo === 'lineas_duras' && <option value={3}>3 Años</option>}
                  {tipo === 'lineas_duras' && <option value={4}>4 Años</option>}
                </select>
              </div>
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">Cantidad</label>
                <input 
                  type="number" min="1" max="100" 
                  value={cantidad} onChange={e => setCantidad(Number(e.target.value))}
                  className="w-full bg-surface-container border border-white/10 text-on-surface font-label-md text-label-md p-2 rounded-lg outline-none text-center"
                />
              </div>
            </div>
          </div>
          
          <div className="bg-black/20 rounded-xl p-6 flex flex-col justify-center border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <span className="material-symbols-outlined text-[100px]">monetization_on</span>
            </div>
            <p className="font-label-md text-label-md text-on-surface-variant mb-1 relative z-10">Ganancia Proyectada</p>
            <p className="font-display-md text-display-md text-primary drop-shadow-[0_0_15px_rgba(77,142,255,0.3)] relative z-10">
              ${comisionTotalSimulada.toLocaleString('es-CL')}
            </p>
            
            <div className="mt-4 pt-4 border-t border-white/10 relative z-10 flex justify-between items-center">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Comisión Unitaria:</span>
              <span className="font-label-md text-label-md text-on-surface font-medium">${comisionUnitaria.toLocaleString('es-CL')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-secondary/10 border border-secondary/20">
            <div>
              <p className="font-label-sm text-label-sm text-secondary">Brecha para Meta (${meta.toLocaleString('es-CL')})</p>
              <p className="font-headline-md text-headline-md text-on-surface">Faltan ${falta.toLocaleString('es-CL')}</p>
            </div>
            {falta === 0 && (
              <div className="px-4 py-2 bg-secondary text-on-secondary font-label-md text-label-md rounded-lg shadow-[0_0_10px_rgba(78,222,163,0.4)]">
                ¡Meta lograda! 🎉
              </div>
            )}
          </div>
          
          {falta > 0 && (
            <div>
              <p className="font-label-md text-label-md text-on-surface-variant mb-4">Puedes llegar a tu meta vendiendo aproximadamente:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-surface-container rounded-lg p-3 border border-white/5">
                  <p className="font-headline-md text-headline-md text-on-surface">{Math.ceil(falta / 9900)}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant leading-tight">Garantías Telefonía<br/>(Tramo 5 / 2 Años)</p>
                </div>
                <div className="bg-surface-container rounded-lg p-3 border border-white/5">
                  <p className="font-headline-md text-headline-md text-on-surface">{Math.ceil(falta / 6000)}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant leading-tight">Garantías L. Duras<br/>(Tramo 4 / 2 Años)</p>
                </div>
                <div className="bg-surface-container rounded-lg p-3 border border-white/5">
                  <p className="font-headline-md text-headline-md text-on-surface">{Math.ceil(falta / 2400)}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant leading-tight">Garantías Mixtas<br/>(Tramo Medio)</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

`

==================================================
### ARCHIVO: src\components\TablaHistorial.tsx
==================================================
`tsx
'use client';

import { Venta } from '@/types/venta';
import * as XLSX from 'xlsx';

interface TablaHistorialProps {
  ventas: Venta[];
}

export default function TablaHistorial({ ventas }: TablaHistorialProps) {
  const exportarExcel = () => {
    const datosExportar = ventas.map(v => ({
      'Fecha': v.fecha_compra,
      'Folio': v.folio,
      'Canal': v.canal === 'caja' ? 'Tienda' : 'Internet',
      'Tipo Garantía': v.tipo_garantia === 'telefonia' ? 'Telefonía' : 'Líneas Duras',
      'Años Garantía': v.anos_garantia,
      'Precio Base ($)': v.precio_producto,
      'Valor Garantía ($)': v.valor_garantia,
      'Total Boleta ($)': v.total_boleta,
      'Nº Pedido': v.numero_pedido || 'N/A',
      'Comisión Generada ($)': v.comision_calculada,
    }));
    const ws = XLSX.utils.json_to_sheet(datosExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
    XLSX.writeFile(wb, 'Comisiones_BryanApp_' + new Date().toISOString().split('T')[0] + '.xlsx');
  };

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-white/5 flex justify-between items-center">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Registro Detallado</h3>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">{ventas.length} registros encontrados</p>
        </div>
        <button
          onClick={exportarExcel}
          disabled={ventas.length === 0}
          className="flex items-center gap-2 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary px-4 py-2 rounded-xl font-label-md text-label-md hover:scale-[1.02] transition-all shadow-[0_0_12px_rgba(78,222,163,0.25)] disabled:opacity-40 disabled:scale-100"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Exportar Excel
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-black/20">
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Fecha</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Folio</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Canal</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Garantía</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Valor</th>
              <th className="font-label-sm text-label-sm text-on-surface-variant p-4 uppercase tracking-wider">Comisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ventas.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-on-surface-variant font-body-md text-body-md">
                  No hay ventas registradas en este período.
                </td>
              </tr>
            ) : (
              ventas.map((venta, idx) => (
                <tr key={venta.id || idx} className="hover:bg-white/5 transition-colors group">
                  <td className="p-4 font-label-md text-label-md text-on-surface-variant">{venta.fecha_compra}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded bg-surface-variant flex items-center justify-center text-on-surface-variant group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[14px]">receipt</span>
                      </div>
                      <span className="font-label-md text-label-md text-on-surface">{venta.folio}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={
                      'inline-flex items-center gap-1 font-label-sm text-label-sm px-2.5 py-1 rounded-full border ' +
                      (venta.canal === 'caja'
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'bg-tertiary/10 text-tertiary border-tertiary/20')
                    }>
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {venta.canal === 'caja' ? 'Tienda' : 'Internet'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="font-label-md text-label-md text-on-surface">
                      {venta.anos_garantia} {venta.anos_garantia === 1 ? 'año' : 'años'}
                    </span>
                    <p className="font-label-sm text-label-sm text-on-surface-variant/70">
                      {venta.tipo_garantia === 'telefonia' ? 'Telefonía' : 'L. Duras'}
                    </p>
                  </td>
                  <td className="p-4 font-label-md text-label-md text-on-surface">
                    ${venta.valor_garantia?.toLocaleString('es-CL')}
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1 font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/20 shadow-[0_0_8px_rgba(78,222,163,0.2)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                      ${venta.comision_calculada?.toLocaleString('es-CL')}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

`

==================================================
### ARCHIVO: src\components\ThemeToggle.tsx
==================================================
`tsx
'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Check if user previously saved a preference
    const savedTheme = localStorage.getItem('bryanapp_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else if (savedTheme === 'dark' || prefersDark) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      // default light if no preference and not preferring dark? 
      // original was dark by default, so keep dark by default
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('bryanapp_theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('bryanapp_theme', 'dark');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none flex items-center px-1 shrink-0 shadow-inner"
      style={{ backgroundColor: isDark ? 'var(--color-secondary)' : 'var(--color-outline-variant)' }}
      aria-label="Toggle theme"
    >
      <div
        className={`w-4 h-4 rounded-full bg-surface shadow-sm transform transition-transform duration-300 z-10 flex items-center justify-center`}
        style={{ transform: isDark ? 'translateX(24px)' : 'translateX(0)' }}
      />
    </button>
  );
}

`

==================================================
### ARCHIVO: src\components\ToastProvider.tsx
==================================================
`tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Haptics } from '@/lib/haptics';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    // Disparar haptic feedback según el tipo de toast
    if (type === 'error') {
      Haptics.error();
    } else if (type === 'success') {
      Haptics.success();
    } else {
      Haptics.light();
    }

    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container - Fijo en la parte inferior sobre la botonera móvil */}
      <div className="fixed bottom-[100px] md:bottom-10 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`
              animate-in slide-in-from-bottom-5 fade-in zoom-in-95 duration-300
              pointer-events-auto px-6 py-3 rounded-full font-label-md shadow-2xl flex items-center gap-2 max-w-sm w-full backdrop-blur-md border
              ${toast.type === 'error' ? 'bg-error/90 text-on-error border-error/50' : ''}
              ${toast.type === 'success' ? 'bg-secondary/90 text-background border-secondary/50' : ''}
              ${toast.type === 'info' ? 'bg-surface-variant/90 text-on-surface border-white/10' : ''}
            `}
          >
            <span className="material-symbols-outlined text-[20px]">
              {toast.type === 'error' ? 'error' : toast.type === 'success' ? 'check_circle' : 'info'}
            </span>
            <span className="leading-tight">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

`

==================================================
### ARCHIVO: src\components\VendedorSelector.tsx
==================================================
`tsx
'use client';

import { useState, useEffect, useRef } from 'react';

export default function VendedorSelector() {
  const [vendedor, setVendedor] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('trackretail_vendedor');
      if (saved && saved.trim()) {
        setVendedor(saved.trim());
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const handleSave = () => {
    const name = vendedor.trim();
    if (name.length === 0) return;
    try {
      localStorage.setItem('trackretail_vendedor', name);
    } catch {
      // localStorage not available
    }
    setVendedor(name);
    setIsEditing(false);
    // Force page reload so dashboard picks up new vendedor
    window.location.reload();
  };

  const handleEdit = () => {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // First-time setup (no vendedor saved yet)
  if (!vendedor && !isEditing) {
    return (
      <button
        onClick={handleEdit}
        className="flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary px-3 py-2 rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors w-full"
      >
        <span className="material-symbols-outlined text-[18px]">person_add</span>
        <span className="truncate">Configurar nombre</span>
      </button>
    );
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <input
          ref={inputRef}
          type="text"
          placeholder="Escribe tu nombre..."
          value={vendedor}
          onChange={e => setVendedor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setIsEditing(false); }}
          className="w-full bg-surface-base border border-primary/50 text-on-surface rounded-lg px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          autoComplete="off"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-primary text-on-primary py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Guardar
          </button>
          {vendedor && (
            <button
              onClick={() => { setIsEditing(false); }}
              className="px-3 py-2 rounded-lg border border-surface-border text-on-surface-variant text-sm hover:bg-surface-base transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleEdit}
      className="flex items-center gap-2 w-full text-left group"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
        <span
          className="material-symbols-outlined text-[15px] text-background"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          person
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-on-surface-variant leading-tight">Activo como</p>
        <p className="text-sm font-semibold text-on-surface group-hover:text-secondary transition-colors truncate">
          {vendedor}
        </p>
      </div>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-secondary transition-colors shrink-0">
        edit
      </span>
    </button>
  );
}

`

==================================================
### ARCHIVO: src\hooks\useOfflineSync.ts
==================================================
`typescript
'use client';

import { useEffect, useCallback } from 'react';
import { useToast } from '@/components/ToastProvider';
import { Haptics } from '@/lib/haptics';

export function useOfflineSync() {
  const { showToast } = useToast();

  const syncQueue = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.onLine) return;

    try {
      const queueStr = localStorage.getItem('trackretail_offline_queue');
      if (!queueStr) return;
      
      const queue = JSON.parse(queueStr);
      if (!Array.isArray(queue) || queue.length === 0) return;

      showToast(`Sincronizando ${queue.length} boleta(s) pendiente(s)...`, 'info');
      let successCount = 0;
      let failedQueue = [];

      for (const item of queue) {
        try {
          const res = await fetch('/api/ventas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          });

          if (res.ok || res.status === 409) {
            // 409 means it was already saved somehow, we can discard it from queue
            successCount++;
          } else {
            failedQueue.push(item);
          }
        } catch (e) {
          failedQueue.push(item);
        }
      }

      if (successCount > 0) {
        showToast(`¡${successCount} boleta(s) offline sincronizada(s)!`, 'success');
        Haptics.success();
      }

      if (failedQueue.length > 0) {
        localStorage.setItem('trackretail_offline_queue', JSON.stringify(failedQueue));
      } else {
        localStorage.removeItem('trackretail_offline_queue');
      }

    } catch (e) {
      console.error('Error sincronizando offline queue', e);
    }
  }, [showToast]);

  useEffect(() => {
    // Intentar sincronizar al cargar la app
    syncQueue();

    // Intentar sincronizar cuando vuelve el internet
    window.addEventListener('online', syncQueue);
    return () => window.removeEventListener('online', syncQueue);
  }, [syncQueue]);
}

`

==================================================
### ARCHIVO: src\lib\haptics.ts
==================================================
`typescript
/**
 * Motor Hápctico para feedback físico nativo en dispositivos móviles.
 * Ignora silenciosamente si el dispositivo no soporta vibración (ej. Desktop iOS o PC).
 */
export const Haptics = {
  // Vibración ligera para interacciones (taps, selecciones)
  light: () => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  },
  
  // Vibración media para acciones completadas o cambios de estado
  medium: () => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }
  },
  
  // Vibración fuerte para errores
  error: () => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([50, 100, 50]);
    }
  },

  // Patrón especial de éxito (ej. meta alcanzada)
  success: () => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([30, 50, 30]);
    }
  }
};

`

==================================================
### ARCHIVO: src\lib\meta.ts
==================================================
`typescript
export const getMetaMensual = (mes: string): number => {
  if (typeof window === 'undefined') return 150000;
  
  try {
    const saved = localStorage.getItem(`trackretail_meta_${mes}`);
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val)) return val;
    }
  } catch (e) {
    console.warn('LocalStorage no accesible para metas');
  }
  
  return 150000; // Valor por defecto
};

export const setMetaMensual = (mes: string, valor: number): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`trackretail_meta_${mes}`, valor.toString());
  } catch (e) {
    console.warn('No se pudo guardar la meta');
  }
};

`

==================================================
### ARCHIVO: src\lib\supabase.ts
==================================================
`typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

`

==================================================
### ARCHIVO: src\types\venta.ts
==================================================
`typescript
export interface VentaOCR {
  folio: string | null;
  fecha_compra: string | null; // ISO 8601 YYYY-MM-DD
  precio_producto: number | null;
  cantidad_unidades: number | null;
  valor_garantia: number | null;
  total_boleta: number | null;
  canal: 'caja' | 'internet' | null;
  numero_pedido: string | null;
}

export interface Venta extends VentaOCR {
  id?: string;
  anos_garantia: 1 | 2 | 3 | 4 | null;
  tipo_garantia: 'telefonia' | 'lineas_duras' | null;
  vendedor_id: string;
  comision_calculada?: number;
  created_at?: string;
}

`

==================================================
### ARCHIVO: next.config.ts
==================================================
`typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '10.103.10.126',
    '10.103.10.108',
    '10.0.0.0/8',
    '192.168.0.0/16',
    '172.16.0.0/12',
  ],
};

export default nextConfig;

`

==================================================
### ARCHIVO: tailwind.config.ts
==================================================
`typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-container": "var(--color-surface-container)",
        "surface-base": "var(--color-surface-base)",
        "surface-elevated": "var(--color-surface-elevated)",
        "surface-border": "var(--color-surface-border)",
        "tertiary-fixed": "var(--color-tertiary-fixed)",
        "on-tertiary-fixed-variant": "var(--color-on-tertiary-fixed-variant)",
        "background": "var(--color-background)",
        "on-tertiary-fixed": "var(--color-on-tertiary-fixed)",
        "surface-dim": "var(--color-surface-dim)",
        "outline-variant": "var(--color-outline-variant)",
        "surface-container-high": "var(--color-surface-container-high)",
        "on-secondary": "var(--color-on-secondary)",
        "surface-tint": "var(--color-surface-tint)",
        "inverse-surface": "var(--color-inverse-surface)",
        "on-secondary-fixed-variant": "var(--color-on-secondary-fixed-variant)",
        "on-surface": "var(--color-on-surface)",
        "secondary-fixed": "var(--color-secondary-fixed)",
        "surface-container-lowest": "var(--color-surface-container-lowest)",
        "tertiary-fixed-dim": "var(--color-tertiary-fixed-dim)",
        "error-container": "var(--color-error-container)",
        "on-primary-container": "var(--color-on-primary-container)",
        "primary-fixed": "var(--color-primary-fixed)",
        "inverse-primary": "var(--color-inverse-primary)",
        "on-primary": "var(--color-on-primary)",
        "on-background": "var(--color-on-background)",
        "primary-fixed-dim": "var(--color-primary-fixed-dim)",
        "surface-bright": "var(--color-surface-bright)",
        "secondary": "var(--color-secondary)",
        "tertiary-container": "var(--color-tertiary-container)",
        "on-secondary-container": "var(--color-on-secondary-container)",
        "surface-container-low": "var(--color-surface-container-low)",
        "error": "var(--color-error)",
        "tertiary": "var(--color-tertiary)",
        "surface": "var(--color-surface)",
        "on-error": "var(--color-on-error)",
        "inverse-on-surface": "var(--color-inverse-on-surface)",
        "secondary-container": "var(--color-secondary-container)",
        "on-error-container": "var(--color-on-error-container)",
        "surface-container-highest": "var(--color-surface-container-highest)",
        "primary-container": "var(--color-primary-container)",
        "on-tertiary": "var(--color-on-tertiary)",
        "surface-variant": "var(--color-surface-variant)",
        "secondary-fixed-dim": "var(--color-secondary-fixed-dim)",
        "on-tertiary-container": "var(--color-on-tertiary-container)",
        "on-primary-fixed": "var(--color-on-primary-fixed)",
        "on-primary-fixed-variant": "var(--color-on-primary-fixed-variant)",
        "on-surface-variant": "var(--color-on-surface-variant)",
        "primary": "var(--color-primary)",
        "on-secondary-fixed": "var(--color-on-secondary-fixed)",
        "outline": "var(--color-outline)",
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "gutter": "24px",
        "margin-mobile": "16px",
        "margin-desktop": "40px",
        "stack-sm": "8px",
        "stack-md": "16px",
        "container-max": "1280px",
        "stack-lg": "32px"
      },
      fontFamily: {
        "body-lg": ["Inter", "sans-serif"],
        "label-sm": ["Inter", "sans-serif"],
        "headline-md": ["Outfit", "sans-serif"],
        "display-lg": ["Outfit", "sans-serif"],
        "display-lg-mobile": ["Outfit", "sans-serif"],
        "headline-sm": ["Outfit", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"]
      },
      fontSize: {
        "body-lg": ["18px", {"lineHeight": "28px", "fontWeight": "400"}],
        "label-sm": ["12px", {"lineHeight": "16px", "fontWeight": "600"}],
        "headline-md": ["24px", {"lineHeight": "32px", "fontWeight": "600"}],
        "display-lg": ["48px", {"lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
        "display-lg-mobile": ["36px", {"lineHeight": "44px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
        "headline-sm": ["20px", {"lineHeight": "28px", "fontWeight": "600"}],
        "body-md": ["16px", {"lineHeight": "24px", "fontWeight": "400"}],
        "label-md": ["14px", {"lineHeight": "20px", "letterSpacing": "0.01em", "fontWeight": "500"}]
      }
    },
  },
  plugins: [],
};
export default config;

`

==================================================
### ARCHIVO: database.sql
==================================================
`sql
-- 1. Crear tabla principal de ventas
CREATE TABLE ventas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio           TEXT NOT NULL,
  fecha_compra    DATE NOT NULL,
  canal           TEXT NOT NULL CHECK (canal IN ('caja', 'internet')),
  precio_producto NUMERIC(12, 0) NOT NULL,
  cantidad_unidades INTEGER NOT NULL DEFAULT 1,
  valor_garantia  NUMERIC(12, 0) NOT NULL DEFAULT 0,
  anos_garantia   INTEGER CHECK (anos_garantia IN (1, 2, 3, 4)),
  tipo_garantia   TEXT CHECK (tipo_garantia IN ('telefonia', 'lineas_duras')),
  total_boleta    NUMERIC(12, 0) NOT NULL,
  numero_pedido   TEXT,
  comision_calculada NUMERIC(12, 0) DEFAULT 0,
  vendedor_id     TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT folio_fecha_canal_unique UNIQUE (folio, fecha_compra, canal)
);

-- 2. Crear tabla de comisiones para Telefonía
CREATE TABLE tramos_comision_telefonia (
  id          SERIAL PRIMARY KEY,
  tramo       INTEGER NOT NULL,
  monto_min   NUMERIC(12, 0) NOT NULL,
  monto_max   NUMERIC(12, 0),
  comision_1ano  NUMERIC(12, 0) NOT NULL,
  comision_2anos NUMERIC(12, 0) NOT NULL
);

-- Poblar Telefonía (Tabla 1)
INSERT INTO tramos_comision_telefonia VALUES
(DEFAULT, 1, 4000,   20000,  1200, 1000),
(DEFAULT, 2, 20001,  60000,  1200, 2000),
(DEFAULT, 3, 60001,  100000, 2400, 4000),
(DEFAULT, 4, 100001, 151000, 3600, 6000),
(DEFAULT, 5, 151001, 251000, 5900, 9900),
(DEFAULT, 6, 251001, NULL,   9100, 15000);

-- 3. Crear tabla de comisiones para Líneas Duras
CREATE TABLE tramos_comision_lineas_duras (
  id          SERIAL PRIMARY KEY,
  tramo       INTEGER NOT NULL,
  monto_min   NUMERIC(12, 0) NOT NULL,
  monto_max   NUMERIC(12, 0),
  comision_1ano  NUMERIC(12, 0) NOT NULL,
  comision_2anos NUMERIC(12, 0) NOT NULL,
  comision_3anos NUMERIC(12, 0) NOT NULL,
  comision_4anos NUMERIC(12, 0) NOT NULL
);

-- Poblar Líneas Duras (Tabla 2)
INSERT INTO tramos_comision_lineas_duras VALUES
(DEFAULT, 1, 4000,   20000,  600,  1000, 1200, 1400),
(DEFAULT, 2, 20001,  60000,  1200, 2000, 2400, 2800),
(DEFAULT, 3, 60001,  100000, 2400, 4000, 4800, 5600),
(DEFAULT, 4, 100001, 151000, 3600, 6000, 7200, 8400),
(DEFAULT, 5, 151001, 251000, 5900, 9900, 12000, 14000),
(DEFAULT, 6, 251001, NULL,   9100, 15000, 18000, 21000);

-- 4. Función SQL para calcular comisión automáticamente
CREATE OR REPLACE FUNCTION calcular_comision()
RETURNS TRIGGER AS $$
DECLARE
  resultado NUMERIC := 0;
BEGIN
  IF NEW.tipo_garantia = 'telefonia' THEN
    SELECT CASE NEW.anos_garantia
      WHEN 1 THEN comision_1ano
      WHEN 2 THEN comision_2anos
    END INTO resultado
    FROM tramos_comision_telefonia
    WHERE NEW.valor_garantia >= monto_min
      AND (monto_max IS NULL OR NEW.valor_garantia <= monto_max);
      
  ELSIF NEW.tipo_garantia = 'lineas_duras' THEN
    SELECT CASE NEW.anos_garantia
      WHEN 1 THEN comision_1ano
      WHEN 2 THEN comision_2anos
      WHEN 3 THEN comision_3anos
      WHEN 4 THEN comision_4anos
    END INTO resultado
    FROM tramos_comision_lineas_duras
    WHERE NEW.valor_garantia >= monto_min
      AND (monto_max IS NULL OR NEW.valor_garantia <= monto_max);
  END IF;
  
  -- Si resultado es null, dejamos en 0
  NEW.comision_calculada := COALESCE(resultado, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger para ejecutar la función antes de insertar o actualizar
CREATE TRIGGER trigger_calcular_comision
BEFORE INSERT OR UPDATE ON ventas
FOR EACH ROW
EXECUTE FUNCTION calcular_comision();

`

==================================================
### ARCHIVO: .env.local
==================================================
`local
NEXT_PUBLIC_SUPABASE_URL=https://rpemltlwbjnjeskjwzgs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_BalNrlEEZXtvPvhQ6-pJ1g_8DsG3zsU
GEMINI_API_KEY=AQ.Ab8RN6IqiuHk6T0Tcy9JyY9ZNxsLSsNR29Yk7Tc4AdgeGYtRrQ

`

==================================================
### ARCHIVO: package.json
==================================================
`json
{
  "name": "track-retail",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "@supabase/supabase-js": "^2.110.9",
    "lucide-react": "^1.27.0",
    "next": "16.2.12",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.3",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "autoprefixer": "^10.5.4",
    "eslint": "^9",
    "eslint-config-next": "16.2.12",
    "postcss": "^8.5.23",
    "tailwindcss": "^4.3.3",
    "typescript": "^5"
  }
}

`

