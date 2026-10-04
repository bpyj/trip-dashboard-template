import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { IDBFactory } from 'fake-indexeddb';
import { JSDOM, VirtualConsole } from 'jsdom';

const template = await readFile('index.html', 'utf8');
const css = await readFile('style.css', 'utf8');
const bundle = await build({
  stdin: {
    contents: "import './src/app.js'; export * from './src/archive.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'iife',
  globalName: 'CloudUiTest',
  write: false,
});
const embedded = template
  .replace(/<link\b(?=[^>]*\bid="appStyles")[^>]*>/, () => `<style id="appStyles">${css}</style>`)
  .replace(
    '<script id="appScript" type="module" src="src/app.js"></script>',
    () => `<script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`,
  );
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

test('cloud Push/Pull controls are accessible, disabled before connection and mobile-safe', () => {
  const dom = new JSDOM(template);
  const { document } = dom.window;
  const panel = document.getElementById('cloudSyncPanel');
  const pull = document.getElementById('pullCloudBtn');
  const push = document.getElementById('pushCloudBtn');
  const status = document.getElementById('cloudSyncStatus');

  assert.ok(panel);
  assert.equal(panel.closest('[data-editable-only]')?.classList.contains('backup-panel'), true);
  assert.equal(status.getAttribute('role'), 'status');
  assert.match(status.textContent, /not connected yet/i);
  assert.equal(pull.disabled, true);
  assert.equal(push.disabled, true);
  assert.equal(pull.getAttribute('aria-describedby'), 'cloudSyncStatus');
  assert.equal(push.getAttribute('aria-describedby'), 'cloudSyncStatus');
  assert.match(pull.textContent, /Pull from Cloud/);
  assert.match(push.textContent, /Push to Cloud/);
  assert.ok(document.getElementById('cloudRevision'));
  assert.ok(document.getElementById('cloudLastPushed'));
  assert.ok(document.getElementById('cloudLastPulled'));

  // The controls reuse the existing responsive action layout and 44px tap target.
  assert.match(css, /\.actions\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(css, /\.btn\s*\{[^}]*min-height:\s*44px;/s);
  dom.window.close();
});

test('real read-only archive output removes all cloud sync controls', async (t) => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const live = new JSDOM(embedded, {
    url: 'https://trip.example/',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.indexedDB = new IDBFactory();
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.scrollTo = () => {};
    },
  });
  t.after(() => live.window.close());
  await tick();

  const payload = await live.window.CloudUiTest.buildArchivePayload();
  const html = live.window.CloudUiTest.buildArchiveHtml(payload, css);
  const archive = new JSDOM(html);
  t.after(() => archive.window.close());
  const { document } = archive.window;

  assert.equal(document.getElementById('cloudSyncPanel'), null);
  assert.equal(document.getElementById('pullCloudBtn'), null);
  assert.equal(document.getElementById('pushCloudBtn'), null);
  assert.equal(document.getElementById('cloudSyncStatus'), null);
  assert.equal(document.querySelectorAll('[data-editable-only]').length, 0);
  assert.equal(errors.length, 0, errors.map((error) => error.message).join('\n'));
});
