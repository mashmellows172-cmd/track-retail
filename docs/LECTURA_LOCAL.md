# Lectura local gratuita de boletas

El modo predeterminado utiliza **Tesseract.js**, un motor OCR neuronal de código abierto. Reconoce texto impreso en español y aplica reglas conservadoras para separar los campos de la boleta. No es un chatbot ni sustituye tu revisión.

## Costo y privacidad

- No necesita claves API, suscripciones ni pago por lectura.
- La foto se procesa en el navegador. El modo local no envía la foto ni el texto a un proveedor de IA.
- La primera lectura descarga el motor y el idioma desde la propia aplicación. Ese tráfico utiliza tu conexión; la app y su alojamiento mantienen sus límites habituales.
- Los recursos del motor pueden guardarse en la caché del navegador. Esto no garantiza abrir toda la aplicación sin conexión.
- Elegir el modo de nube es una decisión separada: puede tener cuotas o costos. No se activa automáticamente cuando falla el modo local.

## Uso

1. Abre **Registrar**, conserva seleccionado el modo local y toma una foto o elige una imagen.
2. Revisa que se vea toda la boleta, con letras enfocadas y sin reflejos.
3. Inicia el análisis. La primera carga puede tardar más; se muestra el progreso informado por el motor.
4. Revisa los resultados y completa los campos pendientes antes de confirmar la venta.

Puedes cancelar y reintentar sin volver a elegir la foto. El lector local trabaja con imágenes; para un PDF, utiliza una foto o el ingreso manual. La nube opcional requiere configuración y una elección explícita.

## Precisión

Se prioriza dejar un campo pendiente antes que inventarlo. El motor puede equivocarse con fotos borrosas, impresiones desvanecidas, varias líneas de productos o formatos desconocidos. Los números de tarjeta, RUT, códigos de barras, IVA y subtotal no deben utilizarse como precio o total de venta.

Confirma especialmente precio unitario, unidades, garantía y total. La comisión depende también del tipo de producto y los años de garantía, que debes verificar. La confianza del OCR no representa un porcentaje garantizado de exactitud financiera.

## Desarrollo

`npm run ocr:assets` genera los recursos locales a partir de paquetes fijados en el lockfile. También se ejecuta antes de desarrollo y compilación. Los archivos generados de `public/ocr` no se suben a Git; el despliegue los vuelve a crear. Las licencias y el manifiesto de recursos se distribuyen junto al motor.

Las pruebas con boletas ficticias comprueban el funcionamiento técnico; no equivalen a una evaluación con todos los teléfonos o formatos de tienda.

[Proyecto oficial de Tesseract.js](https://github.com/naptha/tesseract.js)
