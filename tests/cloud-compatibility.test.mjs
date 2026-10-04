import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
import config from '../trip.config.js';
import { setCloudStorageAdapter, clearCloudStorageAdapter } from '../src/cloud-storage.js';
import { pushLocalTripToCloud, pullCloudTripToLocal } from '../src/cloud-sync.js';
import { loadCloudSyncState, markCloudSyncCurrent } from '../src/cloud-state.js';
import { createLocalTripSnapshot } from '../src/snapshot.js';
import {
  addPhotoRecord,
  loadAllPhotos,
  loadDayCoverId,
  saveDayCoverId,
  saveEditableDayNote,
  saveTripInfo,
  loadTripInfo,
  COVERS_PREFIX,
} from '../src/storage.js';
import { restoreTripWithPhotos } from '../src/cloud-photos.js';

test('legacy data, rollback and concurrent changes are protected during photo synchronization', async (t) => {
  const dom = new JSDOM('', { url: 'https://compatibility.test/' });
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
  let master = null;
  let onLoad = () => {};
  let onUpload = () => {};
  const blobs = new Map();
  const adapter = {
    async loadTrip() {
      onLoad();
      return structuredClone(master);
    },
    async saveTrip({ snapshot, expectedRevision }) {
      if (expectedRevision !== (master?.revision ?? null)) throw new Error('stale revision');
      master = structuredClone(snapshot);
      return structuredClone(master);
    },
    async savePhoto({ photoId, bytes }) {
      blobs.set(photoId, bytes);
      onUpload();
    },
    async loadPhoto({ photoId }) {
      if (!blobs.has(photoId)) throw new Error('missing image');
      return blobs.get(photoId);
    },
  };
  setCloudStorageAdapter(adapter);
  const dayId = config.days[0].date;
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const id = await addPhotoRecord({
    dayId,
    dataUrl: gif,
    caption: 'Existing GIF',
    type: 'image/gif',
    name: 'old.gif',
    createdAt: '2026-01-01T00:00:00Z',
  });
  saveDayCoverId(dayId, id);
  saveEditableDayNote('2099-12-31', 'An older note outside the current itinerary');
  localStorage.setItem('trip:another-trip:notes:v1:2099-12-31', 'Other trip is untouched');
  master = createLocalTripSnapshot({ revision: 1 });
  markCloudSyncCurrent({ revision: 1 });
  await assert.rejects(() => pullCloudTripToLocal(), /protect this device/);
  assert.equal((await loadAllPhotos())[0].id, id);
  await pushLocalTripToCloud();
  assert.equal(master.version, 2);
  assert.equal(master.photos[0].type, 'image/gif');
  assert.equal(master.dayNotes['2099-12-31'], 'An older note outside the current itinerary');
  await pullCloudTripToLocal();
  assert.equal((await loadAllPhotos())[0].dataUrl, gif);
  assert.equal(loadDayCoverId(dayId), id);

  // Simulate a second tab editing while the first awaits its cloud response.
  onLoad = () => localStorage.setItem(`trip:${config.id}:local-change-token:v1`, 'other-tab-edit');
  const before = await loadAllPhotos();
  await assert.rejects(() => pullCloudTripToLocal(), /Local changes occurred/);
  assert.deepEqual(await loadAllPhotos(), before);
  onLoad = () => {};
  onUpload = () => saveTripInfo({ ...loadTripInfo(), title: 'Edited while uploading' });
  const revision = master.revision;
  await assert.rejects(() => pushLocalTripToCloud(), /Local changes occurred during Push/);
  assert.equal(master.revision, revision, 'mixed snapshot is never committed');
  onUpload = () => {};
  await pushLocalTripToCloud();

  // Force a one-time cover write failure after text is staged. Both stores roll back.
  saveTripInfo({ ...loadTripInfo(), title: 'LOCAL COPY MUST SURVIVE' });
  const beforeLocal = new Map(
    Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, localStorage.getItem(key)];
    }),
  );
  const proto = dom.window.Storage.prototype;
  const originalSet = proto.setItem;
  let injected = false;
  proto.setItem = function (key, value) {
    if (!injected && key === `${COVERS_PREFIX}${dayId}`) {
      injected = true;
      throw new Error('simulated storage full');
    }
    return originalSet.call(this, key, value);
  };
  try {
    await assert.rejects(
      () => pullCloudTripToLocal({ allowDirty: true }),
      /simulated storage full/,
    );
  } finally {
    proto.setItem = originalSet;
  }
  assert.equal(injected, true);
  assert.deepEqual(await loadAllPhotos(), before);
  assert.deepEqual(
    new Map(
      Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index);
        return [key, localStorage.getItem(key)];
      }),
    ),
    beforeLocal,
  );
  assert.equal(loadCloudSyncState().dirty, true);

  // The late transaction guard aborts before replacing photos or text.
  await assert.rejects(
    () =>
      restoreTripWithPhotos(master, [], () => {
        throw new Error('late edit');
      }),
    /late edit/,
  );
  assert.deepEqual(await loadAllPhotos(), before);
  assert.equal(loadTripInfo().title, 'LOCAL COPY MUST SURVIVE');

  const objectId = master.photos[0].blobId;
  const storedBytes = blobs.get(objectId);
  blobs.delete(objectId);
  await assert.rejects(() => pullCloudTripToLocal({ allowDirty: true }), /missing image/);
  assert.deepEqual(await loadAllPhotos(), before);
  assert.equal(loadTripInfo().title, 'LOCAL COPY MUST SURVIVE');
  blobs.set(objectId, storedBytes);

  await pullCloudTripToLocal({ allowDirty: true });
  const jpgId = await addPhotoRecord({
    dayId: '2099-12-31',
    dataUrl: 'data:image/jpg;base64,/9j/2Q==',
    type: 'image/jpg',
    caption: 'Older JPG',
    createdAt: '2026-01-02T00:00:00Z',
  });
  assert.ok(jpgId > id, 'existing IndexedDB IDs and auto increment remain compatible');
  await pushLocalTripToCloud();
  assert.equal(master.photos.find((photo) => photo.id === jpgId).type, 'image/jpeg');
  assert.equal(master.photos.find((photo) => photo.id === jpgId).dayId, '2099-12-31');
  assert.equal(
    localStorage.getItem('trip:another-trip:notes:v1:2099-12-31'),
    'Other trip is untouched',
  );

  // An explicitly confirmed empty cloud album removes local photos and stale covers.
  master = { ...master, revision: master.revision + 1, photos: [], covers: {} };
  await pullCloudTripToLocal();
  assert.deepEqual(await loadAllPhotos(), []);
  assert.equal(loadDayCoverId(dayId), null);
  assert.equal(
    localStorage.getItem('trip:another-trip:notes:v1:2099-12-31'),
    'Other trip is untouched',
  );
});
