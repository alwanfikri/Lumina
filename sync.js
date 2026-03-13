/* ============================================================
   Lumina — sync.js (FULL replacement)
   - Exports: setApiUrl, enqueueSync, scheduleSync, pullFromServer,
              initSync, checkReminders
   - Uses text/plain POST (to avoid preflight/CORS)
   - Robust: catches parse errors and logs clearly
   ============================================================ */

import { dbGetAll, dbPut } from './db.js'; // db.js provides these

let API_URL = "";

/* --------------------------
   Configure API URL
   -------------------------- */
export function setApiUrl(url) {
  API_URL = url || API_URL;
  console.log("[Sync] API URL set to:", API_URL);
}

/* --------------------------
   API call helper (text/plain)
   Avoids CORS preflight by using simple content-type.
   -------------------------- */
async function apiCall(payload) {
  if (!API_URL) throw new Error("API_URL not set");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch (e) {
    console.warn("[Sync] apiCall: failed parsing JSON response:", e, txt);
    return {}; // graceful fallback
  }
}

/* --------------------------
   Queue (in-memory)
   Each job is an object that modules push:
   { entityType, operation, payload, localId, priority, ... }
   -------------------------- */
const queue = [];
let processing = false;

export async function enqueueSync(job) {
  if (!job) return;
  queue.push(job);
  // small immediate schedule so UI can trigger upload quickly
  scheduleSync(200);
}

/* --------------------------
   scheduleSync: push job (optional) or just schedule process
   -------------------------- */
export function scheduleSync(delay = 800, maybeJob) {
  if (maybeJob) enqueueSync(maybeJob);
  setTimeout(() => {
    processQueue().catch(err => console.warn("[Sync] processQueue failed", err));
  }, delay);
}

/* --------------------------
   processQueue: send one job and retry on failure
   -------------------------- */
async function processQueue() {
  if (processing) return;
  if (queue.length === 0) return;

  processing = true;
  const job = queue.shift();

  try {
    // Send to server. Server should handle action: "sync" with job payload.
    const resp = await apiCall({ action: "sync", job });
    // Optional: server can respond with { ok: true, updated: {...} }
    if (resp && resp.error) {
      console.warn("[Sync] server returned error:", resp.error);
      // Re-enqueue with small backoff
      queue.push(job);
    }
  } catch (err) {
    console.warn("[Sync] processQueue network/error, retry later", err);
    queue.push(job); // retry later
  } finally {
    processing = false;
    // If more items exist, schedule another round
    if (queue.length > 0) scheduleSync(1000);
  }
}

/* --------------------------
   pullFromServer: fetch remote metadata (photos, diary, agenda)
   Modules listening to "lumina:pulled" should re-render.
   -------------------------- */
export async function pullFromServer() {
  try {
    const res = await apiCall({ action: "pull" });
    // res expected shape: { photos: [...], diary: [...], agenda: [...] }
    return res || {};
  } catch (err) {
    console.warn("[Sync] pullFromServer error", err);
    throw err;
  }
}

/* --------------------------
   Auto-pull loop initializer
   -------------------------- */
let autoPullHandle = null;
export function initSync(pollMs = 5000) {
  if (!API_URL) console.warn("[Sync] initSync called but API_URL empty");
  if (autoPullHandle) clearInterval(autoPullHandle);
  autoPullHandle = setInterval(() => {
    pullFromServer().catch(e => console.warn("[Sync] autoPull error", e));
  }, pollMs);
  console.log("[Sync] initSync started, pollMs=", pollMs);
}

/* --------------------------
   checkReminders: scan agenda in local DB and fire notifications
   - marks event.reminderFired = true to avoid double notify
   - uses dbGetAll/dbPut from db.js
   -------------------------- */
export async function checkReminders() {
  try {
    const events = await dbGetAll('agenda') || [];
    const now = Date.now();

    for (const ev of events) {
      try {
        if (!ev || ev._deleted) continue; // skip tombstones
        // Already fired?
        if (ev.reminderFired) continue;

        // Parse startTime (accept string or epoch)
        const start = ev.startTime ? new Date(ev.startTime) : null;
        if (!start || isNaN(start.getTime())) continue;

        const minutesBefore = Number(ev.reminderMinutes) || 30;
        const reminderTime = start.getTime() - minutesBefore * 60_000;

        // Fire only once in interval: when now is >= reminderTime and < start
        if (now >= reminderTime && now < start.getTime()) {
          // Try to show web Notification (if allowed)
          if ("Notification" in window) {
            if (Notification.permission === "granted") {
              new Notification(ev.title || "Agenda reminder", {
                body: ev.description || "",
                tag: ev.id || ("agenda-" + (ev.id || Math.random().toString(36).slice(2)))
              });
            } else if (Notification.permission !== "denied") {
              // request permission once
              Notification.requestPermission().then(perm => {
                if (perm === "granted") {
                  new Notification(ev.title || "Agenda reminder", { body: ev.description || "" });
                }
              });
            }
          }

          // mark event as fired locally
          ev.reminderFired = true;
          await dbPut('agenda', ev);
          console.log("[Sync] reminder fired for", ev.id || ev.title);
        }
      } catch (e) {
        console.warn("[Sync] checkReminders, event loop error", e, ev && ev.id);
      }
    }
  } catch (err) {
    console.warn("[Sync] checkReminders error", err);
  }
}

/* --------------------------
   Export list (explicit)
   -------------------------- */
export {
  apiCall,         // internal/http helper (exported if needed)
  setApiUrl,
  enqueueSync,
  scheduleSync,
  processQueue,
  pullFromServer,
  initSync,
  checkReminders
};
