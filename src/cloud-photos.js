import config from '../trip.config.js';
import { getCloudStorageAdapter } from './cloud-storage.js';
import {
  COVERS_PREFIX,
  NOTES_PREFIX,
  TRIP_INFO_STORAGE_KEY,
  TRIP_DAYS_STORAGE_KEY,
  TRAVEL_STORAGE_KEY,
  loadAllPhotos,
  loadDayCoverId,
  openDB,
  STORE_NAME,
} from './storage.js';
import { validateTripSnapshot, restoreLocalTripSnapshot } from './snapshot.js';

export function hasCloudPhotoStorage() {
  const adapter = getCloudStorageAdapter();
  return typeof adapter.savePhoto === 'function' && typeof adapter.loadPhoto === 'function';
}

export async function photoHash(bytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodePhoto(dataUrl) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Photo has an unsupported image format.');
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return { bytes, type: match[1] === 'image/jpg' ? 'image/jpeg' : match[1] };
}

function encodePhoto(bytes, type) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

export async function attachCloudPhotos(snapshot) {
  const adapter = getCloudStorageAdapter();
  const photos = await loadAllPhotos();
  const manifest = [];
  const uploaded = new Set();
  const covers = Object.fromEntries(
    photos
      .filter((photo) => loadDayCoverId(photo.dayId) === photo.id)
      .map((photo) => [photo.dayId, photo.id]),
  );
  for (const photo of photos) {
    const { bytes, type } = decodePhoto(photo.dataUrl);
    const blobId = await photoHash(bytes);
    if (!uploaded.has(blobId)) {
      await adapter.savePhoto({ tripId: config.id, photoId: blobId, bytes, type });
      uploaded.add(blobId);
    }
    const { dataUrl, ...metadata } = photo;
    manifest.push({ ...metadata, type, savedSize: bytes.length, blobId });
  }
  return validateTripSnapshot({ ...snapshot, version: 2, photos: manifest, covers });
}

export async function downloadCloudPhotos(snapshot) {
  const adapter = getCloudStorageAdapter();
  const cache = new Map();
  const records = [];
  for (const photo of snapshot.photos) {
    if (!cache.has(photo.blobId)) {
      const bytes = new Uint8Array(
        await adapter.loadPhoto({ tripId: config.id, photoId: photo.blobId }),
      );
      if (bytes.length !== photo.savedSize || (await photoHash(bytes)) !== photo.blobId) {
        throw new Error('Downloaded photo failed its integrity check.');
      }
      cache.set(photo.blobId, bytes);
    }
    const { blobId, ...metadata } = photo;
    records.push({ ...metadata, dataUrl: encodePhoto(cache.get(blobId), photo.type) });
  }
  return records;
}

// Stage all remote bytes first. Apply localStorage inside the IndexedDB
// transaction; failure aborts photo replacement and restores the previous keys.
export async function restoreTripWithPhotos(snapshot, records, assertUnchanged = () => {}) {
  const validated = validateTripSnapshot(snapshot);
  if (validated.version !== 2) throw new Error('Photo restore requires snapshot version 2.');
  const previous = new Map();
  const textKeys = new Set([TRIP_INFO_STORAGE_KEY, TRIP_DAYS_STORAGE_KEY, TRAVEL_STORAGE_KEY]);
  const affectedKey = (key) =>
    textKeys.has(key) || key?.startsWith(NOTES_PREFIX) || key?.startsWith(COVERS_PREFIX);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (affectedKey(key)) previous.set(key, localStorage.getItem(key));
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const record of records) store.put(record);
    let failure;
    let applied = false;
    // A final request keeps the transaction active while text/covers are applied.
    store.count().onsuccess = () => {
      try {
        assertUnchanged();
        applied = true;
        restoreLocalTripSnapshot(snapshot);
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key.startsWith(COVERS_PREFIX)) keys.push(key);
        }
        for (const key of keys) localStorage.removeItem(key);
        for (const [dayId, id] of Object.entries(snapshot.covers)) {
          localStorage.setItem(`${COVERS_PREFIX}${dayId}`, JSON.stringify(id));
        }
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(snapshot);
    tx.onabort = () => {
      // Do not touch storage unless the text application actually ran.
      try {
        if (applied) {
          const keys = [];
          for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (affectedKey(key)) keys.push(key);
          }
          for (const key of keys) if (!previous.has(key)) localStorage.removeItem(key);
          for (const [key, value] of previous) localStorage.setItem(key, value);
        }
      } catch (rollbackError) {
        reject(
          new Error('Photo restore failed and local text could not be restored.', {
            cause: rollbackError,
          }),
        );
        return;
      }
      reject(failure || tx.error || new Error('Photo restore failed.'));
    };
  });
}

const PHOTO_SYNC_MARKER = `trip:${config.id}:photo-sync:v2`;
export async function detectUnsyncedLegacyPhotos() {
  if (localStorage.getItem(PHOTO_SYNC_MARKER)) return false;
  const photos = await loadAllPhotos();
  return !localStorage.getItem(PHOTO_SYNC_MARKER) && photos.length > 0;
}
export function markPhotoSyncSupported() {
  localStorage.setItem(PHOTO_SYNC_MARKER, 'true');
}
