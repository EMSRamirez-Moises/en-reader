# Entre líneas — lectura de libros en inglés

Un lector para adultos hispanohablantes que quieren comprender libros en inglés. El centro de la experiencia es la historia, con ayuda por fragmentos completos, pronunciación estadounidense aproximada escrita con caracteres hispanos, pistas y significado contextual. Sin ejercicios infantiles ni aprendizaje palabra por palabra.

## Empezar en tu computadora

Necesitas Node.js 22 o posterior; se recomienda Node.js 24.

1. Descomprime el proyecto y abre una terminal en su carpeta.
2. Copia `.env.example` a `.env`.
3. Coloca la clave de Gemini, de OpenAI o ambas en `.env`. Puedes empezar sin claves con la lectura de muestra.
4. Para sincronizar, define también una contraseña larga en `APP_PASSWORD`.
5. Ejecuta `npm start` y abre `http://127.0.0.1:3000`.

La aplicación entregada incluye el CSS compilado y JSZip local: **no necesitas instalar paquetes para ejecutar el lector**. `npm install` solo hace falta para editar/recompilar Tailwind o ejecutar las pruebas.

Dentro de Ajustes selecciona el proveedor, escribe la contraseña del servidor y activa sincronización si la necesitas. La contraseña conecta la sesión; las claves de IA nunca se escriben en la página ni en localStorage. El token de sesión se conserva en sessionStorage y caduca después de 12 horas o al reiniciar el servidor.

## Tu repositorio y GitHub Pages

Se ha preparado para el repositorio `en-reader` y rutas relativas: funcionará bajo `/en-reader/` sin cambiar el código. El proyecto se incorpora en una rama de revisión de ese mismo repositorio. El `index.html` raíz redirige a `public/` para conservar compatibilidad con Pages publicado desde una rama; el flujo de Actions publica directamente `public/`.

**El flujo automático publica la interfaz en Pages cuando haces push a main.** Si todavía no quieres desplegar, no incluyas `.github/workflows/pages.yml` hasta que estés listo. No se ha publicado ni modificado tu repositorio desde esta entrega.

En GitHub abre Settings → Pages → Source → GitHub Actions. La tarea incluida verifica las pruebas, recompila Tailwind y publica únicamente `public/`. También puedes alojar manualmente el contenido de `public/` como una web estática. Conserva las carpetas `js/` y `vendor/` junto a `index.html`.

**Pages solo ejecuta la interfaz.** La IA y la sincronización necesitan el servidor Node incluido. Despliégalo en un alojamiento con HTTPS y disco persistente. Puedes usar el Dockerfile, con `/data` conectado a un volumen persistente, o iniciar `node server.mjs` con las variables de entorno configuradas por tu proveedor.

En ese servidor configura:

```env
HOST=0.0.0.0
APP_PASSWORD=tu-contraseña-larga
GEMINI_API_KEY=tu-clave-de-gemini
OPENAI_API_KEY=tu-clave-de-openai
ALLOWED_ORIGINS=https://emsramirez-moises.github.io
DATA_DIR=/ruta/con/disco/persistente
```

`ALLOWED_ORIGINS` lleva el origen de Pages sin `/en-reader/`. En Ajustes del lector pon la dirección HTTPS de tu servidor, por ejemplo `https://tu-servidor.example`, y la contraseña. Usa exactamente el mismo servidor y contraseña en cada dispositivo.

Nunca subas `.env`, `.data/` o claves a GitHub. La carpeta `.data` contiene los libros sincronizados y debe tener copias de seguridad privadas. El servidor admite una biblioteca personal con una contraseña común; no implementa cuentas independientes para múltiples usuarios.

## Continuar en otro dispositivo

- Abre la misma interfaz en el dispositivo nuevo.
- En Ajustes conecta la misma dirección del servidor y contraseña.
- Activa “Sincronizar mis lecturas entre dispositivos”.
- La biblioteca se recupera al conectar; el intercambio se repite cada 30 segundos mientras la página está visible, al recuperar conexión y al volver a la biblioteca.
- El avance se conserva al cambiar de pasaje. Si lees en dos dispositivos a la vez, se conserva el avance con la fecha de modificación más reciente; mantén los relojes de los dispositivos correctos. El pasaje abierto no salta mientras lees: vuelve a la biblioteca y abre el libro para recuperar el avance remoto.
- Las eliminaciones se propagan entre dispositivos. Exporta una copia antes de eliminar una lectura que quieras conservar.
- Si no quieres enviar tus libros al servidor, deja desactivada la sincronización y usa “Exportar copia” / “Restaurar copia” para trasladarlos manualmente.

Conservar una copia local permite seguir leyendo cuando la conexión se pierde **con la página ya cargada**. Esta versión no instala un service worker: no promete abrir una página nueva sin internet. Las explicaciones ya descargadas quedan disponibles en IndexedDB. Los libros sincronizados pueden ocupar hasta 100 MB en el servidor; las solicitudes de copia tienen un límite de 30 MB.

## Cómo leer

1. Añade un EPUB sin DRM, un TXT o un texto pegado. Los EPUB se procesan localmente en el orden de su índice de lectura (spine).
2. Lee el pasaje y su contexto. Puedes pasar de sección, cambiar el tamaño o usar lectura continua.
3. Pulsa “Acompañar este pasaje”. Se envían exclusivamente el pasaje elegido (máximo 6000 caracteres) y hasta 2500 caracteres anteriores a la IA seleccionada.
4. La IA conserva el texto original y lo divide en fragmentos con sentido. Si cambia u omite palabras, se rechaza la respuesta y el original sigue visible.
5. La pronunciación aproximada queda debajo de cada fragmento en un tono discreto. Puedes ocultarla. Toca un fragmento y pide una pista o muestra su significado.
6. Guarda un marcador y continúa. Los minutos se cuentan mientras la pestaña está visible y has interactuado en los últimos 90 segundos; es una estimación de lectura activa, no una evaluación.

Los nombres de las secciones se obtienen de encabezados del contenido, no siempre del índice comercial del editor. Las secciones no legibles se notifican. Los EPUB de imágenes o con DRM no se pueden decodificar. Límites: EPUB 30 MB; texto extraído 20 MB; ayudas locales 250, sincronizadas 500. TXT y texto pegado se separan por líneas vacías para conservar párrafos; los párrafos demasiado largos se dividen para poder analizarlos.

## IA y costes

Ambos adaptadores realizan llamadas REST desde el servidor: OpenAI Responses API con JSON Schema y Gemini Generate Content con JSON estructurado. Modelos configurables mediante `OPENAI_MODEL` y `GEMINI_MODEL`; los predeterminados son `gpt-5.4-mini` y `gemini-3.8-flash`. Su disponibilidad depende de tu cuenta.

La suscripción de ChatGPT no incluye automáticamente consumo de la API. Esta versión no contiene el flujo “Continuar con ChatGPT”; utiliza las APIs mediante claves. No hay solicitudes automáticas de IA al pasar de página ni cambios automáticos de proveedor. Una explicación guardada se reutiliza sin otra llamada; volver a generarla pide confirmación. Consulta el uso y saldo en el panel de tu proveedor.

La sincronización implica enviar los libros al servidor privado. Las llamadas de IA envían texto al proveedor elegido incluso si no activaste sincronización. La pronunciación con letras españolas es una aproximación: no sustituye un modelo sonoro exacto ni representa todos los sonidos del inglés.

## Tecnología y mantenimiento

- Tailwind CSS 4.1.14 compilado en `public/app.css`, sin CDN de producción.
- JavaScript en módulos: interfaz, EPUB, almacenamiento, contrato de IA y muestra.
- IndexedDB para libros, marcadores, progreso y explicaciones.
- Node.js nativo para el servidor HTTP y adaptadores IA, sin dependencias de producción.
- Sincronización privada en disco mediante JSON y reemplazo atómico; modificaciones se serializan y los registros se combinan por fecha. Contadores de minutos por dispositivo se combinan sin duplicar reintentos.
- JSZip 3.10.1 incluido localmente bajo su licencia MIT; EPUB se interpreta desde su container, OPF, manifest y spine. No depende de la carga de ePub.js.

Para modificar el diseño:

```bash
npm install
npm run build:css
npm test
npm run dev
```

Archivos principales:

```text
public/index.html        Interfaz
public/js/app.js         Lectura, selección, conexión y sincronización
public/js/epub.js        Importación EPUB y texto
public/js/storage.js     Persistencia IndexedDB
public/js/analysis.js    Prompt, esquema y validación
public/js/demo.js        Relato original y ayudas de prueba
src/styles.css          Tailwind y diseño del lector
server.mjs              HTTP, autenticación y proveedores IA
sync-store.mjs          Persistencia y combinación entre dispositivos
.github/workflows/      Publicación de la interfaz en Pages
```

## Verificación

Las pruebas usan pasajes, archivos EPUB creados para verificación y respuestas simuladas para revisar la extracción, la integridad de las explicaciones, el intercambio con ambos proveedores y la sincronización. No consumen crédito de IA. Consulta `VERIFICACION.md` para los resultados de esta entrega y sus límites.

## Lectura sin distracciones y pronunciación sin IA

El lector muestra una columna centrada y mantiene Anterior/Siguiente en una barra fija inferior, también en móvil. Las flechas del teclado permiten avanzar. Biblioteca y Opciones están en la cabecera; capítulos, tamaño, pronunciación y marcadores se consultan dentro de Opciones. La explicación de IA se abre con Ayuda o al tocar una frase y nunca ocupa una columna permanente.

La pronunciación aparece bajo frases o cláusulas completas aunque no haya servidor de IA. Usa 125.923 entradas derivadas de CMUdict, convertidas a caracteres hispanos; las palabras ausentes se estiman con reglas. Las iniciales necesarias se descargan desde esta misma web y se guardan en Cache Storage cuando el navegador lo permite. No usa claves ni tokens ni envía el texto a un tercero. La primera carga del diccionario necesita internet; si falla, siguen funcionando las palabras comunes y reglas. Una vez guardadas, las iniciales pueden usarse sin conexión mientras la página siga abierta.

Es una guía aproximada, no una transcripción fonética exacta. No todos los sonidos ingleses tienen equivalente en español. Tocar la frase permite ver las palabras estimadas y las entradas con variantes (la versión local usa la primera; no distingue automáticamente el sentido de `read`, por ejemplo). La IA sigue siendo opcional para explicaciones y traducción contextual. Fuente y licencia: `public/pronunciation/README.md` y `LICENSE`.
