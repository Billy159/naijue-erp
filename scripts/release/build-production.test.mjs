import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, lstat, writeFile, realpath, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { buildProduction, verifySourceExport } from './build-production.mjs';

const parent = process.env.BUILD_TOOL_TEST_ROOT ? path.resolve(process.env.BUILD_TOOL_TEST_ROOT) : await realpath(os.tmpdir());
if (process.env.BUILD_TOOL_TEST_ROOT) await mkdir(parent, { recursive: false });
const temporary = await mkdtemp(path.join(parent, 'build-tool-'));
const installedModules = fileURLToPath(new URL('../../node_modules/', import.meta.url));
const nativePackage = `@esbuild/${process.platform}-${process.arch}`;
const actualLock = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url)));
const config = { kind: 'naijue-erp-production-host', http: { origin: 'https://1n5635n614.goho.co', basePath: '/api' }, assets: { basePath: '/assets/tool-build/' }, session: { verifyOnMount: true } };
async function put(root, name, bytes) { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), bytes); }
const gitObject = (type, bytes) => createHash('sha1').update(Buffer.from(`${type} ${bytes.length}\0`)).update(bytes).digest();
async function commitFixtureTree(root) {
  // Independent, tiny Git-object construction. No Git invocation, service, database or ERP build.
  const hashDirectory = async directory => {
    const rows = [];
    for (const name of await readdir(directory)) {
      if (['node_modules', '.release-source-commit'].includes(name)) continue;
      const filename = path.join(directory, name), info = await lstat(filename);
      rows.push({ name, directory: info.isDirectory(), mode: info.isDirectory() ? '40000' : info.mode & 0o111 ? '100755' : '100644',
        oid: info.isDirectory() ? await hashDirectory(filename) : gitObject('blob', await readFile(filename)) });
    }
    rows.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? '/' : '')), Buffer.from(b.name + (b.directory ? '/' : ''))));
    return gitObject('tree', Buffer.concat(rows.map(row => Buffer.concat([Buffer.from(`${row.mode} ${row.name}\0`), row.oid]))));
  };
  const tree = (await hashDirectory(root)).toString('hex');
  const commit = Buffer.from(`tree ${tree}\nauthor Tool Check <tool@example.invalid> 1 +0000\ncommitter Tool Check <tool@example.invalid> 1 +0000\n\nTool-only source export\n`);
  await put(root, '.release-source-commit', commit); return gitObject('commit', commit).toString('hex');
}
const builder = `import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'../../..'), working=root;
export async function buildProductionHost({ configuration,outdir,sourceCheckpoint }) {
 await mkdir(outdir);
 const result=await build({absWorkingDir:working,entryPoints:{application:path.join(here,'frontend/production-bootstrap.ts')},outdir,bundle:true,platform:'browser',format:'esm',metafile:true,logLevel:'silent'});
 await writeFile(path.join(outdir,'metafile.json'),JSON.stringify(result.metafile));
 const inputs=[];for(const name of Object.keys(result.metafile.inputs)){const filename=path.resolve(working,name),bytes=await readFile(filename);inputs.push({path:path.relative(root,filename).split(path.sep).join('/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(path.join(outdir,'index.html'),'<script id="naijue-erp-production-configuration" type="application/json">'+JSON.stringify({configuration})+'</script><script type="module" src="https://1n5635n614.goho.co/assets/tool-build/application.js"></script>');
 const outputs=[];for(const name of ['application.js','metafile.json','index.html']){const bytes=await readFile(path.join(outdir,name));outputs.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(path.join(outdir,'production-build.json'),JSON.stringify({format:'naijue-production-web-v1',sourceCheckpoint,inputs,outputs}));
 return {manifest:'production-build.json'};
}`;
async function fixture(name, dependencies = false, syntheticGraph = false) {
  const root = path.join(temporary, name), sourceRoot = path.join(root, 'export'); await mkdir(sourceRoot, { recursive: true });
  const esbuildVersion = actualLock.packages['node_modules/esbuild'].version;
  const pkg = { name: 'tiny-build-tool-check', private: true, type: 'module', dependencies: {}, devDependencies: { esbuild: esbuildVersion } };
  const lock = { name: pkg.name, lockfileVersion: 3, packages: { '': { dependencies: {}, devDependencies: pkg.devDependencies },
    'node_modules/esbuild': actualLock.packages['node_modules/esbuild'], [`node_modules/${nativePackage}`]: actualLock.packages[`node_modules/${nativePackage}`] } };
  const data = { 'package.json': JSON.stringify(pkg), 'package-lock.json': JSON.stringify(lock), 'tsconfig.json': '{}',
    'apps/web/tsconfig.json': '{}', 'apps/web/src/application/tsconfig.json': '{}',
    'apps/web/demo-replica/build-production-host.mjs': builder,
    'apps/web/src/application/build-application.mjs': 'export const onlyToolPlaceholder = true;',
    'apps/web/src/production-host/configuration.ts': 'export const onlyToolPlaceholder = true;',
    'apps/web/demo-replica/frontend/production-bootstrap.ts': syntheticGraph ? 'import "./fixture-data.ts"; export const tiny=1;' : 'export const tiny: number=1;',
    'apps/api/src/production-main.ts': 'import { readFile } from "node:fs/promises"; export async function unused() { return readFile("never-called"); }',
    'adapters/postgres/migrations/0001_initial.sql': '-- TOOL ONLY, never executed\nCREATE SCHEMA tool_check;\n',
    'adapters/postgres/patches/0026-v11-document-specification-save.sql': '-- TOOL ONLY, never executed\nSELECT 11;\n' };
  if (syntheticGraph) data['apps/web/demo-replica/frontend/fixture-data.ts'] = 'export const simulated=1;';
  for (const [name, bytes] of Object.entries(data)) await put(sourceRoot, name, bytes);
  const sourceCommit = await commitFixtureTree(sourceRoot);
  if (dependencies) {
    for (const packageName of ['esbuild', nativePackage]) await cp(path.join(installedModules, packageName), path.join(sourceRoot, 'node_modules', packageName), { recursive: true, errorOnExist: true });
    await put(sourceRoot, 'node_modules/.package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: Object.fromEntries(Object.entries(lock.packages).filter(([name]) => name !== '')) }));
  }
  const publicConfig = path.join(root, 'public.json'); await writeFile(publicConfig, JSON.stringify(config));
  return { root, sourceRoot, sourceCommit, publicConfig, options: { sourceRoot, sourceCommit, publicConfig,
    buildId: 'tiny-tool-build', buildRoot: path.join(root, 'build'), manifestDirectory: path.join(root, 'manifests') } };
}
test('small real esbuild graphs produce the two frozen pack manifests without running backend', async () => {
  const f = await fixture('real-graphs', true), receipt = await buildProduction(f.options);
  assert.equal(receipt.status, 'REAL_BUILD_AND_PACK_CONTRACT_VALIDATED'); assert.equal(receipt.runtimeApplicationStarted, false);
  const source = JSON.parse(await readFile(path.join(f.options.manifestDirectory, 'source-manifest.json')));
  const build = JSON.parse(await readFile(path.join(f.options.manifestDirectory, 'build-manifest.json')));
  assert.equal(source.sourceCommit, f.sourceCommit); assert.equal(build.sourceCommit, f.sourceCommit);
  assert(build.components.frontend.inputs.some(row => row.path === 'apps/web/demo-replica/frontend/production-bootstrap.ts'));
  assert(build.components.backend.inputs.some(row => row.path === 'apps/api/src/production-main.ts'));
  assert.equal(await readFile(path.join(f.options.buildRoot, 'migrations/0001_initial.sql'), 'utf8'), '-- TOOL ONLY, never executed\nCREATE SCHEMA tool_check;\n');
  assert.equal(await readFile(path.join(f.options.buildRoot, 'patches/0026-v11-document-specification-save.sql'), 'utf8'), '-- TOOL ONLY, never executed\nSELECT 11;\n');
  assert(build.files.some(row => row.member === 'patches/0026-v11-document-specification-save.sql'
    && row.sourcePath === 'adapters/postgres/patches/0026-v11-document-specification-save.sql' && row.role === 'migration')); 
});
test('uncommitted source mutation cannot be labelled as the proof commit', async () => {
  const f = await fixture('wip'); await put(f.sourceRoot, 'apps/api/src/production-main.ts', 'changed after export');
  await assert.rejects(buildProduction(f.options), error => error.code === 'COMMIT_TREE_MISMATCH_NO_WIP_LABEL');
});
test('source symlink is rejected before importing any builder', async () => {
  const f = await fixture('symlink'); await symlink('package.json', path.join(f.sourceRoot, 'link.json'));
  await assert.rejects(verifySourceExport(f.sourceRoot, f.sourceCommit), error => error.code === 'SYMLINK_IN_SOURCE_EXPORT');
});
test('fresh output guard preserves an existing result', async () => {
  const f = await fixture('old-output'); await mkdir(f.options.buildRoot);
  await assert.rejects(buildProduction(f.options), error => error.code === 'BUILD_OUTPUT_EXISTS_NO_OVERWRITE');
});
test('a real esbuild graph containing fixture input is rejected rather than relabelled', async () => {
  const f = await fixture('fixture-graph', true, true);
  await assert.rejects(buildProduction(f.options), error => error.code === 'NON_PRODUCTION_BUILD_GRAPH');
});
