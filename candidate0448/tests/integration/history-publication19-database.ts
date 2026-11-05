/** Exact19 fresh-database wrapper; importing it opens nothing. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { HISTORY_TYPED_PUBLICATION_SCHEMA19_MIGRATIONS } from './migration-manifest.ts';
import { openFreshHistoryClosureDatabase } from './history-closure-database.ts';
import type { IntegrationSettings } from './safety.ts';
export async function openFreshHistoryPublicationDatabase(settings: IntegrationSettings) {
  // All19 approved hashes precede Pool construction. Original18 helper still
  // applies its original exact chain, then this adds only the new reviewed DDL.
  const sources = await Promise.all(HISTORY_TYPED_PUBLICATION_SCHEMA19_MIGRATIONS.map(async ([, file, pin]) => {
    const bytes = await readFile(new URL('../../adapters/postgres/migrations/' + file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), pin, file); return bytes;
  }));
  assert.equal(sources.length, 19);
  const database = await openFreshHistoryClosureDatabase(settings);
  try {
    await database.pool.query(sources[18]!.toString('utf8'));
    assert.deepEqual((await database.pool.query('SELECT version FROM naijue_erp.schema_migration ORDER BY version')).rows.map(r => r.version), Array.from({ length: 19 }, (_, i) => i + 1));
    return database;
  } catch (error) { await database.close(); throw error; }
}
