import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {assertComposedChecks} from '../scripts/t45/candidate.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const put = (root, path, value) => {
  const file = resolve(root, path); mkdirSync(dirname(file), {recursive: true});
  const bytes = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  writeFileSync(file, bytes); return {path, sha256: hash(bytes)};
};
const record = (root, path) => {
  const b = readFileSync(resolve(root, path)); return {path, bytes: b.length, sha256: hash(b)};
};
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 't45-e01-'));
  const snapshot = resolve(root, 'work/T45/source');
  for (const base of [root, snapshot]) {
    mkdirSync(resolve(base, 'scripts/t45'), {recursive: true});
    put(base, 'server/main.ts', 'export const maintenance = true;\n');
    put(base, 'frontend/index.js', 'export const businessReady = false;\n');
    put(base, 'package.json', '{}\n'); put(base, 'package-lock.json', '{}\n');
    put(base, 'tsconfig.json', '{"strict":true}\n');
  }
  const backendSources = [{...record(root, 'server/main.ts'), path: 'main.ts'}];
  const frontendSources = [{...record(root, 'frontend/index.js'), path: 'index.js'}];
  put(snapshot, 'dist/server/main.js', 'export const maintenance = true;\n');
  put(snapshot, 'dist/web/index.js', 'export const businessReady = false;\n');
  const front = put(snapshot, 'dist/frontend-manifest.json', {files: [{...record(snapshot, 'dist/web/index.js'), path: 'index.js'}]});
  const built = {task: 'T45', backendSources, frontendSources,
    backendOutput: [{...record(snapshot, 'dist/server/main.js'), path: 'main.js'}],
    packageSha256: hash('{}\n'), lockSha256: hash('{}\n'), publicationPolicySha256: hash('fixture'), frontendManifestSha256: front.sha256};
  const baseBuild = put(root, 'evidence/base-build.json', built);
  const delta = put(root, 'evidence/delta.json', {status: 'PASS_SCOPED_INDEPENDENT_REVIEW', currentSourceBindings: []});
  const authority = put(root, 'evidence/authority.json', {status: 'PASS_SCOPED'});
  const log = put(root, 'logs/new.log', 'new compile and original archive verification succeeded\n');
  const coverage = ['install', 'typecheck', 'lint', 'check:dependencies', 'build', 'test', 't45-tests', 't45-lint', 't14-preflight', 'build-for-package', 'release:pack']
    .map(name => ({name, status: 'REUSED_ACCEPTED_PASS', applicability: 'exact captured component only', evidenceIds: ['authority'], log: log.path, logSha256: log.sha256}));
  const policy = {authorities: [{...authority, status: 'PASS_SCOPED'}], evidence: [baseBuild, delta],
    baseBuild: baseBuild.path, deltaReview: delta.path, coverage, newCommands: [{name: 'compile', executable: 'node', args: ['compile'], backendSources: true, inputFiles: ['tsconfig.json']}],
    requiredInputFiles: ['package.json', 'package-lock.json', 'tsconfig.json'],
    acceptedInputFiles: [record(root, 'package.json'), record(root, 'package-lock.json')], releaseFileCount: 2};
  const reuse = put(root, 'config/t45/e01-reuse-20261005-01.json', policy);
  put(snapshot, reuse.path, policy);
  const sourceFiles = ['server/main.ts', 'frontend/index.js', ...policy.requiredInputFiles, reuse.path].map(p => record(root, p));
  const sourceSha256 = hash(JSON.stringify(sourceFiles));
  const sourceManifest = put(root, 'evidence/source.json', {files: sourceFiles});
  const command = {name: 'compile', command: '/fixture/bin/node', args: ['compile'], status: 'PASS', exitCode: 0, cwd: snapshot,
    log: resolve(root, log.path), logSha256: log.sha256, databaseConnections: 0, sourceManifest, sourceSha256};
  const execution = put(root, 'evidence/execution.json', {sourceSha256, snapshot, commands: [command]});
  const archive = put(snapshot, 'outputs/T45/release/candidate.tar.gz', 'fixture archive bytes');
  const readback = 'work/release-verification/readback-fixture';
  const buildManifest = put(snapshot, 'dist/build-manifest.json', built);
  put(snapshot, readback + '/build-manifest.json', built);
  put(snapshot, readback + '/frontend-manifest.json', {files: [{...record(snapshot, 'dist/web/index.js'), path: 'index.js'}]});
  const releaseManifest = put(snapshot, readback + '/release-manifest.json', {sourceBuildManifestSha256: buildManifest.sha256});
  const checks = {task: 'T45', kind: 'source-bound-accepted-composition-v1', status: 'PASS_E01_COMPOSED', scope: 'T45-E01',
    singleContinuousRun: false, productionReady: false, databaseConnections: 0, snapshot, sourceSha256,
    reusePolicySha256: reuse.sha256, coverage, checks: coverage.map(c => ({...c, log: command.log, logSha256: command.logSha256})),
    sourceManifest, execution, buildManifest,
    diagnosticArchive: resolve(snapshot, archive.path), archiveSha256: archive.sha256,
    releaseVerification: put(root, 'evidence/verification.json', {status: 'PASS', archiveSha256: archive.sha256, filesVerified: 2, readbackDirectory: resolve(snapshot, readback)}),
    releaseLatest: put(root, 'evidence/latest.json', {archiveSha256: archive.sha256, manifestHash: releaseManifest.sha256}),
    releaseScan: put(root, 'evidence/scan.json', {status: 'PASS', archiveSha256: archive.sha256, manifestSha256: releaseManifest.sha256})};
  return {root, snapshot, checks};
}

test('E01 composition admits exact captured receipts and rejects changed provenance', async t => {
  const cases = [
    ['exact composed candidate', () => {}, false],
    ['single continuous run claim', f => {f.checks.singleContinuousRun = true;}, true],
    ['unaccepted status', f => {f.checks.status = 'PASS';}, true],
    ['replaced acceptance', f => put(f.root, 'evidence/authority.json', {status: 'PASS'}), true],
    ['missing check applicability', f => {f.checks.coverage = [];}, true],
    ['uncovered check', f => {f.checks.checks = [];}, true],
    ['later application edit', f => put(f.snapshot, 'server/main.ts', 'export const maintenance = false;\n'), true],
    ['source omission with new digest', f => {
      const source = JSON.parse(readFileSync(resolve(f.root, f.checks.sourceManifest.path)));
      source.files.pop(); f.checks.sourceManifest = put(f.root, f.checks.sourceManifest.path, source);
      f.checks.sourceSha256 = hash(JSON.stringify(source.files));
    }, true],
    ['lock replacement', f => put(f.snapshot, 'package-lock.json', '{"changed":true}\n'), true],
    ['new release tool outside manifest', f => put(f.snapshot, 'scripts/t45/unreviewed.mjs', 'export {};\n'), true],
    ['changed execution log', f => put(f.root, 'logs/new.log', 'substituted log\n'), true],
    ['substituted archive', f => put(f.snapshot, 'outputs/T45/release/candidate.tar.gz', 'other archive'), true],
    ['forged verification status', f => {f.checks.releaseVerification = put(f.root, 'evidence/verification.json', {status: 'FAIL', archiveSha256: f.checks.archiveSha256, filesVerified: 2});}, true],
    ['missing successful new command', f => {f.checks.execution = put(f.root, 'evidence/execution.json', {snapshot: f.snapshot, sourceSha256: f.checks.sourceSha256, commands: []});}, true],
    ['archive build from another source', f => put(f.snapshot, 'work/release-verification/readback-fixture/build-manifest.json', {task: 'T14'}), true],
    ['changed compile input after execution', f => {
      const original = JSON.parse(readFileSync(resolve(f.root, f.checks.sourceManifest.path)));
      const old = put(f.root, 'evidence/executed-source.json', original);
      const execution = JSON.parse(readFileSync(resolve(f.root, f.checks.execution.path)));
      execution.commands[0].sourceManifest = old;
      f.checks.execution = put(f.root, f.checks.execution.path, execution);
      for (const base of [f.root, f.snapshot]) put(base, 'tsconfig.json', '{"strict":false}\n');
      original.files = original.files.map(r => r.path === 'tsconfig.json' ? record(f.root, r.path) : r);
      f.checks.sourceManifest = put(f.root, f.checks.sourceManifest.path, original);
      f.checks.sourceSha256 = hash(JSON.stringify(original.files));
    }, true],
  ];
  for (const [name, change, rejects] of cases) await t.test(name, () => {
    const f = fixture();
    try {
      change(f);
      if (rejects) assert.throws(() => assertComposedChecks(f.checks, f.root));
      else assert.equal(assertComposedChecks(f.checks, f.root).status, 'PASS_E01_COMPOSED');
    } finally {rmSync(f.root, {recursive: true, force: true});}
  });
});
