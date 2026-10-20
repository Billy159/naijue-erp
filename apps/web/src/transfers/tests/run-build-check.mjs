import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url)); const temp = await mkdtemp(path.join(here, '.build-tmp-'));
try {
  const result = await build({ entryPoints: { index: path.join(here, '../index.ts'), 'transfers-route': path.join(here, '../transfers-route.tsx') }, outdir: temp,
    bundle: true, splitting: true, format: 'esm', platform: 'browser', jsx: 'automatic', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], chunkNames: 'chunks/[name]-[hash]', metafile: true, logLevel: 'warning' });
  const outputs = Object.entries(result.metafile.outputs); const index = outputs.find(([, output]) => output.entryPoint?.endsWith('/index.ts')); const route = outputs.find(([, output]) => output.entryPoint?.endsWith('/transfers-route.tsx')); assert.ok(index && route);
  const entryText = await readFile(index[0], 'utf8'); assert.doesNotMatch(entryText, /from "react|\.tsx|\.css|synthetic\.test|TEST-/); assert.equal(index[1].cssBundle, undefined);
  assert.ok(outputs.some(([, output]) => output.entryPoint?.endsWith('/detail-content.tsx'))); assert.match(await readFile(route[0], 'utf8'), /import\("\.\/chunks\/detail-content-/);
  assert.equal(Object.keys(result.metafile.inputs).some(input => input.includes('/transfers/tests/') || input.endsWith('.test.ts')), false);
  const routeCss = await readFile(route[1].cssBundle, 'utf8'); assert.doesNotMatch(routeCss, /Action-only frozen transfer|\.transfer-editor \.mx-section/); assert.match(routeCss, /\.transfer-list-table/);
  const detailCss = await build({ entryPoints: [path.join(here, '../detail.css')], outfile: path.join(temp, 'transfer-detail.css'), bundle: true, metafile: true, logLevel: 'warning' });
  assert.ok(Object.keys(detailCss.metafile.inputs).every(input => input.endsWith('/transfers/detail.css')));
  console.log('PASS static browser bundle: inert index has no React/CSS; transfer route is separate; detail is dynamic; detail CSS is an explicit separate action-only asset; production graph excludes tests.');
  console.log('The transfer source uses only the pinned source-requested Arco DatePicker/TreeSelect/Select APIs. This is not browser timing, deployment, pixel/layout or performance acceptance.');
} finally { await rm(temp, { recursive: true, force: true }); }
