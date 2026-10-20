import type {PoolClient, QueryResult, QueryResultRow} from 'pg';
import {DataAccessError, databaseError} from './access-errors.js';

export type SqlValue = null | boolean | string | number | bigint | Date | Buffer | readonly SqlValue[];
export type LockScope = 'idempotency' | 'document' | 'reference' | 'product' | 'barcode' | 'inventory';
export interface ActionLock {readonly scope: LockScope; readonly key: string}
export interface DataSession {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly SqlValue[]): Promise<QueryResult<Row>>;
  /** Declare every action lock together, before writes/row locks. No later expansion. */
  lock(keys: readonly ActionLock[]): Promise<void>;
}
const scopes: readonly LockScope[] = ['idempotency','document','reference','product','barcode','inventory'];

function valueCopy(value: SqlValue, depth = 0): SqlValue {
  if (depth > 8) throw new DataAccessError('INVALID_SQL_PARAMETER');
  if (value === null || typeof value === 'boolean' || typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new DataAccessError('INVALID_SQL_NUMBER');
    return value;
  }
  if (typeof value === 'string') {
    if (value.includes('\0') || Buffer.byteLength(value) > 1048576) throw new DataAccessError('INVALID_SQL_TEXT');
    return value;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value);
  if (Buffer.isBuffer(value) && value.byteLength <= 1048576) return Buffer.from(value);
  if (Array.isArray(value) && value.length <= 10000) return Array.from(value, item => valueCopy(item as SqlValue, depth + 1));
  throw new DataAccessError('INVALID_SQL_PARAMETER');
}

/** A session never exposes its client, connection settings, COMMIT or pool. */
export class ActionSession implements DataSession {
  #active = true;
  #pending = false;
  #failure: DataAccessError | undefined;
  #locksDeclared = false;
  #queryStarted = false;
  constructor(readonlyClient: PoolClient, private readonly instanceId: string, private readonly readOnly: boolean) {this.#client = readonlyClient;}
  #client: PoolClient;
  close(): void {this.#active = false;}
  hasPendingQuery(): boolean {return this.#pending;}
  assertComplete(): void {
    if (this.#failure) throw this.#failure;
    if (this.#pending) throw new DataAccessError('UNAWAITED_ACTION_QUERY');
  }
  async query<Row extends QueryResultRow = QueryResultRow>(text: string, values: readonly SqlValue[] = []): Promise<QueryResult<Row>> {
    try {
      if (!this.#active) throw new DataAccessError('ACTION_SESSION_CLOSED');
      if (this.#failure) throw this.#failure;
      if (this.#pending) throw new DataAccessError('CONCURRENT_ACTION_QUERY');
      // Repository SQL is trusted source, never request text. Extended mode rejects multiple statements.
      if (typeof text !== 'string' || text.length > 65536 || !/^\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(text)) throw new DataAccessError('INVALID_ACTION_QUERY');
      if (!Array.isArray(values) || values.length > 10000) throw new DataAccessError('INVALID_SQL_PARAMETER');
      const parameters = Array.from(values, value => valueCopy(value));
      this.#pending = true; this.#queryStarted = true;
      try {
        // pg supports queryMode; its published QueryConfig types omit this field.
        const statement = {text, values: parameters, queryMode: 'extended'};
        return await this.#client.query<Row>(statement);
      } finally {this.#pending = false;}
    } catch (error) {
      this.#failure ??= databaseError(error); throw this.#failure;
    }
  }
  async lock(keys: readonly ActionLock[]): Promise<void> {
    try {
      if (!this.#active) throw new DataAccessError('ACTION_SESSION_CLOSED');
      if (this.readOnly || this.#locksDeclared || this.#queryStarted || keys.length > 10000) throw new DataAccessError('DECLARE_ACTION_LOCKS_FIRST');
      const names = keys.map(({scope,key}) => {
        const rank = scopes.indexOf(scope);
        if (rank < 0 || typeof key !== 'string' || !key || key.includes('\0') || Buffer.byteLength(key) > 512) throw new DataAccessError('INVALID_ACTION_LOCK');
        return `${rank}:${scope}:${key}`;
      });
      this.#locksDeclared = true;
      for (const name of [...new Set(names)].sort()) await this.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [this.instanceId + ':' + name]);
    } catch (error) {this.#failure ??= databaseError(error); throw this.#failure;}
  }
}
