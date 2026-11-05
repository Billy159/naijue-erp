import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const file = new URL('./integration/whole-package-acceptance-admission.mjs', import.meta.url);
test('acceptance admission obtains fixed trusted installation and source records, not caller authority', async () => {
  const s = await readFile(file, 'utf8');
  assert.match(s, /loadWholeCatalogSpec\(root\)/);
  assert.match(s, /loadWholeInstallationRecord\(spec\)/);
  assert.match(s, /verifyWholeInstalledCatalog\(client, spec, reviewed\)/);
  assert.match(s, /export async function admitWholePackageAcceptanceTarget\(client\)/);
  assert.doesNotMatch(s, /process\.env|catalog_sha256\s*=|createHash|new Client|new Pool|writeFile/);
});
test('catalog observation is rollback-only and cannot substitute for approval', async () => {
  const s = await readFile(file, 'utf8');
  assert.match(s, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(s, /await client\.query\('ROLLBACK'\)/);
  assert.doesNotMatch(s, /query\('COMMIT'\)/);
  assert.match(s, /await client\.end\(\)/);
  assert.ok(s.indexOf('loadWholeInstallationRecord(spec)') < s.indexOf("client.query('BEGIN"));
});

test('direct-commit engine runner requires trusted admission before initialization', async () => {
  const s = await readFile(new URL('./integration/whole-package-direct-commit.mjs', import.meta.url), 'utf8');
  assert.ok(s.indexOf('await admitWholePackageAcceptanceTarget(writer)') < s.indexOf("await call(writer, 'SELECT naijue_erp.standard_whole_package_prepare_v2"));
  assert.equal((s.match(/await admitWholePackageAcceptanceTarget\(writer\)/g) || []).length, 1);
});
test('explicit successor helper cannot fall back to original installation authority', async () => {
  const s = (await readFile(file, 'utf8')).split('export async function admitWholeBatchClosureAcceptanceTargetV1')[1];
  assert.ok(s); assert.match(s, /loadWholeBatchClosureSpecV1\(root\)/);
  assert.match(s, /verifyWholeBatchClosureInstalledV1\(client, spec\)/);
  assert.doesNotMatch(s, /loadWholeInstallationRecord|verifyWholeInstalledCatalog|return.*true/);
  assert.ok(s.indexOf("ack(await client.query('ROLLBACK'), 'ROLLBACK')") < s.indexOf('return admission'));
});
