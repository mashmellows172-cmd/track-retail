# Configuración para desarrollo

[Volver a la portada](../README.md)

## Requisitos

- Node.js 22 LTS y npm.
- Un proyecto de Supabase para almacenar ventas y calcular comisiones.
- La lectura local no requiere claves. Solo la nube opcional necesita una clave de Gemini, Qwen, DeepSeek o Grok.

## Instalación

```sh
git clone https://github.com/mashmellows172-cmd/track-retail.git
cd track-retail
npm ci
```

Si el repositorio solicita acceso, inicia sesión con una cuenta de GitHub autorizada.

## Variables de entorno

Crea `.env.local` en la raíz, junto a `package.json`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-publica
GEMINI_API_KEY=tu-clave-de-servidor
```

Las dos variables `NEXT_PUBLIC_*` son públicas. Nunca pongas una clave `service_role` en ellas. `GEMINI_API_KEY` debe permanecer en el servidor. No publiques `.env.local`, capturas de claves ni secretos en issues o pull requests.

La [guía de lectura de boletas](LECTURA_BOLETAS.md) explica proveedores, respaldo automático, variables y evaluación. Sin claves alternativas, Gemini sigue siendo el único servicio disponible.

## Base de datos

El archivo [database.sql](../database.sql) contiene las tablas, los tramos y el trigger que calcula las comisiones. Revísalo antes de ejecutarlo en una base nueva.

No es una migración para una base ya existente. Respalda los datos y prepara una migración específica si necesitas modificar una instalación en uso. Verifica las políticas RLS y los permisos de Supabase; usar una clave pública no garantiza por sí solo que los datos estén protegidos.

## Ejecutar

```sh
npm run dev
```

Abre [localhost:3000](http://localhost:3000). Si cambias `.env.local`, reinicia el servidor.

Para preparar y ejecutar una compilación de producción:

```sh
npm run build
npm run start
```

En el alojamiento también debes configurar las variables de entorno. Cambiar archivos en GitHub no demuestra que el despliegue haya terminado ni que use la rama correcta.

## Comprobaciones básicas

```sh
npm run lint
npm run build
```

El [PR #1](https://github.com/mashmellows172-cmd/track-retail/pull/1) incorpora pruebas automatizadas, comprobación de tipos, CI y actualizaciones de dependencias. Si tu rama incluye los scripts `test` y `typecheck` en `package.json`, ejecuta también `npm test` y `npm run typecheck`.

## Solución de problemas

| Problema | Qué revisar |
| --- | --- |
| Supabase no inicia o no carga ventas | URL, clave pública, tablas y políticas RLS. |
| El escáner devuelve un error | Clave de Gemini, disponibilidad del modelo y cuota del proveedor. Puedes usar el ingreso manual. |
| No aparecen registros | Nombre activo, mes, año y conexión a la base correcta. |
| Las variables nuevas no se aplican | Reinicia el servidor local o vuelve a desplegar el entorno correspondiente. |

Antes de exponer una instalación públicamente, revisa [seguridad](../SECURITY.md) y las actualizaciones pendientes.
