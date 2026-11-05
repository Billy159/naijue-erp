import type { Pool } from 'pg';
import type { DictionaryBarcodeScheme, DictionaryKind, DictionaryPage, DictionaryReader, DictionaryScopedRead, DictionarySeason, DictionarySize, DictionarySizeGroup } from '../../../packages/application/src/dictionary-read-ports.ts';
import { activeDictionaryRead, checkedDictionaryActor, checkedDictionaryGrant, checkedDictionaryIntent, dictionaryId, validateDictionaryPage, validateDictionaryScheme, validateDictionarySeason, validateDictionarySizeGroup } from '../../../packages/application/src/dictionary-read-validation.ts';
import { DomainError, requireDomain } from '../../../packages/domain/src/errors.ts';
import { integerValue, stringValue } from './codec.ts';

export interface PgDictionaryResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgDictionaryClient { query(text: string, values?: unknown[]): Promise<PgDictionaryResult>; release(error?: Error | boolean): void }
export interface PgDictionaryPool { connect(): Promise<PgDictionaryClient> }
type PgPoolCompatibility = Pool extends PgDictionaryPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true; void pgPoolCompatibility;
/** Technical response safeguard, not a catalogue limit. Overflow fails, never truncates. */
export const DICTIONARY_MAX_GROUP_MEMBERS = 1000;
type Query = (sql: string, values?: unknown[]) => Promise<PgDictionaryResult>;
const TABLES = { 'size-groups': 'size_group', seasons: 'season', 'barcode-schemes': 'barcode_scheme' } as const;
const SCHEME_COLUMNS = 'id, name, barcode_type, rule_description, code_length, rule_version, status';
function nativeId(value: unknown): string {
  try { return dictionaryId(value); } catch { throw new DomainError('INVALID_DATABASE_VALUE', 'Invalid persisted dictionary identity'); }
}
function scheme(row: Record<string, unknown>): DictionaryBarcodeScheme {
  return validateDictionaryScheme({ id: row.id, name: row.name, barcodeType: row.barcode_type, ruleDescription: row.rule_description,
    codeLength: row.code_length, ruleVersion: row.rule_version, status: row.status, applicability: null });
}
function total(rows: readonly Record<string, unknown>[]): number {
  requireDomain(rows.length === 1, 'INVALID_DATABASE_VALUE', 'Missing dictionary total');
  const value = stringValue(rows[0]!.total);
  requireDomain(/^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)), 'INVALID_DATABASE_VALUE', 'Invalid dictionary total'); return Number(value);
}
/** Actual native queries only. Inert until called; does not connect on construction, seed,
 * migrate, listen or write. Every list's count/page/members use the SAME RR READ ONLY snapshot.
 * Abort checks stop later calls but cannot cancel in-flight pg SQL/acquisition: host must set
 * database statement/lock/pool timeouts. No importer or transaction-candidate API is involved. */
export class PostgresDictionaryReadReader implements DictionaryReader {
  private readonly pool: PgDictionaryPool;
  constructor(pool: PgDictionaryPool) { this.pool = pool; if (typeof pool?.connect !== 'function') throw new TypeError('Dictionary reader requires an explicit PostgreSQL pool'); }
  private validate(read: DictionaryScopedRead, kind: DictionaryKind, operation: 'list' | 'detail') {
    const intent = checkedDictionaryIntent(read.intent); checkedDictionaryActor(read.actor); checkedDictionaryGrant(read.grant, intent); activeDictionaryRead(read.signal);
    requireDomain(intent.kind === kind && intent.operation === operation, 'FORBIDDEN', 'Mismatched dictionary reader target'); return intent;
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query) => Promise<T>): Promise<T> {
    activeDictionaryRead(signal); const client = await this.pool.connect(); let began = false, committing = false; let discard: Error | undefined;
    const query: Query = (sql, values = []) => { activeDictionaryRead(signal); return client.query(sql, values); };
    try {
      activeDictionaryRead(signal); await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      const value = await work(query); activeDictionaryRead(signal); committing = true; await query('COMMIT'); activeDictionaryRead(signal); return value;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error('Dictionary snapshot failed');
      if (began) try { await client.query('ROLLBACK'); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error('Dictionary rollback failed');
        throw new AggregateError([error, rollbackError], 'Dictionary read and rollback failed; client discarded');
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async list<T extends { readonly id: string }>(read: DictionaryScopedRead, kind: DictionaryKind, work: (query: Query, rows: readonly Record<string, unknown>[]) => Promise<readonly T[]>, validate: (value: unknown) => T): Promise<DictionaryPage<T>> {
    const intent = this.validate(read, kind, 'list'); if (intent.operation !== 'list') throw new Error('Expected dictionary list'); const parameters = intent.parameters;
    return this.snapshot(read.signal, async query => {
      const table = TABLES[kind]; // Fixed internal whitelist; no identifiers from wire parameters.
      const predicate = kind === 'barcode-schemes' ? "strpos(lower(name), lower($1::text)) > 0" : "strpos(lower(name || ' ' || code), lower($1::text)) > 0";
      const count = total((await query(`SELECT count(*)::text AS total FROM naijue_erp.${table} WHERE ${predicate}`, [parameters.search])).rows);
      const order = kind === 'seasons' ? 'display_order, id' : kind === 'size-groups' ? 'code COLLATE "C", id' : "CASE status WHEN 'CURRENT' THEN 0 ELSE 1 END, name COLLATE \"C\", id";
      const columns = kind === 'barcode-schemes' ? SCHEME_COLUMNS : 'id, name';
      const rows = (await query(`SELECT ${columns} FROM naijue_erp.${table} WHERE ${predicate} ORDER BY ${order} LIMIT $2 OFFSET $3`,
        [parameters.search, parameters.pageSize, (parameters.page - 1) * parameters.pageSize])).rows;
      requireDomain(rows.length <= parameters.pageSize, 'INVALID_DATABASE_VALUE', 'Dictionary page exceeded its requested bound');
      const items = await work(query, rows);
      return validateDictionaryPage({ page: parameters.page, pageSize: parameters.pageSize, total: count, items }, parameters, validate);
    });
  }
  readSizeGroups(read: DictionaryScopedRead): Promise<DictionaryPage<DictionarySizeGroup>> {
    return this.list(read, 'size-groups', async (query, rows) => {
      const groups = rows.map(row => ({ id: nativeId(row.id), name: stringValue(row.name), sizes: [] as DictionarySize[] }));
      requireDomain(new Set(groups.map(group => group.id)).size === groups.length, 'INVALID_DATABASE_VALUE', 'Repeated group identity');
      if (!groups.length) return groups;
      const byId = new Map(groups.map(group => [group.id, group]));
      const members = (await query(`SELECT m.size_group_id, s.id, s.name, m.display_order FROM naijue_erp.size_group_member m
        JOIN naijue_erp.size s ON s.id = m.size_id WHERE m.size_group_id = ANY($1::uuid[])
        ORDER BY m.size_group_id, m.display_order, s.id LIMIT $2`, [groups.map(group => group.id), groups.length * DICTIONARY_MAX_GROUP_MEMBERS + 1])).rows;
      requireDomain(members.length <= groups.length * DICTIONARY_MAX_GROUP_MEMBERS, 'DICTIONARY_READ_TOO_LARGE', 'Dictionary members exceed technical response bound');
      for (const row of members) {
        const group = byId.get(nativeId(row.size_group_id)); requireDomain(group, 'INVALID_DATABASE_VALUE', 'Member outside the requested group page');
        group.sizes.push({ id: nativeId(row.id), name: stringValue(row.name), displayOrder: integerValue(row.display_order) });
        requireDomain(group.sizes.length <= DICTIONARY_MAX_GROUP_MEMBERS, 'DICTIONARY_READ_TOO_LARGE', 'Group exceeds technical response bound');
      }
      return groups;
    }, validateDictionarySizeGroup);
  }
  readSeasons(read: DictionaryScopedRead): Promise<DictionaryPage<DictionarySeason>> {
    return this.list(read, 'seasons', async (_query, rows) => rows.map(row => ({ id: nativeId(row.id), name: stringValue(row.name) })), validateDictionarySeason);
  }
  readBarcodeSchemes(read: DictionaryScopedRead): Promise<DictionaryPage<DictionaryBarcodeScheme>> {
    return this.list(read, 'barcode-schemes', async (_query, rows) => rows.map(scheme), validateDictionaryScheme);
  }
  async readBarcodeScheme(read: DictionaryScopedRead): Promise<DictionaryBarcodeScheme | null> {
    const intent = this.validate(read, 'barcode-schemes', 'detail'); if (intent.operation !== 'detail') throw new Error('Expected scheme target');
    return this.snapshot(read.signal, async query => {
      const rows = (await query(`SELECT ${SCHEME_COLUMNS} FROM naijue_erp.barcode_scheme WHERE id = $1::uuid`, [intent.parameters.schemeId])).rows;
      requireDomain(rows.length <= 1, 'INVALID_DATABASE_VALUE', 'Repeated scheme identity'); if (!rows.length) return null;
      const result = scheme(rows[0]!); requireDomain(result.id === intent.parameters.schemeId, 'INVALID_DATABASE_VALUE', 'Mismatched scheme target'); return result;
    });
  }
}
