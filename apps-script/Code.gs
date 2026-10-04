/** Entry points. All helper names end in _ so google.script.run cannot call them. */
function doGet(e) {
  const channel = String(e && e.parameter && e.parameter.channel || '');
  if (!/^[a-zA-Z0-9-]{24,80}$/.test(channel)) {
    return HtmlService.createHtmlOutput('Backend de Entre líneas. Conecta desde el lector configurado.');
  }
  const config = config_();
  const template = HtmlService.createTemplateFromFile('Bridge');
  template.channelJson = JSON.stringify(channel);
  template.originJson = JSON.stringify(config.origin).replace(/</g, '\\u003c');
  // The bridge permits embedding; every request still requires origin checks AND a token.
  return template.evaluate().setTitle('Conexión privada del lector')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** JSON POST is for server/CLI clients. Browser clients use Bridge + google.script.run. */
function doPost(e) {
  let result;
  try {
    const raw = e && e.postData && e.postData.contents || '';
    if (raw.length > 16000) fail_('REQUEST_TOO_LARGE', 'La petición es demasiado grande.');
    result = rpc(JSON.parse(raw));
  } catch (error) { result = errorResult_(error); }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function rpc(request) {
  try {
    if (!request || typeof request !== 'object' || JSON.stringify(request).length > 16000) {
      fail_('INVALID_REQUEST', 'Petición inválida.');
    }
    if (request.action === 'login') return {ok:true, data:login_(request.data || {})};
    authenticate_(request.token);
    const data = request.data || {};
    let result;
    switch (request.action) {
      case 'listBooks': result = listBooks_(); break;
      case 'getBook': result = getBook_(data.fileId); break;
      case 'getProgress': result = getProgress_(data.fileId); break;
      case 'saveProgress': result = saveProgress_(data); break;
      default: fail_('UNKNOWN_ACTION', 'Acción no disponible.');
    }
    return {ok:true, data:result};
  } catch (error) { return errorResult_(error); }
}

function config_() {
  const p = PropertiesService.getScriptProperties();
  const origin = p.getProperty('ALLOWED_ORIGIN');
  if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(origin || '')) fail_('CONFIG', 'Falta ALLOWED_ORIGIN (solo el origen HTTPS, sin ruta).');
  const folderId = p.getProperty('DRIVE_FOLDER_ID'), sheetId = p.getProperty('SHEET_ID');
  if (!folderId || !sheetId || !p.getProperty('TOKEN_SECRET') || !p.getProperty('PASSWORD_HASH')) fail_('CONFIG', 'Ejecuta setup_ desde el editor antes de desplegar.');
  return {origin:origin, folderId:folderId, sheetId:sheetId};
}

/** Run ONCE manually in the Apps Script editor after setting the four properties in README. */
function setup_() {
  const p = PropertiesService.getScriptProperties();
  const password = p.getProperty('APP_PASSWORD');
  if (!password || password.length < 20) fail_('CONFIG', 'APP_PASSWORD debe tener al menos 20 caracteres.');
  const secret = Utilities.getUuid() + Utilities.getUuid();
  p.setProperty('TOKEN_SECRET', secret);
  p.setProperty('PASSWORD_HASH', digest_(secret + ':' + password));
  p.deleteProperty('APP_PASSWORD');
  const config = config_();
  DriveApp.getFolderById(config.folderId).getName();
  const book = SpreadsheetApp.openById(config.sheetId);
  initializeSheet_(book, 'Books', ['fileId','revision','paragraphCount']);
  initializeSheet_(book, 'Progress', ['fileId','revision','index','bookmarks','version','updatedAt','device','operationId']);
  console.log('Configuración lista. La contraseña original se quitó de las propiedades.');
}

function initializeSheet_(book, name, headings) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (!sheet.getLastRow()) sheet.appendRow(headings);
  else if (sheet.getRange(1,1,1,headings.length).getValues()[0].join('|') !== headings.join('|')) fail_('CONFIG', 'La pestaña '+name+' no tiene las columnas esperadas.');
}
function fail_(code, message) { const error = new Error(message); error.code = code; throw error; }
function errorResult_(error) {
  // Do not return Drive IDs, passwords, tokens, stack traces or Google exception details.
  return {ok:false, error:{code:error.code || 'SERVICE_ERROR', message:error.code ? error.message : 'El servicio no pudo completar la operación. Revisa las ejecuciones de Apps Script.'}};
}
function digest_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)).replace(/=+$/,'');
}
function equal_(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff=0; for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i); return diff===0;
}
function sign_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload,PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET'))).replace(/=+$/,'');
}
function login_(data) {
  config_();
  // Best-effort throttle: CacheService is volatile. Use a long random password, not a PIN.
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000)) fail_('BUSY','Espera un momento antes de volver a conectar.');
  try {
    const cache=CacheService.getScriptCache();
    const failures=Number(cache.get('login-failures') || 0);
    if(failures >= 12) fail_('LOGIN_LIMIT','Demasiados intentos. Espera unos diez minutos.');
    const p=PropertiesService.getScriptProperties();
    const password=typeof data.password==='string' && data.password.length<=256 ? data.password : '';
    if(!equal_(digest_(p.getProperty('TOKEN_SECRET')+':'+password),p.getProperty('PASSWORD_HASH'))) {
      cache.put('login-failures',String(failures+1),600); fail_('LOGIN','Contraseña incorrecta.');
    }
    cache.remove('login-failures');
    const expiresAt=Date.now()+12*60*60*1000;
    const payload=Utilities.base64EncodeWebSafe(JSON.stringify({expiresAt:expiresAt,nonce:Utilities.getUuid()}),Utilities.Charset.UTF_8).replace(/=+$/,'');
    return {token:payload+'.'+sign_(payload),expiresAt:expiresAt};
  } finally {lock.releaseLock();}
}
function authenticate_(token) {
  config_();
  if(typeof token!=='string' || token.length>600) fail_('AUTH','Conecta tu sesión.');
  const parts=token.split('.');
  if(parts.length!==2 || !equal_(sign_(parts[0]),parts[1])) fail_('AUTH','La sesión no es válida.');
  let data;try{data=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());}catch(error){fail_('AUTH','La sesión no es válida.');}
  if(!Number.isFinite(data.expiresAt) || data.expiresAt<Date.now() || data.expiresAt>Date.now()+12*60*60*1000+60000) fail_('AUTH','La sesión venció. Vuelve a conectar.');
}
