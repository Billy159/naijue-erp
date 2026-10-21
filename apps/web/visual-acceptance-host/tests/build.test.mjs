import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildAcceptance } from '../build.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../../../..');
const sha = data => createHash('sha256').update(data).digest('hex');
test('independent app emits actual lazy routes/actions and separately owned CSS', async () => {
  const outdir = await mkdtemp(path.join(os.tmpdir(), 'acceptance-build-'));
  try {
    const { metafile, manifest, publicRoot } = await buildAcceptance({ outdir });
    const outputs = metafile.outputs, byAbsolute = new Map(Object.keys(outputs).map(name => [path.resolve(repo, name), name]));
    const entry = suffix => Object.keys(outputs).find(name => outputs[name].entryPoint?.endsWith(suffix));
    const closure = start => {
      assert.ok(start, 'Expected an actual emitted entry'); const found = new Set();
      const walk = name => { if (found.has(name)) return; found.add(name); for (const item of outputs[name].imports) {
        if (item.external || item.kind === 'dynamic-import') continue;
        const target = byAbsolute.get(path.resolve(repo, item.path)) ?? byAbsolute.get(path.resolve(repo, path.dirname(name), item.path));
        assert.ok(target, `Missing import ${item.path}`); walk(target);
      } }; walk(start); return found;
    };
    const inputs = names => [...new Set([...names].flatMap(name => Object.keys(outputs[name].inputs)))];
    const startup = closure(entry('/visual-acceptance-host/entry.tsx'));
    for (const file of inputs(startup)) assert.doesNotMatch(file, /\/(?:inventory|sales|transfers|authentication|transport)\/|fixtures\.ts$|@arco-design\//, `Startup is lightweight: ${file}`);
    for (const file of Object.keys(metafile.inputs)) assert.doesNotMatch(file, /authentication\/|http-(?:reader|client)\.ts$|development-host\/|preview-core-pages\/(?:main|build)\.|\.html$/, `No production bootstrap/network or old artifact: ${file}`);
    for (const route of ['inventory','sales','transfers']) assert.ok(inputs(closure(entry(`/visual-acceptance-host/routes/${route}.tsx`))).some(file => file.includes(`/src/${route}/`)), `Actual ${route} component source is mounted`);
    const inventory = inputs(closure(entry('/visual-acceptance-host/routes/inventory.tsx')));
    assert.ok(inventory.some(file => file.endsWith('/components/candidate-selector.tsx')));
    assert.ok(!inventory.some(file => /product-candidate-action\.tsx$|multi-select-action\.tsx$|single-select-action\.tsx$/.test(file)), 'Inventory route does not eagerly import action modules');
    for (const source of ['/components/product-candidate-action.tsx','/demo-controls/multi-select-action.tsx','/demo-controls/single-select-action.tsx','/sales/detail-content.tsx','/transfers/detail-content.tsx','/inventory/product-drawer.tsx']) assert.ok(entry(source), `Separate lazy action: ${source}`);
    const category = inputs(closure(entry('/demo-controls/multi-select-action.tsx')));
    assert.ok(category.some(file => file.endsWith('/demo-controls/category-branch-model.ts')), 'Current canonical category branch behavior remains in the actual action graph');
    const html = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
    assert.match(html, /<title>SYNTHETIC ONLY/); assert.match(html, /type="module" src="\.\/acceptance\.js"/);
    assert.equal((html.match(/<link /g) ?? []).length, 1); assert.match(html, /href="\.\/shell\.css"/);
    assert.doesNotMatch(html, /<style|data-inventory-inline|data-demo-.*-inline|<script(?! type="module")/);
    const readCss = name => readFile(path.join(publicRoot, name), 'utf8');
    assert.doesNotMatch(await readCss('shell.css'), /iw-workbench|sales-workbench|transfer-route|pd-tabs|auth-panel/);
    assert.doesNotMatch(await readCss('inventory.css'), /pd-tabs|sales-workbench|transfer-route/);
    assert.doesNotMatch(await readCss('sales.css'), /sales-detail-facts|transfer-editor|pd-tabs/);
    assert.doesNotMatch(await readCss('transfers.css'), /transfer-editor|pd-tabs/);
    for (const [filename, source, marker] of [
      ['chunks/product-candidate-action.css','/components/product-candidate-action.css','inv-menu-grid'],
      ['chunks/multi-select.css','/demo-controls/multi-select.css','demo-multi-select--category-branches'],
      ['chunks/single-select.css','/demo-controls/single-select.css','arco-select'],
      ['chunks/product-drawer.css','/inventory/product-drawer.css','pd-tabs'],
    ]) {
      const output = byAbsolute.get(path.join(publicRoot, filename)); assert.ok(output);
      assert.ok(Object.keys(outputs[output].inputs).some(file => file.endsWith(source)));
      assert.ok((await readCss(filename)).includes(marker), `${filename} contains source action rules`);
    }
    for (const filename of Object.keys(manifest.assets).filter(file => file.endsWith('.js'))) assert.doesNotMatch(await readFile(path.join(publicRoot, filename), 'utf8'), /REQUEST_TOO_LARGE|injected fetch implementation|credentials:\s*[\"']same-origin|\.fetch\(/, 'HTTP request functions are tree-shaken; only canonical error types may remain');
    for (const [filename, expected] of Object.entries(manifest.assets)) assert.equal(sha(await readFile(path.join(publicRoot, filename))), expected, filename);
    assert.equal(sha(JSON.stringify(manifest.sourceInputs)), manifest.sourceHash); assert.equal(manifest.productionBootstrapUsed, false);
    const appSource = await readFile(path.resolve(here, '../entry.tsx'), 'utf8');
    assert.match(appSource, /topbarActions=.*acceptance-marker/s); assert.doesNotMatch(appSource, /notice=|fetch\(|localStorage|sessionStorage|ApplicationController|AuthenticationPanel/);
    const css = await readFile(path.resolve(here, '../shell.css'), 'utf8'); assert.match(css, /acceptance-diagnostics\{position:fixed/);
  } finally { await rm(outdir, { recursive: true, force: true }); }
});
