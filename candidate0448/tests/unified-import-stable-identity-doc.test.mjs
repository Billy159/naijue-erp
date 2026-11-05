import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);

test('stable identity documentation example executes SKU, line and settlement reconstruction assertions', async () => {
 const root = new URL('../', import.meta.url);
 const document = await readFile(new URL('docs/unified-import/STABLE-IDENTITY-V1.md', root), 'utf8');
 const examples = [...document.matchAll(/```sh\nnode --input-type=module <<'JS'\n([\s\S]*?)\nJS\n```/g)];
 assert.equal(examples.length, 1, 'The documented executable example must remain present and unambiguous');
 const {stdout} = await run(process.execPath, ['--input-type=module', '--eval', examples[0][1]], {
  cwd: root,
  timeout: 30_000,
 });
 assert.deepEqual(JSON.parse(stdout), {
  synthetic_skus: 131,
  duplicate_occurrences: 2,
  settlement_occurrences: 2,
  settlement_rebuild: 'stable',
  unknown_activation: 'rejected',
  transfer_identity: 'matched',
 });
});
