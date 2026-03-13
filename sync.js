/* ============================================================
   Lumina Sync Engine — fixed
   Compatible with drive.js, diary.js, calendar.js
   No CORS preflight
   ============================================================ */

let API_URL = "";

/* =========================================
   API URL
   ========================================= */

export function setApiUrl(url){
  API_URL = url;
  console.log("[Sync] initialized with API:", API_URL);
}

/* =========================================
   API CALL
   ========================================= */

async function apiCall(payload){

  const res = await fetch(API_URL,{
    method:"POST",
    headers:{
      "Content-Type":"text/plain;charset=utf-8"
    },
    body:JSON.stringify(payload)
  });

  const text = await res.text();

  try{
    return JSON.parse(text);
  }catch(e){
    console.warn("[Sync] JSON parse failed",text);
    return {};
  }

}

/* =========================================
   SYNC QUEUE
   ========================================= */

const queue = [];
let processing = false;

export async function enqueueSync(job){

  queue.push(job);

  scheduleSync();

}

/* =========================================
   SCHEDULE SYNC
   ========================================= */

export function scheduleSync(delay=800){

  setTimeout(processQueue,delay);

}

/* =========================================
   PROCESS QUEUE
   ========================================= */

async function processQueue(){

  if(processing) return;
  if(queue.length===0) return;

  processing = true;

  const job = queue.shift();

  try{

    await apiCall({
      action:"sync",
      job
    });

  }catch(err){

    console.warn("[Sync] retry later",err);

    queue.push(job);

  }

  processing = false;

  if(queue.length>0){
    scheduleSync(1000);
  }

}

/* =========================================
   PULL SERVER DATA
   ========================================= */

export async function pullFromServer(){

  try{

    const photos = await apiCall({action:"listPhotoMeta"});
    const diary  = await apiCall({action:"listDiary"});
    const agenda = await apiCall({action:"listAgenda"});

    return {
      photos,
      diary,
      agenda
    };

  }catch(err){

    console.warn("[Sync] pullFromServer error",err);

  }

}

/* =========================================
   AUTO SYNC
   ========================================= */

export async function initSync(){

  console.log("[Sync] init");

  setInterval(()=>{

    pullFromServer();

  },5000);

}

/* =========================================
   REMINDERS
   ========================================= */

export function checkReminders(){

  console.log("[Sync] reminder check");

}
