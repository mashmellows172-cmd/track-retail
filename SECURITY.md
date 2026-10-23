# Seguridad y tratamiento de datos

## Modelo actual

TrackRetail utiliza un nombre guardado en el navegador para seleccionar al vendedor. **Ese nombre no es autenticación y no garantiza privacidad entre vendedores.** Antes de usar datos privados en una instalación pública, hacen falta controles de acceso y políticas RLS adecuadas en Supabase.

Las ventas registradas se almacenan en Supabase; los pendientes y preferencias pueden guardarse en el navegador. No borres los datos locales hasta confirmar la sincronización. La cola local no sustituye una copia de seguridad.

## Credenciales y boletas

La lectura local predeterminada procesa fotos en el navegador y descarga solo el motor y su idioma desde la aplicación. No envía fotos ni texto al servicio de IA. Si eliges la nube, la foto sí se envía al servidor y a los proveedores configurados; un respaldo puede enviarla a un segundo proveedor. Revisa sus condiciones de datos. La nube no se activa automáticamente por un fallo local.

- Mantén `GEMINI_API_KEY` únicamente en el servidor.
- Nunca publiques claves `service_role` ni las uses en variables `NEXT_PUBLIC_*`.
- No adjuntes boletas reales, datos personales ni secretos a reportes de errores.
- Si una clave se expone, revócala en su proveedor y reemplázala en el entorno afectado.

## Actualizaciones

El [PR #1](https://github.com/mashmellows172-cmd/track-retail/pull/1) incluye actualizaciones de dependencias, validaciones y mejoras de sincronización. Comprueba su estado de integración y la versión desplegada antes de considerar esos cambios disponibles.

## Informar una vulnerabilidad

Contacta al mantenedor mediante un canal privado acordado antes de compartir detalles sensibles. No publiques instrucciones de explotación acompañadas de datos reales ni credenciales. Para errores funcionales sin información sensible, utiliza las plantillas de issues.
