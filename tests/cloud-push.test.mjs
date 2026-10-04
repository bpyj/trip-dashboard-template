import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import config from '../trip.config.js';
import { clearCloudStorageAdapter, setCloudStorageAdapter } from '../src/cloud-storage.js';
import { initCloudSyncState, loadCloudSyncState } from '../src/cloud-state.js';
import { initCloudSyncControls, pushLocalTripToCloud } from '../src/cloud-sync.js';
import { loadTripInfo, saveTripInfo } from '../src/storage.js';

const template = await readFile('index.html', 'utf8');
const wait = (milliseconds = 25) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function installBrowser(t) {
  const dom = new JSDOM(template, { url: 'https://cloud-push-test.example/' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: dom.window.localStorage,
  });
  t.after(() => {
    clearCloudStorageAdapter();
    dom.window.close();
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.localStorage)
      Object.defineProperty(globalThis, 'localStorage', previous.localStorage);
    else delete globalThis.localStorage;
  });
  return dom;
}

function validTripInfo(title) {
  return {
    title,
    subtitle: config.subtitle,
    startDate: config.startDate || config.days[0].date,
    endDate: config.endDate || config.days.at(-1).date,
    timeZone: config.timeZone,
  };
}

function createMemoryCloudAdapter({ failSave = null, delay = 0 } = {}) {
  let stored = null;
  const saves = [];
  return {
    saves,
    get stored() {
      return stored;
    },
    async loadTrip() {
      return stored == null ? null : structuredClone(stored);
    },
    async saveTrip(input) {
      saves.push(structuredClone(input));
      if (delay) await wait(delay);
      if (failSave) throw failSave;
      const currentRevision = stored?.revision ?? null;
      if (input.expectedRevision !== currentRevision) {
        throw new Error(
          `Revision conflict: expected ${input.expectedRevision}, cloud is ${currentRevision}.`,
        );
      }
      stored = structuredClone(input.snapshot);
      return structuredClone(stored);
    },
  };
}

test('Push stores the full local text snapshot, advances revision and clears dirty state', async (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();
  const adapter = createMemoryCloudAdapter();
  setCloudStorageAdapter(adapter);
  initCloudSyncControls();

  const pushButton = dom.window.document.getElementById('pushCloudBtn');
  const pullButton = dom.window.document.getElementById('pullCloudBtn');
  assert.equal(pushButton.disabled, false);
  assert.equal(pullButton.disabled, true);

  saveTripInfo(validTripInfo('TEST A'));
  assert.equal(loadCloudSyncState().dirty, true);

  const firstPushTime = '2026-10-04T09:15:00.000Z';
  const first = await pushLocalTripToCloud({ now: firstPushTime });
  assert.equal(first.revision, 1);
  assert.equal(adapter.stored.revision, 1);
  assert.equal(adapter.stored.tripInfo.title, 'TEST A');
  assert.equal(adapter.saves[0].expectedRevision, null);
  assert.equal(adapter.saves[0].snapshot.revision, 1);
  assert.deepEqual(adapter.saves[0].tripId, config.id);
  assert.deepEqual(loadCloudSyncState(), {
    dirty: false,
    revision: 1,
    lastPushed: firstPushTime,
    lastPulled: null,
  });

  saveTripInfo(validTripInfo('TEST B'));
  const secondPushTime = '2026-10-04T09:16:00.000Z';
  const second = await pushLocalTripToCloud({ now: secondPushTime });
  assert.equal(second.revision, 2);
  assert.equal(adapter.stored.tripInfo.title, 'TEST B');
  assert.equal(adapter.saves[1].expectedRevision, 1);
  assert.equal(adapter.saves[1].snapshot.revision, 2);
  assert.equal(loadCloudSyncState().dirty, false);
  assert.equal(loadCloudSyncState().revision, 2);
});

test('Push button shows progress, prevents repeat taps and finishes up to date', async (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();
  setCloudStorageAdapter(createMemoryCloudAdapter({ delay: 20 }));
  initCloudSyncControls();
  saveTripInfo(validTripInfo('BUTTON PUSH TEST'));

  const pushButton = dom.window.document.getElementById('pushCloudBtn');
  const status = dom.window.document.getElementById('cloudSyncStatus');
  pushButton.click();

  assert.equal(pushButton.disabled, true);
  assert.match(status.textContent, /Pushing local changes to cloud/i);

  await wait(45);
  assert.equal(pushButton.disabled, false);
  assert.match(status.textContent, /Up to date/i);
  assert.equal(loadCloudSyncState().dirty, false);
  assert.equal(loadCloudSyncState().revision, 1);
});

test('failed Push leaves local trip and dirty state untouched and allows retry', async (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();
  const failure = new Error('temporary cloud outage');
  const adapter = createMemoryCloudAdapter({ failSave: failure });
  setCloudStorageAdapter(adapter);
  initCloudSyncControls();
  saveTripInfo(validTripInfo('LOCAL COPY MUST SURVIVE'));

  const before = loadTripInfo();
  const pushButton = dom.window.document.getElementById('pushCloudBtn');
  const status = dom.window.document.getElementById('cloudSyncStatus');
  pushButton.click();
  await wait();

  assert.deepEqual(loadTripInfo(), before);
  assert.equal(loadCloudSyncState().dirty, true);
  assert.equal(loadCloudSyncState().revision, null);
  assert.equal(adapter.stored, null);
  assert.equal(pushButton.disabled, false);
  assert.match(status.textContent, /Push failed/i);
  assert.match(status.textContent, /Local changes remain on this device/i);
  assert.match(status.textContent, /temporary cloud outage/i);
});

test('unexpected cloud revision is rejected without marking local changes current', async (t) => {
  installBrowser(t);
  localStorage.clear();
  initCloudSyncState();
  saveTripInfo(validTripInfo('REVISION SAFETY TEST'));
  setCloudStorageAdapter({
    async loadTrip() {
      return null;
    },
    async saveTrip({ snapshot }) {
      return { ...snapshot, revision: snapshot.revision + 1 };
    },
  });

  await assert.rejects(
    () => pushLocalTripToCloud({ now: '2026-10-04T09:17:00.000Z' }),
    /expected revision 1/i,
  );
  assert.equal(loadCloudSyncState().dirty, true);
  assert.equal(loadCloudSyncState().revision, null);
});
