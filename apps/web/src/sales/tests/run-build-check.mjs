import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.build-tmp-'));
try {
  const result = await build({ entryPoints: { 'sales-route': path.join(here, '../sales-route.tsx'), index: path.join(here, '../index.ts'), 'sales-detail': path.join(here, '../detail.css') }, outdir: temporary,
    bundle: true, splitting: true, platform: 'browser', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], chunkNames: 'chunks/[name]-[hash]', metafile: true, logLevel: 'warning' });
  const route = await readFile(path.join(temporary, 'sales-route.js'), 'utf8');
  const index = await readFile(path.join(temporary, 'index.js'), 'utf8');
  assert.match(route, /import\("\.\/chunks\/detail-content-/);
  assert.doesNotMatch(index, /detail-content|\.css|TEST-SALES|synthetic\.test/);
  const productionInputs = Object.keys(result.metafile.inputs);
  assert.equal(productionInputs.some(input => input.includes('/tests/') || input.endsWith('.test.ts')), false);
  assert.ok(Object.keys(result.metafile.outputs).some(output => output.endsWith('sales-route.css')));
  const routeCss = await readFile(path.join(temporary, 'sales-route.css'), 'utf8');
  const detailCss = await readFile(path.join(temporary, 'sales-detail.css'), 'utf8');
  assert.doesNotMatch(routeCss, /sales-detail-facts|sale-doc-fields|sale-lines-table|sale-summary/);
  assert.match(detailCss, /sales-detail-facts/); assert.match(detailCss, /grid-template-columns: 160px repeat\(5, minmax\(0, 1fr\)\)/);
  const detailStyleOutput = Object.values(result.metafile.outputs).find(output => output.entryPoint?.endsWith('/detail.css'));
  assert.ok(detailStyleOutput); assert.deepEqual(Object.keys(detailStyleOutput.inputs).map(input => path.basename(input)), ['detail.css']);
  console.log('PASS split browser build: route and detail are separate chunks; inert index has no UI/CSS/fixture imports; production graph excludes tests and contains separate route/shared and action-only sales-detail CSS outputs; route CSS has no saved-detail body rules.');
  console.log('Not a deployed host, actual browser layout, network waterfall or Demo pixel comparison. Temporary outputs removed.');
} finally { await rm(temporary, { recursive: true, force: true }); }
