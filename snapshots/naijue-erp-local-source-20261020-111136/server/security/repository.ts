import {loadApprovedFundAccounts, type FundAccountApproval} from './approved-fund-accounts-data.js';
import {approvedPartyRole, type PartyRole} from './approved-party-roles.js';
import {databaseIdentifier as ident, type DatabaseConfig} from '../database/config.js';
import {ActionSession, type DataSession} from '../database/session.js';
import {identifier, object, SecurityError} from './errors.js';
import {supportedCredential} from './passwords.js';
import {hasNonzeroInventory} from '../domain/transactions/inventory.js';

export type Role = 'ADMIN' | 'WAREHOUSE' | 'SALESPERSON';
export const roleNames = {ADMIN: '管理员', WAREHOUSE: '仓库人员', SALESPERSON: '营业员'} as const;
export function roleOf(value: unknown): Role | null {return (Object.keys(roleNames) as Role[]).find(role => roleNames[role] === value || role === value) ?? null;}
export interface AccountRow {id: string; login_name: string | null; body: Record<string, unknown>; password_salt: string | null; password_hash: string | null; version: number}
export interface Actor {readonly id: string; readonly role: Role; readonly storeId: string | null; readonly version: number}
export interface EmployeeView {id: string; code: string; name: string; role: string; storeId: string; hallId: string; phone: string; employmentStatus: string; loginEnabled: boolean; enabled: boolean; loginName: string; authVersion: number; version: number; hasPassword: boolean; sourceFacts: Record<string,unknown>}
export function employeeView(row: AccountRow): EmployeeView {
  const role = roleOf(row.body['role']);
  const hallId=typeof row.body['hallId']==='string'?row.body['hallId']:typeof row.body['storeId']==='string'?row.body['storeId']:'';
  const facts=row.body['sourceFacts']&&typeof row.body['sourceFacts']==='object'&&!Array.isArray(row.body['sourceFacts'])?row.body['sourceFacts'] as Record<string,unknown>:{};
  return {id: row.id, code: typeof row.body['code']==='string'?row.body['code']:'',name: typeof row.body['name'] === 'string' ? row.body['name'] : '', role: role ? roleNames[role] : '',
    storeId: hallId,hallId, phone: typeof row.body['phone'] === 'string' ? row.body['phone'] : '',
    employmentStatus: row.body['employmentStatus'] === '在职' ? '在职' : '离职', loginEnabled: row.body['loginEnabled'] === true,
    enabled: row.body['employmentStatus'] === '在职' && row.body['enabled'] !== false, loginName: row.login_name ?? '', authVersion: row.version,version:row.version,hasPassword: !!row.password_hash,sourceFacts:facts};
}
export type ReadableDocumentType = 'SALE' | 'TRANSFER' | 'CORRECTION';
export interface DocumentScope {id: string; type: ReadableDocumentType; storeId: string | null; creatorId: string | null; creatorHallId: string | null; creatorAccountId?: string | null; creatorRole?: Role | null; warehouseIds: readonly string[]; header: Record<string, unknown>; status: string; version: number; originalAuditor: string | null; originalAuditedAt: Date | null}
export interface WarehouseReference {id: string; enabled: boolean; hall_relations: string[]; source_ownership_unknown: boolean}
export interface WarehouseScope extends WarehouseReference {nonzero: boolean}
interface ListWarehouseReads {warehouses: Map<string, WarehouseReference>; hallLinks: Map<string, boolean>}

/** All identity/object lookups use the current T09 action session. */
export class SecurityRepository {
  readonly auth: string; readonly runtime: string; readonly source: string;
  // IdentityService creates a repository and a frozen actor for each action. These
  // maps belong to that session and actor, never to a connection, account ID or process.
  readonly #listWarehouseReads = new WeakMap<Actor, ListWarehouseReads | null>();
  constructor(readonly session: DataSession, config: DatabaseConfig, readonly fundAccountApproval: () => FundAccountApproval = loadApprovedFundAccounts, readonly partyRole:(code:string,body?:Record<string,unknown>,id?:string,returnedFacts?:Record<string,unknown>)=>PartyRole|null|undefined=approvedPartyRole) {this.auth = ident(config.schemas.auth); this.runtime = ident(config.schemas.runtime); this.source = ident(config.schemas.source);}
  async account(id: string): Promise<AccountRow | null> {
    const result = await this.session.query<AccountRow>(`SELECT id,login_name,body,password_salt,password_hash,version FROM ${this.auth}.employee_login WHERE id=$1`, [identifier(id)]);
    return result.rows[0] ?? null;
  }
  async accountByLogin(name: string): Promise<AccountRow | null> {
    return (await this.session.query<AccountRow>(`SELECT id,login_name,body,password_salt,password_hash,version FROM ${this.auth}.employee_login WHERE login_name=$1`, [name])).rows[0] ?? null;
  }
  async sessionAccount(digest: string, write: boolean): Promise<AccountRow | null> {
    return (await this.session.query<AccountRow>(`SELECT e.id,e.login_name,e.body,e.password_salt,e.password_hash,e.version
      FROM ${this.auth}.employee_session s JOIN ${this.auth}.employee_login e ON e.id=s.employee_id
      WHERE s.token=$1 AND s.expires_at>$2 AND s.employee_version=e.version ${write ? 'FOR SHARE OF e' : ''}`, [digest, Date.now()])).rows[0] ?? null;
  }
  async hallExists(id: string): Promise<boolean> {
    identifier(id, true);
    const row = (await this.session.query<{allowed: boolean}>(`SELECT coalesce(
      (SELECT (body->>'enabled')::boolean FROM ${this.runtime}.master_data_entity WHERE kind='halls' AND id=$1::text),
      (SELECT NOT (source_payload @> '{"enabled":false}'::jsonb) AND coalesce(source_payload #>> '{source,停用}','0') <> '1' FROM ${this.source}.tplus_hall WHERE id=$1::uuid),false) AS allowed`, [id])).rows[0];
    return row?.allowed === true;
  }
  async actor(row: AccountRow | null): Promise<Actor> {
    const role = roleOf(row?.body['role']);
    if (!row || !role || row.body['employmentStatus'] !== '在职' || row.body['enabled'] === false || row.body['loginEnabled'] !== true || !supportedCredential(row.password_salt,row.password_hash) || !row.login_name?.trim()) throw new SecurityError('UNAUTHENTICATED', 401, '登录已失效，请重新登录');
    const storeId = typeof row.body['storeId'] === 'string' && row.body['storeId'] ? row.body['storeId'] : null;
    if (role === 'SALESPERSON' && (!storeId || !await this.hallExists(storeId))) throw new SecurityError('UNAUTHENTICATED', 401, '登录授权关系已失效');
    return Object.freeze({id: row.id, role, storeId, version: row.version});
  }
  async warehouse(id: string): Promise<WarehouseScope>;
  async warehouse(id: string, options: {includeNonzeroInventory: false}): Promise<WarehouseReference>;
  async warehouse(id: string, options?: {includeNonzeroInventory: false}): Promise<WarehouseReference | WarehouseScope> {
    identifier(id, true);
    const row = (await this.session.query<WarehouseReference>(`SELECT $1::text AS id,coalesce((m.body->>'enabled')::boolean,o.enabled,w.enabled) AS enabled,
      coalesce(ARRAY(SELECT jsonb_array_elements_text(m.body->'hallRelations')),
        ARRAY(SELECT h.id::text FROM ${this.source}.tplus_hall h CROSS JOIN LATERAL unnest(h.warehouse_ids) wh(id)
          WHERE wh.id=w.id AND h.batch_id=(SELECT batch_id FROM ${this.source}.tplus_import_run WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1)),ARRAY[]::text[]) AS hall_relations,
      coalesce((m.body->>'sourceOwnershipUnknown')::boolean,
        NOT EXISTS(SELECT 1 FROM ${this.source}.tplus_hall h CROSS JOIN LATERAL unnest(h.warehouse_ids) wh(id)
          WHERE wh.id=w.id AND h.batch_id=(SELECT batch_id FROM ${this.source}.tplus_import_run WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1)),true) AS source_ownership_unknown
      FROM (SELECT 1) anchor LEFT JOIN ${this.source}.warehouse w ON w.id=$1::uuid
      LEFT JOIN ${this.runtime}.master_reference_overlay o ON o.kind='warehouses' AND o.id=$1::uuid
      LEFT JOIN ${this.runtime}.master_data_entity m ON m.kind='warehouses' AND m.id=$1::text
      WHERE w.id IS NOT NULL OR m.id IS NOT NULL`, [id])).rows[0];
    if (!row) throw new SecurityError('SCOPE', 403, '仓库未获授权或来源未知');
    // A metadata-only result has no inventory fact, rather than an invented zero.
    // Both paths retain the caller's action session and never cache across actions.
    if (options?.includeNonzeroInventory === false) return row;
    return {...row,nonzero:await hasNonzeroInventory(this.session,this.runtime,this.source,[id])};
  }
  async warehouseLinkedToHall(warehouseId: string, hallId: string): Promise<boolean> {
    const row=(await this.session.query<{linked:boolean}>(`SELECT ${this.runtime}.warehouse_linked_hall($1::text,$2::text) AS linked`,
      [identifier(warehouseId,true),identifier(hallId,true)])).rows[0];
    return row?.linked === true;
  }
  async #readOnlyListWarehouses(actor: Actor): Promise<ListWarehouseReads | null> {
    // Unknown session adapters and mutable actors keep the ordinary fresh reads.
    if (!(this.session instanceof ActionSession) || !Object.isFrozen(actor)) return null;
    this.session.assertComplete();
    if (this.#listWarehouseReads.has(actor)) return this.#listWarehouseReads.get(actor)!;
    // A query operation can also run inside a command: check the actual transaction
    // before reusing any reference. Read committed can change between statements.
    const proof = (await this.session.query<{reusable: boolean}>(`SELECT
      current_setting('transaction_read_only')='on' AND
      current_setting('transaction_isolation') IN ('repeatable read','serializable') AS reusable`)).rows[0];
    const reads = proof?.reusable === true ? {warehouses: new Map<string, WarehouseReference>(), hallLinks: new Map<string, boolean>()} : null;
    this.#listWarehouseReads.set(actor, reads);
    return reads;
  }
  /** List-only metadata reuse; commands and the existing warehouse API stay fresh. */
  async listWarehouse(actor: Actor, id: string): Promise<WarehouseReference> {
    identifier(id, true);
    const reads = await this.#readOnlyListWarehouses(actor);
    if (!reads) return this.warehouse(id, {includeNonzeroInventory: false});
    let row = reads.warehouses.get(id);
    if (!row) {
      const loaded = await this.warehouse(id, {includeNonzeroInventory: false});
      row = {...loaded, hall_relations: [...loaded.hall_relations]};
      reads.warehouses.set(id, row);
    }
    return {...row, hall_relations: [...row.hall_relations]};
  }
  /** Preserve the authoritative membership function, including cached false results. */
  async listWarehouseLinkedToHall(actor: Actor, warehouseId: string, hallId: string): Promise<boolean> {
    identifier(warehouseId, true); identifier(hallId, true);
    const reads = await this.#readOnlyListWarehouses(actor);
    if (!reads) return this.warehouseLinkedToHall(warehouseId, hallId);
    const key = warehouseId + ':' + hallId;
    if (!reads.hallLinks.has(key)) reads.hallLinks.set(key, await this.warehouseLinkedToHall(warehouseId, hallId));
    return reads.hallLinks.get(key)!;
  }
  async product(id: string): Promise<void> {
    identifier(id, true);
    const row = (await this.session.query<{found: boolean}>(`SELECT EXISTS(SELECT 1 FROM ${this.source}.product WHERE id=$1::uuid
      UNION ALL SELECT 1 FROM ${this.runtime}.product_overlay WHERE id=$1::uuid) AS found`, [id])).rows[0];
    if (!row?.found) throw new SecurityError('SCOPE', 403, '商品未获授权或来源未知');
  }
  async mediaProduct(id: string): Promise<string> {
    identifier(id, true);
    const row = (await this.session.query<{product_id: string}>(`SELECT product_id FROM ${this.runtime}.product_image WHERE id=$1::uuid`, [id])).rows[0];
    if (!row) throw new SecurityError('SCOPE', 403, '媒体未获授权或来源未知');
    return row.product_id;
  }
  async document(id: string): Promise<DocumentScope> {
    identifier(id, true);
    const row = (await this.session.query<{id: string; document_type: string; status: string; version: number; original_auditor: string | null; original_audited_at: Date | null; body: unknown; creator_id: string | null; transfer_creator_hall_id: string | null; transfer_creator_account_id: string | null; transfer_creator_role: Role | null}>(
      `SELECT d.id,d.document_type,d.status,d.version,d.original_auditor,d.original_audited_at,d.transfer_creator_hall_id,d.transfer_creator_account_id,d.transfer_creator_role,r.body,
        (SELECT first.actor_id FROM ${this.runtime}.revision first WHERE first.document_id=d.id AND first.revision=1) AS creator_id
      FROM ${this.runtime}.document d JOIN ${this.runtime}.revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE d.id=$1::uuid`, [id])).rows[0];
    if (!row || !['SALE','TRANSFER','CORRECTION'].includes(row.document_type)) throw new SecurityError('SCOPE', 403, '单据未获授权或来源未知');
    const header = object(object(row.body)['header']);
    return {...scopeFromBody(row.document_type as ReadableDocumentType, {...object(row.body), header}), id: row.id, creatorId: row.creator_id,
      creatorHallId: row.transfer_creator_hall_id, creatorAccountId: row.transfer_creator_account_id, creatorRole: row.transfer_creator_role,
      status: row.status, version: row.version, originalAuditor: row.original_auditor, originalAuditedAt: row.original_audited_at};
  }
}

/** Normalize only the frozen T11 transport fields. Missing scope never means all objects. */
export function scopeFromBody(type: ReadableDocumentType, body: unknown): DocumentScope {
  const record = object(body), header = object(record['header']);
  const store = header['hall_id'];
  const fields = type === 'TRANSFER' ? [header['source_from_warehouse_id'], header['source_to_warehouse_id']]
    : [header['source_warehouse_id'], ...(header['return_warehouse_id'] ? [header['return_warehouse_id']] : []), ...(header['outgoing_warehouse_id'] ? [header['outgoing_warehouse_id']] : [])];
  // If lines carry additional warehouses, they are part of the authorized scope too.
  if (Array.isArray(record['lines'])) for (const value of record['lines']) {
    const line = object(value);
    if (line['warehouse_id']) fields.push(line['warehouse_id']);
    if (type === 'TRANSFER') fields.push(line['from_warehouse_id'],line['to_warehouse_id']);
  }
  const warehouseIds = [...new Set(fields.map(value => identifier(value, true)))];
  if (type === 'TRANSFER' && fields[0] === fields[1]) throw new SecurityError('VALIDATION', 400, '调出仓和调入仓必须不同');
  return {id: '', type, storeId: typeof store === 'string' && store ? identifier(store, true) : null, creatorId: null, creatorHallId: null, warehouseIds,
    header, status: 'UNAUDITED', version: 0, originalAuditor: null, originalAuditedAt: null};
}

/** Only persisted/session creation evidence is inherited, never fields from the proposed body. */
export function withTransferCreationScope(scope:DocumentScope, trusted:Pick<DocumentScope,'creatorId'|'creatorHallId'|'creatorAccountId'|'creatorRole'>):DocumentScope {
  return scope.type==='TRANSFER'?{...scope,creatorId:trusted.creatorId,creatorHallId:trusted.creatorHallId,creatorAccountId:trusted.creatorAccountId??null,creatorRole:trusted.creatorRole??null}:scope;
}
