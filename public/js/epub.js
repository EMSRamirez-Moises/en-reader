const MAX_FILE=30*1024*1024, MAX_TEXT=20*1024*1024;
function parseXml(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('El EPUB contiene un documento XML inválido.');return doc;}
const elements=(doc,name)=>Array.from(doc.getElementsByTagName('*')).filter(node=>node.localName===name || node.tagName.split(':').at(-1)===name);
function resolvePath(base,relative){const url=new URL(relative,'https://epub.local/'+base);if(url.origin!=='https://epub.local')throw new Error('El libro hace referencia a contenido externo.');return decodeURIComponent(url.pathname.slice(1));}
export function textParagraphs(text, chapter=0){
  const blocks=text.trim().split(/\n\s*\n/u).map(s=>s.replace(/\s+/gu,' ').trim()).filter(Boolean);
  return blocks.flatMap(block=>{
    if(block.length<=5000)return [{text:block,chapter}];
    const segments=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(block),s=>s.segment):block.match(/[^.!?]+[.!?]*/g)||[block];
    const result=[];let current='';
    for(const part of segments){if(current.length+part.length>5000&&current){result.push({text:current.trim(),chapter});current='';}if(part.length>5000){if(current){result.push({text:current.trim(),chapter});current='';}let rest=part;while(rest.length>5000){let cut=rest.lastIndexOf(' ',5000);if(cut<1)cut=5000;result.push({text:rest.slice(0,cut).trim(),chapter});rest=rest.slice(cut).trimStart();}current=rest;}else current+=part;}
    if(current.trim())result.push({text:current.trim(),chapter});return result;
  });
}
export async function importEpub(file,onProgress=()=>{}){
  if(file.size>MAX_FILE)throw new Error('El EPUB supera el límite de 30 MB.');
  if(typeof window.JSZip!=='function')throw new Error('No se pudo cargar el lector EPUB. Revisa que la carpeta vendor esté incluida.');
  const zip=await window.JSZip.loadAsync(await file.arrayBuffer());
  if(Object.keys(zip.files).length>15000)throw new Error('El archivo contiene demasiados recursos.');
  async function read(name){const item=zip.file(name);if(!item)throw new Error('Falta un recurso del EPUB: '+name);if(item._data?.uncompressedSize>MAX_TEXT)throw new Error('El recurso del EPUB es demasiado grande.');const value=await item.async('string');if(value.length>MAX_TEXT)throw new Error('El recurso del EPUB es demasiado grande.');return value;}
  const container=parseXml(await read('META-INF/container.xml'));
  const opfPath=elements(container,'rootfile').find(node=>node.getAttribute('media-type')==='application/oebps-package+xml')?.getAttribute('full-path')||elements(container,'rootfile')[0]?.getAttribute('full-path');
  if(!opfPath)throw new Error('El EPUB no contiene un índice de contenido válido.');
  if(zip.file('META-INF/encryption.xml')){const enc=parseXml(await read('META-INF/encryption.xml'));if(elements(enc,'EncryptedData').some(node=>{const algorithm=elements(node,'EncryptionMethod')[0]?.getAttribute('Algorithm')||'';return !algorithm.includes('embedding')&&!algorithm.includes('obfuscation');}))throw new Error('Este EPUB contiene recursos cifrados. Usa una edición sin DRM.');}
  const opf=parseXml(await read(opfPath));
  const manifest=new Map(elements(opf,'item').map(node=>[node.getAttribute('id'),node]));
  const spine=elements(opf,'itemref').filter(node=>node.getAttribute('linear')!=='no');
  const paragraphs=[],chapters=[],warnings=[];let total=0;
  for(let i=0;i<spine.length;i++){
    const item=manifest.get(spine[i].getAttribute('idref'));
    if(!item||!['application/xhtml+xml','text/html'].includes(item.getAttribute('media-type')))continue;
    if((item.getAttribute('properties')||'').split(' ').includes('nav'))continue;
    onProgress(`Leyendo sección ${i+1} de ${spine.length}…`);
    try{
      const contents=await read(resolvePath(opfPath,item.getAttribute('href')));total+=contents.length;if(total>MAX_TEXT)throw new Error('El libro supera el límite de texto de 20 MB.');
      const doc=new DOMParser().parseFromString(contents,'text/html');doc.querySelectorAll('script,style,noscript,nav,svg').forEach(node=>node.remove());
      const heading=doc.querySelector('h1,h2,h3')?.textContent?.trim()||`Sección ${chapters.length+1}`;
      const chapter=chapters.length;const start=paragraphs.length;
      const nodes=Array.from(doc.body.querySelectorAll('p,h1,h2,h3,h4,li,blockquote')).filter(node=>!node.querySelector('p,li,blockquote'));
      for(const node of nodes){const clean=node.textContent.replace(/\s+/gu,' ').trim();if(clean)paragraphs.push(...textParagraphs(clean,chapter));}
      if(!nodes.length){const clean=doc.body.textContent.replace(/\s+/gu,' ').trim();if(clean)paragraphs.push(...textParagraphs(clean,chapter));}
      if(paragraphs.length>start)chapters.push({title:heading,start});
    }catch(error){if(error.message.includes('límite')||error.message.includes('demasiado grande'))throw error;warnings.push(`No se pudo leer la sección ${i+1}.`);}
  }
  if(!paragraphs.length)throw new Error('No se encontró texto legible. Puede ser un EPUB de imágenes o un archivo dañado.');
  return {title:elements(opf,'title')[0]?.textContent?.trim()||file.name.replace(/\.epub$/i,''),author:elements(opf,'creator')[0]?.textContent?.trim()||'Autor no indicado',paragraphs,chapters,warnings};
}
