import config from '../trip.config.js';

// Local metadata only. The actual cloud adapter is added separately.
export const CLOUD_SYNC_STATE_KEY = `trip:${config.id}:cloud-state:v1`;
export const CLOUD_SYNC_STATE_EVENT = 'trip-cloud-sync-state-changed';

const tripPrefix = `trip:${config.id}:`;
const textStorageKeys = new Set([
  `${tripPrefix}days:v1`,
  `${tripPrefix}info:v1`,
  `${tripPrefix}travel:v1`,
]);
const notesPrefix = `${tripPrefix}notes:v1:`;

function hasExistingLocalTextData() {
  if (typeof localStorage === 'undefined') return false;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (textStorageKeys.has(key) || key?.startsWith(notesPrefix)) return true;
  }
  return false;
}

function validDateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function normalizeState(value) {
  const revision = Number.isInteger(value?.revision) && value.revision >= 0 ? value.revision : null;
  return {
    dirty: typeof value?.dirty === 'boolean' ? value.dirty : hasExistingLocalTextData(),
    revision,
    lastPushed: validDateTime(value?.lastPushed),
    lastPulled: validDateTime(value?.lastPulled),
  };
}

export function loadCloudSyncState() {
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_STATE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch {
    // Invalid metadata should never block access to the local trip.
  }
  return normalizeState(null);
}

function dispatchStateChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event(CLOUD_SYNC_STATE_EVENT));
  }
}

function saveCloudSyncState(state) {
  const normalized = normalizeState(state);
  localStorage.setItem(CLOUD_SYNC_STATE_KEY, JSON.stringify(normalized));
  dispatchStateChange();
  return normalized;
}

let localChangeSequence = 0;
const LOCAL_CHANGE_TOKEN_KEY = `trip:${config.id}:local-change-token:v1`;
export function getLocalChangeSequence() {
  return `${localChangeSequence}:${localStorage.getItem(LOCAL_CHANGE_TOKEN_KEY) || ''}`;
}

export function markLocalChangesPending() {
  localChangeSequence += 1;
  try {
    localStorage.setItem(LOCAL_CHANGE_TOKEN_KEY, globalThis.crypto.randomUUID());
  } catch {
    // The in-memory sequence still protects edits in this tab.
  }
  const next = { ...loadCloudSyncState(), dirty: true };
  try {
    return saveCloudSyncState(next);
  } catch (error) {
    // Sync metadata must never make an otherwise successful local edit fail.
    console.warn('Unable to persist cloud sync status:', error);
    dispatchStateChange();
    return normalizeState(next);
  }
}

export function markCloudSyncCurrent({ revision, lastPushed, lastPulled } = {}) {
  const current = loadCloudSyncState();
  return saveCloudSyncState({
    ...current,
    dirty: false,
    ...(revision !== undefined ? { revision } : {}),
    ...(lastPushed !== undefined ? { lastPushed } : {}),
    ...(lastPulled !== undefined ? { lastPulled } : {}),
  });
}

function formatSyncTime(value) {
  if (!value) return 'Never';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function renderCloudSyncState() {
  if (typeof document === 'undefined') return loadCloudSyncState();
  const status = document.getElementById('cloudSyncStatus');
  const revision = document.getElementById('cloudRevision');
  const lastPushed = document.getElementById('cloudLastPushed');
  const lastPulled = document.getElementById('cloudLastPulled');
  const state = loadCloudSyncState();

  if (status) {
    if (state.dirty) status.textContent = '● Local changes not pushed.';
    else if (state.revision != null) status.textContent = '✓ Up to date.';
    else status.textContent = 'No local changes waiting to push. Cloud sync is not connected yet.';
  }
  if (revision) revision.textContent = state.revision == null ? '—' : String(state.revision);
  if (lastPushed) lastPushed.textContent = formatSyncTime(state.lastPushed);
  if (lastPulled) lastPulled.textContent = formatSyncTime(state.lastPulled);
  return state;
}

export function initCloudSyncState() {
  renderCloudSyncState();
  if (typeof window !== 'undefined') {
    window.addEventListener(CLOUD_SYNC_STATE_EVENT, renderCloudSyncState);
  }
}
