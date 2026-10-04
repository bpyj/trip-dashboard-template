import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const template = await readFile('index.html', 'utf8');
const css = await readFile('style.css', 'utf8');

test('cloud Push/Pull controls are accessible, disabled before connection and mobile-safe', () => {
  const dom = new JSDOM(template);
  const { document } = dom.window;
  const panel = document.getElementById('cloudSyncPanel');
  const pull = document.getElementById('pullCloudBtn');
  const push = document.getElementById('pushCloudBtn');
  const status = document.getElementById('cloudSyncStatus');

  assert.ok(panel);
  assert.equal(panel.closest('[data-editable-only]')?.id, '');
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

test('cloud controls are removed with editable-only content in read-only output', () => {
  const dom = new JSDOM(template);
  const { document } = dom.window;
  document.querySelectorAll('[data-editable-only]').forEach((element) => element.remove());

  assert.equal(document.getElementById('cloudSyncPanel'), null);
  assert.equal(document.getElementById('pullCloudBtn'), null);
  assert.equal(document.getElementById('pushCloudBtn'), null);
  assert.equal(document.getElementById('cloudSyncStatus'), null);
  dom.window.close();
});
