import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
const result = await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'iife',
  target: ['safari15', 'chrome100'],
  write: false,
});
const script = result.outputFiles[0].text;
const html = await readFile('index.html', 'utf8');
const css = await readFile('style.css', 'utf8');
const hosted = html.replace('type="module" src="src/app.js"', 'defer src="app.js"');
await writeFile('dist/index.html', hosted);
await writeFile('dist/app.js', script);
await copyFile('style.css', 'dist/style.css');
// One editable file for use outside a hosted site, including in a mobile editor.
const standalone = hosted
  .replace(
    '<link id="appStyles" rel="stylesheet" href="style.css">',
    () => `<style id="appStyles">${css}</style>`,
  )
  .replace(
    '<script id="appScript" defer src="app.js"></script>',
    () => `<script id="appScript">${script.replace(/<\/script/gi, '<\\/script')}</script>`,
  );
await writeFile('dist/Trip-Editable.html', standalone);
console.log('Built dist/index.html and dist/Trip-Editable.html');
