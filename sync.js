/* =========================================
   Lumina Sync Engine
   ========================================= */

// sync.js — bagian atas
const API_URL = "https://script.google.com/macros/s/AKfycbzbYdcPjuZkMm6XwARZ-OCxCim-KyUNgVrjKIVWBfri2pIYEML7T6sOb2I0eYAia4HX/exec";
console.log("[Sync] API ->", API_URL);


/* =========================================
   API CALL
   ========================================= */

// sync.js — gantikan fungsi apiCall dengan ini
async function apiCall(action, data = {}) {
  const bodyStr = JSON.stringify({ action, ...data });

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"   // penting: text/plain agar tidak preflight
    },
    body: bodyStr,
    cache: "no-store"
  });

  const text = await res.text();
  try { return JSON.parse(text); }
  catch (e) { console.warn("[Sync] apiCall parse error", e, text); return {}; }
}


/* =========================================
   PULL
   ========================================= */

async function pullFromServer(){

try{

const photos = await apiCall("listPhotoMeta")

const diary = await apiCall("listDiary")

const agenda = await apiCall("listAgenda")

return{
photos,
diary,
agenda
}

}catch(err){

console.error("[Sync] pullFromServer error",err)

throw err

}

}


/* =========================================
   AUTO SYNC
   ========================================= */

function startAutoPull(){

setInterval(async()=>{

try{

await pullFromServer()

}catch(e){

console.warn("[Sync] autoPull error",e)

}

},3000)

}


export{

apiCall,
pullFromServer,
startAutoPull

}