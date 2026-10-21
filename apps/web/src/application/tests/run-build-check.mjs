import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplication } from '../build-application.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const workingDirectory = path.resolve(here, '..');
const temporary = await mkdtemp(path.join(here, '.build-check-'));
// This exact negative-only selector prevents a native-text ring on composite
// Arco inner inputs. It is not an eager Arco dependency or positive Arco style.
const sharedFocusInputExclusion = ':not(:where(.arco-picker input,.arco-tree-select input,.arco-select input,.arco-input-tag input))';
const withoutSharedFocusInputExclusion = css => css.replaceAll(sharedFocusInputExclusion, '');
const assertNoPositiveArcoStyle = css => assert.doesNotMatch(withoutSharedFocusInputExclusion(css), /\.arco-/);
assertNoPositiveArcoStyle(`.demo-ui input${sharedFocusInputExclusion}:focus-visible{box-shadow:var(--ca-focus-ring)}`);
for (const forbidden of ['.arco-picker{color:red}', `${sharedFocusInputExclusion} .arco-btn{color:red}`, sharedFocusInputExclusion.replace('.arco-picker input', '.arco-picker textarea')]) {
  assert.throws(() => assertNoPositiveArcoStyle(forbidden), 'Positive Arco styles and unreviewed exclusion variants remain forbidden');
}
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
  const transfersRoute = closure(entryFor('routes/transfers.tsx'));
  const salesDetail = closure(entryFor('../sales/detail-content.tsx'));
  const transferDetail = closure(entryFor('../transfers/detail-content.tsx'));
  const singleSelect = closure(entryFor('../demo-controls/single-select-action.tsx'));
  assert.ok([...inputsOf(singleSelect)].some(file => file.endsWith('/es/Select/index.js')), 'The shared action reaches the installed Select leaf');
  const selectCopies = Object.entries(outputs).filter(([name, output]) => name.endsWith('.js') && Object.keys(output.inputs).some(file => file.endsWith('/demo-controls/single-select-action.tsx')));
  assert.equal(selectCopies.length, 1, 'All three pagers emit one shared single-select implementation');
  for (const [name, route] of [['inventory', inventoryRoute], ['sales', salesRoute], ['transfers', transfersRoute]]) {
    assert.ok([...inputsOf(route)].some(file => file.endsWith('/demo-controls/page-size-select.tsx')), `${name} statically reaches the shared lightweight shell`);
    for (const file of inputsOf(route)) assert.doesNotMatch(file, /single-select-(?:action|styles)\.(?:tsx?|css)$|inventory-page-size-action/, `${name} defers the page-size action and its styles`);
  }
  for (const file of Object.keys(metafile.inputs)) assert.doesNotMatch(file, /components\/inventory-page-size(?:-action\.tsx|\.css)$/, 'Removed inventory widget/CSS cannot survive in the graph');
  const actionStyles = byAbsolute.get(path.join(outdir, 'chunks/single-select.css')); assert.ok(actionStyles);
  const actionStyleInputs = Object.keys(outputs[actionStyles].inputs);
  assert.equal(actionStyleInputs.filter(file => file.includes('node_modules')).length, 2, 'Shared action CSS includes only Select/Trigger leaves');
  assert.ok(actionStyleInputs.some(file => file.endsWith('/demo-controls/single-select.css')));
  const emittedAction = await readFile(path.resolve(workingDirectory, selectCopies[0][0]), 'utf8');
  assert.match(emittedAction, /single-select\.css/, 'The action resolves the separately emitted CSS beside its chunk');
  const multiSelect = closure(entryFor('../demo-controls/multi-select-action.tsx'));
  assert.ok([...inputsOf(multiSelect)].some(file => file.endsWith('/es/TreeSelect/index.js')), 'Sales and transfer reuse the installed TreeSelect leaf');
  const multiCopies = Object.entries(outputs).filter(([name, output]) => name.endsWith('.js') && Object.keys(output.inputs).some(file => file.endsWith('/demo-controls/multi-select-action.tsx')));
  assert.equal(multiCopies.length, 1, 'Sales and transfer emit one shared multi-select implementation');
  assert.ok([...inputsOf(salesRoute)].some(file => file.endsWith('/demo-controls/multi-select.tsx')), 'Sales statically reaches only the lightweight multi-select shell');
  for (const file of inputsOf(salesRoute)) assert.doesNotMatch(file, /multi-select-(?:action|styles)\.(?:tsx?|css)$/, 'Sales defers multi-select action code and its CSS');
  const multiStyles = byAbsolute.get(path.join(outdir, 'chunks/multi-select.css')); assert.ok(multiStyles, 'Shared multi-select CSS is emitted at the action-owned URL');
  const multiStyleInputs = Object.keys(outputs[multiStyles].inputs);
  assert.ok(multiStyleInputs.some(file => file.endsWith('/demo-controls/multi-select.css')));
  for (const file of multiStyleInputs) assert.doesNotMatch(file, /dist\/css\/arco\.css|\/transfers\/|\/sales\//, 'Shared action CSS contains component leaves, not route/global styles');
  const emittedMultiAction = await readFile(path.resolve(workingDirectory, multiCopies[0][0]), 'utf8');
  assert.match(emittedMultiAction, /multi-select\.css/, 'The shared action resolves its separately emitted CSS beside its chunk');
  const startupInputs = inputsOf(startup);
  for (const file of startupInputs) assert.doesNotMatch(file, /\/(?:inventory|sales|parties|transfers)\/|synthetic|preview\//);
  for (const [name, route] of [['startup', startup], ['inventory', inventoryRoute], ['sales', salesRoute]]) {
    for (const file of inputsOf(route)) assert.doesNotMatch(file, /@arco-design\//, `${name} must not eagerly import Arco JavaScript/CSS`);
  }
  assert.ok([...inputsOf(partiesRoute)].some(file => /@arco-design\/web-react\//.test(file)), 'Explicit parties activation must reach the actual installed Arco implementation');
  assert.ok([...inputsOf(transfersRoute)].some(file => /@arco-design\/web-react\//.test(file)), 'Explicit transfer activation must reach real source controls');
  for (const file of inputsOf(transfersRoute)) assert.doesNotMatch(file, /detail-content\.tsx$|detail\.css$|product-drawer-host\.tsx$|product-http-reader\.ts$|\/tests\//, 'Transfer route excludes detail/product actions and fixtures');
  for (const file of inputsOf(salesRoute)) {
    assert.doesNotMatch(file, /\/inventory\/inventory\.css$/, 'Sales source route must not import the inventory stylesheet');
    assert.doesNotMatch(file, /\/sales\/(?:detail-content\.tsx|detail\.css)$|\/tests\//, 'Sales route excludes detail action content/CSS and fixtures');
  }
  assert.ok([...inputsOf(salesDetail)].some(file => /\/sales\/detail-content\.tsx$/.test(file)), 'Sales detail remains a separately emitted action entry');

  const styles = Object.fromEntries(await Promise.all(Object.entries(manifest.styles).map(async ([name, file]) => [name, await readFile(path.join(outdir, file), 'utf8')])));
  assert.match(styles.application, /auth-panel/); assert.match(styles.application, /demo-ui/); assert.match(styles.application, /\.sidebar/);
  assert.doesNotMatch(withoutSharedFocusInputExclusion(styles.application), /iw-workbench|sales-workbench|party-workbench|transfer-route|transfer-editor|pd-tabs|\.mx-|\.arco-/);
  assert.match(styles.inventory, /iw-workbench/); assert.match(styles.inventory, /\.mx-table/);
  assert.doesNotMatch(withoutSharedFocusInputExclusion(styles.inventory), /sales-workbench|party-workbench|transfer-route|transfer-editor|pd-tabs|\.arco-/);
  assert.match(styles.sales, /sales-workbench/); assert.doesNotMatch(withoutSharedFocusInputExclusion(styles.sales), /party-workbench|\.arco-|sales-detail-(?:facts|page|dialog)|sale-editor|sale-doc-fields|sale-lines-table|sale-summary/);
  assert.match(styles['sales-detail'], /sales-detail-facts/);
  assert.doesNotMatch(styles['sales-detail'], /sales-workbench|party-workbench|transfer-editor|\.arco-|\.iw-product-drawer|\.pd-tabs|\.mx-/);
  const salesRouteStyles = byAbsolute.get(path.join(outdir, manifest.styles.sales)); assert.ok(salesRouteStyles);
  for (const input of Object.keys(outputs[salesRouteStyles].inputs)) assert.doesNotMatch(input, /\/sales\/detail\.css$/, 'Sales route CSS graph excludes the detail action stylesheet');
  const salesDetailStyles = byAbsolute.get(path.join(outdir, manifest.styles['sales-detail'])); assert.ok(salesDetailStyles);
  assert.ok(Object.keys(outputs[salesDetailStyles].inputs).some(input => /\/sales\/detail\.css$/.test(input)), 'Sales detail manifest resolves its explicit action CSS');
  for (const input of Object.keys(outputs[salesDetailStyles].inputs)) assert.doesNotMatch(input, /\/inventory\/|\/sales\/sales\.css$/, 'Sales detail CSS graph excludes inventory and sales-list assets');
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
  assert.match(styles.transfers, /transfer-route/); assert.match(styles.transfers, /\.arco-/);
  assert.match(styles.transfers, /\.demo-multi-select/, 'The manual production transfer route CSS retains moved shared TreeSelect rules');
  const transferStyles = byAbsolute.get(path.join(outdir, manifest.styles.transfers)); assert.ok(transferStyles);
  assert.ok(Object.keys(outputs[transferStyles].inputs).some(file => file.endsWith('/demo-controls/multi-select.css')), 'Transfer direct action usage has its shared CSS without depending on a prior sales activation');
  assert.doesNotMatch(styles.transfers, /transfer-editor|\.mx-|\.iw-product-drawer|\.pd-/);
  assert.match(styles['transfer-detail'], /transfer-editor/); assert.match(styles['transfer-detail'], /\.mx-table/);
  assert.doesNotMatch(styles['transfer-detail'], /\.iw-product-drawer|\.pd-tabs|sales-workbench|party-workbench/);
  assert.match(styles['transfer-product'], /\.iw-product-drawer/); assert.match(styles['transfer-product'], /\.pd-tabs/);
  assert.doesNotMatch(styles['transfer-product'], /\.mx-|\.iw-settings|transfer-editor|sales-workbench|party-workbench/);
  for (const name of ['transfers', 'transfer-detail']) {
    const file = byAbsolute.get(path.join(outdir, manifest.styles[name])); assert.ok(file);
    for (const input of Object.keys(outputs[file].inputs)) assert.doesNotMatch(input, /\/inventory\//, `${name} must not use inventory stylesheet assets`);
  }
  const dynamicEntryImports = [...startup].flatMap(name => outputs[name].imports.filter(item => item.kind === 'dynamic-import'));
  assert.ok(dynamicEntryImports.length >= 4);
  const description = {
    startupInputs: [...startupInputs].sort(), startupCode: [...startup].map(name => path.basename(name)),
    routeInputCounts: { inventory: inputsOf(inventoryRoute).size, sales: inputsOf(salesRoute).size, salesDetail: inputsOf(salesDetail).size, parties: inputsOf(partiesRoute).size, transfers: inputsOf(transfersRoute).size, transferDetail: inputsOf(transferDetail).size },
    stylesheetBytes: Object.fromEntries(Object.entries(styles).map(([name, css]) => [name, Buffer.byteLength(css)])),
    guarantees: ['One shared single-select action and action-only CSS serves all three lightweight pager adapters', 'One shared TreeSelect presentation serves transfer filters and action-lazy sales filters', 'Startup/inventory/sales static closures exclude Arco JS/CSS', 'Parties/transfers use actual installed Arco only after explicit activation',
      'Sales/parties CSS preserves shared controls/tokens but excludes all inventory-specific matrix/settings/drawer assets',
      'Sales route static code/CSS excludes detail content/styles; separate sales-detail CSS is explicit action-only host configuration',
      'Transfer route excludes detail/product code/data/styles; inline-detail and product action assets are separate'],
    boundary: 'Static emitted-import/CSS analysis only. No browser/network waterfall, timing, memory or frozen-Demo visual acceptance.',
  };
  console.log(JSON.stringify(description, null, 2));
  console.log('PASS: actual split output isolates business routes, inventory-specific CSS and explicit-party/transfer-only Arco JS/CSS plus separate detail/product action assets while preserving necessary shared controls.');
} finally { await rm(temporary, { recursive: true, force: true }); }
