import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { schema, readingPrompt, validateAnalysis } from './public/js/analysis.js';
import { SyncStore, validateSnapshot } from './sync-store.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const sessions = new Map();
const limits = new Map();
const models = {gemini:process.env.GEMINI_MODEL || 'gemini-3.8-flash',openai:process.env.OPENAI_MODEL || 'gpt-5.4-mini'};
const keys = {gemini:process.env.GEMINI_API_KEY,openai:process.env.OPENAI_API_KEY};
const password = process.env.APP_PASSWORD || '';
const host = process.env.HOST || '127.0.0.1';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
const synced = new SyncStore(process.env.DATA_DIR || fileURLToPath(new URL('./.data/',import.meta.url)));
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
function limited(req, bucket, max) {
  const id = bucket + ':' + req.socket.remoteAddress;
  const now = Date.now();
  for (const [key,value] of limits) if (now > value.until) limits.delete(key);
  const item = limits.get(id) || {count:0,until:now+60000};
  limits.set(id,item);
  if (++item.count > max) throw new HttpError(429,'Demasiadas solicitudes. Espera un minuto antes de intentar de nuevo.');
}
function authenticated(req) {
  if (!password) return true;
  const token = req.headers.authorization?.replace(/^Bearer /,'');
  const expiry = sessions.get(token);
  for (const [key,time] of sessions) if (time < Date.now()) sessions.delete(key);
  return expiry && expiry > Date.now();
}
async function body(req, maximum=40000) {
  const chunks=[];let size=0;
  for await (const chunk of req) {size+=chunk.length;if(size>maximum)throw new HttpError(413,'El contenido es demasiado grande para esta solicitud.');chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString());} catch {throw new HttpError(400,'Solicitud inválida.');}
}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
export async function analyze(provider,text,context,fetchImpl=fetch) {
  if (!Object.hasOwn(keys,provider)) throw new HttpError(400,'Proveedor desconocido.');
  if (!keys[provider]) throw new HttpError(503,`Configura ${provider==='openai'?'OPENAI_API_KEY':'GEMINI_API_KEY'} en el archivo .env del servidor.`);
  const prompt=readingPrompt(text,context);
  let url,options;
  if(provider==='openai'){
    url='https://api.openai.com/v1/responses';
    options={headers:{Authorization:`Bearer ${keys.openai}`,'Content-Type':'application/json'},body:JSON.stringify({model:models.openai,input:prompt,store:false,max_output_tokens:10000,text:{format:{type:'json_schema',name:'reading_passage',strict:true,schema}}})};
  }else{
    url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models.gemini)}:generateContent`;
    options={headers:{'x-goog-api-key':keys.gemini,'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,maxOutputTokens:10000}})};
  }
  let response;
  try{response=await fetchImpl(url,{method:'POST',...options,signal:AbortSignal.timeout(60000)});}catch{throw new HttpError(504,'La IA no respondió a tiempo. Tu lectura sigue guardada.');}
  let data;
  try{data=await response.json();}catch{throw new HttpError(502,'El proveedor devolvió una respuesta que no se pudo leer.');}
  if(!response.ok){
    const messages={401:'La clave de IA no es válida.',403:'La cuenta no tiene acceso a este modelo o servicio.',404:'El modelo configurado no está disponible. Revisa el nombre en .env.',429:'El proveedor alcanzó su límite de uso o saldo. Revisa tu cuenta antes de volver a intentar.'};
    throw new HttpError(response.status===429?429:502,messages[response.status] || 'El proveedor no pudo procesar el pasaje. Revisa la configuración de IA.');
  }
  const raw=provider==='gemini'?data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join(''):data.output?.flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('');
  try{return {analysis:validateAnalysis(JSON.parse(raw),text,{requireConnections:true}),provider,model:models[provider]};}catch(error){throw new HttpError(502,error.message.includes('IA')?error.message:'La IA no terminó la explicación. Intenta con un pasaje más corto.');}
}
export function createServer(){return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; img-src 'self' blob: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  try{
    const origin=req.headers.origin;
    const sameOrigin=origin && new URL(origin).host===req.headers.host;
    if(origin&&!sameOrigin&&!allowedOrigins.includes(origin))throw new HttpError(403,'El origen de esta página no está autorizado en el servidor.');
    if(origin&&(sameOrigin||allowedOrigins.includes(origin))){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/config'&&req.method==='GET')return send(res,200,{providers:Object.keys(keys).map(id=>({id,enabled:!!keys[id],model:models[id]})),requiresLogin:!!password,syncEnabled:!!password});
    if(url.pathname==='/api/login'&&req.method==='POST'){
      limited(req,'login',8);const input=await body(req);
      const actual=createHash('sha256').update(String(input.password||'')).digest();
      const expected=createHash('sha256').update(password).digest();
      if(!password||!timingSafeEqual(actual,expected))throw new HttpError(401,'Contraseña incorrecta.');
      const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+12*60*60*1000);return send(res,200,{token});
    }
    if(url.pathname==='/api/analyze'&&req.method==='POST'){
      if(!authenticated(req))throw new HttpError(401,'Conecta tu sesión en Ajustes para usar la IA.');
      limited(req,'analyze',20);
      const input=await body(req);
      if(typeof input.text!=='string'||!input.text.trim()||input.text.length>6000||typeof input.context!=='string'||input.context.length>2500)throw new HttpError(400,'Pasaje inválido o demasiado largo (máximo 6000 caracteres).');
      return send(res,200,await analyze(input.provider,input.text,input.context));
    }
    if(url.pathname==='/api/sync'&&['GET','POST'].includes(req.method)){
      if(!password||!authenticated(req))throw new HttpError(401,'La sincronización necesita una contraseña privada y una sesión conectada.');
      limited(req,'sync',12);
      if(req.method==='GET')return send(res,200,await synced.read());
      const input=await body(req,30*1024*1024);
      try{validateSnapshot(input);}catch(error){throw new HttpError(400,error.message);}
      return send(res,200,await synced.merge(input));
    }
    if(url.pathname.startsWith('/api/'))throw new HttpError(404,'Ruta no encontrada.');
    if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Método no permitido.');
    const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const file=path.resolve(ROOT,'.'+pathname);
    if(!file.startsWith(ROOT+path.sep))throw new HttpError(403,'Acceso denegado.');
    let bytes;try{bytes=await readFile(file);}catch{throw new HttpError(404,'Archivo no encontrado.');}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){if(!res.headersSent)send(res,error.status||500,{error:error.status?error.message:'No se pudo completar la solicitud.'});else res.end();}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!password&&!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Define APP_PASSWORD antes de exponer el servidor fuera de localhost.');
  const server=createServer();server.listen(Number(process.env.PORT)||3000,host,()=>console.log(`Entre líneas listo en http://${host}:${process.env.PORT||3000}`));
}
