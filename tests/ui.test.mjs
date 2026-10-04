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
    if(url.endsWith('/api/config'))return {ok:true,json:async()=>({providers:[{id:'gemini',enabled:true,model:'test-model'},{id:'openai',enabled:false,model:'test-model'}],requiresLogin:false,syncEnabled:false})};
    if(url.endsWith('/api/analyze')){calls++;const input=JSON.parse(options.body);return {ok:true,json:async()=>({provider:'gemini',model:'test-model',analysis:{meaning:'Ella abrió la puerta. Luego sonrió.',fragments:input.text.match(/[^.!?]+[.!?]*/g).map(en=>({en:en.trim(),phonetic:'pronunciación de prueba',es:'Significado de prueba',hint:'Pista de prueba',note:''}))}})};}
    throw new Error('Unexpected URL '+url);
  };
  const nativeInterval=globalThis.setInterval;const handles=[];globalThis.setInterval=(...args)=>{const handle=nativeInterval(...args);handles.push(handle);return handle;};
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
    await until(()=>$('book-title').textContent==='Test reading');$('analyze').click();await until(()=>$('passage').querySelectorAll('.chunk').length===2);assert.equal(calls,1);
    $('back-library').click();await until(()=>!$('library-view').hidden&&$('book-list').querySelectorAll('.book-info button').length===2);const buttons=[...$('book-list').querySelectorAll('.book-info button')];buttons[0].click();await until(()=>!$('reader-view').hidden&&$('passage').querySelectorAll('.chunk').length===2);assert.equal(calls,1,'La explicación guardada no vuelve a consultar la IA');
  }finally{handles.forEach(clearInterval);globalThis.setInterval=nativeInterval;globalThis.fetch=originalFetch;await window.happyDOM.abort();for(const [name,value] of old)Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
});
