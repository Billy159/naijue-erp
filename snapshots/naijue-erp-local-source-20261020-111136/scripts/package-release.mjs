import {spawnSync} from 'node:child_process';
import {readFileSync, copyFileSync, mkdirSync, mkdtempSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {root, safeFile, sha256, fileRecords, writeJson} from './files.mjs';
import {assertReleasePath} from './release-policy.mjs';
import {evidenceTask, releaseDirectory} from './task-artifacts.mjs';

writeJson(resolve(releaseDirectory, 'verification.json'), {status: 'RUNNING', productionReady: false});
writeJson(resolve(releaseDirectory, 'package-status.json'), {status: 'RUNNING', productionReady: false});
try {
await import('./check-toolchain.mjs');
const dist = resolve(root, 'dist');
const built = JSON.parse(readFileSync(safeFile(dist, 'build-manifest.json'), 'utf8'));
if (built.task !== evidenceTask) throw new Error('Rebuild using the same ERP_TASK_ID before packaging');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (built.lockSha256 !== sha256(readFileSync(resolve(root, 'package-lock.json')))
  || built.packageSha256 !== sha256(readFileSync(resolve(root, 'package.json')))
  || built.publicationPolicySha256 !== sha256(readFileSync(resolve(root, 'config/frontend-release.json')))
  || !same(built.backendSources, fileRecords(resolve(root, 'server')))
  || !same(built.backendOutput, fileRecords(resolve(dist, 'server')))
  || !same(built.frontendSources, fileRecords(resolve(root, 'frontend')).filter(f => !f.path.startsWith('verification/')))) throw new Error('Build inputs or backend outputs changed. Rebuild before packaging.');
const front = JSON.parse(readFileSync(safeFile(dist, 'frontend-manifest.json'), 'utf8'));
if (built.frontendManifestSha256 !== sha256(readFileSync(resolve(dist, 'frontend-manifest.json')))
  || !same(front.files, fileRecords(resolve(dist, 'web')))) throw new Error('Frontend build output changed. Rebuild before packaging.');
mkdirSync(resolve(root, 'work/releases'), {recursive: true});
const staging = mkdtempSync(resolve(root, `work/releases/${evidenceTask.toLowerCase()}-`));
const allowed = [
  ...front.files.map(f => 'web/' + f.path), ...built.backendOutput.map(f => 'server/' + f.path),
  'build-manifest.json', 'frontend-manifest.json',
];
for (const file of allowed) {
  assertReleasePath(file);
  const out = resolve(staging, file);
  mkdirSync(dirname(out), {recursive: true});
  copyFileSync(safeFile(dist, file), out);
}
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
writeJson(resolve(staging, 'package.json'), {
  name: pkg.name, version: pkg.version, private: true, type: 'module',
  engines: pkg.engines, packageManager: pkg.packageManager, dependencies: pkg.dependencies,
  scripts: {start: 'node server/main.js',
    'database:plan': 'node server/database/cli-main.js plan',
    'database:bootstrap': 'node server/database/cli-main.js bootstrap',
    'database:migrate': 'node server/database/cli-main.js migrate',
    'database:inspect': 'node server/database/cli-main.js inspect'},
});
copyFileSync(resolve(root, 'package-lock.json'), resolve(staging, 'package-lock.json'));
const locked = spawnSync('npm', ['install', '--package-lock-only', '--omit=dev', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], {cwd: staging, encoding: 'utf8'});
if (locked.error || locked.status !== 0) throw new Error(`Offline runtime lock generation failed: ${locked.stderr}`);
const files = fileRecords(staging);
for (const file of files) assertReleasePath(file.path);
writeJson(resolve(staging, 'release-manifest.json'), {
  version: 1, stage: `${evidenceTask}-foundation`, productionReady: false, node: pkg.engines.node, npm: pkg.engines.npm,
  files, sourceBuildManifestSha256: sha256(readFileSync(resolve(dist, 'build-manifest.json'))),
  exclusions: ['T+ original workbooks', 'database backups', 'credentials and environment files', 'private product media', 'reference sources', 'tests and logs', 'native dependencies and node_modules'],
});
const manifestHash = sha256(readFileSync(resolve(staging, 'release-manifest.json')));
const output = releaseDirectory;
mkdirSync(output, {recursive: true});
const archive = resolve(output, `naijue-erp-v0.0.1-${evidenceTask.toLowerCase()}-${manifestHash.slice(0, 16)}.tar.gz`);
const packed = spawnSync('tar', ['-czf', archive, '-C', staging, '.'], {stdio: 'inherit'});
if (packed.error || packed.status !== 0) throw new Error('Release archive creation failed');
writeJson(resolve(output, 'latest.json'), {archive, archiveSha256: sha256(readFileSync(archive)), manifestHash, staging, fileCount: files.length + 1});
const verified = spawnSync(process.execPath, [resolve(root, 'scripts/verify-release.mjs')], {cwd: root, stdio: 'inherit'});
if (verified.error || verified.status !== 0) throw new Error('Packed archive verification failed');
console.log(`Release archive: ${archive}`);
writeJson(resolve(releaseDirectory, 'package-status.json'), {status: 'PASS', archive, productionReady: false});
} catch (error) {
  writeJson(resolve(releaseDirectory, 'verification.json'), {status: 'FAIL', reason: error.message, productionReady: false});
  writeJson(resolve(releaseDirectory, 'package-status.json'), {status: 'FAIL', reason: error.message, productionReady: false});
  console.error('Release archive: FAIL; ' + error.message);
  process.exitCode = 1;
}
