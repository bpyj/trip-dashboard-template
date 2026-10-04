import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  connectConfiguredHttpCloudStorage,
  createHttpCloudStorageAdapter,
} from '../src/http-cloud-adapter.js';
import {
  clearCloudStorageAdapter,
  getCloudStorageAdapter,
  hasCloudStorageAdapter,
} from '../src/cloud-storage.js';

test('HTTP adapter loads, saves and forwards revision protection on the same origin', async () => {
  const calls = [];
  const snapshot = { tripId: 'test-trip', revision: 4 };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'GET') {
      return new Response(JSON.stringify({ snapshot }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ snapshot }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const adapter = createHttpCloudStorageAdapter({
    baseUrl: '/api/trip-sync/',
    fetchImpl,
  });

  assert.deepEqual(await adapter.loadTrip({ tripId: 'test trip' }), snapshot);
  assert.deepEqual(
    await adapter.saveTrip({ tripId: 'test trip', snapshot, expectedRevision: 3 }),
    snapshot,
  );

  assert.equal(calls[0].url, '/api/trip-sync/test%20trip');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[1].init.method, 'PUT');
  assert.equal(calls[1].init.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[1].init.body), { snapshot, expectedRevision: 3 });
});

test('HTTP adapter treats an empty cloud record as null and surfaces cloud conflicts safely', async () => {
  const missing = createHttpCloudStorageAdapter({
    baseUrl: '/api/trip-sync',
    fetchImpl: async () => new Response('', { status: 404 }),
  });
  assert.equal(await missing.loadTrip({ tripId: 'missing' }), null);

  const conflict = createHttpCloudStorageAdapter({
    baseUrl: '/api/trip-sync',
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: 'Cloud revision changed. Pull before pushing again.' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
  });
  await assert.rejects(
    () => conflict.saveTrip({ tripId: 'test-trip', snapshot: {}, expectedRevision: 2 }),
    (error) => error.status === 409 && /Pull before pushing again/i.test(error.message),
  );
});

test('hosted configuration connects the HTTP adapter only when the Site injects it', (t) => {
  t.after(clearCloudStorageAdapter);
  clearCloudStorageAdapter();

  assert.equal(
    connectConfiguredHttpCloudStorage({ target: {}, fetchImpl: async () => new Response() }),
    false,
  );
  assert.equal(hasCloudStorageAdapter(), false);

  const fetchImpl = async () => new Response('', { status: 404 });
  const target = {
    __TRIP_DASHBOARD_CLOUD__: {
      baseUrl: '/api/trip-sync',
    },
  };
  assert.equal(connectConfiguredHttpCloudStorage({ target, fetchImpl }), true);
  assert.equal(hasCloudStorageAdapter(), true);
  assert.equal(typeof getCloudStorageAdapter().loadTrip, 'function');
  assert.equal(typeof getCloudStorageAdapter().saveTrip, 'function');
});

test('HTTP adapter rejects missing configuration and invalid JSON responses', async () => {
  assert.throws(() => createHttpCloudStorageAdapter(), /base URL is required/i);
  const adapter = createHttpCloudStorageAdapter({
    baseUrl: '/api/trip-sync',
    fetchImpl: async () => new Response('not-json', { status: 200 }),
  });
  await assert.rejects(() => adapter.loadTrip({ tripId: 'test-trip' }), /invalid JSON/i);
});
