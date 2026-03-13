/* sync.js — online-only sync adapter for Lumina
   - Sends text/plain to avoid preflight CORS
   - Exports: setApiUrl, apiCall, enqueueSync, scheduleSync, processQueue,
              pullFromServer, initSync, checkReminders
*/

const DEFAULT_API = "https://script.google.com/macros/s/AKfycbzbYdcPjuZkMm6XwARZ-OCxCim-KyUNgVrjKIVWBfri2pIYEML7T6sOb2I0eYAia4HX/exec";
let API_URL = DEFAULT_API;

// allow overriding before or at boot
export function setApiUrl(url){ if(url) API_URL = url; console.log("[Sync] API URL:", API_URL); }

// low-level HTTP helper (text/plain)
export async function apiCall(payload){
  if(!API_URL) throw new Error("API_URL not set");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  const txt = await res.text();
  try { return JSON.parse(txt); }
  catch(e){ console.warn("[Sync] apiCall: parse failed", e, txt); return {}; }
}

/* ---------------- queue ---------------- */
const queue = [];
let processing = false;

export function enqueueSync(job){
  if(!job || typeof job !== "object") return;
  queue.push(job);
  scheduleSync(150);
}

export function scheduleSync(delay=800, maybeJob){
  if(maybeJob) enqueueSync(maybeJob);
  setTimeout(()=>{ processQueue().catch(e=>console.warn("[Sync] processQueue", e)); }, delay);
}

export async function processQueue(){
  if(processing) return;
  if(queue.length === 0) return;
  processing = true;
  const job = queue.shift();
  try{
    const resp = await apiCall({ action: "sync", job });
    if(resp && resp.error){
      console.warn("[Sync] server error:", resp.error);
      // requeue with backoff
      queue.push(job);
    }
  }catch(err){
    console.warn("[Sync] network error, requeue", err);
    queue.push(job);
  }finally{
    processing = false;
    if(queue.length > 0) scheduleSync(1000);
  }
}

/* ---------------- pullFromServer ----------------
   expects server to accept {action:"pull"} and return:
   { photos:{photos:[...]}, diary:{entries:[...]}, agenda:{events:[...]} }
*/
export async function pullFromServer(){
  try{
    const res = await apiCall({ action: "pull" });
    return res || {};
  }catch(err){
    console.warn("[Sync] pullFromServer error", err);
    throw err;
  }
}

/* ---------------- auto pull ---------------- */
let autoHandle = null;
export function initSync(pollMs = 5000){
  if(autoHandle) clearInterval(autoHandle);
  autoHandle = setInterval(()=>{ pullFromServer().catch(e=>console.warn("[Sync] autoPull", e)); }, pollMs);
  console.log("[Sync] initSync pollMs=", pollMs);
}

/* ---------------- reminders ---------------- */
export async function checkReminders(getLocalAgendaFn, markLocalFn){
  // Optionally accept helper functions to read/write local DB if needed.
  // If you don't pass them, this is a no-op placeholder that modules can call.
  if(typeof getLocalAgendaFn !== "function") { console.log("[Sync] checkReminders: no local fn provided"); return; }
  try{
    const events = await getLocalAgendaFn() || [];
    const now = Date.now();
    for(const ev of events){
      if(!ev || ev._deleted) continue;
      if(ev.reminderFired) continue;
      const start = ev.startTime ? new Date(ev.startTime) : null;
      if(!start || isNaN(start.getTime())) continue;
      const minutesBefore = Number(ev.reminderMinutes) || 30;
      const reminderAt = start.getTime() - minutesBefore * 60000;
      if(now >= reminderAt && now < start.getTime()){
        if("Notification" in window && Notification.permission === "granted"){
          new Notification(ev.title || "Agenda reminder", { body: ev.description || "" , tag: ev.id });
        } else if("Notification" in window && Notification.permission !== "denied"){
          Notification.requestPermission().then(p => { if(p==="granted") new Notification(ev.title || "Agenda reminder", { body: ev.description || "" }); });
        }
        if(typeof markLocalFn === "function"){
          ev.reminderFired = true;
          try{ await markLocalFn(ev); }catch(e){ console.warn("[Sync] checkReminders markLocal failed", e); }
        }
      }
    }
  }catch(e){
    console.warn("[Sync] checkReminders error", e);
  }
}
