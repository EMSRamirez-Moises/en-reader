import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import JSZip from 'jszip';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await pause(20);}throw new Error('La interfaz no alcanzó el estado esperado.');}
test('interfaz: muestra, pronunciación, marcadores, progreso, texto y explicación IA',async()=>{
  const window=new Window({url:'http://127.0.0.1:3000',settings:{enableJavaScriptEvaluation:false}});window.document.write(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));window.JSZip=JSZip;
  const old=new Map();for(const [name,value] of Object.entries({window,document:window.document,localStorage:window.localStorage,sessionStorage:window.sessionStorage,DOMParser:window.DOMParser,indexedDB,IDBKeyRange,confirm:()=>true})){old.set(name,globalThis[name]);Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
  const originalFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,options={})=>{
    if(url.includes('/pronunciation/'))return {ok:true,json:async()=>JSON.parse(await readFile(new URL('../public/pronunciation/'+url.split('/').pop(),import.meta.url),'utf8'))};
    if(url.endsWith('/api/config'))return {ok:true,json:async()=>({providers:[{id:'gemini',enabled:true,model:'test-model'},{id:'openai',enabled:false,model:'test-model'}],requiresLogin:false,syncEnabled:false})};
    if(url.endsWith('/api/analyze')){calls++;const input=JSON.parse(options.body);const analysis={meaning:'Sentido de prueba.',fragments:input.text.match(/[^.!?]+[.!?]*/g).map(en=>({en:en.trim(),phonetic:'pronunciación de prueba',es:'Significado de prueba',hint:'Pista de prueba',note:''}))};
      if(calls>1){analysis.scene='La misma persona realizó las dos acciones.';analysis.fragments.forEach((f,i)=>Object.assign(f,{connectsTo:i===0?-1:i-1,adds:i===0?'La primera acción':'La acción siguiente',connection:i===0?'Presenta la primera acción.':'La misma persona hizo esto después de la acción anterior.'}));}
      return {ok:true,json:async()=>({provider:'gemini',model:'test-model',analysis})};}
    throw new Error('Unexpected URL '+url);
  };
  const nativeInterval=globalThis.setInterval;const handles=[];globalThis.setInterval=(...args)=>{const handle=nativeInterval(...args);handles.push(handle);return handle;};
  const nativeTimeout=globalThis.setTimeout;const timeouts=[];globalThis.setTimeout=(...args)=>{const handle=nativeTimeout(...args);timeouts.push(handle);return handle;};
  try{
    await import('../public/js/app.js');await until(()=>window.document.getElementById('connection-state').textContent.includes('Gemini'));
    const $=id=>window.document.getElementById(id);
    $('demo-button').click();await until(()=>$('passage').querySelectorAll('.chunk').length===3);
    assert.equal($('passage').querySelector('.chunk-phonetic').textContent,'der uaz a sáund ov miúzik');
    $('meaning-button').click();assert.equal($('fragment-meaning').hidden,false);assert.equal($('fragment-meaning').textContent,'Se escuchaba música.');
    $('phonetics').checked=false;$('phonetics').dispatchEvent(new window.Event('change'));assert.ok(window.document.body.classList.contains('hide-phonetics'));
    $('next').click();await until(()=>$('page-label').textContent==='2 / 3');$('bookmark').click();await until(()=>$('bookmark-count').textContent==='(1)');
    $('back-library').click();await until(()=>!$('library-view').hidden&&$('book-list').querySelector('.book-info button'));$('book-list').querySelector('.book-info button').click();await until(()=>!$('reader-view').hidden&&$('page-label').textContent==='2 / 3');assert.equal($('bookmark-count').textContent,'(1)');
    $('back-library').click();await until(()=>!$('library-view').hidden);$('import-button').click();$('text-title').value='Test reading';$('text-input').value='She opened the door. Then she smiled.';$('import-form').dispatchEvent(new window.Event('submit',{cancelable:true}));
    await until(()=>$('book-title').textContent==='Test reading'&&$('passage').querySelector('.chunk-phonetic')?.textContent==='shi óupand da dór.');assert.equal(calls,0,'La pronunciación local no consulta IA');assert.equal($('help-dialog').open,false);assert.ok(window.document.body.classList.contains('reading'));$('reader-options').click();assert.equal($('reader-options-dialog').open,true);$('reader-options-dialog').close();$('reader-help').click();assert.equal($('help-dialog').open,true);$('analyze').click();await until(()=>$('passage').querySelectorAll('.chunk').length===2);assert.equal(calls,1);
    $('back-library').click();await until(()=>!$('library-view').hidden&&$('book-list').querySelectorAll('.book-info button').length===2);const buttons=[...$('book-list').querySelectorAll('.book-info button')];buttons[0].click();await until(()=>!$('reader-view').hidden&&$('passage').querySelectorAll('.chunk').length===2);assert.equal(calls,1,'La explicación guardada no vuelve a consultar la IA');
    $('help-dialog').close();$('back-library').click();await until(()=>!$('library-view').hidden);$('settings-button').click();
    assert.ok($('drive-endpoint').value.endsWith('/exec'));
    $('drive-password').value='only-a-test-password';$('drive-form').dispatchEvent(new window.Event('submit',{cancelable:true}));
    assert.equal($('drive-password').value,'');
    const frame=window.document.querySelector('iframe'),channel=new URL(frame.src).searchParams.get('channel');assert.ok(!frame.src.includes('only-a-test-password'));
    let remote=null;const remoteBook={id:'drive:test',fileId:'test',revision:'rev1',title:'Drive test book',author:'Test author',paragraphs:[{text:'She opened the door.',chapter:0},{text:'Then she smiled.',chapter:0}],chapters:[{title:'Test',start:0}]};
    const peer={postMessage(message){if(message.type!=='reader-request')return;const {action,data}=message.request;let result;
      if(action==='login'){assert.equal(data.password,'only-a-test-password');result={token:'fake-token',expiresAt:Date.now()+3600000};}
      else if(action==='listBooks')result={books:[{id:remoteBook.id,fileId:'test',revision:'rev1',title:remoteBook.title}]};
      else if(action==='getBook')result=remoteBook;
      else if(action==='getProgress')result={revision:'rev1',state:remote};
      else if(action==='saveProgress'){remote={...data,version:(remote?.version||0)+1,updatedAt:Date.now()};result={saved:true,state:remote};}
      else throw new Error(action);
      queueMicrotask(()=>window.dispatchEvent(new window.MessageEvent('message',{origin:'https://script.googleusercontent.com',source:peer,data:{channel,type:'reader-response',id:message.id,result:{ok:true,data:result}}})));
    }};
    window.dispatchEvent(new window.MessageEvent('message',{origin:'https://script.googleusercontent.com',source:peer,data:{channel,type:'reader-ready'}}));
    await until(()=>$('drive-status').textContent.includes('conectado'));assert.equal($('settings-dialog').open,false);
    const card=[...$('book-list').children].find(c=>c.textContent.includes('Drive test book'));assert.ok(card);card.querySelector('.book-info button').click();await until(()=>$('book-title').textContent==='Drive test book');
    $('next').click();await until(()=>$('page-label').textContent==='2 / 2');$('bookmark').click();await until(()=>$('bookmark-count').textContent==='(1)');$('back-library').click();await until(()=>remote?.index===1&&remote?.bookmarks.includes(1));
    assert.ok(sessionStorage.getItem('reader-drive-session').includes('fake-token'));assert.ok(!localStorage.getItem('reader-preferences').includes('only-a-test-password'));
    $('drive-disconnect').click();await until(()=>!window.document.querySelector('iframe'));assert.equal(sessionStorage.getItem('reader-drive-session'),null);
    $('connections-demo').click();await until(()=>$('passage').querySelectorAll('.chunk').length===5&&!$('connection-help').hidden);
    assert.equal(calls,1,'La muestra de conexiones no consume IA');assert.equal($('help-dialog').open,false);
    const chunks=[...$('passage').querySelectorAll('.chunk')];
    assert.equal(chunks.map(b=>b.querySelector('.chunk-en').textContent).join(' '),'True, a schoolteacher had come from somewhere and lived at the rancho for three years for her health.');
    assert.equal($('connection-fragment').textContent,'for three years');assert.equal($('connection-adds').textContent,'Duración de la estancia');assert.equal($('connection-target').textContent,'and lived at the rancho');
    assert.ok(chunks[3].classList.contains('is-selected'));assert.ok(chunks[2].classList.contains('is-connected'));assert.equal(chunks[3].getAttribute('aria-expanded'),'true');
    assert.equal($('connection-scene-box').open,false);assert.equal($('connection-meaning-box').open,false);
    chunks[4].click();assert.equal($('connection-adds').textContent,'Motivo de la estancia');assert.equal($('connection-target').textContent,'and lived at the rancho');assert.match($('connection-copy').textContent,/motivo.*salud/);
    $('connection-prev').click();assert.equal($('connection-fragment').textContent,'for three years');
    $('connection-close').click();assert.equal($('connection-help').hidden,true);assert.ok(!$('passage').querySelector('.is-selected,.is-connected'));assert.equal(window.document.activeElement,chunks[3]);
    $('reader-help').click();assert.equal($('connection-help').hidden,false);assert.equal($('help-dialog').open,false);
    $('next').click();await until(()=>$('page-label').textContent==='2 / 2');assert.equal($('connection-help').hidden,true);
    $('passage').querySelectorAll('.chunk')[1].click();assert.equal($('connection-fragment').textContent,'when he showed up.');assert.equal($('connection-target').textContent,'She was about to leave');assert.match($('connection-scene').textContent,/no dice si ella terminó/);
    $('reader-options').click();$('reading-mode').value='continuous';$('reading-mode').dispatchEvent(new window.Event('change'));await until(()=>$('connection-help').hidden);$('reader-options-dialog').close();
    $('reader-help').click();assert.equal($('help-dialog').open,true,'Lectura continua conserva su ayuda anterior');$('help-dialog').close();
    $('back-library').click();await until(()=>!$('library-view').hidden);$('import-button').click();$('text-title').value='La frase del libro';$('text-input').value='True, a schoolteacher had come from somewhere and lived at the rancho for three years for her health.';$('import-form').dispatchEvent(new window.Event('submit',{cancelable:true}));
    await until(()=>$('book-title').textContent==='La frase del libro');$('reader-options').click();$('reading-mode').value='assisted';$('reading-mode').dispatchEvent(new window.Event('change'));await until(()=>$('passage').querySelectorAll('.chunk').length===5);$('reader-options-dialog').close();
    $('passage').querySelectorAll('.chunk')[3].click();assert.equal($('connection-adds').textContent,'Duración de la estancia');assert.equal(calls,1,'El mismo texto importado reutiliza la explicación preparada');
    $('back-library').click();await until(()=>!$('library-view').hidden);$('import-button').click();$('text-title').value='Una lectura nueva';$('text-input').value='He put down the book. Then he left.';$('import-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await until(()=>$('book-title').textContent==='Una lectura nueva');
    assert.equal($('connection-help').hidden,true);$('reader-help').click();$('analyze').click();await until(()=>!$('connection-help').hidden);assert.equal(calls,2);assert.equal($('help-dialog').open,false);
    $('passage').querySelectorAll('.chunk')[1].click();assert.equal($('connection-target').textContent,'He put down the book.');assert.equal($('connection-adds').textContent,'La acción siguiente');
    $('back-library').click();await until(()=>!$('library-view').hidden);[...$('book-list').children].find(c=>c.textContent.includes('Una lectura nueva')).querySelector('.book-info button').click();await until(()=>$('book-title').textContent==='Una lectura nueva'&&$('passage').querySelectorAll('.chunk').length===2);assert.equal(calls,2,'La nueva explicación con conexiones también se reutiliza');
  }finally{handles.forEach(clearInterval);timeouts.forEach(clearTimeout);globalThis.setTimeout=nativeTimeout;globalThis.setInterval=nativeInterval;globalThis.fetch=originalFetch;await window.happyDOM.abort();for(const [name,value] of old)Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
});
