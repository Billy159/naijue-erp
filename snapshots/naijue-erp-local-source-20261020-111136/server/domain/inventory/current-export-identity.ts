import type {DataAccess} from '../../database/access.js';
import type {DatabaseConfig} from '../../database/config.js';
import {assertIsolatedTarget,databaseIdentifier as ident} from '../../database/config.js';
import {identityRecord} from '../../database/identity.js';
import {HistoryError,historyDigest} from './history-plan.js';
import {historyImportTarget,type HistoryImportTarget} from './history-store.js';

export interface CurrentQuantityIdentity {
  readonly kind:'WAREHOUSE'|'SKU'; readonly targetKey:string; readonly existingId:string|null;
  readonly evidenceSha256:string; readonly body:Readonly<Record<string,unknown>>;
}
export interface CurrentQuantityIdentityRow {kind:'WAREHOUSE'|'SKU';target_key:string;id:string;generated_in_target:boolean;evidence_sha256:string;body:Record<string,unknown>}
/** This is an isolated current-quantity identity projection, never a fabricated historical source row. */
export async function installCurrentQuantityIdentities(access:DataAccess,c:DatabaseConfig,target:HistoryImportTarget,records:readonly CurrentQuantityIdentity[]):Promise<{writes:number;identities:number}> {
  assertIsolatedTarget(c);
  if (c.environment!=='qa'||!c.database.startsWith('demo_8877_')||historyDigest(historyImportTarget(c))!==historyDigest(target)) throw new HistoryError('CURRENT_EXPORT_PRIVATE_QA_REQUIRED');
  const keys=new Set<string>(),ids=new Set<string>();
  for (const record of records) {
    const key=record.kind+':'+record.targetKey;
    if (!['WAREHOUSE','SKU'].includes(record.kind)||!record.targetKey||keys.has(key)||!record.body
      || !/^[a-f0-9]{64}$/.test(record.evidenceSha256)||record.existingId!==null&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(record.existingId)) throw new HistoryError('CURRENT_EXPORT_IDENTITY_PROJECTION_REQUIRED');
    keys.add(key);if (record.existingId!==null) {const id=record.kind+':'+record.existingId;if (ids.has(id)) throw new HistoryError('CURRENT_EXPORT_RUNTIME_IDENTITY_MERGE_REJECTED');ids.add(id);}
  }
  const detached=structuredClone(records),runtime=ident(c.schemas.runtime),control=ident(c.schemas.control);
  return access.transaction(async session=>{
    await session.lock([{scope:'reference',key:'current-quantity-identities'}]);
    const binding=(await session.query<{database:string;user:string;cluster:string;listen:string;identity:unknown}>(`SELECT current_database() database,session_user AS user,
      ${control}.cluster_identifier() cluster,current_setting('listen_addresses') listen,identity FROM ${control}.environment_identity WHERE singleton`)).rows[0];
    if (!binding||binding.database!==target.database||binding.user!==target.user||binding.cluster!==target.clusterId||binding.listen!==''
      || historyDigest(binding.identity)!==historyDigest(identityRecord(c))) throw new HistoryError('CONNECTED_CURRENT_EXPORT_TARGET_MISMATCH');
    if ((await session.query<{n:string}>(`SELECT count(*)::text n FROM ${runtime}.inventory_current_export_run`)).rows[0]?.n!=='0') throw new HistoryError('CURRENT_EXPORT_BASELINE_ALREADY_BOUND');
    let batch:string[]=[],bytes=2,writes=0;
    const flush=async():Promise<void>=>{
      if (!batch.length) return;
      await session.query(`INSERT INTO ${runtime}.inventory_quantity_identity(kind,target_key,id,generated_in_target,evidence_sha256,body)
        SELECT x.kind,x.target_key,coalesce(x.id,gen_random_uuid()),x.id IS NULL,x.evidence_sha256,x.body
        FROM jsonb_to_recordset($1::jsonb) AS x(kind text,target_key text,id uuid,evidence_sha256 text,body jsonb)`,['['+batch.join(',')+']']);
      writes++;batch=[];bytes=2;
    };
    for (const record of detached) {
      const row=JSON.stringify({kind:record.kind,target_key:record.targetKey,id:record.existingId,evidence_sha256:record.evidenceSha256,body:record.body}),size=Buffer.byteLength(row);
      if (size+2>262144) throw new HistoryError('CURRENT_EXPORT_IDENTITY_PROOF_TOO_LARGE');
      if (bytes+size+(batch.length?1:0)>262144) await flush();bytes+=size+(batch.length?1:0);batch.push(row);
    }
    await flush();return {writes,identities:records.length};
  });
}
export async function readCurrentQuantityIdentities(access:DataAccess,c:DatabaseConfig):Promise<CurrentQuantityIdentityRow[]> {
  return access.read(async session=>(await session.query<CurrentQuantityIdentityRow>(`SELECT kind,target_key,id,generated_in_target,evidence_sha256,body
    FROM ${ident(c.schemas.runtime)}.inventory_quantity_identity ORDER BY kind,target_key`)).rows);
}
