# Guía de uso

[Volver a la portada](../README.md)

## 1. Abre la aplicación y elige tu nombre

Entra en la [aplicación](https://pinwin-mu.vercel.app) y pulsa **Configurar nombre**. En el celular está en la parte superior; en escritorio, en la barra lateral.

Usa siempre el mismo nombre para consultar tus ventas. Puedes elegir el nombre que prefieras. Este nombre se guarda en el navegador: no es una cuenta con contraseña.

## 2. Registra una boleta

Entra en **Registrar Boleta** o pulsa el botón **+** en el celular. Puedes tomar una foto, subir un archivo o ingresar los datos manualmente.

Para facilitar la lectura, fotografía la boleta completa, con buena luz y sin reflejos. Revisa los datos antes de confirmar: la lectura automática puede equivocarse.

**Tomar foto** utiliza la cámara del teléfono; **Elegir imagen o PDF** abre tus archivos. La vista previa muestra la foto completa; **Ampliar foto** permite revisarla en un diálogo. Revisa la imagen y pulsa **Analizar boleta** para enviarla a la IA. Puedes cancelar o reintentar sin volver a elegir la foto. Se admiten fotos de hasta 24 MB, que se preparan localmente para enviar un máximo de 8 MB; los PDF deben pesar como máximo 8 MB. HEIC/HEIF requiere que el navegador pueda convertirlo: si falla, utiliza JPG o **Tomar foto**.

Presta atención al folio, la fecha, el precio del producto, el valor de la garantía y el total de la boleta. Selecciona el canal de venta, el tipo de producto y los años de garantía. Si corresponde a una venta por internet, revisa también el número de pedido.

## 3. Revisa tu rendimiento

El **Panel de Control** reúne las comisiones del mes, las garantías registradas, la distribución por canal y la actividad reciente. Puedes ajustar una meta mensual y usar el simulador para explorar escenarios.

Las proyecciones son estimaciones. La comisión de una venta registrada depende de las reglas configuradas en la base de datos; confirma los tramos con el responsable del negocio.

## 4. Consulta y exporta

En **Historial**, selecciona mes y año para consultar las ventas del nombre activo. El botón **Exportar Excel** permite descargar los registros mostrados.

Si no ves una venta, comprueba el nombre seleccionado, el período y la conexión antes de volver a registrarla.

## 5. Carga stock y consulta productos

En **Catálogo**, pulsa **Cargar Excel** y selecciona el informe XLSX original de existencias. Revisa tienda, fecha y cantidad de productos antes de guardar. Los encabezados repetidos, códigos alternativos y filas repartidas entre celdas se procesan automáticamente. Los PLU repetidos no suman unidades.

También se admiten informes separados en columnas. Si el archivo no trae Existencia física, ese dato aparece como no incluido; Disponible sigue siendo la cantidad usada. Los códigos alternativos sin PLU asociado se omiten con una advertencia, porque no se puede saber a qué producto corresponden. Los códigos internos se muestran con 13 dígitos, como `0200012345678`; la búsqueda acepta también `200012345678`. El PLU y el dígito final del código original no se modifican.

El catálogo utiliza **Disponible**, que puede diferir de Existencia. Dos o más unidades sugieren venta en sala; una unidad requiere confirmar su estado. Cero unidades invita a consultar una alternativa online, sin asegurar que exista stock web. Las cantidades negativas se marcan para revisión.

Usa los accesos por tipo de producto, área del informe, marca orientativa, precio o código. **Escanear producto para vender** abre la cámara y busca el código en el stock cargado. También puedes escribirlo manualmente. Consultar un producto no registra una venta.

Permite la cámara, centra todas las barras y espera la lectura automática. El lector usa detección nativa cuando está disponible y un lector compatible como alternativa. La luz y el acercamiento aparecen solo si el dispositivo los admite. Al salir de la aplicación se pausa la cámara; pulsa **Reintentar cámara** al volver. La lectura de códigos se realiza en el dispositivo. Para probar desde Android o iPhone, abre la dirección HTTPS publicada; `localhost` en el teléfono corresponde al propio teléfono.

Cada tipo tiene un icono genérico. En la ficha, **Obtener foto de referencia de ABC** intenta recuperar una foto que corresponda al PLU; si falla, se conserva el icono. La consulta no confirma características, disponibilidad online ni precio de garantía. El enlace permite comprobar esos datos en ABC.

El stock se guarda solo en este navegador, sin subir el archivo ni los costos internos. Al cargar un día posterior de la misma tienda se conserva la carga previa para comparar precios. No se permite sustituirla por una fecha anterior ni otra tienda. Conserva tus archivos originales como respaldo.

## 6. Registra comisiones por tarjetas

En **Inicio**, configura el monto por apertura y el **total** por apertura y activación. Registra cada tarjeta una sola vez y marca la activación únicamente cuando ambas acciones hayan ocurrido el mismo día. El total activado ya incluye la apertura: no se suman ambos importes completos.

Cada registro conserva las tarifas aplicadas aunque cambies los importes para tarjetas posteriores. El resumen y la exportación de tarjetas se filtran por mes. Los registros son locales al nombre y navegador activos; exporta el Excel para respaldarlos. No ingreses nombres, números de tarjeta ni datos de clientes.

## Si falla la conexión

La aplicación intenta conservar las ventas pendientes en el navegador del dispositivo para reintentarlas posteriormente. No borres sus datos hasta comprobar que las boletas aparecen en el historial.

La cola local no sustituye una copia de seguridad y no garantiza que puedas abrir toda la aplicación sin internet. Cambiar de navegador o dispositivo no traslada automáticamente los pendientes.

## Preguntas frecuentes

**¿Necesito crear una cuenta?** Actualmente se utiliza un nombre local. No hay una contraseña asociada a ese nombre.

**¿Por qué no veo mis ventas en otro celular?** Comprueba que usas exactamente el mismo nombre y período, y que las ventas se sincronizaron con la misma base de datos.

**¿La lectura automática es definitiva?** No. Corrige cualquier error en el formulario antes de confirmar.

**¿Qué hago si una boleta aparece como duplicada?** Busca su folio en el historial. No cambies el folio para eludir el aviso: podrías duplicar una venta.

**¿Dónde informo un problema?** Abre un [reporte](https://github.com/mashmellows172-cmd/track-retail/issues/new/choose) con pasos para reproducirlo y datos ficticios. Evita adjuntar boletas con datos personales.

Puedes consultar el estado de las mejoras de sincronización, validación y accesibilidad en el [PR #1](https://github.com/mashmellows172-cmd/track-retail/pull/1). La versión desplegada puede diferir de la rama que estás leyendo.

## Venta guiada desde un producto

Después de buscar o escanear un artículo, abre su ficha y baja hasta **Preparar esta venta**. Revisa unidades y fecha del stock. Ingresa el precio unitario real, cantidad, canal y valor de la garantía. Selecciona el tipo de producto y los años para usar las tablas existentes. La garantía ingresada se suma una sola vez al total de la propuesta; no se multiplica automáticamente por cantidad.

El panel calcula **precio unitario × cantidad + garantía** y la **comisión estimada de garantía**. No inventa comisión del producto ni consulta automáticamente precios o garantía en ABC. El informe no reserva unidades y no confirma disponibilidad online.

**Preparar registro** lleva los valores al formulario editable. La propuesta temporal permanece solo en la sesión del navegador y vence a los 15 minutos. Si hay un borrador anterior, puedes continuarlo o elegir expresamente la propuesta nueva. El folio y la fecha deben revisarse antes de **Confirmar Venta**. El PLU y nombre se muestran como referencia; todavía no se almacenan como detalle del artículo en la base de ventas.
