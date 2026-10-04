import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import config from '../trip.config.js';
import {
  clearCloudStorageAdapter,
  getCloudStorageAdapter,
  hasCloudStorageAdapter,
  loadCloudTrip,
  saveCloudTrip,
  setCloudStorageAdapter,
  validateCloudStorageAdapter,
} from '../src/cloud-storage.js';
import { createLocalTripSnapshot } from '../src/snapshot.js';

function installLocalStorage(t) {
  const dom = new JSDOM('', { url: 'https://cloud-storage-test.example/' });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: dom.window.localStorage,
  });
  t.after(() => {
    clearCloudStorageAdapter();
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
}

function validSnapshot(revision = 3) {
  return createLocalTripSnapshot({
    revision,
    createdAt: '2026-10-04T08:35:00.000Z',
  });
}

test('cloud adapter contract requires loadTrip and saveTrip and can be disconnected', (t) => {
  installLocalStorage(t);
  assert.equal(hasCloudStorageAdapter(), false);
  assert.throws(() => getCloudStorageAdapter(), /not connected/i);
  assert.throws(() => validateCloudStorageAdapter(null), /must be an object/i);
  assert.throws(() => validateCloudStorageAdapter({ saveTrip() {} }), /loadTrip/i);
  assert.throws(() => validateCloudStorageAdapter({ loadTrip() {} }), /saveTrip/i);

  const adapter = { loadTrip() {}, saveTrip() {} };
  assert.equal(setCloudStorageAdapter(adapter), adapter);
  assert.equal(getCloudStorageAdapter(), adapter);
  assert.equal(hasCloudStorageAdapter(), true);

  clearCloudStorageAdapter();
  assert.equal(hasCloudStorageAdapter(), false);
});

test('saveCloudTrip sends only the generic trip contract and validates the provider response', async (t) => {
  installLocalStorage(t);
  const snapshot = validSnapshot(4);
  let received;
  setCloudStorageAdapter({
    async loadTrip() {
      return null;
    },
    async saveTrip(input) {
      received = input;
      return { ...input.snapshot, revision: 5 };
    },
  });

  const saved = await saveCloudTrip(snapshot, { expectedRevision: 4 });
  assert.equal(received.tripId, config.id);
  assert.deepEqual(received.snapshot, snapshot);
  assert.equal(received.expectedRevision, 4);
  assert.equal(saved.revision, 5);
  assert.equal(saved.tripId, config.id);

  await assert.rejects(() => saveCloudTrip(snapshot, { expectedRevision: -1 }), /non-negative/);

  setCloudStorageAdapter({
    async loadTrip() {
      return null;
    },
    async saveTrip() {
      return { ...snapshot, tripId: 'wrong-trip' };
    },
  });
  await assert.rejects(() => saveCloudTrip(snapshot), /different trip/i);
});

test('loadCloudTrip passes the trip identity, accepts an empty store and validates stored data', async (t) => {
  installLocalStorage(t);
  const snapshot = validSnapshot(7);
  const calls = [];
  setCloudStorageAdapter({
    async loadTrip(input) {
      calls.push(input);
      return snapshot;
    },
    async saveTrip() {
      throw new Error('not used');
    },
  });

  assert.deepEqual(await loadCloudTrip(), snapshot);
  assert.deepEqual(calls, [{ tripId: config.id }]);

  setCloudStorageAdapter({
    async loadTrip() {
      return null;
    },
    async saveTrip() {
      throw new Error('not used');
    },
  });
  assert.equal(await loadCloudTrip(), null);

  setCloudStorageAdapter({
    async loadTrip() {
      return { ...snapshot, version: 999 };
    },
    async saveTrip() {
      throw new Error('not used');
    },
  });
  await assert.rejects(() => loadCloudTrip(), /Unsupported trip snapshot version/);
});

test('adapter errors pass through without changing local trip data', async (t) => {
  installLocalStorage(t);
  const snapshot = validSnapshot(2);
  const before = localStorage.getItem(`trip:${config.id}:info:v1`);
  const failure = new Error('temporary cloud failure');

  setCloudStorageAdapter({
    async loadTrip() {
      throw failure;
    },
    async saveTrip() {
      throw failure;
    },
  });

  await assert.rejects(() => loadCloudTrip(), failure);
  await assert.rejects(() => saveCloudTrip(snapshot), failure);
  assert.equal(localStorage.getItem(`trip:${config.id}:info:v1`), before);
});
