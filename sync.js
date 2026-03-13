import {
dbGetAll,
dbPut,
getSyncQueue,
removeSyncItem,
markPhotoSynced,
getPhotoBlob,
generateId
} from "./db.js"

const API_URL="https://script.google.com/macros/s/AKfycbzbYdcPjuZkMm6XwARZ-OCxCim-KyUNgVrjKIVWBfri2pIYEML7T6sOb2I0eYAia4HX/exec"

let AUTO_PULL=null


export async function initSync(){

startAutoPull()

}


function startAutoPull(){

if(AUTO_PULL) clearInterval(AUTO_PULL)

AUTO_PULL=setInterval(async()=>{

await pullPhotos()

},4000)

}


export function scheduleSync(){

processQueue()

}


async function processQueue(){

const queue=await getSyncQueue()

for(const item of queue){

if(item.entityType==="photo"){

await uploadPhoto(item)

}

}

}


async function uploadPhoto(item){

const photo=await getPhotoBlob(item.localId)

if(!photo) return

const base64=await blobToBase64(photo.blob)

const res=await apiCall("uploadPhoto",{

base64,
name:photo.name

})

await markPhotoSynced(photo.id,res)

await removeSyncItem(item.id)

}


async function pullPhotos(){

const res=await apiCall("listPhotoMeta")

const remote=res.photos||[]

const local=await dbGetAll("photoBlobs")

const known=new Set(local.map(p=>p.driveId).filter(Boolean))

for(const r of remote){

if(known.has(r.driveId)) continue

await dbPut("photoBlobs",{

id:generateId("P"),

blob:null,

driveId:r.driveId,
driveUrl:r.driveUrl,
thumbUrl:r.thumbUrl,

name:r.name,

createdAt:r.createdAt,

syncStatus:"synced"

})

}

}


async function apiCall(action,data={}){

const res=await fetch(API_URL,{

method:"POST",

headers:{"Content-Type":"application/json"},

body:JSON.stringify({action,...data})

})

return res.json()

}


function blobToBase64(blob){

return new Promise((resolve,reject)=>{

const r=new FileReader()

r.onload=e=>resolve(e.target.result.split(",")[1])

r.onerror=reject

r.readAsDataURL(blob)

})

}


function generateId(prefix=""){

return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2)

}