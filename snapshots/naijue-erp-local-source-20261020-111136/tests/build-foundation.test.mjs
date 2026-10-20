import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {JSDOM} from 'jsdom';
import {createApp} from '../dist/server/app.js';
import {readConfig} from '../dist/server/config.js';
import {root, safeFile, fileRecords} from '../scripts/files.mjs';
import {assertReleasePath} from '../scripts/release-policy.mjs';

test('compiled foundation has validated health and no business/legacy routes', async () => {
  const app = createApp(readConfig({APP_ENV: 'local'}));
  try {
    const health = await app.inject({method: 'GET', url: '/api/health'});
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), {status: 'ok', environment: 'local', applicationStage: 'foundation', businessReady: false});
    for (const url of ['/api/command', '/api/reference', '/runtime/command', '/reference', '/sales']) {
      assert.equal((await app.inject({method: 'GET', url})).statusCode, 404);
      assert.equal((await app.inject({method: 'POST', url, payload: {actorId: 'local-admin'}})).statusCode, 404);
    }
  } finally { await app.close(); }
});

test('configuration rejects malformed ports/environments without database fallbacks', () => {
  for (const APP_PORT of ['0', '65536', '3.5', '-3', 'Infinity', '']) assert.throws(() => readConfig({APP_PORT}));
  assert.throws(() => readConfig({APP_ENV: 'demo'}));
  assert.equal(readConfig({}).port, 18878);
});

test('all HTML script/style paths, CSS fonts and relative module imports exist in the publication', () => {
  const web = resolve(root, 'dist/web');
  const html = readFileSync(safeFile(web, 'index.html'), 'utf8');
  const document = new JSDOM(html).window.document;
  let scripts = 0;
  for (const element of document.querySelectorAll('script[src],link[href]')) {
    const link = element.getAttribute('src') ?? element.getAttribute('href');
    if (!link || /^(?:https?:|data:|#)/.test(link)) continue;
    safeFile(web, link.split(/[?#]/)[0]);
    if (element.tagName === 'SCRIPT') scripts++;
  }
  assert.ok(scripts >= 40, `unexpected script count: ${scripts}`);
  for (const f of fileRecords(web)) {
    const file = resolve(web, f.path);
    if (f.path.endsWith('.css')) for (const m of readFileSync(file, 'utf8').matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) {
      if (/^(?:data:|https?:)/.test(m[1])) continue;
      assert.ok(existsSync(resolve(dirname(file), m[1].split(/[?#]/)[0])), m[1]);
    }
    if (/\.(?:js|mjs)$/.test(f.path) && !f.path.endsWith('.bundle.js')) for (const m of readFileSync(file, 'utf8').matchAll(/(?:from\s*|import\s*\(?)['"](\.[^'"]+)['"]/g)) {
      assert.ok(existsSync(resolve(dirname(file), m[1].split(/[?#]/)[0])), `${f.path}: ${m[1]}`);
    }
  }
  const release = JSON.parse(readFileSync(resolve(root, 'config/frontend-release.json')));
  assert.deepEqual(release.entries.map(entry => entry.name).sort(), [
    'basic-settings', 'export-workbench', 'future-preview', 'inventory-category', 'inventory-correction',
    'inventory-filters', 'inventory-select', 'product', 'reference-import', 'transfer-date', 'unified-single-select',
  ]);
  for (const e of release.entries) safeFile(web, e.output);
  assert.equal(existsSync(resolve(web, 'assets/product-media')), false);
});

test('release policy refuses originals, credentials, backups and private media', () => {
  for (const path of ['inputs/tplus.xlsx', 'web/credentials.json', 'web/.env', 'backup/current.dump', 'web/assets/product-media/a.jpg', 'server/private.key', 'references/server/api.mjs']) {
    assert.throws(() => assertReleasePath(path));
  }
});

test('actual strict backend build fails without emitted output for a type error', () => {
  const probe = resolve(root, 'server/t07-type-error-probe.ts');
  assert.equal(existsSync(probe), false);
  const task = process.env.ERP_TASK_ID ?? 'T07';
  assert.match(task,/^T\d{2}$/);
  const evidence = resolve(root, 'logs',task);
  mkdirSync(evidence, {recursive: true});
  try {
    writeFileSync(probe, 'export const invalid: string = 42;\n');
    const result = spawnSync(process.execPath, ['scripts/build-backend.mjs'], {cwd: root, encoding: 'utf8'});
    writeFileSync(resolve(evidence, 'strict-negative.log'), result.stdout + result.stderr);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /TS2322/);
    assert.equal(existsSync(resolve(root, 'dist/server')), false);
  } finally {
    rmSync(probe, {force: true});
    const repaired = spawnSync(process.execPath, ['scripts/build-backend.mjs'], {cwd: root, encoding: 'utf8'});
    writeFileSync(resolve(evidence, 'strict-restored.log'), repaired.stdout + repaired.stderr);
    assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
  }
});
