// ============================================================
// Lumina — Code.gs  v3
// Required OAuth scopes (set in appsscript.json):
//   https://www.googleapis.com/auth/spreadsheets
//   https://www.googleapis.com/auth/drive
//   https://www.googleapis.com/auth/calendar
//   https://www.googleapis.com/auth/script.external_request
//   https://www.googleapis.com/auth/userinfo.email
// Spreadsheet: 1AG1Md8V9nfbelYVIqc51NY36Q9SP71fVA90yQtC1-MU
// Drive folder: 1WxSO1sm4NIWj2vkeMvC2QrEHzyTAioc_
// ============================================================
var CONFIG = {
  SPREADSHEET_ID:  '1AG1Md8V9nfbelYVIqc51NY36Q9SP71fVA90yQtC1-MU',
  DRIVE_FOLDER_ID: '1WxSO1sm4NIWj2vkeMvC2QrEHzyTAioc_',
  CALENDAR_ID:     'primary',
  VERSION:         '3.0.0'
};

// Sheet schemas
var DIARY_HEADERS  = ['id','date','title','content_html','photo_urls','mood','updatedAt','createdBy'];
var AGENDA_HEADERS = ['id','gcal_id','date','end_date','start_time','end_time','all_day','title','description','color','recur','recur_end','reminder','updatedAt','createdBy'];
var PHOTOS_HEADERS = ['id','name','drive_id','thumb_url','drive_url','entry_id','createdAt'];
var MONEY_HEADERS  = ['id','date','type','category','amount','notes','updatedAt','createdBy','payment_method','admin_fee'];
var NOTES_HEADERS  = ['id','title','content_html','canvas_data','color','pinned','tags','updatedAt','createdBy'];
var SETTINGS_HEADERS = ['key','value','updatedAt']; // shared settings synced across devices: profiles, categories, paymentMethods

var DC = {id:1,date:2,title:3,content_html:4,photo_urls:5,mood:6,updatedAt:7,createdBy:8};
var AC = {id:1,gcal_id:2,date:3,end_date:4,start_time:5,end_time:6,all_day:7,title:8,description:9,color:10,recur:11,recur_end:12,reminder:13,updatedAt:14,createdBy:15};
var PC = {id:1,name:2,drive_id:3,thumb_url:4,drive_url:5,entry_id:6,createdAt:7};
var MC = {id:1,date:2,type:3,category:4,amount:5,notes:6,updatedAt:7,createdBy:8,payment_method:9,admin_fee:10};
var NC = {id:1,title:2,content_html:3,canvas_data:4,color:5,pinned:6,tags:7,updatedAt:8,createdBy:9};

function makeResp(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}

// ── Cache helpers (TTL 5 min via CacheService) ───────────────
var _cache = CacheService.getScriptCache();
var CACHE_TTL = 300; // seconds

function cacheGet(key){
  try{ var v=_cache.get(key); return v?JSON.parse(v):null; }catch(e){ return null; }
}
function cachePut(key,val){
  try{ _cache.put(key, JSON.stringify(val), CACHE_TTL); }catch(e){}
}
function cacheInvalidate(){
  try{ _cache.removeAll(['lumina_diaries','lumina_agendas','lumina_moneys','lumina_notes']); }catch(e){}
}
function cacheInvalidateSettings(){
  try{ _cache.remove('lumina_settings'); }catch(e){}
}
function ok(data){return makeResp({ok:true,data:data});}
function fail(msg,code){return makeResp({ok:false,error:msg,code:code||'ERROR'});}
function isoNow(){return new Date().toISOString();}
function genId(){return Utilities.getUuid();}
// Reads a cell's existing value on update, returns '' for new rows or on error.
// Used to preserve fields (like createdBy) that should only be set once, at creation.
function getExistingValue(sh,row,col){
  if(row===-1) return '';
  try{ return v(sh.getRange(row,col).getValue()); }catch(e){ return ''; }
}
function v(x){return x===null||x===undefined?'':String(x);}
function fmtDate(x){
  if(!x)return '';
  if(x instanceof Date){
    var y=x.getFullYear();
    var m=String(x.getMonth()+1).padStart(2,'0');
    var d=String(x.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+d;
  }
  var s=String(x);
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  try{var dt=new Date(s);if(!isNaN(dt)){var y2=dt.getFullYear();var m2=String(dt.getMonth()+1).padStart(2,'0');var d2=String(dt.getDate()).padStart(2,'0');return y2+'-'+m2+'-'+d2;}}catch(e){}
  return s;
}
function fmtDateTime(x){
  if(!x)return '';
  if(x instanceof Date){
    var y=x.getFullYear(),mo=String(x.getMonth()+1).padStart(2,'0'),d=String(x.getDate()).padStart(2,'0');
    var h=String(x.getHours()).padStart(2,'0'),mi=String(x.getMinutes()).padStart(2,'0'),s=String(x.getSeconds()).padStart(2,'0');
    return y+'-'+mo+'-'+d+'T'+h+':'+mi+':'+s;
  }
  var s=String(x);
  return s;
}

function getSheet(name,headers){
  var ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sh=ss.getSheetByName(name);
  if(!sh){
    sh=ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1,1,1,headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Adds any missing header columns to an existing sheet. Run via migrateSheets(). */
function ensureSheetColumns(name,headers){
  var ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sh=ss.getSheetByName(name);
  if(!sh){Logger.log(name+': sheet not found, skipping');return;}
  var lastCol=sh.getLastColumn();
  if(lastCol<headers.length){
    for(var i=lastCol;i<headers.length;i++){
      sh.getRange(1,i+1).setValue(headers[i]);
      sh.getRange(1,i+1).setFontWeight('bold');
    }
    Logger.log('[Sheet] Added '+(headers.length-lastCol)+' columns to '+name+': '+headers.slice(lastCol).join(', '));
  } else {
    Logger.log('[Sheet] '+name+' already has '+lastCol+' columns (need '+headers.length+') — OK');
  }
}

/** Run this once after deploying to fix sheets with old column structure.
    Select migrateSheets in editor → Run → check Logs */
function migrateSheets(){
  ensureSheetColumns('Diary',  DIARY_HEADERS);
  ensureSheetColumns('Agenda', AGENDA_HEADERS);
  ensureSheetColumns('Photos', PHOTOS_HEADERS);
  ensureSheetColumns('Money',  MONEY_HEADERS);
  ensureSheetColumns('Notes',  NOTES_HEADERS);
  ensureSheetColumns('Settings', SETTINGS_HEADERS);
  // Show current headers for verification
  var ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  ['Diary','Agenda','Photos','Money','Notes','Settings'].forEach(function(name){
    var sh=ss.getSheetByName(name);
    if(!sh){Logger.log(name+': NOT FOUND');return;}
    var cols=sh.getLastColumn();
    if(cols<1){Logger.log(name+': empty');return;}
    var hdrs=sh.getRange(1,1,1,cols).getValues()[0];
    Logger.log(name+' ('+cols+' cols): '+hdrs.join(' | '));
  });
  Logger.log('=== Migration complete ===');
}
function sheetGetAll(name,headers){
  var sh=getSheet(name,headers);
  var last=sh.getLastRow();
  if(last<2)return[];
  var lastCol=sh.getLastColumn();
  if(lastCol<1)return[];
  // Use headers.length as the target width, but don't read beyond actual cols
  var readCols=Math.min(lastCol, headers.length);
  var rows=sh.getRange(2,1,last-1,readCols).getValues();
  // Pad each row to headers.length so column indexes always work
  return rows.map(function(r){
    while(r.length<headers.length)r.push('');
    return r;
  });
}
// Known limitation: O(n) linear scan over the whole ID column on every save/delete.
// Fine at household scale (thousands of rows); would need a real index if this ever
// grows to tens of thousands of rows (multi-year daily use across many sheets).
function sheetFindById(sh,col,id){
  var last=sh.getLastRow();if(last<2)return -1;
  var ids=sh.getRange(2,col,last-1,1).getValues();
  for(var i=0;i<ids.length;i++){if(String(ids[i][0])===String(id))return i+2;}
  return -1;
}

function doGet(){
  return ok({app:'Lumina',version:CONFIG.VERSION,ts:isoNow()});
}

// This function is NEVER called but its presence forces GAS to
// include Calendar scope in the OAuth consent screen.
// Do NOT delete or wrap in try/catch.
function _scopeHint_calendar(){
  CalendarApp.getAllCalendars();
  CalendarApp.getDefaultCalendar();
}

function doPost(e){
  try{
    var p=JSON.parse((e.postData||{}).contents||'{}');
    var action=p.action;
    Logger.log('action='+action);
    switch(action){
      case 'saveDiary':    return saveDiary(p);
      case 'getDiaries':   return getDiaries();
      case 'deleteDiary':  return deleteDiary(p);
      case 'saveAgenda':   return saveAgenda(p);
      case 'getAgendas':   return getAgendas(p);
      case 'deleteAgenda': return deleteAgenda(p);
      case 'uploadPhoto':  return uploadPhoto(p);
      case 'getPhotos':    return getPhotos(p);
      case 'deletePhoto':  return deletePhoto(p);
      case 'saveMoney':    return saveMoney(p);
      case 'getMoneys':    return getMoneys(p);
      case 'deleteMoney':  return deleteMoney(p);
      case 'saveNote':     return saveNote(p);
      case 'getNotes':     return getNotes();
      case 'deleteNote':   return deleteNote(p);
      case 'saveSetting':  return saveSetting(p);
      case 'getSettings':  return getSettings();
      case 'getCalendars':    return getCalendars();
      case 'importFromGCal':  return importFromGCal(p);
      case 'ensureLuminaCal': return ok({id: getLuminaCalendar().getId(), name: LUMINA_CAL_NAME});
      case 'ping':         return ok({pong:true,ts:isoNow()});
      default:             return fail('Unknown action: '+action);
    }
  }catch(ex){Logger.log('ERROR: '+ex.message+'\n'+ex.stack);return fail(ex.message,'INTERNAL_ERROR');}
}

// ── DIARY ───────────────────────────────────────────────────
function saveDiary(p){
  var sh=getSheet('Diary',DIARY_HEADERS);var now=isoNow();var id=p.id||genId();
  var row=sheetFindById(sh,DC.id,id);
  // Preserve existing createdBy on update; only set on new records
  var createdBy=row===-1?v(p.createdBy):getExistingValue(sh,row,DC.createdBy);
  var data=[id,v(p.date)||now.slice(0,10),v(p.title),v(p.content_html),v(p.photo_urls),v(p.mood),now,createdBy];
  if(row===-1)sh.appendRow(data);else sh.getRange(row,1,1,data.length).setValues([data]);
  cacheInvalidate();
  return ok({id:id,updatedAt:now});
}
function getDiaries(){
  var cached=cacheGet('lumina_diaries');if(cached)return ok(cached);
  var rows=sheetGetAll('Diary',DIARY_HEADERS);
  var out=rows.filter(function(r){return r[0];}).map(function(r){
    return{id:v(r[0]),date:fmtDate(r[1]),title:v(r[2]),content_html:v(r[3]),photo_urls:v(r[4]),mood:v(r[5]),updatedAt:v(r[6]),createdBy:v(r[7])};
  }).sort(function(a,b){return b.date.localeCompare(a.date);});
  cachePut('lumina_diaries',{entries:out});
  return ok({entries:out});
}
function deleteDiary(p){
  var sh=getSheet('Diary',DIARY_HEADERS);var row=sheetFindById(sh,DC.id,p.id);
  if(row!==-1)sh.deleteRow(row);cacheInvalidate();return ok({deleted:true});
}

// ── AGENDA (with Google Calendar sync) ─────────────────────
function saveAgenda(p){
  if(!p.title)return fail('Missing title');
  var sh=getSheet('Agenda',AGENDA_HEADERS);var now=isoNow();var id=p.id||genId();
  var row=sheetFindById(sh,AC.id,id);
  var gcalId=v(p.gcal_id);

  // Sync to Google Calendar
  try{
    var cal=getLuminaCalendar(); // Save to dedicated Lumina calendar
    var startDt=p.start_time?new Date(p.start_time):new Date(p.date+'T09:00:00');
    var endDt  =p.end_time  ?new Date(p.end_time)  :new Date((p.end_date||p.date)+'T10:00:00');
    var opts={description:v(p.description)};
    if(p.color)opts.color=_colorToCalEnum(p.color);

    // Build recurrence rule array for GCal
    var recurrence=null;
    if(p.recur){
      var rrule='RRULE:FREQ='+p.recur.replace('WEEKDAYS','WEEKLY');
      if(p.recur==='WEEKDAYS')rrule+=';BYDAY=MO,TU,WE,TH,FR';
      if(p.recur_end)rrule+=';UNTIL='+p.recur_end.replace(/-/g,'')+'T235959Z';
      recurrence=[rrule];
    }

    var eventRef=null; // reused below for reminder — avoids a second getEventById round-trip
    if(gcalId){
      try{
        eventRef=cal.getEventById(gcalId);
        if(eventRef){
          eventRef.setTitle(v(p.title));
          eventRef.setDescription(v(p.description));
          if(!p.all_day){eventRef.setTime(startDt,endDt);}
        }
      }catch(eErr){gcalId='';eventRef=null;}
    }
    if(!gcalId){
      if(p.all_day){
        var endAllDay=new Date((p.end_date||p.date)+'T12:00:00');
        eventRef=cal.createAllDayEvent(v(p.title),new Date(p.date),endAllDay,opts);
      }else{
        eventRef=cal.createEvent(v(p.title),startDt,endDt,opts);
      }
      gcalId=eventRef.getId();
    }
    // Set popup reminder after event is created/updated — reuse eventRef, no extra fetch
    if(p.reminder&&parseInt(p.reminder)>0){
      try{
        var reminderMins=parseInt(p.reminder);
        if(eventRef){eventRef.removeAllReminders();eventRef.addPopupReminder(reminderMins);}
      }catch(remErr){Logger.log('Reminder set error (non-fatal): '+remErr.message);}
    }
  }catch(calErr){Logger.log('Calendar sync error (non-fatal): '+calErr.message);}

  var createdByA=row===-1?v(p.createdBy):getExistingValue(sh,row,AC.createdBy);
  var data=[id,gcalId,v(p.date),v(p.end_date)||v(p.date),v(p.start_time),v(p.end_time),v(p.all_day)||'false',v(p.title),v(p.description),v(p.color)||'#f59e0b',v(p.recur),v(p.recur_end),v(p.reminder),now,createdByA];
  if(row===-1)sh.appendRow(data);else sh.getRange(row,1,1,data.length).setValues([data]);
  cacheInvalidate();
  return ok({id:id,gcal_id:gcalId,updatedAt:now});
}

function getAgendas(p){
  var cached=cacheGet('lumina_agendas');
  var out=cached?cached.events:null;
  if(!out){
    var rows=sheetGetAll('Agenda',AGENDA_HEADERS);
    out=rows.filter(function(r){return r[0];}).map(function(r){
      return{id:v(r[0]),gcal_id:v(r[1]),date:fmtDate(r[2]),end_date:fmtDate(r[3]),start_time:fmtDateTime(r[4]),end_time:fmtDateTime(r[5]),
             all_day:v(r[6])==='true',title:v(r[7]),description:v(r[8]),color:v(r[9])||'#f59e0b',recur:v(r[10]),recur_end:fmtDate(r[11]),reminder:v(r[12]),updatedAt:v(r[13]),createdBy:v(r[14])};
    }).sort(function(a,b){return a.date.localeCompare(b.date);});
    cachePut('lumina_agendas',{events:out});
  }
  if(p&&p.month)out=out.filter(function(r){return r.date.slice(0,7)===p.month;});
  return ok({events:out});
}

function deleteAgenda(p){
  var sh=getSheet('Agenda',AGENDA_HEADERS);var row=sheetFindById(sh,AC.id,p.id);
  if(row!==-1){
    // Also delete from Google Calendar
    if(p.gcal_id){try{var ev=getLuminaCalendar().getEventById(p.gcal_id);if(ev)ev.deleteEvent();}catch(e){}}
    sh.deleteRow(row);
  }
  cacheInvalidate();
  return ok({deleted:true});
}

function _colorToCalEnum(hex){
  var map={'#ef4444':'RED','#f97316':'ORANGE','#f59e0b':'YELLOW','#10b981':'GREEN',
           '#3b82f6':'BLUE','#8b5cf6':'GRAPE','#ec4899':'FLAMINGO','#6b7280':'GRAPHITE'};
  return map[hex]||'BLUEBERRY';
}

// ── PHOTOS ──────────────────────────────────────────────────
function uploadPhoto(p){
  if(!p.base64)return fail('Missing base64');
  var b64=p.base64.indexOf(',')!==-1?p.base64.split(',')[1]:p.base64;
  var bytes=Utilities.base64Decode(b64);
  var blob=Utilities.newBlob(bytes,p.type||'image/jpeg');
  var ts=new Date().getTime();
  var safe=(p.name||'photo.jpg').replace(/[^a-zA-Z0-9._-]/g,'_');
  blob.setName('lumina_'+ts+'_'+safe);
  var folder;try{folder=DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);}catch(e){folder=DriveApp.createFolder('Lumina Photos');}
  var file=folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  var driveId=file.getId();
  var thumbUrl='https://drive.google.com/thumbnail?id='+driveId+'&sz=w400';
  var driveUrl='https://drive.google.com/uc?export=view&id='+driveId;
  var id=p.id||genId();var now=isoNow();
  getSheet('Photos',PHOTOS_HEADERS).appendRow([id,blob.getName(),driveId,thumbUrl,driveUrl,v(p.entry_id),now]);
  Logger.log('Uploaded: '+driveId);
  return ok({id:id,driveId:driveId,thumbUrl:thumbUrl,driveUrl:driveUrl});
}
function getPhotos(p){
  var rows=sheetGetAll('Photos',PHOTOS_HEADERS);
  var out=rows.filter(function(r){return r[0];}).map(function(r){
    return{id:v(r[0]),name:v(r[1]),driveId:v(r[2]),thumbUrl:v(r[3]),driveUrl:v(r[4]),entryId:v(r[5]),createdAt:v(r[6])};
  }).filter(function(r){return!p||!p.entry_id||r.entryId===p.entry_id;})
    .sort(function(a,b){return b.createdAt.localeCompare(a.createdAt);});
  return ok({photos:out});
}
function deletePhoto(p){
  var sh=getSheet('Photos',PHOTOS_HEADERS);
  if(p.id){var row=sheetFindById(sh,PC.id,p.id);if(row!==-1)sh.deleteRow(row);}
  if(p.driveId){try{DriveApp.getFileById(p.driveId).setTrashed(true);}catch(e){}}
  return ok({deleted:true});
}

// ── MONEY ───────────────────────────────────────────────────
function saveMoney(p){
  if(!p.amount)return fail('Missing amount');
  var sh=getSheet('Money',MONEY_HEADERS);var now=isoNow();var id=p.id||genId();
  var row=sheetFindById(sh,MC.id,id);
  var createdByM=row===-1?v(p.createdBy):getExistingValue(sh,row,MC.createdBy);
  var data=[id,v(p.date)||now.slice(0,10),v(p.type)||'expense',v(p.category),parseFloat(p.amount)||0,v(p.notes),now,createdByM,v(p.payment_method)||'cash',parseFloat(p.admin_fee)||0];
  if(row===-1)sh.appendRow(data);else sh.getRange(row,1,1,data.length).setValues([data]);
  cacheInvalidate();
  return ok({id:id,updatedAt:now});
}
function getMoneys(p){
  var cached=cacheGet('lumina_moneys');
  var out=cached?cached.transactions:null;
  if(!out){
    var rows=sheetGetAll('Money',MONEY_HEADERS);
    out=rows.filter(function(r){return r[0];}).map(function(r){
      return{id:v(r[0]),date:fmtDate(r[1]),type:v(r[2]),category:v(r[3]),amount:parseFloat(r[4])||0,notes:v(r[5]),updatedAt:v(r[6]),createdBy:v(r[7]),payment_method:v(r[8])||'cash',admin_fee:parseFloat(r[9])||0};
    }).sort(function(a,b){return b.date.localeCompare(a.date);});
    cachePut('lumina_moneys',{transactions:out});
  }
  if(p&&p.month)out=out.filter(function(r){return r.date.slice(0,7)===p.month;});
  return ok({transactions:out});
}
function deleteMoney(p){
  var sh=getSheet('Money',MONEY_HEADERS);var row=sheetFindById(sh,MC.id,p.id);
  if(row!==-1)sh.deleteRow(row);cacheInvalidate();return ok({deleted:true});
}

// ── NOTES ───────────────────────────────────────────────────
function saveNote(p){
  var sh=getSheet('Notes',NOTES_HEADERS);var now=isoNow();var id=p.id||genId();
  var row=sheetFindById(sh,NC.id,id);
  var createdBy=row===-1?v(p.createdBy):getExistingValue(sh,row,NC.createdBy);
  var data=[id,v(p.title),v(p.content_html),v(p.canvas_data),v(p.color)||'#ffffff',p.pinned?'true':'false',v(p.tags),now,createdBy];
  if(row===-1)sh.appendRow(data);else sh.getRange(row,1,1,data.length).setValues([data]);
  cacheInvalidate();
  return ok({id:id,updatedAt:now});
}
function getNotes(){
  var cached=cacheGet('lumina_notes');if(cached)return ok(cached);
  var rows=sheetGetAll('Notes',NOTES_HEADERS);
  var out=rows.filter(function(r){return r[0];}).map(function(r){
    return{id:v(r[0]),title:v(r[1]),content_html:v(r[2]),canvas_data:v(r[3]),color:v(r[4])||'#ffffff',pinned:v(r[5])==='true',tags:v(r[6]),updatedAt:v(r[7]),createdBy:v(r[8])};
  }).sort(function(a,b){return b.updatedAt.localeCompare(a.updatedAt);});
  cachePut('lumina_notes',{notes:out});
  return ok({notes:out});
}
function deleteNote(p){
  var sh=getSheet('Notes',NOTES_HEADERS);var row=sheetFindById(sh,NC.id,p.id);
  if(row!==-1)sh.deleteRow(row);cacheInvalidate();return ok({deleted:true});
}

// ── SETTINGS (shared across devices: profiles, categories, paymentMethods) ──
function saveSetting(p){
  if(!p.key) return fail('Missing key');
  var sh=getSheet('Settings',SETTINGS_HEADERS);var now=isoNow();
  var row=sheetFindById(sh,1,p.key);
  var data=[p.key, JSON.stringify(p.value), now];
  if(row===-1)sh.appendRow(data);else sh.getRange(row,1,1,data.length).setValues([data]);
  cacheInvalidateSettings();
  return ok({key:p.key,updatedAt:now});
}
function getSettings(){
  var cached=cacheGet('lumina_settings');if(cached)return ok(cached);
  var sh=getSheet('Settings',SETTINGS_HEADERS);
  var last=sh.getLastRow();
  var out={};
  if(last>=2){
    var rows=sh.getRange(2,1,last-1,2).getValues();
    rows.forEach(function(r){
      if(!r[0]) return;
      try{ out[r[0]]=JSON.parse(r[1]); }catch(e){ out[r[0]]=null; }
    });
  }
  cachePut('lumina_settings',out);
  return ok(out);
}

function debugSetup(){
  Logger.log('Sheet: '+SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getName());
  Logger.log('Folder: '+DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID).getName());
  Logger.log('Calendars:');
  CalendarApp.getAllCalendars().forEach(function(cal){
    Logger.log('  - '+cal.getName()+' ('+cal.getId()+')');
  });
  Logger.log('OK - all scopes authorized');
}

// ── RUN THIS FUNCTION FIRST to grant Calendar permission ──
// In Apps Script editor: select authorizeCalendar → Run → Allow
function authorizeCalendar(){
  var cals = CalendarApp.getAllCalendars();
  Logger.log('Calendar authorization SUCCESS. Found '+cals.length+' calendars:');
  cals.forEach(function(cal){ Logger.log('  '+cal.getName()); });
  // Also ensure Lumina calendar exists
  var lc = getLuminaCalendar();
  Logger.log('Lumina calendar ready: '+lc.getName()+' ('+lc.getId()+')');
}

// ════════════════════════════════════════════════════════════
//  CALENDAR MANAGEMENT
// ════════════════════════════════════════════════════════════

var LUMINA_CAL_NAME = 'Lumina';

/** Get or create the dedicated Lumina calendar */
function getLuminaCalendar(){
  var cals = CalendarApp.getCalendarsByName(LUMINA_CAL_NAME);
  if(cals.length > 0) return cals[0];
  var cal = CalendarApp.createCalendar(LUMINA_CAL_NAME, {
    summary: 'Events created in Lumina',
    color: CalendarApp.Color.ORANGE
  });
  Logger.log('[Calendar] Created Lumina calendar: ' + cal.getId());
  return cal;
}

/** List all calendars the user has access to */
// Well-known calendar IDs
var HOLIDAY_CALS = {
  'id': {id:'en.indonesian#holiday@group.v.calendar.google.com', name:'Hari Libur Indonesia', color:'#0f9d58'},
  'en': {id:'en.indonesian#holiday@group.v.calendar.google.com', name:'Indonesian Holidays',  color:'#0f9d58'},
};

function getCalendars(){
  try{
    var cals = CalendarApp.getAllCalendars();
    var userEmail = Session.getActiveUser().getEmail();
    var out = cals.map(function(cal){
      return {
        id:        cal.getId(),
        name:      cal.getName(),
        color:     cal.getColor(),
        isLumina:  cal.getName() === LUMINA_CAL_NAME,
        isPrimary: cal.getId() === userEmail,
        isHoliday: false
      };
    });

    // Ensure Lumina calendar exists and is first
    var hasLumina = out.some(function(c){ return c.isLumina; });
    if(!hasLumina){
      var lc = getLuminaCalendar();
      out.unshift({id:lc.getId(), name:lc.getName(), color:lc.getColor(), isLumina:true, isPrimary:false, isHoliday:false});
    }

    // Add Indonesian holidays if not already in list
    var idHolId = HOLIDAY_CALS['id'].id;
    var hasIdHol = out.some(function(c){ return c.id === idHolId; });
    if(!hasIdHol){
      out.push({
        id:        idHolId,
        name:      'Hari Libur Indonesia 🇮🇩',
        color:     '#0f9d58',
        isLumina:  false,
        isPrimary: false,
        isHoliday: true
      });
    }

    // Sort: Lumina first, then primary, then others alphabetically, holidays last
    out.sort(function(a,b){
      if(a.isLumina) return -1; if(b.isLumina) return 1;
      if(a.isPrimary) return -1; if(b.isPrimary) return 1;
      if(a.isHoliday) return 1; if(b.isHoliday) return -1;
      return (a.name||'').localeCompare(b.name||'');
    });

    return ok({calendars: out});
  }catch(e){
    Logger.log('[getCalendars] error: ' + e.message);
    return fail(e.message, 'CALENDAR_LIST_ERROR');
  }
}

/** Import events from selected Google Calendars (read-only, not stored in Sheet) */
function importFromGCal(params){
  try{
    var calIds  = params.calendarIds || [];
    var start   = params.start ? new Date(params.start) : new Date();
    var end     = params.end   ? new Date(params.end)   : new Date(start.getTime() + 90*24*60*60*1000); // 90 days

    var events = [];
    calIds.forEach(function(calId){
      try{
        var cal = CalendarApp.getCalendarById(calId);
        if(!cal) return;
        var calEvents = cal.getEvents(start, end);
        calEvents.forEach(function(ev){
          var startDt = ev.isAllDayEvent() ? null : ev.getStartTime();
          var endDt   = ev.isAllDayEvent() ? null : ev.getEndTime();
          events.push({
            gcal_id:    ev.getId(),
            title:      ev.getTitle(),
            description:ev.getDescription() || '',
            date:       ev.isAllDayEvent() ? fmtDate(ev.getAllDayStartDate()) : fmtDate(startDt),
            end_date:   ev.isAllDayEvent() ? fmtDate(ev.getAllDayEndDate())   : fmtDate(endDt),
            start_time: startDt ? fmtDateTime(startDt) : null,
            end_time:   endDt   ? fmtDateTime(endDt)   : null,
            all_day:    ev.isAllDayEvent(),
            color:      _gcalColorToHex(cal.getColor()),
            calendar_id:   calId,
            calendar_name: cal.getName(),
            source:     'gcal'  // marks as imported, not stored in Lumina sheet
          });
        });
      }catch(calErr){ Logger.log('[importGCal] cal error: ' + calErr.message); }
    });

    events.sort(function(a,b){ return (a.date||'').localeCompare(b.date||''); });
    return ok({events: events, count: events.length});
  }catch(e){
    Logger.log('[importFromGCal] error: ' + e.message);
    return fail(e.message, 'GCAL_IMPORT_ERROR');
  }
}

function _gcalColorToHex(color){
  var map = {
    '#ac725e':'#a52714','#d06b64':'#ef4444','#f83a22':'#dc2626',
    '#fa573c':'#f97316','#ff7537':'#f97316','#ffad46':'#f59e0b',
    '#42d692':'#10b981','#16a765':'#16a34a','#7bd148':'#4ade80',
    '#b3dc6c':'#86efac','#9fe1e7':'#67e8f9','#9fc6e7':'#93c5fd',
    '#4986e7':'#3b82f6','#9a9cff':'#818cf8','#b99aff':'#a78bfa',
    '#c2c2c2':'#6b7280','#cabdbf':'#9ca3af','#cca6ac':'#f9a8d4',
    '#f691b2':'#ec4899','#cd74e6':'#c084fc','#a47ae2':'#8b5cf6'
  };
  return map[color] || color || '#3b82f6';
}
