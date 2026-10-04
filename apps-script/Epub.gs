function extractEpub_(blob, filename) {
  let unpacked;try{unpacked=Utilities.unzip(blob);}catch(error){fail_('EPUB_ZIP','El archivo no es un EPUB ZIP válido.');}
  if(unpacked.length>3000) fail_('EPUB_SIZE','El EPUB contiene demasiados recursos.');
  const files=Object.create(null);let expanded=0;
  unpacked.forEach(function(part){expanded+=part.getBytes().length;if(expanded>30*1024*1024) fail_('EPUB_SIZE','El EPUB descomprimido supera 30 MB.');files[part.getName()]=part;});
  function read(path){if(!Object.prototype.hasOwnProperty.call(files,path)) fail_('EPUB_RESOURCE','Falta un recurso necesario del EPUB.');const text=files[path].getDataAsString('UTF-8');if(text.length>MAX_TEXT_CHARS_) fail_('EPUB_SIZE','Un recurso excede el límite de texto.');return text;}
  const container=parseXml_(read('META-INF/container.xml'));
  const rootfiles=descendants_(container,'rootfile');
  const rootfile=rootfiles.find(function(node){return attr_(node,'media-type')==='application/oebps-package+xml';}) || rootfiles[0];
  if(!rootfile) fail_('EPUB_INDEX','Falta el índice del EPUB.');
  const opfPath=resolveEpubPath_('',attr_(rootfile,'full-path'));
  if(files['META-INF/encryption.xml']) {
    const encryption=parseXml_(read('META-INF/encryption.xml'));
    const encrypted=descendants_(encryption,'EncryptionMethod').some(function(node){const a=attr_(node,'Algorithm');return !/embedding|obfuscation/i.test(a);});
    if(encrypted) fail_('EPUB_DRM','Este EPUB contiene recursos cifrados. Usa una edición sin DRM.');
  }
  const opf=parseXml_(read(opfPath));const manifest=Object.create(null);
  descendants_(opf,'item').forEach(function(node){manifest[attr_(node,'id')]=node;});
  const spine=descendants_(opf,'itemref').filter(function(node){return attr_(node,'linear')!=='no';});
  const paragraphs=[],chapters=[];let total=0;
  spine.forEach(function(ref){
    const item=manifest[attr_(ref,'idref')];
    if(!item || !/^(application\/xhtml\+xml|text\/html)$/.test(attr_(item,'media-type')) || /(^|\s)nav(\s|$)/.test(attr_(item,'properties'))) return;
    const raw=read(resolveEpubPath_(opfPath,attr_(item,'href')));total+=raw.length;
    if(total>MAX_TEXT_CHARS_) fail_('EPUB_SIZE','El libro excede 2 MB de texto.');
    const doc=parseXml_(raw),body=descendants_(doc,'body')[0];
    if(!body) fail_('EPUB_XHTML','Una sección no contiene body XHTML.');
    const headings=descendants_(body,'h1').concat(descendants_(body,'h2'),descendants_(body,'h3'));
    const title=headings.length?cleanText_(headings[0]):'Sección '+(chapters.length+1);
    const chapter=chapters.length,start=paragraphs.length;
    const blocks=[];collectBlocks_(body,blocks);
    if(!blocks.length){const plain=cleanText_(body);if(plain)blocks.push(plain);}
    blocks.forEach(function(text){splitParagraph_(text,chapter).forEach(function(p){paragraphs.push(p);});});
    if(paragraphs.length>start) chapters.push({title:title || 'Sección '+(chapter+1),start:start});
  });
  if(!paragraphs.length) fail_('EPUB_EMPTY','No se encontró texto legible en el EPUB.');
  const titles=descendants_(opf,'title'),creators=descendants_(opf,'creator');
  return {title:titles.length?cleanText_(titles[0]):filename.replace(/\.epub$/i,''),author:creators.length?cleanText_(creators[0]):'Autor no indicado',paragraphs:paragraphs,chapters:chapters,warnings:[]};
}
function parseXml_(text) {
  if(/<!DOCTYPE[^>]*\[/i.test(text) || /<!ENTITY/i.test(text)) fail_('EPUB_XML','No se admiten declaraciones de entidades internas.');
  text=text.replace(/<!DOCTYPE[^>]*>/gi,'');
  const entities={nbsp:160,mdash:8212,ndash:8211,lsquo:8216,rsquo:8217,ldquo:8220,rdquo:8221,hellip:8230,copy:169,reg:174,trade:8482,bull:8226};
  text=text.replace(/&([a-zA-Z]+);/g,function(match,name){return Object.prototype.hasOwnProperty.call(entities,name)?'&#'+entities[name]+';':match;});
  try{return XmlService.parse(text).getRootElement();}catch(error){fail_('EPUB_XML','Una sección no es XHTML/XML válido. Puedes importarla con el lector local, más tolerante.');}
}
function descendants_(root,name) {
  const result=[];function visit(node){if(node.getName()===name)result.push(node);node.getChildren().forEach(visit);}visit(root);return result;
}
function attr_(node,name) {const a=node.getAttribute(name);return a?a.getValue():'';}
function cleanText_(node) {
  function walk(element){
    if(/^(script|style|noscript|nav|svg)$/i.test(element.getName()))return '';
    if(element.getName()==='br')return ' ';
    return element.getContent().map(function(content){const type=String(content.getType());if(type==='TEXT')return content.asText().getText();if(type==='CDATA')return content.asCdata().getText();if(type==='ELEMENT')return walk(content.asElement());return '';}).join('');
  }
  return walk(node).replace(/\s+/g,' ').trim();
}
function collectBlocks_(root,blocks) {
  if(/^(script|style|noscript|nav|svg)$/i.test(root.getName()))return;
  const block=/^(p|h[1-6]|li|blockquote)$/i.test(root.getName());
  const nested=root.getChildren().some(function(child){return /^(p|li|blockquote)$/i.test(child.getName()) || descendants_(child,'p').length || descendants_(child,'li').length || descendants_(child,'blockquote').length;});
  if(block&&!nested){const text=cleanText_(root);if(text)blocks.push(text);return;}
  root.getChildren().forEach(function(child){collectBlocks_(child,blocks);});
}
function splitParagraph_(text,chapter) {
  const result=[];let rest=text;
  while(rest.length>5000){let cut=rest.lastIndexOf(' ',5000);if(cut<1)cut=5000;result.push({text:rest.slice(0,cut).trim(),chapter:chapter});rest=rest.slice(cut).trim();}
  if(rest)result.push({text:rest,chapter:chapter});return result;
}
function resolveEpubPath_(base,relative) {
  if(!relative || /^[a-z]+:|^\/\//i.test(relative)) fail_('EPUB_PATH','No se permite contenido externo del EPUB.');
  let value;try{value=decodeURIComponent(relative.split('#')[0].split('?')[0]);}catch(error){fail_('EPUB_PATH','Ruta inválida en el EPUB.');}
  if(value.startsWith('/') || value.includes('\\')) fail_('EPUB_PATH','Ruta inválida en el EPUB.');
  const parts=base.split('/');parts.pop();
  value.split('/').forEach(function(part){if(part==='..'){if(!parts.length)fail_('EPUB_PATH','La ruta sale del EPUB.');parts.pop();}else if(part&&part!=='.')parts.push(part);});
  return parts.join('/');
}
