import {randomBytes} from 'node:crypto';
import type {DatabaseConfig} from '../database/config.js';
import type {DataAccess} from '../database/access.js';
import type {ActionLock, DataSession} from '../database/session.js';
import {SessionKeys, type SecurityConfig} from './config.js';
import {SecurityError, invalid, identifier, object} from './errors.js';
import {passwordCredential, verifyPassword, supportedCredential} from './passwords.js';
import {SecurityRepository, employeeView, scopeFromBody, withTransferCreationScope, roleOf, roleNames, type AccountRow, type Actor, type DocumentScope, type EmployeeView} from './repository.js';
import {operations, authorizeAction, authorizeDocument, operation, type OperationId} from './policies.js';
import {authorizeDocumentResponse} from './document-response.js';
import {loadApprovedFundAccounts, type FundAccountApproval} from './approved-fund-accounts-data.js';
import {approvedPartyRole, type PartyRole} from './approved-party-roles.js';
import {SyntheticFundAccountReader, type SyntheticFundAccountConfig} from './synthetic-fund-accounts.js';

type DocumentSelection = {kind: 'document'; id: string} | {kind: 'document-change'; id: string; body: unknown} | {kind: 'new-document'; type: 'SALE' | 'TRANSFER'; body: unknown};
export type Selection = DocumentSelection | {kind: 'global'} | {kind: 'document-list'; type: 'SALE' | 'TRANSFER'; storeId?: string}
  | {kind: 'transfer-draft'; id: string}
  | {kind: 'sales-draft'; id: string}
  | {kind: 'inventory-posting'; id: string}
  | {kind: 'documents'; ids: readonly string[]} | {kind: 'products'; ids: readonly string[]} | {kind: 'export-task'; id: string}
  | {kind: 'product'; id: string} | {kind: 'media'; id: string}
  | {kind: 'warehouse'; id: string} | {kind: 'request-result'; requestKey: string; operationId: string}
  | {kind: 'reference-import'; kinds: readonly ('products' | 'masters' | 'employees')[]}
  | {kind: 'transaction-spec'; document: DocumentSelection; productId: string};
export interface AuthorizedContext {
  readonly actor: Actor; readonly session: DataSession; readonly repo: SecurityRepository;
  readonly documents: readonly DocumentScope[];
  readonly listScope: {readonly type: 'SALE' | 'TRANSFER'; readonly storeId: string | null} | null;
  readonly requestResult: Record<string, unknown> | null;
}
export class IdentityService {
  readonly keys: SessionKeys;
  #database: DatabaseConfig;
  #fundAccountApproval: () => FundAccountApproval;
  #partyRole: (code:string,body?:Record<string,unknown>,id?:string,returnedFacts?:Record<string,unknown>)=>PartyRole|null|undefined;
  constructor(private readonly access: DataAccess, database: DatabaseConfig, config: SecurityConfig, syntheticFunds?: SyntheticFundAccountConfig) {
    this.#database = Object.freeze({...database, schemas: Object.freeze({...database.schemas}), roles: Object.freeze({...database.roles})});
    const reader=syntheticFunds?new SyntheticFundAccountReader(syntheticFunds,this.#database):null;
    this.keys = new SessionKeys(Object.freeze({...config}), this.#database);
    this.#fundAccountApproval=reader?()=>reader.load():loadApprovedFundAccounts;
    this.#partyRole=reader?(code,body,id,returnedFacts)=>reader.partyRole(code,body,id,returnedFacts):approvedPartyRole;
  }
  async authenticate(token: string): Promise<{actor: Actor; employee: EmployeeView}> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new SecurityError('UNAUTHENTICATED', 401, '登录已失效，请重新登录');
    return this.access.read(async session => {
      const repo = new SecurityRepository(session, this.#database, this.#fundAccountApproval,this.#partyRole), row = await repo.sessionAccount(this.keys.sessionDigest(token), false);
      const actor = await repo.actor(row);
      return {actor, employee: employeeView(row!)};
    });
  }
  async login(input: unknown, oldToken: string | null): Promise<{token: string; employee: EmployeeView; csrfToken: string}> {
    const body = object(input), name = body['loginName'], password = body['password'];
    if (typeof name !== 'string' || !name.trim() || name.length > 128 || name.includes('\0') || typeof password !== 'string' || Buffer.byteLength(password) > 1024) return invalid();
    const token = randomBytes(32).toString('hex'), digest = this.keys.sessionDigest(token);
    const employee = await this.access.transaction(async session => {
      await session.lock(oldToken ? [{scope: 'reference', key: 'auth-session:' + this.keys.sessionDigest(oldToken)}] : []);
      const repo = new SecurityRepository(session, this.#database, this.#fundAccountApproval,this.#partyRole);
      const row = (await session.query<AccountRow>(`SELECT id,login_name,body,password_salt,password_hash,version FROM ${repo.auth}.employee_login WHERE login_name=$1 FOR SHARE`, [name.trim()])).rows[0] ?? null;
      const verified = await verifyPassword(password, row?.password_salt ?? null, row?.password_hash ?? null);
      if (!verified) throw new SecurityError('INVALID_CREDENTIALS', 401, '登录账号或密码不正确');
      try {await repo.actor(row);} catch {throw new SecurityError('INVALID_CREDENTIALS', 401, '登录账号或授权无效');}
      if (oldToken) await session.query(`DELETE FROM ${repo.auth}.employee_session WHERE token=$1`, [this.keys.sessionDigest(oldToken)]);
      await session.query(`INSERT INTO ${repo.auth}.employee_session(token,employee_id,employee_version,expires_at) VALUES($1,$2,$3,$4)`, [digest, row!.id, row!.version, Date.now() + this.keys.config.ttlMs]);
      return employeeView(row!);
    });
    return {token, employee, csrfToken: this.keys.csrf(token)};
  }
  async logout(token: string): Promise<void> {
    await this.access.transaction(async session => {
      const digest = this.keys.sessionDigest(token);
      await session.lock([{scope: 'reference', key: 'auth-session:' + digest}]);
      const repo = new SecurityRepository(session, this.#database, this.#fundAccountApproval,this.#partyRole);
      // An expired or revoked own token can still be cleared, with no business access.
      await session.query(`DELETE FROM ${repo.auth}.employee_session WHERE token=$1`, [digest]);
    });
  }
  /** The authenticated account is the only possible target; no caller-supplied employee ID is accepted. */
  async changeOwnPassword(token: string, input: unknown): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new SecurityError('UNAUTHENTICATED', 401, '登录已失效，请重新登录');
    const body = object(input);
    if (Object.keys(body).some(key => !['currentPassword', 'newPassword'].includes(key))) return invalid();
    const currentPassword = body['currentPassword'], newPassword = body['newPassword'];
    if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword) > 1024) return invalid();
    if (typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword) > 1024)
      throw new SecurityError('PASSWORD_POLICY', 400, '新密码至少 8 位且不超过 1024 字节');
    const digest = this.keys.sessionDigest(token);
    await this.access.transaction(async session => {
      await session.lock([
        {scope: 'reference', key: 'authorization-objects'},
        {scope: 'reference', key: 'auth-accounts'},
        {scope: 'reference', key: 'auth-session:' + digest},
      ]);
      const repo = new SecurityRepository(session, this.#database, this.#fundAccountApproval,this.#partyRole);
      const row = await repo.sessionAccount(digest, true);
      const actor = await repo.actor(row);
      if (!await verifyPassword(currentPassword, row!.password_salt, row!.password_hash))
        throw new SecurityError('INVALID_CURRENT_PASSWORD', 400, '原密码不正确');
      if (currentPassword === newPassword) throw new SecurityError('PASSWORD_REUSED', 400, '新密码不能与原密码相同');
      const credential = await passwordCredential(newPassword);
      await session.query(`UPDATE ${repo.auth}.employee_login SET password_salt=$2,password_hash=$3,version=version+1,updated_at=now() WHERE id=$1`,
        [actor.id, credential.salt, credential.hash]);
      await session.query(`DELETE FROM ${repo.auth}.employee_session WHERE employee_id=$1`, [actor.id]);
      await session.query(`INSERT INTO ${repo.auth}.employee_account_audit(actor_id,employee_id,action,changes) VALUES($1,$2,$3,$4::jsonb)`,
        [actor.id, actor.id, '本人修改密码', JSON.stringify([{field: 'credential', before: '已设置', after: '已修改'}])]);
    });
  }
  async execute<T>(token: string, id: OperationId, selection: Selection, work: (context: AuthorizedContext) => Promise<T>, locks: readonly ActionLock[] = []): Promise<T> {
    id = operation(id);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new SecurityError('UNAUTHENTICATED', 401, '登录已失效，请重新登录');
    const write = operations[id].mode === 'command';
    const run = async (session: DataSession): Promise<T> => {
      if (write) {
        const documentIds = selection.kind === 'document' || selection.kind === 'document-change' ? [selection.id] : selection.kind === 'documents' ? selection.ids : [];
        await session.lock([...locks, ...documentIds.map(key => ({scope: 'document' as const, key: identifier(key, true)})),
          {scope: 'reference', key: 'authorization-objects'}, {scope: 'reference', key: 'auth-session:' + this.keys.sessionDigest(token)},
          ...(id === 'employees.save' ? [{scope: 'reference' as const, key: 'auth-accounts'}] : [])]);
      }
      const repo = new SecurityRepository(session, this.#database, this.#fundAccountApproval,this.#partyRole);
      const actor = await repo.actor(await repo.sessionAccount(this.keys.sessionDigest(token), write));
      authorizeAction(actor, id);
      const documents: DocumentScope[] = [];
      let listScope: AuthorizedContext['listScope'] = null, requestResult: Record<string, unknown> | null = null;
      const document = async (target: DocumentSelection): Promise<void> => {
        if (target.kind !== 'new-document') {
          const persisted = await repo.document(target.id);
          await authorizeDocument(actor, persisted, id, repo); documents.push(persisted);
          if (target.kind === 'document-change') await authorizeDocument(actor,
            withTransferCreationScope(scopeFromBody(persisted.type, target.body),persisted), id, repo, true, persisted);
        } else {
          if (!id.endsWith('.create') && id !== 'work.command' && id !== 'specs.ensureForTransaction') return invalid();
          const proposed = {...scopeFromBody(target.type, target.body),
            creatorHallId: target.type === 'TRANSFER' && actor.role === 'SALESPERSON' ? actor.storeId : null,
            ...(target.type==='TRANSFER'?{creatorId:actor.id,creatorAccountId:actor.id,creatorRole:actor.role}:{})};
          await authorizeDocument(actor, proposed, id, repo, true); documents.push(proposed);
        }
      };
      // Scope requirements are tied to logical operation IDs, never HTTP-supplied policy names.
      if (id === 'requests.result') {
        if (selection.kind !== 'request-result') return invalid();
        const requestKey = selection.requestKey;
        if (typeof requestKey !== 'string' || requestKey.length < 1 || requestKey.length > 200 || requestKey.includes('\0')) return invalid();
        const resultOperation = operation(selection.operationId);
        if (operations[resultOperation].mode !== 'command') return invalid();
        authorizeAction(actor, resultOperation);
        if (resultOperation === 'preferences.save') {
          const saved = (await session.query<{response: unknown}>(`SELECT response FROM ${repo.auth}.preference_request WHERE actor_id=$1 AND request_key=$2`, [actor.id, requestKey])).rows[0];
          requestResult = {requestKey, operationId: resultOperation, resolution: saved ? 'COMMITTED' : 'NOT_FOUND',
            ...(saved ? {originalResponse: saved.response} : {})};
          return work(Object.freeze({actor, session, repo, documents: Object.freeze(documents), listScope, requestResult}));
        }
        const row = (await session.query<{document_id: string | null; operation: string | null; command_scope: string; response: unknown; completed_at: Date | null; committed_state: string | null}>(
          `SELECT document_id,operation,command_scope,response,completed_at,committed_state FROM ${repo.runtime}.idempotency_request
            WHERE actor_id=$1 AND idempotency_key=$2 AND (operation=$3 OR command_scope=$3)`, [actor.id, requestKey, resultOperation])).rows;
        if (row.length > 1) throw new SecurityError('PENDING_VERIFICATION', 409, '原请求身份待核实');
        const record = row[0];
        if (record?.document_id) {
          const scope = await repo.document(record.document_id);
          await authorizeDocument(actor, scope, scope.type === 'CORRECTION' ? 'correction.detail' : scope.type === 'SALE' ? 'sales.detail' : 'transfers.detail', repo); documents.push(scope);
          if(record.completed_at&&record.committed_state==='COMMITTED')await authorizeDocumentResponse(actor,repo,scope,record.response);
        }
        // Raw results lacking a persisted authorized object must not leak business data.
        const resolvedDocument = record?.completed_at && record.committed_state === 'COMMITTED' && record.document_id;
        const resolvedMaster = record?.completed_at && resultOperation==='masters.save' && record.command_scope==='masters.save' && record.response!==null;
        const resolvedProduct = record?.completed_at && ['products.save','products.delete','productMasters.save'].includes(resultOperation) && record.command_scope===resultOperation && record.response!==null;
        const resolvedImport = record?.completed_at && resultOperation==='imports.referenceCommit' && record.command_scope===resultOperation && record.response!==null;
        const resolved = resolvedDocument || resolvedMaster || resolvedProduct || resolvedImport;
        requestResult = {requestKey, operationId: resultOperation, resolution: !record ? 'NOT_FOUND' : resolved ? 'COMMITTED' : 'PENDING_VERIFICATION',
          ...(resolved ? {documentId: record.document_id, originalResponse: record.response} : {})};
      } else if (id === 'imports.referencePreflight' || id === 'imports.referenceCommit') {
        if (selection.kind !== 'reference-import' || !selection.kinds.length || selection.kinds.some(kind => !['products','masters','employees'].includes(kind))) return invalid();
        if (selection.kinds.includes('employees') && actor.role !== 'ADMIN') throw new SecurityError('FORBIDDEN');
      } else if (id === 'media.read') {
        if (selection.kind !== 'media') return invalid();
        await repo.product(await repo.mediaProduct(selection.id));
      } else if (id === 'specs.ensureForTransaction') {
        if (selection.kind !== 'transaction-spec') return invalid();
        await document(selection.document); await repo.product(selection.productId);
      } else if (id === 'inventory.sourceTrace') {
        if (selection.kind !== 'document' && selection.kind !== 'inventory-posting') return invalid();
        let documentId = selection.id;
        if (selection.kind === 'inventory-posting') {
          const posting = (await session.query<{document_id:string}>(`SELECT document_id FROM ${repo.runtime}.posting WHERE id=$1::uuid`,[identifier(selection.id,true)])).rows[0];
          if (!posting) throw new SecurityError('NOT_FOUND',404,'库存流水来源不存在');
          documentId = posting.document_id;
        }
        const scope = await repo.document(documentId);
        await authorizeDocument(actor, scope, scope.type === 'CORRECTION' ? 'correction.detail' : scope.type === 'SALE' ? 'sales.detail' : 'transfers.detail', repo); documents.push(scope);
      } else if (id.startsWith('sales.') || id.startsWith('transfers.') || id === 'work.command') {
        if (id === 'work.command' && selection.kind === 'transfer-draft') {
          // Actor-owned unsaved UI work is not a persisted business document or stock authorization.
          if (!/^草稿-[a-f0-9]{8}$/.test(selection.id)) return invalid();
        } else if (id === 'work.command' && selection.kind === 'sales-draft') {
          if (!/^unsaved-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(selection.id)) return invalid();
        } else if (id.endsWith('.list')) {
          const type = id.startsWith('sales.') ? 'SALE' : 'TRANSFER';
          if (selection.kind !== 'document-list' || selection.type !== type) return invalid();
          const storeId = type === 'SALE' && actor.role === 'SALESPERSON' ? actor.storeId : selection.storeId ?? null;
          if (selection.storeId && type === 'SALE' && actor.role === 'SALESPERSON' && selection.storeId !== actor.storeId) throw new SecurityError('SCOPE');
          listScope = Object.freeze({type, storeId});
        } else if (selection.kind === 'document' || selection.kind === 'document-change' || selection.kind === 'new-document') await document(selection);
        else return invalid();
      } else if (id.startsWith('outputs.')) {
        if (selection.kind === 'documents') {
          if (!selection.ids.length || selection.ids.length > 1000) return invalid();
          for (const objectId of selection.ids) await document({kind: 'document', id: objectId});
        } else if (id === 'outputs.export' && selection.kind === 'products') {
          if (!selection.ids.length || selection.ids.length > 100 || new Set(selection.ids).size !== selection.ids.length) return invalid();
          for (const productId of selection.ids) await repo.product(identifier(productId,true));
        } else if (id === 'outputs.export' && selection.kind === 'export-task') {
          identifier(selection.id,true);
        } else if (selection.kind === 'product') await repo.product(selection.id);
        else return invalid(); // Outputs require explicit persisted objects; no generic sales export bypass.
      } else if (id === 'correction.preview' || id === 'correction.confirm') {
        if (selection.kind !== 'warehouse') return invalid();
        const warehouse = await repo.warehouse(selection.id);
        if (!warehouse.enabled || warehouse.source_ownership_unknown || !warehouse.hall_relations.length) throw new SecurityError('SCOPE',403,'仓库已停用或归属尚未核实，不能校正');
      } else if (id === 'correction.detail') {
        if (selection.kind !== 'document') return invalid();
        await document(selection);
      } else if (id === 'products.detail' || id === 'products.checkDelete' || id === 'products.delete' || id === 'media.stageUpload') {
        if (selection.kind !== 'product') return invalid(); await repo.product(selection.id);
      } else if (selection.kind === 'product' && id === 'products.save') await repo.product(selection.id);
      else if (selection.kind !== 'global') return invalid();
      return work(Object.freeze({actor, session, repo, documents: Object.freeze(documents), listScope, requestResult}));
    };
    return write ? this.access.transaction(run) : this.access.read(run);
  }
  async listEmployees(token: string): Promise<EmployeeView[]> {
    return this.execute(token, 'employees.list', {kind: 'global'}, async ({session, repo}) =>
      (await session.query<AccountRow>(`SELECT id,login_name,body,password_salt,password_hash,version FROM ${repo.auth}.employee_login ORDER BY id`)).rows.map(employeeView));
  }
  async saveEmployee(token: string, input: unknown): Promise<EmployeeView> {
    return this.execute(token, 'employees.save', {kind: 'global'}, async ({actor, session, repo}) => {
      const envelope = object(input), record = object(envelope['record']), id = identifier(record['id']);
      const old = await repo.account(id);
      if (old && envelope['expectedVersion'] !== old.version) throw new SecurityError('VERSION_CONFLICT', 409, '员工资料已更新，请重新核对');
      const role = roleOf(record['role'] ?? old?.body['role']);
      if (!role) return invalid();
      const body = {...old?.body};
      for (const field of ['code','name','phone','storeId','loginEnabled','employmentStatus','loginName']) if (Object.hasOwn(record, field)) body[field] = record[field];
      const sourceEmployee = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        ? (await session.query<{source_code:string|null;source_payload:unknown}>(`SELECT e.source_code,e.source_payload FROM ${repo.source}.tplus_employee e
          WHERE e.id=$1::uuid AND e.batch_id=(SELECT batch_id FROM ${repo.source}.tplus_import_run WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1)`,[id])).rows[0]
        : undefined;
      if (old && Object.hasOwn(record,'code') && record['code']!==old.body['code']) throw new SecurityError('VALIDATION',409,'员工来源编码只读');
      if (sourceEmployee) {
        const payload=sourceEmployee.source_payload&&typeof sourceEmployee.source_payload==='object'&&!Array.isArray(sourceEmployee.source_payload)?sourceEmployee.source_payload as Record<string,unknown>:{};
        const sourceFacts={source:payload};
        if (record['code']!==undefined && record['code']!==(sourceEmployee.source_code??'')) throw new SecurityError('VALIDATION',409,'员工来源编码只读');
        if (Object.hasOwn(record,'sourceFacts')&&JSON.stringify(object(record['sourceFacts']))!==JSON.stringify(sourceFacts)) throw new SecurityError('VALIDATION',409,'员工来源事实只读');
        body['code']=sourceEmployee.source_code??'';
        body['sourceFacts']=sourceFacts;
      } else if (!old&&Object.hasOwn(record,'sourceFacts')&&Object.keys(object(record['sourceFacts'])).length) {
        throw new SecurityError('VALIDATION',400,'新员工不能伪造来源事实');
      }
      const hallId=Object.hasOwn(record,'hallId')?record['hallId']:record['storeId'];
      if (hallId!==undefined) {body['hallId']=hallId;body['storeId']=hallId;}
      if (Object.hasOwn(record,'sourceFacts')) {
        const sourceFacts=object(record['sourceFacts']);
        if (old&&JSON.stringify(sourceFacts)!==JSON.stringify(old.body['sourceFacts']??{})) throw new SecurityError('VALIDATION',400,'员工来源事实只读');
        if (!old) body['sourceFacts']=sourceFacts;
      }
      body['role'] = roleNames[role];
      if (typeof body['name'] !== 'string' || !body['name'].trim() || body['name'].length > 128 || !['在职','离职'].includes(String(body['employmentStatus'])) || typeof body['loginEnabled'] !== 'boolean') return invalid();
      if (body['code'] !== undefined && (typeof body['code']!=='string' || body['code'].length>128 || body['code'].includes('\0'))) return invalid();
      if (body['phone'] !== undefined && (typeof body['phone']!=='string' || body['phone'].length>128 || body['phone'].includes('\0'))) return invalid();
      body['name'] = body['name'].trim(); body['enabled'] = body['employmentStatus'] === '在职';
      if (!body['enabled'] || old && (old.body['employmentStatus'] === '离职' || old.body['enabled'] === false) && body['employmentStatus'] === '在职') body['loginEnabled'] = false;
      const name = Object.hasOwn(record,'loginName') ? record['loginName'] : old?.login_name ?? body['loginName'] ?? '';
      if (typeof name !== 'string' || name.length > 128 || name.includes('\0')) return invalid();
      body['loginName'] = name.trim();
      const storeId = body['hallId'];
      if (storeId && typeof storeId !== 'string') return invalid();
      const assigningStore = (Object.hasOwn(record,'hallId')||Object.hasOwn(record,'storeId')) && storeId !== (old?.body['hallId']??old?.body['storeId']);
      if (storeId && assigningStore && !await repo.hallExists(String(storeId))) throw new SecurityError('VALIDATION', 400, '营业厅关系无效');
      if (role === 'SALESPERSON' && body['loginEnabled'] && (!storeId || !await repo.hallExists(String(storeId)))) throw new SecurityError('VALIDATION', 400, '营业员需要有效营业厅');
      const password = envelope['password'];
      const credential = password !== undefined && password !== '' ? await passwordCredential(password) : null;
      const salt = credential?.salt ?? old?.password_salt ?? null, hash = credential?.hash ?? old?.password_hash ?? null;
      if (body['loginEnabled'] && (!name.trim() || !supportedCredential(salt,hash))) throw new SecurityError('VALIDATION', 400, '开通登录需要有效账号和密码');
      if (old && roleOf(old.body['role']) === 'ADMIN' && old.body['employmentStatus'] === '在职' && old.body['loginEnabled'] === true && !(role === 'ADMIN' && body['enabled'] && body['loginEnabled'])) {
        const others = await session.query<AccountRow>(`SELECT id,login_name,body,password_salt,password_hash,version FROM ${repo.auth}.employee_login WHERE id<>$1 AND body->>'role' IN ('管理员','ADMIN')`, [id]);
        let anotherAdministrator = false;
        for (const candidate of others.rows) {
          try {anotherAdministrator ||= (await repo.actor(candidate)).role === 'ADMIN';}
          catch (error) {if (!(error instanceof SecurityError)) throw error;}
        }
        if (!anotherAdministrator) throw new SecurityError('LAST_ADMIN', 409, '不能关闭最后一个可登录管理员');
      }
      for (const field of ['password','credential','hasPassword','authVersion']) delete body[field];
      const version = (old?.version ?? 0) + 1; // Every account edit revokes sessions; no stale role/object cache.
      await session.query(`INSERT INTO ${repo.auth}.employee_login(id,login_name,body,password_salt,password_hash,version) VALUES($1,$2,$3::jsonb,$4,$5,$6)
        ON CONFLICT(id) DO UPDATE SET login_name=excluded.login_name,body=excluded.body,password_salt=excluded.password_salt,password_hash=excluded.password_hash,version=excluded.version,updated_at=now()`, [id, name.trim() || null, JSON.stringify(body), salt, hash, version]);
      await session.query(`DELETE FROM ${repo.auth}.employee_session WHERE employee_id=$1`, [id]);
      await session.query(`INSERT INTO ${repo.runtime}.operator(id,name,role,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,enabled=excluded.enabled`, [id, String(body['name']), role, body['enabled'] === true && body['loginEnabled'] === true]);
      const fields = ['code','name','role','hallId','phone','employmentStatus','loginEnabled','loginName'];
      const changes = fields.filter(field => JSON.stringify(old?.body[field]) !== JSON.stringify(body[field])).map(field => ({field, before: old?.body[field] ?? null, after: body[field] ?? null}));
      if (credential) changes.push({field: 'credential', before: old?.password_hash ? '已设置' : null, after: '已重置'});
      await session.query(`INSERT INTO ${repo.auth}.employee_account_audit(actor_id,employee_id,action,changes) VALUES($1,$2,$3,$4::jsonb)`, [actor.id, id, old ? '修改' : '新增', JSON.stringify(changes)]);
      return employeeView({id, login_name: name.trim() || null, body, password_salt: salt, password_hash: hash, version});
    });
  }
}
