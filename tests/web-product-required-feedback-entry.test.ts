import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('the real product required-feedback DOM regression is included in check:web', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.scripts['test:web:product:required'],
    'node --test tests/web-product-required-feedback.test.mjs tests/web-product-empty-season-fixture.test.mjs');
  const entries = manifest.scripts['check:web'].split(' && ');
  assert.equal(entries.filter((entry: string) => entry === 'npm run test:web:product:required').length, 1);
});
