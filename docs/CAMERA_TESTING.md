# Protocolo de pruebas de cámara

## Objetivo
Registrar pruebas manuales de lectura de cámara en dispositivos reales.

## Dispositivos a probar
- Android 1
- Android 2
- iPhone 1
- iPhone 2

## Navegadores
- Chrome (Android)
- Safari (iPhone)
- Edge/Firefox/Otros según disponibilidad

## Procedimiento
1. En `/pruebas`, seleccionar Dispositivo, Navegador, Tipo (`barcode` o `receipt`).
2. Presionar "Iniciar prueba". El temporizador queda en `sessionStorage` y sobrevive al cambio de ruta (incluye metadatos de dispositivo/navegador).
3. Seguir el enlace a `/catalogo` o `/registro` y realizar la lectura con la cámara.
4. Volver a `/pruebas` y presionar "Legible" o "Fallido". El tiempo se valida antes de registrar. El valor es tiempo manual de ida/vuelta e inspección/revisión (autoinformado), no solo latencia del decodificador.
5. Repetir según el plan.

## Reglas
- Solo se guardan enums permitidos: `device` (Android|iPhone), `browser` (Chrome|Safari|Edge|Firefox|Other), `kind` (barcode|receipt), `status` (readable|failed), `elapsedMs` (entero 0..600000), `timestamp` (ISO).
- Se almacenan hasta 100 registros en `localStorage` (`trackretail_camera_trials_v1`).
- El temporizador activo está en `sessionStorage` (`trackretail_camera_trial_timer_v1`), se rechaza si es malformado, pasado (stale) o futuro.
- No se guarda foto/código/texto/vendedor.
- Los resultados son autoinformados por el usuario.

## Estado
- Pruebas en dispositivos reales: pendientes.
- Esta implementación registra datos agregables sin datos sensibles.
