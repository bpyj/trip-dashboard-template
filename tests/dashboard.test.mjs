import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import config from '../trip.config.js';
import { validateDays, validateTripConfig } from '../src/model.js';

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
    ])[0].gettingThere.length,
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
  assert.equal(document.querySelector('#day-2027-06-02 .day-album-btn').disabled, true);
  assert.equal(document.querySelector('.edit-day-btn').classList.contains('secondary'), false);
  app.updateToday(new window.Date('2027-05-31T14:59:59Z'), false);
  assert.equal(document.getElementById('todayDate').textContent, 'Trip Preview');
  app.updateToday(new window.Date('2027-05-31T15:00:00Z'), false);
  assert.match(document.getElementById('todayDate').textContent, /Day 1/);
  assert.equal(app.getNextTripDate(), '2027-06-04');

  const hostile = 'A day </script><img src=x onerror=alert(1)> $&';
  app.openDayEditor('2027-06-02');
  document.getElementById('edit-title-2027-06-02').value = hostile;
  document.getElementById('notes-2027-06-02').value = 'Lunch and memories';
  document.getElementById('edit-gettingThere-2027-06-02').value =
    'Bad | javascript:alert(1)\nMap | https://example.com/';
  app.saveDayEditor('2027-06-02');
  await tick();
  assert.equal(document.querySelector('#day-2027-06-02 .day-title').textContent, hostile);
  assert.equal(document.querySelectorAll('.day-title img').length, 0);
  assert.equal(app.tripDays[1].gettingThere.length, 1);
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
  await app.renderPhotoSummary('2027-06-02');
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
  assert.equal(archive.querySelector('.hero').nextElementSibling.id, 'daysContainer');
  assert.equal(archive.querySelectorAll('details[open]').length, 0);
  assert.equal(archive.querySelectorAll('[data-editable-only]').length, 0);
  assert.equal(archive.getElementById('tripTitle').textContent, editedTitle);
  assert.equal(archive.querySelectorAll('.day-card').length, 3);
  assert.equal(archive.querySelectorAll('.edit-day-btn,.photo-modal,.backup-panel').length, 0);
  assert.equal(archive.querySelectorAll('script[src],link[rel="stylesheet"]').length, 0);
  assert.equal(
    archive.querySelector('#day-2027-06-02 .archive-note').textContent,
    'Lunch and memories',
  );
  assert.equal(
    archive.querySelector('#day-2027-06-02 .day-cover img').getAttribute('src'),
    photos[0].dataUrl,
  );
  const album = archive.querySelector('.archive-album');
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
  const trigger = sd.querySelector('.archive-album > summary');
  const overlay = sd.getElementById('archivePhotoModal');
  trigger.click();
  assert.equal(overlay.classList.contains('open'), true);
  assert.equal(trigger.parentElement.open, false);
  assert.equal(sd.querySelector('.wrap').inert, true);
  assert.equal(sd.body.style.position, 'fixed');
  assert.equal(sd.body.style.top, '-240px');
  assert.equal(overlay.querySelector('.photo-modal-counter').textContent, '1 / 3');
  assert.equal(
    overlay
      .querySelector('.photo-modal-dialog')
      .firstElementChild.classList.contains('archive-modal-controls'),
    true,
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
  close.focus();
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
