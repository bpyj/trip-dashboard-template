import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import config from '../trip.config.js';
import { validateDays, validateTripConfig, validateTripInfo } from '../src/model.js';

const css = await readFile('style.css', 'utf8');
const template = await readFile('index.html', 'utf8');
const bundle = await build({
  stdin: {
    contents: `import './src/app.js';\n${['state', 'storage', 'days', 'view', 'photos', 'archive'].map((name) => `export * from './src/${name}.js';`).join('\n')}`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'iife',
  globalName: 'TripTest',
  write: false,
});
const embedded = template
  .replace(/<link\b(?=[^>]*\bid="appStyles")[^>]*>/, () => `<style id="appStyles">${css}</style>`)
  .replace(
    '<script id="appScript" type="module" src="src/app.js"></script>',
    () => `<script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`,
  );
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

function openDashboard(database, storage = {}) {
  const errors = [];
  const tools = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(embedded, {
    url: 'https://trip.example/',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.indexedDB = database;
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.alert = (message) => {
        throw new Error(message);
      };
      window.document.modelContext = {
        registerTool(tool) {
          tools.push(tool);
        },
      };
      for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
    },
  });
  return { dom, window: dom.window, errors, tools };
}

test('configuration rejects invalid dates and separates trip identities', () => {
  assert.throws(() => validateDays([{ date: '2027-02-30' }]));
  assert.throws(() => validateDays([{ date: '2027-06-01' }, { date: '2027-06-01' }]));
  assert.throws(() => validateTripConfig({ ...config, id: '../invalid' }));
  assert.throws(() => validateTripConfig({ ...config, timeZone: 'Unknown/Place' }));
  assert.equal(
    validateDays([
      { date: '2027-06-01', gettingThere: [{ text: 'Bad', url: 'javascript:alert(1)' }] },
    ])[0].links.length,
    0,
  );
});

test('editing, storage, photos and self-contained archives survive the refactor', async (t) => {
  const database = new IDBFactory();
  const live = openDashboard(database, { 'trip:other-trip:notes:v1:2027-06-02': 'Other trip' });
  t.after(() => live.dom.window.close());
  await tick();
  const window = live.window;
  const app = window.TripTest;
  const document = window.document;
  assert.equal(live.errors.length, 0, live.errors.map((error) => error.message).join('\n'));
  assert.equal(document.querySelectorAll('.day-card').length, 3);
  assert.equal(document.title, config.title);
  assert.equal(app.getDayNote('2027-06-02'), '');
  const editedTitle = 'Our trip <img src=x onerror=alert(1)>';
  document.getElementById('editTripBtn').click();
  assert.equal(document.getElementById('tripEditor').classList.contains('hidden'), false);
  document.getElementById('editTripTitle').value = editedTitle;
  document.getElementById('editTripSubtitle').value = 'Family memories';
  document
    .getElementById('tripEditor')
    .dispatchEvent(new window.Event('submit', { cancelable: true }));
  assert.equal(document.title, editedTitle);
  assert.equal(document.getElementById('tripTitle').textContent, editedTitle);
  assert.equal(document.querySelectorAll('#tripTitle img').length, 0);
  assert.equal(document.getElementById('tripSubtitle').textContent, 'Family memories');
  assert.equal(document.getElementById('tripEditor').classList.contains('hidden'), true);
  document.getElementById('editTripBtn').click();
  document.getElementById('editTripTitle').value = 'Discard this';
  document.getElementById('cancelTripBtn').click();
  assert.equal(document.title, editedTitle);
  assert.equal(document.querySelector('#day-2027-06-02 .day-album-btn').disabled, false);
  assert.equal(document.querySelector('.edit-day-btn').classList.contains('secondary'), false);
  assert.equal(document.getElementById('todayHeading'), null);
  assert.equal(app.getNextTripDate(), '2027-06-04');

  const hostile = 'A day </script><img src=x onerror=alert(1)> $&';
  app.openDayEditor('2027-06-02');
  document.getElementById('edit-title-2027-06-02').value = hostile;
  document.getElementById('notes-2027-06-02').value = 'Lunch and memories';
  document.getElementById('edit-links-2027-06-02').value =
    'Bad | javascript:alert(1)\nMap | https://example.com/';
  app.saveDayEditor('2027-06-02');
  await tick();
  assert.equal(document.querySelector('#day-2027-06-02 .day-title').textContent, hostile);
  assert.equal(document.querySelectorAll('.day-title img').length, 0);
  assert.equal(app.tripDays[1].links.length, 1);
  assert.equal(app.getDayNote('2027-06-02'), 'Lunch and memories');

  const photoIds = [];
  for (let index = 0; index < 3; index++)
    photoIds.push(
      await app.addPhotoRecord({
        dayId: '2027-06-02',
        name: 'photo.jpg',
        dataUrl: 'data:image/jpeg;base64,/9j/2Q==',
        caption: `Photo ${index}`,
        createdAt: `2027-06-02T0${index}:00:00Z`,
      }),
    );
  await app.updatePhotoCaption(photoIds[2], 'Album cover');
  const photos = await app.loadPhotosByDay('2027-06-02');
  assert.equal(photos.length, 3);
  assert.equal(photos[0].caption, 'Album cover');
  await app.refreshDayPhotos('2027-06-02');
  const dayCard = document.getElementById('day-2027-06-02');
  const albumButton = dayCard.querySelector('.day-album-btn');
  if (dayCard.classList.contains('open')) dayCard.querySelector('.day-header').click();
  assert.equal(dayCard.classList.contains('open'), false);
  assert.equal(albumButton.disabled, false);
  albumButton.focus();
  albumButton.click();
  await tick();
  assert.equal(document.getElementById('photoModal').classList.contains('open'), true);
  assert.equal(dayCard.classList.contains('open'), false);
  assert.equal(dayCard.querySelector('.day-header').getAttribute('aria-expanded'), 'false');
  app.showNextPhoto();
  assert.equal(document.getElementById('photoModalCounter').textContent, '2 / 3');
  app.closePhotoModal();
  assert.equal(document.activeElement, albumButton);

  const payload = await app.buildArchivePayload();
  const html = app.buildArchiveHtml(payload, css);

  // No scripts or network are needed for day details and album navigation.
  const preview = new JSDOM(html, { url: 'file:///trip-archive.html' });
  t.after(() => preview.window.close());
  const archive = preview.window.document;
  assert.equal(
    archive.querySelector('.hero').nextElementSibling.querySelector('#travelInfo').id,
    'travelInfo',
  );
  assert.equal(
    archive.querySelector('.hero').nextElementSibling.nextElementSibling.id,
    'daysContainer',
  );
  assert.equal(archive.querySelectorAll('details[open]').length, 0);
  assert.equal(archive.querySelectorAll('[data-editable-only]').length, 0);
  assert.equal(archive.getElementById('tripTitle').textContent, editedTitle);
  assert.equal(archive.querySelectorAll('.day-card').length, 3);
  assert.equal(
    archive.querySelectorAll(
      '.edit-day-btn,.backup-panel,input[type="file"],textarea,.save-note-btn',
    ).length,
    0,
  );
  assert.equal(archive.querySelectorAll('script[src],link[rel="stylesheet"]').length, 0);
  assert.equal(
    archive.querySelector('#day-2027-06-02 .archive-note').textContent,
    'Lunch and memories',
  );
  assert.equal(
    archive.querySelector('#day-2027-06-02 .day-cover img').getAttribute('src'),
    photos[0].dataUrl,
  );
  const album = archive.querySelector('#day-2027-06-02 .archive-album');
  album.open = true;
  assert.equal(album.parentElement.querySelector('.archive-day-details').open, false);
  const figures = album.querySelectorAll('figure');
  const radios = album.querySelectorAll('input[type="radio"]');
  assert.equal(figures[0].firstElementChild.className, 'archive-photo-nav');
  figures[0].querySelector('label:last-child').click();
  assert.equal(radios[1].checked, true);
  assert.equal(preview.window.getComputedStyle(figures[0]).display, 'none');
  assert.equal(preview.window.location.hash, '');
  assert.equal(archive.querySelectorAll('.day-title img').length, 0);

  // Script-enabled archives open a read-only overlay without moving the page.
  const scrollCalls = [];
  const scripted = new JSDOM(html, {
    url: 'file:///trip-archive.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      Object.defineProperty(window, 'scrollY', { value: 240 });
      window.scrollTo = (options) => scrollCalls.push(options.top);
      window.fetch = () => {
        throw new Error('Archive must not use the network.');
      };
      window.indexedDB = {
        open() {
          throw new Error('Archive must not access storage.');
        },
      };
    },
  });
  t.after(() => scripted.window.close());
  const sd = scripted.window.document;
  const trigger = sd.querySelector('#day-2027-06-02 .day-album-btn');
  const overlay = sd.getElementById('archivePhotoModal');
  trigger.click();
  assert.equal(overlay.classList.contains('open'), true);
  assert.equal(sd.querySelector('#day-2027-06-02').classList.contains('open'), false);
  assert.equal(
    sd.querySelector('#day-2027-06-02 .day-heading-row').className,
    document.querySelector('.day-heading-row').className,
  );
  assert.equal(sd.querySelector('.wrap').inert, true);
  assert.equal(sd.body.style.position, 'fixed');
  assert.equal(sd.body.style.top, '-240px');
  assert.equal(overlay.querySelector('.photo-modal-counter').textContent, '1 / 3');
  assert.equal(
    overlay.querySelector('.photo-modal-dialog').firstElementChild.className,
    'photo-modal-top',
  );
  assert.equal(overlay.querySelector('.photo-nav.prev').dataset.action, 'previous');
  assert.deepEqual(
    [...overlay.querySelectorAll('.photo-modal-actions button')].map((el) => el.textContent.trim()),
    ['Close Album'],
  );
  overlay.querySelector('[data-action="next"]').click();
  assert.equal(overlay.querySelector('.photo-modal-counter').textContent, '2 / 3');
  overlay.querySelector('[data-action="previous"]').click();
  assert.equal(overlay.querySelector('.photo-modal-counter').textContent, '1 / 3');
  sd.dispatchEvent(
    new scripted.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
  );
  assert.equal(overlay.querySelector('.photo-modal-counter').textContent, '3 / 3');
  const overlayImage = overlay.querySelector('img');
  const touchStart = new scripted.window.Event('touchstart');
  Object.defineProperty(touchStart, 'touches', { value: [{ clientX: 200, clientY: 200 }] });
  overlayImage.dispatchEvent(touchStart);
  const touchEnd = new scripted.window.Event('touchend');
  Object.defineProperty(touchEnd, 'changedTouches', { value: [{ clientX: 100, clientY: 200 }] });
  overlayImage.dispatchEvent(touchEnd);
  assert.equal(overlay.querySelector('.photo-modal-counter').textContent, '1 / 3');
  assert.equal(scripted.window.location.hash, '');
  assert.equal(scrollCalls.length, 0);
  const close = overlay.querySelector('[data-action="close"]');
  overlay.querySelector('.photo-modal-actions [data-action="close"]').focus();
  close.dispatchEvent(
    new scripted.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
  );
  assert.equal(sd.activeElement, overlay.querySelector('[data-action="previous"]'));
  sd.dispatchEvent(new scripted.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(overlay.classList.contains('open'), false);
  assert.equal(sd.querySelector('.wrap').inert, undefined);
  assert.equal(sd.body.style.position, '');
  assert.deepEqual(scrollCalls, [240]);
  assert.equal(sd.activeElement, trigger);
  assert.equal(overlay.querySelectorAll('input,textarea').length, 0);
  for (const selector of [
    '.hero',
    '.panel',
    '.day-card',
    '.photo-modal-dialog',
    '.photo-modal-main',
    '.photo-modal-actions',
  ]) {
    assert.equal(sd.querySelector(selector).className, document.querySelector(selector).className);
  }
  assert.equal(
    sd.querySelector('#day-2027-06-02 .grid').innerHTML,
    document.querySelector('#day-2027-06-02 .grid').innerHTML,
  );
  assert.equal(
    sd.querySelectorAll(
      '.day-editor,.save-note-btn,#editTripBtn,#editTravelBtn,input,textarea,select',
    ).length,
    3,
  );
  // Only static album radio navigation remains; there are no editable fields.
  assert.equal(
    sd.querySelectorAll(
      'input:not([type="radio"]),textarea,select,.day-editor,.save-note-btn,#editTripBtn,#editTravelBtn',
    ).length,
    0,
  );
  const emptyAlbum = sd.querySelector('#day-2027-06-01 .day-album-btn');
  emptyAlbum.click();
  assert.equal(overlay.classList.contains('open'), true);
  assert.equal(overlay.querySelector('.photo-modal-counter').textContent, '0 photos');
  assert.equal(overlay.querySelector('.album-empty').classList.contains('hidden'), false);
  assert.equal(sd.querySelector('#day-2027-06-01').classList.contains('open'), false);
  overlay.querySelector('.photo-modal-actions [data-action="close"]').click();
  assert.equal(overlay.classList.contains('open'), false);
  sd.querySelector('#day-2027-06-01 .day-header').click();
  assert.equal(sd.querySelector('#day-2027-06-01').classList.contains('open'), true);
  sd.querySelector('.trip-title-row .heading-toggle').click();
  assert.equal(sd.getElementById('tripOverviewBody').classList.contains('hidden'), false);

  const saved = Object.fromEntries(
    Object.keys(window.localStorage).map((key) => [key, window.localStorage.getItem(key)]),
  );
  const reload = openDashboard(database, saved);
  t.after(() => reload.dom.window.close());
  await tick();
  assert.equal(reload.window.document.title, editedTitle);
  assert.equal(
    reload.window.document.getElementById('tripSubtitle').textContent,
    'Family memories',
  );
  assert.equal(reload.window.TripTest.tripDays[1].title, hostile);
  assert.equal((await reload.window.TripTest.loadPhotosByDay('2027-06-02')).length, 3);
  await app.deletePhotoRecord(photoIds[0]);
  assert.equal((await app.loadPhotosByDay('2027-06-02')).length, 2);
  assert.deepEqual(
    live.tools.map((tool) => tool.name),
    ['read_trip_days', 'open_trip_day'],
  );
  assert.throws(() => live.tools[1].execute({ date: '1900-01-01' }));
  assert.equal(live.errors.length, 0);
});

test('built standalone exports photos and notes locally without fetching CSS', async (t) => {
  // Exercise the delivered artifact and export button, not just archive rendering.
  await import('../scripts/build.mjs');
  const html = await readFile('dist/Trip-Editable.html', 'utf8');
  const blobs = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(html, {
    url: 'https://local-file-test.example/',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.indexedDB = new IDBFactory();
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.fetch = () => {
        throw new Error('Standalone export must not fetch files.');
      };
      window.URL.createObjectURL = (blob) => {
        blobs.push(blob);
        return 'blob:local-archive';
      };
      window.URL.revokeObjectURL = () => {};
    },
  });
  t.after(() => dom.window.close());
  await tick();
  const window = dom.window;
  const document = window.document;
  assert.equal(document.getElementById('appStyles').tagName, 'STYLE');
  assert.equal(document.querySelectorAll('link[rel="stylesheet"],script[src]').length, 0);
  assert.equal(document.querySelectorAll('.day-card').length, 3);
  document.getElementById('notes-2027-06-01').value = 'Local export works';
  const db = await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(`trip:${config.id}:photos:v1`, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('photos', 'readwrite');
    transaction.objectStore('photos').add({
      dayId: '2027-06-01',
      name: 'local.jpg',
      dataUrl: 'data:image/jpeg;base64,/9j/2Q==',
      caption: 'Local photo',
      createdAt: '2027-06-01T00:00:00Z',
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  document.getElementById('exportHtmlBtn').click();
  for (let attempt = 0; attempt < 20 && !blobs.length; attempt++) await tick();
  assert.equal(blobs.length, 1, document.getElementById('appStatus').textContent);
  assert.match(document.getElementById('openExportLink').download, /-archive\.html$/);
  const exported = await new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blobs[0]);
  });
  const archive = new JSDOM(exported);
  t.after(() => archive.window.close());
  assert.equal(
    archive.window.document.querySelector('.archive-note').textContent,
    'Local export works',
  );
  assert.equal(
    archive.window.document.querySelector('.archive-photo img').getAttribute('src'),
    'data:image/jpeg;base64,/9j/2Q==',
  );
  assert.equal(archive.window.document.querySelectorAll('details[open]').length, 0);
  assert.equal(
    archive.window.document.querySelectorAll('link[rel="stylesheet"],script[src]').length,
    0,
  );
  assert.equal(errors.length, 0, errors.map((error) => error.message).join('\n'));
});

test('trip date range and destination time zone are editable, validated and archived', async (t) => {
  const database = new IDBFactory();
  const live = openDashboard(database, {
    [`trip:${config.id}:info:v1`]: JSON.stringify({
      title: 'Previously edited',
      subtitle: 'Saved subtitle',
    }),
  });
  t.after(() => live.window.close());
  await tick();
  const { document } = live.window;
  const app = live.window.TripTest;
  assert.equal(document.title, 'Previously edited');
  assert.equal(app.tripInfo.startDate, '2027-06-01');
  document.getElementById('notes-2027-06-02').value = 'Keep my unsaved note';
  document.getElementById('editTripBtn').click();
  document.getElementById('editTripStartDate').value = '2027-06-01';
  document.getElementById('editTripEndDate').value = '2027-06-05';
  document.getElementById('editTripTimeZone').value = 'America/New_York';
  const submit = () =>
    document
      .getElementById('tripEditor')
      .dispatchEvent(new live.window.Event('submit', { cancelable: true }));
  submit();
  assert.equal(app.tripInfo.timeZone, 'America/New_York');
  assert.match(document.querySelector('.summary-grid').textContent, /5 days/);
  assert.match(document.querySelector('.summary-grid').textContent, /America\/New_York/);
  assert.equal(document.getElementById('notes-2027-06-02').value, 'Keep my unsaved note');
  assert.equal(app.tripDays[0].date, '2027-06-01');
  document.getElementById('editTripBtn').click();
  document.getElementById('editTripEndDate').value = '2027-05-31';
  submit();
  assert.match(document.getElementById('tripEditorStatus').textContent, /End date/);
  assert.equal(app.tripInfo.endDate, '2027-06-05');
  document.getElementById('editTripEndDate').value = '2027-06-05';
  document.getElementById('editTripTimeZone').value = 'Invalid/Place';
  submit();
  assert.match(
    document.getElementById('tripEditorStatus').textContent,
    /valid destination time zone/,
  );
  assert.equal(app.tripInfo.timeZone, 'America/New_York');
  document.getElementById('cancelTripBtn').click();
  assert.throws(() => validateTripInfo({ ...app.tripInfo, startDate: '2027-02-30' }));
  const saved = Object.fromEntries(
    Object.keys(live.window.localStorage).map((key) => [
      key,
      live.window.localStorage.getItem(key),
    ]),
  );
  const reload = openDashboard(database, saved);
  t.after(() => reload.window.close());
  await tick();
  assert.equal(reload.window.TripTest.tripInfo.endDate, '2027-06-05');
  assert.equal(reload.window.TripTest.tripInfo.timeZone, 'America/New_York');
  const payload = await app.buildArchivePayload();
  assert.equal(payload.tripInfo.timeZone, 'America/New_York');
  const archive = new JSDOM(app.buildArchiveHtml(payload, css));
  t.after(() => archive.window.close());
  assert.match(archive.window.document.querySelector('.archive-info-body').textContent, /5 days/);
  assert.match(
    archive.window.document.querySelector('.archive-info-body').textContent,
    /America\/New_York/,
  );
  assert.equal(archive.window.document.querySelector('#tripEditor'), null);
  const favicon = decodeURIComponent(document.querySelector('link[rel="icon"]').href);
  assert.match(favicon, /ellipse/);
  assert.equal(live.errors.length, 0);
});

test('updated day sections preserve older entries through editing, reload and export', async (t) => {
  const oldDays = config.days.map((day) => ({ ...day }));
  oldDays[0] = {
    ...oldDays[0],
    accommodation: ['Sample hotel'],
    parking: ['Garage closes at 9pm'],
    food: ['Lunch reservation'],
    gettingThere: [{ text: 'Directions', url: 'https://example.com/map' }],
    attractionLinks: [{ text: 'Tickets', url: 'https://example.com/tickets' }],
  };
  const migrated = validateDays(oldDays);
  assert.deepEqual(migrated[0].notes, ['Parking: Garage closes at 9pm', 'Food: Lunch reservation']);
  assert.deepEqual(validateDays(migrated), migrated);
  const database = new IDBFactory();
  const live = openDashboard(database, { [`trip:${config.id}:days:v1`]: JSON.stringify(oldDays) });
  t.after(() => live.window.close());
  await tick();
  const app = live.window.TripTest;
  const document = live.window.document;
  const headings = () =>
    [...document.querySelectorAll('#day-2027-06-01 .grid h3')].map((el) => el.textContent);
  assert.deepEqual(headings(), [
    'Strict Times',
    'Itinerary',
    'Transport',
    'Accommodation',
    'Bookings / Notes',
    'Links',
  ]);
  assert.match(
    document.getElementById('day-2027-06-01').textContent,
    /Parking: Garage closes at 9pm/,
  );
  app.openDayEditor('2027-06-01');
  assert.equal(document.getElementById('edit-accommodation-2027-06-01').value, 'Sample hotel');
  assert.match(document.getElementById('edit-links-2027-06-01').value, /Directions.*\nTickets/);
  document.getElementById('edit-accommodation-2027-06-01').value = 'Another hotel\nCheck-in 3pm';
  app.saveDayEditor('2027-06-01');
  await tick();
  assert.deepEqual([...app.tripDays[0].accommodation], ['Another hotel', 'Check-in 3pm']);
  assert.equal(app.tripDays[0].links.length, 2);
  assert.equal('parking' in app.tripDays[0], false);
  const payload = await app.buildArchivePayload();
  const archive = new JSDOM(app.buildArchiveHtml(payload, css));
  t.after(() => archive.window.close());
  assert.deepEqual(
    [...archive.window.document.querySelectorAll('#day-2027-06-01 .grid h3')].map(
      (el) => el.textContent,
    ),
    headings(),
  );
  assert.match(
    archive.window.document.getElementById('day-2027-06-01').textContent,
    /Another hotel/,
  );
  const saved = Object.fromEntries(
    Object.keys(live.window.localStorage).map((key) => [
      key,
      live.window.localStorage.getItem(key),
    ]),
  );
  const reload = openDashboard(database, saved);
  t.after(() => reload.window.close());
  await tick();
  assert.deepEqual(
    [...reload.window.TripTest.tripDays[0].accommodation],
    ['Another hotel', 'Check-in 3pm'],
  );
  assert.equal(reload.window.TripTest.tripDays[0].links.length, 2);
  assert.equal(live.errors.length, 0);
});

test('travel information can be edited, cancelled, reloaded and exported', async (t) => {
  const database = new IDBFactory();
  const live = openDashboard(database);
  t.after(() => live.window.close());
  await tick();
  const document = live.window.document;
  const app = live.window.TripTest;
  assert.equal(document.getElementById('todayHeading'), null);
  assert.equal(
    document.querySelector('.hero').nextElementSibling.getAttribute('aria-labelledby'),
    'flightHeading',
  );
  document.getElementById('notes-2027-06-01').value = 'Unsaved day memory';
  const title = 'Flights <img src=x onerror=alert(1)>';
  const details = 'Depart 9am\nTransfer at airport <script>alert(1)</script>';
  document.getElementById('editTravelBtn').click();
  assert.equal(document.getElementById('travelEditor').classList.contains('hidden'), false);
  document.getElementById('travel-title-0').value = ' ';
  const submit = () =>
    document
      .getElementById('travelEditor')
      .dispatchEvent(new live.window.Event('submit', { cancelable: true }));
  submit();
  assert.match(document.getElementById('travelEditorStatus').textContent, /needs a title/);
  assert.equal(app.tripTravel[0].title, config.travel[0].title);
  document.getElementById('travel-title-0').value = title;
  document.getElementById('travel-details-0').value = details;
  document.getElementById('travel-details-1').value = 'Sample hotel\nCheck-in 3pm';
  submit();
  assert.equal(document.querySelector('#travelInfo h3').textContent, title);
  assert.equal(document.querySelectorAll('#travelInfo img,#travelInfo script').length, 0);
  assert.equal(document.getElementById('notes-2027-06-01').value, 'Unsaved day memory');
  assert.equal(document.getElementById('travelEditor').classList.contains('hidden'), true);
  assert.equal(document.activeElement.id, 'editTravelBtn');
  document.getElementById('editTravelBtn').click();
  document.getElementById('travel-title-0').value = 'Discard this';
  document.getElementById('cancelTravelBtn').click();
  assert.equal(app.tripTravel[0].title, title);
  const saved = Object.fromEntries(
    Object.keys(live.window.localStorage).map((key) => [
      key,
      live.window.localStorage.getItem(key),
    ]),
  );
  const reload = openDashboard(database, saved);
  t.after(() => reload.window.close());
  await tick();
  assert.equal(reload.window.TripTest.tripTravel[0].title, title);
  assert.equal(reload.window.TripTest.tripTravel[1].details[0], 'Sample hotel');
  const payload = await app.buildArchivePayload();
  assert.equal(payload.travel[0].title, title);
  const archive = new JSDOM(app.buildArchiveHtml(payload, css));
  t.after(() => archive.window.close());
  const exported = archive.window.document;
  assert.equal(exported.querySelector('#travelInfo h3').textContent, title);
  assert.match(exported.getElementById('travelInfo').textContent, /Sample hotel/);
  assert.equal(exported.querySelector('#travelEditor,#editTravelBtn,#todayHeading'), null);
  assert.equal(exported.getElementById('travelInfo').closest('.hidden'), null);
  assert.equal(exported.querySelectorAll('#travelInfo img,#travelInfo script').length, 0);
  assert.equal(live.errors.length, 0);
});

test('overview panels and all days start collapsed and preserve edits while toggling', async (t) => {
  const live = openDashboard(new IDBFactory());
  t.after(() => live.window.close());
  await tick();
  const document = live.window.document;
  assert.equal(document.querySelectorAll('.day-card.open').length, 0);
  for (const name of ['trip', 'travel']) {
    const button = document.getElementById(`${name}OverviewToggle`);
    const body = document.getElementById(`${name}OverviewBody`);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(body.classList.contains('hidden'), true);
    button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(body.classList.contains('hidden'), false);
    button.click();
    assert.equal(body.classList.contains('hidden'), true);
  }
  document.getElementById('editTripBtn').click();
  assert.equal(document.getElementById('tripOverviewBody').classList.contains('hidden'), false);
  document.getElementById('editTripTitle').value = 'Draft trip title';
  document.getElementById('tripOverviewToggle').click();
  document.getElementById('tripOverviewToggle').click();
  assert.equal(document.getElementById('editTripTitle').value, 'Draft trip title');
  document.getElementById('editTravelBtn').click();
  assert.equal(document.getElementById('travelOverviewBody').classList.contains('hidden'), false);
  document.getElementById('travel-details-0').value = 'Draft travel details';
  document.getElementById('travelOverviewToggle').click();
  document.getElementById('travelOverviewToggle').click();
  assert.equal(document.getElementById('travel-details-0').value, 'Draft travel details');
  document.querySelector('.day-header').click();
  assert.equal(document.querySelector('.day-header').getAttribute('aria-expanded'), 'true');
  document.querySelector('.day-header').click();
  assert.equal(document.querySelectorAll('.day-card.open').length, 0);
  assert.equal(live.errors.length, 0);
});

test('day header album handles empty albums, upload, captions and deleting the last photo', async (t) => {
  const live = openDashboard(new IDBFactory());
  t.after(() => live.window.close());
  await tick();
  const window = live.window;
  const document = window.document;
  const app = window.TripTest;
  assert.equal(document.querySelector('.photo-tools'), null);
  const dayId = '2027-06-01';
  const button = document.querySelector(`#day-${dayId} .day-album-btn`);
  button.focus();
  button.click();
  await tick();
  assert.equal(document.getElementById('photoModal').classList.contains('open'), true);
  assert.equal(document.getElementById('photoModalCounter').textContent, '0 photos');
  assert.equal(document.getElementById('photoModalEmpty').classList.contains('hidden'), false);
  assert.equal(document.getElementById('photoModalSaveBtn').disabled, true);
  assert.equal(document.getElementById('photoModalDeleteBtn').disabled, true);
  assert.equal(document.getElementById(`day-${dayId}`).classList.contains('open'), false);
  // Stub image decoding and canvas, retaining real file input, FileReader and IndexedDB.
  window.Image = class {
    width = 12;
    height = 8;
    set src(value) {
      window.setTimeout(() => this.onload(), 0);
    }
  };
  window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  window.HTMLCanvasElement.prototype.toBlob = function (callback) {
    callback(new window.Blob(['jpeg'], { type: 'image/jpeg' }));
  };
  const input = document.getElementById('photoModalUploadInput');
  let pickerOpened = false;
  input.click = () => {
    pickerOpened = true;
  };
  document.getElementById('photoModalUploadBtn').click();
  assert.equal(pickerOpened, true);
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new window.File(['image'], 'memory.jpg', { type: 'image/jpeg' })],
  });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  for (
    let attempt = 0;
    attempt < 20 && document.getElementById('photoModalUploadBtn').disabled;
    attempt++
  )
    await tick();
  const photos = await app.loadPhotosByDay(dayId);
  assert.equal(photos.length, 1);
  assert.equal(photos[0].name, 'memory.jpg');
  assert.equal(document.getElementById('photoModalCounter').textContent, '1 / 1');
  assert.match(document.getElementById('photoStatus').textContent, /Photos saved/);
  assert.equal(document.getElementById('photoModalSaveBtn').disabled, false);
  assert.equal(document.getElementById('photoModalEmpty').classList.contains('hidden'), true);
  assert.ok(document.querySelector(`#day-${dayId} .day-cover img`));
  document.getElementById('photoModalCaptionInput').value = 'Our first memory';
  await app.saveActivePhotoCaption();
  assert.equal((await app.loadPhotosByDay(dayId))[0].caption, 'Our first memory');
  const payload = await app.buildArchivePayload();
  assert.equal(payload.photos[0].caption, 'Our first memory');
  await app.deleteActivePhoto();
  assert.equal((await app.loadPhotosByDay(dayId)).length, 0);
  assert.equal(document.getElementById('photoModalCounter').textContent, '0 photos');
  assert.equal(document.getElementById('photoModal').classList.contains('open'), true);
  assert.equal(document.querySelector(`#day-${dayId} .day-cover img`), null);
  assert.equal(button.disabled, false);
  app.closePhotoModal();
  assert.equal(document.activeElement, button);
  assert.equal(live.errors.length, 0);
});

test('chosen day thumbnails survive browsing, new uploads, reload and archive export', async (t) => {
  const database = new IDBFactory();
  const live = openDashboard(database);
  t.after(() => live.window.close());
  await tick();
  const { document } = live.window;
  const app = live.window.TripTest;
  const dayId = '2027-06-01';
  const coverSrc = () =>
    document.querySelector(`#day-${dayId} .day-cover img`)?.getAttribute('src');
  const thumbnailButton = document.getElementById('photoModalThumbnailBtn');
  assert.equal(document.querySelectorAll('#photoModal button').length, 7);
  assert.equal(document.getElementById('photoModalClose').textContent.trim(), 'Close Album');
  assert.equal(document.getElementById('photoModalCloseBtn2'), null);
  document.querySelector(`#day-${dayId} .day-album-btn`).click();
  await tick();
  assert.equal(thumbnailButton.disabled, true);
  app.closePhotoModal();
  const records = [];
  for (let index = 0; index < 2; index++) {
    records.push(
      await app.addPhotoRecord({
        dayId,
        name: `photo-${index}.png`,
        dataUrl: `data:image/png;base64,${index ? 'Yg==' : 'YQ=='}`,
        createdAt: `2027-06-01T0${index}:00:00Z`,
      }),
    );
  }
  await app.refreshDayPhotos(dayId);
  // An existing automatic cover is pinned on upgrade, before new uploads arrive.
  assert.equal(app.loadDayCoverId(dayId), records[1]);
  const previousCover = coverSrc();
  await app.openDayAlbum(dayId);
  app.showNextPhoto();
  assert.equal(thumbnailButton.disabled, false);
  assert.equal(coverSrc(), previousCover);
  document.getElementById('photoModalCaptionInput').value = 'Keep my caption draft';
  thumbnailButton.click();
  for (let attempt = 0; attempt < 20 && app.loadDayCoverId(dayId) !== records[0]; attempt++)
    await tick();
  await tick();
  assert.equal(app.loadDayCoverId(dayId), records[0]);
  assert.equal(coverSrc(), 'data:image/png;base64,YQ==');
  assert.equal(thumbnailButton.getAttribute('aria-pressed'), 'true');
  assert.equal(document.getElementById('photoModalCaptionInput').value, 'Keep my caption draft');
  document.getElementById('photoModalSaveBtn').click();
  await tick();
  assert.equal(
    (await app.loadPhotosByDay(dayId)).find((photo) => photo.id === records[0]).caption,
    'Keep my caption draft',
  );
  // Use real compression/storage with a deterministic image decoder.
  live.window.Image = class {
    width = 12;
    height = 8;
    set src(value) {
      live.window.setTimeout(() => this.onload(), 0);
    }
  };
  live.window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  live.window.HTMLCanvasElement.prototype.toBlob = (callback) =>
    callback(new live.window.Blob(['new jpeg'], { type: 'image/jpeg' }));
  await app.saveFilesForDay(dayId, [
    new live.window.File(['image'], 'new-photo.jpg', { type: 'image/jpeg' }),
  ]);
  assert.equal(coverSrc(), 'data:image/png;base64,YQ==');
  assert.equal(thumbnailButton.getAttribute('aria-pressed'), 'false');
  assert.equal(app.loadDayCoverId(dayId), records[0]);
  const saved = Object.fromEntries(
    Object.keys(live.window.localStorage).map((key) => [
      key,
      live.window.localStorage.getItem(key),
    ]),
  );
  const reload = openDashboard(database, saved);
  t.after(() => reload.window.close());
  await tick();
  assert.equal(
    reload.window.document.querySelector(`#day-${dayId} .day-cover img`).getAttribute('src'),
    coverSrc(),
  );
  const payload = await app.buildArchivePayload();
  assert.equal(payload.dayCovers[dayId], records[0]);
  const archive = new JSDOM(app.buildArchiveHtml(payload, css), {
    runScripts: 'dangerously',
    beforeParse(window) {
      window.scrollTo = () => {};
    },
  });
  t.after(() => archive.window.close());
  assert.equal(
    archive.window.document.querySelector(`#day-${dayId} .day-cover img`).getAttribute('src'),
    coverSrc(),
  );
  assert.equal(archive.window.document.getElementById('photoModalThumbnailBtn'), null);
  assert.equal(
    archive.window.document.querySelectorAll('#archivePhotoModal [data-action="close"]').length,
    1,
  );
  // Deleting an unrelated photo keeps the selection; deleting the cover repairs it.
  await app.deletePhotoRecord(records[1]);
  await app.refreshDayPhotos(dayId);
  assert.equal(app.loadDayCoverId(dayId), records[0]);
  await app.openDayAlbum(dayId);
  while (
    document.getElementById('photoModalImage').getAttribute('src') !== 'data:image/png;base64,YQ=='
  )
    app.showNextPhoto();
  await app.deleteActivePhoto();
  assert.notEqual(app.loadDayCoverId(dayId), records[0]);
  assert.ok(coverSrc());
  await app.deleteActivePhoto();
  assert.equal(app.loadDayCoverId(dayId), null);
  assert.equal(coverSrc(), undefined);
  assert.equal(live.errors.length, 0);
});
