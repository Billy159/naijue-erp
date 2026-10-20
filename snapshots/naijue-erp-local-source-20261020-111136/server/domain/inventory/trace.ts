import type {AuthorizedContext} from '../../security/service.js';
import {authorizeDocument} from '../../security/policies.js';
import {scopeFromBody,withTransferCreationScope,type ReadableDocumentType} from '../../security/repository.js';
import {identifier, SecurityError} from '../../security/errors.js';

interface HistoricalAudit {
  actorId:string|null; at:string|null; state:'UNKNOWN'|'SOURCE_RECORD'|'CONFLICT'|'FORBIDDEN';
  evidence:readonly {batchId:string;dataset:string;sourceId:string;sourceSha256:string;sourceRecordSha256:string}[];
}
/** Mutable runtime document audit columns are never proof of the imported source's audit. */
async function historicalAudit(context:AuthorizedContext,documentId:string,type:ReadableDocumentType):Promise<HistoricalAudit> {
  const unknown:HistoricalAudit={actorId:null,at:null,state:'UNKNOWN',evidence:[]}, {session,repo,actor}=context;
  const imported=(await session.query<{body:Record<string,unknown>}>(
    `SELECT body FROM ${repo.runtime}.revision WHERE document_id=$1::uuid AND original_imported ORDER BY revision LIMIT 1`,[documentId])).rows[0];
  if(!imported)return unknown;
  const action=type==='CORRECTION'?'correction.detail':type==='SALE'?'sales.detail':'transfers.detail';
  try {await authorizeDocument(actor,withTransferCreationScope(scopeFromBody(type,imported.body),await repo.document(documentId)),action,repo);}
  catch(error){if(error instanceof SecurityError&&['SCOPE','FORBIDDEN'].includes(error.code))return {...unknown,state:'FORBIDDEN'};throw error;}
  const rows=(await session.query<{batch_id:string;source_dataset:string;source_id:string;audited_by:string|null;audited_at:string|null;source_sha256:string;source_record_sha256:string}>(
    `SELECT h.batch_id,h.source_dataset,h.source_id,h.audited_by,h.audited_at,h.source_sha256,h.source_record_sha256
      FROM ${repo.source}.tplus_history_document h JOIN ${repo.source}.tplus_import_run i ON i.batch_id=h.batch_id AND i.status='COMMITTED'
      WHERE h.target_document_id=$1::uuid AND h.document_kind=$2 ORDER BY h.batch_id,h.source_dataset,h.source_id`,[documentId,type.toLowerCase()])).rows;
  if(!rows.length)return unknown;
  const present=(value:string|null)=>value?.trim()?value:null;
  const facts=rows.map(row=>({actorId:present(row.audited_by),at:present(row.audited_at)}));
  const evidence=rows.map(row=>({batchId:row.batch_id,dataset:row.source_dataset,sourceId:row.source_id,sourceSha256:row.source_sha256,sourceRecordSha256:row.source_record_sha256}));
  if(new Set(facts.map(fact=>JSON.stringify(fact))).size!==1)return {...unknown,state:'CONFLICT',evidence};
  return {...facts[0]!,state:'SOURCE_RECORD',evidence};
}

/** Both current document scope and the immutable requested revision must be authorized.
 * A document moving between halls must never disclose its former hall's saved contents. */
export async function authorizeInventoryRevision(context: AuthorizedContext, documentId: string, revision: number): Promise<Record<string,unknown>> {
  const {repo,actor,session} = context, scope = await repo.document(documentId);
  const action = scope.type === 'CORRECTION' ? 'correction.detail' : scope.type === 'SALE' ? 'sales.detail' : 'transfers.detail';
  await authorizeDocument(actor,scope,action,repo);
  const row = (await session.query<{body:Record<string,unknown>;original_imported:boolean;actor_id:string|null;created_at:Date}>(
    `SELECT body,original_imported,actor_id,created_at FROM ${repo.runtime}.revision WHERE document_id=$1::uuid AND revision=$2`,[documentId,revision])).rows[0];
  if (!row) throw new SecurityError('NOT_FOUND',404,'单据版本不存在');
  await authorizeDocument(actor,withTransferCreationScope(scopeFromBody(scope.type,row.body),scope),action,repo);
  const originalAudit=await historicalAudit(context,documentId,scope.type);
  const runtimeAudit=(await session.query<{actorId:string;at:Date;operationVersion:number|null;revision:number}>(
    `SELECT p.actor_id "actorId",p.created_at "at",h.version "operationVersion",p.revision
      FROM ${repo.runtime}.document d JOIN ${repo.runtime}.posting p ON p.id::text=d.active_effect_identity AND p.document_id=d.id AND p.reason='REVISION_APPROVAL'
      LEFT JOIN ${repo.runtime}.version_history h ON h.document_id=p.document_id AND h.request_key=p.request_key AND h.actor_id=p.actor_id AND h.operation='approve'
      WHERE d.id=$1::uuid AND d.current_effect_active`,[documentId])).rows[0]??null;
  return {documentId,documentType:scope.type,currentVersion:scope.version,currentStatus:scope.status,revision,
    body:row.body,originalImported:row.original_imported,actorId:row.actor_id,createdAt:row.created_at,
    originalAuditor:originalAudit.actorId,originalAuditedAt:originalAudit.at,historicalAudit:originalAudit,runtimeAudit};
}

export async function postingTrace(context: AuthorizedContext, postingId: string): Promise<Record<string,unknown>> {
  identifier(postingId,true);
  const {session,repo} = context;
  const posting = (await session.query<{id:string;document_id:string;revision:number;reason:string;reversed_effect_identity:string|null;actor_id:string;created_at:Date;operation_version:number|null}>(
    `SELECT p.id,p.document_id,p.revision,p.reason,p.reversed_effect_identity,p.actor_id,p.created_at,h.version operation_version
      FROM ${repo.runtime}.posting p LEFT JOIN ${repo.runtime}.version_history h ON h.document_id=p.document_id AND h.request_key=p.request_key
        AND h.actor_id=p.actor_id AND h.operation=CASE WHEN p.reason='INVENTORY_CORRECTION' THEN 'confirm' WHEN p.reason='REVISION_APPROVAL' THEN 'approve' ELSE 'unapprove' END
      WHERE p.id=$1::uuid`,[postingId])).rows[0];
  if (!posting) throw new SecurityError('NOT_FOUND',404,'库存流水来源不存在');
  const document = await authorizeInventoryRevision(context,posting.document_id,posting.revision);
  const movements = (await session.query<{line_index:number;warehouse_id:string;sku_id:string;unit:string|null;quantity:string}>(
    `SELECT leg_index line_index,warehouse_id,sku_id,unit,quantity::text FROM ${repo.runtime}.inventory_history_movement WHERE posting_id=$1::uuid
      UNION ALL SELECT line_index,warehouse_id,sku_id,NULL::text unit,quantity::text FROM ${repo.runtime}.movement WHERE posting_id=$1::uuid
        AND NOT EXISTS(SELECT 1 FROM ${repo.runtime}.inventory_history_movement WHERE posting_id=$1::uuid)
      ORDER BY line_index,warehouse_id,sku_id`,[postingId])).rows;
  return {postingId:posting.id,reason:posting.reason,reversedEffectIdentity:posting.reversed_effect_identity,actorId:posting.actor_id,
    createdAt:posting.created_at,operationVersion:posting.operation_version,document,movements,
    revisionUrl:`/api/inventory/documents/${posting.document_id}/revisions/${posting.revision}`};
}

export async function attachLedgerTargets(context: AuthorizedContext, ledger: Record<string,unknown>): Promise<Record<string,unknown>> {
  const items = ledger['items'];
  if (!Array.isArray(items)) throw new SecurityError('INVENTORY_READ_FAILED',503,'库存流水无法回读');
  const enriched: Record<string,unknown>[] = [];
  const targets = new Map<string,Record<string,unknown>>();
  for (const item of items as Record<string,unknown>[]) {
    const {documentId,...visible} = item, postingId = item['postingId'];
    if (typeof postingId !== 'string' && typeof documentId !== 'string') {enriched.push({...visible,sourceTarget:null}); continue;}
    const revision = item['revision'];
    if (typeof postingId !== 'string' && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1)) {
      enriched.push({...visible,sourceTarget:{available:false,reason:'VERSION_UNKNOWN'}}); continue;
    }
    const key = typeof postingId === 'string' ? postingId : String(documentId)+':'+String(revision);
    let target = targets.get(key);
    if (!target) {
      try {
        if (typeof postingId === 'string') {
          const trace = await postingTrace(context,postingId), document = trace['document'] as Record<string,unknown>;
          target = {available:true,postingId,documentId:document['documentId'],documentType:document['documentType'],
            revision:document['revision'],operationVersion:trace['operationVersion'],url:`/api/inventory/postings/${postingId}`};
        } else {
          const document = await authorizeInventoryRevision(context,String(documentId),revision as number);
          target = {available:true,documentId,documentType:document['documentType'],revision,
            url:`/api/inventory/documents/${documentId}/revisions/${String(revision)}`};
        }
      } catch (error) {
        if (!(error instanceof SecurityError) || !['SCOPE','FORBIDDEN','NOT_FOUND'].includes(error.code)) throw error;
        target = {available:false,reason:error.code};
      }
      targets.set(key,target);
    }
    enriched.push({...visible,sourceTarget:target});
  }
  return {...ledger,items:enriched};
}
