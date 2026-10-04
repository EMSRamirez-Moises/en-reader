import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
export class SyncStore {
  constructor(directory){this.directory=directory;this.file=path.join(directory,'readings.json');this.queue=Promise.resolve();}
  async read(){try{return JSON.parse(await readFile(this.file,'utf8'));}catch(error){if(error.code==='ENOENT')return {version:1,books:[],states:[],cache:[],stats:[],deleted:[]};throw error;}}
  merge(incoming){const operation=this.queue.then(async()=>{
    const current=await this.read();
    const newest=(a,b)=>{
      const map=new Map(a.map(item=>[item.id,item]));
      for(const item of b){const old=map.get(item.id);if(!old||(item.updatedAt||item.savedAt||item.createdAt||0)>(old.updatedAt||old.savedAt||old.createdAt||0))map.set(item.id,item);}
      return [...map.values()];
    };
    const deleted=newest(current.deleted,incoming.deleted||[]);
    const tombstones=new Map(deleted.map(item=>[item.id,item.updatedAt]));
    const books=newest(current.books,incoming.books).filter(book=>!tombstones.has(book.id));
    const ids=new Set(books.map(book=>book.id));
    const states=newest(current.states,incoming.states).filter(item=>ids.has(item.bookId));
    const cache=newest(current.cache,incoming.cache).filter(item=>ids.has(item.bookId)).sort((a,b)=>b.savedAt-a.savedAt).slice(0,500);
    // Daily counters are independent per device, merged by maximum to avoid counting retries twice.
    const statsMap=new Map(current.stats.map(item=>[item.id,item]));
    for(const item of incoming.stats){const old=statsMap.get(item.id);if(!old||item.seconds>old.seconds)statsMap.set(item.id,item);}
    const stats=[...statsMap.values()].slice(-2000);
    const result={version:1,books,states,cache,stats,deleted};
    const json=JSON.stringify(result);if(Buffer.byteLength(json)>100*1024*1024)throw new Error('La biblioteca sincronizada supera 100 MB. Exporta una copia y elimina lecturas antiguas.');
    await mkdir(this.directory,{recursive:true});await writeFile(this.file+'.tmp',json,{mode:0o600});await rename(this.file+'.tmp',this.file);
    return result;
  });this.queue=operation.catch(()=>{});return operation;}
}
export function validateSnapshot(input){
  if(!input||input.version!==1||!['books','states','cache','stats','deleted'].every(key=>Array.isArray(input[key])))throw new Error('La copia de lecturas no es válida.');
  if(input.books.length>200||input.states.length>200||input.cache.length>500||input.stats.length>2000||input.deleted.length>1000)throw new Error('La copia contiene demasiados elementos.');
  for(const group of ['books','states','cache','stats','deleted'])for(const item of input[group])if(!item||typeof item.id!=='string'||item.id.length>500)throw new Error('La copia contiene identificadores inválidos.');
  for(const book of input.books){if(typeof book.title!=='string'||!Array.isArray(book.paragraphs)||!book.paragraphs.length||book.paragraphs.some(p=>typeof p.text!=='string'||p.text.length>6000||!Number.isInteger(p.chapter))||!Array.isArray(book.chapters)||book.chapters.some(c=>typeof c.title!=='string'||!Number.isInteger(c.start)))throw new Error('La copia contiene un libro inválido.');}
  for(const item of input.states)if(typeof item.bookId!=='string'||!Number.isInteger(item.index)||item.index<0||!Array.isArray(item.bookmarks)||item.bookmarks.some(index=>!Number.isInteger(index)||index<0)||!Number.isFinite(item.updatedAt))throw new Error('La copia contiene un avance inválido.');
  for(const item of input.cache)if(typeof item.bookId!=='string'||!Number.isInteger(item.index)||!item.analysis||!Array.isArray(item.analysis.fragments))throw new Error('La copia contiene una explicación inválida.');
  for(const item of input.stats)if(typeof item.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!Number.isFinite(item.seconds)||item.seconds<0||item.seconds>86400)throw new Error('La copia contiene estadísticas inválidas.');
  for(const item of input.deleted)if(!Number.isFinite(item.updatedAt))throw new Error('La copia contiene una eliminación inválida.');
  return input;
}
