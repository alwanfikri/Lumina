/* ============================================================
   Lumina — app.js (stability patched)
   - Removes Service Worker registration (online-only)
   - Sets default API URL so no manual settings required
   - Adds boot timeout fallback so splash never permanently stuck
   ============================================================ */

import { openDB, getSetting } from './db.js';
import { initSync, setApiUrl, scheduleSync, pullFromServer } from './sync.js';
import { initDiary, openDiaryEditor } from './diary.js';
import { initCalendar, openEventEditor } from './calendar.js';
import { initPhotoGallery } from './drive.js';

const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzbYdcPjuZkMm6XwARZ-OCxCim-KyUNgVrjKIVWBfri2pIYEML7T6sOb2I0eYAia4HX/exec';

// Boot sequence
async function boot() {
  console.log('[App] Boot start');

  // Ensure we hide splash after N seconds even if something goes wrong
  const splashTimeout = setTimeout(() => {
    const s = document.getElementById('splash');
    if (s) s.style.display = 'none';
    console.warn('[App] Splash fallback triggered (timeout)');
  }, 8000);

  try {
    // open DB (idb must be loaded in index.html)
    await openDB();
    console.log('[App] DB opened');

    // Set API URL default (dedicated app — no user input required)
    const configured = await getSetting('apiUrl', '');
    if (!configured) {
      setApiUrl(DEFAULT_API_URL);
      console.log('[App] set default API URL');
    } else {
      setApiUrl(configured);
      console.log('[App] using configured API URL');
    }

    // Init sync (this will schedule auto pulls)
    await initSync();

    // Initialize features (these modules use db.js & sync.js)
    await initDiary();
    await initCalendar();
    initPhotoGallery();

    // Bind global UI events
    document.getElementById('fab-diary')?.addEventListener('click', () => openDiaryEditor());
    document.getElementById('fab-agenda')?.addEventListener('click', () => openEventEditor());
    document.getElementById('gallery-upload-btn')?.addEventListener('click', () => {
      document.getElementById('gallery-upload-input')?.click();
    });
    document.getElementById('sync-btn')?.addEventListener('click', () => scheduleSync(0));

    // Optional: do an initial pull (safe — uses server list endpoint)
    setTimeout(() => {
      pullFromServer().catch(err => console.warn('[App] initial pull failed', err));
    }, 600);

    console.log('[App] Boot complete');
  } catch (err) {
    console.error('[App] Boot error:', err);
  } finally {
    // hide splash (either normal or after error)
    const s = document.getElementById('splash');
    if (s) {
      s.style.opacity = '0';
      setTimeout(() => { s.style.display = 'none'; s.style.opacity = '1'; }, 400);
    }
    clearTimeout(splashTimeout);
  }
}

// IMPORTANT: we are not registering a Service Worker here in online-only mode.
// If you later want PWA, re-enable SW registration carefully and bump cache version.

boot();