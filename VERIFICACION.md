# Verificación de la entrega

`npm test`: 21 pruebas aprobadas. `npm run build:css`: compilación aprobada con Tailwind 4.1.14.

## Cobertura

- EPUB por orden spine, capítulos, conservación del texto, exclusión de scripts y errores de archivos inválidos.
- Pronunciación de frases sin IA, contracciones, variantes y reglas cuando falla el diccionario.
- Respuestas Gemini y OpenAI simuladas, conservación del original, caché y errores de proveedor.
- Servidor HTTP local: autenticación, sincronización, bloqueo de origen y protección de archivos de configuración.
- Apps Script con Drive, Sheets y servicios simulados: autenticación, límites, carpeta privada, revisiones, idempotencia y conflictos.
- Puente iframe: origen, canal y ventana verificados; contraseña fuera de la URL.
- Dos dispositivos Drive simulados: recuperación de avance y marcadores, conflictos con elección explícita, respuesta perdida sin duplicar escritura y edición local durante un guardado pendiente.
- EPUB reemplazado: ubicación anterior no se aplica al texto nuevo.
- Interfaz Happy DOM: lectura, navegación, marcadores, importación, pronunciación y explicación guardada; conexión Drive mediante mensajes simulados, tarjeta remota, apertura, guardado y cierre de sesión.

## Límites

No se realizaron llamadas pagadas a Gemini u OpenAI. No se probaron los libros personales ni un inicio de sesión real en la biblioteca privada: la contraseña se introduce directamente en la web por su propietario. Las pruebas de dos dispositivos son simuladas, no dos teléfonos físicos. Los cambios de interfaz se publican desde main; Apps Script se actualiza por separado en su editor.

La opción Drive sincroniza originales EPUB y avance/marcadores. Los libros importados directamente en el navegador, las ayudas de IA y las estadísticas diarias siguen siendo locales. Las cuotas y permisos de la cuenta de Google siguen aplicando.
