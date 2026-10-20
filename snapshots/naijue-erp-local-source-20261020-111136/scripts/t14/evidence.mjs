import assert from 'node:assert/strict';
import {mkdirSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileRecords, sha256, safeFile, writeJson} from '../files.mjs';

export function protectedState(root) {
  const demo = resolve(root, '../奈爵服饰-8877-Demo');
  const git = (...args) => {
    const r = spawnSync('git', ['-C', demo, ...args], {encoding: 'utf8'});
    assert.equal(r.status, 0); return r.stdout.trim();
  };
  assert.equal(git('rev-parse', '8877-final-baseline^{}'), 'b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3');
  const paths = JSON.parse(readFileSync(join(root, 'outputs/T08/protected-before.json'), 'utf8')).files.map(f => f.path);
  const demoFiles = paths.map(path => { const b = readFileSync(safeFile(demo, path)); return {path, bytes: b.length, sha256: sha256(b)}; });
  return {head: git('rev-parse', 'HEAD'), tag: git('rev-parse', '8877-final-baseline'), status: git('status', '--short'),
    demoFiles, planning: fileRecords(join(root, 'references/planning-20261001')),
    legacy: fileRecords(join(root, 'references/frozen-baseline')), tests: fileRecords(join(root, 'tests/t14'))};
}

export function sourceState(root) {
  return {server: fileRecords(join(root, 'server')), frontend: fileRecords(join(root, 'frontend')), scripts: fileRecords(join(root, 'scripts')),
    config: fileRecords(join(root, 'config')), packageSha256: sha256(readFileSync(join(root, 'package.json'))), lockSha256: sha256(readFileSync(join(root, 'package-lock.json')))};
}

// T14 evidence archives have an exact required-file set, independent of any prior PASS report.
export function verifyEvidenceDirectory(directory, manifest) {
  const required = ['pipeline.json', 'fingerprints.json', 'negative-cases.json', 'protection.json', 'source-state.json', 'regression-results.json'];
  if (!manifest.files?.length || !manifest.required?.length) throw Error('T14_EMPTY_EVIDENCE_MANIFEST');
  assert.deepEqual(manifest.required, required, 'T14_EVIDENCE_REQUIREMENTS_CHANGED');
  for (const required of manifest.required) {
    if (!manifest.files.some(f => f.path === required)) throw Error('T14_REQUIRED_EVIDENCE_MISSING');
  }
  const actual = fileRecords(directory).filter(f => f.path !== 'evidence-manifest.json');
  assert.deepEqual(actual, manifest.files, 'T14_EVIDENCE_CONTENT_MISMATCH');
  for (const file of manifest.files) {
    const bytes = readFileSync(safeFile(directory, file.path));
    if (sha256(bytes) !== file.sha256) throw Error('T14_EVIDENCE_DIGEST_MISMATCH');
  }
  return {status: 'PASS', filesVerified: actual.length};
}

export async function archiveEvidence(directory, manifest, archive, run) {
  const {runProcess} = await import('./process.mjs');
  writeJson(join(directory, 'evidence-manifest.json'), manifest);
  verifyEvidenceDirectory(directory, manifest);
  await runProcess('tar', ['-czf', archive, '-C', directory, '.'], {log: join(run.log, 'evidence-pack.log')});
  const readback = join(run.path, 'evidence-readback'); mkdirSync(readback);
  await runProcess('tar', ['-xzf', archive, '-C', readback], {log: join(run.log, 'evidence-readback.log')});
  const verified = verifyEvidenceDirectory(readback, JSON.parse(readFileSync(join(readback, 'evidence-manifest.json'), 'utf8')));
  return {...verified, archive, archiveSha256: sha256(readFileSync(archive))};
}
