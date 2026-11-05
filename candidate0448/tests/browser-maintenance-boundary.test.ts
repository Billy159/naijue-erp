import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// The real browser settings adapter must not pull the server-only import pipeline
// into its bundle, even indirectly through shared validation.
test('organization settings maintenance adapter bundles for the browser', async () => {
  const entry = fileURLToPath(new URL('../apps/web/src/settings/stores/maintenance-http-client.ts', import.meta.url));
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'browser',
    format: 'esm', target: 'es2022', write: false, metafile: true, logLevel: 'silent' });
  for (const input of Object.keys(result.metafile.inputs)) {
    assert.doesNotMatch(input, /unified-import-contract|history-typed-closure/, input);
  }
});
