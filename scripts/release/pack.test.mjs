import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, symlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packRelease } from './pack.mjs';
import { sha256, validateRelease } from './manifest.mjs';

const configured = process.env.PACK_TEST_ROOT;
const testParent = configured ? path.resolve(configured) : await realpath(os.tmpdir());
if (configured) await mkdir(testParent, { recursive: false, mode: 0o700 });
const temporary = await mkdtemp(path.join(testParent, 'release-pack-tools-'));
const sourceCommit = 'a'.repeat(40);
const record = (name, bytes, extra = {}) => ({ path: name, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes), ...extra });
async function put(root, name, bytes) { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), bytes); }
async function fixture(name) {
  const root = path.join(temporary, name), sourceRoot = path.join(root, 'source'), buildRoot = path.join(root, 'build');
  await mkdir(sourceRoot, { recursive: true }); await mkdir(buildRoot);
  const sourceData = {
    'package.json': JSON.stringify({ name: 'tool-only-fixture', private: true, type: 'module', dependencies: {} }),
    'package-lock.json': JSON.stringify({ name: 'tool-only-fixture', lockfileVersion: 3, packages: { '': { dependencies: {} } } }),
    'adapters/postgres/migrations/0001_initial.sql': 'CREATE SCHEMA release_tool_fixture;\n',
    'apps/web/src/production-host/entry.ts': 'export const toolFixture = 1;\n',
    'apps/api/src/production-main.ts': 'export const toolFixture = 2;\n',
    'scripts/build.mjs': '/* TOOL ONLY: tiny graph fixture; no actual ERP build or service. */\n',
  };
  for (const [name, bytes] of Object.entries(sourceData)) await put(sourceRoot, name, bytes);
  const source = { format: 'naijue-release-source-v1', buildId: 'tool-check-1', sourceCommit, sourceRoot,
    files: Object.entries(sourceData).map(([name, bytes]) => record(name, bytes)) };
  const configuration = { kind: 'naijue-erp-production-host', http: { origin: 'https://1n5635n614.goho.co', basePath: '/api' },
    assets: { basePath: '/assets/tool-check-1/' }, session: { verifyOnMount: true } };
  const buildData = {
    'web/application.js': 'export const toolFixture = 1;\n',
    'backend/production-main.js': 'export const toolFixture = 2;\n',
    'web/index.html': `<html><script id="naijue-erp-production-configuration" type="application/json">${JSON.stringify({ configuration })}</script><script type="module" src="https://1n5635n614.goho.co/assets/tool-check-1/application.js"></script></html>`,
    'package.json': sourceData['package.json'], 'package-lock.json': sourceData['package-lock.json'],
    'migrations/0001_initial.sql': sourceData['adapters/postgres/migrations/0001_initial.sql'],
  };
  const components = {};
  for (const [kind, entrySource, entryOutput] of [
    ['frontend', 'apps/web/src/production-host/entry.ts', 'web/application.js'],
    ['backend', 'apps/api/src/production-main.ts', 'backend/production-main.js'],
  ]) {
    const outputKey = path.relative(sourceRoot, path.join(buildRoot, entryOutput)).split(path.sep).join('/');
    const graph = { inputs: { [entrySource]: { bytes: Buffer.byteLength(sourceData[entrySource]), imports: [] } },
      outputs: { [outputKey]: { bytes: Buffer.byteLength(buildData[entryOutput]), entryPoint: entrySource,
        imports: [], inputs: { [entrySource]: { bytesInOutput: Buffer.byteLength(buildData[entryOutput]) } } } } };
    const metafile = `evidence/${kind}-metafile.json`; buildData[metafile] = JSON.stringify(graph);
    components[kind] = { workingDirectory: '.', entrySource, entryOutput, metafile,
      inputs: [source.files.find(row => row.path === entrySource)] };
  }
  const build = { format: 'naijue-release-build-v1', buildId: source.buildId, sourceCommit, components,
    files: Object.entries(buildData).map(([name, bytes]) => {
      const role = name.startsWith('web/') ? 'frontend' : name.startsWith('backend/') ? 'backend'
        : name.startsWith('migrations/') ? 'migration' : name.startsWith('evidence/') ? 'evidence' : 'metadata';
      return record(name, bytes, { role, member: role === 'evidence' ? null : name,
        ...(role === 'migration' ? { sourcePath: 'adapters/postgres/migrations/0001_initial.sql' }
          : role === 'metadata' ? { sourcePath: name } : name.endsWith('.html') ? { producerInputs: ['scripts/build.mjs'] } : {}) });
    }) };
  const options = { sourceManifest: path.join(root, 'source-manifest.json'), buildManifest: path.join(root, 'build-manifest.json'), buildRoot, out: path.join(root, 'release') };
  async function save() {
    await writeFile(options.sourceManifest, JSON.stringify(source)); await writeFile(options.buildManifest, JSON.stringify(build));
    for (const [name, bytes] of Object.entries(buildData)) await put(buildRoot, name, bytes);
  }
  await save(); return { options, root, sourceRoot, buildRoot, source, build, sourceData, buildData, save };
}
const rejects = async (f, code) => assert.rejects(packRelease(f.options), error => error.code === code);

test('tiny tool fixture packs, extracts once, verifies members and refuses overwrite', async () => {
  const f = await fixture('normal');
  const script = fileURLToPath(new URL('./pack.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, '--source-manifest', f.options.sourceManifest, '--build-manifest', f.options.buildManifest,
    '--build-root', f.options.buildRoot, '--out', f.options.out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stderr, ''); const result = JSON.parse(run.stdout);
  assert.equal(result.status, 'PACKED_AND_EXTRACTED_READBACK_MATCH'); assert.equal(result.archiveExtractions, 1);
  assert.equal(result.businessOrProductionValidation, false); assert.equal(result.deploymentExecuted, false);
  const bytes = await readFile(path.join(f.options.out, 'release.tar.gz')); assert.equal(sha256(bytes), result.archive.sha256);
  const manifest = JSON.parse(await readFile(path.join(f.options.out, 'release-manifest.json')));
  assert.equal(manifest.sourceCommit, sourceCommit); assert.equal(manifest.members.length, 6);
  assert(!manifest.members.some(row => row.path.includes('evidence')));
  await rejects(f, 'OUTPUT_EXISTS_NO_OVERWRITE');
});
test('member traversal cannot escape the fresh output', async () => {
  const f = await fixture('traversal'); f.build.files[0].member = '../outside.js'; await f.save(); await rejects(f, 'UNSAFE_RELATIVE_PATH');
});
test('post-build member renaming cannot break a graph import in the archive', async () => {
  const f = await fixture('renamed-output'); f.build.files.find(row => row.path === 'web/application.js').member = 'web/renamed.js';
  await f.save(); await rejects(f, 'MEMBER_RELOCATION_FORBIDDEN');
});
test('secret filename is rejected even when hash-listed', async () => {
  const f = await fixture('secret-name'); f.build.files.push(record('web/session.key', 'NO_REAL_SECRET', { role: 'frontend', member: 'web/session.key' }));
  f.buildData['web/session.key'] = 'NO_REAL_SECRET'; await f.save(); await rejects(f, 'NON_RELEASE_MEMBER');
});
test('credential-bearing content cannot be smuggled under a JS filename', async () => {
  const f = await fixture('secret-body'); const name = 'web/application.js'; f.buildData[name] += '\n// postgres://tool_user:tool_value@example.invalid/db';
  Object.assign(f.build.files.find(row => row.path === name), record(name, f.buildData[name])); await f.save(); await rejects(f, 'SECRET_MATERIAL_FORBIDDEN');
});
test('credential-valued JSON is rejected even with a generated-output producer', async () => {
  const f = await fixture('json-secret'), name = 'web/configuration.json';
  f.buildData[name] = JSON.stringify({ password: 'TOOL_ONLY_NOT_A_REAL_SECRET' });
  f.build.files.push(record(name, f.buildData[name], { role: 'frontend', member: name, producerInputs: ['scripts/build.mjs'] }));
  await f.save(); await rejects(f, 'SECRET_MATERIAL_FORBIDDEN');
});
test('a production flag cannot replace actual metafile input graph', async () => {
  const f = await fixture('fake-production'); const name = f.build.components.frontend.metafile;
  f.buildData[name] = JSON.stringify({ production: true }); Object.assign(f.build.files.find(row => row.path === name), record(name, f.buildData[name]));
  await f.save(); await rejects(f, 'ACTUAL_METAFILE_REQUIRED');
});
test('a harness input hidden inside a metafile is rejected', async () => {
  const f = await fixture('synthetic-graph'), name = f.build.components.frontend.metafile;
  const graph = JSON.parse(f.buildData[name]), hidden = 'apps/web/unified-browser-harness/entry.ts';
  graph.inputs[hidden] = { bytes: 0, imports: [] }; f.buildData[name] = JSON.stringify(graph);
  Object.assign(f.build.files.find(row => row.path === name), record(name, f.buildData[name]));
  await f.save(); await rejects(f, 'NON_PRODUCTION_SOURCE');
});
test('an undeclared disk artifact breaks the full member set', async () => {
  const f = await fixture('unlisted'); await put(f.buildRoot, 'web/extra.js', 'extra'); await rejects(f, 'UNLISTED_BUILD_MEMBERS');
});
test('an extra hash-listed executable cannot bypass the actual output graph', async () => {
  const f = await fixture('ungraphed-js'), name = 'web/extra.js'; f.buildData[name] = 'export const extra = 1;';
  f.build.files.push(record(name, f.buildData[name], { role: 'frontend', member: name, producerInputs: ['scripts/build.mjs'] }));
  await f.save(); await rejects(f, 'EXECUTABLE_OUTPUT_MISSING_FROM_GRAPH');
});
test('source mutation invalidates the frozen graph', async () => {
  const f = await fixture('source-hash'); await put(f.sourceRoot, 'apps/api/src/production-main.ts', 'changed'); await rejects(f, 'FILE_HASH_MISMATCH');
});
test('symlinked build input is rejected before packing', async () => {
  const f = await fixture('symlink'); await symlink(path.join(f.buildRoot, 'web/application.js'), path.join(f.buildRoot, 'web/extra.js'));
  await rejects(f, 'SYMLINK_FORBIDDEN');
});
test('new migration on disk cannot be omitted from the source freeze', async () => {
  const f = await fixture('migration'); await put(f.sourceRoot, 'adapters/postgres/migrations/0002_extra.sql', '-- extra'); await rejects(f, 'SOURCE_MIGRATION_DIRECTORY_INCOMPLETE');
});
test('mixed build/source identities are rejected', async () => {
  const f = await fixture('mixed-identity'); f.build.sourceCommit = 'b'.repeat(40); await f.save(); await rejects(f, 'SOURCE_BUILD_IDENTITY_MISMATCH');
});
test('CLI returns a nonzero clean code for missing actual manifests', async () => {
  const f = await fixture('missing-cli');
  const script = fileURLToPath(new URL('./pack.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, '--source-manifest', path.join(f.root, 'missing.json'), '--build-manifest', path.join(f.root, 'missing-build.json'), '--build-root', f.buildRoot, '--out', f.options.out], { encoding: 'utf8' });
  assert.equal(run.status, 1); assert.equal(run.stdout, ''); assert.match(run.stderr, /^RELEASE_PACK_FAILED\n$/);
});
test('HTML resource closure rejects the QB external-script counterexample and alternate attribute syntax', async () => {
  for (const [label, tag] of [
    ['single', "<script src='https://outside.invalid/unlisted.js'></script>"],
    ['uppercase', '<SCRIPT TYPE="module" SRC="https://outside.invalid/unlisted.js"></SCRIPT>'],
    ['unquoted', '<script type=module src=https://outside.invalid/unlisted.js></script>'],
  ]) {
    const f = await fixture('html-external-' + label), name = 'web/index.html';
    f.buildData[name] = f.buildData[name].replace('</html>', tag + '</html>');
    Object.assign(f.build.files.find(row => row.path === name), record(name, f.buildData[name])); await f.save();
    await assert.rejects(validateRelease(f.options), error => error.code === 'HTML_RESOURCE_OUTSIDE_RELEASE');
  }
});
test('HTML resource closure preserves canonical and alternate same-origin member references', async () => {
  for (const [label, src] of [
    ['canonical', 'src="https://1n5635n614.goho.co/assets/tool-check-1/application.js"'],
    ['single', "src='https://1n5635n614.goho.co/assets/tool-check-1/application.js'"],
    ['uppercase', 'SRC = "https://1n5635n614.goho.co/assets/tool-check-1/application.js"'],
    ['unquoted', 'src=https://1n5635n614.goho.co/assets/tool-check-1/application.js'],
  ]) {
    const f = await fixture('html-legal-' + label), name = 'web/index.html';
    f.buildData[name] = f.buildData[name].replace('src="https://1n5635n614.goho.co/assets/tool-check-1/application.js"', src);
    Object.assign(f.build.files.find(row => row.path === name), record(name, f.buildData[name])); await f.save();
    assert.equal((await validateRelease(f.options)).manifest.buildId, 'tool-check-1');
  }
});
test('design-token source policy accepts only the two registered production CSS sources', async () => {
  for (const [label, name] of [
    ['selection', 'apps/web/src/demo-controls/idle-selection-tokens.css'],
    ['presentation', 'apps/web/src/demo-presentation/tokens.css'],
  ]) {
    const f = await fixture('design-css-' + label), bytes = ':root { --tool-design-color: #123456; }\n';
    f.source.files.push(record(name, bytes)); await put(f.sourceRoot, name, bytes); await f.save();
    assert.equal((await validateRelease(f.options)).manifest.buildId, 'tool-check-1');
  }
});
test('design-token source policy still rejects token data and unregistered token directories or CSS', async () => {
  for (const [index, name] of [
    'apps/web/src/demo-presentation/tokens.json',
    'apps/web/src/demo-controls/idle-selection-tokens.json',
    'apps/web/src/demo-controls/tokens/session.css',
    'apps/web/src/demo-presentation/secrets/tokens.css',
    'apps/web/src/demo-presentation/tokens.css.json',
    'apps/web/src/demo-controls/idle-selection-tokens.backup.css',
  ].entries()) {
    const f = await fixture('design-token-data-' + index), bytes = '{}\n';
    f.source.files.push(record(name, bytes)); await put(f.sourceRoot, name, bytes); await f.save();
    await assert.rejects(validateRelease(f.options), error => error.code === 'NON_PRODUCTION_SOURCE');
  }
});
test('package dependency identity ignores key order but rejects missing extra and changed exact versions', async () => {
  for (const scenario of ['reordered', 'missing', 'extra', 'version']) {
    const f = await fixture('dependency-identity-' + scenario);
    const pkg = JSON.parse(f.sourceData['package.json']), lock = JSON.parse(f.sourceData['package-lock.json']);
    pkg.dependencies = { fastify: '5.12.5', pg: '8.23.1', react: '19.1.1', 'react-dom': '19.1.1', '@arco-design/web-react': '2.66.16' };
    lock.packages[''].dependencies = { '@arco-design/web-react': '2.66.16', fastify: '5.12.5', pg: '8.23.1', react: '19.1.1', 'react-dom': '19.1.1' };
    if (scenario === 'missing') delete lock.packages[''].dependencies.pg;
    if (scenario === 'extra') lock.packages[''].dependencies.unexpected = '1.0.0';
    if (scenario === 'version') lock.packages[''].dependencies.react = '19.1.0';
    for (const [name, value] of [['package.json', pkg], ['package-lock.json', lock]]) {
      const bytes = JSON.stringify(value); f.sourceData[name] = bytes; f.buildData[name] = bytes;
      Object.assign(f.source.files.find(row => row.path === name), record(name, bytes));
      Object.assign(f.build.files.find(row => row.path === name), record(name, bytes));
      await put(f.sourceRoot, name, bytes);
    }
    await f.save();
    if (scenario === 'reordered') assert.equal((await validateRelease(f.options)).manifest.buildId, 'tool-check-1');
    else await assert.rejects(validateRelease(f.options), error => error.code === 'PACKAGE_LOCK_IDENTITY_MISMATCH');
  }
});
