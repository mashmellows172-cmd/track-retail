# TrackRetail / BryanApp

Registro de boletas, seguimiento de garantías y estimación de comisiones para retail chileno. Next.js 16, React 19 y Supabase.

## Desarrollo

Usa Node.js 22 LTS o superior y npm.

```sh
npm ci
npm run dev
```

Crea `.env.local` con estos valores de tu proyecto, sin publicar claves en Git:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-publica
GEMINI_API_KEY=tu-clave-de-servidor
# Opcional: elegir explícitamente un modelo disponible en tu cuenta.
GEMINI_MODEL=gemini-flash-latest
```

`GEMINI_API_KEY` se usa únicamente en el servidor. Nunca uses una clave `service_role` de Supabase en variables `NEXT_PUBLIC_*`. La compilación y las pruebas no requieren credenciales reales. El escáner devuelve un error controlado si no hay clave; la entrada manual permanece disponible.

El esquema inicial y los tramos existentes están en `database.sql`. Ejecútalo únicamente al preparar una base nueva; no es una migración idempotente para una base existente. Los importes y reglas comerciales deben confirmarse con el responsable del negocio antes de cambiarse. La comisión definitiva la calcula el trigger de Supabase; los simuladores reproducen la tabla configurada.

## Validación

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
```

GitHub Actions ejecuta estas comprobaciones en cada push y pull request, con permisos de lectura y acciones fijadas a commits. Las pruebas usan respuestas simuladas en el límite de la base de datos; no escriben ventas reales.

## Funcionamiento y límites

- El nombre del vendedor se guarda localmente y filtra las ventas. **No es autenticación ni garantiza privacidad entre vendedores.** Se mantuvo este modelo por decisión del usuario. Antes de usar datos privados en un servicio público, implementar cuentas y políticas RLS; verificar las políticas del proyecto Supabase. Este repositorio no permite comprobar la configuración de una base remota.
- Las boletas pendientes se guardan en el navegador del dispositivo. Se reintentan al abrir la app, recuperar conexión o pulsar el botón de reintento. No borres los datos del navegador antes de sincronizar. No hay un service worker que garantice abrir toda la aplicación sin conexión.
- Una respuesta 409 conflictiva conserva la boleta pendiente. Reintentar exactamente una venta ya guardada devuelve el registro existente; diferencias de vendedor o contenido no se descartan.
- Las fechas de negocio se calculan para `America/Santiago`. Los montos son pesos enteros no negativos. Telefonía admite 1–2 años y líneas duras 1–4.
- El OCR acepta JPG, PNG, WebP y PDF de hasta 8 MB. La salida de IA se valida y siempre debe revisarse en el formulario; no garantiza que la lectura coincida con la boleta original.
- Los iconos SVG se incluyen con la aplicación. El zoom está permitido y la interfaz respeta preferencias de movimiento reducido.

## Dependencias

Next.js se actualizó a 16.4.2 siguiendo los [avisos oficiales de seguridad](https://nextjs.org/blog/nextjs-security-update-october-14-2026). SheetJS 0.20.3 proviene del [CDN oficial del proyecto](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/), porque el paquete `xlsx` del registro npm permanece en una versión antigua.

La auditoría del 22 de octubre de 2026 no detectó vulnerabilidades en dependencias de producción. Quedan cinco alertas altas de desarrollo en la cadena `eslint-config-next → fast-glob → micromatch → braces`. npm solo propone una degradación incompatible del framework de lint; no se aplicó `--force`. Revisar actualizaciones de esa cadena periódicamente. La ausencia de alertas no equivale a una auditoría completa de seguridad.
