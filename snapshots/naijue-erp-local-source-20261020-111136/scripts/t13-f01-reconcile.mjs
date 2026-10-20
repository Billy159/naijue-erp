import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {closeSync, copyFileSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.cwd();
const version = 'F01-20261004-v01';
const output = resolve(root, 'outputs/T13', version);
const logDir = resolve(root, 'logs/T13', version);
const indexPath = resolve(root, 'var/media/local/local/registered/t07-media-index.json');
const backupPath = resolve(output, 'registered-index-before.json');
const afterPath = resolve(output, 'registered-index-after.json');
const logPath = resolve(logDir, 'run.log');
const expectedOld = 'b8bcfe3eb43f6a7be0c60a6b6fb99e2ed5dd5';
const DB_ENV = /^(?:POSTGRES_|PGHOST$|PGPORT$|PGDATABASE$|PGUSER$|PGPASSWORD$|PGPASSFILE$|PGSERVICE$|DATABASE_URL$)/;
const report = {task: 'T13-F01', version, status: 'RUNNING', databaseConnections: 0, serverOperations: 0,
  realBusinessDatabaseConnections: 0, frozenDemoAccess: 0, checks: [], errors: []};

function sha256(bytes) {return createHash('sha256').update(bytes).digest('hex');}
function fileSha256(path) {return sha256(readFileSync(path));}
function record(name, details = {}) {report.checks.push({name, status: 'PASS', ...details});}
function checkPrivateRegularFile(path) {
  const info = lstatSync(path);
  assert(info.isFile() && !info.isSymbolicLink(), 'EXPECTED_PRIVATE_REGULAR_FILE');
  assert.equal(info.uid, process.getuid?.(), 'FILE_OWNER_MISMATCH');
  assert.equal(info.mode & 0o077, 0, 'FILE_MODE_NOT_PRIVATE');
  return info;
}
function checkRegularSourceFile(path) {
  const info = lstatSync(path);
  assert(info.isFile() && !info.isSymbolicLink(), 'EXPECTED_REGULAR_SOURCE_FILE');
  return info;
}
function checkPrivateDirectory(path) {
  const info = lstatSync(path);
  assert(info.isDirectory() && !info.isSymbolicLink(), 'EXPECTED_PRIVATE_DIRECTORY');
  assert.equal(info.uid, process.getuid?.(), 'DIRECTORY_OWNER_MISMATCH');
  assert.equal(info.mode & 0o077, 0, 'DIRECTORY_MODE_NOT_PRIVATE');
  return info;
}
function deepWithoutBaseline(value) {
  if (Array.isArray(value)) return value.map(deepWithoutBaseline);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'frozenBaselineCommit')
    .map(([key, child]) => [key, deepWithoutBaseline(child)]));
}
function writeJson(path, value) {writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});}
function atomicReplace(path, contents) {
  const temp = path + '.f01-' + randomUUID() + '.tmp';
  const fd = openSync(temp, 'wx', 0o600);
  try {writeFileSync(fd, contents); fsyncSync(fd);} finally {closeSync(fd);}
  renameSync(temp, path);
  const dirFd = openSync(resolve(path, '..'), 'r');
  try {fsyncSync(dirFd);} finally {closeSync(dirFd);}
}
function fileInside(base, relativePath) {
  assert(!isAbsolute(relativePath) && !relativePath.split(/[\\/]/).includes('..'), 'MEDIA_RELATIVE_PATH_INVALID');
  const full = resolve(base, relativePath), rel = relative(base, full);
  assert(rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), 'MEDIA_PATH_ESCAPE');
  return full;
}
function mediaHashLedger(manifestRows, indexRows) {
  const sourceBase = root;
  const mediaRoot = resolve(root, 'var/media/local/local');
  const indexBySource = new Map(indexRows.map(row => [row.source, row]));
  const sourceManifestByProductAndHash = new Set(manifestRows.filter(row => !row.source.endsWith('.thumb.jpg'))
    .map(row => `${row.source.split('/')[3]}|${row.sha256}`));
  const ledger = [];
  for (const registered of manifestRows) {
    const row = indexBySource.get(registered.source);
    assert(row, 'REGISTERED_INDEX_ENTRY_MISSING');
    const sourcePath = fileInside(sourceBase, registered.source);
    const sourceInfo = checkRegularSourceFile(sourcePath);
    const sourceBytes = readFileSync(sourcePath);
    const sourceDigest = sha256(sourceBytes);
    assert.equal(sourceInfo.size, registered.bytes, 'REGISTERED_SOURCE_SIZE_MISMATCH');
    assert.equal(sourceDigest, registered.sha256, 'REGISTERED_SOURCE_HASH_MISMATCH');
    assert.equal(row.sourceSha256, registered.sha256, 'INDEX_SOURCE_HASH_MISMATCH');
    assert.equal(row.bytes, registered.bytes, 'INDEX_SOURCE_SIZE_MISMATCH');
    const objectPath = fileInside(mediaRoot, row.storageKey);
    const objectInfo = checkPrivateRegularFile(objectPath);
    const objectBytes = readFileSync(objectPath);
    const objectDigest = sha256(objectBytes);
    assert.equal(objectInfo.size, registered.bytes, 'PERSISTENT_OBJECT_SIZE_MISMATCH');
    assert.equal(objectDigest, registered.sha256, 'PERSISTENT_OBJECT_HASH_MISMATCH');
    const isOriginal = !registered.source.endsWith('.thumb.jpg');
    if (!isOriginal) assert(sourceManifestByProductAndHash.has(`${row.productCode}|${row.linkedOriginalSha256}`), 'LINKED_ORIGINAL_IDENTITY_MISSING');
    let generatedThumbnail = null;
    if (isOriginal) {
      assert(row.generatedThumbnailKey, 'GENERATED_THUMBNAIL_KEY_MISSING');
      const thumbnailPath = fileInside(mediaRoot, row.generatedThumbnailKey);
      const thumbnailInfo = checkPrivateRegularFile(thumbnailPath);
      const thumbnailBytes = readFileSync(thumbnailPath);
      generatedThumbnail = {path: row.generatedThumbnailKey, bytes: thumbnailInfo.size, sha256: sha256(thumbnailBytes)};
    } else assert.equal(row.generatedThumbnailKey, null, 'LEGACY_THUMBNAIL_HAS_GENERATED_VARIANT');
    ledger.push({source: registered.source, variant: isOriginal ? 'original' : 'legacy-thumbnail',
      sourceBytes: sourceInfo.size, sourceSha256: sourceDigest, storageKey: row.storageKey,
      persistentBytes: objectInfo.size, persistentSha256: objectDigest, generatedThumbnail});
  }
  return ledger;
}

try {
  assert(!Object.keys(process.env).some(key => DB_ENV.test(key)), 'DATABASE_ENVIRONMENT_FORBIDDEN');
  checkPrivateRegularFile(backupPath);
  const opening = JSON.parse(readFileSync(resolve(output, 'OPENING-SNAPSHOT.json'), 'utf8'));
  assert.equal(opening.task, 'T13-F01');
  assert.equal(opening.version, version);
  assert.equal(opening.status, 'OPENING_SNAPSHOT_SAVED');
  assert.equal(fileSha256(backupPath), opening.sha256.index, 'OWN_OLD_INDEX_SNAPSHOT_HASH_MISMATCH');
  assert.equal(fileSha256(resolve(output, 'store-before.ts')), opening.sha256.source, 'OWN_OLD_SOURCE_SNAPSHOT_HASH_MISMATCH');
  assert(!existsSync(afterPath) && !existsSync(resolve(output, 'RESULT.json')), 'VERSION_OUTPUT_ALREADY_EXISTS');
  record('版本化开工快照已保存，旧索引和旧生成源码副本摘要一致', {indexSha256: opening.sha256.index, sourceSha256: opening.sha256.source});

  const {FROZEN_BASELINE_COMMIT, registeredMediaIndexRecord} = await import(pathToFileURL(resolve(root, 'server/media/store.ts')));
  const taskContext = JSON.parse(readFileSync(resolve(root, 'outputs/T07/task-context.json'), 'utf8'));
  const finding = JSON.parse(readFileSync(resolve(root, 'outputs/主控/T13整项主控验收-20261004-01/FINDING-T13-F01.json'), 'utf8'));
  const projectInstructions = readFileSync(resolve(root, 'AGENTS.md'), 'utf8');
  const authoritativeBaseline = taskContext.baselineCommit;
  assert.equal(authoritativeBaseline, 'b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3');
  assert(projectInstructions.includes(authoritativeBaseline), 'PROJECT_BASELINE_AUTHORITY_MISSING');
  assert.equal(finding.expectedBaselineCommit, authoritativeBaseline, 'CONTROLLER_FINDING_AUTHORITY_MISMATCH');
  assert.equal(FROZEN_BASELINE_COMMIT, authoritativeBaseline, 'GENERATOR_BASELINE_MISMATCH');
  assert.equal(finding.actualBaselineCommit, expectedOld, 'FINDING_OLD_VALUE_MISMATCH');
  record('修正值由项目说明、T07 task-context 与主控 finding 三方一致确认', {baselineCommit: authoritativeBaseline});

  const synthetic = {source: 'frontend/assets/product-media/SYNTHETIC/' + 'a'.repeat(64) + '.jpg', productCode: 'SYNTHETIC',
    variant: 'original', sourceSha256: 'a'.repeat(64), linkedOriginalSha256: 'a'.repeat(64), bytes: 321,
    role: null, colorName: null, sortOrder: null, storageKey: 'objects/aa/' + 'a'.repeat(64) + '.jpg',
    generatedThumbnailKey: 'thumbnails/aa/' + 'a'.repeat(64) + '.webp'};
  const generated = registeredMediaIndexRecord(synthetic);
  assert.equal(generated.frozenBaselineCommit, authoritativeBaseline);
  assert.deepEqual(Object.fromEntries(Object.entries(generated).filter(([key]) => key !== 'frozenBaselineCommit')), synthetic);
  record('合成登记验证通过：新登记写入权威基线，其他媒体身份字段及未知值不变', {syntheticSource: synthetic.source,
    frozenBaselineCommit: generated.frozenBaselineCommit, preservedUnknowns: {role: generated.role, colorName: generated.colorName, sortOrder: generated.sortOrder}});
  writeJson(resolve(output, 'SYNTHETIC-REGISTRATION.json'), {status: 'PASS', authoritativeBaseline,
    input: synthetic, generated, nonBaselineFieldsPreserved: true});

  const currentInfo = checkPrivateRegularFile(indexPath);
  const currentBytes = readFileSync(indexPath);
  const current = JSON.parse(currentBytes.toString('utf8'));
  const controllerSnapshot = JSON.parse(readFileSync(resolve(root, 'outputs/主控/T13整项主控验收-20261004-01/registered-index-before.json'), 'utf8'));
  assert.deepEqual(current, controllerSnapshot, 'CURRENT_INDEX_DIFFERS_FROM_REVIEW_SNAPSHOT');
  assert.equal(sha256(currentBytes), opening.sha256.index, 'CURRENT_INDEX_CHANGED_AFTER_OPENING_SNAPSHOT');
  assert.equal(current.version, 1);
  assert.equal(current.sourceManifest, 'outputs/T07/copied-source-manifest.json');
  assert.equal(current.environment, 'local');
  assert(Array.isArray(current.records));
  assert.equal(current.records.length, 134);
  const manifest = JSON.parse(readFileSync(resolve(root, 'outputs/T07/copied-source-manifest.json'), 'utf8'))
    .filter(row => row.source.startsWith('frontend/assets/product-media/'));
  assert.equal(manifest.length, 134);
  assert.equal(new Set(manifest.map(row => row.source)).size, 134);
  assert.equal(new Set(current.records.map(row => row.source)).size, 134);
  assert.deepEqual(current.records.map(row => row.source), manifest.map(row => row.source), 'REGISTERED_INDEX_ORDER_OR_IDENTITY_MISMATCH');
  const badBaselineRecords = current.records.filter(row => row.frozenBaselineCommit !== expectedOld);
  assert.equal(badBaselineRecords.length, 0, 'UNEXPECTED_BASELINE_VALUES_REFUSE_GUESSING');
  assert.equal(finding.affectedCurrentIndexRecords, 134);
  assert.equal(finding.mediaHashesValidated, 134);
  checkPrivateDirectory(resolve(indexPath, '..'));
  record('当前本地索引与主控旧索引副本逐字节相同；134 条记录均为已知错误值', {
    beforeIndexSha256: sha256(currentBytes), records: current.records.length, fileMode: (currentInfo.mode & 0o777).toString(8)});

  const mediaBefore = mediaHashLedger(manifest, current.records);
  assert.equal(mediaBefore.filter(row => row.variant === 'original').length, 67);
  assert.equal(mediaBefore.filter(row => row.variant === 'legacy-thumbnail').length, 67);
  assert.equal(mediaBefore.reduce((sum, row) => sum + row.sourceBytes, 0), 30_542_418);
  assert.equal(mediaBefore.filter(row => row.generatedThumbnail !== null).length, 67);
  writeJson(resolve(output, 'MEDIA-HASH-LEDGER-BEFORE.json'), mediaBefore);
  record('134 个源文件与持久对象逐项哈希/字节相同，67 个生成缩略图均有基线摘要', {
    registeredFiles: mediaBefore.length, originals: 67, legacyThumbnails: 67, generatedThumbnails: 67,
    sourceBytes: mediaBefore.reduce((sum, row) => sum + row.sourceBytes, 0),
    sourceAndObjectHashMatches: mediaBefore.length, generatedThumbnailHashes: 67});

  const corrected = {...current, records: current.records.map(row => ({...row, frozenBaselineCommit: authoritativeBaseline}))};
  const changedFields = current.records.flatMap((row, index) => row.frozenBaselineCommit === corrected.records[index].frozenBaselineCommit ? [] : [{
    source: row.source, field: 'frozenBaselineCommit', before: row.frozenBaselineCommit, after: corrected.records[index].frozenBaselineCommit}]);
  assert.equal(changedFields.length, 134, 'UNEXPECTED_CORRECTION_CARDINALITY');
  assert.deepEqual(deepWithoutBaseline(corrected), deepWithoutBaseline(current), 'NON_BASELINE_METADATA_WOULD_CHANGE');
  writeJson(resolve(output, 'INDEX-FIELD-DIFF.json'), changedFields);

  const nextBytes = Buffer.from(JSON.stringify(corrected, null, 2) + '\n');
  atomicReplace(indexPath, nextBytes);
  copyFileSync(indexPath, afterPath);
  const afterInfo = checkPrivateRegularFile(indexPath);
  const after = JSON.parse(readFileSync(indexPath, 'utf8'));
  assert.equal(afterInfo.mode & 0o077, 0, 'CORRECTED_INDEX_PERMISSION_CHANGED');
  assert.equal(fileSha256(afterPath), fileSha256(indexPath));
  assert.equal(after.records.length, 134);
  assert(after.records.every(row => row.frozenBaselineCommit === authoritativeBaseline), 'CORRECTED_BASELINE_NOT_UNIFORM');
  assert.deepEqual(deepWithoutBaseline(after), deepWithoutBaseline(current), 'INDEX_OTHER_FIELDS_CHANGED');
  assert.deepEqual(after, corrected, 'CORRECTED_INDEX_DIFFERS_FROM_PRECOMPUTED_SAFE_CHANGE');
  const mediaAfter = mediaHashLedger(manifest, after.records);
  assert.deepEqual(mediaAfter, mediaBefore, 'MEDIA_OR_THUMBNAIL_HASH_CHANGED_DURING_METADATA_CORRECTION');
  writeJson(resolve(output, 'MEDIA-HASH-LEDGER-AFTER.json'), mediaAfter);
  writeJson(resolve(output, 'INDEX-FIELD-RECONCILIATION.json'), {
    beforeIndexSha256: sha256(currentBytes), afterIndexSha256: fileSha256(indexPath), records: 134,
    changedFields: changedFields.length, onlyChangedField: 'frozenBaselineCommit',
    oldValue: expectedOld, newValue: authoritativeBaseline, otherRecordFieldsIdentical: true,
    topLevelFieldsIdentical: true, mediaLedgerIdentical: true});
  record('本地索引原子元信息纠正完成：只改 134 条 frozenBaselineCommit，媒体 ledger 前后完全一致', {
    changedFields: changedFields.length, beforeIndexSha256: sha256(currentBytes), afterIndexSha256: fileSha256(indexPath),
    sourceAndObjectHashesPreserved: 134, generatedThumbnailHashesPreserved: 67});

  report.status = 'PASS';
  report.finishedAt = '2026-10-04';
} catch (error) {
  report.status = 'FAIL';
  report.errors.push({code: error?.message ?? 'UNKNOWN', stack: error?.stack ?? null});
  process.exitCode = 1;
} finally {
  writeJson(resolve(output, 'RESULT.json'), report);
  const lines = [`T13-F01 ${report.status}`, ...report.checks.map(item => `PASS ${item.name}`),
    ...report.errors.map(item => `FAIL ${item.code}`)];
  writeFileSync(logPath, lines.join('\n') + '\n', {mode: 0o600});
  writeJson(resolve(logDir, 'RESULT.json'), report);
  console.log(`T13-F01 ${report.status}; checks=${report.checks.length}; databaseConnections=0; serverOperations=0`);
}
