import {databaseIdentifier as ident, type DatabaseConfig} from './config.js';
import type {DataSession} from './session.js';
import {DataAccessError} from './access-errors.js';

export interface DocumentRecord {
  id: string; document_type: string; number: string; status: string; version: number;
  original_auditor: string | null; original_audited_at: Date | null;
}
export interface DocumentRepository {findById(id: string): Promise<DocumentRecord | null>}
export interface SourceSkuRecord {id: string; product_id: string}
export interface SourceSkuRepository {findById(id: string): Promise<SourceSkuRecord | null>}
export interface Repositories {readonly documents: DocumentRepository; readonly sourceSkus: SourceSkuRepository}
function uuid(id: string): void {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new DataAccessError('INVALID_REPOSITORY_ID');
}

/** Bind all repositories to the action's session. No repository can acquire another connection. */
export function repositories(session: DataSession, schemas: DatabaseConfig['schemas']): Repositories {
  const runtime = ident(schemas.runtime), source = ident(schemas.source);
  return Object.freeze({
    documents: Object.freeze({async findById(id: string): Promise<DocumentRecord | null> {
      uuid(id); const result = await session.query<DocumentRecord>(`SELECT id,document_type,number,status,version,original_auditor,original_audited_at FROM ${runtime}.document WHERE id=$1::uuid`, [id]);
      return result.rows[0] ?? null;
    }}),
    sourceSkus: Object.freeze({async findById(id: string): Promise<SourceSkuRecord | null> {
      uuid(id); const result = await session.query<SourceSkuRecord>(`SELECT id,product_id FROM ${source}.variant WHERE id=$1::uuid`, [id]);
      return result.rows[0] ?? null;
    }}),
  });
}
