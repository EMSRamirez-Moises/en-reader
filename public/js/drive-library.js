// Durable per-book progress with optimistic versions. Network requests never block local edits.
export class DriveLibrary {
  constructor(api,storage,{device,onStatus=()=>{},onConflict=()=>{}}={}){this.api=api;this.store=storage;this.device=device;this.onStatus=onStatus;this.onConflict=onConflict;this.inflight=new Map();this.mutations=Promise.resolve();}
  mutate(fn){const task=this.mutations.then(fn);this.mutations=task.catch(()=>{});return task;}
  metaId(fileId){return 'drive-sync:'+fileId;}
  stateId(fileId){return 'state:drive:'+fileId;}
  async catalog(){const result=await this.api.request('listBooks');if(!Array.isArray(result.books)||result.books.length>3||result.books.some(b=>typeof b.fileId!=='string'||b.id!=='drive:'+b.fileId||typeof b.title!=='string'||typeof b.revision!=='string'))throw new Error('La biblioteca de Drive devolvió datos inválidos.');return result.books;}
  validateBook(book,fileId){
    if(book?.id!=='drive:'+fileId||book.fileId!==fileId||typeof book.revision!=='string'||typeof book.title!=='string'||typeof book.author!=='string'||!Array.isArray(book.paragraphs)||!book.paragraphs.length||book.paragraphs.length>100000||!Array.isArray(book.chapters)||!book.chapters.length||book.paragraphs.some(p=>typeof p.text!=='string'||!p.text.length||p.text.length>6000||!Number.isInteger(p.chapter)||p.chapter<0||p.chapter>=book.chapters.length)||book.chapters.some(c=>typeof c.title!=='string'||!Number.isInteger(c.start)||c.start<0||c.start>=book.paragraphs.length))throw new Error('El libro de Drive tiene un formato inválido.');
    return {...book,source:'drive'};
  }
  validateRemote(remote,book){
    if(typeof remote?.revision!=='string')throw new Error('El avance remoto tiene un formato inválido.');
    const s=remote.state;if(s&&(s.fileId!==book.fileId||typeof s.revision!=='string'||!Number.isInteger(s.version)||s.version<1||!Number.isInteger(s.index)||s.index<0||!Array.isArray(s.bookmarks)||s.bookmarks.some(n=>!Number.isInteger(n)||n<0)))throw new Error('El avance remoto tiene un formato inválido.');
    if(s&&s.revision===book.revision&&(s.index>=book.paragraphs.length||s.bookmarks.some(n=>n>=book.paragraphs.length)))throw new Error('El avance remoto está fuera del libro.');return remote;
  }
  localState(book,remote){return {id:this.stateId(book.fileId),kind:'state',bookId:book.id,index:remote?.index??0,bookmarks:remote?.bookmarks??[],updatedAt:remote?.updatedAt||Date.now()};}
  async open(fileId){
    const remote=await this.api.request('getProgress',{fileId});let book=await this.store.get('books','drive:'+fileId);
    if(!book||book.revision!==remote.revision)book=this.validateBook(await this.api.request('getBook',{fileId}),fileId);
    else book=this.validateBook(book,fileId);
    this.validateRemote(remote,book);await this.store.put('books',book);
    let changed=false;
    await this.mutate(async()=>{
      const old=await this.store.get('meta',this.metaId(fileId));
      if(old&&old.revision===book.revision&&old.generation>old.ack){return;}
      const matching=remote.state?.revision===book.revision?remote.state:null;
      changed=(!!remote.state&&!matching)||(!!old&&old.revision!==book.revision);
      await this.store.put('meta',this.localState(book,matching));
      await this.store.put('meta',{id:this.metaId(fileId),kind:'drive-sync',bookId:book.id,fileId,revision:book.revision,version:remote.state?.version||0,generation:0,ack:0,operation:null,conflict:null});
    });
    if(changed)this.onStatus('El EPUB cambió. Se abrió al principio; el avance anterior no se aplicó al nuevo texto.');
    return book;
  }
  async mark(book,state){return this.mutate(async()=>{
    const id=this.metaId(book.fileId);const old=await this.store.get('meta',id)||{id,kind:'drive-sync',fileId:book.fileId,bookId:book.id,revision:book.revision,version:0,generation:0,ack:0,operation:null};
    await this.store.put('meta',{...old,generation:old.generation+1});
    // Store the exact state in the same mutation queue; in-flight ACKs can't replace newer edits.
    await this.store.put('meta',{...state,id:this.stateId(book.fileId),kind:'state',bookId:book.id});
  });}
  async sync(fileId){
    if(this.inflight.has(fileId))return this.inflight.get(fileId);
    const task=this.perform(fileId).finally(()=>this.inflight.delete(fileId));this.inflight.set(fileId,task);return task;
  }
  async perform(fileId){
    const book=await this.store.get('books','drive:'+fileId);if(!book)return;
    let meta=await this.store.get('meta',this.metaId(fileId));if(!meta||meta.generation<=meta.ack)return;
    const remote=this.validateRemote(await this.api.request('getProgress',{fileId}),book);
    if(remote.revision!==book.revision){const error=new Error('El EPUB cambió en Drive. Vuelve a abrirlo antes de sincronizar.');error.code='BOOK_CHANGED';throw error;}
    // Lost response: recognize the last operation before creating another write.
    if(meta.operation&&remote.state?.operationId===meta.operation.operationId){await this.acknowledge(book,meta.operation,remote.state);return this.perform(fileId);}
    const currentVersion=remote.state?.version||0;
    if(currentVersion!==meta.version){await this.conflict(book,remote.state);return;}
    const operation=await this.mutate(async()=>{
      meta=await this.store.get('meta',this.metaId(fileId));
      if(meta.operation)return meta.operation;
      const local=await this.store.get('meta',this.stateId(fileId));
      const operation={fileId,revision:book.revision,index:local.index,bookmarks:[...local.bookmarks],expectedVersion:meta.version,device:this.device,operationId:crypto.randomUUID(),generation:meta.generation};
      await this.store.put('meta',{...meta,operation});return operation;
    });
    const {generation,...payload}=operation;
    let result;
    try{result=await this.api.request('saveProgress',payload);}catch(error){
      if(error.code!=='BOOK_NOT_OPENED')throw error;
      const refreshed=this.validateBook(await this.api.request('getBook',{fileId}),fileId);
      if(refreshed.revision!==book.revision)throw new Error('El EPUB cambió. Vuelve a abrirlo antes de guardar.');
      result=await this.api.request('saveProgress',payload);
    }
    if(result.conflict){this.validateRemote({revision:book.revision,state:result.state},book);await this.conflict(book,result.state);return;}
    if(!result.saved||result.state?.operationId!==operation.operationId)throw new Error('No se confirmó el guardado del avance.');
    this.validateRemote({revision:book.revision,state:result.state},book);
    await this.acknowledge(book,operation,result.state);
    this.onStatus('Avance y marcadores guardados en Google Drive / Sheets.');
    // A new local edit during the request remains pending for the next debounce/tick.
  }
  async acknowledge(book,operation,remote){return this.mutate(async()=>{
    const meta=await this.store.get('meta',this.metaId(book.fileId));
    if(!meta||meta.operation?.operationId!==operation.operationId)return;
    await this.store.put('meta',{...meta,version:remote.version,ack:Math.max(meta.ack,operation.generation),operation:null,conflict:null});
  });}
  async conflict(book,remote){remote=remote||{fileId:book.fileId,revision:book.revision,version:0,index:0,bookmarks:[],updatedAt:Date.now()};await this.mutate(async()=>{
    const meta=await this.store.get('meta',this.metaId(book.fileId));await this.store.put('meta',{...meta,conflict:remote});
  });this.onStatus('Hay un avance diferente en otro dispositivo. Elige cuál continuar.');this.onConflict({book,remote});}
  async resolve(fileId,useRemote){
    await this.mutate(async()=>{
      const meta=await this.store.get('meta',this.metaId(fileId));if(!meta?.conflict)return;
      const book=await this.store.get('books','drive:'+fileId),remote=meta.conflict;
      if(useRemote)await this.store.put('meta',this.localState(book,remote));
      await this.store.put('meta',{...meta,version:remote.version,ack:useRemote?meta.generation:meta.ack,operation:null,conflict:null});
    });
    if(!useRemote)await this.sync(fileId);
  }
  async flush(){const records=await this.store.getAll('meta');for(const entry of records.filter(r=>r.kind==='drive-sync'&&r.generation>r.ack))await this.sync(entry.fileId);}
}
