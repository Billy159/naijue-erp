import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRESH35_RECEIVER_TARGET_PROFILE, FRESH35_RECEIVER_BLOCK_CODE, FRESH35_RECEIVER_CAPABILITY, fresh35ReceiverBlocked } from '../tools/unified-import/fresh35-receiver-diagnostics.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'tools/unified-import/cli.mjs');
const commands = ['stream-import', 'whole-import', 'stream-verify'];
function run(args: string[], env = process.env) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', env });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null, result.stderr);
  return { ...result, value: JSON.parse(result.stdout) };
}

test('Fresh35 diagnostic identifies the actual refusing host without creating admission', async () => {
  const contract = await import(new URL('../scripts/release/unified-install/fresh35-catalog-contract.mjs', import.meta.url).href);
  const host = await import(new URL('../tools/unified-import/fresh35-host-session.mjs', import.meta.url).href);
  assert.equal(FRESH35_RECEIVER_TARGET_PROFILE, contract.FRESH35_CATALOG_PROFILE);
  let touched = false;
  await assert.rejects(host.openReviewedFresh35Host(new Proxy({}, { get() { touched = true; throw Error('must not read'); } }), root), { message: FRESH35_RECEIVER_BLOCK_CODE });
  assert.equal(touched, false);
  assert.equal(FRESH35_RECEIVER_CAPABILITY.state, 'HOST_IMPLEMENTED_REQUIRES_PROTECTED_RECORD');
  assert.equal(FRESH35_RECEIVER_CAPABILITY.host_wired,true);
  assert.equal(FRESH35_RECEIVER_CAPABILITY.fixed_installation_record_implemented,true);
  for (const key of ['installation_ready', 'target_admitted', 'public_cli_end_to_end_validated', 'automatic_fallback'] as const) assert.equal(FRESH35_RECEIVER_CAPABILITY[key], false, key);
  assert.ok(Object.isFrozen(FRESH35_RECEIVER_CAPABILITY));
  const blocked = fresh35ReceiverBlocked(FRESH35_RECEIVER_TARGET_PROFILE);
  assert.ok(Object.isFrozen(blocked));
  assert.ok(Object.isFrozen(blocked.verification));
  assert.throws(() => fresh35ReceiverBlocked('ORIGINAL177'), /OPTION_INVALID/);
});

test('capability report exposes unavailable Fresh35 separately and preserves old historical capabilities', () => {
  const result = run(['capability-report']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.value.fresh35_execution, FRESH35_RECEIVER_CAPABILITY);
  assert.deepEqual(result.value.historical_sales_execution, {
    ordinary_package_command: 'whole-import', whole_package_command: 'whole-import', streaming_command: 'stream-import', verification_command: 'stream-verify',
    legacy_step_commands_supported: false, installed_record_required: true, public_cli_end_to_end_validated: false,
  });
});

test('all whole-package command help distinguishes target-profile refusal from package schema selection', () => {
  for (const command of commands) {
    const result = run([command, '--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.value.usage, /--target-profile FRESH35_RETIRED152_V1/);
    assert.deepEqual(result.value.fresh35_execution, FRESH35_RECEIVER_CAPABILITY);
    assert.equal(result.value.postgresql_acceptance, 'NOT_RUN');
  }
});

test('explicit Fresh35 selection refuses before package, private inputs, report or connection access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fresh35-cli-refusal-'));
  try {
    for (const command of commands) {
      const report = join(dir, command + '-report');
      const result = run([command, '--target-profile', FRESH35_RECEIVER_TARGET_PROFILE,
        '--package', join(dir, 'MUST_NOT_READ_PACKAGE'), '--report', report,
        '--manifest-sha256', 'a'.repeat(64), '--target', join(dir, 'MUST_NOT_READ_TARGET'),
        '--admin', join(dir, 'MUST_NOT_READ_ADMIN'), '--connection', join(dir, 'MUST_NOT_READ_CONNECTION'),
        '--scrypt-file', join(dir, 'MUST_NOT_READ_SCRYPT'), '--ack-exclusive-ddl-window'],
      { ...process.env, DATABASE_URL: 'synthetic-invalid-never-read' });
      assert.equal(result.status, 1, result.stderr);
      assert.deepEqual(result.value, fresh35ReceiverBlocked(FRESH35_RECEIVER_TARGET_PROFILE));
      assert.equal(result.value.state, 'NOT_STARTED');
      assert.equal(result.value.code, FRESH35_RECEIVER_BLOCK_CODE);
      assert.doesNotMatch(result.stdout, /MUST_NOT_READ|synthetic-invalid-never-read/);
      await assert.rejects(lstat(report), { code: 'ENOENT' });
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('direct entries reject Fresh35 without credentials while unchanged and unknown routes remain closed', async () => {
  const entry = await import(new URL('../tools/unified-import/stream-import-cli.mjs', import.meta.url).href);
  for (const fn of [entry.runStreamImport, entry.runWholeImport, entry.runStreamVerify]) {
    assert.deepEqual(await fn(['--target-profile', FRESH35_RECEIVER_TARGET_PROFILE]), fresh35ReceiverBlocked(FRESH35_RECEIVER_TARGET_PROFILE));
    await assert.rejects(fn([]), /OPTION_REQUIRED/);
    await assert.rejects(fn(['--target-profile', 'ORIGINAL177']), /OPTION_INVALID/);
    await assert.rejects(fn(['--target-profile', 'WHOLE_SALES_V1']), /OPTION_INVALID/);
    await assert.rejects(fn(['--target-profile', FRESH35_RECEIVER_TARGET_PROFILE, '--target-profile', FRESH35_RECEIVER_TARGET_PROFILE]), /OPTION_INVALID/);
    await assert.rejects(fn(['--target-profile']), /OPTION_INVALID/);
    await assert.rejects(fn(['--target-profile', FRESH35_RECEIVER_TARGET_PROFILE, '--force']), /OPTION_INVALID/);
  }
  await assert.rejects(entry.runWholeImport(['--target-profile', FRESH35_RECEIVER_TARGET_PROFILE, '--coalesce']), /OPTION_INVALID/);
  await assert.rejects(entry.runStreamVerify(['--target-profile', FRESH35_RECEIVER_TARGET_PROFILE, '--inspect-only']), /OPTION_INVALID/);
});

test('production REAL selector and preparation retain protected-record refusal with no historical fallback',async()=>{
 const {FRESH35_PRODUCTION_REAL_IMPORT_PROFILE:profile,FRESH35_PRODUCTION_REAL_IMPORT_CAPABILITY:capability}=await import('../tools/unified-import/fresh35-receiver-diagnostics.ts');
 for(const command of ['stream-import','stream-verify']){
  const result=run([command,'--target-profile',profile]);assert.equal(result.status,1);assert.deepEqual(result.value,fresh35ReceiverBlocked(profile));assert.equal(result.value.target_profile,profile);
 }
 const prepared=run(['stream-import','--target-profile',profile,'--prepare-only']);assert.equal(prepared.status,1);assert.equal(prepared.value.connection_attempted,false);
 assert.equal(capability.requires_external_exact_batch_authorization,true);assert.equal(capability.production_execution_validated,false);
 const entry=await import(new URL('../tools/unified-import/stream-import-cli.mjs',import.meta.url).href);
 for(const argv of [['--target-profile',profile,'--allow-synthetic'],['--prepare-only'],['--target-profile',FRESH35_RECEIVER_TARGET_PROFILE,'--prepare-only']])await assert.rejects(entry.runStreamImport(argv),/OPTION_INVALID/);
 await assert.rejects(entry.runWholeImport(['--target-profile',profile]),/OPTION_INVALID/);
 await assert.rejects(entry.runStreamVerify(['--target-profile',profile,'--prepare-only']),/OPTION_INVALID/);
});
