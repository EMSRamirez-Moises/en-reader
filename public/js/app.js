import {getAll,get,put,removeBook,saveCache} from './storage.js';
import {importEpub,textParagraphs} from './epub.js';
import {demo,demoAnalysis} from './demo.js';
import {validateAnalysis} from './analysis.js';
import {preparePronunciation,localFragments} from './pronunciation.js';

const $=id=>document.getElementById(id);
const preferences={provider:'gemini',apiBase:'',sync:false,phonetics:true,mode:'assisted',fontSize:24,goal:10,theme:'light'};
try{Object.assign(preferences,JSON.parse(localStorage.getItem('reader-preferences')||'{}'));}catch{}
let device=localStorage.getItem('reader-device');
if(!device){device=crypto.randomUUID();localStorage.setItem('reader-device',device);}
let token=sessionStorage.getItem('reader-token')||'';
let config=null,book=null,position=0,analysis=null,selected=0,request=null,version=0,lastActivity=Date.now(),syncing=false;
let state={index:0,bookmarks:[]};
let toastTimer;
let localReading=[];
const dateKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
const safe=fn=>async(...args)=>{try{await fn(...args);}catch(error){notify(error.message||'No se pudo completar esta acción.');}};
function savePreferences(){localStorage.setItem('reader-preferences',JSON.stringify(preferences));applyPreferences();}
function applyPreferences(){document.documentElement.dataset.theme=preferences.theme;document.documentElement.style.setProperty('--reader-size',`${preferences.fontSize}px`);document.body.classList.toggle('hide-phonetics',!preferences.phonetics);$('theme').textContent=preferences.theme==='dark'?'Tema claro':'Tema oscuro';$('phonetics').checked=preferences.phonetics;$('reading-mode').value=preferences.mode;$('font-size').value=preferences.fontSize;}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
async function api(route,options={}){
  const response=await fetch((preferences.apiBase||'')+route,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...options.headers},signal:options.signal||AbortSignal.timeout(65000)});
  let data;try{data=await response.json();}catch{throw new Error('No se encontró el servidor de IA. Conecta su dirección en Ajustes.');}
  if(!response.ok)throw new Error(data.error||'No se pudo conectar al servidor.');return data;
}
async function loadConfig(){
  try{config=await api('/api/config',{signal:AbortSignal.timeout(6000)});}catch{config=null;}
  const enabled=config?.providers.filter(p=>p.enabled).map(p=>p.id==='gemini'?'Gemini':'OpenAI').join(' y ');
  $('connection-state').textContent=config?`${enabled?enabled+' disponible':'Servidor conectado; faltan claves de IA.'}${config.requiresLogin&&!token?' Conecta tu sesión con la contraseña.':''}`:'Sin servidor conectado. La lectura y la muestra funcionan sin IA.';
  providerStatus();
}
function providerStatus(){const p=config?.providers.find(p=>p.id===preferences.provider);$('provider-status').textContent=book?.demo?'Muestra preparada':p?.enabled?`${preferences.provider==='gemini'?'Gemini':'OpenAI'} · ${p.model}`:'Lectura local · configura IA';}
async function dailyHabit(){const entries=await getAll('meta');const seconds=entries.filter(x=>x.kind==='stats'&&x.date===dateKey()).reduce((sum,x)=>sum+x.seconds,0);$('habit-value').textContent=`${Math.floor(seconds/60)} / ${preferences.goal} min`;}
async function renderLibrary(){
  const books=await getAll('books');const states=await getAll('meta');const stateMap=new Map(states.filter(x=>x.kind==='state').map(x=>[x.bookId,x]));
  books.sort((a,b)=>(stateMap.get(b.id)?.updatedAt||b.createdAt)-(stateMap.get(a.id)?.updatedAt||a.createdAt));
  const list=$('book-list');list.replaceChildren();$('library-empty').hidden=books.length>0;
  for(const item of books){
    const saved=stateMap.get(item.id);const at=Math.min(saved?.index||0,item.paragraphs.length-1);
    const card=element('article','book-card');const cover=element('div','book-cover');
    cover.append(element('span','eyebrow',item.demo?'RELATO DE MUESTRA':'LECTURA PERSONAL'),element('h3','',item.title));
    const del=element('button','quiet book-delete','Eliminar');del.setAttribute('aria-label','Eliminar '+item.title);del.addEventListener('click',safe(async()=>{if(!confirm(`¿Eliminar “${item.title}” y sus ayudas guardadas?`))return;await removeBook(item.id);await put('meta',{id:'deleted:'+item.id,kind:'deleted',bookId:item.id,updatedAt:Date.now()});await renderLibrary();await synchronize();}));
    const info=element('div','book-info');info.append(element('p','muted',item.author));const progress=element('p','muted',`Ubicación ${at+1} de ${item.paragraphs.length} pasajes${saved?' · avance guardado':''}`);
    const open=element('button','secondary',saved?'Continuar leyendo':'Abrir lectura');open.addEventListener('click',safe(()=>openBook(item.id)));info.append(progress,open);card.append(cover,del,info);list.append(card);
  }
  await dailyHabit();
}
async function savePosition(){if(!book)return;state={...state,id:'state:'+book.id,kind:'state',bookId:book.id,index:position,updatedAt:Date.now()};await put('meta',state);}
async function openBook(id){
  cancelRequest();book=await get('books',id);if(!book)throw new Error('No se encontró esta lectura.');
  state=await get('meta','state:'+id)||{index:0,bookmarks:[]};position=Math.min(state.index||0,book.paragraphs.length-1);$('library-view').hidden=true;$('reader-view').hidden=false;document.body.classList.add('reading');$('reader-book-title').textContent=book.title;
  $('book-title').textContent=book.title;$('book-author').textContent=book.author;$('chapters').replaceChildren();
  book.chapters.forEach((chapter,i)=>{const option=element('option','',chapter.title);option.value=i;$('chapters').append(option);});
  providerStatus();await renderPassage();renderBookmarks();lastActivity=Date.now();window.scrollTo({top:0,behavior:'instant'});
}
function cancelRequest(){version++;request?.abort();request=null;$('analyze').disabled=false;}
async function move(index){if(!book)return;cancelRequest();position=Math.max(0,Math.min(index,book.paragraphs.length-1));await savePosition();await renderPassage();renderBookmarks();lastActivity=Date.now();$('passage').scrollIntoView({block:'start',behavior:'instant'});}
function cacheId(){return `${book.id}:${position}:${preferences.provider}:${config?.providers.find(p=>p.id===preferences.provider)?.model||'default'}`;}
async function renderPassage(){
  const renderVersion=++version;analysis=null;const current=book.paragraphs[position];let cached=book.demo?null:await get('cache',cacheId());
  if(!book.demo&&!cached&&!config)cached=(await getAll('cache')).filter(item=>item.bookId===book.id&&item.index===position&&item.provider===preferences.provider).sort((a,b)=>b.savedAt-a.savedAt)[0];
  if(renderVersion!==version)return;
  if(book.demo)analysis=demoAnalysis[position];else if(cached){try{analysis=validateAnalysis(cached.analysis,current.text);}catch{analysis=null;}}
  const passage=$('passage');passage.replaceChildren();
  const hasAssistance=!!analysis&&preferences.mode==='assisted';
  passage.classList.add('analyzed');
  if(!hasAssistance){
    // Show the book immediately while dictionary shards load; never block navigation.
    localReading=localFragments(current.text);
    renderChunks(localReading,false);
    preparePronunciation(current.text).then(()=>{if(renderVersion===version){localReading=localFragments(current.text);renderChunks(localReading,false);}});
  }
  renderChunks(hasAssistance?analysis.fragments:localReading,hasAssistance);
  const before=$('previous-context'),after=$('next-context');before.hidden=position===0;after.hidden=position===book.paragraphs.length-1;
  if(position>0)before.textContent=book.paragraphs[position-1].text;
  if(position<book.paragraphs.length-1)after.textContent=book.paragraphs[position+1].text;
  const chapter=current.chapter;$('chapter-title').textContent=book.chapters[chapter]?.title||'Lectura';$('chapters').value=chapter;
  $('location-value').textContent=`Ubicación ${position+1} de ${book.paragraphs.length}`;$('book-progress').value=(position+1)/book.paragraphs.length*100;
  $('page-label').textContent=`${position+1} / ${book.paragraphs.length}`;$('prev').disabled=position===0;$('next').disabled=position===book.paragraphs.length-1;
  $('passage-note').textContent='';
  $('analysis-status').textContent=book.demo?'Ayuda de muestra · sin consumo de IA':cached?'Explicación guardada · sin nueva solicitud':'';
  $('analyze').textContent=analysis?'Volver a explicar con IA':'Acompañar este pasaje';$('analyze').disabled=book.demo;
  $('bookmark').textContent=state.bookmarks.includes(position)?'Quitar marcador':'Guardar marcador';
  $('passage-meaning-box').hidden=!analysis;$('passage-meaning-box').open=false;$('passage-meaning').textContent=analysis?.meaning||'';
  if(analysis)selectFragment(0);else clearHelp();
}
function renderChunks(fragments,assisted){
  const passage=$('passage');passage.replaceChildren();
  fragments.forEach((fragment,i)=>{
    const button=element('button','chunk');button.type='button';
    button.append(element('span','chunk-en',fragment.en),element('span','chunk-phonetic',assisted?fragment.phonetic:fragment.text));button.lastChild.lang='es';
    button.setAttribute('aria-label',fragment.en+' · ver ayuda');
    button.addEventListener('click',()=>{
      if(assisted)selectFragment(i);else{
        clearHelp();$('selected-fragment').textContent=fragment.en;$('selected-phonetic').textContent=fragment.text;
        const details=['Guía local aproximada · sin IA.'];
        if(fragment.uncertain.length)details.push('Estimadas por reglas: '+fragment.uncertain.join(', ')+'.');
        if(fragment.ambiguous.length)details.push('Con variantes; se usa la primera del diccionario: '+fragment.ambiguous.join(', ')+'.');
        $('fragment-note').textContent=details.join(' ');$('fragment-note').hidden=false;
      }
      $('help-dialog').showModal();
    });passage.append(button);
  });
}
function clearHelp(){$('selected-fragment').textContent='La pronunciación local ya está bajo cada frase. La IA es opcional para explicar el sentido.';$('selected-phonetic').textContent='';$('hint-button').disabled=true;$('meaning-button').disabled=true;['fragment-hint','fragment-meaning','fragment-note'].forEach(id=>$(id).hidden=true);}
function selectFragment(index){
  if(!analysis)return;selected=index;const fragment=analysis.fragments[index];$('passage').querySelectorAll('.chunk').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  $('selected-fragment').textContent=fragment.en;$('selected-phonetic').textContent=fragment.phonetic;$('fragment-hint').textContent=fragment.hint;$('fragment-meaning').textContent=fragment.es;$('fragment-note').textContent=fragment.note;
  ['fragment-hint','fragment-meaning','fragment-note'].forEach(id=>$(id).hidden=true);$('hint-button').disabled=false;$('meaning-button').disabled=false;
}
async function analyzePassage(){
  if(!book||book.demo)return;
  if(!config?.providers.find(p=>p.id===preferences.provider)?.enabled){openSettings();notify('Conecta y configura tu proveedor de IA.');return;}
  if(config.requiresLogin&&!token){openSettings();notify('Conecta tu sesión con la contraseña del servidor.');return;}
  if(analysis&&!confirm('Este pasaje ya tiene ayuda guardada. ¿Hacer una nueva solicitud de IA?'))return;
  cancelRequest();const expectedVersion=version;const bookId=book.id,index=position;const cache=cacheId();request=new AbortController();$('analyze').disabled=true;$('analysis-status').textContent='Preparando los fragmentos y su pronunciación…';
  try{
    const original=book.paragraphs[index].text;const result=await api('/api/analyze',{method:'POST',body:JSON.stringify({provider:preferences.provider,text:original,context:book.paragraphs[index-1]?.text.slice(-2500)||''}),signal:request.signal});
    const validated=validateAnalysis(result.analysis,original);await saveCache({id:cache,bookId,index,analysis:validated,provider:result.provider,model:result.model,savedAt:Date.now()});
    if(expectedVersion===version&&book?.id===bookId&&position===index){preferences.mode='assisted';savePreferences();await renderPassage();}
  }catch(error){if(error.name!=='AbortError'){if(expectedVersion===version)$('analysis-status').textContent='La lectura sigue disponible. Puedes volver a intentar.';notify(error.message);}}
  finally{if(book?.id===bookId&&position===index){$('analyze').disabled=false;}request=null;}
}
function renderBookmarks(){
  $('bookmark-count').textContent=`(${state.bookmarks.length})`;$('bookmark-list').replaceChildren();
  for(const index of state.bookmarks.filter(i=>i<book.paragraphs.length).sort((a,b)=>a-b)){const button=element('button','quiet',`${index+1} · ${book.paragraphs[index].text.slice(0,65)}…`);button.addEventListener('click',safe(()=>move(index)));$('bookmark-list').append(button);}
}
async function addBook(data){const id=crypto.randomUUID();const value={...data,id,createdAt:Date.now()};await put('books',value);await renderLibrary();$('import-dialog').close();await openBook(id);await synchronize();}
async function readUploaded(file){
  if(!file)return;$('epub-file').disabled=true;$('import-text').disabled=true;$('import-status').textContent='Abriendo tu lectura…';
  try{
    if(/\.epub$/i.test(file.name)){const data=await importEpub(file,text=>$('import-status').textContent=text);await addBook(data);if(data.warnings.length)notify(data.warnings.join(' '));}
    else if(/\.txt$/i.test(file.name)){if(file.size>20*1024*1024)throw new Error('El texto supera 20 MB.');const paragraphs=textParagraphs(await file.text());if(!paragraphs.length)throw new Error('El archivo no contiene texto.');await addBook({title:file.name.replace(/\.txt$/i,''),author:'Texto personal',paragraphs,chapters:[{title:'Lectura',start:0}]});}
    else throw new Error('Selecciona un archivo EPUB o TXT.');
  }finally{$('epub-file').disabled=false;$('epub-file').value='';$('import-text').disabled=false;$('import-status').textContent='';}
}
function openSettings(){$('provider').value=preferences.provider;$('api-base').value=preferences.apiBase;$('daily-goal').value=preferences.goal;$('sync-enabled').checked=preferences.sync;$('settings-dialog').showModal();}
async function snapshot(){const meta=await getAll('meta');return {version:1,books:await getAll('books'),states:meta.filter(x=>x.kind==='state'),cache:await getAll('cache'),stats:meta.filter(x=>x.kind==='stats'),deleted:meta.filter(x=>x.kind==='deleted').map(x=>({...x,id:x.bookId}))};}
function checkSnapshot(data){
  if(data?.version!==1||!['books','states','cache','stats','deleted'].every(key=>Array.isArray(data[key])))throw new Error('La copia no tiene un formato compatible.');
  if(data.books.length>200||data.cache.length>500)throw new Error('La copia contiene demasiadas lecturas o ayudas.');
  const books=new Map();
  for(const b of data.books){if(typeof b.id!=='string'||typeof b.title!=='string'||!Array.isArray(b.paragraphs)||!b.paragraphs.length||b.paragraphs.some(p=>typeof p.text!=='string'||p.text.length>6000||!Number.isInteger(p.chapter))||!Array.isArray(b.chapters)||b.chapters.some(c=>typeof c.title!=='string'||!Number.isInteger(c.start)))throw new Error('La copia contiene una lectura inválida.');books.set(b.id,b);}
  for(const s of data.states)if(typeof s.id!=='string'||!Number.isInteger(s.index)||s.index<0||!Array.isArray(s.bookmarks)||s.bookmarks.some(n=>!Number.isInteger(n)||n<0)||!Number.isFinite(s.updatedAt))throw new Error('La copia contiene un avance inválido.');
  for(const c of data.cache){const b=books.get(c.bookId);if(!b||!Number.isInteger(c.index)||!b.paragraphs[c.index])throw new Error('La copia contiene una ayuda sin lectura.');validateAnalysis(c.analysis,b.paragraphs[c.index].text);}
  for(const s of data.stats)if(typeof s.id!=='string'||typeof s.date!=='string'||!Number.isFinite(s.seconds)||s.seconds<0||s.seconds>86400)throw new Error('La copia contiene un tiempo inválido.');
  for(const d of data.deleted)if(typeof d.id!=='string'||!Number.isFinite(d.updatedAt))throw new Error('La copia contiene una eliminación inválida.');
  return data;
}
async function mergeSnapshot(input){
  const data=checkSnapshot(input);
  for(const tombstone of data.deleted){await removeBook(tombstone.id);await put('meta',{...tombstone,id:'deleted:'+tombstone.id,kind:'deleted',bookId:tombstone.id});}
  const tombstones=new Set((await getAll('meta')).filter(x=>x.kind==='deleted').map(x=>x.bookId));
  for(const item of data.books){if(tombstones.has(item.id))continue;const old=await get('books',item.id);if(!old)await put('books',item);}
  for(const item of data.states){if(tombstones.has(item.bookId))continue;const old=await get('meta',item.id);if(!old||item.updatedAt>old.updatedAt)await put('meta',{...item,kind:'state'});}
  for(const item of data.stats){const old=await get('meta',item.id);if(!old||item.seconds>old.seconds)await put('meta',{...item,kind:'stats'});}
  for(const item of data.cache){if(tombstones.has(item.bookId))continue;const old=await get('cache',item.id);if(!old||item.savedAt>old.savedAt)await saveCache(item);}
}
let lastSyncFingerprint='';
async function synchronize(){
  if(!preferences.sync){$('sync-state').textContent='Copia local activa. Conecta la sincronización privada en Ajustes para continuar en otro dispositivo.';return;}
  if(!config?.syncEnabled||!token){$('sync-state').textContent='Copia local activa · conecta tu sesión para sincronizar.';return;}
  if(syncing)return;syncing=true;
  try{
    // Pull before pushing; per-record timestamps and tombstones prevent stale devices from overwriting newer advances.
    await mergeSnapshot(await api('/api/sync'));
    const local=await snapshot();const fingerprint=JSON.stringify({books:local.books.map(x=>x.id),states:local.states.map(x=>[x.id,x.updatedAt]),cache:local.cache.map(x=>[x.id,x.savedAt]),stats:local.stats.map(x=>[x.id,x.seconds]),deleted:local.deleted.map(x=>[x.id,x.updatedAt])});
    if(fingerprint!==lastSyncFingerprint){const merged=await api('/api/sync',{method:'POST',body:JSON.stringify(local)});await mergeSnapshot(merged);lastSyncFingerprint=fingerprint;}
    $('sync-state').textContent='Sincronización privada conectada · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    if($('reader-view').hidden)await renderLibrary();
  }catch(error){$('sync-state').textContent='Copia local activa · sincronización pendiente: '+error.message;}
  finally{syncing=false;}
}
async function configure(event){
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{
    const base=$('api-base').value.trim().replace(/\/$/,'');if(base){const url=new URL(base);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Usa HTTPS para conectar un servidor remoto.');if(url.username||url.password||url.search||url.hash)throw new Error('La dirección del servidor no debe incluir credenciales ni parámetros.');}
    if(base!==preferences.apiBase){token='';sessionStorage.removeItem('reader-token');lastSyncFingerprint='';}
    preferences.apiBase=base;preferences.provider=$('provider').value;preferences.goal=Math.max(1,Math.min(120,Number($('daily-goal').value)||10));preferences.sync=$('sync-enabled').checked;savePreferences();
    await loadConfig();if(!config)throw new Error('No se pudo conectar a ese servidor. Tu configuración de lectura quedó guardada.');
    if($('server-password').value){const result=await api('/api/login',{method:'POST',body:JSON.stringify({password:$('server-password').value})});token=result.token;sessionStorage.setItem('reader-token',token);$('server-password').value='';}
    if(preferences.sync&&(!config.syncEnabled||!token))throw new Error('Activa APP_PASSWORD en el servidor e inicia sesión para sincronizar.');
    await loadConfig();await synchronize();await dailyHabit();if(book)await renderPassage();$('settings-dialog').close();notify('Configuración guardada.');
  }finally{button.disabled=false;}
}
async function exportCopy(){const data=await snapshot();const blob=new Blob([JSON.stringify(data)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=element('a');link.href=url;link.download='entre-lineas-'+dateKey()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function restoreCopy(file){if(!file)return;if(file.size>30*1024*1024)throw new Error('La copia supera 30 MB.');const data=checkSnapshot(JSON.parse(await file.text()));if(!confirm('¿Añadir los libros de esta copia y recuperar sus avances más recientes?'))return;await mergeSnapshot(data);await renderLibrary();await synchronize();notify('Lecturas recuperadas.');}
async function showLibrary(){cancelRequest();book=null;$('reader-view').hidden=true;document.body.classList.remove('reading');$('library-view').hidden=false;await synchronize();await renderLibrary();}
async function migrateLegacy(){
  const original=localStorage.getItem('saved_text');const id='legacy-reading-v1';
  if(!original||await get('books',id)||await get('meta','deleted:'+id))return;
  const paragraphs=textParagraphs(original);if(!paragraphs.length)return;
  const oldSentences=original.match(/[^.!?]+[.!?]*/g)||[original];
  const saved=Number.parseInt(localStorage.getItem('saved_index')||'0',10);
  const offset=oldSentences.slice(0,Number.isInteger(saved)&&saved>0?saved:0).map(s=>s.replace(/\s+/g,' ').trim()).join(' ').length;
  let consumed=0,index=0;for(let i=0;i<paragraphs.length;i++){if(consumed+paragraphs[i].text.length>=offset){index=i;break;}consumed+=paragraphs[i].text.length+1;}
  await put('books',{id,title:'Tu lectura anterior',author:'Recuperada de la versión anterior',paragraphs,chapters:[{title:'Lectura recuperada',start:0}],createdAt:Date.now()});
  await put('meta',{id:'state:'+id,kind:'state',bookId:id,index,bookmarks:[],updatedAt:Date.now()});
  notify('Tu lectura anterior se recuperó. La ubicación es aproximada porque ahora se navega por pasajes.');
}
async function init(){
  applyPreferences();await migrateLegacy();await renderLibrary();await loadConfig();await synchronize();
  $('home').addEventListener('click',safe(showLibrary));$('back-library').addEventListener('click',safe(showLibrary));
  $('import-button').addEventListener('click',()=>$('import-dialog').showModal());$('settings-button').addEventListener('click',openSettings);
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
  $('theme').addEventListener('click',()=>{preferences.theme=preferences.theme==='dark'?'light':'dark';savePreferences();});
  $('demo-button').addEventListener('click',safe(async()=>{let id=demo.id;if(await get('meta','deleted:'+id))id=crypto.randomUUID();if(!await get('books',id)){await put('books',{...demo,id,createdAt:Date.now()});}await openBook(id);}));
  $('epub-file').addEventListener('change',safe(event=>readUploaded(event.target.files[0])));
  $('import-form').addEventListener('submit',safe(async event=>{event.preventDefault();const text=$('text-input').value;if(text.length>20*1024*1024)throw new Error('El texto supera 20 MB.');const paragraphs=textParagraphs(text);if(!paragraphs.length)throw new Error('Pega un texto en inglés para empezar.');await addBook({title:$('text-title').value.trim()||'Mi lectura',author:'Texto personal',paragraphs,chapters:[{title:'Lectura',start:0}]});$('text-input').value='';$('text-title').value='';}));
  $('prev').addEventListener('click',safe(()=>move(position-1)));$('next').addEventListener('click',safe(()=>move(position+1)));
  $('previous-context').addEventListener('click',safe(()=>move(position-1)));$('next-context').addEventListener('click',safe(()=>move(position+1)));
  $('chapters').addEventListener('change',safe(async event=>{await move(book.chapters[Number(event.target.value)].start);$('reader-options-dialog').close();}));
  $('phonetics').addEventListener('change',event=>{preferences.phonetics=event.target.checked;savePreferences();});
  $('reading-mode').addEventListener('change',safe(async event=>{preferences.mode=event.target.value;savePreferences();await renderPassage();}));
  $('font-size').addEventListener('input',event=>{preferences.fontSize=Number(event.target.value);savePreferences();});
  $('bookmark').addEventListener('click',safe(async()=>{if(state.bookmarks.includes(position))state.bookmarks=state.bookmarks.filter(i=>i!==position);else state.bookmarks.push(position);await savePosition();renderBookmarks();$('bookmark').textContent=state.bookmarks.includes(position)?'Quitar marcador':'Guardar marcador';}));
  $('reader-options').addEventListener('click',()=>$('reader-options-dialog').showModal());
  $('reader-help').addEventListener('click',()=>$('help-dialog').showModal());
  $('analyze').addEventListener('click',safe(analyzePassage));
  $('hint-button').addEventListener('click',()=>$('fragment-hint').hidden=!$('fragment-hint').hidden);
  $('meaning-button').addEventListener('click',()=>{const hidden=!$('fragment-meaning').hidden;$('fragment-meaning').hidden=hidden;$('fragment-note').hidden=hidden;});
  $('settings-form').addEventListener('submit',safe(configure));$('export').addEventListener('click',safe(exportCopy));$('restore').addEventListener('change',safe(async event=>{try{await restoreCopy(event.target.files[0]);}finally{event.target.value='';}}));
  document.addEventListener('keydown',safe(async event=>{if(!book||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if(event.key==='ArrowRight'){event.preventDefault();await move(position+1);}if(event.key==='ArrowLeft'){event.preventDefault();await move(position-1);}}));
  ['pointerdown','keydown','scroll'].forEach(type=>document.addEventListener(type,()=>{lastActivity=Date.now();},{passive:true}));
  setInterval(safe(async()=>{if(book&&!document.hidden&&Date.now()-lastActivity<90000){const id=`stats:${device}:${dateKey()}`;const entry=await get('meta',id)||{id,kind:'stats',date:dateKey(),device,seconds:0};entry.seconds=Math.min(86400,entry.seconds+15);await put('meta',entry);}await dailyHabit();}),15000);
  setInterval(()=>{if(!document.hidden)synchronize();},30000);
  window.addEventListener('online',()=>synchronize());document.addEventListener('visibilitychange',()=>{if(!document.hidden)synchronize();});
}
init().catch(error=>notify(error.message));
