/** Optional Apps Script transport. Import explicitly after configuring your deployment.
 * Password/token travel only in postMessage/RPC bodies, never in query strings.
 */
export class DriveReaderAPI {
  constructor(endpoint){
    const url=new URL(endpoint);
    if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname)||url.search||url.hash)throw new Error('Usa la dirección /exec de tu Web App de Apps Script.');
    this.channel=crypto.randomUUID();this.pending=new Map();this.peer=null;this.origin=null;this.token='';this.closed=false;
    this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
    // Register before creating the iframe; HtmlService runs inside nested Google frames.
    this.listener=event=>{
      const message=event.data;
      if(!message||message.channel!==this.channel)return;
      let host;try{const origin=new URL(event.origin);if(origin.protocol!=='https:')return;host=origin.hostname;}catch{return;}
      if(!/^(?:[a-z0-9-]+-script\.googleusercontent\.com|script\.googleusercontent\.com|script\.google\.com)$/.test(host))return;
      if(message.type==='reader-ready'&&!this.peer){
        if(!event.source)return;this.peer=event.source;this.origin=event.origin;clearTimeout(this.bootTimer);
        this.peer.postMessage({type:'reader-connect',channel:this.channel},this.origin);this.resolveReady();return;
      }
      if(event.source!==this.peer||event.origin!==this.origin||message.type!=='reader-response')return;
      const task=this.pending.get(message.id);if(!task)return;clearTimeout(task.timer);this.pending.delete(message.id);
      if(message.result?.ok)task.resolve(message.result.data);else{const error=new Error(message.result?.error?.message||'No se pudo completar la petición.');error.code=message.result?.error?.code;task.reject(error);}
    };
    window.addEventListener('message',this.listener);
    this.frame=document.createElement('iframe');this.frame.hidden=true;this.frame.title='Conexión privada con Google Drive';
    this.bootTimer=setTimeout(()=>{this.rejectReady(new Error('La Web App no respondió. Revisa el despliegue, permisos y ALLOWED_ORIGIN.'));},45000);
    url.searchParams.set('channel',this.channel);this.frame.src=url.href;document.body.append(this.frame);
  }
  async request(action,data={}){
    if(this.closed)throw new Error('La conexión está cerrada.');
    await this.ready;const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);const error=new Error('La petición tardó demasiado. Si estabas guardando, vuelve a consultar el avance antes de reintentar.');error.code='TIMEOUT';reject(error);},90000);
      this.pending.set(id,{resolve,reject,timer});
      this.peer.postMessage({type:'reader-request',channel:this.channel,id,request:{action,data,token:this.token}},this.origin);
    });
  }
  async login(password){const result=await this.request('login',{password});this.token=result.token;return {expiresAt:result.expiresAt};}
  close(){
    this.closed=true;clearTimeout(this.bootTimer);this.rejectReady(new Error('Conexión cerrada.'));this.token='';
    window.removeEventListener('message',this.listener);this.frame.remove();
    for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(new Error('Conexión cerrada.'));}this.pending.clear();
  }
}
