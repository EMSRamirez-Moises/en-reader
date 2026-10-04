let database;
export async function db(){
  if(database)return database;
  database=await new Promise((resolve,reject)=>{const request=indexedDB.open('entre-lineas',1);request.onupgradeneeded=()=>{for(const name of ['books','cache','meta'])request.result.createObjectStore(name,{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('No se pudo abrir el almacenamiento de este navegador.'));});
  return database;
}
export async function getAll(store){const database=await db();return new Promise((resolve,reject)=>{const request=database.transaction(store).objectStore(store).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function get(store,id){const database=await db();return new Promise((resolve,reject)=>{const request=database.transaction(store).objectStore(store).get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function put(store,value){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(new Error('No se pudo guardar. El almacenamiento del navegador puede estar lleno.'));});}
export async function removeBook(id){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(['books','cache'],'readwrite');tx.objectStore('books').delete(id);const cursor=tx.objectStore('cache').openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(item){if(item.value.bookId===id)item.delete();item.continue();}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export async function saveCache(value){await put('cache',value);const entries=await getAll('cache');if(entries.length>250){const database=await db();const tx=database.transaction('cache','readwrite');entries.sort((a,b)=>a.savedAt-b.savedAt).slice(0,entries.length-250).forEach(item=>tx.objectStore('cache').delete(item.id));}}
