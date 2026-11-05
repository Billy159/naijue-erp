import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve('.');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
// Exercise the actual CLI dispatcher and preparation cleanup in a subprocess.
// Only preflight/planner/cursors are doubles; no database or real source data.
async function invoke({ cleanupFails = false, stepsFail = false, preflightRejects = false, help = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'stream-prepare-cleanup-'));
  try {
    const pkg = join(dir, 'package'); await mkdir(pkg);
    await writeFile(join(pkg, 'manifest.json'), '{}');
    await writeFile(join(dir, 'target.json'), '{}'); await writeFile(join(dir, 'admin.json'), '{}');
    await writeFile(join(dir, 'cli.mjs'), await readFile(join(root, 'tools/unified-import/cli.mjs')));
    let source = await readFile(join(root, 'tools/unified-import/stream-prepare-cli.mjs'), 'utf8');
    const replace = (before, after) => { assert.ok(source.includes(before), before); source = source.replaceAll(before, after); };
    replace('../../packages/application/src/unified-import-contract.ts', pathToFileURL(join(root, 'packages/application/src/unified-import-contract.ts')).href);
    replace('./source-registration.mjs', moduleUrl('export function deriveStandardSourceRegistration(){throw Error("UNEXPECTED_REGISTRATION")} export const createStandardSourceRegistration=deriveStandardSourceRegistration;'));
    replace('./stream-preflight.mjs', moduleUrl(`export async function streamPreflight(){return {checks_passed:${!preflightRejects},complete_package_validation:${!preflightRejects},manifest_sha256:'a'.repeat(64),counts:{},issue_count:${preflightRejects ? 1 : 0},timings_ms:{}}}`));
    replace('./stream-plan.mjs', moduleUrl(`export async function prepareStreamPlan(){return {sourceBindingMs:0,totals:{},async dispose(){${cleanupFails ? 'throw Error("synthetic-private-cleanup-detail")' : ''}}}}`));
    replace('./stream-program.mjs', moduleUrl(`export async function buildStreamProgram(){return {identity:{planSha256:'b'.repeat(64)},steps:(async function*(){${stepsFail ? 'throw Error("SYNTHETIC_STEP_FAILURE")' : ''}})()}}`));
    await writeFile(join(dir, 'stream-prepare-cli.mjs'), source);
    const args = help ? ['--help'] : ['--package', pkg, '--report', join(dir, 'report'), '--manifest-sha256', 'a'.repeat(64), '--target', join(dir, 'target.json'), '--admin', join(dir, 'admin.json'), '--allow-synthetic'];
    const result = spawnSync(process.execPath, [join(dir, 'cli.mjs'), 'stream-prepare', ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.stdout.trim().split('\n').length, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-cleanup-detail/);
    return { exit: result.status, output: JSON.parse(result.stdout) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('successful offline preparation with failed disposal keeps the result but exits nonzero', async () => {
  const result = await invoke({ cleanupFails: true });
  assert.equal(result.output.state, 'OFFLINE_PREPARED');
  assert.equal(result.output.local_cleanup, 'FAILED');
  assert.equal(result.output.execution_ready, false);
  assert.equal(result.output.business_database_writes, false);
  assert.equal(result.output.plan_sha256, 'b'.repeat(64));
  assert.equal(result.exit, 3);
});

test('successful offline preparation with acknowledged disposal still exits zero', async () => {
  const result = await invoke();
  assert.equal(result.output.state, 'OFFLINE_PREPARED');
  assert.equal(result.output.local_cleanup, undefined);
  assert.equal(result.exit, 0);
});

for (const cleanupFails of [false, true]) test(`preparation failure keeps failure exit even with cleanupFails=${cleanupFails}`, async () => {
  const result = await invoke({ stepsFail: true, cleanupFails });
  assert.equal(result.output.state, 'PREPARATION_FAILED');
  assert.equal(result.output.code, 'SYNTHETIC_STEP_FAILURE');
  assert.equal(result.output.local_cleanup, cleanupFails ? 'FAILED' : undefined);
  assert.equal(result.exit, 1);
});

test('preflight rejection remains a preparation failure rather than cleanup failure', async () => {
  const result = await invoke({ preflightRejects: true, cleanupFails: true });
  assert.equal(result.output.state, 'PREFLIGHT_REJECTED');
  assert.equal(result.output.local_cleanup, undefined);
  assert.equal(result.exit, 1);
});

test('offline help still exits zero without preparation or cleanup', async () => {
  const result = await invoke({ help: true, cleanupFails: true, stepsFail: true });
  assert.match(result.output.usage, /^stream-prepare /);
  assert.equal(result.output.scope, 'OFFLINE_ONLY_NO_DATABASE');
  assert.equal(result.exit, 0);
});
