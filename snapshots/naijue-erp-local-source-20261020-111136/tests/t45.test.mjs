import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, cpSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import https from 'node:https';
import {once} from 'node:events';
import {probe} from '../scripts/t45/probe.mjs';
import {root, policy, digest, assertCheckEnvironment, assertChecks, assertImage, assertStage, assertManagement,
  createRc, assertProductionApproval, readJson} from '../scripts/t45/lib.mjs';

const hash = 'a'.repeat(64), appId = 'sha256:' + 'b'.repeat(64), webId = 'sha256:' + 'c'.repeat(64);
const checks = {task: 'T45', status: 'PASS', sourceSha256: hash, archiveSha256: hash,
  checks: ['install', 'typecheck', 'lint', 'check:dependencies', 'build', 'test', 't45-tests', 't45-lint', 't14-preflight', 'build-for-package', 'release:pack'].map(name => ({name, status: 'PASS', exitCode: 0}))};
const image = {status: 'PASS', platform: 'linux/amd64', appId, webId, archiveSha256: hash, imageTarSha256: hash,
  policySha256: hash, sourceSha256: hash, layerScan: {status: 'PASS'}, smoke: {status: 'PASS'}};
const syntheticProbe = {status: 'PASS', url: policy.stage.url, environment: 'stage', tlsVerificationDisabled: false, redirectsFollowed: false,
  results: ['/', '/api/health', '/api/session', '/api/media/__t45_denied__', '/.env', '/v1.24/containers/json'].map(path => ({path,
    observedStatus: path === '/api/health' ? 200 : 503, status: 'PASS', tls: {verified: true, validTo: new Date(Date.now() + 600000).toISOString()}}))};
const stage = {status: 'PASS', kind: 'stage-deployment', environment: 'stage', appId, webId, archiveSha256: hash,
  imageTarSha256: hash, routeSha256: hash, url: policy.stage.url, maintenanceOnly: true, deploymentExecuted: true,
  probeBefore: syntheticProbe, probeAfter: syntheticProbe, configurationUnchanged: true, noDatabaseMutationCommands: true};
stage.bootPinInstalled = true;
const compatibility = {status: 'PASS', appId, webId, noSchemaDowngrade: true, currentSqlVersions: ['synthetic-version']};
const controller = {task: 'T44', status: 'PASS', appId, webId, archiveSha256: hash, routeSha256: hash, compatibilitySha256: digest(JSON.stringify(compatibility)), acceptedBy: 'isolated-test-only'};

test('T45 refuses ambient production targets and credentials before any connection', () => {
  for (const env of [{APP_ENV: 'production'}, {NODE_ENV: 'production'}, {POSTGRES_DB: 'erp_prod'}, {PGPASSWORD: 'synthetic'},
    {APP_DATABASE_MODE: 'required'}, {SESSION_SECRET_FILE: '/synthetic'}, {MEDIA_STORAGE_ROOT: '/production'}, {APP_ENV: 'unknown'}]) assert.throws(() => assertCheckEnvironment(env));
  assert.doesNotThrow(() => assertCheckEnvironment({APP_ENV: 'qa', PATH: '/bin'}));
});
test('T45 missing, failed, duplicate and nonzero checks prevent image creation', () => {
  assert.doesNotThrow(() => assertChecks(checks));
  for (const input of [{...checks, status: 'FAIL'}, {...checks, sourceSha256: ''}, {...checks, checks: checks.checks.slice(1)},
    {...checks, checks: [...checks.checks, checks.checks[0]]}, {...checks, checks: checks.checks.map(c => c.name === 'test' ? {...c, exitCode: 1} : c)}]) assert.throws(() => assertChecks(input));
});
test('T45 rejects arm64, mutable tags, missing scan and missing smoke', () => {
  assert.doesNotThrow(() => assertImage(image));
  for (const patch of [{platform: 'linux/arm64'}, {appId: 'naijue:latest'}, {webId: 'nginx:latest'},
    {layerScan: {status: 'NOT_RUN'}}, {smoke: {status: 'NOT_RUN'}}, {status: 'RUNNING'}]) assert.throws(() => assertImage({...image, ...patch}));
});
test('T45 cannot promote different images, package, routes, public stage or simulation', () => {
  assert.doesNotThrow(() => assertStage(stage, image, hash));
  for (const patch of [{appId: 'sha256:' + 'd'.repeat(64)}, {archiveSha256: 'd'.repeat(64)}, {routeSha256: 'd'.repeat(64)},
    {url: policy.public.url}, {deploymentExecuted: false}, {probeAfter: {status: 'FAIL'}}, {configurationUnchanged: false}]) assert.throws(() => assertStage({...stage, ...patch}, image, hash));
});
test('T45 does not manufacture T44 RC acceptance from checks or stage success', () => {
  assert.equal(createRc(checks, image, stage, controller, hash).kind, 'accepted-rc');
  assert.throws(() => createRc(checks, image, stage, {...controller, status: 'pending'}, hash));
  assert.throws(() => createRc(checks, image, stage, {...controller, appId: 'other'}, hash));
  assert.throws(() => createRc(checks, image, stage, {...controller, routeSha256: 'other'}, hash));
  assert.throws(() => createRc({...checks, sourceSha256: 'd'.repeat(64)}, image, stage, controller, hash));
});
test('T45 production needs a fresh exact manual approval and compatible schema evidence', () => {
  const rc = createRc(checks, image, stage, controller, hash);
  const approval = {kind: 'manual-production-maintenance-approval', approved: true, approvedBy: 'synthetic-reviewer',
    approvedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
    t44Accepted: true, g4Accepted: true, t47Accepted: true, businessActivationAllowed: false, rcSha256: digest(JSON.stringify(rc)),
    appId, webId, archiveSha256: hash, routeSha256: hash, compatibilitySha256: controller.compatibilitySha256};
  assert.doesNotThrow(() => assertProductionApproval(rc, approval, compatibility));
  for (const patch of [{approved: false}, {expiresAt: '2020-01-01'}, {t47Accepted: false}, {businessActivationAllowed: true}, {routeSha256: 'other'}]) assert.throws(() => assertProductionApproval(rc, {...approval, ...patch}, compatibility));
  assert.throws(() => assertProductionApproval(rc, approval, {...compatibility, currentSqlVersions: ['changed']}));
});
test('T45 SSH only accepts the existing administrator Tailscale endpoint', () => {
  assert.doesNotThrow(() => assertManagement(policy.management.host, policy.management.user));
  for (const host of ['218.0.254.150', '1n5635n614.goho.co', '192.168.3.54']) assert.throws(() => assertManagement(host, policy.management.user));
  assert.throws(() => assertManagement(policy.management.host, 'root'));
});

mkdirSync(resolve(root, 'work/T45/tests'), {recursive: true});
const fixtures = mkdtempSync(resolve(root, 'work/T45/tests/scan-'));
for (const [kind, variants] of [['release', ['valid', 'secret', 'native', 'missing-reference', 'private-media', 'tamper', 'missing', 'traversal', 'duplicate', 'link', 'empty-directory']],
  ['image', ['valid', 'arm-native', 'arm-config', 'hidden-secret']]]) {
  for (const variant of variants) test('T45 archive scanner ' + kind + ' / ' + variant, () => {
    const folder = resolve(fixtures, kind + '-' + variant);
    const make = spawnSync('python3', [resolve(root, 'tests/t45/fixtures.py'), kind, folder, variant]); assert.equal(make.status, 0, make.stderr?.toString());
    const output = resolve(folder, 'scan.json');
    const args = [resolve(root, 'scripts/t45/scan.py'), kind, resolve(folder, kind === 'image' ? 'images.tar' : 'release.tar.gz'), '--output', output];
    if (kind === 'release') args.push('--frontend-policy', resolve(folder, 'policy.json'));
    const scan = spawnSync('python3', args, {encoding: 'utf8'});
    assert.equal(scan.status, variant === 'valid' ? 0 : 1, scan.stdout + scan.stderr);
    assert.equal(readJson(output).status, variant === 'valid' ? 'PASS' : 'FAIL');
    assert.doesNotMatch(readFileSync(output, 'utf8'), /-----BEGIN/);
  });
}
test('T45 CI is hosted, credential-free and cannot deploy or push an image', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/t45-ci.yml'), 'utf8');
  assert.match(workflow, /runs-on: ubuntu-24\.04/); assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\.|runs-on:\s*self-hosted|docker\s+push|t45\.sh\s+transfer|pull_request_target/);
});
test('T45 HTTPS probes verify chain/name and maintenance routes using real local TLS', async () => {
  const dir = mkdtempSync(resolve(fixtures, 'tls-'));
  for (const name of ['accepted', 'wrong']) {
    const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', resolve(dir, name + '.key'),
      '-out', resolve(dir, name + '.crt'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], {encoding: 'utf8'});
    assert.equal(r.status, 0);
  }
  const server = https.createServer({key: readFileSync(resolve(dir, 'accepted.key')), cert: readFileSync(resolve(dir, 'accepted.crt'))}, (req, res) => {
    res.writeHead(req.url === '/api/health' ? 200 : 503, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(req.url === '/api/health' ? {environment: 'stage', businessReady: false} : {mode: 'maintenance', businessReady: false}));
  });
  server.listen(18443, '127.0.0.1'); await once(server, 'listening');
  try {
    const result = await probe('stage', resolve(dir, 'accepted.crt'));
    assert.equal(result.status, 'PASS'); assert.equal(result.results.length, 6);
    await assert.rejects(probe('stage', resolve(dir, 'wrong.crt')));
    await assert.rejects(new Promise((yes, no) => {
      const r = https.get({hostname: '127.0.0.1', port: 18443, servername: 'wrong.invalid', ca: readFileSync(resolve(dir, 'accepted.crt'))}, yes);
      r.on('error', no);
    }), /Hostname\/IP does not match/);
  } finally {await new Promise(yes => server.close(yes));}
});
test('T45 failing entrypoint preflight and bundle invalidate stale PASS in isolated subprocesses', () => {
  const fixture = mkdtempSync(resolve(fixtures, 'stale-'));
  cpSync(resolve(root, 'scripts/t45'), resolve(fixture, 'scripts/t45'), {recursive: true});
  cpSync(resolve(root, 'config/t45'), resolve(fixture, 'config/t45'), {recursive: true});
  mkdirSync(resolve(fixture, 'outputs/T45'), {recursive: true});
  for (const file of ['checks.json', 'bundle.json']) writeFileSync(resolve(fixture, 'outputs/T45', file), '{"status":"PASS","stale":true}');
  const rejected = spawnSync(process.execPath, [resolve(fixture, 'scripts/t45/check.mjs')], {env: {PATH: process.env.PATH, APP_ENV: 'production'}});
  assert.equal(rejected.status, 1); assert.equal(readJson(resolve(fixture, 'outputs/T45/checks.json')).status, 'FAIL');
  writeFileSync(resolve(fixture, 'invalid-image.json'), '{"status":"FAIL"}');
  const bundle = spawnSync(process.execPath, [resolve(fixture, 'scripts/t45/cli.mjs'), 'bundle', 'stage', resolve(fixture, 'invalid-image.json')]);
  assert.equal(bundle.status, 1); assert.equal(readJson(resolve(fixture, 'outputs/T45/bundle.json')).status, 'FAIL');
});
