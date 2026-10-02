export const TRIP_DAYS_STORAGE_KEY = `trip:${config.id}:days:v1`;
export const TRIP_INFO_STORAGE_KEY = `trip:${config.id}:info:v1`;
export const DB_NAME = `trip:${config.id}:photos:v1`;
export const DB_VERSION = 1;
export const STORE_NAME = 'photos';
export const NOTES_PREFIX = `trip:${config.id}:notes:v1:`;

import { validateDays } from './model.js';
import config from '../trip.config.js';
import { cloneTripDays } from './utils.js';

// Local notes and transactional IndexedDB photo persistence.

let dbPromise = null;

export function loadTripInfo() {
  const defaults = { title: config.title, subtitle: config.subtitle };
  try {
    const saved = JSON.parse(localStorage.getItem(TRIP_INFO_STORAGE_KEY));
    if (
      typeof saved?.title !== 'string' ||
      !saved.title.trim() ||
      saved.title.length > 200 ||
      typeof saved.subtitle !== 'string' ||
      saved.subtitle.length > 500
    )
      return defaults;
    return { title: saved.title.trim(), subtitle: saved.subtitle.trim() };
  } catch {
    return defaults;
  }
}

export function saveTripInfo(info) {
  localStorage.setItem(TRIP_INFO_STORAGE_KEY, JSON.stringify(info));
}

export function loadEditableTripDays() {
  try {
    const raw = localStorage.getItem(TRIP_DAYS_STORAGE_KEY);
    if (!raw) return cloneTripDays(config.days);

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cloneTripDays(config.days);

    return validateDays(parsed);
  } catch {
    return cloneTripDays(config.days);
  }
}

export function saveEditableTripDays(days) {
  localStorage.setItem(TRIP_DAYS_STORAGE_KEY, JSON.stringify(days));
}

export function normalizePhotoRecord(photo) {
  return {
    id: photo.id ?? null,
    dayId: photo.dayId || '',
    name: photo.name || 'photo',
    type: photo.type || 'image/jpeg',
    originalType: photo.originalType || photo.type || 'image/jpeg',
    originalSize: Number(photo.originalSize) || 0,
    savedSize: Number(photo.savedSize) || 0,
    wasCompressed: !!photo.wasCompressed,
    dataUrl: photo.dataUrl || '',
    caption: photo.caption || '',
    createdAt: photo.createdAt || new Date().toISOString(),
  };
}

export async function loadPhotosByDay(dayId) {
  return getPhotosByDay(dayId);
}

export async function loadAllPhotos() {
  return getAllPhotos();
}

export function getNotesStorageKey(dayId) {
  return `${NOTES_PREFIX}${dayId}`;
}

export function loadEditableDayNote(dayId) {
  try {
    return localStorage.getItem(getNotesStorageKey(dayId)) || '';
  } catch {
    return '';
  }
}

export function saveEditableDayNote(dayId, text) {
  try {
    localStorage.setItem(getNotesStorageKey(dayId), text);
  } catch (err) {
    console.error('Unable to save day notes:', err);
    throw err;
  }
}

export function getDayNote(dayId) {
  return loadEditableDayNote(dayId);
}

export function showNoteSaved(dayId, message = 'Notes saved.') {
  const statusEl = document.getElementById(`note-status-${dayId}`);
  if (!statusEl) return;
  statusEl.textContent = message;
  clearTimeout(statusEl._noteTimer);
  statusEl._noteTimer = setTimeout(() => {
    statusEl.textContent = '';
  }, 2200);
}

export function saveDayNoteFromTextarea(dayId) {
  const textarea = document.getElementById(`notes-${dayId}`);
  if (!textarea) return;
  saveEditableDayNote(dayId, textarea.value);
  showNoteSaved(dayId, 'Notes saved.');
}

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('dayId', 'dayId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function addPhotoRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(record);
    let insertedId;
    request.onsuccess = () => {
      insertedId = request.result;
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(insertedId);
    tx.onabort = () => reject(tx.error || new Error('Photo save failed.'));
  });
}

export async function getPhotosByDay(dayId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('dayId');
    const request = index.getAll(dayId);

    request.onsuccess = () => {
      const rows = (request.result || []).map(normalizePhotoRecord);
      rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAllPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const rows = (request.result || []).map(normalizePhotoRecord);
      rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updatePhotoCaption(id, caption) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) {
        resolve();
        return;
      }
      record.caption = caption;
      const putReq = store.put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Caption save failed.'));
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deletePhotoRecord(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Photo deletion failed.'));
    request.onerror = () => reject(request.error);
  });
}

export function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString('en-SG', {
      timeZone: config.timeZone,
      timeZoneName: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}
