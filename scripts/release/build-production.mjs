#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boundedFile, canonicalAbsolute, checkedRecord, matches, readJson, relativeName, requireRelease, sha256, validateRelease, walkFiles, runtimeSqlPatches, ReleaseError } from './manifest.mjs';

const FRONTEND_BUILDER = 'apps/web/demo-replica/build-production-host.mjs';
const FRONTEND_ENTRY = 'apps/web/demo-replica/frontend/production-bootstrap.ts';
const BACKEND_ENTRY = 'apps/api/src/production-main.ts';
const COMMIT_PROOF = '.release-source-commit';
const forbiddenGraph = /unified-browser-harness|new-document-browser-harness|management-browser-harness|visual-acceptance-host|development-host|local-https-application-host|fixture|synthetic|(?:^|\/)(?:tests?|test-support)(?:\/|$)|\.(?:test|spec)\./i;
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const within = (parent, child) => child === parent || child.startsWith(parent + path.sep);
const gitHash = (type, bytes) => createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');

/** No Git process or working-tree assertion: independently hash an exported Git tree and its raw commit object. */
export async function verifySourceExport(sourceRoot, sourceCommit) {
  await canonicalAbsolute(sourceRoot, 'directory');
  requireRelease(/^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'EXACT_SOURCE_COMMIT_REQUIRED');
  const proofPath = path.join(sourceRoot, COMMIT_PROOF);
  await canonicalAbsolute(proofPath, 'file');
  const proofInfo = await lstat(proofPath);
  requireRelease(proofInfo.size <= 1024 * 1024 && proofInfo.nlink === 1, 'BOUNDED_COMMIT_OBJECT_REQUIRED');
  const commit = await readFile(proofPath);
  requireRelease(gitHash('commit', commit) === sourceCommit, 'RAW_COMMIT_OBJECT_HASH_MISMATCH');
  const treeMatch = commit.toString('utf8').match(/^tree ([a-f0-9]{40})\n/);
  requireRelease(treeMatch, 'RAW_COMMIT_TREE_REQUIRED');
  const records = new Map(); let bytesRead = 0, fileCount = 0;
  async function tree(directory, prefix) {
    const entries = [];
    for (const name of await readdir(directory)) {
      requireRelease(!/[\\\x00-\x1f\x7f]/.test(name), 'UNSAFE_EXPORTED_FILENAME');
      if (!prefix && [COMMIT_PROOF, 'node_modules'].includes(name)) continue;
      requireRelease(name !== '.git', 'WORKING_CHECKOUT_NOT_A_FIXED_EXPORT');
      requireRelease(!/^\.env(?:\.|$)/i.test(name) && !/\.(?:pem|key|pgpass|p12|pfx)$/i.test(name), 'SECRET_IN_SOURCE_EXPORT');
      const filename = path.join(directory, name), info = await lstat(filename), relative = prefix + name;
      requireRelease(!info.isSymbolicLink(), 'SYMLINK_IN_SOURCE_EXPORT');
      if (info.isDirectory()) entries.push({ name, mode: '40000', hash: await tree(filename, relative + '/'), directory: true });
      else {
        requireRelease(info.isFile() && info.nlink === 1 && info.size <= 64 * 1024 * 1024, 'REGULAR_BOUNDED_EXPORT_FILE_REQUIRED');
        const bytes = await readFile(filename), after = await lstat(filename);
        requireRelease(bytes.length === info.size && after.ino === info.ino && after.dev === info.dev && after.mtimeMs === info.mtimeMs, 'SOURCE_EXPORT_CHANGED');
        bytesRead += bytes.length; fileCount++;
        requireRelease(bytesRead <= 512 * 1024 * 1024 && fileCount <= 20000, 'SOURCE_EXPORT_LIMIT');
        const mode = info.mode & 0o111 ? '100755' : '100644';
        entries.push({ name, mode, hash: gitHash('blob', bytes), directory: false });
        records.set(relative, { path: relative, bytes: bytes.length, sha256: sha256(bytes), mode });
      }
    }
    // Git compares directory names as if they end in '/', using byte ordering rather than locale ordering.
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? '/' : '')), Buffer.from(b.name + (b.directory ? '/' : ''))));
    return gitHash('tree', Buffer.concat(entries.map(entry => Buffer.concat([Buffer.from(`${entry.mode} ${entry.name}\0`), Buffer.from(entry.hash, 'hex')]))));
  }
  const actualTree = await tree(sourceRoot, '');
  requireRelease(actualTree === treeMatch[1], 'COMMIT_TREE_MISMATCH_NO_WIP_LABEL');
  return { records, tree: actualTree, commitObjectSha256: sha256(commit), files: fileCount, bytes: bytesRead };
}
async function freshDirectory(filename, sourceRoot) {
  requireRelease(typeof filename === 'string' && path.isAbsolute(filename) && path.normalize(filename) === filename, 'ABSOLUTE_FRESH_BUILD_PATH_REQUIRED');
  await canonicalAbsolute(path.dirname(filename), 'directory');
  let exists = false;
  try { await lstat(filename); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  requireRelease(!exists, 'BUILD_OUTPUT_EXISTS_NO_OVERWRITE');
  requireRelease(!within(sourceRoot, filename) && !within(filename, sourceRoot), 'SOURCE_BUILD_OVERLAP_FORBIDDEN');
}
function assertGraphName(name) { relativeName(name); requireRelease(!forbiddenGraph.test(name), 'NON_PRODUCTION_BUILD_GRAPH'); }
function resolveGraphName(sourceRoot, workingDirectory, name) {
  requireRelease(typeof name === 'string' && name.length > 0 && !/[\\\x00-\x1f\x7f]/.test(name) && !name.startsWith('<'), 'VIRTUAL_OR_UNSAFE_GRAPH_INPUT');
  const relative = path.relative(sourceRoot, path.resolve(sourceRoot, workingDirectory, name)).split(path.sep).join('/');
  assertGraphName(relative); return relative;
}
async function lockedDependencies(sourceRoot) {
  await canonicalAbsolute(path.join(sourceRoot, 'node_modules'), 'directory');
  const packageRead = await readJson(path.join(sourceRoot, 'package.json'));
  const lockRead = await readJson(path.join(sourceRoot, 'package-lock.json'));
  // npm's installed lock is a protected input reference, not a release member.
  const installedPath = path.join(sourceRoot, 'node_modules/.package-lock.json');
  await canonicalAbsolute(installedPath, 'file');
  const installedBytes = await readFile(installedPath);
  requireRelease(installedBytes.length <= 8 * 1024 * 1024, 'INSTALLED_LOCK_LIMIT');
  const installed = JSON.parse(installedBytes), lock = lockRead.value;
  requireRelease(lock.lockfileVersion >= 3 && installed.lockfileVersion >= 3 && packageRead.value.devDependencies?.esbuild
    && lock.packages?.['node_modules/esbuild']?.version === packageRead.value.devDependencies.esbuild, 'LOCKED_ESBUILD_REQUIRED');
  const verified = new Map();
  async function checkInput(name) {
    if (!name.startsWith('node_modules/')) return;
    const segments = name.split('/'); let index = 0, packageDirectory;
    while (index < segments.length) {
      if (segments[index] === 'node_modules' && segments[index + 1]) {
        index += segments[index + 1].startsWith('@') ? 3 : 2;
        packageDirectory = segments.slice(0, index).join('/');
      } else index++;
    }
    requireRelease(packageDirectory && lock.packages?.[packageDirectory] && installed.packages?.[packageDirectory], 'UNLOCKED_BUILD_DEPENDENCY');
    if (verified.has(packageDirectory)) return;
    const expected = lock.packages[packageDirectory], observed = installed.packages[packageDirectory];
    requireRelease(['version', 'resolved', 'integrity'].every(key => expected[key] === observed[key]), 'INSTALLED_DEPENDENCY_LOCK_MISMATCH');
    const pkg = JSON.parse(await boundedFile(sourceRoot, packageDirectory + '/package.json'));
    requireRelease(pkg.version === expected.version, 'INSTALLED_DEPENDENCY_VERSION_MISMATCH');
    verified.set(packageDirectory, { path: packageDirectory, version: expected.version, integrity: expected.integrity ?? null });
  }
  await checkInput('node_modules/esbuild/lib/main.js');
  const native = `node_modules/@esbuild/${process.platform}-${process.arch}`;
  await checkInput(native + '/bin/esbuild');
  const binary = await boundedFile(sourceRoot, native + '/bin/esbuild');
  return { checkInput, lockSha256: lockRead.sha256, installedLockSha256: sha256(installedBytes), verified,
    esbuildBinary: { path: native + '/bin/esbuild', bytes: binary.length, sha256: sha256(binary) } };
}
function checkPublicConfiguration(value) {
  requireRelease(value?.kind === 'naijue-erp-production-host' && value.http?.origin === 'https://1n5635n614.goho.co'
    && value.http?.basePath === '/api' && value.session?.verifyOnMount === true, 'EXPLICIT_PRODUCTION_PUBLIC_CONFIGURATION_REQUIRED');
  const walk = object => {
    if (!object || typeof object !== 'object') return;
    for (const [key, item] of Object.entries(object)) {
      requireRelease(!/password|secret|private.?key|token|credential/i.test(key), 'SECRET_PUBLIC_CONFIGURATION_FORBIDDEN');
      walk(item);
    }
  }; walk(value);
}

/** Build only a verified fixed export. Does not execute the backend entry or start any application. */
export async function buildProduction(options) {
  const { sourceRoot, sourceCommit, buildId, publicConfig, buildRoot, manifestDirectory } = options;
  requireRelease(process.versions.node === '24.21.0', 'NODE_24_21_0_REQUIRED');
  requireRelease(!process.env.ESBUILD_BINARY_PATH && !process.env.NODE_OPTIONS, 'AMBIENT_BUILD_OVERRIDE_FORBIDDEN');
  requireRelease(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(buildId ?? ''), 'EXACT_BUILD_ID_REQUIRED');
  await canonicalAbsolute(sourceRoot, 'directory');
  await freshDirectory(buildRoot, sourceRoot); await freshDirectory(manifestDirectory, sourceRoot);
  requireRelease(!within(buildRoot, manifestDirectory) && !within(manifestDirectory, buildRoot), 'BUILD_MANIFEST_DIRECTORY_OVERLAP');
  const frozen = await verifySourceExport(sourceRoot, sourceCommit);
  const publicRead = await readJson(publicConfig); checkPublicConfiguration(publicRead.value);
  requireRelease(!within(buildRoot, publicConfig) && !within(manifestDirectory, publicConfig), 'PUBLIC_CONFIGURATION_OUTPUT_OVERLAP');
  const dependencies = await lockedDependencies(sourceRoot);
  const selected = new Map();
  async function select(name, expected) {
    assertGraphName(name); const bytes = await boundedFile(sourceRoot, name);
    const record = { path: name, bytes: bytes.length, sha256: sha256(bytes) };
    if (expected) { checkedRecord(expected); matches(bytes, expected); }
    if (name.startsWith('node_modules/')) await dependencies.checkInput(name);
    else { const original = frozen.records.get(name); requireRelease(original && original.sha256 === record.sha256 && original.bytes === record.bytes, 'BUILD_INPUT_NOT_IN_EXACT_COMMIT'); }
    const old = selected.get(name); requireRelease(!old || old.sha256 === record.sha256, 'BUILD_INPUT_CHANGED');
    selected.set(name, record); return record;
  }
  for (const name of [FRONTEND_BUILDER, FRONTEND_ENTRY, BACKEND_ENTRY,
    'apps/web/src/production-host/configuration.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'apps/web/tsconfig.json']) await select(name);
  await mkdir(buildRoot, { mode: 0o700 }); await mkdir(manifestDirectory, { mode: 0o700 });
  const frontend = await import(pathToFileURL(path.join(sourceRoot, FRONTEND_BUILDER)).href);
  requireRelease(typeof frontend.buildProductionHost === 'function', 'F1_PRODUCTION_BUILDER_REQUIRED');
  const web = await frontend.buildProductionHost({ configuration: publicRead.value, outdir: path.join(buildRoot, 'web'), sourceCheckpoint: sourceCommit });
  const webManifestRead = await readJson(path.join(buildRoot, 'web/production-build.json'));
  const webManifest = webManifestRead.value;
  requireRelease(webManifest.format === 'naijue-production-web-v1' && webManifest.sourceCheckpoint === sourceCommit
    && Array.isArray(webManifest.inputs) && Array.isArray(webManifest.outputs)
    && web?.manifest === 'production-build.json', 'F1_REAL_BUILD_RECEIPT_REQUIRED');
  for (const record of webManifest.inputs) await select(record.path, record);
  for (const record of webManifest.outputs) { checkedRecord(record); matches(await boundedFile(buildRoot, 'web/' + record.path), record); }
  const esbuild = await import(pathToFileURL(path.join(sourceRoot, 'node_modules/esbuild/lib/main.js')).href);
  await mkdir(path.join(buildRoot, 'backend'));
  const result = await esbuild.build({ absWorkingDir: sourceRoot, entryPoints: [BACKEND_ENTRY],
    outfile: path.join(buildRoot, 'backend/production-main.js'), bundle: true, packages: 'external', platform: 'node', target: 'node24',
    format: 'esm', metafile: true, sourcemap: false, logLevel: 'silent',
    plugins: [{ name: 'frozen-backend-inputs', setup(build) {
      build.onLoad({ filter: /\.(?:[cm]?js|tsx?|json)$/ }, async args => {
        const name = path.relative(sourceRoot, args.path).split(path.sep).join('/');
        await select(name); const contents = await boundedFile(sourceRoot, name);
        matches(contents, selected.get(name)); const extension = path.extname(name).slice(1);
        return { contents, loader: ['mjs', 'cjs'].includes(extension) ? 'js' : extension };
      });
    } }] });
  await writeFile(path.join(buildRoot, 'backend/metafile.json'), jsonBytes(result.metafile), { flag: 'wx' });
  const graphs = {}, graphOutputs = new Set();
  for (const [kind, workingDirectory, metafile, entrySource, entryOutput] of [
    ['frontend', '.', 'web/metafile.json', FRONTEND_ENTRY, 'web/application.js'],
    ['backend', '.', 'backend/metafile.json', BACKEND_ENTRY, 'backend/production-main.js'],
  ]) {
    const graph = (await readJson(path.join(buildRoot, metafile))).value, inputs = [];
    requireRelease(graph.inputs && graph.outputs, 'ACTUAL_ESBUILD_METAFILE_REQUIRED');
    for (const name of Object.keys(graph.inputs)) inputs.push(await select(resolveGraphName(sourceRoot, workingDirectory, name)));
    for (const name of Object.keys(graph.outputs)) {
      const relative = path.relative(buildRoot, path.resolve(sourceRoot, workingDirectory, name)).split(path.sep).join('/');
      relativeName(relative); graphOutputs.add(relative);
    }
    graphs[kind] = { workingDirectory, entrySource, entryOutput, metafile, inputs: inputs.sort((a, b) => a.path.localeCompare(b.path)) };
  }
  for (const name of frozen.records.keys()) {
    const patchMember = runtimeSqlPatches.get(name);
    if (!patchMember && !name.startsWith('adapters/postgres/migrations/')) continue;
    requireRelease(patchMember || /^adapters\/postgres\/migrations\/[0-9]{4}_[A-Za-z0-9_-]+\.sql$/.test(name), 'UNEXPECTED_MIGRATION_EXPORT_MEMBER');
    await select(name); const target = path.join(buildRoot, patchMember ?? 'migrations/' + path.basename(name));
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, await boundedFile(sourceRoot, name), { flag: 'wx' });
  }
  for (const name of ['package.json', 'package-lock.json']) await writeFile(path.join(buildRoot, name), await boundedFile(sourceRoot, name), { flag: 'wx' });
  const files = [];
  for (const name of await walkFiles(buildRoot)) {
    const bytes = await boundedFile(buildRoot, name);
    const role = ['web/metafile.json', 'web/metafile-raw.json', 'web/production-build.json', 'backend/metafile.json'].includes(name) ? 'evidence'
      : name.startsWith('web/') ? 'frontend' : name.startsWith('backend/') ? 'backend' : name.startsWith('migrations/') || [...runtimeSqlPatches.values()].includes(name) ? 'migration' : 'metadata';
    const record = { path: name, bytes: bytes.length, sha256: sha256(bytes), role, member: role === 'evidence' ? null : name };
    if (role === 'metadata') record.sourcePath = name;
    if (role === 'migration') record.sourcePath = [...runtimeSqlPatches].find(([, member]) => member === name)?.[0]
      ?? 'adapters/postgres/migrations/' + path.basename(name);
    if (role === 'frontend' && !graphOutputs.has(name)) {
      // Preserve provenance without manufacturing an esbuild output. The frozen pack contract decides whether this copy is allowed.
      const original = [...selected.values()].find(row => row.sha256 === record.sha256 && row.bytes === record.bytes);
      if (original) record.sourcePath = original.path;
      else record.producerInputs = [FRONTEND_BUILDER];
    }
    files.push(record);
  }
  const recheck = await verifySourceExport(sourceRoot, sourceCommit);
  requireRelease(recheck.tree === frozen.tree && recheck.commitObjectSha256 === frozen.commitObjectSha256, 'SOURCE_EXPORT_CHANGED_DURING_BUILD');
  for (const record of selected.values()) matches(await boundedFile(sourceRoot, record.path), record);
  requireRelease(sha256(await readFile(publicConfig)) === publicRead.sha256, 'PUBLIC_CONFIGURATION_CHANGED_DURING_BUILD');
  const source = { format: 'naijue-release-source-v1', buildId, sourceCommit, sourceRoot,
    files: [...selected.values()].sort((a, b) => a.path.localeCompare(b.path)) };
  const build = { format: 'naijue-release-build-v1', buildId, sourceCommit, publicConfigurationSha256: publicRead.sha256, components: graphs, files };
  const sourceManifest = path.join(manifestDirectory, 'source-manifest.json'), buildManifest = path.join(manifestDirectory, 'build-manifest.json');
  await writeFile(sourceManifest, jsonBytes(source), { flag: 'wx', mode: 0o600 });
  await writeFile(buildManifest, jsonBytes(build), { flag: 'wx', mode: 0o600 });
  await validateRelease({ sourceManifest, buildManifest, buildRoot });
  const receipt = { format: 'naijue-production-build-receipt-v1', status: 'REAL_BUILD_AND_PACK_CONTRACT_VALIDATED', buildId, sourceCommit,
    sourceTree: frozen.tree, sourceCommitObjectSha256: frozen.commitObjectSha256, fixedExportFiles: frozen.files,
    selectedSourceInputs: source.files.length, buildFiles: files.length, publicConfigurationSha256: publicRead.sha256,
    sourceManifestSha256: sha256(jsonBytes(source)), buildManifestSha256: sha256(jsonBytes(build)), node: process.versions.node,
    dependencies: { lockSha256: dependencies.lockSha256, installedLockSha256: dependencies.installedLockSha256,
      packages: [...dependencies.verified.values()], esbuildBinary: dependencies.esbuildBinary },
    buildOnly: true, runtimeApplicationStarted: false, deploymentExecuted: false, businessValidation: false };
  await writeFile(path.join(manifestDirectory, 'build-receipt.json'), jsonBytes(receipt), { flag: 'wx', mode: 0o600 });
  return receipt;
}

export async function main(args) {
  const names = new Map([['--source-root', 'sourceRoot'], ['--source-commit', 'sourceCommit'], ['--build-id', 'buildId'],
    ['--public-config', 'publicConfig'], ['--build-root', 'buildRoot'], ['--manifest-dir', 'manifestDirectory']]);
  requireRelease(args.length === 12, 'BUILD_USAGE'); const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = names.get(args[index]); requireRelease(key && !Object.hasOwn(options, key) && typeof args[index + 1] === 'string', 'BUILD_USAGE'); options[key] = args[index + 1];
  }
  return buildProduction(options);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(await main(process.argv.slice(2))) + '\n'); }
  catch (error) {
    process.stderr.write((error instanceof ReleaseError ? error.code : 'PRODUCTION_BUILD_FAILED') + '\n');
    if (error?.code === 'BUILD_USAGE') process.stderr.write('Usage: node scripts/release/build-production.mjs --source-root ABS_FIXED_EXPORT --source-commit FULL_SHA --build-id UNIQUE_ID --public-config ABS_PUBLIC_JSON --build-root ABS_FRESH_DIRECTORY --manifest-dir ABS_FRESH_DIRECTORY\n');
    process.exitCode = 1;
  }
}
