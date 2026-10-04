import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import config from '../trip.config.js';
import {
  CLOUD_SYNC_STATE_KEY,
  initCloudSyncState,
  loadCloudSyncState,
  markCloudSyncCurrent,
  renderCloudSyncState,
} from '../src/cloud-state.js';
import {
  saveEditableDayNote,
  saveEditableTripDays,
  saveTravelInfo,
  saveTripInfo,
} from '../src/storage.js';

const template = await readFile('index.html', 'utf8');

function installBrowser(t) {
  const dom = new JSDOM(template, { url: 'https://cloud-state-test.example/' });
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

function validTripInfo(title = config.title) {
  return {
    title,
    subtitle: config.subtitle,
    startDate: config.startDate || config.days[0].date,
    endDate: config.endDate || config.days.at(-1).date,
    timeZone: config.timeZone,
  };
}

test('local text edits become pending immediately and remain pending after reload', (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();

  const status = dom.window.document.getElementById('cloudSyncStatus');
  assert.equal(loadCloudSyncState().dirty, false);
  assert.match(status.textContent, /No local changes waiting to push/i);

  saveTripInfo(validTripInfo('Dirty-state test trip'));
  assert.equal(loadCloudSyncState().dirty, true);
  assert.match(status.textContent, /Local changes not pushed/i);
  assert.ok(localStorage.getItem(CLOUD_SYNC_STATE_KEY));

  // Simulate a reload by resetting visible text and rendering from persisted metadata again.
  status.textContent = 'stale page text';
  renderCloudSyncState();
  assert.match(status.textContent, /Local changes not pushed/i);
  assert.equal(loadCloudSyncState().dirty, true);
});

test('a successful sync marker clears pending state and the next text edit makes it dirty again', (t) => {
  const dom = installBrowser(t);
  localStorage.clear();
  initCloudSyncState();
  const pushedAt = '2026-10-04T08:30:00.000Z';

  saveTripInfo(validTripInfo('Before simulated push'));
  markCloudSyncCurrent({ revision: 4, lastPushed: pushedAt });

  const stateAfterPush = loadCloudSyncState();
  assert.equal(stateAfterPush.dirty, false);
  assert.equal(stateAfterPush.revision, 4);
  assert.equal(stateAfterPush.lastPushed, pushedAt);
  assert.match(dom.window.document.getElementById('cloudSyncStatus').textContent, /Up to date/i);
  assert.equal(dom.window.document.getElementById('cloudRevision').textContent, '4');
  assert.notEqual(dom.window.document.getElementById('cloudLastPushed').textContent, 'Never');

  saveEditableDayNote(config.days[0].date, 'Edited after push');
  assert.equal(loadCloudSyncState().dirty, true);
  assert.match(
    dom.window.document.getElementById('cloudSyncStatus').textContent,
    /Local changes not pushed/i,
  );
});

test('all snapshot text save paths mark the working copy dirty', (t) => {
  installBrowser(t);
  localStorage.clear();

  const resetClean = () => markCloudSyncCurrent({ revision: 1 });

  resetClean();
  saveTravelInfo(config.travel);
  assert.equal(loadCloudSyncState().dirty, true);

  resetClean();
  saveEditableTripDays(config.days);
  assert.equal(loadCloudSyncState().dirty, true);

  resetClean();
  saveEditableDayNote(config.days[0].date, 'A note');
  assert.equal(loadCloudSyncState().dirty, true);

  resetClean();
  saveTripInfo(validTripInfo());
  assert.equal(loadCloudSyncState().dirty, true);
});

test('pre-existing local text data without sync metadata is treated as not yet pushed', (t) => {
  installBrowser(t);
  localStorage.clear();
  localStorage.setItem(
    `trip:${config.id}:info:v1`,
    JSON.stringify(validTripInfo('Older local trip')),
  );

  assert.equal(localStorage.getItem(CLOUD_SYNC_STATE_KEY), null);
  assert.equal(loadCloudSyncState().dirty, true);
});
