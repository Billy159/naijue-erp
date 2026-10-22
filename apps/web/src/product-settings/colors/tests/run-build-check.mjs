import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url)), temporary = await mkdtemp(path.join(here, '.catalogue-build-'));
try {
  const result = await build({ entryPoints: [path.join(here, '../colors-page.tsx'), path.join(here, '../../fits/fits-page.tsx'), path.join(here, '../../../product-categories/product-categories-page.tsx'), path.join(here, '../http-reader.ts')], outdir: temporary, bundle: true, splitting: true, format: 'esm', platform: 'browser', metafile: true, jsx: 'automatic', logLevel: 'warning' });
  for (const input of Object.keys(result.metafile.inputs)) assert.doesNotMatch(input, /frozen-demo|synthetic|\/tests\/|native-.+-import|apps\/api|adapters\/postgres|pg\//, 'Production graph has no fixture arrays/importers/server or database implementation');
  for (const output of Object.keys(result.metafile.outputs)) if (output.endsWith('.css')) {
    const css = await readFile(output, 'utf8'); assert.doesNotMatch(css, /@import\s+url|https?:\/\//, 'No external stylesheet/font/URL');
  }
  const files = ['../entry-page.tsx', '../entry-view.tsx', '../http-reader.ts', '../../../product-categories/product-categories-page.tsx', '../../../product-categories/category-tree.tsx'];
  for (const file of files) {
    const source = await readFile(path.join(here, file), 'utf8');
    assert.doesNotMatch(source, /window\.PRODUCT|window\.ERP|REAL_DATA_MODE|LEGACY_REAL|dangerouslySetInnerHTML|localStorage|sessionStorage|保存成功|已保存|\/current-form\/|\/inventory\/candidates/);
  }
  const categoryCss = await readFile(path.join(here, '../../../product-categories/source-product-categories.css'), 'utf8');
  assert.match(categoryCss, /grid-template-columns:280px minmax\(0,1fr\)/);
  const css = await readFile(path.join(here, '../source-catalogue-settings.css'), 'utf8'); assert.match(css, /height:34px/); assert.match(css, /height:36px/); assert.match(css, /width:min\(480px,94vw\)/);
  console.log('PASS three independent page bundles + HTTP reader; frozen-source geometry present, scoped CSS, no fixture/runtime/importer/backend imports or external stylesheet sources.');
  console.log('NOT RUN: target trusted authorization, route/API registration, native PostgreSQL execution, Mac browser source-by-source visual acceptance.');
} finally { await rm(temporary, { recursive: true, force: true }); }
