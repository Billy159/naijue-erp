import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplication } from '../apps/web/src/application/build-application.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const application = path.join(repository, 'apps/web/src/application');
const read = relative => readFile(path.join(repository, relative), 'utf8');
const source = (revision, relative) => execFileSync('git', ['show', `${revision}:${relative}`], { cwd: repository, encoding: 'utf8' });
const frameFile = 'apps/web/src/inventory/product-drawer-frame.css';
const inventoryFile = 'apps/web/src/inventory/inventory.css';
const oldInventory = source('b508ce8', inventoryFile), inventory = await read(inventoryFile), frame = await read(frameFile);
const begin = oldInventory.indexOf('/* Lightweight closeable frame stays available during its explicit action import. */');
const end = oldInventory.indexOf('@media(max-width:1200px)', begin);
assert.ok(begin > 0 && end > begin);
assert.equal(frame, oldInventory.slice(begin, end), 'Extracted frame must be byte-for-byte the original committed block');
assert.equal(inventory, oldInventory.slice(0, begin).replace("@import '../demo-presentation/controls.css';\n", "@import '../demo-presentation/controls.css';\n@import './product-drawer-frame.css';\n") + oldInventory.slice(end), 'Inventory changes only the import and removal of the exact frame block');
assert.equal(await read('apps/web/src/demo-presentation/frame.css'), source('b508ce8', 'apps/web/src/demo-presentation/frame.css'), 'Existing frame geometry is unchanged');
const nav = await read('apps/web/src/demo-presentation/demo-frame.tsx');
const oldNav = source('b508ce8', 'apps/web/src/demo-presentation/demo-frame.tsx');
assert.equal(nav, oldNav.replace('/** Names and hierarchy come from frozen frontend/index.html, not a new menu. */', '/** Frozen frontend/index.html hierarchy, with the explicitly approved separate customer/supplier departure. */')
  .replace("'settings/parties'", "'customers' | 'suppliers'")
  .replace("{item('settings/parties', '往来单位')}", "{item('customers', '客户')}{item('suppliers', '供应商')}"), 'Shared frame business departure is exactly the separate customer/supplier entries');
assert.doesNotMatch(nav, /partyEntry|settings\/parties|往来单位/);
const host = await read('apps/web/src/inventory/product-drawer-host.tsx');
assert.match(host, /props\.loadStyles \?\? loadDefaultStyles/);
assert.doesNotMatch(host, /drawer: \{[^\n]*loadStyles/);
console.log(`PASS independent extraction: exact inventory/frame bytes; one shared source SHA256 ${createHash('sha256').update(frame).digest('hex')}; no frame geometry or unrelated menu rewrite.`);

const temporary = await mkdtemp(path.join(repository, 'evidence/.application-core-independent-static-'));
try {
  const outdir = path.join(temporary, 'output');
  const { metafile, manifest } = await buildApplication({ entryPoint: path.join(application, 'index.tsx'), outdir });
  const outputs = metafile.outputs;
  const absoluteOutput = new Map(Object.keys(outputs).map(key => [path.resolve(application, key), key]));
  const entry = relative => Object.keys(outputs).find(key => outputs[key].entryPoint && path.resolve(application, outputs[key].entryPoint) === path.resolve(application, relative));
  function closure(first) {
    assert.ok(first, 'Expected real emitted entry');
    const visited = new Set();
    const visit = key => {
      if (visited.has(key)) return;
      visited.add(key);
      for (const item of outputs[key].imports) {
        if (item.external || item.kind === 'dynamic-import') continue;
        const next = absoluteOutput.get(path.resolve(application, item.path)) ?? absoluteOutput.get(path.resolve(application, path.dirname(key), item.path));
        assert.ok(next, `Expected emitted dependency ${item.path}`); visit(next);
      }
    };
    visit(first); return visited;
  }
  const inputs = relative => new Set([...closure(entry(relative))].flatMap(key => Object.keys(outputs[key].inputs)));
  const startup = inputs('index.tsx'), transfers = inputs('routes/transfers.tsx'), detail = inputs('../transfers/detail-content.tsx');
  for (const file of startup) assert.doesNotMatch(file, /\/(?:inventory|sales|parties|transfers)\/|@arco-design|\/tests\/|preview/);
  for (const file of transfers) assert.doesNotMatch(file, /detail-content\.tsx|product-drawer-host\.tsx|product-drawer\.tsx|product-http-reader\.ts|\/tests\/|preview/);
  assert.ok([...transfers].some(file => file.endsWith('/transfers/http-reader.ts')), 'Transfer list uses the real native HTTP reader');
  assert.ok([...detail].some(file => file.endsWith('/inventory/product-drawer-host.tsx')), 'Product action remains owned by the shared drawer');
  for (const file of detail) assert.doesNotMatch(file, /product-http-reader\.ts|\/tests\/|preview/);
  for (const leaf of ['routes/inventory.tsx', 'routes/sales.tsx']) for (const file of inputs(leaf)) assert.doesNotMatch(file, /@arco-design/);
  const css = Object.fromEntries(await Promise.all(Object.entries(manifest.styles).map(async ([key, file]) => [key, await readFile(path.join(outdir, file), 'utf8')])));
  assert.match(css.application, /\.demo-ui/); assert.match(css.application, /\.auth-session/);
  assert.doesNotMatch(css.application, /\.iw-product-drawer|\.pd-|\.mx-|\.transfer-|\.arco-|party-workbench|sales-workbench/);
  assert.match(css.transfers, /\.transfer-route/); assert.doesNotMatch(css.transfers, /\.transfer-editor|\.mx-|\.iw-product-drawer|\.pd-/);
  assert.match(css['transfer-detail'], /\.transfer-editor/); assert.doesNotMatch(css['transfer-detail'], /\.iw-product-drawer|\.pd-/);
  assert.match(css['transfer-product'], /\.iw-product-drawer/); assert.match(css['transfer-product'], /\.pd-tabs/);
  assert.doesNotMatch(css['transfer-product'], /\.mx-|\.iw-workbench|\.iw-settings|\.transfer-editor/);
  assert.equal((css.inventory.match(/\.iw-product-drawer\{/g) ?? []).length, 1, 'Inventory emits one shared frame block');
  assert.equal((css['transfer-product'].match(/\.iw-product-drawer\{/g) ?? []).length, 1, 'Product action emits one shared frame block');
  for (const name of ['transfers', 'transfer-detail']) {
    const key = absoluteOutput.get(path.join(outdir, manifest.styles[name])); assert.ok(key);
    for (const file of Object.keys(outputs[key].inputs)) assert.doesNotMatch(file, /\/inventory\//);
  }
  const productStyleKey = absoluteOutput.get(path.join(outdir, manifest.styles['transfer-product'])); assert.ok(productStyleKey);
  const productStyleInputs = Object.keys(outputs[productStyleKey].inputs);
  assert.ok(productStyleInputs.some(file => file.endsWith('/inventory/product-drawer-frame.css')));
  assert.ok(productStyleInputs.some(file => file.endsWith('/inventory/product-drawer.css')));
  assert.ok(productStyleInputs.every(file => !file.includes('/inventory/') || /\/inventory\/product-drawer(?:-frame)?\.css$/.test(file)));
  console.log('PASS independent split output: startup excludes business/Arco modules and CSS; transfer list excludes detail/product/fixtures; native reader is real; separate action styles use the one shared product frame/body source, never inventory matrix CSS.');
  console.log(JSON.stringify({ startupInputs: [...startup].sort(), transferInputs: [...transfers].filter(file => !file.includes('node_modules')).sort(), styles: Object.fromEntries(Object.entries(css).map(([name, value]) => [name, Buffer.byteLength(value)])), boundary: 'Actual emitted static-import/CSS graph only. Not a browser/network/timing/visual claim.' }, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
