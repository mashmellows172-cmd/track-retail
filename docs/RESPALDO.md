# Respaldo local

[Volver a la guía de uso](GUIA_DE_USO.md) · [Portada](../README.md)

La página **Respaldo local** (`/respaldo`) permite descargar un archivo JSON con los datos que este navegador guarda para el vendedor activo, revisarlo y restaurarlo sin enviar ventas al servidor.

No es una copia completa de la aplicación. Es una copia de los datos locales que el navegador puede leer con seguridad.

## Qué incluye

- **Tarjetas del vendedor activo:** aperturas y activaciones registradas por ese nombre.
- **Preferencias permitidas:** tema visual y vista del historial. No se exportan claves arbitrarias.
- **Borrador de venta:** el formulario incompleto de la sesión actual, si existe.
- **Ventas pendientes del vendedor activo:** se incluyen **solo para recuperación**. No se agregan a la cola activa ni se envían automáticamente al restaurar.

Cada archivo indica su versión, el vendedor, la fecha de exportación y un conteo de los datos incluidos. Si una cola o un registro local está dañado, la exportación se detiene para no ocultar información.

## Qué no incluye

- **Historial de ventas del servidor.** Para conservarlo, usa **Exportar Excel** en Historial.
- **Stock del catálogo, fotos, precios o el archivo de stock.** El stock se recupera volviendo a cargar el archivo original (XLSX o CSV) en Catálogo.
- **Datos de otros vendedores.**
- **Claves de almacenamiento fuera de la lista permitida**, credenciales o datos de configuración.
- **La cola activa como copia restaurable.** Las ventas pendientes del archivo son un registro de recuperación; no se restauran ni se sincronizan solas.

## Exportar

1. Configura tu nombre en la barra superior.
2. Abre **Respaldo local**.
3. Revisa el resumen de datos incluidos y pulsa **Descargar respaldo JSON**.
4. Guarda el archivo en un lugar seguro.

La fecha de **último inicio de descarga** es informativa: se registra cuando empieza la descarga, no cuando el archivo queda guardado. Comprueba que el archivo exista antes de borrar datos del navegador.

El archivo puede contener ventas pendientes y un borrador. Protégelo y no lo compartas con personas que no deban ver esa información.

## Revisar y restaurar

1. Abre **Respaldo local** con el mismo nombre de vendedor del archivo.
2. Elige el archivo JSON. Se valida su tamaño, versión, estructura y vendedor.
3. Revisa la vista previa: tarjetas nuevas, tarjetas que ya existen, preferencias nuevas, ventas pendientes de recuperación y omisiones.
4. Pulsa **Confirmar restauración**.

La restauración:

- Valida todo el archivo antes de escribir.
- Combina las tarjetas **por ID**. Si el ID ya existe, conserva el registro actual y no lo sobrescribe.
- No reemplaza preferencias que ya estén configuradas.
- No reemplaza un borrador existente. Si restaura uno, queda disponible solo en la sesión actual y no se activa automáticamente.
- **Nunca restaura la cola pendiente ni envía ventas.** Las ventas pendientes del archivo solo sirven como referencia de recuperación.
- Usa bloqueos del navegador para combinar tarjetas entre ventanas. Si el navegador no admite Web Locks, se detiene sin escribir.
- Vuelve a comprobar el vendedor activo antes de cada escritura. Si cambia durante la restauración, se detiene.
- Si una escritura falla, intenta revertir solo los valores que la restauración alcanzó a escribir y que nadie más cambió mientras tanto. Los valores modificados por otra ventana se conservan.

Si el archivo no pertenece al vendedor activo, supera 5 MB, tiene una fecha o un monto imposible o incluye registros malformados, no se modifica nada.

## Cuándo usarlo

- Antes de cambiar de navegador, equipo o perfil del navegador.
- Antes de borrar datos del navegador.
- Como copia adicional de tarjetas, preferencias y borrador.

Para conservar el historial de ventas, exporta también el Excel desde Historial. Para conservar el stock, mantén el archivo original (XLSX o CSV). Un respaldo local no reemplaza esos archivos ni el historial del servidor.

## Problemas frecuentes

**El archivo no coincide con mi nombre.** El respaldo está asociado al vendedor activo. Cambia el nombre en la barra superior y vuelve a intentarlo; no edites el archivo para forzarlo.

**No puedo restaurar y el navegador no admite bloqueos.** Actualiza Chrome, Edge o Safari. La restauración no escribe si no puede proteger la operación entre ventanas.

**Algunas preferencias no se restauraron.** Puede que ya estuvieran configuradas en este navegador. Se conserva el valor actual.

**El borrador no se restauró.** Ya existe un borrador en esta sesión y se conservó el actual. Si el archivo trae uno, también puede haber sido omitido por tener datos inválidos.

**Necesito recuperar ventas pendientes.** Revisa el contenido del archivo y compáralo con el historial. La aplicación no las vuelve a encolar ni las envía automáticamente.

**Quiero revisar el historial completo.** Abre **Historial**, elige el período y usa **Exportar Excel**.
