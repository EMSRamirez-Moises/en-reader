import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
process.env.APP_PASSWORD='test-private-password';process.env.GEMINI_API_KEY='test-gemini-key';process.env.OPENAI_API_KEY='test-openai-key';
const temp=await mkdtemp(path.join(tmpdir(),'reader-http-'));process.env.DATA_DIR=temp;
const {createServer,analyze}=await import('../server.mjs');
const analysis={meaning:'Ella esperó.',scene:'Ella hizo una pausa y esperó.',fragments:[{en:'She waited.',phonetic:'shi uéitid',es:'Ella esperó.',hint:'Hace una pausa.',note:'',connectsTo:-1,adds:'La acción de ella',connection:'La oración presenta a ella y lo que hizo: esperó.'}]};
test('adaptador OpenAI conserva la clave en el servidor y usa JSON Schema',async()=>{
  let request;const result=await analyze('openai','She waited.','',async(url,options)=>{request={url,options};return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(analysis)}]}]})};});
  assert.equal(result.analysis.meaning,'Ella esperó.');assert.equal(result.analysis.fragments[0].connectsTo,-1);assert.equal(request.url,'https://api.openai.com/v1/responses');const payload=JSON.parse(request.options.body);assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);assert.ok(payload.text.format.schema.properties.fragments.items.required.includes('connectsTo'));assert.ok(request.options.headers.Authorization);assert.ok(!JSON.stringify(result).includes('test-openai-key'));
});
test('adaptador Gemini usa el mismo contrato de lectura',async()=>{
  let request;const result=await analyze('gemini','She waited.','',async(url,options)=>{request={url,options};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(analysis)}]}}]})};});
  assert.ok(request.options.headers['x-goog-api-key']);assert.equal(JSON.parse(request.options.body).generationConfig.responseMimeType,'application/json');assert.equal(result.analysis.fragments[0].en,'She waited.');
});
test('límites del proveedor y cambios del original son visibles',async()=>{
  await assert.rejects(analyze('gemini','She waited.','',async()=>({ok:false,status:429,json:async()=>({error:{message:'sensitive-account-detail'}})})),/límite de uso o saldo/);
  await assert.rejects(analyze('openai','She smiled.','',async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(analysis)}]}]})})),/cambió/);
  const incomplete=structuredClone(analysis);delete incomplete.scene;
  await assert.rejects(analyze('gemini','She waited.','',async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(incomplete)}]}}]})})),/conectan/);
});
test('HTTP: interfaz, acceso privado, sincronización y bloqueo de orígenes',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  try{
    const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/Entre líneas/);
    const config=await (await fetch(base+'/api/config')).json();assert.equal(config.requiresLogin,true);assert.equal(config.syncEnabled,true);assert.ok(!JSON.stringify(config).includes('test-openai-key'));
    assert.equal((await fetch(base+'/api/sync')).status,401);
    assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-private-password'})});const {token}=await login.json();assert.ok(token);
    const snapshot={version:1,books:[],states:[],cache:[],stats:[],deleted:[]};const uploaded=await fetch(base+'/api/sync',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(snapshot)});assert.equal(uploaded.status,200);
    const another=await (await fetch(base+'/api/sync',{headers:{Authorization:'Bearer '+token}})).json();assert.equal(another.version,1);
    assert.equal((await fetch(base+'/api/config',{headers:{Origin:'https://untrusted.example'}})).status,403);
    assert.equal((await fetch(base+'/.env')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});}
});
