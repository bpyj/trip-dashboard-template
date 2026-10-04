import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHttpCloudStorageAdapter } from '../src/http-cloud-adapter.js';
import { handleTripSyncRequest } from '../src/site-cloud-api.js';

function createFakeD1() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          if (!sql.startsWith('SELECT snapshot_json'))
            throw new Error(`Unexpected first(): ${sql}`);
          const row = rows.get(values[0]);
          return row ? { snapshot_json: row.snapshot_json } : null;
        },
        async run() {
          if (sql.includes('CREATE TABLE IF NOT EXISTS')) return { meta: { changes: 0 } };
          if (sql.startsWith('INSERT INTO trip_snapshots')) {
            const [tripId, revision, snapshotJson, updatedAt] = values;
            if (rows.has(tripId)) return { meta: { changes: 0 } };
            rows.set(tripId, {
              revision,
              snapshot_json: snapshotJson,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('UPDATE trip_snapshots')) {
            const [revision, snapshotJson, updatedAt, tripId, expectedRevision] = values;
            const row = rows.get(tripId);
            if (!row || row.revision !== expectedRevision) return { meta: { changes: 0 } };
            rows.set(tripId, {
              revision,
              snapshot_json: snapshotJson,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected run(): ${sql}`);
        },
      };
    },
  };
}

function createSiteFetch(db) {
  return async (url, init) => {
    const absolute = new URL(url, 'https://trip-site.example');
    const tripId = decodeURIComponent(absolute.pathname.split('/').at(-1));
    const request = new Request(absolute, init);
    return handleTripSyncRequest({ request, tripId, db, now: '2026-10-04T10:15:00.000Z' });
  };
}

function snapshot(tripId, revision, title) {
  return {
    format: 'trip-dashboard-snapshot',
    version: 1,
    tripId,
    revision,
    createdAt: '2026-10-04T10:15:00.000Z',
    tripInfo: { title },
    tripDays: [],
    travel: {},
    dayNotes: {},
  };
}

test('D1 Site API persists a trip across separate browser adapters', async () => {
  const db = createFakeD1();
  const deviceA = createHttpCloudStorageAdapter({
    baseUrl: '/api/trip-sync',
    fetchImpl: createSiteFetch(db),
  });
  const deviceB = createHttpCloudStorageAdapter({
    baseUrl: '/api/trip-sync',
    fetchImpl: createSiteFetch(db),
  });

  const first = snapshot('test-trip', 1, 'PHONE TEST');
  assert.deepEqual(
    await deviceA.saveTrip({ tripId: 'test-trip', snapshot: first, expectedRevision: null }),
    first,
  );
  assert.deepEqual(await deviceB.loadTrip({ tripId: 'test-trip' }), first);

  const second = snapshot('test-trip', 2, 'LAPTOP TEST');
  assert.deepEqual(
    await deviceB.saveTrip({ tripId: 'test-trip', snapshot: second, expectedRevision: 1 }),
    second,
  );
  assert.deepEqual(await deviceA.loadTrip({ tripId: 'test-trip' }), second);
  assert.equal(db.rows.get('test-trip').revision, 2);
});

test('D1 Site API rejects stale Push revisions without replacing the cloud master', async () => {
  const db = createFakeD1();
  const adapter = createHttpCloudStorageAdapter({
    baseUrl: '/api/trip-sync',
    fetchImpl: createSiteFetch(db),
  });
  await adapter.saveTrip({
    tripId: 'test-trip',
    snapshot: snapshot('test-trip', 1, 'REVISION 1'),
    expectedRevision: null,
  });
  await adapter.saveTrip({
    tripId: 'test-trip',
    snapshot: snapshot('test-trip', 2, 'REVISION 2'),
    expectedRevision: 1,
  });

  await assert.rejects(
    () =>
      adapter.saveTrip({
        tripId: 'test-trip',
        snapshot: snapshot('test-trip', 2, 'STALE DEVICE'),
        expectedRevision: 1,
      }),
    (error) => error.status === 409 && /Pull before pushing again/i.test(error.message),
  );
  assert.equal((await adapter.loadTrip({ tripId: 'test-trip' })).tripInfo.title, 'REVISION 2');
});

test('D1 Site API isolates trips and validates writes before changing storage', async () => {
  const db = createFakeD1();
  const fetchImpl = createSiteFetch(db);
  const adapter = createHttpCloudStorageAdapter({ baseUrl: '/api/trip-sync', fetchImpl });

  assert.equal(await adapter.loadTrip({ tripId: 'missing-trip' }), null);
  await adapter.saveTrip({
    tripId: 'trip-a',
    snapshot: snapshot('trip-a', 1, 'Trip A'),
    expectedRevision: null,
  });
  await adapter.saveTrip({
    tripId: 'trip-b',
    snapshot: snapshot('trip-b', 1, 'Trip B'),
    expectedRevision: null,
  });
  assert.equal((await adapter.loadTrip({ tripId: 'trip-a' })).tripInfo.title, 'Trip A');
  assert.equal((await adapter.loadTrip({ tripId: 'trip-b' })).tripInfo.title, 'Trip B');

  const badRequest = new Request('https://trip-site.example/api/trip-sync/trip-a', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      snapshot: snapshot('other-trip', 2, 'Wrong trip'),
      expectedRevision: 1,
    }),
  });
  const response = await handleTripSyncRequest({ request: badRequest, tripId: 'trip-a', db });
  assert.equal(response.status, 400);
  assert.equal((await adapter.loadTrip({ tripId: 'trip-a' })).tripInfo.title, 'Trip A');
});
