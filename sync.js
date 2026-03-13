/* ============================================================
   Lumina — sync.js (stability patched)
   - default API URL fallback
   - JSON headers
   - tolerant field parsing (camelCase / snake_case)
   - emits lumina:pulled events
   ============================================================ */

import {
  dbGetAll,
  dbPut,
  getSetting,
  setSetting,
  getSyncQueue,
  removeSyncItem,
  markPhotoSynced,
  getPhotoBlob,
  generateId
} from './db.js';

export { enqueueSync } from './db.js'; // leave enqueueSync exported by db layer

// Default API URL (your Apps Script endpoint)
const DEFAULT_API = 'https://script.google.com/macros/s/AKfycbzbYdcPjuZkMm6XwARZ-OCxCim-KyUNgVrjKIVWBfri2pIYEML7T6sOb2I0eYAia4HX/exec';

let _apiUrl = '';
let _syncInProgress = false;
let _autoPullTimer = null;

// Initialize sync
export async function initSync() {
  _apiUrl = await getSetting('apiUrl', '') || DEFAULT_API;
  // save back default so UI shows it if needed
  await setSetting('apiUrl', _apiUrl);

  startAutoPull();
  console.log('[Sync] initialized with API:', _apiUrl);
}

// Allow app to override if needed
export function setApiUrl(url) {
  _apiUrl = url || _apiUrl;
  setSetting('apiUrl', _apiUrl).catch(() => {});
}

// Auto pull loop (short interval for near-realtime; adjust if throttling)
function startAutoPull() {
  if (_autoPullTimer) clearInterval(_autoPullTimer);
  _autoPullTimer = setInterval(async () => {
    if (!navigator.onLine) return;
    try {
      await pullFromServer();
    } catch (err) {
      console.warn('[Sync] autoPull error', err);
    }
  }, 3000); // every 3 seconds (adjust as needed)
}

// Public scheduleSync trigger
export function scheduleSync(delay = 1000) {
  setTimeout(() => processQueue().catch(e => console.warn('[Sync] processQueue', e)), delay);
}

// Process local queue (uploads)
export async function processQueue() {
  if (_syncInProgress) return;
  _syncInProgress = true;
  try {
    const queue = await getSyncQueue();
    for (const item of queue) {
      if (item.entityType === 'photo') {
        await uploadPhoto(item);
      }
      // extend for diary/agenda if queue contains them
    }
  } finally {
    _syncInProgress = false;
  }
}

// uploadPhoto sends base64 to Apps Script and marks local record with driveId
async function uploadPhoto(item) {
  const photo = await getPhotoBlob(item.localId);
  if (!photo) return;

  const base64 = await blobToBase64(photo.blob);

  const res = await apiCall('uploadPhoto', { base64, name: photo.name });

  if (res && res.driveId) {
    await markPhotoSynced(photo.id, {
      driveId: res.driveId,
      driveUrl: res.driveUrl,
      thumbUrl: res.thumbUrl
    });
    await removeSyncItem(item.id);
  } else {
    console.warn('[Sync] uploadPhoto no driveId in response', res);
  }
}

// Pull metadata (photos, diary, agenda) from server
export async function pullFromServer() {
  if (!_apiUrl) {
    console.warn('[Sync] No API URL configured');
    return { photos: 0, diary: 0, agenda: 0 };
  }

  try {
    const res = await apiCall('listPhotoMeta');
    const remotePhotos = (res && res.photos) || [];

    const localPhotos = await dbGetAll('photoBlobs');
    const known = new Set(localPhotos.map(p => p.driveId).filter(Boolean));

    let added = 0;
    for (const remote of remotePhotos) {
      // tolerate both snake_case and camelCase from server
      const driveId = remote.driveId || remote.drive_id;
      if (!driveId) continue;
      if (known.has(driveId)) continue;

      const thumbUrl = remote.thumbUrl || remote.thumb_url || `https://drive.google.com/thumbnail?id=${driveId}&sz=w400`;
      const driveUrl = remote.driveUrl || remote.drive_url || `https://drive.google.com/uc?export=view&id=${driveId}`;

      await dbPut('photoBlobs', {
        id: generateId('P'),
        entryId: remote.entryId || remote.entry_id || null,
        blob: null,
        thumbnail: null,
        name: remote.name || 'photo.jpg',
        mimeType: remote.mimeType || 'image/jpeg',
        width: remote.width || 0,
        height: remote.height || 0,
        sizeBytes: remote.sizeBytes || 0,
        driveId,
        driveUrl,
        thumbUrl,
        syncStatus: 'synced',
        errorMsg: null,
        createdAt: remote.createdAt || remote.created_at || new Date().toISOString()
      });

      known.add(driveId);
      added++;
    }

    if (added > 0) {
      console.log('[Sync] photos pulled:', added);
      window.dispatchEvent(new CustomEvent('lumina:pulled', { detail: { photos: added } }));
    }

    // TODO: pull diary/agenda similarly by calling listDiary/listAgenda endpoints (if implemented)
    return { photos: added, diary: 0, agenda: 0 };
  } catch (err) {
    console.error('[Sync] pullFromServer error', err);
    throw err;
  }
}

// Generic API call to Apps Script (POST JSON)
async function apiCall(action,data={}){

const res = await fetch(API_URL,{

method:"POST",

headers:{
"Content-Type":"text/plain"
},

body:JSON.stringify({
action,
...data
})

})

return res.json()

}

/* ============================================================
   Utilities
   ============================================================ */

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const base64 = r.result.split(',')[1];
      resolve(base64);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
export async function checkReminders() {
  try {

    const events = await dbGetAll("agenda");

    const now = new Date();

    for (const event of events) {

      if (event.deleted) continue;

      if (event.reminderFired) continue;

      const start = new Date(event.startTime);

      const reminderTime = new Date(start.getTime() - (event.reminderMinutes || 30) * 60000);

      if (now >= reminderTime && now < start) {

        if (Notification.permission === "granted") {

          new Notification("Upcoming event", {
            body: event.title || "Agenda reminder",
            tag: event.id
          });

        }

        event.reminderFired = true;

        await dbPut("agenda", event);

      }

    }

  } catch (err) {

    console.warn("[Sync] reminder check error", err);

  }
}