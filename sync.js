/* ============================================================
   Lumina Sync Engine (stable)
   ============================================================ */

let API_URL = "";

export function setApiUrl(url){
 API_URL = url;
}

/* ================================
   API CALL (NO CORS PREFLIGHT)
   ================================ */

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
  console.error("[Sync] invalid JSON",text);
  return {};
 }

}

/* ================================
   SYNC QUEUE
   ================================ */

const queue = [];
let processing = false;

export async function enqueueSync(job){

 queue.push(job);

 scheduleSync();

}

/* ================================
   SCHEDULE
   ================================ */

export function scheduleSync(delay=500){

 setTimeout(processQueue,delay);

}

/* ================================
   PROCESS QUEUE
   ================================ */

async function processQueue(){

 if(processing) return;
 if(queue.length===0) return;

 processing=true;

 const job = queue.shift();

 try{

  await apiCall({
   action:"sync",
   job
  });

 }catch(err){

  console.warn("[Sync] retry",err);
  queue.push(job);

 }

 processing=false;

 if(queue.length>0){
  scheduleSync(1000);
 }

}

/* ================================
   PULL SERVER DATA
   ================================ */

export async function pullFromServer(){

 try{

  const res = await apiCall({
   action:"pull"
  });

  return res;

 }catch(err){

  console.error("[Sync] pull error",err);

 }

}

/* ================================
   AUTO PULL
   ================================ */

export async function initSync(){

 setInterval(()=>{
  pullFromServer();
 },5000);

 console.log("[Sync] initialized");

}

/* ================================
   REMINDERS
   ================================ */

export function checkReminders(){

 // simple placeholder
 console.log("[Sync] reminder check");

}
