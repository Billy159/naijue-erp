import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const outdir = path.join(root, 'dist-preview');
await mkdir(outdir, { recursive: true });
const common = { absWorkingDir: root, bundle: true, platform: 'browser', target: 'es2022', minify: true, legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' };
const result = await build({ ...common, entryPoints: { main: 'preview/main.tsx', 'inventory-route': 'src/inventory/inventory-route.tsx', 'synthetic-reader': 'preview/synthetic-reader.ts', 'product-drawer': 'src/inventory/product-drawer.tsx' }, outdir, format: 'esm', splitting: true, metafile: true, chunkNames: 'chunks/[name]-[hash]' });
// esbuild collects dynamic-import CSS into the entry CSS too. Override startup CSS
// with only shell rules; route CSS is installed by the explicit leaf style factory.
const shellStyles = await build({ ...common, entryPoints: ['preview/shell.css'], outfile: path.join(outdir, 'main.css'), metafile: true });
for (const [file, output] of Object.entries(shellStyles.metafile.outputs)) result.metafile.outputs[file] = output;
const shellCss = await readFile(path.join(outdir,'main.css'),'utf8');
for (const selector of ['.arco-menu','.arco-breadcrumb','.arco-drawer','.arco-checkbox','.erp-overlay-anchor','.erp-breadcrumb']) assert.ok(shellCss.includes(selector),`Actual DemoFrame startup dependency ${selector} must retain its styles`);
assert.doesNotMatch(shellCss,/\.iw-workbench|\.mx-table|\.pd-panel|\.pd-tabs|sales-detail-facts|transfer-editor/,'Startup framework CSS must not pull eager inventory/product/document styling');

// Five existing wrapper adapters live in the shared overlay leaf already used
// by DemoFrame. They are not the lazy product facts/specs/photos stylesheet.
const sharedDrawerSelectors=[
 '.erp-product-drawer.arco-drawer .arco-drawer-header',
 '.erp-product-drawer.arco-drawer .arco-drawer-scroll',
 '.erp-product-drawer.arco-drawer .arco-drawer-content',
 '.erp-product-drawer.arco-drawer .iw-product-drawer-body',
 '.erp-product-drawer.arco-drawer .arco-drawer-content>.erp-overlay-close',
];
const drawerSelectors=css=>[...css.matchAll(/\.erp-product-drawer[^,{}]*/g)].map(match=>match[0].trim()).sort();
assert.deepEqual(drawerSelectors(shellCss),[...sharedDrawerSelectors].sort(),'Only the exact existing shared overlay wrapper adapters may be eager');
assert.deepEqual(drawerSelectors(await readFile(path.join(root,'src/components/standard-overlay.css'),'utf8')),[...sharedDrawerSelectors].sort(),'The approved wrappers originate only in the unchanged shared overlay leaf');
const shellInputs=Object.values(shellStyles.metafile.outputs).flatMap(output=>Object.keys(output.inputs));
for(const required of ['node_modules/@arco-design/web-react/dist/css/arco.css','src/components/standard-overlay.css','src/components/standard-breadcrumb.css','src/components/standard-controls.css'])assert.ok(shellInputs.some(input=>input.endsWith(required)),`Explicit startup style provenance: ${required}`);
for(const input of shellInputs)assert.doesNotMatch(input,/src\/(?:inventory|sales|transfers|current-form|products)\//,'Shell CSS excludes lazy business sources');

const inventoryStyles = await build({ ...common, entryPoints: ['src/inventory/inventory.css'], outfile: path.join(outdir, 'inventory-route.css'), metafile: true });
for (const [file, output] of Object.entries(inventoryStyles.metafile.outputs)) result.metafile.outputs[file] = output;
const pageSizeStyles = await build({ ...common, entryPoints: ['src/demo-controls/single-select.css'], outfile: path.join(outdir, 'chunks/single-select.css'), metafile: true });
Object.assign(result.metafile.outputs, pageSizeStyles.metafile.outputs);
const productSearchStyles = await build({ ...common, entryPoints: ['src/components/product-candidate-action.css'], outfile: path.join(outdir, 'chunks/product-candidate-action.css'), metafile: true });
Object.assign(result.metafile.outputs, productSearchStyles.metafile.outputs);
const multiSelectStyles = await build({ ...common, entryPoints: ['src/demo-controls/multi-select.css'], outfile: path.join(outdir, 'chunks/multi-select.css'), metafile: true });
Object.assign(result.metafile.outputs, multiSelectStyles.metafile.outputs);
const head = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>奈爵 ERP · TEST ONLY 库存交互预览</title>';
await writeFile(path.join(outdir, 'index.html'), `${head}<link rel="stylesheet" href="./main.css"></head><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>`);
await writeFile(path.join(outdir, 'metafile.json'), JSON.stringify(result.metafile, null, 2));
// Portable file-open preview. Deliberately all-in-one; not evidence of route chunk loading.
const standalone = await build({ ...common, entryPoints: ['preview/main.tsx'], write: false, outdir: 'standalone', format: 'iife', define: { ...common.define, 'import.meta.url': '"about:blank"' } });
const script = standalone.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = standalone.outputFiles.find(file => file.path.endsWith('.css'))?.text;
if (!script || !css) throw new Error('Standalone preview bundle missing.');
await writeFile(path.join(outdir, 'inventory-preview-test-only.html'), `${head}<style data-inventory-inline data-demo-single-select-inline data-demo-multi-select-inline data-inventory-product-select-inline>${(css + await readFile(path.join(outdir, 'chunks/single-select.css'), 'utf8') + await readFile(path.join(outdir, 'chunks/multi-select.css'), 'utf8') + await readFile(path.join(outdir, 'chunks/product-candidate-action.css'), 'utf8')).replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`);
const files = ['index.html', 'main.js', 'main.css', 'inventory-route.js', 'inventory-route.css', 'synthetic-reader.js', 'product-drawer.js', 'product-drawer.css', 'inventory-preview-test-only.html'];
for (const file of files) console.log(`${file}: ${(await stat(path.join(outdir, file))).size} bytes`);
console.log('Built static files only. No server, listener, deployment, database or network action.');

const portableBytes = (await stat(path.join(outdir, 'inventory-preview-test-only.html'))).size;
if (portableBytes > 256 * 1024) console.warn(`Portable preview exceeds 256KiB budget: ${portableBytes} bytes. Functionality retained; split build is available.`);
