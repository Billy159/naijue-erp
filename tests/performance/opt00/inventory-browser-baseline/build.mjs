/** TEST ONLY rebuild entry. No build executes on import. A controller must
 * approve the complete source-manifest SHA and a clean runtime before calling.
 * CLI: node build.mjs RUNTIME_REPO COMMIT FRESH_OUT MANIFEST MANIFEST_SHA */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, cp, realpath, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isBuiltin } from 'node:module';
import { createHash } from 'node:crypto';
import { sha256, verifiedFile } from './serve.mjs';
import { localizeCanonicalAssets } from '../browser-host/html-assets.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), sourceRoot = path.resolve(here, '../../../..');
export function requireManifestShape(manifest) {
  const required = ['README.md', 'identity-map.mjs', 'inventory-profile.mjs', 'inventory-profile.test.mjs', 'observer.mjs', 'entry.tsx', 'serve.mjs', 'build.mjs', 'host.test.mjs'].map(name => 'tests/performance/opt00/inventory-browser-baseline/' + name);
  assert.deepEqual(manifest.sourceFiles.map(f => f.path).sort(), required.sort(), 'Exactly nine reviewed owned files required');
  assert.deepEqual(manifest.readOnlyHelpers.map(f => f.path), ['tests/performance/opt00/browser-host/html-assets.mjs']);
  return manifest;
}
export function mapRuntimeImport(sourceRoot, runtimeRepo, importer, specifier) {
  if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) return null;
  const relative = path.relative(sourceRoot, path.resolve(path.dirname(importer), specifier));
  return /^(apps|packages)\//.test(relative) ? path.join(runtimeRepo, relative) : null;
}
export function generatePinnedEntry(source, { outdir, runtimeRepo, observerFile }) {
  assert.ok([outdir, runtimeRepo, observerFile].every(path.isAbsolute));
  const fromBuild = file => { const relative = path.relative(outdir, file).split(path.sep).join('/'); return JSON.stringify(relative.startsWith('.') ? relative : './' + relative); };
  return source.replace(/'\.\.\/\.\.\/\.\.\/\.\.\/(apps\/[^']+)'/g, (_all, rel) => fromBuild(path.join(runtimeRepo, rel))).replace("'./observer.mjs'", fromBuild(observerFile));
}
export function assertBrowserGraphBoundaries(metafile) {
  assert.ok(metafile && Object.keys(metafile.inputs ?? {}).length);
  for (const [input, facts] of Object.entries(metafile.inputs)) {
    const physical = input.replace(/^(?:inventory-inline|inventory-runtime-css|inventory-drawer-retry):/, '').replaceAll('\\', '/');
    assert.ok(!/(?:^|\/)(?:apps\/api|adapters\/postgres|packages\/(?:api|postgres))(?:\/|$)|(?:^|\/)node_modules\/(?:pg|pg-pool|pg-protocol|postgres|fastify)(?:\/|$)|(?:^|\/)(?:unified-browser-harness|fixtures?)(?:\/|$)|runtime-preview-transport|inventory-profile|synthetic-reader|(?:^|\/)node:/.test(physical), 'Forbidden actual browser source:' + input);
    for (const imported of facts.imports ?? []) assert.ok(!isBuiltin(imported.path), 'Node builtin in browser:' + imported.path);
  }
}
export async function buildInventoryBrowser({ runtimeRepo, runtimeCommit, outdir, sourceManifest, sourceManifestSha256 }) {
  assert.equal(process.version, 'v24.21.0'); assert.equal(execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(), '11.9.0');
  assert.ok([runtimeRepo, outdir, sourceManifest].every(path.isAbsolute)); assert.match(runtimeCommit, /^[a-f0-9]{40}$/); runtimeRepo = await realpath(runtimeRepo);
  const git = (...args) => execFileSync('git', ['-C', runtimeRepo, ...args], { encoding: 'utf8' }).trim();
  assert.equal(git('rev-parse', 'HEAD'), runtimeCommit); assert.equal(git('status', '--porcelain'), ''); const runtimeTree = git('rev-parse', 'HEAD^{tree}');
  assert.equal((await lstat(path.join(runtimeRepo, 'node_modules'))).isSymbolicLink(), false, 'Original production producer needs a selected checkout with its own locked physical dependency root; coordinate environment preparation, do not relax its graph');
  const lock = await readFile(path.join(runtimeRepo, 'package-lock.json')); assert.equal(sha256(await readFile(path.join(sourceRoot, 'package-lock.json'))), sha256(lock), 'Harness builder dependency lock must equal selected original lock');
  const manifestBytes = await readFile(sourceManifest); assert.equal(sha256(manifestBytes), sourceManifestSha256); const reviewed = requireManifestShape(JSON.parse(manifestBytes));
  const frozen = new Map([...reviewed.sourceFiles, ...reviewed.readOnlyHelpers].map(f => [f.path, f]));
  for (const f of frozen.values()) await verifiedFile(sourceRoot, f);
  const runtimeInputs = new Map(), dependencies = new Map(), helperInputs = new Map();
  async function observe(filename, bytes) {
    const absolute = await realpath(filename), rel = path.relative(runtimeRepo, absolute), helper = path.relative(sourceRoot, absolute);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      const value = { path: rel, bytes: bytes.length, sha256: sha256(bytes) };
      if (rel.includes('node_modules/')) { dependencies.set(rel, value); return; }
      const blob = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
      assert.equal(blob, git('rev-parse', 'HEAD:' + rel), 'Runtime input not pinned Git blob:' + rel); runtimeInputs.set(rel, value); return;
    }
    const f = frozen.get(helper); assert.ok(f, 'Unreviewed harness input:' + absolute); assert.equal(sha256(bytes), f.sha256); assert.equal(bytes.length, f.bytes); helperInputs.set(helper, f);
  }
  await mkdir(outdir, { recursive: false }); await writeFile(path.join(outdir, 'package.json'), '{"type":"module"}\n');
  await writeFile(path.join(outdir, 'reviewed-source-manifest.json'), manifestBytes);
  const configuration = { kind: 'naijue-erp-production-host', http: { origin: 'https://synthetic-inventory600.invalid', basePath: '/api' }, assets: { basePath: '/assets/' }, session: { verifyOnMount: true }, routes: { inventory: true, sales: false, transfers: false } };
  const { buildProductionHost } = await import(pathToFileURL(path.join(runtimeRepo, 'apps/web/demo-replica/build-production-host.mjs')).href);
  const { checkProductionGraph } = await import(pathToFileURL(path.join(runtimeRepo, 'apps/web/demo-replica/tests/production-graph-check.mjs')).href);
  const productionRoot = path.join(outdir, 'canonical-production'), production = await buildProductionHost({ configuration, outdir: productionRoot, sourceCheckpoint: runtimeCommit });
  const productionGraph = await checkProductionGraph(productionRoot); assert.equal(productionGraph.status, 'PASS');
  for (const input of production.inputs) await observe(path.join(runtimeRepo, input.path), await readFile(path.join(runtimeRepo, input.path)));
  const assets = path.join(outdir, 'assets'); await mkdir(assets); await cp(path.join(productionRoot, 'source-styles'), path.join(assets, 'source-styles'), { recursive: true });
  try { await cp(path.join(productionRoot, 'assets'), path.join(assets, 'assets'), { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const controls = '<details id="inventory-test-tools" style="position:fixed;left:220px;top:4px;max-width:700px;z-index:1500;background:#fff4b9;font:12px system-ui"><summary>TEST ONLY · inventory600 · functional/no performance acceptance</summary><label>操作<select id="inventory-test-mode"><option>FIRST_QUERY</option><option>DISPLAY_SETTING</option></select></label><label>字段<select id="inventory-test-setting">' + ['category', 'supplier', 'fit', 'sizeGroup', 'season', 'subtotal', 'total', 'sizeDescription'].map(key => '<option>' + key + '</option>').join('') + '</select></label><select id="inventory-test-sample"><option>functional-only</option></select><button id="inventory-test-arm" type="button">准备功能观测</button><button id="inventory-test-abort" type="button">取消观测</button><output id="inventory-test-state"></output></details>';
  let html = localizeCanonicalAssets(await readFile(path.join(productionRoot, 'index.html'), 'utf8'), configuration.http.origin);
  html = html.replace('<title>奈爵服饰 ERP</title>', '<title>OPT00 SYNTHETIC inventory600 · canonical copied renderer</title>').replace('</body>', controls + '</body>'); await writeFile(path.join(outdir, 'host-shell.html'), html);
  const entryRelative = 'tests/performance/opt00/inventory-browser-baseline/entry.tsx', entryBytes = await verifiedFile(sourceRoot, frozen.get(entryRelative));
  const entry = generatePinnedEntry(entryBytes.toString(), { outdir, runtimeRepo, observerFile: path.join(here, 'observer.mjs') });
  assert.ok(!entry.includes("'../../../../apps/")); const generated = path.join(outdir, 'entry.tsx'); await writeFile(generated, entry);
  const front = path.join(runtimeRepo, 'apps/web/demo-replica/frontend'), runtimeCss = new Set(['basic-settings-v2.css', 'runtime/settings/settings-runtime.css', 'runtime/settings/payment-halls.css', 'runtime/common/account-password.css'].map(name => path.join(front, name)).concat(['standard-controls.css', 'standard-overlay.css', 'document-output.css'].map(name => path.join(runtimeRepo, 'apps/web/src/components', name))));
  const { build } = await import(pathToFileURL(path.join(runtimeRepo, 'node_modules/esbuild/lib/main.js')).href);
  const browser = await build({ absWorkingDir: runtimeRepo, entryPoints: { application: generated }, outdir: assets, bundle: true, splitting: true, platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', minify: true, metafile: true, define: { 'process.env.NODE_ENV': '"production"' }, chunkNames: 'chunks/[name]-[hash]', assetNames: 'assets/[name]-[hash]', alias: Object.fromEntries(['react', 'react-dom', '@arco-design/web-react', 'jszip'].map(name => [name, path.join(runtimeRepo, 'node_modules', name)])), loader: { '.svg': 'file', '.png': 'file', '.jpg': 'file', '.woff2': 'file' }, plugins: [{ name: 'pinned-canonical-copied-css', setup(builder) {
    builder.onResolve({ filter: /\?(?:inline|inventory-drawer-retry)$/ }, async args => { const inline = args.path.endsWith('?inline'), request = args.path.slice(0, args.path.lastIndexOf('?')), result = await builder.resolve(request, { resolveDir: args.resolveDir, kind: args.kind }); return result.errors.length ? { errors: result.errors } : { path: result.path, namespace: inline ? 'inventory-inline' : 'inventory-drawer-retry' }; });
    builder.onResolve({ filter: /\.css$/ }, args => { const file = path.resolve(args.resolveDir, args.path); if (args.kind === 'import-statement' && args.importer.endsWith('.tsx') && runtimeCss.has(file)) return { path: file, namespace: 'inventory-runtime-css' }; });
    builder.onLoad({ filter: /.*/, namespace: 'inventory-inline' }, async args => { const bytes = await readFile(args.path); await observe(args.path, bytes); return { contents: bytes, loader: 'text' }; });
    builder.onLoad({ filter: /.*/, namespace: 'inventory-drawer-retry' }, async args => { const bytes = await readFile(args.path); await observe(args.path, bytes); return { contents: bytes, loader: 'tsx', resolveDir: path.dirname(args.path) }; });
    builder.onLoad({ filter: /.*/, namespace: 'inventory-runtime-css' }, async args => { const bytes = await readFile(args.path); await observe(args.path, bytes); const key = path.relative(runtimeRepo, args.path).split(path.sep).join('/'); return { contents: `const key=${JSON.stringify(key)};if(!document.querySelector('style[data-replica-component="'+key+'"]')){const style=document.createElement('style');style.dataset.replicaComponent=key;style.textContent=${JSON.stringify(bytes.toString())};document.head.append(style);}`, loader: 'js' }; });
    builder.onLoad({ filter: /.*/, namespace: 'file' }, async args => { if (args.path !== generated) await observe(args.path, await readFile(args.path)); return undefined; });
  } }] });
  await writeFile(path.join(outdir, 'browser-metafile.json'), JSON.stringify(browser.metafile, null, 2));
  const browserRuntimeClosure = [...runtimeInputs.values()];
  assertBrowserGraphBoundaries(browser.metafile);
  const roots = new Set(Object.keys(browser.metafile.inputs).filter(file => /node_modules\/(react|react-dom)\//.test(file)).map(file => path.resolve(runtimeRepo, file).split('/node_modules/')[0])); assert.deepEqual([...roots], [runtimeRepo]);
  const tsconfig = { extends: path.join(runtimeRepo, 'apps/web/demo-replica/tsconfig.runtime.json'), compilerOptions: { allowJs: true, checkJs: false, typeRoots: [path.join(runtimeRepo, 'node_modules/@types')] }, include: [generated, path.join(runtimeRepo, 'apps/web/src/styles.d.ts'), path.join(runtimeRepo, 'apps/web/demo-replica/frontend/runtime/inventory/assets.d.ts'), path.join(runtimeRepo, 'apps/web/demo-replica/frontend/runtime/common/inventory-drawer-imports.d.ts')], exclude: [] };
  await writeFile(path.join(outdir, 'tsconfig.host.json'), JSON.stringify(tsconfig));
  try { await writeFile(path.join(outdir, 'typecheck.log'), execFileSync(process.execPath, [path.join(runtimeRepo, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', path.join(outdir, 'tsconfig.host.json')], { encoding: 'utf8' }) || 'PASS strict actual generated host\n'); }
  catch (error) { await writeFile(path.join(outdir, 'typecheck-failed.log'), String(error.stdout ?? '') + String(error.stderr ?? '')); throw error; }
  const nodeGraph = await build({ absWorkingDir: sourceRoot, entryPoints: [path.join(here, 'serve.mjs')], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true, packages: 'external', plugins: [{ name: 'clean-node-runtime', setup(builder) { builder.onResolve({ filter: /./ }, args => { if (!args.importer) return; const target = mapRuntimeImport(sourceRoot, runtimeRepo, args.importer, args.path); return target ? { path: target } : undefined; }); } }] });
  const serverRuntimeClosure = [];
  for (const input of Object.values(nodeGraph.metafile.inputs)) for (const imported of input.imports ?? []) if (imported.external) assert.ok(isBuiltin(imported.path), 'No unbound Node dependency:' + imported.path);
  for (const input of Object.keys(nodeGraph.metafile.inputs)) {
    const absolute = path.resolve(sourceRoot, input), bytes = await readFile(absolute); await observe(absolute, bytes);
    const runtime = path.relative(runtimeRepo, absolute), rel = !runtime.startsWith('..') && !path.isAbsolute(runtime) ? runtime : path.relative(sourceRoot, absolute);
    assert.ok(/^(apps|packages|tests\/performance\/opt00)\//.test(rel) && !rel.includes('..'));
    if (/^(apps|packages)\//.test(rel)) serverRuntimeClosure.push({ path: rel, bytes: bytes.length, sha256: sha256(bytes) });
    const target = path.join(outdir, 'server-source', rel); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes);
  }
  await writeFile(path.join(outdir, 'server-source/package.json'), '{"type":"module"}\n'); await writeFile(path.join(outdir, 'node-metafile.json'), JSON.stringify(nodeGraph.metafile, null, 2));
  for (const f of frozen.values()) await verifiedFile(sourceRoot, f);
  for (const f of [...runtimeInputs.values(), ...dependencies.values()]) await verifiedFile(runtimeRepo, f);
  assert.equal(git('rev-parse', 'HEAD'), runtimeCommit); assert.equal(git('status', '--porcelain'), ''); assert.equal(sha256(await readFile(sourceManifest)), sourceManifestSha256);
  const artifacts = [];
  async function walk(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) await walk(file); else { assert.ok(entry.isFile()); const bytes = await readFile(file); artifacts.push({ path: path.relative(outdir, file), bytes: bytes.length, sha256: sha256(bytes) }); } } }
  await walk(outdir); artifacts.sort((a, b) => a.path.localeCompare(b.path));
  const identity = { format: 'OPT00_INVENTORY600_CANONICAL_TEST_HOST_V1', runtime: { commit: runtimeCommit, tree: runtimeTree, repo: runtimeRepo, closureSha256: sha256(JSON.stringify([...runtimeInputs.values()].sort((a, b) => a.path.localeCompare(b.path)))) }, sourceManifestSha256, harnessManifestSha256: sha256(JSON.stringify([...frozen.values()])), harnessSource: [...frozen.values()], browserRuntimeClosure, serverRuntimeClosure, runtimeInputs: [...runtimeInputs.values()], dependencyInputs: [...dependencies.values()], rootLockSha256: sha256(await readFile(path.join(runtimeRepo, 'package-lock.json'))), productionGraph, reactRoot: runtimeRepo, originalProductionManifest: 'canonical-production/production-build.json', generatedEntrySha256: sha256(entry), artifacts, artifactBuildSha256: sha256(JSON.stringify(artifacts)), serverEntry: 'server-source/tests/performance/opt00/inventory-browser-baseline/serve.mjs', node: process.version, npm: '11.9.0', scope: 'UNEXECUTED until this function is expressly authorized; resulting artifacts are explicit test adapter, NOT production HTTPS or a performance pass' };
  await writeFile(path.join(outdir, 'build-identity.json'), JSON.stringify(identity, null, 2) + '\n'); return identity;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [runtimeRepo, runtimeCommit, outdir, sourceManifest, sourceManifestSha256] = process.argv.slice(2); assert.equal(process.argv.length, 7);
  console.log(JSON.stringify(await buildInventoryBrowser({ runtimeRepo, runtimeCommit, outdir, sourceManifest, sourceManifestSha256 })));
}
