// app.js — main boot controller (online-only variant)
import { setApiUrl, initSync, pullFromServer, enqueueSync } from './sync.js';
import { openDB, dbGetAll, dbPut } from './db.js'; // still use db.js for caching if needed
import { initDiary } from './diary.js';
import { initCalendar } from './calendar.js';
import { initPhotoGallery } from './drive.js';

const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbzbYdcPjuZkMm6XwARZ-OCxCim-KyUNgVrjKIVWBfri2pIYEML7T6sOb2I0eYAia4HX/exec";

async function boot(){
  console.log("[App] Boot start");
  // open IDB (kept for caching, optional)
  try{
    await openDB();
    console.log("[App] DB opened");
  }catch(e){
    console.warn("[App] openDB failed, continuing online-only", e);
  }

  // set API (dedicated)
  setApiUrl(DEFAULT_API_URL);

  // Init modules
  initDiary();        // Quill editor etc.
  initCalendar();
  initPhotoGallery();

  // init sync loop (pull)
  initSync(5000);

  // initial pull and render
  try{
    const payload = await pullFromServer();
    // dispatch event or call renderers - each module should listen or accept a function
    window.dispatchEvent(new CustomEvent('lumina:pull', { detail: payload }));
    console.log("[App] initial pull finished");
  }catch(e){
    console.warn("[App] initial pull failed", e);
  }

  // UI: show default tab (agenda) if not visible
  const agenda = document.getElementById('agenda-tab');
  if(agenda && !agenda.classList.contains('active')) agenda.classList.add('active');

  // attach nav
  document.querySelectorAll('.bottom-nav button').forEach(b=>{
    b.addEventListener('click', ()=> {
      const t = b.dataset.target;
      document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));
      const sel = document.getElementById(t + '-tab') || document.getElementById(t);
      if(sel) sel.classList.add('active');
    });
  });

  // wire upload button if present
  const uploadBtn = document.getElementById('btnUploadPhoto');
  if(uploadBtn){
    uploadBtn.addEventListener('click', async ()=>{
      const input = document.getElementById('photoInput');
      if(!input || !input.files || input.files.length===0) return alert("Choose file");
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const b64 = ev.target.result.split(',')[1];
        // enqueue upload job so UI can stay responsive
        enqueueSync({ entityType:'photo', operation:'upload', name: file.name, base64: b64 });
        // fire processQueue quickly
        // processQueue is internal to sync.js (scheduled). We optimistically refresh UI:
        setTimeout(()=> pullFromServer().then(p=>window.dispatchEvent(new CustomEvent('lumina:pull',{detail:p}))).catch(()=>{}), 1200);
      };
      reader.readAsDataURL(file);
    });
  }

  console.log("[App] Boot complete");
}

// Don't register service worker (online-only). If your repo previously registered it, remove that registration code.
boot();

// Let modules listen to lumina:pull to render
