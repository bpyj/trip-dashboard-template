import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import config from '../trip.config.js';
import { clearCloudStorageAdapter, setCloudStorageAdapter } from '../src/cloud-storage.js';
import {
  initCloudSyncState,
  loadCloudSyncState,
  markCloudSyncCurrent,
} from '../src/cloud-state.js';
import { initCloudSyncControls, pullCloudTripToLocal } from '../src/cloud-sync.js';
import { createLocalTripSnapshot } from '../src/snapshot.js';
import {
  loadEditableDayNote,
  loadTripInfo,
  saveEditableDayNote,
  saveTripInfo,
} from '../src/storage.js';

const template = await readFile('index.html', 'utf8');
const wait = (milliseconds = 25) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function installBrowser(t) {
  const dom = new JSDOM(template, { url: 'https://cloud-pull-test.example/' });
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

function createCloudSnapshot(title, note, revision) {
  saveTripInfo(validTripInfo(title));
  saveEditableDayNote(config.days[0].date, note);
  return createLocalTripSnapshot({
    revision,
    createdAt: '2026-10-04T09:30:00.000Z',
  });
}

function createLoadAdapter(snapshot, { delay = 0, failure = null } = {}) {
  let loads = 0;
  return {
    get loads() {
      return loads;
    },
    async loadTrip() {
      loads += 1;
      if (delay) await wait(delay);
      if (failure) throw failure;
      return snapshot == null ? null : structuredClone(snapshot);
    },
    async saveTrip() {
      throw new Error('saveTrip not used by Pull tests');
    },
  };
}

test('Pull replaces a clean local working copy and adopts the cloud revision', async (t) => {
  installBrowser(t);
  localStorage.clear();
  initCloudSyncState();

  const cloud = createCloudSnapshot('CLOUD TEST A', 'cloud note', 3);
  saveTripInfo(validTripInfo('LOCAL TEST B'));
  saveEditableDayNote(config.days[0].date, 'local note');
  markCloudSyncCurrent({
    revision: 2,
    lastPushed: '2026-10-04T09:25:00.000Z',
  });
  setCloudStorageAdapter(createLoadAdapter(cloud));

  const pulledAt = '2026-10-04T09:35:00.000Z';
  const restored = await pullCloudTripToLocal({ now: pulledAt });

  assert.equal(restored.revision, 3);
  assert.equal(loadTripInfo().title, 'CLOUD TEST A');
  assert.equal(loadEditableDayNote(config.days[0].date), 'cloud note');
  assert.deepEqual(loadCloudSyncState(), {
    dirty: false,
    revision: 3,
    lastPushed: '2026-10-04T09:25:00.000Z',
    lastPulled: pulledAt,
  });
});

test('Pull button shows progress, blocks repeat actions and reloads after restore', async (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();

  const cloud = createCloudSnapshot('CLOUD BUTTON TEST', 'button cloud note', 2);
  saveTripInfo(validTripInfo('OLDER LOCAL COPY'));
  markCloudSyncCurrent({ revision: 1 });
  setCloudStorageAdapter(createLoadAdapter(cloud, { delay: 20 }));

  let reloads = 0;
  initCloudSyncControls({
    reload() {
      reloads += 1;
    },
  });

  const pullButton = dom.window.document.getElementById('pullCloudBtn');
  const pushButton = dom.window.document.getElementById('pushCloudBtn');
  const status = dom.window.document.getElementById('cloudSyncStatus');
  assert.equal(pullButton.disabled, false);
  pullButton.click();

  assert.equal(pullButton.disabled, true);
  assert.equal(pushButton.disabled, true);
  assert.match(status.textContent, /Pulling cloud trip to this device/i);

  await wait(45);
  assert.equal(reloads, 1);
  assert.equal(loadTripInfo().title, 'CLOUD BUTTON TEST');
  assert.equal(loadCloudSyncState().dirty, false);
  assert.equal(loadCloudSyncState().revision, 2);
  assert.match(status.textContent, /Cloud trip restored/i);
});

test('dirty Pull requires explicit Replace & Pull and Cancel preserves local edits', async (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();

  const cloud = createCloudSnapshot('CLOUD REPLACEMENT', 'cloud replacement note', 2);
  saveTripInfo(validTripInfo('CLEAN LOCAL COPY'));
  markCloudSyncCurrent({ revision: 1 });
  saveTripInfo(validTripInfo('UNSYNCED LOCAL EDIT'));

  const adapter = createLoadAdapter(cloud, { delay: 20 });
  setCloudStorageAdapter(adapter);
  let reloads = 0;
  initCloudSyncControls({ reload: () => (reloads += 1) });

  const pullButton = dom.window.document.getElementById('pullCloudBtn');
  const warning = dom.window.document.getElementById('cloudPullWarning');
  const cancelButton = dom.window.document.getElementById('cancelCloudPullBtn');
  const confirmButton = dom.window.document.getElementById('confirmCloudPullBtn');
  const status = dom.window.document.getElementById('cloudSyncStatus');

  assert.equal(loadCloudSyncState().dirty, true);
  assert.equal(pullButton.disabled, false);
  assert.equal(warning.classList.contains('hidden'), true);

  pullButton.click();
  assert.equal(warning.classList.contains('hidden'), false);
  assert.equal(dom.window.document.activeElement, cancelButton);
  assert.equal(adapter.loads, 0);
  assert.equal(loadTripInfo().title, 'UNSYNCED LOCAL EDIT');
  assert.match(status.textContent, /Confirm before Pull replaces them/i);

  cancelButton.click();
  assert.equal(warning.classList.contains('hidden'), true);
  assert.equal(dom.window.document.activeElement, pullButton);
  assert.equal(adapter.loads, 0);
  assert.equal(loadTripInfo().title, 'UNSYNCED LOCAL EDIT');
  assert.equal(loadCloudSyncState().dirty, true);
  assert.match(status.textContent, /Local changes not pushed/i);

  pullButton.click();
  confirmButton.click();
  assert.equal(warning.classList.contains('hidden'), true);
  assert.equal(pullButton.disabled, true);
  assert.match(status.textContent, /Pulling cloud trip to this device/i);

  await wait(45);
  assert.equal(adapter.loads, 1);
  assert.equal(reloads, 1);
  assert.equal(loadTripInfo().title, 'CLOUD REPLACEMENT');
  assert.equal(loadEditableDayNote(config.days[0].date), 'cloud replacement note');
  assert.equal(loadCloudSyncState().dirty, false);
  assert.equal(loadCloudSyncState().revision, 2);
});

test('dirty Pull remains blocked at the data layer unless replacement is explicitly allowed', async (t) => {
  installBrowser(t);
  localStorage.clear();
  initCloudSyncState();

  const cloud = createCloudSnapshot('CLOUD MUST WAIT', 'cloud waits', 2);
  saveTripInfo(validTripInfo('CLEAN LOCAL COPY'));
  markCloudSyncCurrent({ revision: 1 });
  saveTripInfo(validTripInfo('UNSYNCED LOCAL EDIT'));
  const adapter = createLoadAdapter(cloud);
  setCloudStorageAdapter(adapter);

  await assert.rejects(() => pullCloudTripToLocal(), /blocked to protect this device/i);
  assert.equal(adapter.loads, 0);
  assert.equal(loadTripInfo().title, 'UNSYNCED LOCAL EDIT');
  assert.equal(loadCloudSyncState().dirty, true);

  await pullCloudTripToLocal({ allowDirty: true, now: '2026-10-04T09:36:00.000Z' });
  assert.equal(adapter.loads, 1);
  assert.equal(loadTripInfo().title, 'CLOUD MUST WAIT');
  assert.equal(loadCloudSyncState().dirty, false);
  assert.equal(loadCloudSyncState().revision, 2);
});

test('Escape closes the destructive Pull warning without loading cloud data', (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();

  const cloud = createCloudSnapshot('CLOUD ESCAPE TEST', 'cloud escape note', 2);
  saveTripInfo(validTripInfo('CLEAN LOCAL COPY'));
  markCloudSyncCurrent({ revision: 1 });
  saveTripInfo(validTripInfo('LOCAL ESCAPE TEST'));
  const adapter = createLoadAdapter(cloud);
  setCloudStorageAdapter(adapter);
  initCloudSyncControls();

  const pullButton = dom.window.document.getElementById('pullCloudBtn');
  const warning = dom.window.document.getElementById('cloudPullWarning');
  pullButton.click();
  assert.equal(warning.classList.contains('hidden'), false);

  warning.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(warning.classList.contains('hidden'), true);
  assert.equal(dom.window.document.activeElement, pullButton);
  assert.equal(adapter.loads, 0);
  assert.equal(loadTripInfo().title, 'LOCAL ESCAPE TEST');
});

test('failed confirmed Pull preserves dirty local data and remains retryable', async (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();
  saveTripInfo(validTripInfo('CLEAN LOCAL COPY'));
  markCloudSyncCurrent({ revision: 4, lastPulled: '2026-10-04T09:10:00.000Z' });
  saveTripInfo(validTripInfo('LOCAL COPY MUST SURVIVE PULL FAILURE'));

  const failure = new Error('temporary pull outage');
  setCloudStorageAdapter(createLoadAdapter(null, { failure }));
  let reloads = 0;
  initCloudSyncControls({ reload: () => (reloads += 1) });

  const beforeInfo = loadTripInfo();
  const beforeState = loadCloudSyncState();
  const pullButton = dom.window.document.getElementById('pullCloudBtn');
  const confirmButton = dom.window.document.getElementById('confirmCloudPullBtn');
  const status = dom.window.document.getElementById('cloudSyncStatus');

  pullButton.click();
  confirmButton.click();
  await wait();

  assert.deepEqual(loadTripInfo(), beforeInfo);
  assert.deepEqual(loadCloudSyncState(), beforeState);
  assert.equal(reloads, 0);
  assert.equal(pullButton.disabled, false);
  assert.match(status.textContent, /Pull failed/i);
  assert.match(status.textContent, /Local trip remains on this device/i);
  assert.match(status.textContent, /temporary pull outage/i);
});

test('empty cloud store leaves local data untouched and does not reload', async (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();
  saveTripInfo(validTripInfo('LOCAL ONLY'));
  markCloudSyncCurrent({ revision: 1 });
  setCloudStorageAdapter(createLoadAdapter(null));

  let reloads = 0;
  initCloudSyncControls({ reload: () => (reloads += 1) });
  const pullButton = dom.window.document.getElementById('pullCloudBtn');
  const status = dom.window.document.getElementById('cloudSyncStatus');
  pullButton.click();
  await wait();

  assert.equal(reloads, 0);
  assert.equal(loadTripInfo().title, 'LOCAL ONLY');
  assert.equal(loadCloudSyncState().revision, 1);
  assert.match(status.textContent, /No cloud trip has been pushed yet/i);
  assert.match(status.textContent, /Local data was not changed/i);
  assert.equal(pullButton.disabled, false);
});
