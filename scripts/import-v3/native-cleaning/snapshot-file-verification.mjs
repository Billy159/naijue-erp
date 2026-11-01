import {open, lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute, join} from 'node:path';
import {createHash} from 'node:crypto';
import {legacyReferenceTables} from './reference-snapshot-reader.mjs';
import {legacyInventoryEffectTables} from './inventory-effect-snapshot-reader.mjs';

const count = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const requireFact = (condition, message) => {if (!condition) throw new Error(message);};
const same = (a, b) => ['dev','ino','size','uid','mode','mtimeMs','ctimeMs'].every(key => a[key] === b[key]);

/** Independently reread private source files after capture. No DB, target writes
 * or business interpretation. The manifest hash must come from the adopted host
 * receipt, not be calculated by the caller from unreviewed local files.
 */
export async function verifyLegacyCleaningSnapshotFiles({directory, expectedManifestSha256, maxBytes, expectedUid, signal}) {
  requireFact(typeof directory === 'string' && isAbsolute(directory) && hash(expectedManifestSha256)
    && Number.isSafeInteger(maxBytes) && maxBytes > 0 && Number.isSafeInteger(expectedUid) && expectedUid >= 0, 'PRIVATE_SOURCE_VERIFICATION_INPUT_REQUIRED');
  const root = await lstat(directory);
  requireFact(root.isDirectory() && !root.isSymbolicLink() && root.uid === expectedUid && (root.mode & 0o777) === 0o700, 'PRIVATE_SOURCE_DIRECTORY_REFUSED');
  const snapshotPath = join(directory, 'SNAPSHOT.json'), markerPath = join(directory, 'COMPLETE.json');
  const before = await lstat(snapshotPath), marker = await lstat(markerPath);
  requireFact(before.isFile() && !before.isSymbolicLink() && marker.isFile() && !marker.isSymbolicLink()
    && before.dev === marker.dev && before.ino === marker.ino && before.uid === expectedUid && (before.mode & 0o777) === 0o600
    && before.size > 0 && before.size <= 262144, 'PRIVATE_SOURCE_COMPLETE_MARKER_REFUSED');
  const manifestHandle = await open(snapshotPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let manifest;
  try {
    const bytes = await manifestHandle.readFile();
    requireFact(same(before, await manifestHandle.stat()) && same(before, await lstat(snapshotPath))
      && createHash('sha256').update(bytes).digest('hex') === expectedManifestSha256, 'PRIVATE_SOURCE_MANIFEST_PIN_REFUSED');
    try {manifest = JSON.parse(new TextDecoder('utf8', {fatal:true}).decode(bytes));}
    catch {throw new Error('PRIVATE_SOURCE_MANIFEST_JSON_REFUSED');}
  } finally {await manifestHandle.close();}
  const receipt = manifest.receipt;
  requireFact(manifest.status === 'COMPLETE_SCOPED_PRIVATE_SNAPSHOT'
    && manifest.scope === '42_INVENTORY_EFFECT_TABLES_AND_EXACT_SIZE_MAPPING_SETTING_PLUS48_REFERENCES_AND_DOCUMENT_REVISION'
    && receipt?.status === 'COMPLETE_SCOPED_LEGACY_CLEANING_SNAPSHOT' && receipt.businessWrites === false
    && receipt.identity?.read_only === 'on' && receipt.identity?.isolation === 'repeatable read'
    && receipt.eof?.documents === true && receipt.eof?.revisions === true && receipt.currentPointersVerified === true, 'PRIVATE_SOURCE_SNAPSHOT_COMPLETION_REFUSED');
  const expectedRows = new Map();
  for (const [specifications, rows] of [[legacyReferenceTables,receipt.references],[legacyInventoryEffectTables,receipt.inventory]]) {
    requireFact(Array.isArray(rows) && rows.length === specifications.length, 'PRIVATE_SOURCE_TABLE_COVERAGE_REFUSED');
    rows.forEach((row,index) => {
      requireFact(row.table === specifications[index].table && row.keyKind === specifications[index].keyKind
        && count(row.expected) && row.expected === row.rowsRead && row.eofObserved === true, 'PRIVATE_SOURCE_TABLE_COMPLETION_REFUSED');
      expectedRows.set(row.table, row.rowsRead);
    });
  }
  for (const kind of ['documents','revisions']) {
    requireFact(count(receipt.counts?.[kind]), 'PRIVATE_SOURCE_DOCUMENT_COUNT_REFUSED');
    expectedRows.set(`erp_prod_runtime.${kind === 'documents' ? 'document' : 'revision'}`, receipt.counts[kind]);
  }
  requireFact(Array.isArray(manifest.files) && manifest.files.length === expectedRows.size && expectedRows.size === 93, 'PRIVATE_SOURCE_FILE_COVERAGE_REFUSED');
  let totalBytes = 0, totalRows = 0n;
  const seen = new Set(), buffer = Buffer.allocUnsafe(65536);
  for (const file of manifest.files) {
    signal?.throwIfAborted();
    requireFact(expectedRows.has(file.table) && !seen.has(file.table) && file.filename === `${file.table}.ndjson`
      && file.rows === expectedRows.get(file.table) && Number.isSafeInteger(file.bytes) && file.bytes >= 0 && hash(file.sha256), 'PRIVATE_SOURCE_FILE_METADATA_REFUSED');
    seen.add(file.table);
    requireFact(file.bytes <= maxBytes - totalBytes, 'PRIVATE_SOURCE_BYTE_BUDGET_EXCEEDED');
    const path = join(directory, file.filename), prior = await lstat(path);
    requireFact(prior.isFile() && !prior.isSymbolicLink() && prior.uid === expectedUid && (prior.mode & 0o777) === 0o600 && prior.size === file.bytes, 'PRIVATE_SOURCE_FILE_PROTECTION_REFUSED');
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytesRead = 0, lineCount = 0n, lastByte = -1;
    const digest = createHash('sha256');
    try {
      requireFact(same(prior, await handle.stat()), 'PRIVATE_SOURCE_FILE_CHANGED');
      for (;;) {
        signal?.throwIfAborted();
        const chunk = await handle.read(buffer, 0, buffer.length, null);
        if (!chunk.bytesRead) break;
        bytesRead += chunk.bytesRead;
        requireFact(bytesRead <= file.bytes, 'PRIVATE_SOURCE_FILE_CHANGED');
        const view = buffer.subarray(0, chunk.bytesRead); digest.update(view);
        for (let at = view.indexOf(10); at !== -1; at = view.indexOf(10, at + 1)) lineCount++;
        lastByte = view[view.length - 1];
      }
      requireFact(same(prior, await handle.stat()) && same(prior, await lstat(path)) && bytesRead === file.bytes, 'PRIVATE_SOURCE_FILE_CHANGED');
    } finally {await handle.close();}
    requireFact(digest.digest('hex') === file.sha256, 'PRIVATE_SOURCE_FILE_DIGEST_MISMATCH');
    requireFact(lineCount.toString() === file.rows && (bytesRead === 0 || lastByte === 10), 'PRIVATE_SOURCE_FILE_ROW_COUNT_MISMATCH');
    totalBytes += bytesRead; totalRows += lineCount;
  }
  requireFact(totalBytes === manifest.totalBytes && before.size <= maxBytes - totalBytes
    && same(root, await lstat(directory)) && same(before, await lstat(markerPath)), 'PRIVATE_SOURCE_FINAL_CLOSURE_REFUSED');
  return {status:'VERIFIED_SCOPED_PRIVATE_SOURCE_FILES', files:seen.size, rows:totalRows.toString(),
    sourceFileBytes:totalBytes, manifestSha256:expectedManifestSha256, databaseConnections:0, targetWrites:0,
    semanticConversionVerified:false, independentTargetReadbackVerified:false};
}
