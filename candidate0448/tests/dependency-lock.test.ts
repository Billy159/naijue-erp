import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('dependency verification rejects incomplete optional lock entries even with an installed tree', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const fixture = mkdtempSync(join(tmpdir(), 'naijue-lock-verification-'));
  try {
    mkdirSync(join(fixture, 'scripts'));
    copyFileSync(join(root, 'package.json'), join(fixture, 'package.json'));
    copyFileSync(join(root, 'package-lock.json'), join(fixture, 'package-lock.json'));
    copyFileSync(join(root, 'scripts/verify-dependencies.mjs'), join(fixture, 'scripts/verify-dependencies.mjs'));
    symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    const run = () => spawnSync(process.execPath, [join(fixture, 'scripts/verify-dependencies.mjs')], { encoding: 'utf8' });
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    const path = join(fixture, 'package-lock.json');
    const lock = JSON.parse(readFileSync(path, 'utf8'));
    lock.packages['node_modules/esbuild/node_modules/@esbuild/test-placeholder'] = { dev: true, optional: true };
    writeFileSync(path, JSON.stringify(lock));
    const invalid = run();
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /test-placeholder: locked version is missing/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
