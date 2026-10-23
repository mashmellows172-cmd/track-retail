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
3. Si hace falta, abre **Ajustar foto** para recortar los bordes, girar 90° o cambiar el contraste. Aplica los ajustes para ver la vista previa real de la imagen preparada.
4. Inicia el análisis. La primera carga puede tardar más; se muestra el progreso informado por el motor.
5. Revisa cada campo, sus avisos y, si lo necesitas, **Ver origen**. Completa los campos pendientes antes de confirmar la venta.

Puedes cancelar y reintentar sin volver a elegir la foto. El lector local trabaja con imágenes; para un PDF, utiliza una foto o el ingreso manual. La nube opcional requiere configuración y una elección explícita.

## Ajustes de la foto

- **Ajustar foto** es un panel desplegable del modo local. Los cuatro bordes se expresan en porcentajes de la foto original y se aplican antes de girarla.
- **Girar 90°** rota la imagen preparada. **Restaurar original** vuelve al recorte completo, sin giro y sin contraste.
- **Original** conserva los colores tal como se capturaron; **Mejorar contraste** aplica una mejora suave pensada para texto impreso. El archivo original nunca se modifica.
- **Aplicar ajustes** genera la imagen preparada y muestra una vista previa real. Esa misma imagen es la que se analiza: no se vuelve a recortar, girar ni mejorar entre la vista previa y el OCR.
- Los controles no preparan la imagen mientras se mueven; la preparación ocurre al aplicar o al analizar. Si cambias un ajuste después de leer la boleta, el resultado anterior se descarta y debes analizar de nuevo.
- Al elegir otra foto se restablecen los ajustes y se descartan los resultados. Cancelar también aborta la lectura y libera la vista previa preparada.
- El modo **Nube (opcional)** envía el flujo de la foto original y no aplica recortes, giros ni contraste locales. Si necesitas esos ajustes, usa el modo local.
- En el resultado local, **Texto leído sin corregir · Ver transcripción completa** muestra el texto crudo del motor para revisar datos que no se asignaron a un campo. Solo existe en la memoria de esta pantalla: no se envía a la nube, analítica, registros ni almacenamiento, y no se ofrece para compartir externamente.

## Precisión

Se prioriza dejar un campo pendiente antes que inventarlo. El motor puede equivocarse con fotos borrosas, impresiones desvanecidas, varias líneas de productos o formatos desconocidos. Los números de tarjeta, RUT, códigos de barras, IVA y subtotal no deben utilizarse como precio o total de venta.

Confirma especialmente precio unitario, unidades, garantía y total. La comisión depende también del tipo de producto y los años de garantía, que debes verificar. Los años de garantía solo se muestran cuando la boleta los indica de forma explícita; el tipo de garantía no se infiere automáticamente. La confianza del OCR no representa un porcentaje garantizado de exactitud financiera.

La lectura no guarda la venta ni la envía automáticamente. Debes revisar los campos y confirmar en el formulario. «Ver origen» muestra la línea de texto reconocida; si además aparece una marca sobre la imagen preparada, usa solo coordenadas entregadas por el motor para esa misma imagen y puede no ser exacta.

## Desarrollo

`npm run ocr:assets` genera los recursos locales a partir de paquetes fijados en el lockfile. También se ejecuta antes de desarrollo y compilación. Los archivos generados de `public/ocr` no se suben a Git; el despliegue los vuelve a crear. Las licencias y el manifiesto de recursos se distribuyen junto al motor.

Las pruebas con boletas ficticias comprueban el funcionamiento técnico; no equivalen a una evaluación con todos los teléfonos o formatos de tienda.

[Proyecto oficial de Tesseract.js](https://github.com/naptha/tesseract.js)
