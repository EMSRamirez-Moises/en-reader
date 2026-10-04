# Verificación de la entrega

`npm test`: 11 pruebas automatizadas aprobadas. `npm run build:css`: compilación aprobada con Tailwind 4.1.14. Revisiones de sintaxis de los módulos y servidor aprobadas.

## Cobertura

- Respuestas IA completas, conservación del original y rechazo de palabras modificadas u omitidas.
- División de textos largos sin pérdida de palabras.
- EPUB de prueba: container, OPF, metadata, spine, capítulos, párrafos y exclusión de scripts.
- EPUB inválido y límites de tamaño.
- Dos dispositivos simulados: modificaciones concurrentes, eliminación persistente y minutos sin duplicar reintentos.
- Copias corruptas rechazadas antes de escribir.
- Adaptadores Gemini y OpenAI con respuestas simuladas, claves en servidor y errores de cuota.
- Servidor HTTP real local: interfaz, autenticación, sincronización, bloqueo de origen externo y protección de `.env`.
- Interfaz en DOM simulado: muestra, pronunciación, significado, ocultación de ayudas, navegación, marcadores, continuidad al reabrir, texto pegado y reutilización de explicación guardada sin nueva llamada.

## Límites

No se realizaron llamadas pagadas a Gemini u OpenAI; no se proporcionaron claves. La conexión real debe comprobarse después de configurar las claves y modelos en el servidor.

La prueba de interfaz usa Happy DOM, no un navegador gráfico real. El diseño incluye reglas responsivas para móvil y escritorio, pero no se obtuvo verificación visual con capturas. No se probó con el EPUB personal del usuario ni con libros de todos los editores.

La sincronización se probó con dos estados contra el mismo almacenamiento, no con dos teléfonos reales. Para usarla fuera de localhost se necesita desplegar el servidor con HTTPS, contraseña y disco persistente. GitHub Pages no proporciona ese servidor.

Los cambios se preparan en una rama de revisión. La versión pública cambia después de incorporar los cambios a `main` y configurar Pages según README.

## Actualización del lector y pronunciación local

14 pruebas automatizadas pasan, incluidas pronunciación de oraciones sin solicitudes de IA, contracciones, palabras irregulares, aviso de entradas con variantes, conservación del texto y funcionamiento de las reglas cuando falla la conexión al diccionario. La prueba de interfaz comprueba la pronunciación local de un texto importado, la ayuda cerrada por defecto y apertura de los paneles de opciones y ayuda. La navegación inferior se fija mediante CSS con reserva de espacio y márgenes para la zona segura del móvil.
