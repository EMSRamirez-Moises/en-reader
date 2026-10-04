import {DriveReaderAPI} from './drive-api.js';
import {DriveLibrary} from './drive-library.js';
import * as storage from './storage.js';

export const DEFAULT_DRIVE_ENDPOINT='https://script.google.com/macros/s/AKfycbxzjxcRxvGmVD3NSHkft2CICGkQi-_R6TEhfo9TjwwB7yF2Ob6rsYSvCPJYyZ_RXvzl/exec';
export function connectDriveUI({device,preferences,savePreferences,renderLibrary,onResolved,notify}){
  const $=id=>document.getElementById(id);
  let api=null,catalog=[],timer,conflict=null,busy=false;
  function status(message){$('drive-status').textContent=message;$('sync-state').textContent=message;}
  const library=new DriveLibrary({request:(...args)=>{if(!api?.token)throw new Error('Conecta Google Drive en Ajustes para guardar tu avance.');return api.request(...args);}},storage,{device,onStatus:status,onConflict:value=>{
    if(conflict)return;conflict=value;
    $('drive-conflict-text').textContent=`“${value.book.title}” tiene un avance diferente en otro dispositivo (ubicación ${(value.remote?.index||0)+1}). Tu avance local sigue guardado. Elige cuál continuar.`;
    $('drive-conflict-dialog').showModal();
  }});
  async function flush(){
    if(!api?.token||busy||navigator.onLine===false)return;busy=true;
    try{await library.flush();}catch(error){status('Avance local guardado · sincronización pendiente: '+error.message);}
    finally{busy=false;}
  }
  async function refresh(){catalog=await library.catalog();await renderLibrary();status('Google Drive conectado · '+catalog.length+' de 3 libros.');}
  function forget(){clearTimeout(timer);api?.close();api=null;catalog=[];sessionStorage.removeItem('reader-drive-session');$('drive-disconnect').hidden=true;$('drive-refresh').hidden=true;}
  async function start(endpoint,password,session){
    const candidate=new DriveReaderAPI(endpoint);
    try{
      let expiresAt;
      if(session){candidate.token=session.token;expiresAt=session.expiresAt;await candidate.ready;}else ({expiresAt}=await candidate.login(password));
      // Validate the session before replacing a working connection.
      const result=await candidate.request('listBooks');
      if(!Array.isArray(result.books)||result.books.length>3)throw new Error('La biblioteca de Drive devolvió datos inválidos.');
      api?.close();api=candidate;catalog=await library.catalog();
      sessionStorage.setItem('reader-drive-session',JSON.stringify({endpoint,token:candidate.token,expiresAt}));
      preferences.driveEndpoint=endpoint;preferences.sync=false;savePreferences();$('sync-enabled').checked=false;
      $('drive-disconnect').hidden=false;$('drive-refresh').hidden=false;
      await renderLibrary();status('Google Drive conectado · '+catalog.length+' de 3 libros.');await flush();
    }catch(error){if(api===candidate)forget();else candidate.close();throw error;}
  }
  $('drive-endpoint').value=preferences.driveEndpoint||DEFAULT_DRIVE_ENDPOINT;
  $('drive-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('drive-connect');button.disabled=true;
    const password=$('drive-password').value;$('drive-password').value='';status('Conectando con tu biblioteca privada…');
    try{await start($('drive-endpoint').value.trim(),password);notify('Biblioteca de Drive conectada. Puedes abrir sus libros.');$('settings-dialog').close();}
    catch(error){status(error.message);notify(error.message);}finally{button.disabled=false;}
  });
  $('drive-check').addEventListener('click',async()=>{
    const button=$('drive-check');button.disabled=true;let probe;status('Comprobando la Web App…');
    try{probe=new DriveReaderAPI($('drive-endpoint').value.trim());await probe.ready;status('Web App disponible. Introduce tu contraseña y conecta para ver los libros.');}
    catch(error){status(error.message);}finally{probe?.close();button.disabled=false;}
  });
  $('drive-disconnect').addEventListener('click',async()=>{forget();status('Sesión de Drive cerrada. Las copias locales siguen disponibles.');await renderLibrary();});
  $('drive-refresh').addEventListener('click',async()=>{try{await refresh();await flush();}catch(error){status(error.message);notify(error.message);}});
  for(const [id,useRemote] of [['drive-use-remote',true],['drive-use-local',false]])$(id).addEventListener('click',async()=>{
    if(!conflict)return;const current=conflict;conflict=null;$('drive-conflict-dialog').close();
    try{await library.resolve(current.book.fileId,useRemote);await onResolved(current.book.id);await renderLibrary();status(useRemote?'Avance del otro dispositivo recuperado.':'Tu avance local se guardó en Sheets.');}
    catch(error){status(error.message);notify(error.message);}
  });
  $('drive-conflict-dialog').addEventListener('close',()=>{conflict=null;});
  setInterval(()=>{if(!document.hidden)flush();},30000);
  window.addEventListener('online',flush);document.addEventListener('visibilitychange',()=>{if(!document.hidden)flush();});
  let session;try{session=JSON.parse(sessionStorage.getItem('reader-drive-session')||'null');}catch{}
  if(session?.token&&session.expiresAt>Date.now())start(session.endpoint,null,session).catch(error=>status('Vuelve a conectar Drive: '+error.message));
  else sessionStorage.removeItem('reader-drive-session');
  return {
    get books(){return catalog;},get connected(){return !!api?.token;},
    async open(fileId){const value=await library.open(fileId);flush();return value;},
    async mark(book,state){await library.mark(book,state);status('Avance local guardado · pendiente de sincronizar.');clearTimeout(timer);timer=setTimeout(flush,1500);},
    flush,status
  };
}
