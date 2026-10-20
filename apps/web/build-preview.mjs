import { build } from 'esbuild';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const outdir = path.join(root, 'dist-preview');
await mkdir(outdir, { recursive: true });
const common = { absWorkingDir: root, bundle: true, platform: 'browser', target: 'es2022', minify: true, legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' };
const result = await build({ ...common, entryPoints: { main: 'preview/main.tsx', 'inventory-route': 'src/inventory/inventory-route.tsx', 'synthetic-reader': 'preview/synthetic-reader.ts' }, outdir, format: 'esm', splitting: true, metafile: true, chunkNames: 'chunks/[name]-[hash]' });
// esbuild collects dynamic-import CSS into the entry CSS too. Override startup CSS
// with only shell rules; route CSS is installed by the explicit leaf style factory.
const shellStyles = await build({ ...common, entryPoints: ['preview/shell.css'], outfile: path.join(outdir, 'main.css'), metafile: true });
for (const [file, output] of Object.entries(shellStyles.metafile.outputs)) result.metafile.outputs[file] = output;
const head = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>奈爵 ERP · TEST ONLY 库存交互预览</title>';
await writeFile(path.join(outdir, 'index.html'), `${head}<link rel="stylesheet" href="./main.css"></head><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>`);
await writeFile(path.join(outdir, 'metafile.json'), JSON.stringify(result.metafile, null, 2));
// Portable file-open preview. Deliberately all-in-one; not evidence of route chunk loading.
const standalone = await build({ ...common, entryPoints: ['preview/main.tsx'], write: false, outdir: 'standalone', format: 'iife', define: { ...common.define, 'import.meta.url': '"about:blank"' } });
const script = standalone.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = standalone.outputFiles.find(file => file.path.endsWith('.css'))?.text;
if (!script || !css) throw new Error('Standalone preview bundle missing.');
await writeFile(path.join(outdir, 'inventory-preview-test-only.html'), `${head}<style data-inventory-inline>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`);
const files = ['index.html', 'main.js', 'main.css', 'inventory-route.js', 'inventory-route.css', 'synthetic-reader.js', 'inventory-preview-test-only.html'];
for (const file of files) console.log(`${file}: ${(await stat(path.join(outdir, file))).size} bytes`);
console.log('Built static files only. No server, listener, deployment, database or network action.');
