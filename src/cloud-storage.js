import config from '../trip.config.js';
import { validateTripSnapshot } from './snapshot.js';

// Provider-neutral boundary for cloud persistence. ChatGPT Sites or another
// backend can supply an adapter later without leaking provider details into
// dashboard rendering, storage or sync logic.

let cloudStorageAdapter = null;

function requireMethod(adapter, method) {
  if (typeof adapter?.[method] !== 'function') {
    throw new Error(`Cloud storage adapter must provide ${method}().`);
  }
}

export function validateCloudStorageAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('Cloud storage adapter must be an object.');
  }
  requireMethod(adapter, 'loadTrip');
  requireMethod(adapter, 'saveTrip');
  return adapter;
}

export function setCloudStorageAdapter(adapter) {
  cloudStorageAdapter = adapter == null ? null : validateCloudStorageAdapter(adapter);
  return cloudStorageAdapter;
}

export function clearCloudStorageAdapter() {
  cloudStorageAdapter = null;
}

export function hasCloudStorageAdapter() {
  return cloudStorageAdapter != null;
}

export function getCloudStorageAdapter() {
  if (!cloudStorageAdapter) throw new Error('Cloud storage is not connected.');
  return cloudStorageAdapter;
}

export async function loadCloudTrip() {
  const adapter = getCloudStorageAdapter();
  const result = await adapter.loadTrip({ tripId: config.id });
  if (result == null) return null;
  return validateTripSnapshot(result);
}

export async function saveCloudTrip(snapshot, { expectedRevision = null } = {}) {
  const adapter = getCloudStorageAdapter();
  const validated = validateTripSnapshot(snapshot);
  if (expectedRevision != null && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
    throw new Error('Expected cloud revision must be a non-negative integer or null.');
  }

  const result = await adapter.saveTrip({
    tripId: config.id,
    snapshot: validated,
    expectedRevision,
  });
  return validateTripSnapshot(result);
}
