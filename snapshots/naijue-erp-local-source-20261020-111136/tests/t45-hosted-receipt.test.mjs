// Synthetic receipt fixtures only: no CI, image, stage or RC evidence issued.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, symlinkSync} from 'node:fs';
import {resolve, relative, dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {digest, policy, createRc, assertChecks} from '../scripts/t45/lib.mjs';
import {assertHostedChecks, hostedKind} from '../scripts/t45/hosted-receipt.mjs';

const work = resolve('work/T45/revisions/20261005-current-candidate-consumption-r09/receipt-fixtures');
mkdirSync(work, {recursive: true});
const hash = value => digest(Buffer.isBuffer(value) ? value : Buffer.from(value));
const write = (path, value) => {mkdirSync(dirname(path), {recursive: true}); writeFileSync(path, JSON.stringify(value, null, 2) + '\n');};
const read = path => JSON.parse(readFileSync(path, 'utf8'));
function fixture() {
  const directory = mkdtempSync(resolve(work, 'case-')), base = resolve(directory, 'artifact'); mkdirSync(base);
  const acceptanceFile = resolve(directory, 'accepted.json');
  const p = {repository: 'Billy159/naijue-erp', ref: 'refs/heads/codex/t45-fixture-r09', commit: 'a'.repeat(40),
    workflowPath: '.github/workflows/t45-amd64.yml', workflowSha256: 'b'.repeat(64), runId: '1234', runAttempt: '1',
    runner: {os: 'Linux', architecture: 'x86_64'}};
  const sourceSha256 = 'c'.repeat(64), archive = Buffer.from('SYNTHETIC_RELEASE_ONLY'), images = Buffer.from('SYNTHETIC_IMAGES_ONLY');
  writeFileSync(resolve(base, 'release.tar.gz'), archive); writeFileSync(resolve(base, 'images.tar'), images);
  const checks = {kind: hostedKind, task: 'T45', status: 'PASS', sourceSha256, archiveSha256: hash(archive), provenance: p,
    realBuildExecuted: true, singleContinuousPriorCheckPass: false, priorChecksRerun: 0,
    frontendBuildMode: 'fresh-current-source', businessReady: false, deploymentAllowed: false,
    checks: ['linux-lock-install', 'strict-backend', 'fresh-frontend', 'new-release-pack-and-readback', 'new-release-scan',
      'build-app', 'build-web', 'all-layer-scan', 'sharp-native-proof', 'database-disabled-smoke', 'shutdown-proof']
      .map(name => ({name, status: 'PASS', exitCode: 0}))};
  const admission = {status: 'PASS', acceptedBy: 'SYNTHETIC_ONLY', privacyReviewStatus: 'PASS', privacyAcceptedBy: 'SYNTHETIC_ONLY',
    sourceSha256, completeCurrentProgram: true, acceptedPriorCoverage: {status: 'PASS', acceptedBy: 'SYNTHETIC_ONLY', sourceSha256},
    databaseMutationAllowed: false, deploymentAllowed: false, businessReady: false};
  write(resolve(base, 'checks.json'), checks); write(resolve(base, 'source-admission.json'), admission);
  write(resolve(base, 'source-audit.json'), {buildEligible: true, blockers: [], sourceSha256});
  const appId = 'sha256:' + 'd'.repeat(64), webId = 'sha256:' + 'e'.repeat(64);
  const layer = {status: 'PASS', scope: 'all-image-layers-and-config', images: [appId, webId].map(id => ({id, platform: 'linux/amd64'}))};
  const image = {task: 'T45', status: 'PASS', platform: 'linux/amd64', sourceSha256, archiveSha256: hash(archive),
    imageTarSha256: hash(images), appId, webId, imageTar: 'images.tar', releaseArchive: 'release.tar.gz', provenance: p,
    sourceAdmissionSha256: hash(readFileSync(resolve(base, 'source-admission.json'))), policySha256: 'f'.repeat(64), layerScan: layer,
    smoke: {status: 'PASS', network: 'none', databaseConnections: 0, healthStatus: 200, writeStatus: 404, businessReady: false, shutdownExitCode: 0}};
  write(resolve(base, 'image.json'), image); write(resolve(base, 'layer-scan.json'), layer);
  write(resolve(base, 'release-scan.json'), {status: 'PASS', scope: 'every-release-member', secretFindings: 0});
  write(resolve(base, 'native-runtime.json'), {platform: 'linux', arch: 'x64', encodedBytes: 1});
  write(resolve(base, 'package-verification.json'), {status: 'PASS', archiveSha256: hash(archive), excludedFilesFound: 0, productMediaInPublicPackage: 0});
  write(resolve(base, 'frontend-manifest.json'), {privateMediaPublished: false, files: [{path: 'index.html'}]});
  write(resolve(base, 'build-manifest.json'), {task: 'T45', frontendBuildMode: 'fresh-current-source',
    frontendManifestSha256: hash(readFileSync(resolve(base, 'frontend-manifest.json')))});
  const officialRun = {id: 1234, run_attempt: 1, head_sha: p.commit, head_branch: p.ref.slice(11),
    repository: {full_name: p.repository}, event: 'push', path: p.workflowPath, status: 'completed', conclusion: 'success',
    html_url: 'https://github.com/' + p.repository + '/actions/runs/' + p.runId};
  write(resolve(directory, 'run.json'), officialRun);
  function seal() {
    const records = [];
    function walk(dir) {for (const name of readdirSync(dir).sort()) {
      const path = resolve(dir, name), stat = lstatSync(path);
      if (stat.isDirectory()) walk(path);
      else if (name !== 'artifact-manifest.json') records.push({path: relative(base, path), bytes: stat.size, sha256: hash(readFileSync(path))});
    }}
    walk(base); write(resolve(base, 'artifact-manifest.json'), {files: records});
    const zip = resolve(directory, 'download.zip');
    const r = spawnSync('python3', ['-c', 'import pathlib,sys,zipfile\nb=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w") as z:\n for p in sorted(b.rglob("*")):\n  if p.is_file():z.write(p,str(p.relative_to(b)))', base, zip]);
    assert.equal(r.status, 0);
    write(resolve(directory, 'official-artifact.json'), {name: 't45-amd64-' + p.commit + '-' + p.runId, expired: false,
      workflow_run: {id: 1234, head_sha: p.commit, head_branch: p.ref.slice(11)}, digest: 'sha256:' + hash(readFileSync(zip))});
    const record = path => ({path, bytes: lstatSync(resolve(directory, path)).size, sha256: hash(readFileSync(resolve(directory, path)))});
    write(acceptanceFile, {kind: 't45-hosted-artifact-acceptance-v1', status: 'PASS', acceptedBy: 'SYNTHETIC_ONLY', provenance: p,
      artifactManifestSha256: hash(readFileSync(resolve(base, 'artifact-manifest.json'))), sourceSha256,
      archiveSha256: image.archiveSha256, imageTarSha256: image.imageTarSha256, appId, webId,
      sourceAdmissionSha256: image.sourceAdmissionSha256, independentCoverageAccepted: true,
      officialRun: record('run.json'), officialArtifact: record('official-artifact.json'), download: record('download.zip')});
  }
  seal();
  const mutate = (name, fn) => {const path = resolve(base, name), value = read(path); fn(value); write(path, value); seal();};
  const route = '1'.repeat(64);
  const probe = {status: 'PASS', url: policy.stage.url, environment: 'stage', tlsVerificationDisabled: false, redirectsFollowed: false,
    results: [['/', 503], ['/api/health', 200], ['/api/session', 503], ['/api/media/__t45_denied__', 503], ['/.env', 503], ['/v1.24/containers/json', 503]]
      .map(([path, observedStatus]) => ({path, observedStatus, status: 'PASS', tls: {verified: true, validTo: '2100-01-01T00:00:00Z'}}))};
  const stage = {status: 'PASS', kind: 'stage-deployment', environment: 'stage', appId, webId, archiveSha256: image.archiveSha256,
    imageTarSha256: image.imageTarSha256, routeSha256: route, url: policy.stage.url, maintenanceOnly: true,
    deploymentExecuted: true, probeBefore: probe, probeAfter: probe, configurationUnchanged: true, noDatabaseMutationCommands: true, bootPinInstalled: true};
  const controller = {task: 'T44', status: 'PASS', appId, webId, archiveSha256: image.archiveSha256,
    routeSha256: route, compatibilitySha256: '2'.repeat(64), acceptedBy: 'SYNTHETIC_ONLY'};
  return {base, directory, acceptanceFile, checks, image, stage, controller, route, mutate, seal,
    context: {artifactDirectory: base, acceptanceFile}, check: () => assertHostedChecks(read(resolve(base, 'checks.json')), {artifactDirectory: base, acceptanceFile})};
}

test('exact synthetic artifact crosses the existing RC gates and carries its run binding', () => {
  const f = fixture(), rc = createRc(f.checks, f.image, f.stage, f.controller, f.route, f.context);
  assert.equal(rc.kind, 'accepted-rc'); assert.equal(rc.hostedProvenance.runId, '1234'); assert.equal(rc.businessReady, false);
});
test('hosted receipt cannot enter the ordinary checks path without separate acceptance', () => {
  const f = fixture(); assert.throws(() => assertChecks(f.checks), /EXTERNAL_ACCEPTANCE_CONTEXT/);
});
test('artifact bytes changed after sealing are refused', () => {
  const f = fixture(); writeFileSync(resolve(f.base, 'images.tar'), 'changed'); assert.throws(f.check, /FILE_CHANGED/);
});
test('unlisted environment file is refused', () => {
  const f = fixture(); writeFileSync(resolve(f.base, '.env'), 'fixture'); assert.throws(f.check, /ARTIFACT_FILE_SET/);
});
test('artifact symlink is refused', () => {
  const f = fixture(); symlinkSync(resolve(f.base, 'checks.json'), resolve(f.base, 'link.json')); assert.throws(f.check, /SYMLINK/);
});
test('an old prebuilt frontend receipt is refused even when resealed', () => {
  const f = fixture(); f.mutate('build-manifest.json', v => {v.frontendBuildMode = 'prebuilt';}); assert.throws(f.check, /FRESH_BUILD_PROOF/);
});
test('source coverage cannot silently reuse an unaccepted new source', () => {
  const f = fixture(); f.mutate('source-admission.json', v => {v.acceptedPriorCoverage.status = 'PENDING';}); assert.throws(f.check, /SOURCE_AND_COVERAGE/);
});
test('a different official run is refused', () => {
  const f = fixture(); const path = resolve(f.directory, 'run.json'), run = read(path); run.head_sha = '9'.repeat(40); write(path, run); f.seal();
  assert.throws(f.check, /OFFICIAL_RUN_BINDING/);
});
test('GitHub workflow path with the exact branch suffix is consumed', () => {
  const f = fixture(), path = resolve(f.directory, 'run.json'), run = read(path);
  run.path += '@' + f.checks.provenance.ref.slice(11); write(path, run); f.seal();
  assert.equal(f.check().provenance.commit, f.checks.provenance.commit);
});
test('download hash and API digest alone cannot validate a different extracted artifact', () => {
  const f = fixture(), zip = resolve(f.directory, 'download.zip');
  const r = spawnSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z:z.writestr("foreign.txt","other run")', zip]); assert.equal(r.status, 0);
  const path = resolve(f.directory, 'official-artifact.json'), artifact = read(path); artifact.digest = 'sha256:' + hash(readFileSync(zip)); write(path, artifact);
  const accepted = read(f.acceptanceFile);
  for (const [key, name] of [['download', 'download.zip'], ['officialArtifact', 'official-artifact.json']])
    accepted[key] = {path: name, bytes: lstatSync(resolve(f.directory, name)).size, sha256: hash(readFileSync(resolve(f.directory, name)))};
  write(f.acceptanceFile, accepted); assert.throws(f.check, /DOWNLOADED_ZIP_READBACK/);
});
test('a different image input cannot be promoted with the accepted hosted checks', () => {
  const f = fixture(); assert.throws(() => createRc(f.checks, {...f.image, appId: 'sha256:' + '8'.repeat(64)}, f.stage, f.controller, f.route, f.context), /RC_IMAGE_INPUT_CHANGED/);
});
test('real stage gate remains required after hosted receipt consumption', () => {
  const f = fixture(); assert.throws(() => createRc(f.checks, f.image, {...f.stage, deploymentExecuted: false}, f.controller, f.route, f.context), /STAGE_RECEIPT_INVALID/);
});
test('T44 exact-image acceptance remains required after hosted receipt consumption', () => {
  const f = fixture(); assert.throws(() => createRc(f.checks, f.image, f.stage, {...f.controller, appId: 'sha256:' + '8'.repeat(64)}, f.route, f.context), /T44_RC_ACCEPTANCE_REQUIRED/);
});
