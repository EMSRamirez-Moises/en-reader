const MAX_BOOKS_ = 3;
const MAX_EPUB_BYTES_ = 5 * 1024 * 1024;
const MAX_TEXT_CHARS_ = 2 * 1024 * 1024;

function epubFiles_() {
  const iterator=DriveApp.getFolderById(config_().folderId).getFiles(), files=[];
  while(iterator.hasNext()) {
    const file=iterator.next();
    if(!file.isTrashed() && /\.epub$/i.test(file.getName())) files.push(file);
    if(files.length>MAX_BOOKS_) fail_('BOOK_LIMIT','La carpeta admite hasta tres EPUB. Retira uno antes de continuar.');
  }
  return files.sort(function(a,b){return a.getName().localeCompare(b.getName());});
}
function allowedFile_(id) {
  if(typeof id!=='string' || !/^[a-zA-Z0-9_-]{10,150}$/.test(id)) fail_('BOOK_ID','Identificador de libro inválido.');
  // Only files directly inside the configured private folder; never arbitrary Drive files.
  const file=epubFiles_().find(function(item){return item.getId()===id;});
  if(!file) fail_('BOOK_NOT_FOUND','El libro no está en tu carpeta privada.');
  if(file.getSize()>MAX_EPUB_BYTES_) fail_('BOOK_SIZE','El EPUB supera el límite de 5 MB de este backend ligero.');
  return file;
}
function revision_(file) {return String(file.getLastUpdated().getTime())+':'+String(file.getSize());}
function listBooks_() {
  return {books:epubFiles_().map(function(file){return {fileId:file.getId(),id:'drive:'+file.getId(),title:file.getName().replace(/\.epub$/i,''),bytes:file.getSize(),revision:revision_(file)};}),limit:MAX_BOOKS_};
}
function getBook_(fileId) {
  const file=allowedFile_(fileId),revision=revision_(file),key='book:'+digest_(fileId+':'+revision);
  const cache=CacheService.getScriptCache();let book;
  const hit=cache.get(key);if(hit){try{book=JSON.parse(hit);}catch(error){}}
  if(!book) {
    book=extractEpub_(file.getBlob().setContentType('application/zip'),file.getName());
    book.id='drive:'+fileId;book.fileId=fileId;book.revision=revision;book.createdAt=file.getLastUpdated().getTime();
    const encoded=JSON.stringify(book);
    // Cache values are limited to 100 KB; caching is optional, never the source of truth.
    if(Utilities.newBlob(encoded).getBytes().length<85000) cache.put(key,encoded,21600);
  }
  rememberBook_(fileId,revision,book.paragraphs.length);
  return book;
}
