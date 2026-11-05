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
  const data = { 'config/release-contract.json': await readFile(new URL('../../config/release-contract.json', import.meta.url), 'utf8'),
    'package.json': JSON.stringify(pkg), 'package-lock.json': JSON.stringify(lock), 'tsconfig.json': '{}',
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

test('dedicated candidate prefix survives a real production build and other prefixes remain rejected', async () => {
  const f = await fixture('candidate-prefix', true);
  const candidate = structuredClone(config);
  candidate.http.basePath = '/__naijue_candidate/replica-private-01/api';
  await writeFile(f.publicConfig, JSON.stringify(candidate));
  await buildProduction(f.options);
  const html = await readFile(path.join(f.options.buildRoot, 'web/index.html'), 'utf8');
  assert(html.includes(JSON.stringify(candidate)));
  const other = await fixture('other-prefix');
  candidate.http.basePath = '/__naijue_candidate/other/api';
  await writeFile(other.publicConfig, JSON.stringify(candidate));
  await assert.rejects(buildProduction(other.options), error => error.code === 'EXPLICIT_PRODUCTION_PUBLIC_CONFIGURATION_REQUIRED');
});


test('native35 exact original source closure survives one real build and pack with mixed member/external negatives',async()=>{
 const {native35Closure,validateRelease}=await import('./manifest.mjs');const {packRelease}=await import('./pack.mjs');
 const repository=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
 // Explicit local reference input to this tool test, never a production default.
 const reference=path.resolve(fileURLToPath(new URL('../../../reference-inputs/',import.meta.url)));
 const closure=await native35Closure(repository,reference);
 const f=await fixture('native35-closure',true);
 for(const pin of closure.pins)await put(f.sourceRoot,pin.path,await readFile(path.join(repository,pin.path)));
 await put(f.sourceRoot,'apps/api/src/production-main.ts','export {describe} from "./postgres-read-api.ts"; export * as execution from "../../../packages/application/src/unified-import-execution.ts"; export * as profile from "../../../packages/application/src/unified-import-whole-package-profile.ts";');
 await put(f.sourceRoot,'apps/api/src/postgres-read-api.ts','import {describeFresh35OrdinaryAdmissionV2} from "../../../tools/unified-import/fresh35-host-session.mjs"; export const describe=describeFresh35OrdinaryAdmissionV2;');
 f.options.sourceCommit=await commitFixtureTree(f.sourceRoot);f.options.native35ReferenceDirectory=reference;
 const receipt=await buildProduction(f.options);assert.equal(receipt.status,'REAL_BUILD_AND_PACK_CONTRACT_VALIDATED');
 const opts={sourceManifest:path.join(f.options.manifestDirectory,'source-manifest.json'),buildManifest:path.join(f.options.manifestDirectory,'build-manifest.json'),buildRoot:f.options.buildRoot};
 const build=JSON.parse(await readFile(opts.buildManifest)),backend=await readFile(path.join(opts.buildRoot,'backend/production-main.js'),'utf8');
 assert.ok(backend.includes('./native35-source/tools/unified-import/fresh35-host-session.mjs'));
 assert.ok(backend.includes('./native35-source/scripts/release/unified-install/whole-sales-admission-v1.mjs'));
 const backendGraph=JSON.parse(await readFile(path.join(opts.buildRoot,'backend/metafile.json')));
 for(const name of ['packages/application/src/unified-import-execution.ts','packages/application/src/unified-import-whole-package-profile.ts'])assert.ok(Object.hasOwn(backendGraph.inputs,name),'actual production application consumer participates');
 for(const name of ['scripts/release/unified-install/whole-sales-admission-v1.mjs','tools/unified-import/whole-host-session.mjs','tools/unified-import/fresh35-host-session.mjs'])assert.ok(!Object.hasOwn(backendGraph.inputs,name),'physical proof module must retain the original native URL');
 const native=build.files.filter(r=>r.role==='native35');assert.equal(native.length,closure.pins.length);
 for(const row of native){const original=await readFile(path.join(repository,row.sourcePath));assert.equal(row.sha256,createHash('sha256').update(original).digest('hex'));assert.deepEqual(await readFile(path.join(opts.buildRoot,row.path)),original);}
 const nativeRoot=path.join(opts.buildRoot,'backend/native35-source');
 const {pathToFileURL}=await import('node:url');
 const copiedProducer=await import(pathToFileURL(path.join(nativeRoot,'scripts/release/unified-install/fresh35-combined-source-v1.mjs')).href);
 const referencePaths=await copiedProducer.resolveFresh35ReferenceInputPaths(reference);
 const copiedDescriptor=copiedProducer.describeFresh35CombinedSource(await copiedProducer.loadFresh35CombinedSource(nativeRoot,referencePaths));
 assert.equal(copiedDescriptor.sourceSetSha256,build.native35.closure.sourceSetSha256,'relocated raw modules reconstruct the exact original source set');
 const copiedHost=await import(pathToFileURL(path.join(nativeRoot,'tools/unified-import/fresh35-host-session.mjs')).href);
 assert.throws(()=>copiedHost.describeFresh35OrdinaryAdmissionV2({}),/ACTIVE_ADMISSION/);
 const pack=await packRelease({...opts,out:path.join(f.root,'packed')});assert.equal(pack.status,'PACKED_AND_EXTRACTED_READBACK_MATCH');
 const {spawnSync}=await import('node:child_process');
 const python=`import json,sys,runpy,copy,hashlib
D=runpy.run_path('scripts/release/deploy-candidate.py');v=json.load(sys.stdin);source=v['source'];manifest=v['manifest'];m=D['native35_member_map'](manifest,source)
assert len(m)==len(source['currentSourcePins'])
try:D['member_allowed'](next(iter(m)))
except D['Refused']:pass
else:raise AssertionError('missing native binding accepted')
for n in m:D['member_allowed'](n,nativeMembers=m)
a,b=D['verified_archive'](v['archive'],v['manifestRef'],v['buildId'],v['commit'],source)
assert len(b)==len(manifest['members'])+1
for edit in ['missing','bytes','extra','escape','role','readkind']:
 bad=copy.deepcopy(manifest);row=next(x for x in bad['members'] if x.get('role')=='native35')
 if edit=='missing':bad['members'].remove(row)
 if edit=='bytes':row['sha256']='0'*64
 if edit=='extra':x=copy.deepcopy(row);x['path']+='extra';x['sourcePath']='tools/unified-import/extra.mjs';bad['members'].append(x)
 if edit=='escape':row['path']='backend/native35-source/../escape.ts'
 if edit=='role':row['role']='backend'
 if edit=='readkind':row=next(x for x in bad['members'] if x.get('native35Kind')=='proof-read');row['native35Kind']='module'
 try:D['native35_member_map'](bad,source)
 except D['Refused']:pass
 else:raise AssertionError(edit)
# An internally rehashed descriptor cannot widen the exact two fixture exception.
bad=copy.deepcopy(manifest);s=copy.deepcopy(source);s['currentSourcePins'].append({'path':'tests/fixtures/unified-import/extra.ts','sha256':'0'*64});keys=('format','baseArtifacts','capturedSourcePins','currentSourcePins','currentSourceDelta','patches');s['sourceSetSha256']=hashlib.sha256(json.dumps({k:s[k] for k in keys},ensure_ascii=False,separators=(',',':')).encode()).hexdigest();bad['native35']['sourceSetSha256']=s['sourceSetSha256'];bad['native35']['pins']=s['currentSourcePins']
try:D['native35_member_map'](bad,s)
except D['Refused']:pass
else:raise AssertionError('additional fixture accepted')
print('ACTUAL_HELPER_ARCHIVE_AND_CLOSED_NATIVE_MEMBERS_PASS')`;
 const release=JSON.parse(await readFile(path.join(f.root,'packed/release-manifest.json')));
 const checked=spawnSync('python3',['-B','-c',python],{cwd:repository,encoding:'utf8',input:JSON.stringify({source:copiedDescriptor,manifest:release,archive:{path:path.join(f.root,'packed/release.tar.gz'),sha256:pack.archive.sha256,bytes:pack.archive.bytes},manifestRef:{path:path.join(f.root,'packed/release-manifest.json'),sha256:pack.manifestSha256},buildId:release.buildId,commit:release.sourceCommit})});
 assert.equal(checked.status,0,checked.stderr);assert.match(checked.stdout,/ACTUAL_HELPER_ARCHIVE_AND_CLOSED_NATIVE_MEMBERS_PASS/);

 const base=JSON.stringify(build);const save=async value=>writeFile(opts.buildManifest,JSON.stringify(value));
 const missing=JSON.parse(base);missing.files=missing.files.filter(r=>r.path!==native[0].path);await save(missing);await assert.rejects(validateRelease(opts));await save(build);
 const row=native.find(r=>r.sourcePath==='tools/unified-import/fresh35-host-session.mjs'),member=path.join(opts.buildRoot,row.path),original=await readFile(member);
 await writeFile(member,Buffer.concat([original,Buffer.from('\n// changed')]));await assert.rejects(validateRelease(opts));await writeFile(member,original);
 const {rename,unlink}=await import('node:fs/promises');await rename(member,member+'.original');await symlink(member+'.original',member);
 await assert.rejects(validateRelease(opts));await unlink(member);await rename(member+'.original',member);
 for(const sourcePath of ['../escape.ts','tests/fixtures/unified-import/extra.ts']){const bad=JSON.parse(base);bad.files.find(r=>r.path===row.path).sourcePath=sourcePath;await save(bad);await assert.rejects(validateRelease(opts));}await save(build);
 const graphRow=build.files.find(r=>r.path==='backend/metafile.json'),graphPath=path.join(opts.buildRoot,graphRow.path),graphBytes=await readFile(graphPath);const graph=JSON.parse(graphBytes);
 for(const output of Object.values(graph.outputs))for(const item of output.imports)if(item.external&&item.path.startsWith('./native35-source/'))item.path='./arbitrary.mjs';
 const changed=Buffer.from(JSON.stringify(graph));await writeFile(graphPath,changed);const bad=JSON.parse(base);Object.assign(bad.files.find(r=>r.path===graphRow.path),{bytes:changed.length,sha256:createHash('sha256').update(changed).digest('hex')});await save(bad);await assert.rejects(validateRelease(opts));await writeFile(graphPath,graphBytes);await save(build);
 const fixturePin=closure.pins.find(p=>p.path==='tests/fixtures/unified-import/synthetic-package.ts');
 const fixturePath=path.join(f.sourceRoot,fixturePin.path),fixtureBytes=await readFile(fixturePath);await writeFile(fixturePath,Buffer.concat([fixtureBytes,Buffer.from('\n// mixed version')]));
 await assert.rejects(native35Closure(f.sourceRoot,reference),/FIXTURE_BYTES/);await writeFile(fixturePath,fixtureBytes);
 // The omitted real callers are registered individually; another API caller cannot borrow that boundary.
 await put(f.sourceRoot,'apps/api/src/postgres-read-api.ts','export {assertWholeSalesAdmissionV1 as describe} from "../../../scripts/release/unified-install/whole-sales-admission-v1.mjs";');
 const rejected={...f.options,sourceCommit:await commitFixtureTree(f.sourceRoot),buildRoot:path.join(f.root,'wrong-caller-build'),manifestDirectory:path.join(f.root,'wrong-caller-manifests')};
 await assert.rejects(buildProduction(rejected),/NATIVE35_EXACT_BOUNDARY_REQUIRED/);
});
