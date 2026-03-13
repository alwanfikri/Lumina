import { openDB } from "./db.js";
import { initSync, scheduleSync } from "./sync.js";
import { initDiary } from "./diary.js";
import { initCalendar } from "./calendar.js";
import { initPhotoGallery } from "./drive.js";

async function boot() {

console.log("Lumina boot start");

try {

await openDB();
console.log("DB OK");

await initSync();
console.log("SYNC OK");

await initDiary();
console.log("DIARY OK");

await initCalendar();
console.log("CALENDAR OK");

initPhotoGallery();
console.log("PHOTOS OK");

document.getElementById("sync-btn")
?.addEventListener("click",()=>scheduleSync());

}
catch(err) {

console.error("BOOT ERROR:", err);

}

const splash=document.getElementById("splash");

if(splash) splash.style.display="none";

console.log("Lumina boot finished");

}

boot();