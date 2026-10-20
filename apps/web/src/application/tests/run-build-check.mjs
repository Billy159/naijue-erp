import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplication } from '../build-application.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const workingDirectory = path.resolve(here, '..');
const temporary = await mkdtemp(path.join(here, '.build-check-'));
try {
  const outdir = path.join(temporary, 'output');
  // Export the source factory only. No fixture/config injection, HTML, listener or network.
  const { metafile, manifest } = await buildApplication({ entryPoint: path.resolve(here, '../index.tsx'), outdir });
  const outputs = metafile.outputs;
  const byAbsolute = new Map(Object.keys(outputs).map(name => [path.resolve(workingDirectory, name), name]));
  const entryFor = relative => Object.keys(outputs).find(name => outputs[name].entryPoint
    && path.resolve(workingDirectory, outputs[name].entryPoint) === path.resolve(workingDirectory, relative));
  const closure = start => {
    assert.ok(start, 'Expected emitted entry');
    const visited = new Set();
    const walk = name => {
      if (visited.has(name)) return;
      visited.add(name);
      for (const item of outputs[name].imports) {
        if (item.external || item.kind === 'dynamic-import') continue;
        const next = byAbsolute.get(path.resolve(workingDirectory, item.path))
          ?? byAbsolute.get(path.resolve(workingDirectory, path.dirname(name), item.path));
        assert.ok(next, `Missing emitted dependency ${item.path}`); walk(next);
      }
    };
    walk(start); return visited;
  };
  const inputsOf = names => new Set([...names].flatMap(name => Object.keys(outputs[name].inputs)));
  const startup = closure(entryFor('index.tsx'));
  const inventoryRoute = closure(entryFor('routes/inventory.tsx'));
  const salesRoute = closure(entryFor('routes/sales.tsx'));
  const partiesRoute = closure(entryFor('routes/parties.tsx'));
  const startupInputs = inputsOf(startup);
  for (const file of startupInputs) assert.doesNotMatch(file, /\/(?:inventory|sales|parties)\/|synthetic|preview\//);
  for (const [name, route] of [['startup', startup], ['inventory', inventoryRoute], ['sales', salesRoute]]) {
    for (const file of inputsOf(route)) assert.doesNotMatch(file, /@arco-design\//, `${name} must not eagerly import Arco JavaScript/CSS`);
  }
  assert.ok([...inputsOf(partiesRoute)].some(file => /@arco-design\/web-react\//.test(file)), 'Explicit parties activation must reach the actual installed Arco implementation');
  for (const file of inputsOf(salesRoute)) assert.doesNotMatch(file, /\/inventory\/inventory\.css$/, 'Sales source route must not import the inventory stylesheet');

  const styles = Object.fromEntries(await Promise.all(Object.entries(manifest.styles).map(async ([name, file]) => [name, await readFile(path.join(outdir, file), 'utf8')])));
  assert.match(styles.application, /auth-panel/);
  assert.doesNotMatch(styles.application, /iw-workbench|sales-workbench|party-workbench|pd-tabs|\.mx-|\.arco-/);
  assert.match(styles.inventory, /iw-workbench/); assert.match(styles.inventory, /\.mx-table/);
  assert.doesNotMatch(styles.inventory, /sales-workbench|party-workbench|pd-tabs|\.arco-/);
  assert.match(styles.sales, /sales-workbench/); assert.doesNotMatch(styles.sales, /party-workbench|\.arco-/);
  assert.match(styles.parties, /party-workbench/); assert.match(styles.parties, /\.arco-btn/);
  assert.doesNotMatch(styles.parties, /sales-workbench/);
  for (const name of ['sales', 'parties']) {
    assert.doesNotMatch(styles[name], /\.mx-|--mx-|\.iw-settings(?:[\s{.:[>#-])|\.iw-scope-dialog|\.iw-product-drawer|\.pd-/,
      `${name} output must not contain inventory matrix/settings/scope-dialog/product-drawer selectors`);
    for (const shared of ['iw-button', 'iw-control', 'iw-popover', 'iw-pagination']) assert.ok(styles[name].includes(`.${shared}`), `${name} retains shared ${shared}`);
    assert.ok(styles[name].includes('.demo-ui'), `${name} retains scoped shared semantic tokens`);
    const stylesheet = byAbsolute.get(path.join(outdir, manifest.styles[name])); assert.ok(stylesheet);
    for (const input of Object.keys(outputs[stylesheet].inputs)) assert.doesNotMatch(input, /\/inventory\//, `${name} CSS graph must exclude inventory source assets`);
  }
  const dynamicEntryImports = [...startup].flatMap(name => outputs[name].imports.filter(item => item.kind === 'dynamic-import'));
  assert.ok(dynamicEntryImports.length >= 3);
  const description = {
    startupInputs: [...startupInputs].sort(), startupCode: [...startup].map(name => path.basename(name)),
    routeInputCounts: { inventory: inputsOf(inventoryRoute).size, sales: inputsOf(salesRoute).size, parties: inputsOf(partiesRoute).size },
    stylesheetBytes: Object.fromEntries(Object.entries(styles).map(([name, css]) => [name, Buffer.byteLength(css)])),
    guarantees: ['Startup/inventory/sales static closures exclude Arco JS/CSS', 'Parties uses actual installed Arco only after explicit activation',
      'Sales/parties CSS preserves shared controls/tokens but excludes all inventory-specific matrix/settings/drawer assets'],
    boundary: 'Static emitted-import/CSS analysis only. No browser/network waterfall, timing, memory or frozen-Demo visual acceptance.',
  };
  console.log(JSON.stringify(description, null, 2));
  console.log('PASS: actual split output isolates business routes, inventory-specific CSS and party-only Arco JS/CSS while preserving necessary shared controls.');
} finally { await rm(temporary, { recursive: true, force: true }); }
