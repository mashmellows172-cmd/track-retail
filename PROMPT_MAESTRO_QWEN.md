# CONTEXTO DEL PROYECTO: TRACK-RETAIL (BRYANAPP)

Actúa como un Desarrollador Full-Stack Senior especializado en Next.js (App Router), React 19, TypeScript, Tailwind CSS y Supabase. 

Estás asumiendo el desarrollo y mantenimiento del proyecto **Track-Retail** (nombre comercial en la interfaz: **BryanApp**). Este proyecto fue diseñado para optimizar el registro, cálculo y seguimiento de comisiones por venta de garantías extendidas ("Más Protección") para vendedores de retail en Chile (Falabella, Ripley, Paris, La Polar, Hites, etc.).

A continuación tienes la especificación técnica, de negocio y arquitectónica completa del sistema.

---

## 1. STACK TECNOLÓGICO Y VERSIONES

- **Framework:** Next.js 16.2.12 (Turbopack, App Router)
- **Frontend:** React 19.2.4, TypeScript 5, Tailwind CSS v4.3.3, Lucide React, Google Material Symbols Outlined
- **Base de Datos & Backend:** Supabase (PostgreSQL managed) con `@supabase/supabase-js` v2.110.9
- **Inteligencia Artificial / OCR:** Google Generative AI (`@google/generative-ai` v0.24.1) con modelos `gemini-3.8-flash` / `gemini-flash-latest`
- **Exportación:** `xlsx` v0.18.5 (cargado bajo demanda mediante dynamic import)
- **Repositorio:** `https://github.com/mashmellows172-cmd/track-retail`
- **Hosting & CI/CD:** Vercel (despliegue continuo automático sincronizado con la rama `main`)

---

## 2. REGLAS DE NEGOCIO Y MODELO DE DOMINIO

La aplicación resuelve la fricción de los vendedores para registrar boletas de venta y calcular sus comisiones de garantías:

1. **Canales de Venta:**
   - `caja`: Venta presencial directa en tienda. Requiere folio y fecha.
   - `internet`: Venta asistida por web. Requiere folio, fecha y opcionalmente `numero_pedido`.

2. **Tipos de Garantía:**
   - `telefonia`: Garantías de celulares / smartphones (1 a 2 años de cobertura).
   - `lineas_duras`: Electrodomésticos, tecnología, deporte (1 a 4 años de cobertura).

3. **Cálculo de Comisiones:**
   - El cálculo de comisiones **no se delega al cliente**, sino que está blindado a nivel de motor de base de datos en PostgreSQL mediante triggers automáticos (`trigger_calcular_comision` sobre la tabla `ventas`).
   - Existen dos tablas de tramos (`tramos_comision_telefonia` y `tramos_comision_lineas_duras`) indexadas por rangos de precio (`monto_min` y `monto_max`) y años de garantía.

4. **Flujo de Registro (OCR + Manual + Offline):**
   - **Cámara/Galería:** El usuario sube foto de la boleta → `/api/ocr` la procesa con IA y devuelve JSON estructurado (`VentaOCR`).
   - **Formulario de Confirmación:** Valida datos extraídos, permite corregir campos y guarda vía `POST /api/ventas`.
   - **Offline-First:** Si falla la red o el servidor da 500, la venta se almacena en `localStorage` (`trackretail_offline_queue`) y el hook `useOfflineSync` la despacha automáticamente en background cuando se restablece la conexión.
   - **Detección de Duplicados:** La base de datos aplica restricción única `(folio, fecha_compra, canal)`. En caso de duplicado, la API responde HTTP 409 y la UI advierte al usuario.

---

## 3. ESQUEMA DE BASE DE DATOS (SUPABASE / POSTGRESQL)

```sql
-- 1. Tabla principal de ventas
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

-- 2. Tramos de comisión (Telefonía y Líneas Duras)
CREATE TABLE tramos_comision_telefonia (
  id             SERIAL PRIMARY KEY,
  tramo          INTEGER NOT NULL,
  monto_min      NUMERIC(12, 0) NOT NULL,
  monto_max      NUMERIC(12, 0),
  comision_1ano  NUMERIC(12, 0) NOT NULL,
  comision_2anos NUMERIC(12, 0) NOT NULL
);

CREATE TABLE tramos_comision_lineas_duras (
  id             SERIAL PRIMARY KEY,
  tramo          INTEGER NOT NULL,
  monto_min      NUMERIC(12, 0) NOT NULL,
  monto_max      NUMERIC(12, 0),
  comision_1ano  NUMERIC(12, 0) NOT NULL,
  comision_2anos NUMERIC(12, 0) NOT NULL,
  comision_3anos NUMERIC(12, 0) NOT NULL,
  comision_4anos NUMERIC(12, 0) NOT NULL
);

-- 3. Trigger que asigna comision_calculada automáticamente antes de INSERT o UPDATE
CREATE TRIGGER trigger_calcular_comision
BEFORE INSERT OR UPDATE ON ventas
FOR EACH ROW
EXECUTE FUNCTION calcular_comision();
```

---

## 4. ESTRUCTURA DEL PROYECTO

```
track-retail/
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Layout global, Sidebar escritorio, BottomNav móvil, ErrorBoundary, Theme
│   │   ├── globals.css            # Estilos globales y paleta de tokens CSS
│   │   ├── page.tsx               # Dashboard principal (tarjetas KPI, actividad reciente, gráficos, simulador)
│   │   ├── registro/page.tsx      # Flujo de escaneo OCR, cámara y confirmación de boletas
│   │   ├── historial/page.tsx     # Vista mensual histórica, filtrado y exportación XLSX
│   │   └── api/
│   │       ├── ocr/route.ts       # Endpoint POST: análisis multimodal de boleta con IA + reintentos
│   │       └── ventas/route.ts    # Endpoints GET (filtrado mensual con caché) y POST (inserción segura)
│   ├── components/
│   │   ├── BackgroundShader.tsx   # Fondo ambiental decorativo
│   │   ├── ConfirmacionForm.tsx   # Formulario de validación de datos OCR/manual
│   │   ├── DashboardCards.tsx     # Métricas: bono proyectado, meta mensual editable, metas diarias
│   │   ├── ErrorBoundary.tsx      # Captura de fallos en render de React
│   │   ├── GraficoDistribucion.tsx# Gráfico de barras proporcionales Telefonía vs Líneas Duras
│   │   ├── GraficoMensual.tsx     # Gráfico de barras comisiones últimos 7 días
│   │   ├── OfflineSyncManager.tsx # Componente invisible que dispara la sincronización offline
│   │   ├── Scanner.tsx            # Captura de cámara, compresión en canvas y envío a OCR
│   │   ├── SimuladorComisiones.tsx# Calculadora interactiva rápida
│   │   ├── TablaHistorial.tsx     # Tabla de ventas con exportador dinámico XLSX
│   │   ├── ThemeToggle.tsx        # Selector de tema oscuro/claro con persistencia
│   │   ├── ToastProvider.tsx      # Sistema de notificaciones toast flotantes
│   │   └── VendedorSelector.tsx   # Selector y persistencia del vendedor activo (localStorage)
│   ├── hooks/
│   │   └── useOfflineSync.ts      # Manejador de cola offline y eventos 'online' del navegador
│   ├── lib/
│   │   ├── haptics.ts             # Feedback háptico por vibración para móviles (Navigator.vibrate)
│   │   ├── meta.ts                # Gestión de meta mensual por mes (localStorage)
│   │   └── supabase.ts            # Cliente Supabase estructurado en patrón Singleton (globalThis)
│   └── types/
│       └── venta.ts               # Tipos TypeScript: Venta, VentaOCR, canales y duraciones
├── database.sql                   # Definición de DDL, triggers y fixtures de base de datos
├── package.json
└── tsconfig.json
```

---

## 5. ESTADO ACTUAL Y OPTIMIZACIONES RECIENTES (COMMIT 22dd956)

El proyecto cuenta con las siguientes optimizaciones de alto rendimiento recién implementadas y verificadas:
1. **Patrón Singleton en Supabase:** [`lib/supabase.ts`] previene fuga de conexiones y sockets colgados ante hot-reloading de Turbopack.
2. **Consultas Optimizadas:** [`api/ventas/route.ts`] consulta un subset estricto de 12 campos (eliminando `SELECT *`) y retorna encabezados `Cache-Control: s-maxage=30, stale-while-revalidate=60`.
3. **Cancelación Asíncrona (AbortController):** Presente en [`app/page.tsx`] y [`app/historial/page.tsx`] para abortar solicitudes de red pendientes al navegar o cambiar de mes rápidamente, previniendo condiciones de carrera y fugas de memoria.
4. **Memoización React (useMemo):** Cálculos de ratios, métricas diarias, bono estimado y datos de gráficos memoizados para evitar recálculos en re-renders.
5. **Code Splitting Dinámico:** `xlsx` (~500 KB) se carga exclusivamente bajo demanda con `await import('xlsx')` cuando el usuario hace clic en "Exportar Excel".
6. **Fuentes no bloqueantes:** Precarga con `preconnect` y swap de CSS para Google Material Symbols, asegurando FCP óptimo.
7. **Resiliencia en OCR:** Reintento automático con backoff exponencial para absorber picos temporales HTTP 503/429 de la API de Google Gemini.
8. **Compilación Limpia:** 0 errores de TypeScript (`npx tsc --noEmit`) y build de producción Turbopack exitoso en ~8 segundos.

---

## 6. VARIABLES DE ENTORNO REQUERIDAS

```env
NEXT_PUBLIC_SUPABASE_URL=https://rpemltlwbjnjeskjwzgs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_BalNrlEEZXtvPvhQ6-pJ1g_8DsG3zsU
GEMINI_API_KEY=AQ.Ab8RN6IqiuHk6T0Tcy9JyY9ZNxsLSsNR29Yk7Tc4AdgeGYtRrQ
```

---

## 7. PAUTAS PARA CONTINUAR EL DESARROLLO

Cuando propongas nuevo código o refactorizaciones:
1. **Preserva la arquitectura App Router de Next.js**: No uses la carpeta `pages/`. Mantén los componentes de cliente con `'use client'` solo cuando manejen estado, hooks o eventos del navegador.
2. **Prioriza el rendimiento**: No introduzcas dependencias pesadas en el bundle principal. Usa dynamic imports si es necesario.
3. **Mantén el tipado estricto**: No uses `any` implícito ni ignores errores de TypeScript.
4. **Offline & Mobile-first**: La aplicación está pensada para usarse en teléfonos dentro de la sala de ventas; respeta el diseño responsivo, áreas de toque cómodas (min 44px) y compatibilidad con `localStorage`.
