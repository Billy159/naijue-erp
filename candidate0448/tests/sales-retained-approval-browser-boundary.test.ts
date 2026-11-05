/** Browser bundle boundary: real shared proposal/rules graph, no Node polyfill. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
for (const entry of [
  '../apps/web/src/current-form/sales-proposal.ts',
  '../packages/application/src/native-sales-preparation.ts',
  '../packages/application/src/sales-retained-approval.ts',
]) test(`browser-safe ordinary shared validation: ${entry}`, async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true,
    platform: 'browser', format: 'esm', write: false, metafile: true, logLevel: 'silent' });
  assert.ok(result.outputFiles.length > 0);
  assert.ok(!Object.keys(result.metafile.inputs).some(path => path.endsWith('/request-hash.ts')),
    'Backend idempotency hashing must not enter shared browser validation');
  for (const output of result.outputFiles) assert.doesNotMatch(output.text, /node:crypto|createHash/);
});
