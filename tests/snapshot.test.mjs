import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import config from '../trip.config.js';
import {
  COVERS_PREFIX,
  loadEditableDayNote,
  loadEditableTripDays,
  loadTravelInfo,
  loadTripInfo,
  saveEditableDayNote,
  saveEditableTripDays,
  saveTravelInfo,
  saveTripInfo,
} from '../src/storage.js';
import {
  TRIP_SNAPSHOT_FORMAT,
  TRIP_SNAPSHOT_VERSION,
  createLocalTripSnapshot,
  parseTripSnapshot,
  restoreLocalTripSnapshot,
  serializeTripSnapshot,
  validateTripSnapshot,
} from '../src/snapshot.js';

function installLocalStorage(t) {
  const dom = new JSDOM('', { url: 'https://snapshot-test.example/' });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: dom.window.localStorage,
  });
  t.after(() => {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  return dom.window.localStorage;
}

test('text trip snapshot round-trips a complete local working copy', (t) => {
  const storage = installLocalStorage(t);
  const firstDate = config.days[0].date;
  const secondDate = config.days[1].date;
  const orphanNoteDate = '2099-12-31';
  const createdAt = '2026-10-04T08:15:30.000Z';

  const editedInfo = {
    title: 'Snapshot Test Trip',
    subtitle: 'Restored on another device',
    startDate: config.days[0].date,
    endDate: config.days.at(-1).date,
    timeZone: config.timeZone,
  };
  const editedDays = config.days.map((day, index) => ({
    ...day,
    title: index === 0 ? 'Edited first day' : day.title,
  }));
  const editedTravel = config.travel.map((section, index) => ({
    ...section,
    details: index === 0 ? ['Cloud snapshot test'] : section.details,
  }));

  saveTripInfo(editedInfo);
  saveEditableTripDays(editedDays);
  saveTravelInfo(editedTravel);
  saveEditableDayNote(firstDate, 'First saved note');
  saveEditableDayNote(secondDate, 'Second saved note');
  saveEditableDayNote(orphanNoteDate, 'Keep an older saved note too');

  const original = createLocalTripSnapshot({ revision: 7, createdAt });
  assert.equal(original.format, TRIP_SNAPSHOT_FORMAT);
  assert.equal(original.version, TRIP_SNAPSHOT_VERSION);
  assert.equal(original.tripId, config.id);
  assert.equal(original.revision, 7);
  assert.equal(original.createdAt, createdAt);
  assert.equal(original.tripInfo.title, editedInfo.title);
  assert.equal(original.tripDays[0].title, 'Edited first day');
  assert.equal(original.travel[0].details[0], 'Cloud snapshot test');
  assert.equal(original.dayNotes[firstDate], 'First saved note');
  assert.equal(original.dayNotes[orphanNoteDate], 'Keep an older saved note too');

  const serialized = serializeTripSnapshot(original);
  assert.deepEqual(parseTripSnapshot(serialized), original);

  storage.clear();
  storage.setItem('trip:other-trip:notes:v1:2099-01-01', 'Do not touch another trip');
  storage.setItem(`${COVERS_PREFIX}${firstDate}`, JSON.stringify(999));
  restoreLocalTripSnapshot(parseTripSnapshot(serialized));

  const restored = createLocalTripSnapshot({ revision: 7, createdAt });
  assert.deepEqual(restored, original);
  assert.deepEqual(loadTripInfo(), original.tripInfo);
  assert.deepEqual(loadEditableTripDays(), original.tripDays);
  assert.deepEqual(loadTravelInfo(), original.travel);
  assert.equal(loadEditableDayNote(firstDate), 'First saved note');
  assert.equal(loadEditableDayNote(orphanNoteDate), 'Keep an older saved note too');
  assert.equal(storage.getItem('trip:other-trip:notes:v1:2099-01-01'), 'Do not touch another trip');
  assert.equal(storage.getItem(`${COVERS_PREFIX}${firstDate}`), '999');
});

test('snapshot validation rejects unsafe or incompatible replacements before writing', (t) => {
  const storage = installLocalStorage(t);
  const createdAt = '2026-10-04T08:15:30.000Z';
  saveTripInfo({
    title: 'Keep this local copy',
    subtitle: '',
    startDate: config.days[0].date,
    endDate: config.days.at(-1).date,
    timeZone: config.timeZone,
  });
  const snapshot = createLocalTripSnapshot({ revision: 2, createdAt });
  const before = storage.getItem(`trip:${config.id}:info:v1`);

  assert.throws(
    () => restoreLocalTripSnapshot({ ...snapshot, tripId: 'different-trip' }),
    /different trip/,
  );
  assert.equal(storage.getItem(`trip:${config.id}:info:v1`), before);

  assert.throws(
    () => validateTripSnapshot({ ...snapshot, version: TRIP_SNAPSHOT_VERSION + 1 }),
    /Unsupported trip snapshot version/,
  );
  assert.throws(
    () => validateTripSnapshot({ ...snapshot, revision: -1 }),
    /revision must be a non-negative integer/,
  );
  assert.throws(
    () => validateTripSnapshot({ ...snapshot, dayNotes: { 'not-a-date': 'Bad note' } }),
    /YYYY-MM-DD/,
  );
  assert.throws(() => parseTripSnapshot('{bad json'), /invalid JSON/);
});
