# Lectura de boletas: motor local y nube opcional

## Modo predeterminado gratuito

La lectura predeterminada utiliza Tesseract.js en el navegador, sin claves ni costo por llamada API. La foto permanece en el dispositivo. Consulta la [guía de lectura local](LECTURA_LOCAL.md). No existe cambio automático a la nube si falla: debes elegirla expresamente.

## Evaluación de la nube opcional

El error recurrente «servidores saturados» corresponde a disponibilidad del proveedor. Cambiar el encuadre no soluciona ese error. El motor admite proveedores independientes y un respaldo secuencial: primero intenta uno y solo envía al segundo si falla o devuelve datos inválidos. Máximo dos llamadas, 22 segundos por proveedor, cancelación conectada y revisión humana antes de guardar.

Recomendación provisional: **Qwen3-VL-Flash como candidato principal y DeepSeek Flash como respaldo**. No es una clasificación de precisión medida: faltan claves y una muestra representativa. Gemini se conserva para instalaciones existentes y PDF. Grok está integrado como candidato adicional.

| Candidato | Capacidad verificada | Uso propuesto |
| --- | --- | --- |
| Qwen3-VL-Flash | Imágenes y salida JSON sin razonamiento extendido | Primera prueba para extraer campos directamente en una llamada. |
| Qwen-OCR | Extracción especializada de texto y documentos, incluidas boletas | Comparar posteriormente si el modelo visual general falla; no activado en este adaptador. |
| DeepSeek Flash | Entrada de imagen y JSON; razonamiento desactivable | Respaldo independiente para fotos. |
| Grok 4.7 | Comprensión de imágenes JPEG/PNG | Candidato opcional; WebP y PDF se excluyen antes del envío. |
| Gemini | Flujo existente de imagen/PDF | Conserva compatibilidad; no se insiste dos veces ante saturación. |

Un modelo OCR seguido por otro modelo de texto implica dos llamadas incluso en casos normales. Se prefiere extracción visual directa con respaldo solo cuando hace falta. No se han medido todavía latencia, costo por boleta ni exactitud en boletas chilenas reales. Las tarifas y cuotas se deben consultar en la cuenta y región elegidas antes de activar el servicio.

## Activación

Añade claves como variables **del servidor** en Vercel, nunca con prefijo `NEXT_PUBLIC_` ni en el chat. Una suscripción a un chatbot no equivale a una clave API.

```dotenv
# Orden explícito; se omiten proveedores sin clave.
OCR_PROVIDERS=qwen,deepseek,gemini
QWEN_API_KEY=clave-de-model-studio-region-singapur
QWEN_MODEL=qwen3-vl-flash
DEEPSEEK_API_KEY=clave-de-deepseek
DEEPSEEK_MODEL=deepseek-flash
# Opcionales:
GEMINI_API_KEY=clave-existente
GEMINI_MODEL=gemini-flash-latest
XAI_API_KEY=clave-de-xai
GROK_MODEL=grok-4.7
```

Sin `OCR_PROVIDERS`, el orden es `qwen,deepseek,gemini,grok`, siempre omitiendo claves ausentes. Si solo existe Gemini, sigue siendo el único motor: el código no evita su saturación ni crea créditos. Después de cambiar variables, vuelve a desplegar. Qwen utiliza el endpoint internacional de Singapur: una clave de otra región no es intercambiable. Los destinos están fijados en servidor y no aceptan URLs de proveedor desde el navegador.

PDF utiliza solamente Gemini. Para probar alternativas, toma una foto JPG/PNG de la boleta. Grok solicita `store:false`; esto no sustituye las políticas de tratamiento de datos del proveedor. El segundo proveedor también recibe la foto cuando se activa el respaldo: elige el orden según tus requisitos de datos y disponibilidad.

## Prueba para elegir ganador

1. Preparar al menos 20 boletas anonimizadas con diferentes formatos, garantías, canal web, reflejos y orientación. Guardar manualmente los valores correctos de los ocho campos.
2. Configurar un único proveedor por ronda para que el respaldo no esconda errores. Utilizar las mismas imágenes para todos.
3. Medir tiempo total y percentil 95, porcentaje de fallos y exactitud por campo. Dar prioridad a folio, fecha y montos; un JSON válido no garantiza una lectura correcta.
4. Calcular costo real por boleta desde el uso facturado, incluida la imagen. Comparar además la proporción de fotos que necesitan reintento.
5. Activar el mejor candidato y repetir con el respaldo. Mantener siempre la confirmación del usuario: no sumar automáticamente importes dudosos ni resolver discrepancias por mayoría entre modelos.

Las pruebas automatizadas actuales simulan respuestas: cubren saturación, respaldo, cancelación, formatos y validación. No demuestran velocidad ni precisión de servicios externos.

## Fuentes oficiales consultadas (22 octubre 2026)

- [Qwen Vision y regiones](https://www.alibabacloud.com/help/en/model-studio/qwen-vl-compatible-with-openai)
- [Qwen y salida JSON](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)
- [Qwen-OCR](https://help.aliyun.com/en/model-studio/qwen-vl-ocr)
- [DeepSeek Vision](https://api-docs.deepseek.com/guides/vision/)
- [DeepSeek JSON](https://api-docs.deepseek.com/guides/json_mode/)
- [DeepSeek: desactivar razonamiento](https://api-docs.deepseek.com/guides/thinking_mode/)
- [Grok: imágenes y formatos](https://docs.x.ai/developers/model-capabilities/images/understanding)

## Comparación local reproducible

El script `scripts/benchmark-ocr.cjs` permite medir cada proveedor por separado, sin respaldo que oculte fallos. Requiere Node, dependencias de desarrollo y variables API exportadas en el proceso. No carga archivos de credenciales ni imprime contenido de boletas. **Sí envía las fotos a cada proveedor configurado y puede generar cargos** al ejecutarlo con confirmación explícita.

Guarda un `manifest.json` fuera del repositorio, con fotos anonimizadas en la misma carpeta:

```json
[
  {
    "image": "ejemplo.jpg",
    "expected": {
      "folio": "12345678",
      "fecha_compra": "2026-10-23",
      "precio_producto": 10000,
      "cantidad_unidades": 1,
      "valor_garantia": 5000,
      "total_boleta": 15000,
      "canal": "caja",
      "numero_pedido": null
    }
  }
]
```

Ejecuta desde el proyecto:

```sh
node --require ./tests/register.cjs scripts/benchmark-ocr.cjs /ruta/manifest.json --confirm-anonymized
```

Admite 1–50 fotos JPG/PNG de hasta 4 MB. Valida la lista completa antes de llamar servicios. Produce una línea por proveedor con errores, exactitud de campos, mediana y percentil 95 de tiempo. Los intentos fallidos cuentan como campos incorrectos. No mide costo: consulta la facturación del proveedor. No se han ejecutado comparaciones externas sin claves ni fotos anonimizadas seleccionadas para esa prueba.

La pantalla de captura muestra la configuración del lector y si hay respaldo para JPG/PNG. Esto no es una prueba en vivo de disponibilidad; un servicio configurado puede estar saturado.
