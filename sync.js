// sync.js — FULL replacement (no duplicate exports)
//
// Exports (named):
//   setApiUrl, apiCall, enqueueSync, scheduleSync, processQueue,
//   pullFromServer, initSync, checkReminders
//
// Uses text/plain POST to avoid CORS preflight.
// Depends on db.js for local agenda reads/writes.

import { dbGetAll, dbPut } from './db.js';

let API_URL = "";

/* ---------------------------
   Configure API URL
   --------------------------- */
export function setApiUrl(url) {
  if (url) API_URL = url;
  console.log("[Sync] API URL set to:", API_URL);
}

/* ---------------------------
   API call helper (text/plain)
   --------------------------- */
export async function apiCall(payload) {
  if (!API_URL) throw new Error("API_URL not set for apiCall");
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
    console.warn("[Sync] apiCall: failed parse JSON", e, txt);
    return {};
  }
}

/* ---------------------------
   In-memory queue
   --------------------------- */
const queue = [];
let processing = false;

export async function enqueueSync(job) {
  if (!job || typeof job !== "object") return;
  queue.push(job);
  // schedule immediate short-run so UI-triggered uploads start fast
  scheduleSync(150);
}

/* ---------------------------
   scheduleSync: optional job + schedule
   --------------------------- */
export function scheduleSync(delay = 800, maybeJob) {
  if (maybeJob) enqueueSync(maybeJob);
  setTimeout(() => {
    processQueue().catch(e => console.warn("[Sync] scheduleSync->processQueue failed", e));
  }, delay);
}

/* ---------------------------
   processQueue: pop one job, send, retry on fail
   --------------------------- */
export async function processQueue() {
  if (processing) return;
  if (queue.length === 0) return;

  processing = true;
  const job = queue.shift();

  try {
    const resp = await apiCall({ action: "sync", job });
    if (resp && resp.error) {
      console.warn("[Sync] server error for job:", resp.error, job);
      // requeue with backoff
      queue.push(job);
    } else {
      // optionally handle server-returned updates here
      // e.g., if server returns updated IDs or canonical timestamps
    }
  } catch (err) {
    console.warn("[Sync] processQueue network/error, requeue", err);
    queue.push(job); // retry later
  } finally {
    processing = false;
    if (queue.length > 0) {
      // keep processing until empty with small delay
      setTimeout(() => processQueue().catch(e => console.warn("[Sync] loop error", e)), 700);
    }
  }
}

/* ---------------------------
   pullFromServer: fetch remote metadata
   Expected response shape:
     { photos: [...], diary: [...], agenda: [...] }
   --------------------------- */
export async function pullFromServer() {
  try {
    const res = await apiCall({ action: "pull" });
    // do not mutate DB here — let modules listen for lumina:pulled or caller handle
    // but return the payload so caller can apply into IDB
    return res || {};
  } catch (err) {
    console.warn("[Sync] pullFromServer error", err);
    throw err;
  }
}

/* ---------------------------
   initSync: starts auto-pull loop (returns handle)
   --------------------------- */
let autoPullHandle = null;
export function initSync(pollMs = 5000) {
  if (autoPullHandle) clearInterval(autoPullHandle);
  autoPullHandle = setInterval(() => {
    pullFromServer().catch(e => console.warn("[Sync] autoPull error", e));
  }, pollMs);
  console.log("[Sync] initSync started, pollMs=", pollMs);
  return autoPullHandle;
}

/* ---------------------------
   checkReminders: read local agenda and fire notifications
   Marks reminderFired on records to avoid repeats
   --------------------------- */
export async function checkReminders() {
  try {
    const events = (await dbGetAll('agenda')) || [];
    const now = Date.now();

    for (const ev of events) {
      try {
        if (!ev || ev._deleted) continue;
        if (ev.reminderFired) continue;

        const start = ev.startTime ? new Date(ev.startTime) : null;
        if (!start || isNaN(start.getTime())) continue;

        const minutesBefore = Number(ev.reminderMinutes) || 30;
        const reminderAt = start.getTime() - minutesBefore * 60_000;

        if (now >= reminderAt && now < start.getTime()) {
          // Notification (request permission if needed)
          if ("Notification" in window) {
            if (Notification.permission === "granted") {
              new Notification(ev.title || "Agenda reminder", {
                body: ev.description || "",
                tag: ev.id || ("agenda-" + (ev.id || Math.random().toString(36).slice(2)))
              });
            } else if (Notification.permission !== "denied") {
              // ask once
              Notification.requestPermission().then(perm => {
                if (perm === "granted") {
                  new Notification(ev.title || "Agenda reminder", { body: ev.description || "" });
                }
              });
            }
          }

          ev.reminderFired = true;
          // persist mark to local DB
          try { await dbPut('agenda', ev); } catch (e) { console.warn("[Sync] dbPut reminder mark failed", e); }
          console.log("[Sync] reminder fired:", ev.id || ev.title);
        }
      } catch (e) {
        console.warn("[Sync] checkReminders inner error", e, ev && ev.id);
      }
    }
  } catch (err) {
    console.warn("[Sync] checkReminders error", err);
  }
}
