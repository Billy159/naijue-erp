import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url)), temporary = await mkdtemp(path.join(here, '.dictionary-build-'));
try {
  const result = await build({ entryPoints: [path.join(here, '../size-groups-page.tsx'), path.join(here, '../../seasons/seasons-page.tsx'), path.join(here, '../../../barcode-schemes/barcode-schemes-page.tsx')], outdir: temporary, bundle: true, splitting: true, format: 'esm', platform: 'browser', metafile: true, jsx: 'automatic', logLevel: 'warning' });
  for (const input of Object.keys(result.metafile.inputs)) assert.doesNotMatch(input, /frozen-demo|synthetic|\/tests\/|native-.+-import|apps\/api|adapters\/postgres|pg\//, 'Production page graph has no fixtures, importers, or server/database adapters');
  for (const output of Object.keys(result.metafile.outputs)) if (output.endsWith('.css')) {
    const css = await readFile(output, 'utf8'); assert.doesNotMatch(css, /@import\s+url|https?:\/\//, 'No external style/font/network source');
  }
  const group = await readFile(path.join(here, '../setting-page.tsx'), 'utf8'), schemes = await readFile(path.join(here, '../../../barcode-schemes/barcode-schemes-page.tsx'), 'utf8');
  assert.doesNotMatch(group + schemes, /window\.PRODUCT|window\.ERP|REAL_DATA_MODE|dangerouslySetInnerHTML|localStorage|sessionStorage/);
  assert.match(group, /包含尺码/); assert.match(schemes, /适用范围/); assert.match(schemes, /未提供/);
  console.log('PASS three independent browser page bundles + scoped CSS; no frozen fixtures/global runtime/importers/backend graph or external style sources.');
  console.log('NOT RUN: live native API/database acceptance and Mac browser visual comparison; no route or API registration is added.');
} finally { await rm(temporary, { recursive: true, force: true }); }
