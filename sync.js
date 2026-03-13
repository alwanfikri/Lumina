/* =========================================
   Lumina Sync Engine
   ========================================= */

const API_URL =
"https://script.google.com/macros/s/AKfycbzbYdcPjuZkMm6XwARZ-OCxCim-KyUNgVrjKIVWBfri2pIYEML7T6sOb2I0eYAia4HX/exec"

console.log("[Sync] initialized with API:", API_URL)


/* =========================================
   API CALL
   ========================================= */

async function apiCall(action,data={}){

const res = await fetch(API_URL,{

method:"POST",

headers:{
"Content-Type":"text/plain;charset=utf-8"
},

body:JSON.stringify({
action,
...data
})

})

const text = await res.text()

return JSON.parse(text)

}


/* =========================================
   SYNC QUEUE
   ========================================= */

const syncQueue = []

function enqueueSync(action,data){

syncQueue.push({
action,
data,
time:Date.now()
})

processQueue()

}


/* =========================================
   SCHEDULE SYNC
   ========================================= */

function scheduleSync(action,data){

setTimeout(()=>{

enqueueSync(action,data)

},500)

}


/* =========================================
   PROCESS QUEUE
   ========================================= */

async function processQueue(){

if(syncQueue.length===0) return

const job = syncQueue.shift()

try{

await apiCall(job.action,job.data)

}catch(err){

console.warn("[Sync] retry later",err)

syncQueue.push(job)

}

}


/* =========================================
   PULL FROM SERVER
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


/* =========================================
   EXPORT
   ========================================= */

export{

apiCall,
enqueueSync,
scheduleSync,
pullFromServer,
startAutoPull

}