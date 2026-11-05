import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildApplication } from '../build-application.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const workingDirectory = path.resolve(here, '..');
const temporary = await mkdtemp(path.join(here, '.build-check-'));
// This exact negative-only selector prevents a native-text ring on composite
// Arco inner inputs. It is not an eager Arco dependency or positive Arco style.
const sharedFocusInputExclusion = ':not(:where(.arco-picker input,.arco-tree-select input,.arco-select input,.arco-input-tag input))';
const nativeControlExclusion = ':not(:where(.arco-input,.arco-select input,.arco-picker input,.arco-tree-select input,.arco-input-tag input,.arco-input-group input))';
const nativeCheckboxExclusion = nativeControlExclusion.replace('input))', 'input,.arco-checkbox input))');
const nativeTableExclusion = ':not(:where(.arco-table table,.arco-table th,.arco-table td))';
const inventoryNativeExclusion = ':not(:where([class*=arco-],.arco-select input,.arco-cascader input,.arco-picker input,.arco-tree-select input,.arco-input-tag input,.arco-input-group input,.arco-checkbox input,.arco-radio input))';
const withoutSharedFocusInputExclusion = css => css.replaceAll(sharedFocusInputExclusion, '').replaceAll(nativeControlExclusion, '').replaceAll(nativeCheckboxExclusion, '').replaceAll(nativeTableExclusion, '').replaceAll(inventoryNativeExclusion, '').replaceAll(inventoryNativeExclusion.replace('[class*=arco-]', '[class*="arco-"]'), '');
// Commas inside :is/:where/attribute syntax do not start a new selector.
const selectorList = selector => { const result = []; let depth = 0, quote = '', start = 0;
  for (let i = 0; i < selector.length; i++) { const character = selector[i];
    if (quote) { if (character === quote && selector[i - 1] !== '\\') quote = ''; continue; }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth--;
    else if (character === ',' && depth === 0) { result.push(selector.slice(start, i)); start = i + 1; }
  } result.push(selector.slice(start)); return result;
};
assert.deepEqual(selectorList('.inventory-ledger :is(.a,.b),.arco-btn'), ['.inventory-ledger :is(.a,.b)', '.arco-btn']);
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
  const productsRoute = closure(entryFor('routes/products.tsx'));
  const categoriesRoute = closure(entryFor('routes/product-categories.tsx'));
  const settingsRoute = closure(entryFor('routes/product-settings.tsx'));
  const schemesRoute = closure(entryFor('routes/barcode-schemes.tsx'));
  const storesRoute = closure(entryFor('routes/store-settings.tsx'));
  const salesDetail = closure(entryFor('../sales/detail-content.tsx'));
  const transferDetail = closure(entryFor('../transfers/detail-content.tsx'));
  if (process.env.TRACE_APPLICATION_BOUNDARY) console.log(JSON.stringify({ routeActions: Object.fromEntries([['inventory', inventoryRoute], ['sales', salesRoute], ['transfers', transfersRoute]].map(([name, route]) => [name, [...inputsOf(route)].filter(file => /single-select|multi-select|responsibility|ledger-drawer/.test(file))])), directActionEdges: Object.fromEntries(Object.entries(metafile.inputs).filter(([name]) => !name.includes('node_modules') && !name.includes('/tests/')).map(([name, input]) => [name, input.imports.filter(item => /single-select-action|multi-select-action/.test(item.path))]).filter(([, edges]) => edges.length)) }, null, 2));
  const singleSelect = closure(entryFor('../demo-controls/single-select-action.tsx'));
  assert.ok([...inputsOf(singleSelect)].some(file => file.endsWith('/es/Select/index.js')), 'The shared action reaches the installed Select leaf');
  const selectCopies = Object.entries(outputs).filter(([name, output]) => name.endsWith('.js') && Object.keys(output.inputs).some(file => file.endsWith('/demo-controls/single-select-action.tsx')));
  assert.equal(selectCopies.length, 1, 'All three pagers emit one shared single-select implementation');
  // The action is also an intentional direct control in ledger/responsibility/
  // document forms. Prove the pager's own graph in isolation instead of treating
  // every legitimate shared-action consumer as an eager pager regression.
  const actionEdges = Object.entries(metafile.inputs).flatMap(([source, input]) => input.imports
    .filter(item => /demo-controls\/(?:single|multi)-select-action\.tsx$/.test(item.path))
    .map(item => `${source}:${item.kind}:${item.path}`)).sort();
  assert.deepEqual(actionEdges, [
    '../demo-controls/multi-select.tsx:dynamic-import:../demo-controls/multi-select-action.tsx',
    '../demo-controls/single-select-contract.ts:dynamic-import:../demo-controls/single-select-action.tsx',
    ...['components/document-responsibility.tsx', 'current-form/sales-proposal-form.tsx', 'current-form/transfer-proposal-form.tsx', 'inventory/ledger-drawer.tsx', 'products/product-editor-specs.tsx', 'transfers/detail-content.tsx']
      .map(source => `../${source}:import-statement:../demo-controls/single-select-action.tsx`),
    '../transfers/filter-controls.tsx:import-statement:../demo-controls/multi-select-action.tsx',
  ].sort(), 'Only enumerated direct consumers and the two exact lazy shell edges may reach shared action implementations');
  const isolated = await build({ absWorkingDir: workingDirectory, entryPoints: ['../demo-controls/page-size-select.tsx', '../demo-controls/multi-select.tsx'],
    outdir: path.join(temporary, 'isolated-shells'), bundle: true, splitting: true, write: false, metafile: true, format: 'esm', platform: 'browser',
    external: ['react', 'react-dom', 'react-dom/*'], loader: { '.css': 'empty' }, jsx: 'automatic', logLevel: 'warning' });
  const isolatedOutputs = isolated.metafile.outputs;
  const isolatedByAbsolute = new Map(Object.keys(isolatedOutputs).map(name => [path.resolve(workingDirectory, name), name]));
  const isolatedClosure = start => {
    const seen = new Set(); const visit = name => { if (seen.has(name)) return; seen.add(name);
      for (const item of isolatedOutputs[name].imports) if (!item.external && item.kind !== 'dynamic-import') {
        const next = isolatedByAbsolute.get(path.resolve(workingDirectory, item.path)) ?? isolatedByAbsolute.get(path.resolve(workingDirectory, path.dirname(name), item.path));
        assert.ok(next, item.path); visit(next);
      }
    }; visit(start); return seen;
  };
  for (const shell of ['page-size-select', 'multi-select']) {
    const entry = Object.keys(isolatedOutputs).find(name => isolatedOutputs[name].entryPoint?.endsWith(`/${shell}.tsx`)); assert.ok(entry);
    const graph = isolatedClosure(entry), files = [...graph].flatMap(name => Object.keys(isolatedOutputs[name].inputs));
    for (const file of files) assert.doesNotMatch(file, /demo-controls\/(?:single|multi)-select-action\.tsx$|demo-controls\/(?:single|multi)-select\.css$/, `${shell}'s own static graph excludes action implementation and stylesheet asset`);
    assert.ok([...graph].some(name => isolatedOutputs[name].imports.some(item => item.kind === 'dynamic-import')), `${shell} retains a real emitted dynamic action edge`);
  }
  for (const [name, route] of [['inventory', inventoryRoute], ['sales', salesRoute], ['transfers', transfersRoute]]) {
    assert.ok([...inputsOf(route)].some(file => file.endsWith('/demo-controls/page-size-select.tsx')), `${name} statically reaches the shared lightweight shell`);
    for (const file of inputsOf(route)) assert.doesNotMatch(file, /demo-controls\/single-select\.css$|inventory-page-size-action/, `${name} keeps the pager stylesheet asset action-loaded; the pure shared style factory may be eager`);
    if (name === 'inventory') assert.ok([...inputsOf(route)].some(file => file.endsWith('/inventory/ledger-drawer.tsx')), 'The inventory shared-action consumer is the explicitly enumerated ledger drawer');
    else for (const file of inputsOf(route)) assert.doesNotMatch(file, /demo-controls\/single-select-action\.tsx$/, `${name} still excludes the single-select action implementation until its own activation`);
  }
  for (const file of Object.keys(metafile.inputs)) assert.doesNotMatch(file, /components\/inventory-page-size(?:-action\.tsx|\.css)$/, 'Removed inventory widget/CSS cannot survive in the graph');
  const actionStyles = byAbsolute.get(path.join(outdir, 'chunks/single-select.css')); assert.ok(actionStyles);
  const actionStyleInputs = Object.keys(outputs[actionStyles].inputs);
  assert.equal(actionStyleInputs.filter(file => file.includes('node_modules')).length, 0, 'Shared action CSS is the scoped local adapter; installed Select/Trigger CSS is retained in the shared host shell');
  assert.ok(actionStyleInputs.some(file => file.endsWith('/demo-controls/single-select.css')));
  const emittedAction = (await Promise.all([...singleSelect].map(name => readFile(path.resolve(workingDirectory, name), 'utf8')))).join('\n');
  assert.match(emittedAction, /single-select\.css/, 'The complete action closure resolves the separately emitted CSS beside its stylesheet-factory chunk');
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
  const productSearch = closure(entryFor('../components/product-candidate-action.tsx'));
  assert.ok([...inputsOf(productSearch)].some(file => file.endsWith('/es/Select/index.js')), 'Product finder uses the source Select leaf');
  for (const file of inputsOf(inventoryRoute)) assert.doesNotMatch(file, /product-candidate-(?:action|styles)\.(?:tsx?|css)$/, 'Inventory defers product search action and styles');
  const productStyles = byAbsolute.get(path.join(outdir, 'chunks/product-candidate-action.css')); assert.ok(productStyles);
  assert.ok(Object.keys(outputs[productStyles].inputs).some(file => file.endsWith('/components/product-candidate-action.css')));
  for (const file of Object.keys(outputs[productStyles].inputs)) assert.doesNotMatch(file, /dist\/css\/arco\.css|\/es\/style\/index\.css/, 'Product search imports leaves only, not Arco global reset');
  assert.match(await readFile(path.resolve(workingDirectory, productStyles), 'utf8'), /inv-menu-grid/);
  const productActionOutput = [...productSearch].find(name => Object.keys(outputs[name].inputs).some(file => file.endsWith('/components/product-candidate-styles.ts')));
  assert.ok(productActionOutput); assert.match(await readFile(path.resolve(workingDirectory, productActionOutput), 'utf8'), /product-candidate-action\.css/);
  const startupInputs = inputsOf(startup);
  // Construction must capture the optional full-page capability before any
  // activation. Only these two pure descriptor/type modules may be eager;
  // product HTTP readers, UI leaves and query/model code remain deferred.
  const productCapabilityInputs = new Set(['../products/product-page-configuration.ts', '../products/product-page-contracts.ts']);
  for (const file of startupInputs) if (!productCapabilityInputs.has(file)) assert.doesNotMatch(file, /\/(?:inventory|sales|parties|transfers|products|product-settings|barcode-schemes|settings\/stores)\/|synthetic|preview\//);
  for (const file of productCapabilityInputs) {
    assert.ok(startupInputs.has(file));
    assert.doesNotMatch(await readFile(path.resolve(workingDirectory, file), 'utf8'), /import\s+(?!type\b)[^;]+from\s+['"](?:react|@arco|.*(?:http-reader|query-controller|product-model|\.tsx)['"])/);
  }
  // User requirement supersedes the former native-input-only startup policy.
  // Real authentication/list inputs and buttons require the installed Arco
  // implementation; business readers/details/fixtures must still remain lazy.
  assert.ok([...startupInputs].some(file => file.endsWith('/es/Input/input.js')), 'Authentication reaches actual Arco Input');
  assert.ok([...startupInputs].some(file => file.endsWith('/es/Button/index.js')), 'Authentication reaches actual Arco Button');
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
  assert.doesNotMatch(withoutSharedFocusInputExclusion(styles.application), /iw-workbench|sales-workbench|party-workbench|transfer-route|transfer-editor|pd-tabs|\.mx-/);
  for (const component of ['input','btn','picker','checkbox','select','modal','drawer']) assert.ok(styles.application.includes(`.arco-${component}`), `Real host retains shared Arco ${component} CSS after aggregate CSS replacement`);
  assert.match(styles.application,/erp-date-host/); assert.match(styles.application,/erp-overlay-close/);
  assert.match(styles.application,/\.erp-breadcrumb/, 'Explicit real-host shell retains shared Breadcrumb styles after aggregate CSS replacement');
  assert.match(styles.application,/\.erp-document-tag/, 'Explicit real-host shell retains shared domain status Tag styles after aggregate CSS replacement');
  assert.match(styles.inventory, /iw-workbench/); assert.match(styles.inventory, /\.mx-table/);
  assert.ok(!/sales-workbench|party-workbench|transfer-route|transfer-editor|pd-tabs/.test(withoutSharedFocusInputExclusion(styles.inventory)), 'Inventory excludes unrelated business styles');
  for (const rule of withoutSharedFocusInputExclusion(styles.inventory).split('}')) { const selector = rule.slice(0, rule.indexOf('{')); if (!/\.arco-/.test(selector)) continue; for (const item of selectorList(selector)) assert.match(item, /^(?::where\(\.inventory-source-workbench\)|\.inventory-source-workbench(?:[ .:#>]|$)|\.inventory-ledger|\.iw-workbench \.inventory-product-control)/, 'Positive inventory Arco adapters stay under the frozen inventory root, ledger or exact product-input scope'); }
  assert.match(styles.sales, /sales-workbench/); assert.doesNotMatch(withoutSharedFocusInputExclusion(styles.sales), /party-workbench|\.arco-|sales-detail-(?:facts|page|dialog)|sale-editor|sale-doc-fields|sale-lines-table|sale-summary/);
  assert.match(styles['sales-detail'], /sales-detail-facts/);
  assert.ok(!/sales-workbench|party-workbench|transfer-editor|\.iw-product-drawer|\.pd-tabs|\.mx-table/.test(styles['sales-detail']), 'Sales detail excludes unrelated route/drawer styles');
  for (const rule of withoutSharedFocusInputExclusion(styles['sales-detail']).split('}')) { const selector = rule.slice(0, rule.indexOf('{')); if (/\.arco-|\.mx-/.test(selector)) for (const item of selectorList(selector)) assert.match(item, /^(?:\.demo-single-select|\.sales-proposal-editor|\.sales-detail-facts|:is\(\.sales-proposal-editor,\.sales-detail-facts\)|\.sale-|\.document-scan)/, 'Sales detail shared spec/Arco styling is scoped to its explicit single-select/form/scan adapters'); }
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
  assert.match(styles.products, /pm-products/); assert.match(styles['product-categories'], /catalogue-categories/); assert.match(styles['product-settings'], /dictionary-workbench/); assert.match(styles['barcode-schemes'], /dictionary-workbench/);
  for (const file of inputsOf(settingsRoute)) assert.doesNotMatch(file,/\/product-settings\/(?:colors\/(?:colors-page|entry-page)|fits\/fits-page)\.tsx$/,'Colors/fits UI remains tab-action lazy, even when the settings route is configured');
  for (const route of [productsRoute,categoriesRoute,settingsRoute,schemesRoute,storesRoute]) for (const file of inputsOf(route)) assert.doesNotMatch(file,/synthetic|\/preview\/|\/tests\/|postgres|current-form\/http-reader/,'Management routes never import fixture/transaction-candidate/database fallbacks');
  assert.ok([...inputsOf(storesRoute)].some(file=>file.endsWith('/settings/stores/maintenance-http-client.ts')),'Stores uses the current organization-read adapter, not the retired store-only reader');
  assert.ok([...inputsOf(storesRoute)].some(file=>file.endsWith('/components/standard-overlay.tsx')),'New detail route reuses actual Arco overlay adapter');
  assert.match(styles['store-settings'],/store-settings-workbench/);
  assert.doesNotMatch(styles['store-settings'],/sales-workbench|transfer-route|transfer-editor|\.mx-|party-workbench/);
  for (const name of ['product-categories','product-settings','barcode-schemes']) assert.doesNotMatch(styles[name],/sales-workbench|transfer-route|transfer-editor|\.mx-|party-workbench/,'Read-only dictionary CSS does not replace transaction styles');
  assert.match(styles['transfer-product'], /\.iw-product-drawer/); assert.match(styles['transfer-product'], /\.pd-panel/);
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
    guarantees: ['One shared single-select action and action-only CSS serves all three lightweight pager adapters', 'One shared TreeSelect presentation serves transfer filters and action-lazy sales filters', 'Shared standard inputs/buttons use real Arco from startup; explicit shell graph retains their installed styles', 'Business routes/details/readers remain explicit and lazy',
      'Sales/parties CSS preserves shared controls/tokens but excludes all inventory-specific matrix/settings/drawer assets',
      'Sales route static code/CSS excludes detail content/styles; separate sales-detail CSS is explicit action-only host configuration',
      'Transfer route excludes detail/product code/data/styles; inline-detail and product action assets are separate'],
    boundary: 'Static emitted-import/CSS analysis only. No browser/network waterfall, timing, memory or frozen-Demo visual acceptance.',
  };
  console.log(JSON.stringify(description, null, 2));
  console.log('PASS: actual split output retains real shared Arco controls/styles while isolating business routes, inventory CSS and separate detail/product action assets.');
} finally { await rm(temporary, { recursive: true, force: true }); }
