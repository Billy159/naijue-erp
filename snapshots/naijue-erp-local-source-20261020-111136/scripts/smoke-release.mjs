import './check-toolchain.mjs';
import {spawn, spawnSync} from 'node:child_process';
import {readFileSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {root, writeJson} from './files.mjs';
import {releaseDirectory,taskLogDirectory,taskOutputDirectory} from './task-artifacts.mjs';

const latest = JSON.parse(readFileSync(resolve(releaseDirectory, 'latest.json'), 'utf8'));
const verified = spawnSync(process.execPath, [resolve(root, 'scripts/verify-release.mjs')], {stdio: 'inherit'});
if (verified.status !== 0) throw new Error('Release verification failed');
mkdirSync(resolve(root, 'work/runtime-smoke'), {recursive: true});
const runtime = mkdtempSync(resolve(root, 'work/runtime-smoke/package-'));
const unpack = spawnSync('tar', ['-xzf', latest.archive, '-C', runtime]);
if (unpack.status !== 0) throw new Error('Cannot extract verified archive');
const ci = spawnSync('npm', ['ci', '--omit=dev', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: runtime, encoding: 'utf8'});
mkdirSync(taskLogDirectory,{recursive:true});
writeFileSync(resolve(taskLogDirectory, 'runtime-npm-ci.log'), ci.stdout + ci.stderr);
if (ci.status !== 0) throw new Error('Fresh production-only dependency install failed');
const reserve = createServer();
reserve.listen(0, '127.0.0.1');
await once(reserve, 'listening');
const address = reserve.address();
if (!address || typeof address === 'string') throw new Error('Cannot obtain a local test port');
const port = address.port;
await new Promise((yes, no) => reserve.close(error => error ? no(error) : yes()));
const child = spawn(process.execPath, ['server/main.js'], {cwd: runtime, env: {PATH: process.env.PATH, APP_ENV: 'local', APP_HOST: '127.0.0.1', APP_PORT: String(port), TZ: 'UTC'}, stdio: ['ignore', 'pipe', 'pipe']});
let output = '';
child.stdout.on('data', bytes => { output += bytes.toString(); });
child.stderr.on('data', bytes => { output += bytes.toString(); });
const exited = once(child, 'exit');
try {
  let health;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error('Compiled release exited before startup');
    try { health = await fetch(`http://127.0.0.1:${port}/api/health`); break; } catch { await new Promise(yes => setTimeout(yes, 100)); }
  }
  assert.ok(health, 'Compiled release did not start');
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.deepEqual(body, {status: 'ok', environment: 'local', applicationStage: 'foundation', businessReady: false});
  const business = await fetch(`http://127.0.0.1:${port}/api/command`, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
  assert.equal(business.status, 404);
  child.kill('SIGTERM');
  const [exitCode] = await exited;
  assert.equal(exitCode, 0, output);
  writeJson(resolve(taskOutputDirectory, 'release-runtime-smoke.json'), {status: 'PASS', archiveSha256: latest.archiveSha256, runtimeDirectory: runtime, install: 'npm ci --omit=dev --offline --ignore-scripts', healthStatus: 200, businessWriteStatus: 404, shutdownExitCode: exitCode, databaseConnections: 0, serverOperations: 0});
  console.log('Fresh archive runtime: production-only npm ci, local HTTP health, business-route rejection and graceful shutdown PASS');
} finally {
  if (child.exitCode === null) { child.kill('SIGTERM'); await exited; }
  writeFileSync(resolve(taskLogDirectory, 'runtime-process.log'), output);
}
