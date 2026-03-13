import { openDB } from "./db.js";
import { initSync, scheduleSync } from "./sync.js";
import { initDiary } from "./diary.js";
import { initCalendar } from "./calendar.js";
import { initPhotoGallery } from "./drive.js";

async function boot(){

try{

await openDB();

await initSync();

await initDiary();

await initCalendar();

initPhotoGallery();

document.getElementById("sync-btn")
?.addEventListener("click",()=>scheduleSync());

}catch(err){

console.error("BOOT ERROR:",err);

}

document.getElementById("splash").style.display="none";

}

boot();