import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
import config from '../trip.config.js';
import { setCloudStorageAdapter, clearCloudStorageAdapter } from '../src/cloud-storage.js';
import { createHttpCloudStorageAdapter } from '../src/http-cloud-adapter.js';
import { handlePhotoRequest } from '../src/site-photo-api.js';
import { pushLocalTripToCloud, pullCloudTripToLocal } from '../src/cloud-sync.js';
import { loadCloudSyncState, markCloudSyncCurrent } from '../src/cloud-state.js';
import {
  addPhotoRecord,
  loadAllPhotos,
  loadDayCoverId,
  saveDayCoverId,
  updatePhotoCaption,
  deletePhotoRecord,
  loadTripInfo,
  saveTripInfo,
  openDB,
  STORE_NAME,
  COVERS_PREFIX,
} from '../src/storage.js';
import { validateTripSnapshot } from '../src/snapshot.js';

test('photo Push/Pull preserves albums, captions and covers; failures preserve the local copy', async (t) => {
  const dom = new JSDOM('', { url: 'https://photo-sync.test/' });
  globalThis.indexedDB = indexedDB;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: dom.window.localStorage,
  });
  t.after(() => {
    clearCloudStorageAdapter();
    dom.window.close();
    delete globalThis.localStorage;
    delete globalThis.indexedDB;
  });
  const objects = new Map();
  const bucket = {
    async put(key, body, options) {
      objects.set(key, { body, ...options });
    },
    async get(key) {
      return objects.get(key);
    },
  };
  let master = null;
  let failUpload = false;
  let corruptDownload = false;
  let editDuringPush = false;
  const adapter = createHttpCloudStorageAdapter({
    baseUrl: '/api/trip-sync',
    photoBaseUrl: '/api/trip-photos',
    fetchImpl: async (url, options) => {
      if (url.startsWith('/api/trip-photos/')) {
        if (failUpload && options.method === 'PUT')
          return Response.json({ error: 'upload outage' }, { status: 503 });
        if (corruptDownload && options.method === 'GET') return new Response(new Uint8Array([1]));
        const parts = url.split('/');
        return handlePhotoRequest({
          request: new Request(`https://photo-sync.test${url}`, options),
          tripId: parts[3],
          photoId: parts[4],
          bucket,
        });
      }
      if (options.method === 'GET') return Response.json({ snapshot: master });
      const { snapshot, expectedRevision } = JSON.parse(options.body);
      if (expectedRevision !== (master?.revision ?? null))
        return Response.json({ error: 'conflict' }, { status: 409 });
      master = structuredClone(snapshot);
      if (editDuringPush) saveTripInfo({ ...loadTripInfo(), title: 'Changed during upload' });
      return Response.json({ snapshot: master });
    },
  });
  setCloudStorageAdapter(adapter);
  const dayId = config.days[0].date;
  const dataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7WQAAAAASUVORK5CYII=';
  const first = await addPhotoRecord({
    dayId,
    dataUrl,
    caption: 'First photo',
    name: 'a.png',
    type: 'image/png',
    createdAt: '2026-10-04T01:00:00Z',
  });
  const second = await addPhotoRecord({
    dayId,
    dataUrl,
    caption: 'Second photo',
    name: 'b.png',
    type: 'image/png',
    createdAt: '2026-10-04T02:00:00Z',
  });
  saveDayCoverId(dayId, first);
  const pushed = await pushLocalTripToCloud();
  assert.equal(pushed.version, 2);
  assert.deepEqual(
    pushed.photos.map((photo) => photo.id),
    [second, first],
  );
  assert.equal(pushed.covers[dayId], first);
  assert.equal(objects.size, 1, 'identical image bytes share an object');
  assert.equal('dataUrl' in master.photos[0], false);
  assert.equal(loadCloudSyncState().dirty, false);

  // Simulate the second device with an empty local working copy.
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = resolve;
    tx.onabort = reject;
  });
  localStorage.clear();
  await pullCloudTripToLocal();
  assert.deepEqual(
    (await loadAllPhotos()).map((photo) => [photo.id, photo.caption, photo.dataUrl]),
    [
      [second, 'Second photo', dataUrl],
      [first, 'First photo', dataUrl],
    ],
  );
  assert.equal(loadDayCoverId(dayId), first);
  await updatePhotoCaption(first, 'Caption from laptop');
  assert.equal(loadCloudSyncState().dirty, true);
  saveDayCoverId(dayId, second);
  await pushLocalTripToCloud();
  assert.equal(master.photos.find((photo) => photo.id === first).caption, 'Caption from laptop');
  assert.equal(master.covers[dayId], second);
  await deletePhotoRecord(first);
  assert.equal(loadCloudSyncState().dirty, true);
  await pushLocalTripToCloud();
  assert.equal(master.photos.length, 1);

  const beforePhotos = await loadAllPhotos();
  const beforeText = loadTripInfo();
  corruptDownload = true;
  await assert.rejects(() => pullCloudTripToLocal(), /integrity/);
  assert.deepEqual(await loadAllPhotos(), beforePhotos);
  assert.deepEqual(loadTripInfo(), beforeText);
  corruptDownload = false;
  failUpload = true;
  await assert.rejects(() => pushLocalTripToCloud(), /upload outage/);
  assert.deepEqual(await loadAllPhotos(), beforePhotos);
  failUpload = false;
  markCloudSyncCurrent({ revision: 1 });
  await assert.rejects(() => pushLocalTripToCloud(), /conflict/);
  assert.equal(master.revision, 3);
  markCloudSyncCurrent({ revision: 3 });
  editDuringPush = true;
  await pushLocalTripToCloud();
  assert.equal(loadCloudSyncState().dirty, true, 'edits during Push remain pending');
  editDuringPush = false;

  assert.throws(() => validateTripSnapshot({ ...master, covers: { [dayId]: 999 } }), /Cover/);
  assert.throws(
    () => validateTripSnapshot({ ...master, photos: [...master.photos, ...master.photos] }),
    /duplicate/,
  );
  const legacy = { ...master, version: 1 };
  delete legacy.photos;
  delete legacy.covers;
  master = legacy;
  await pullCloudTripToLocal({ allowDirty: true });
  assert.deepEqual(await loadAllPhotos(), beforePhotos, 'legacy Pull preserves local photos');
  assert.equal(loadCloudSyncState().dirty, true, 'preserved photos still need pushing');
  assert.equal(localStorage.getItem(`${COVERS_PREFIX}${dayId}`), JSON.stringify(second));
});
