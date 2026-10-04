import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {Window} from 'happy-dom';

function fixture(){
 const window=new Window();const xml=new window.DOMParser();
 const nodes=node=>({getName:()=>node.localName,getAttribute:name=>node.hasAttribute(name)?{getValue:()=>node.getAttribute(name)}:null,getChildren:()=>Array.from(node.children).map(nodes),getContent:()=>Array.from(node.childNodes).map(part=>({getType:()=>part.nodeType===1?'ELEMENT':part.nodeType===4?'CDATA':'TEXT',asElement:()=>nodes(part),asText:()=>({getText:()=>part.textContent}),asCdata:()=>({getText:()=>part.textContent})}))});
 const props=new Map([['DRIVE_FOLDER_ID','private-folder'],['SHEET_ID','private-sheet'],['ALLOWED_ORIGIN','https://emsramirez-moises.github.io'],['APP_PASSWORD','a-long-private-password-123456']]);
 const cached=new Map(),sheets=new Map();
 class Sheet {constructor(){this.data=[];}getLastRow(){return this.data.length;}appendRow(row){this.data.push([...row]);}getRange(row,column,n,cols){return {getValues:()=>this.data.slice(row-1,row-1+n).map(r=>r.slice(column-1,column-1+cols)),setValues:values=>values.forEach((value,i)=>{this.data[row-1+i] ||= [];this.data[row-1+i].splice(column-1,cols,...value);})};}}
 const workbook={getSheetByName:name=>sheets.get(name),insertSheet:name=>{const sheet=new Sheet();sheets.set(name,sheet);return sheet;}};
 const entries=new Map();const blob=(text,name='')=>({getName:()=>name,getDataAsString:()=>String(text),getBytes:()=>Array.from(Buffer.from(text)),setContentType(){return this;}});
 entries.set('META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
 entries.set('OPS/book.opf','<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Private story</dc:title><dc:creator>Author</dc:creator></metadata><manifest><item id="a" href="one.xhtml" media-type="application/xhtml+xml"/><item id="b" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>');
 entries.set('OPS/one.xhtml','<html><body><h1>Second</h1><p>She opened <em>the</em> door.</p><script>bad()</script></body></html>');
 entries.set('OPS/two.xhtml','<!DOCTYPE html><html><body><h1>First</h1><p>There was&nbsp;a sound &mdash; of music.</p><nav><p>Skip this menu</p></nav></body></html>');
 const fileId='private_epub_123456789',files=[{getId:()=>fileId,getName:()=> 'story.epub',isTrashed:()=>false,getSize:()=>1000,getLastUpdated:()=>new Date(1760000000000),getBlob:()=>blob('zip')}];
 const context=vm.createContext({console,Date,Map,Set,Number,JSON,Math,Array,Object,String,Error,
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)||null,setProperty:(key,value)=>{props.set(key,value);},deleteProperty:key=>props.delete(key)})},
 CacheService:{getScriptCache:()=>({get:key=>cached.get(key)||null,put:(key,value)=>cached.set(key,value),remove:key=>cached.delete(key)})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 DriveApp:{getFolderById:id=>{assert.equal(id,'private-folder');let i=0;return {getName:()=> 'Private EPUBs',getFiles:()=>({hasNext:()=>i<files.length,next:()=>files[i++]})};}},
 SpreadsheetApp:{openById:id=>{assert.equal(id,'private-sheet');return workbook;},flush:()=>{}},
 Utilities:{getUuid:randomUUID,Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algorithm,text)=>createHash(algorithm).update(text).digest(),computeHmacSha256Signature:(text,key)=>createHmac('sha256',key).update(text).digest(),base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'),base64DecodeWebSafe:value=>Buffer.from(value,'base64url'),newBlob:value=>blob(Buffer.isBuffer(value)?value.toString('utf8'):value),unzip:()=>[...entries].map(([name,text])=>blob(text,name))},
 XmlService:{parse:text=>{const doc=xml.parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('xml');return {getRootElement:()=>nodes(doc.documentElement)};}}
 });
 return {context,window,entries,files,fileId,props,sheets};
}
async function load(){const f=fixture();for(const name of ['Code','Drive','Epub','Progress'])vm.runInContext(await readFile(new URL(`../apps-script/${name}.gs`,import.meta.url),'utf8'),f.context,{filename:name+'.gs'});f.context.setup_();return f;}
const json=value=>JSON.parse(JSON.stringify(value));
test('Apps Script: carpeta privada, extracción por spine y progreso con conflictos',async()=>{
 const f=await load(),api=request=>json(f.context.rpc(request));
 try{
  assert.equal(f.props.has('APP_PASSWORD'),false);
  assert.equal(api({action:'listBooks'}).error.code,'AUTH');
  assert.equal(api({action:'login',data:{password:'wrong'}}).error.code,'LOGIN');
  const login=api({action:'login',data:{password:'a-long-private-password-123456'}});assert.equal(login.ok,true);const token=login.data.token;
  const call=(action,data={})=>api({action,token,data});
  assert.equal(call('listBooks').data.books.length,1);
  assert.equal(call('getBook',{fileId:'outside_epub_123456'}).error.code,'BOOK_NOT_FOUND');
  const book=call('getBook',{fileId:f.fileId}).data;assert.equal(book.title,'Private story');assert.equal(book.id,'drive:'+f.fileId);
  assert.deepEqual(book.chapters,[{title:'First',start:0},{title:'Second',start:2}]);assert.equal(book.paragraphs[1].text,'There was a sound — of music.');assert.equal(book.paragraphs[3].text,'She opened the door.');
  assert.ok(book.paragraphs.every(p=>!p.text.includes('bad()')&&!p.text.includes('Skip this menu')));
  const payload={fileId:f.fileId,revision:book.revision,index:2,bookmarks:[1],expectedVersion:0,device:'device-a',operationId:randomUUID()};
  const saved=call('saveProgress',payload);assert.equal(saved.data.saved,true);assert.equal(saved.data.state.version,1);
  const duplicate=call('saveProgress',payload);assert.equal(duplicate.data.state.version,1);
  const stale=call('saveProgress',{...payload,index:0,device:'device-b',operationId:randomUUID()});assert.equal(stale.data.conflict,true);assert.equal(stale.data.state.index,2);
  const fresh=call('saveProgress',{...payload,index:0,expectedVersion:1,device:'device-b',operationId:randomUUID()});assert.equal(fresh.data.saved,true);assert.equal(fresh.data.state.index,0,'Retroceder conscientemente es válido');
  assert.equal(call('getProgress',{fileId:f.fileId}).data.state.version,2);
  assert.equal(call('saveProgress',{...payload,index:999,expectedVersion:2,operationId:randomUUID()}).error.code,'PROGRESS');
  assert.equal(call('saveProgress',{...payload,revision:'old',expectedVersion:2,operationId:randomUUID()}).error.code,'BOOK_CHANGED');
  assert.equal(api({action:'listBooks',token:token+'tampered'}).error.code,'AUTH');
 }finally{await f.window.happyDOM.abort();}
});
test('Apps Script: límites y EPUB externo, cifrado o incompleto se rechazan',async()=>{
 const f=await load();try{
  assert.throws(()=>f.context.resolveEpubPath_('OPS/book.opf','https://external.test/x'),/externo/);
  assert.throws(()=>f.context.resolveEpubPath_('OPS/book.opf','../../escape'),/sale/);
  assert.throws(()=>f.context.parseXml_('<!DOCTYPE html [<!ENTITY secret "x">]><html/>'),/entidades/);
  f.entries.set('META-INF/encryption.xml','<encryption><EncryptionMethod Algorithm="AES"/></encryption>');assert.throws(()=>f.context.extractEpub_(f.files[0].getBlob(),'book.epub'),/cifrados/);f.entries.delete('META-INF/encryption.xml');
  f.entries.delete('OPS/two.xhtml');assert.throws(()=>f.context.extractEpub_(f.files[0].getBlob(),'book.epub'),/Falta un recurso/);
  for(let i=0;i<3;i++)f.files.push({...f.files[0],getId:()=> 'extra_epub_'+i});assert.throws(()=>f.context.listBooks_(),/tres EPUB/);
 }finally{await f.window.happyDOM.abort();}
});
test('puente: contraseña fuera de la URL, mensajes de otro origen/canal rechazados',async()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 const window=new Window({url:'https://emsramirez-moises.github.io/en-reader/'});
 globalThis.window=window;globalThis.document=window.document;
 const {DriveReaderAPI}=await import('../public/js/drive-api.js');
 const api=new DriveReaderAPI('https://script.google.com/macros/s/test-deployment/exec');
 const sent=[],peer={postMessage:(message,origin)=>sent.push({message,origin})};
 const message=(origin,data,source=peer)=>api.listener({origin,data,source});
 try{
  assert.throws(()=>new DriveReaderAPI('https://evil.example/exec'),/dirección/);
  message('https://evil.example',{channel:api.channel,type:'reader-ready'});assert.equal(api.peer,null);
  message('https://trusted-script.googleusercontent.com',{channel:'wrong',type:'reader-ready'});assert.equal(api.peer,null);
  message('https://trusted-script.googleusercontent.com',{channel:api.channel,type:'reader-ready'});await api.ready;assert.equal(api.peer,peer);
  const login=api.login('private-password-for-test');await Promise.resolve();
  const request=sent.at(-1).message;assert.equal(request.request.data.password,'private-password-for-test');assert.ok(!api.frame.src.includes('password'));assert.ok(!api.frame.src.includes('token'));
  message('https://evil.example',{channel:api.channel,type:'reader-response',id:request.id,result:{ok:true,data:{token:'bad'}}});assert.equal(api.pending.size,1);
  message('https://trusted-script.googleusercontent.com',{channel:api.channel,type:'reader-response',id:request.id,result:{ok:true,data:{token:'good',expiresAt:123}}},{postMessage(){}});assert.equal(api.pending.size,1);
  message('https://trusted-script.googleusercontent.com',{channel:api.channel,type:'reader-response',id:request.id,result:{ok:true,data:{token:'good',expiresAt:123}}});await login;assert.equal(api.token,'good');assert.equal(api.pending.size,0);
 }finally{api.close();globalThis.window=previousWindow;globalThis.document=previousDocument;await window.happyDOM.abort();}
});
