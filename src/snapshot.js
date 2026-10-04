import config from '../trip.config.js';
import { validateDays, validateTravel, validateTripInfo } from './model.js';
import {
  NOTES_PREFIX,
  TRAVEL_STORAGE_KEY,
  TRIP_DAYS_STORAGE_KEY,
  TRIP_INFO_STORAGE_KEY,
  loadEditableTripDays,
  loadTravelInfo,
  loadTripInfo,
} from './storage.js';

// Version 1 remains the text-only adapter contract. Version 2 adds immutable
// cloud photo references and cover selections, without embedding image bytes.
export const TRIP_SNAPSHOT_FORMAT = 'trip-dashboard-snapshot';
export const TRIP_SNAPSHOT_VERSION = 1;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateSnapshotDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Snapshot note dates must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error(`Invalid snapshot note date: ${value}`);
  return value;
}

function validateCreatedAt(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new Error('Snapshot createdAt must be a valid date and time.');
  return new Date(value).toISOString();
}

function validateDayNotes(dayNotes) {
  if (!isPlainObject(dayNotes)) throw new Error('Snapshot day notes must be an object.');
  return Object.fromEntries(
    Object.entries(dayNotes)
      .map(([date, text]) => {
        if (typeof text !== 'string')
          throw new Error('Snapshot day notes must contain text values.');
        return [validateSnapshotDate(date), text];
      })
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function listSavedDayNotes() {
  const notes = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(NOTES_PREFIX)) continue;
    notes[key.slice(NOTES_PREFIX.length)] = localStorage.getItem(key) || '';
  }
  return notes;
}

function listSavedNoteKeys() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(NOTES_PREFIX)) keys.push(key);
  }
  return keys;
}

export function validateTripSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error('Trip snapshot must be an object.');
  if (snapshot.format !== TRIP_SNAPSHOT_FORMAT)
    throw new Error('This is not a Trip Dashboard snapshot.');
  if (![1, 2].includes(snapshot.version))
    throw new Error(`Unsupported trip snapshot version: ${snapshot.version}.`);
  if (snapshot.tripId !== config.id)
    throw new Error(`Snapshot belongs to a different trip: ${snapshot.tripId || 'unknown'}.`);
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0)
    throw new Error('Snapshot revision must be a non-negative integer.');

  return {
    format: TRIP_SNAPSHOT_FORMAT,
    version: snapshot.version,
    ...(snapshot.version === 2 ? validatePhotoManifest(snapshot) : {}),
    tripId: config.id,
    revision: snapshot.revision,
    createdAt: validateCreatedAt(snapshot.createdAt),
    tripInfo: validateTripInfo(snapshot.tripInfo),
    tripDays: validateDays(snapshot.tripDays),
    travel: validateTravel(snapshot.travel),
    dayNotes: validateDayNotes(snapshot.dayNotes),
  };
}

export function createLocalTripSnapshot({
  revision = 0,
  createdAt = new Date().toISOString(),
} = {}) {
  return validateTripSnapshot({
    format: TRIP_SNAPSHOT_FORMAT,
    version: TRIP_SNAPSHOT_VERSION,
    tripId: config.id,
    revision,
    createdAt,
    tripInfo: loadTripInfo(),
    tripDays: loadEditableTripDays(),
    travel: loadTravelInfo(),
    dayNotes: listSavedDayNotes(),
  });
}

export function serializeTripSnapshot(snapshot) {
  return JSON.stringify(validateTripSnapshot(snapshot));
}

export function parseTripSnapshot(serialized) {
  if (typeof serialized !== 'string')
    throw new Error('Trip snapshot must be serialized as JSON text.');
  try {
    return validateTripSnapshot(JSON.parse(serialized));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Trip snapshot contains invalid JSON.');
    throw error;
  }
}

export function restoreLocalTripSnapshot(snapshot) {
  const validated = validateTripSnapshot(snapshot);
  const existingNoteKeys = listSavedNoteKeys();
  const newNoteEntries = Object.entries(validated.dayNotes).map(([date, text]) => [
    `${NOTES_PREFIX}${date}`,
    text,
  ]);
  const affectedKeys = new Set([
    TRIP_INFO_STORAGE_KEY,
    TRIP_DAYS_STORAGE_KEY,
    TRAVEL_STORAGE_KEY,
    ...existingNoteKeys,
    ...newNoteEntries.map(([key]) => key),
  ]);
  const previous = new Map([...affectedKeys].map((key) => [key, localStorage.getItem(key)]));

  try {
    for (const key of existingNoteKeys) localStorage.removeItem(key);
    localStorage.setItem(TRIP_INFO_STORAGE_KEY, JSON.stringify(validated.tripInfo));
    localStorage.setItem(TRIP_DAYS_STORAGE_KEY, JSON.stringify(validated.tripDays));
    localStorage.setItem(TRAVEL_STORAGE_KEY, JSON.stringify(validated.travel));
    for (const [key, text] of newNoteEntries) localStorage.setItem(key, text);
  } catch (error) {
    for (const [key, value] of previous) {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    throw error;
  }

  return validated;
}

function validatePhotoManifest(snapshot) {
  if (!Array.isArray(snapshot.photos) || !isPlainObject(snapshot.covers))
    throw new Error('Invalid photo manifest.');
  const ids = new Set();
  const photos = snapshot.photos.map((photo) => {
    if (
      !isPlainObject(photo) ||
      !Number.isSafeInteger(photo.id) ||
      photo.id < 1 ||
      ids.has(photo.id)
    )
      throw new Error('Invalid or duplicate photo ID.');
    ids.add(photo.id);
    if (
      typeof photo.dayId !== 'string' ||
      !photo.dayId ||
      !/^[a-f0-9]{64}$/.test(photo.blobId || '')
    )
      throw new Error('Invalid photo reference.');
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(photo.type) ||
      !Number.isSafeInteger(photo.savedSize) ||
      photo.savedSize < 1 ||
      photo.savedSize > 10 * 1024 * 1024
    )
      throw new Error('Invalid photo size or format.');
    for (const field of ['name', 'caption', 'originalType'])
      if (typeof photo[field] !== 'string') throw new Error('Invalid photo metadata.');
    if (
      !Number.isFinite(photo.originalSize) ||
      photo.originalSize < 0 ||
      typeof photo.wasCompressed !== 'boolean'
    )
      throw new Error('Invalid photo metadata.');
    return {
      id: photo.id,
      dayId: validateSnapshotDate(photo.dayId),
      blobId: photo.blobId,
      type: photo.type,
      savedSize: photo.savedSize,
      name: photo.name,
      caption: photo.caption,
      originalType: photo.originalType,
      originalSize: photo.originalSize,
      wasCompressed: photo.wasCompressed,
      createdAt: validateCreatedAt(photo.createdAt),
    };
  });
  const covers = Object.fromEntries(
    Object.entries(snapshot.covers).map(([dayId, id]) => {
      if (!photos.some((photo) => photo.id === id && photo.dayId === dayId))
        throw new Error('Cover must reference a photo in its day.');
      return [dayId, id];
    }),
  );
  return { photos, covers };
}
