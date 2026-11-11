import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const env = { PATH: process.env.PATH, LC_ALL: 'C', TZ: 'UTC' };
const entries = [
  'scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',
  'scripts/release/unified-install/fresh35-production-entry-v2.mjs',
  'apps/api/src/production-main.ts',
  'tools/unified-import/fresh35-host-session.mjs',
  'tools/unified-import/execution-client.ts',
  'tools/unified-import/execution-v2-admission.ts',
  'packages/application/src/unified-import-execution-v2-client.ts',
];

for (const entry of entries) {
  test(`loads ${entry} in a fresh Node process`, () => {
    // Keep argv[1] distinct from the entry so importing does not start it.
    const child = spawnSync(process.execPath, [
      '--input-type=module', '-e', 'await import(process.argv[2])',
      'cold-import', `./${entry}`,
    ], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, '');
  });
}

test('the public import CLI reaches its offline help', () => {
  const child = spawnSync(process.execPath, ['tools/unified-import/cli.ts', '--help'],
    { cwd: root, env, encoding: 'utf8', timeout: 10000 });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).offline, true);
});

test('v1 and v2 keep the original protocol and a single error class', async () => {
  const v1 = await import('../packages/application/src/unified-import-execution.ts');
  const core = await import('../packages/application/src/unified-import-execution-core.ts');
  const v2 = await import('../packages/application/src/unified-import-execution-v2-client.ts');
  assert.equal(v1.STANDARD_IMPORT_PROTOCOL, 'STANDARD_IMPORT_SQL_V1');
  assert.equal(v2.SOURCE49_PROFILE.base_target.protocol, v1.STANDARD_IMPORT_PROTOCOL);
  assert.equal(v1.UnifiedImportExecutionError, core.UnifiedImportExecutionError);
  assert(new v2.V2CommittedReplyError('test') instanceof v1.UnifiedImportExecutionError);
});
