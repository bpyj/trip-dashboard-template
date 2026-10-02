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
  .replace(
    '<link id="appStyles" rel="stylesheet" href="style.css">',
    () => `<style id="appStyles">${css}</style>`,
  )
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
  app.openPhotoModal(photos, 0, '2027-06-02');
  app.showNextPhoto();
  assert.equal(document.getElementById('photoModalCounter').textContent, '2 / 3');
  app.closePhotoModal();

  const payload = await app.buildArchivePayload();
  const html = app.buildArchiveHtml(payload, css);
  // No scripts or network are needed for day details and album navigation.
  const preview = new JSDOM(html, { url: 'file:///trip-archive.html' });
  t.after(() => preview.window.close());
  const archive = preview.window.document;
  assert.equal(archive.querySelector('.hero').nextElementSibling.id, 'daysContainer');
  assert.equal(archive.querySelectorAll('details[open]').length, 0);
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

  const saved = Object.fromEntries(
    Object.keys(window.localStorage).map((key) => [key, window.localStorage.getItem(key)]),
  );
  const reload = openDashboard(database, saved);
  t.after(() => reload.dom.window.close());
  await tick();
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
