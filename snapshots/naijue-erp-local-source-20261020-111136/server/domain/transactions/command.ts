import {randomUUID} from 'node:crypto';
import type {DataSession, ActionLock} from '../../database/session.js';
import {DataAccessError} from '../../database/access-errors.js';
import {SecurityError} from '../../security/errors.js';
import {authorizeDocumentResponse} from '../../security/document-response.js';
import type {AuthorizedContext} from '../../security/service.js';
import {CommandError, executeIdempotent} from '../idempotency/index.js';
import {formatScaled, parseBusinessDay, parseScaled, type DecimalPlaces} from './decimal.js';
import {validateSkuUse} from '../products/profile.js';
import {validateTransfer} from '../transfers/validation.js';
import {linkTransferDraftWork} from '../transfers/work.js';
import {prepareSaleRevision} from '../sales/validation.js';
import {linkSaleDraftWork} from '../sales/work.js';
import {protectSaleAssociations, saleMemoRevision, validateReturnWarehouses} from '../sales/returns.js';
import {HistoryError} from '../inventory/history-plan.js';
import {assertCurrentExportReadOnly} from '../inventory/current-export-store.js';
import {recordFormalBaselinePosting,formalBaselinePostingEffects,formalHistoricalDocumentEffects,formalHistoricalRevisionReversal,assertFormalCurrentSourceDocumentWritable} from '../inventory/formal-current-baseline.js';
import {assertHistoryDocumentAdmission, historyBaselineEffects, historyPostingEffects, recordHistoryPosting} from '../inventory/history-runtime.js';

export type DocumentType = 'SALE' | 'TRANSFER';
export type DocumentCommandName = 'create' | 'save' | 'approve' | 'unapprove' | 'delete';
export interface DocumentCommand {
  readonly documentId: string;
  readonly documentType: DocumentType;
  readonly operation: DocumentCommandName;
  readonly expectedVersion: number;
  readonly requestKey: string;
  readonly body?: Record<string, unknown>;
}

interface DocumentRow {
  id: string; document_type: DocumentType; number: string; status: string; baseline_was_included: boolean;
  current_effect_active: boolean; active_effect_identity: string | null; active_effect_revision: number | null;
  current_revision: number; version: number; business_day: string | null;
}
interface RevisionRow {body: Record<string, unknown>; original_imported: boolean}
interface Movement {index: number; warehouse: string; sku: string; quantity: string}
interface Effect {index: number; warehouse: string; sku: string; quantity: bigint; unit?: string}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const fail = (code: string, status = 400, message = '单据命令无效'): never => {throw new SecurityError(code,status,message);};
const scaled = (value: unknown, places: DecimalPlaces, label: string): bigint => {
  try {return parseScaled(value,places,false);}
  catch {return fail('VALIDATION',400,`${label}精度或范围无效`);}
};
const date = (value: unknown): string => {
  try {return parseBusinessDay(value);}
  catch {return fail('VALIDATION',400,'业务日期必须为有效的 YYYY-MM-DD');}
};

function validateBody(type: DocumentType, value: unknown, approving: boolean, originalImported = false): {body: Record<string, unknown>; businessDay: string} {
  if (!record(value) || !record(value['header']) || !Array.isArray(value['lines']) || type === 'TRANSFER' && value['lines'].length > 10000
    || !Array.isArray(value['fundsRecords'])) return fail('VALIDATION',400,'单据正文结构无效');
  const body = value, header = body['header'] as Record<string, unknown>, lines = body['lines'] as unknown[], funds = body['fundsRecords'] as unknown[];
  const businessDay = date(header['business_date']);
  if (Object.hasOwn(header,'adjustment')) scaled(header['adjustment'],2,'调整金额');
  const sourcePayload = record(header['source_payload']) ? header['source_payload'] : null;
  if (!Object.hasOwn(header,'adjustment') && sourcePayload && Object.hasOwn(sourcePayload,'rounding')) scaled(sourcePayload['rounding'],2,'调整金额');
  const sourceIds = new Set<string>();
  for (const valueLine of lines) {
    if (!record(valueLine) || !identifier(valueLine['sku_id'])) return fail('VALIDATION',400,'商品规格身份无效');
    const line = valueLine;
    scaled(line['source_quantity'],4,'数量');
    if (type === 'SALE') {
      if (!identifier(line['warehouse_id'])) return fail('VALIDATION',400,'销货仓库身份无效');
      // T21 validates economics against trusted imported revisions inside the idempotent action.
      // Checking source prices here as new two-decimal input would reject unchanged history.
      const sourceId = line['source_id'];
      if (sourceId !== undefined) {
        if (typeof sourceId !== 'string' || !sourceId.trim() || sourceId.length > 256 || sourceIds.has(sourceId)) return fail('VALIDATION',400,'销货明细来源重复或无效');
        sourceIds.add(sourceId);
      }
    } else if (!identifier(line['from_warehouse_id']) || !identifier(line['to_warehouse_id']) || line['from_warehouse_id'] === line['to_warehouse_id']) {
      return fail('VALIDATION',400,'调拨必须指定两个不同的仓库');
    }
  }
  if (type === 'SALE') for (const valueFund of funds) {
    if (!record(valueFund)) return fail('VALIDATION',400,'收退款记录无效');
  }
  return {body,businessDay};
}

function effects(type: DocumentType, body: Record<string, unknown>, originalImported: boolean, invert = false): Effect[] {
  const lines = body['lines'];
  if (!Array.isArray(lines)) return fail('VALIDATION');
  const result: Effect[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]; if (!record(line) || !identifier(line['sku_id'])) return fail('VALIDATION',400,'过账明细规格身份无效');
    const saleFacts=record(body['salesFacts'])?body['salesFacts']:null;
    const verifiedEffect=Array.isArray(saleFacts?.['stockEffects'])?saleFacts['stockEffects'][index]:null;
    const verifiedSale=type==='SALE'&&!originalImported&&record(verifiedEffect)&&verifiedEffect['skuId']===line['sku_id']&&verifiedEffect['warehouseId']===line['warehouse_id'];
    let quantity = verifiedSale ? verifiedEffect['quantity'] : type === 'SALE' && originalImported ? line['stock_quantity_contribution'] : line['source_quantity'];
    if (quantity === undefined || quantity === null) return fail('VALIDATION',409,'历史有效贡献缺失，拒绝推算或重放');
    let scaledQuantity = scaled(quantity,4,'过账数量');
    if (type === 'SALE' && !originalImported && !verifiedSale) scaledQuantity = -scaledQuantity;
    const add = (warehouse: unknown, amount: bigint): void => {
      if (!identifier(warehouse)) return fail('VALIDATION',400,'过账仓库身份无效');
      const unit = line['measurement_unit'] ?? line['unit'];
      if (line['measurement_unit'] !== undefined && line['unit'] !== undefined && line['measurement_unit'] !== line['unit']) return fail('VALIDATION',400,'计量单位字段冲突');
      if (unit !== undefined && (typeof unit !== 'string' || !unit.trim())) return fail('VALIDATION',400,'计量单位无效');
      result.push({index,warehouse,sku:line['sku_id'] as string,quantity:invert ? -amount : amount,...(typeof unit === 'string' ? {unit} : {})});
    };
    if (type === 'TRANSFER') {
      add(line['from_warehouse_id'],-scaledQuantity);
      add(line['to_warehouse_id'],scaledQuantity);
    } else add(line['warehouse_id'],scaledQuantity);
  }
  return result;
}

function failure(error: unknown): never {
  if (error instanceof HistoryError) throw new SecurityError('HISTORY_CONTRIBUTION',409,error.code);
  if (error instanceof SecurityError) throw error;
  if (error instanceof CommandError) {
    if (error.code === 'IDEMPOTENCY_CONFLICT') throw new SecurityError('IDEMPOTENCY_CONFLICT',409,'同一请求编号已绑定不同内容');
    if (error.code === 'VALIDATION_ERROR') throw new SecurityError('VALIDATION',400,error.message);
    throw new SecurityError('ROLLED_BACK',409,'本次命令已回滚，请核对原请求后重试');
  }
  if (error instanceof DataAccessError) {
    if (error.sqlState === '23505') throw new SecurityError('REVISION',409,'单据版本或来源已变化，本次命令已回滚');
    throw new SecurityError('ROLLED_BACK',409,'本次命令已回滚，请核对原请求后重试');
  }
  throw error;
}

async function document(session: DataSession, runtime: string, id: string): Promise<{row: DocumentRow; revision: RevisionRow}> {
  const row = (await session.query<DocumentRow & {body: Record<string, unknown>; original_imported: boolean}>(`SELECT d.*,r.body,r.original_imported
    FROM ${runtime}.document d JOIN ${runtime}.revision r ON r.document_id=d.id AND r.revision=d.current_revision
    WHERE d.id=$1::uuid FOR UPDATE OF d`, [id])).rows[0];
  if (!row) return fail('NOT_FOUND',404,'单据不存在');
  return {row,revision:{body:row.body,original_imported:row.original_imported}};
}

async function addHistory(session: DataSession, runtime: string, id: string, operation: DocumentCommandName, actor: string, requestKey: string): Promise<DocumentRow> {
  const row = (await session.query<DocumentRow>(`SELECT * FROM ${runtime}.document WHERE id=$1::uuid`,[id])).rows[0];
  if (!row) return fail('ROLLED_BACK',409,'单据更新后无法回读');
  await session.query(`INSERT INTO ${runtime}.version_history(document_id,version,operation,revision,actor_id,request_key)
    VALUES($1::uuid,$2,$3,$4,$5,$6) RETURNING version`,[id,row.version,operation,row.current_revision,actor,requestKey]);
  return row;
}

async function insertRevision(session: DataSession, runtime: string, id: string, revision: number, body: Record<string, unknown>, actor: string, originalImported = false): Promise<void> {
  await session.query(`INSERT INTO ${runtime}.revision(document_id,revision,original_imported,body,actor_id)
    VALUES($1::uuid,$2,$3,$4::jsonb,$5) RETURNING document_id`,[id,revision,originalImported,JSON.stringify(body),actor]);
}

export async function updateProjection(session: DataSession, runtime: string, postingId: string, input: readonly Effect[]): Promise<void> {
  const unitHistory = await recordFormalBaselinePosting(session,runtime,postingId,input)
    || await recordHistoryPosting(session,runtime,postingId,input);
  const totals = new Map<string,Effect>();
  for (const effect of input) {
    const key = `${effect.warehouse}:${effect.sku}`, current = totals.get(key);
    totals.set(key,{...effect,quantity:(current?.quantity ?? 0n)+effect.quantity});
  }
  for (const effect of unitHistory ? [] : [...totals.values()].sort((a,b) => `${a.warehouse}:${a.sku}`.localeCompare(`${b.warehouse}:${b.sku}`))) {
    await session.query(`INSERT INTO ${runtime}.inventory_delta(warehouse_id,sku_id,quantity)
      VALUES($1::uuid,$2::uuid,$3::numeric) ON CONFLICT(warehouse_id,sku_id)
      DO UPDATE SET quantity=${runtime}.inventory_delta.quantity+excluded.quantity RETURNING sku_id`,
    [effect.warehouse,effect.sku,formatScaled(effect.quantity,4)]);
  }
  for (const effect of input) await session.query(`INSERT INTO ${runtime}.movement(posting_id,line_index,warehouse_id,sku_id,quantity)
    VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5::numeric) RETURNING posting_id`,
  [postingId,effect.index,effect.warehouse,effect.sku,formatScaled(effect.quantity,4)]);
}

async function activeEffects(session: DataSession, runtime: string, row: DocumentRow): Promise<Effect[]> {
  const identity = row.active_effect_identity;
  if (!identity || row.active_effect_revision === null) return fail('VALIDATION',409,'有效过账来源缺失');
  if (identity.startsWith('baseline:')) {
    const formal=await formalHistoricalRevisionReversal(session,runtime,row.id,row.document_type,row.active_effect_revision);
    if (formal) return formal;
    const counted = await historyBaselineEffects(session,runtime,row.id,row.active_effect_revision,identity);
    if (counted) return counted;
    const active = (await session.query<{id: string}>(`SELECT id FROM ${runtime}.inventory_opening_run WHERE active`)).rows[0];
    if (active) {
      const covered = (await session.query<{revision: number; effect_identity: string}>(`SELECT revision,effect_identity
        FROM ${runtime}.inventory_opening_prior_document WHERE run_id=$1 AND document_id=$2::uuid`,[active.id,row.id])).rows[0];
      if (!covered || covered.revision !== row.active_effect_revision || covered.effect_identity !== identity) return fail('REVISION',409,'历史贡献未被当前期初覆盖，不能按期初影响反向');
    } else if (!row.baseline_was_included) return fail('REVISION',409,'缺少期初来源关系，拒绝反向历史贡献');
    const coveredRevision = (await session.query<RevisionRow>(`SELECT body,original_imported FROM ${runtime}.revision
      WHERE document_id=$1::uuid AND revision=$2`,[row.id,row.active_effect_revision])).rows[0];
    if (!coveredRevision) return fail('REVISION',409,'期初覆盖的历史修订缺失，拒绝反向');
    return effects(row.document_type,coveredRevision.body,coveredRevision.original_imported,true);
  }
  const formalPosting = await formalBaselinePostingEffects(session,runtime,identity);
  if (formalPosting) return formalPosting;
  const countedPosting = await historyPostingEffects(session,runtime,identity);
  if (countedPosting) return countedPosting;
  const rows = (await session.query<Movement>(`SELECT line_index AS index,warehouse_id AS warehouse,sku_id AS sku,quantity::text quantity
    FROM ${runtime}.movement WHERE posting_id=$1::uuid ORDER BY line_index,warehouse_id`,[identity])).rows;
  if (!rows.length) return fail('REVISION',409,'有效过账流水缺失，拒绝估算库存影响');
  return rows.map(item => ({index:item.index,warehouse:item.warehouse,sku:item.sku,quantity:-scaled(item.quantity,4,'历史流水数量')}));
}

function response(row: DocumentRow, body: Record<string, unknown>): Record<string, unknown> {
  return {ok:true,document:{id:row.id,documentType:row.document_type,number:row.number,status:row.status,version:row.version,
    currentRevision:row.current_revision,businessDay:row.business_day,baselineWasIncluded:row.baseline_was_included,
    currentEffectActive:row.current_effect_active,body}};
}

/** Executes one T10-authorized document command on the caller's existing T09 session. */
export async function executeDocumentCommand(context: AuthorizedContext, input: DocumentCommand, logicalOperation: string): Promise<Record<string, unknown>> {
  const {session,repo,actor} = context, runtime = repo.runtime;
  if (!identifier(input.documentId) || !['SALE','TRANSFER'].includes(input.documentType)
    || !['create','save','approve','unapprove','delete'].includes(input.operation)
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
    || typeof input.requestKey !== 'string' || !input.requestKey.trim() || input.requestKey.length > 200 || input.requestKey.includes('\0')) {
    return fail('VALIDATION',400,'单据命令身份、版本或请求编号无效');
  }
  if ((input.operation === 'create' || input.operation === 'save') && !input.body
    || input.operation === 'unapprove' && input.body !== undefined || input.operation === 'delete' && input.body !== undefined) return fail('VALIDATION');
  const prepared = input.body ? validateBody(input.documentType,input.body,input.operation === 'approve') : null;
  const requestPayload = {documentId:input.documentId,documentType:input.documentType,operation:input.operation,
    expectedVersion:input.expectedVersion,...(prepared ? {body:prepared.body} : {})};
  try {
    // Calibration rejects every document mutation before even an idempotency placeholder is written.
      await assertCurrentExportReadOnly(session,runtime);
      await assertFormalCurrentSourceDocumentWritable(session,runtime,input.documentId);
    const result=await executeIdempotent(session,{actorId:actor.id,commandScope:logicalOperation,idempotencyKey:input.requestKey,runtimeSchema:runtime,payload:requestPayload,
      execute:async() => {
        let current: DocumentRow | null = null, body: Record<string, unknown>;
        if (input.operation === 'create') {
          if (input.expectedVersion !== 0 || !prepared || await existsDocument(session,runtime,input.documentId)) return fail('REVISION',409,'新建单据版本已变化或单据编号已存在');
          body = prepared.body;
          if (input.documentType === 'SALE') {
            await protectSaleAssociations(context,input.documentId,input.operation,body);
            body = await prepareSaleRevision(context,input.documentId,body,false);
            validateReturnWarehouses(body);
          }
          else await validateSkuUse(context,body,null);
          if (input.documentType === 'TRANSFER') await validateTransfer(context,input.documentId,body);
          const header = body['header'] as Record<string,unknown>;
          const suppliedNumber = header['source_number'];
          const number = typeof suppliedNumber === 'string' && suppliedNumber.trim() && !/^(?:unsaved-|草稿-)/.test(suppliedNumber)
            ? suppliedNumber.trim() : `V2-${input.documentType === 'SALE' ? 'XS' : 'DB'}-${input.documentId.slice(0,8)}`;
          await assertHistoryDocumentAdmission(session,runtime,input.documentId,number,prepared.businessDay);
          const transferCreatorHall = input.documentType === 'TRANSFER' && actor.role === 'SALESPERSON' ? actor.storeId : null;
          await session.query(`INSERT INTO ${runtime}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day,transfer_creator_hall_id,transfer_creator_account_id,transfer_creator_role)
            VALUES($1::uuid,$2,$3,'UNAUDITED',false,false,1,1,$4::date,$5::uuid,$6,$7) RETURNING id`,
          [input.documentId,input.documentType,number,prepared.businessDay,transferCreatorHall,input.documentType==='TRANSFER'?actor.id:null,input.documentType==='TRANSFER'?actor.role:null]);
          await insertRevision(session,runtime,input.documentId,1,body,actor.id);
          if (input.documentType === 'TRANSFER') await linkTransferDraftWork(context,input.documentId,body);
          else await linkSaleDraftWork(context,input.documentId,body);
        } else {
          const loaded = await document(session,runtime,input.documentId); current = loaded.row;
          if (current.document_type !== input.documentType) return fail('SCOPE',403,'单据类型与受权对象不一致');
          if (current.version !== input.expectedVersion) return fail('VERSION_CONFLICT',409,'单据已被其他操作更新，请刷新后重试');
          if (current.status === 'DELETED') return fail('REVISION',409,'已作废单据不能继续操作');
          body = loaded.revision.body;
          const saleMemoOnly=input.documentType==='SALE'&&await protectSaleAssociations(context,current.id,input.operation,prepared?.body);
          if (input.operation === 'save') {
            if (!prepared || !saleMemoOnly&&(current.current_effect_active || current.status === 'APPROVED')) return fail('REVISION',409,'已审核单据必须先弃审再修改');
            body = prepared.body;
            if (saleMemoOnly) body=saleMemoRevision(loaded.revision.body,body);
            else if (input.documentType === 'SALE') body = await prepareSaleRevision(context,current.id,body,false,loaded.revision.body);
            else await validateSkuUse(context,body,loaded.revision.body);
            if (input.documentType === 'TRANSFER') await validateTransfer(context,input.documentId,body,loaded.revision.body);
            else validateReturnWarehouses(body);
            await insertRevision(session,runtime,current.id,current.current_revision+1,body,actor.id);
            await session.query(`UPDATE ${runtime}.document SET current_revision=current_revision+1,version=version+1,business_day=$2::date,updated_at=now()
              WHERE id=$1::uuid RETURNING id`,[current.id,prepared.businessDay]);
          } else if (input.operation === 'delete') {
            if (!['DRAFT','UNAUDITED'].includes(current.status) || current.current_effect_active) return fail('REVISION',409,'只有未审核单据可以作废');
            await session.query(`UPDATE ${runtime}.document SET status='DELETED',version=version+1,updated_at=now() WHERE id=$1::uuid RETURNING id`,[current.id]);
          } else if (input.operation === 'approve') {
            if (current.current_effect_active || !['DRAFT','UNAUDITED'].includes(current.status)) return fail('REVISION',409,'当前状态不能审核');
            await assertHistoryDocumentAdmission(session,runtime,current.id,current.number,prepared?.businessDay ?? date((body['header'] as Record<string,unknown>)['business_date']));
            if (input.documentType === 'TRANSFER') await validateTransfer(context,input.documentId,prepared?.body ?? body);
            if (prepared) {
              body = prepared.body;
              if (input.documentType === 'SALE') body = await prepareSaleRevision(context,current.id,body,true,loaded.revision.body);
              await insertRevision(session,runtime,current.id,current.current_revision+1,body,actor.id);
              await session.query(`UPDATE ${runtime}.document SET current_revision=current_revision+1,business_day=$2::date WHERE id=$1::uuid RETURNING id`,[current.id,prepared.businessDay]);
            } else {
              body = validateBody(input.documentType,loaded.revision.body,true,loaded.revision.original_imported).body;
              if (input.documentType === 'SALE') body = await prepareSaleRevision(context,current.id,body,true,loaded.revision.body,loaded.revision.original_imported);
            }
            const rev = current.current_revision + (prepared ? 1 : 0);
            if (input.documentType === 'SALE') validateReturnWarehouses(body);
            const revision = {body,original_imported:prepared?false:loaded.revision.original_imported};
            if (input.documentType === 'TRANSFER') await validateSkuUse(context,revision.body,loaded.revision.original_imported ? loaded.revision.body : null);
            const postingId = randomUUID(), movement = await formalHistoricalDocumentEffects(session,runtime,current.id,input.documentType,revision.body)
              ?? effects(input.documentType,revision.body,revision.original_imported);
            if (!movement.length) return fail('VALIDATION',400,'空单据不能审核');
            await session.query(`UPDATE ${runtime}.document SET status='APPROVED',current_effect_active=true,active_effect_identity=$2,
              active_effect_revision=$3,version=version+1,original_auditor=CASE WHEN baseline_was_included OR EXISTS(SELECT 1 FROM ${runtime}.revision ir WHERE ir.document_id=$1::uuid AND ir.original_imported) THEN original_auditor ELSE coalesce(original_auditor,$4) END,
              original_audited_at=CASE WHEN baseline_was_included OR EXISTS(SELECT 1 FROM ${runtime}.revision ir WHERE ir.document_id=$1::uuid AND ir.original_imported) THEN original_audited_at ELSE coalesce(original_audited_at,now()) END,updated_at=now()
              WHERE id=$1::uuid RETURNING id`,[current.id,postingId,rev,actor.id]);
            await session.query(`INSERT INTO ${runtime}.posting(id,document_id,revision,reason,reversed_effect_identity,actor_id,request_key)
              VALUES($1::uuid,$2::uuid,$3,'REVISION_APPROVAL',NULL,$4,$5) RETURNING id`,[postingId,current.id,rev,actor.id,input.requestKey]);
            await updateProjection(session,runtime,postingId,movement);
          } else if (input.operation === 'unapprove') {
            if (!current.current_effect_active || current.status !== 'APPROVED') return fail('REVISION',409,'当前单据没有可弃审的有效过账');
            const movement = await activeEffects(session,runtime,current), postingId = randomUUID();
            await session.query(`UPDATE ${runtime}.document SET status='UNAUDITED',current_effect_active=false,active_effect_identity=NULL,
              active_effect_revision=NULL,version=version+1,updated_at=now() WHERE id=$1::uuid RETURNING id`,[current.id]);
            await session.query(`INSERT INTO ${runtime}.posting(id,document_id,revision,reason,reversed_effect_identity,actor_id,request_key)
              VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7) RETURNING id`,[postingId,current.id,current.active_effect_revision,
              current.active_effect_identity?.startsWith('baseline:') ? 'BASELINE_EFFECT_REVERSAL' : 'ACTIVE_EFFECT_REVERSAL',
              current.active_effect_identity,actor.id,input.requestKey]);
            await updateProjection(session,runtime,postingId,movement);
          } else return fail('VALIDATION');
        }
        const saved = await addHistory(session,runtime,input.documentId,input.operation,actor.id,input.requestKey);
        const latest = (await session.query<{body: Record<string,unknown>}>(`SELECT body FROM ${runtime}.revision WHERE document_id=$1::uuid AND revision=$2`,
          [saved.id,saved.current_revision])).rows[0];
        if (!latest) return fail('ROLLED_BACK',409,'单据修订后无法回读');
        await session.query(`UPDATE ${runtime}.idempotency_request SET document_id=$1::uuid,expected_version=$2,operation=$3,committed_state='COMMITTED'
          WHERE actor_id=$4 AND command_scope=$5 AND idempotency_key=$6 RETURNING id`,
        [saved.id,input.expectedVersion,logicalOperation,actor.id,logicalOperation,input.requestKey]);
        return response(saved,latest.body);
      }});
    await authorizeDocumentResponse(actor,repo,await repo.document(input.documentId),result);
    return result;
  } catch (error) {return failure(error);}
}

async function existsDocument(session: DataSession, runtime: string, id: string): Promise<boolean> {
  return (await session.query<{exists: boolean}>(`SELECT EXISTS(SELECT 1 FROM ${runtime}.document WHERE id=$1::uuid) AS exists`,[id])).rows[0]?.exists === true;
}

/** Complete T09 advisory lock plan, generated before T10 begins its authorization reads. */
export function documentCommandLocks(input: DocumentCommand, logicalOperation: string): readonly ActionLock[] {
  const locks: ActionLock[] = [
    // Serialize the check with calibration/opening binding for save/delete as well as posting commands.
    {scope:'reference',key:'inventory-opening-snapshot'},
    {scope:'idempotency',key:`${logicalOperation}:${input.requestKey}`},
    {scope:'document',key:input.documentId},
  ];
  if (input.operation === 'approve' || input.operation === 'unapprove') locks.push({scope:'inventory',key:'posting-ledger'});
  // Dynamic historical references are read only after authorization. One declared graph lock
  // serializes every SALE mutation before those reads; original rows are then locked in the action.
  if (input.documentType === 'SALE') locks.push({scope:'reference',key:'sales-return-associations'});
  return locks;
}
