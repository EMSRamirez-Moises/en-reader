# Backend personal: Google Drive + Apps Script + Sheets

Este módulo guarda los EPUB originales en **tu carpeta privada de Drive**, extrae el texto con Apps Script y conserva el progreso en **tu hoja privada de Sheets**. Usa servicios con cuotas gratuitas; no significa capacidad ilimitada. No conecta con Gemini/OpenAI ni envía texto a modelos.

**Estado:** conexión integrada en los Ajustes del lector. El endpoint `/exec` del propietario está preconfigurado en `public/js/drive-connection.js`; la contraseña se introduce en la interfaz. Las pruebas automatizadas usan servicios de Google simulados. La lectura y el guardado autenticados con los archivos reales deben comprobarse en la implementación del propietario.

## Archivos

- `Code.gs`: entradas `doGet`, `doPost`, `rpc`; contraseña, sesiones y configuración.
- `Drive.gs`: lista privada, límite de tres EPUB y caché opcional.
- `Epub.gs`: descompresión, container.xml, OPF, manifest y **spine**; devuelve capítulos y párrafos compatibles con el lector.
- `Progress.gs`: ubicación, marcadores y versiones con bloqueo de escritura.
- `Bridge.html`: puente para GitHub Pages mediante `postMessage` y `google.script.run`.
- `appsscript.json`: V8 y permisos de lectura de Drive y uso de Sheets.
- `../public/js/drive-api.js`: cliente para el puente; no se carga automáticamente en la interfaz.

## Despliegue en tu cuenta

1. Crea una carpeta **privada y dedicada** en Drive. Pon hasta tres EPUB directamente en ella, sin subcarpetas. Deja Drive y los EPUB sin compartir públicamente. El backend rechaza operaciones si encuentra más de tres EPUB. Retira el anterior en Drive para añadir otro. La API no borra ni sube archivos.
2. Crea una hoja de Google Sheets privada. No uses una hoja con datos personales ajenos a la aplicación.
3. En https://script.google.com crea un proyecto independiente. Copia los cuatro archivos `.gs`, crea un archivo HTML llamado **Bridge** y copia su contenido. Activa la visualización del manifiesto en Configuración del proyecto y copia `appsscript.json`.
4. En Configuración del proyecto → Propiedades de la secuencia de comandos crea:

   | Propiedad | Valor |
   | --- | --- |
   | `DRIVE_FOLDER_ID` | ID de la carpeta (el segmento después de `/folders/` en su URL) |
   | `SHEET_ID` | ID de la hoja (el segmento entre `/d/` y `/edit`) |
   | `ALLOWED_ORIGIN` | `https://emsramirez-moises.github.io` — sin `/en-reader/` ni barra final |
   | `APP_PASSWORD` | Contraseña aleatoria de al menos 20 caracteres; nunca en GitHub |

5. `setup_` termina en guion bajo para mantenerla privada, por eso **no aparece en el selector Ejecutar del editor**. Para realizar la configuración inicial, añade temporalmente al final de `Code.gs`, fuera de cualquier otra función:

   ```js
   function iniciarConfiguracion() {
     setup_();
   }
   ```

   Guarda. En el selector junto a Ejecutar elige **iniciarConfiguracion** y pulsa Ejecutar. Autoriza los servicios con tu cuenta. Al finalizar, comprueba que la hoja contiene las pestañas Books y Progress. `APP_PASSWORD` se sustituye por `PASSWORD_HASH` y `TOKEN_SECRET`; conserva la contraseña original en tu gestor de contraseñas.

   **Borra después únicamente la función temporal `iniciarConfiguracion` y guarda antes de desplegar.** Conserva `setup_` y su guion bajo. La función temporal sin guion bajo sería invocable desde HtmlService si se incluyera en el despliegue; no debe publicarse. Para cambiar la contraseña, vuelve a añadir APP_PASSWORD en las propiedades, repite este procedimiento y elimina de nuevo la función temporal. Esto revoca las sesiones anteriores.

6. Implementar → Nueva implementación → Aplicación web. Ejecutar como **tú**; acceso **Cualquier persona**, si tu cuenta permite esta modalidad. La URL del endpoint es pública, pero las operaciones de datos exigen tu contraseña/sesión. Si necesitas un endpoint restringido por identidad Google, esta modalidad de contraseña no sustituye ese requisito: usa un despliegue y flujo de OAuth distinto. No compartas tu contraseña ni la URL con parámetros sensibles.
7. Guarda la URL que termina en `/exec`. No uses `/dev`. Cuando cambies el código de Apps Script, edita la implementación y selecciona una **nueva versión** conservando la URL.
8. Conecta el cliente como indica el ejemplo y prueba primero un EPUB pequeño en dos navegadores. Comprueba login incorrecto, lectura sin token, recuperación, marcador y conflicto. Si tu organización bloquea aplicaciones públicas o iframes, no retires sus protecciones: este transporte no será compatible con esa cuenta.

Los permisos declarados dan al script lectura de Drive y acceso a Sheets; no están técnicamente limitados a la carpeta y hoja elegidas. **El código sí restringe los libros a esa carpeta y el progreso a esa hoja.** Revisa los archivos antes de autorizar. No se devuelve el token OAuth de Google.

## API

`rpc` recibe `{action, token, data}` y devuelve `{ok:true, data}` o `{ok:false, error:{code,message}}`.

| Acción | Datos | Resultado |
| --- | --- | --- |
| `login` | `{password}` | `{token, expiresAt}`; sesión de 12 horas |
| `listBooks` | `{}` | Lista de EPUB e identificadores de Drive |
| `getBook` | `{fileId}` | `{id, fileId, revision, title, author, paragraphs, chapters, createdAt}` |
| `getProgress` | `{fileId}` | `{state, revision, changed}` |
| `saveProgress` | `{fileId, revision, index, bookmarks, expectedVersion, device, operationId}` | `{saved, state}` o `{saved:false, conflict:true, state}` |

`index` es la ubicación del **pasaje** (empieza en cero), no una página física del EPUB. `id: "drive:" + fileId` es estable entre dispositivos. `revision` detecta cambios en el archivo. Para conservar progreso, no borres y vuelvas a subir el EPUB como un archivo nuevo: tendrá otro fileId. Si cambió la revisión, se debe abrir de nuevo y decidir cómo reubicar la lectura, pues los índices pueden ser distintos.

`expectedVersion` protege contra una sobrescritura: dos dispositivos que leyeron la versión 1 no pueden ambos guardar la versión 2. El segundo recibe el estado actual y la interfaz debe ofrecer **continuar desde el avance remoto** o **guardar conscientemente la ubicación local** con la nueva versión. No reintentes automáticamente un conflicto ni elijas siempre el índice más alto: el lector puede retroceder.

`operationId` se genera una vez por guardado y se conserva al reintentar ese mismo guardado. Evita duplicar la última operación si se perdió su respuesta. El servidor asigna `updatedAt` y la versión; no confía en el reloj del celular.

## Desde la web en GitHub Pages

Apps Script no es un servidor Node: no se configura `Access-Control-Allow-Origin` o un middleware CORS a voluntad. ContentService redirige sus respuestas a Google. Un fetch JSON con Authorization puede introducir una petición OPTIONS que no tiene un manejador equivalente. **No uses `mode: "no-cors"` para intentar leer JSON**: obtendrías una respuesta opaca.

El cliente incluido monta un iframe del despliegue. Bridge usa `google.script.run` dentro de HtmlService y mensajes restringidos al origen de tu GitHub Pages; el cliente verifica canal aleatorio, origen Google y ventana del puente. La contraseña y sesión viajan en el cuerpo del mensaje/RPC, nunca en la URL. El canal de la URL es solo una correlación aleatoria, no da acceso a datos. La sesión solo permanece en memoria del cliente.

Ejemplo de integración (adaptar al estado y almacenamiento de la interfaz):

```js
import {DriveReaderAPI} from './js/drive-api.js';
import {put} from './js/storage.js';

const backend = new DriveReaderAPI(URL_EXEC_DE_TU_IMPLEMENTACION);
await backend.login(contraseñaIntroducidaPorElUsuario); // no escribirla en el código
const {books} = await backend.request('listBooks');
const fileId = books[0].fileId; // en la interfaz el usuario elige un libro
const remoteBook = await backend.request('getBook', {fileId});
const remote = await backend.request('getProgress', {fileId});
await put('books', remoteBook); // book.id estable: drive:<fileId>

let progress = remote.changed ? null : remote.state;
// Si changed=true, mostrar aviso y decidir ubicación: no aplicar el índice antiguo a ciegas.
const index = progress?.index ?? 0;
const bookmarks = progress?.bookmarks ?? [];
const response = await backend.request('saveProgress', {
  fileId, revision: remoteBook.revision,
  index, bookmarks,
  expectedVersion: remote.state?.version ?? 0,
  device: idEstableDeEsteDispositivo,
  operationId: crypto.randomUUID()
});
if (response.conflict) {
  // Mostrar la ubicación remota y pedir al lector que elija cuál continuar.
} else {
  progress = response.state; // conservar la nueva versión para el próximo guardado
}
```

El lector ya usa este transporte en **Ajustes → Continuar en otro dispositivo**. `drive-connection.js` gestiona sesión, biblioteca y mensajes; `drive-library.js` conserva operaciones pendientes, versiones y conflictos por libro. Guarda tras una pausa de 1,5 segundos y vuelve a intentar cada 30 segundos, al salir a Biblioteca y al recuperar conexión. No depende de un guardado al cerrar la pestaña. El servidor Node conserva su modo `/api/sync` separado; la URL `/exec` no va en el campo del servidor de IA.

Para herramientas de servidor/CLI, `doPost` acepta el mismo JSON y ContentService devuelve el sobre. El cliente debe seguir redirecciones **sin reenviar la contraseña a destinos ajenos a Google**. Todas las respuestas de aplicación tienen `{ok}`; no se promete un código HTTP distinto para cada error.

## Límites y extracción

- Tres EPUB en la carpeta; hasta 5 MB cada uno, 3.000 recursos y 30 MB descomprimidos; hasta 2 MB de texto. Son límites de esta implementación personal, no las cuotas oficiales de Drive.
- EPUB sin DRM y XHTML bien formado. Se permiten metadatos con espacios de nombres, rutas relativas internas, entidades numéricas y entidades tipográficas comunes. El parser rechaza secciones no XML y entidades internas, antes de devolver un libro incompleto.
- Omite scripts, estilos, navegación y SVG. Devuelve texto, sin imágenes ni maquetación original. Los EPUB originales siguen intactos en Drive.
- `Utilities.unzip` descomprime el ZIP completo antes de que podamos comprobar el tamaño expandido: no es un parser de archivos no confiables con descompresión en streaming. Usa EPUB de fuentes confiables. El lector local sigue siendo una alternativa para EPUB no compatibles con XmlService.
- Caché opcional solo para libros cuyo JSON cabe en 85 KB; CacheService admite valores de hasta 100 KB y puede expulsarlos antes de su caducidad. Si no hay caché, el EPUB se extrae al abrirlo, no al pasar cada pasaje.
- El progreso se guarda con LockService. Las cuotas de Apps Script, Drive y Sheets y el almacenamiento disponible de tu cuenta siguen aplicando. No hay disponibilidad ni gratuidad ilimitadas garantizadas.
- Este backend no sincroniza explicaciones de IA, estadísticas ni preferencias todavía: su alcance es EPUB, ubicación y marcadores de una biblioteca personal con contraseña compartida. No es un sistema multiusuario.

Documentación oficial: [Web Apps](https://developers.google.com/apps-script/guides/web), [Comunicación HtmlService](https://developers.google.com/apps-script/guides/html/communication), [ContentService](https://developers.google.com/apps-script/guides/content), [Utilities.unzip](https://developers.google.com/apps-script/reference/utilities/utilities#unzipblob), [Cuotas](https://developers.google.com/apps-script/guides/services/quotas).
