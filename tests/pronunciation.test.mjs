import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installDictionary,transcribe,localFragments,preparePronunciation} from '../public/js/pronunciation.js';
for(const letter of ['m','r','s','o','d','l'])installDictionary(letter,JSON.parse(await readFile(new URL(`../public/pronunciation/${letter}.json`,import.meta.url),'utf8')));
test('pronunciación de frases completas sin IA, palabras irregulares y contracciones',()=>{
 assert.equal(transcribe('She opened the door.').text,'shi óupand da dór.');
 assert.equal(transcribe('There was a sound of music.').text,'der uaz a sáund ov miúsik.');
 assert.equal(transcribe('I don’t know.').text.startsWith('ai dount'),true);
 const text='She opened the door. Then she smiled, and said: “Hello!”';
 const chunks=localFragments(text);assert.equal(chunks.map(c=>c.en).join(' ').replace(/\s+/g,' '),text);
 assert.ok(chunks[0].en.split(' ').length>1);
});
test('marca palabras estimadas y pronunciaciones con variantes',()=>{
 assert.deepEqual(transcribe('Qxzfoo smiled.').uncertain,['Qxzfoo']);
 const result=transcribe('read');assert.ok(result.ambiguous.includes('read'));
});
test('sin conexión mantiene la guía común y reglas, sin bloquear el libro',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('offline');};
 try{await preparePronunciation('Qxzfoo');assert.equal(calls,1);assert.ok(transcribe('the Qxzfoo').text.startsWith('da '));assert.deepEqual(transcribe('Qxzfoo').uncertain,['Qxzfoo']);}finally{globalThis.fetch=previous;}
});
