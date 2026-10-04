import test from 'node:test';
import assert from 'node:assert/strict';
import {DriveLibrary} from '../public/js/drive-library.js';
function storage(){const tables={books:new Map(),meta:new Map()};return {get:async(t,id)=>structuredClone(tables[t].get(id)),getAll:async t=>structuredClone([...tables[t].values()]),put:async(t,v)=>tables[t].set(v.id,structuredClone(v))};}
function backend(){
  const book={id:'drive:abc',fileId:'abc',revision:'r1',title:'Test',author:'Author',paragraphs:Array.from({length:5},(_,i)=>({text:'Passage '+i,chapter:0})),chapters:[{title:'Book',start:0}]};
  let state=null,lost=false,wait=null;
  return {book,get state(){return state;},lose(){lost=true;},delay(p){wait=p;},async request(action,data){
    if(action==='listBooks')return {books:[{...book,paragraphs:undefined}]};
    if(action==='getBook')return structuredClone(book);
    if(action==='getProgress')return structuredClone({revision:book.revision,state});
    if(action==='saveProgress'){
      if(wait){await wait;wait=null;}
      if(data.expectedVersion!==(state?.version||0))return {conflict:true,state:structuredClone(state)};
      state={...structuredClone(data),version:(state?.version||0)+1,updatedAt:Date.now()};
      if(lost){lost=false;throw new Error('lost response');}
      return {saved:true,state:structuredClone(state)};
    }throw new Error(action);
  }};
}
const mark=(library,book,index,bookmarks=[])=>library.mark(book,{index,bookmarks,updatedAt:Date.now()});
test('Drive: two devices recover progress and bookmarks and explicitly resolve stale writes',async()=>{
  const api=backend(),a=new DriveLibrary(api,storage(),{device:'a'}),events=[],b=new DriveLibrary(api,storage(),{device:'b',onConflict:c=>events.push(c)});
  const ba=await a.open('abc'),bb=await b.open('abc');
  await mark(a,ba,2,[1]);await a.flush();assert.equal(api.state.index,2);
  await mark(b,bb,1,[0]);await b.flush();assert.equal(api.state.index,2);assert.equal(events.length,1);
  await b.resolve('abc',true);assert.equal((await b.store.get('meta',b.stateId('abc'))).index,2);
  await mark(b,bb,3,[1,3]);await b.flush();await a.open('abc');assert.deepEqual((await a.store.get('meta',a.stateId('abc'))).bookmarks,[1,3]);
  await mark(a,ba,4);await a.flush();await mark(b,bb,0);await b.flush();await b.resolve('abc',false);assert.equal(api.state.index,0);
});
test('Drive: lost ACK is recovered without another write and offline progress remains durable',async()=>{
  const api=backend(),store=storage(),a=new DriveLibrary(api,store,{device:'a'}),book=await a.open('abc');
  await mark(a,book,2,[2]);api.lose();await assert.rejects(a.flush(),/lost response/);assert.equal(api.state.version,1);
  const reloaded=new DriveLibrary(api,store,{device:'a'});await reloaded.open('abc');await reloaded.flush();assert.equal(api.state.version,1);assert.equal((await store.get('meta',a.metaId('abc'))).ack,1);
});
test('Drive: a newer local edit is preserved while an older network write completes',async()=>{
  const api=backend(),a=new DriveLibrary(api,storage(),{device:'a'}),book=await a.open('abc');
  let release;api.delay(new Promise(resolve=>{release=resolve;}));await mark(a,book,1);
  const task=a.flush();for(let i=0;i<30;i++){if((await a.store.get('meta',a.metaId('abc'))).operation)break;await new Promise(r=>setTimeout(r,1));}
  await mark(a,book,4,[4]);release();await task;assert.equal((await a.store.get('meta',a.stateId('abc'))).index,4);
  await a.flush();assert.equal(api.state.index,4);assert.deepEqual(api.state.bookmarks,[4]);
});
test('Drive: replaced EPUB resets the location instead of applying the old indices',async()=>{
  const api=backend(),a=new DriveLibrary(api,storage(),{device:'a'}),book=await a.open('abc');await mark(a,book,4);await a.flush();
  api.book.revision='r2';api.book.paragraphs=api.book.paragraphs.slice(0,2);const next=await a.open('abc');assert.equal(next.revision,'r2');assert.equal((await a.store.get('meta',a.stateId('abc'))).index,0);
  await mark(a,next,1);await a.flush();assert.equal(api.state.revision,'r2');
});
