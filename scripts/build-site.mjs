import './build.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

// Optional hosted build. Static and standalone builds remain disconnected.
const html = (await readFile('dist/Trip-Editable.html', 'utf8')).replace(
  '<head>',
  '<head><script>window.__TRIP_DASHBOARD_CLOUD__={baseUrl:"/api/trip-sync",photoBaseUrl:"/api/trip-photos"};</script>',
);
await mkdir('dist/server', { recursive: true });
await build({
  stdin: {
    contents: `import {createSiteWorker} from './src/site-worker.js'; export default createSiteWorker(${JSON.stringify(html)});`,
    resolveDir: process.cwd(),
    sourcefile: 'site-worker-entry.js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/server/index.js',
});
