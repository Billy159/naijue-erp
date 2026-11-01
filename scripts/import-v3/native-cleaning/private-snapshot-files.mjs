import {mkdir, open, link} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import {createHash} from 'node:crypto';
import {legacyReferenceTables} from './reference-snapshot-reader.mjs';
import {readLegacyDocumentAndReferenceSnapshot} from './document-snapshot-reader.mjs';

/** Private provisional source files, not an import authorization or target writer.
 * A new caller-owned directory is mandatory. Existing files are never replaced.
 * COMPLETE.json links to a fully flushed manifest after EOF/count/pointer/ROLLBACK success.
 * Failure retains an incomplete private directory; it cannot be consumed as complete.
 */
export async function captureLegacyDocumentAndReferenceSnapshot(pool, {
  directory, maxBytes, pageRows = 16, signal,
}) {
  if (typeof directory !== 'string' || !isAbsolute(directory)) throw new Error('ABSOLUTE_PRIVATE_SNAPSHOT_DIRECTORY_REQUIRED');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('EXPLICIT_PRIVATE_SNAPSHOT_BYTE_BUDGET_REQUIRED');
  signal?.throwIfAborted();
  // No recursive mkdir: caller must choose/protect the parent outside source/Git.
  await mkdir(directory, {mode: 0o700});
  const tables = [...legacyReferenceTables.map(row => row.table), 'erp_prod_runtime.document', 'erp_prod_runtime.revision'];
  const files = new Map(); let totalBytes = 0, failure;
  try {
    for (const table of tables) {
      signal?.throwIfAborted();
      const filename = `${table}.ndjson`;
      const handle = await open(join(directory, filename), 'wx', 0o600);
      files.set(table, {filename, handle, hash: createHash('sha256'), rows: 0n, bytes: 0});
    }
    const append = async (table, rows) => {
      const file = files.get(table);
      if (!file || !Array.isArray(rows)) throw new Error('PRIVATE_SNAPSHOT_TABLE_REQUIRED');
      for (const row of rows) {
        signal?.throwIfAborted();
        // raw_json remains a string; JSON encoding never parses its numeric tokens.
        const bytes = Buffer.from(JSON.stringify(row) + '\n', 'utf8');
        if (bytes.length > maxBytes - totalBytes) throw new Error('PRIVATE_SNAPSHOT_BYTE_BUDGET_EXCEEDED');
        // writeFile on the held handle writes from its current position and handles short writes.
        await file.handle.writeFile(bytes);
        file.hash.update(bytes); file.rows++; file.bytes += bytes.length; totalBytes += bytes.length;
      }
    };
    const receipt = await readLegacyDocumentAndReferenceSnapshot(pool, {
      pageRows, signal, onReferences: append,
      onDocuments: rows => append('erp_prod_runtime.document', rows),
      onRevisions: rows => append('erp_prod_runtime.revision', rows),
    });
    const expected = new Map(receipt.references.map(row => [row.table, row.rowsRead]));
    expected.set('erp_prod_runtime.document', receipt.counts.documents);
    expected.set('erp_prod_runtime.revision', receipt.counts.revisions);
    const manifests = [];
    for (const [table, file] of files) {
      signal?.throwIfAborted();
      if (file.rows.toString() !== expected.get(table)) throw new Error('PRIVATE_SNAPSHOT_FILE_COUNT_MISMATCH');
      await file.handle.sync(); await file.handle.close(); file.handle = null;
      manifests.push({table, filename: file.filename, rows: file.rows.toString(), bytes: file.bytes, sha256: file.hash.digest('hex')});
    }
    signal?.throwIfAborted();
    const manifest = {status: 'COMPLETE_SCOPED_PRIVATE_SNAPSHOT',
      scope: '48_REFERENCE_TABLES_PLUS_DOCUMENT_AND_REVISION_ONLY',
      excludes: ['inventory-and-posting', 'credentials', 'target-conversion-and-writes'],
      totalBytes, files: manifests, receipt};
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    if (manifestBytes.length > maxBytes - totalBytes) throw new Error('PRIVATE_SNAPSHOT_BYTE_BUDGET_EXCEEDED');
    const final = await open(join(directory, 'SNAPSHOT.json'), 'wx', 0o600);
    try { await final.writeFile(manifestBytes); await final.sync(); }
    finally { await final.close(); }
    // A partial/failed manifest write never creates the completion marker.
    await link(join(directory, 'SNAPSHOT.json'), join(directory, 'COMPLETE.json'));
    return manifest;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // No retry, deletion or promotion of partial output. Caller retains the pool.
    const closing = await Promise.allSettled([...files.values()].filter(file => file.handle).map(file => file.handle.close()));
    if (!failure && closing.some(item => item.status === 'rejected')) throw new Error('PRIVATE_SNAPSHOT_CLOSE_FAILED');
  }
}
