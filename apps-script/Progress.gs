function sheet_(name) {const sheet=SpreadsheetApp.openById(config_().sheetId).getSheetByName(name);if(!sheet)fail_('CONFIG','Ejecuta setup_ antes de usar el backend.');return sheet;}
function rows_(sheet,columns) {return sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,columns).getValues():[];}
function rememberBook_(fileId,revision,count) {
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))fail_('BUSY','El servicio está ocupado. Vuelve a intentar.');
  try{const sheet=sheet_('Books'),rows=rows_(sheet,3),at=rows.findIndex(function(row){return row[0]===fileId;});const row=[fileId,revision,count];if(at<0)sheet.appendRow(row);else sheet.getRange(at+2,1,1,3).setValues([row]);SpreadsheetApp.flush();}finally{lock.releaseLock();}
}
function progressFromRow_(row) {
  if(!row)return null;
  return {fileId:String(row[0]),revision:String(row[1]),index:Number(row[2]),bookmarks:JSON.parse(row[3] || '[]'),version:Number(row[4]),updatedAt:Number(row[5]),device:String(row[6]),operationId:String(row[7])};
}
function getProgress_(fileId) {
  const file=allowedFile_(fileId),revision=revision_(file);
  const row=rows_(sheet_('Progress'),8).find(function(r){return r[0]===fileId;});
  const state=progressFromRow_(row);
  return {state:state,revision:revision,changed:!!state&&state.revision!==revision};
}
function saveProgress_(data) {
  const file=allowedFile_(data.fileId),revision=revision_(file);
  if(data.revision!==revision)fail_('BOOK_CHANGED','El EPUB cambió. Vuelve a abrirlo antes de guardar el avance.');
  if(!Number.isInteger(data.expectedVersion)||data.expectedVersion<0 || !Number.isInteger(data.index)||data.index<0 || !Array.isArray(data.bookmarks) || data.bookmarks.length>200 || typeof data.device!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(data.device) || typeof data.operationId!=='string' || !/^[a-zA-Z0-9-]{16,80}$/.test(data.operationId))fail_('PROGRESS','Avance inválido.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))fail_('BUSY','El servicio está ocupado. Vuelve a intentar.');
  try{
    const info=rows_(sheet_('Books'),3).find(function(row){return row[0]===data.fileId;});
    if(!info || info[1]!==revision)fail_('BOOK_NOT_OPENED','Abre el libro antes de guardar el avance.');
    const count=Number(info[2]);if(data.index>=count || data.bookmarks.some(function(n){return !Number.isInteger(n)||n<0||n>=count;}))fail_('PROGRESS','La ubicación o un marcador está fuera del libro.');
    const sheet=sheet_('Progress'),rows=rows_(sheet,8),at=rows.findIndex(function(row){return row[0]===data.fileId;});
    const current=progressFromRow_(at<0?null:rows[at]);
    if(current&&current.operationId===data.operationId)return {saved:true,state:current};
    if((current?current.version:0)!==data.expectedVersion)return {saved:false,conflict:true,state:current};
    const row=[data.fileId,revision,data.index,JSON.stringify(Array.from(new Set(data.bookmarks)).sort(function(a,b){return a-b;})),data.expectedVersion+1,Date.now(),data.device,data.operationId];
    if(at<0)sheet.appendRow(row);else sheet.getRange(at+2,1,1,8).setValues([row]);SpreadsheetApp.flush();
    return {saved:true,state:progressFromRow_(row)};
  }finally{lock.releaseLock();}
}
