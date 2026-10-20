import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {lstatSync} from 'node:fs';
import type {DataAccess} from '../../database/access.js';
import type {DataSession} from '../../database/session.js';
import {assertIsolatedTarget,databaseIdentifier as ident,type DatabaseConfig} from '../../database/config.js';
import {identityRecord} from '../../database/identity.js';
import {historyImportTarget,type HistoryImportTarget} from './history-store.js';
import {HistoryError,historyDigest} from './history-plan.js';
import {currentExportByteDigest,currentExportLines,prepareCurrentExport,type CurrentExportInput,type PreparedCurrentExport} from './current-export-plan.js';
import {assertFormalBaselineBusinessReady} from './formal-current-baseline.js';

export interface CurrentExportRun {id:string;manifest_sha256:string;body:Record<string,unknown>;target:HistoryImportTarget}
export interface CurrentExportImportResult {applied:boolean;runId:string;manifestSha256:string;cellCount:number;endpointCount:number;writes:number;chunkCount:number}
function schema(runtime:string):void {
  if (!/^"[a-z][a-z0-9_]{0,62}"$/.test(runtime)) throw new HistoryError('INVALID_HISTORY_SCHEMA');
}
export async function activeCurrentExportRun(session:DataSession,runtime:string):Promise<CurrentExportRun|null> {
  schema(runtime);
  return (await session.query<CurrentExportRun>(`SELECT id,manifest_sha256,body,target FROM ${runtime}.inventory_current_export_run`)).rows[0]??null;
}
export async function assertCurrentExportReadOnly(session:DataSession,runtime:string):Promise<void> {
  if (await activeCurrentExportRun(session,runtime)) throw new HistoryError('NON_FINAL_CURRENT_EXPORT_IS_READ_ONLY');
  await assertFormalBaselineBusinessReady(session,runtime);
}
export type CurrentExportStorage='QA'|'FORMAL';
export function currentExportStorage(runtime:string,storage:CurrentExportStorage='QA'):Record<'run'|'chunk'|'cell'|'projection',string> {
  schema(runtime);if (storage!=='QA'&&storage!=='FORMAL') throw new HistoryError('CURRENT_EXPORT_STORAGE_REQUIRED');
  const prefix=storage==='QA'?'inventory_current_export':'inventory_formal_baseline';
  return {run:runtime+'.'+prefix+'_run',chunk:runtime+'.'+prefix+'_chunk',cell:runtime+'.'+prefix+'_cell',projection:runtime+'.'+prefix+'_projection'};
}
async function targetBinding(session:DataSession,c:DatabaseConfig,target:HistoryImportTarget):Promise<void> {
  const row=(await session.query<{database:string;user:string;identity:unknown;cluster:string;listen:string}>(`SELECT current_database() database,session_user AS user,
    current_setting('listen_addresses') listen,identity,${ident(c.schemas.control)}.cluster_identifier() cluster FROM ${ident(c.schemas.control)}.environment_identity WHERE singleton`)).rows[0];
  if (!row || row.database!==target.database || row.user!==target.user || row.cluster!==target.clusterId || row.listen!==''
    || historyDigest(row.identity)!==historyDigest(identityRecord(c))) throw new HistoryError('CONNECTED_CURRENT_EXPORT_TARGET_MISMATCH');
}
export async function persistPayload(session:DataSession,runtime:string,plan:PreparedCurrentExport,kind:'ENDPOINTS'|'OPENINGS'|'MAPPINGS',storage:CurrentExportStorage='QA'):Promise<number> {
  const tables=currentExportStorage(runtime,storage);
  const path=plan.paths[kind==='ENDPOINTS'?'endpoints':kind==='OPENINGS'?'openings':'mappings'];
  const hash=createHash('sha256');let lines:string[]=[],bytes=0,ordinal=0,totalBytes=0,totalRows=0;
  const flush=async():Promise<void>=>{
    if (!lines.length) return;const payload=lines.join('');
    await session.query(`INSERT INTO ${tables.chunk}(run_id,manifest_sha256,kind,ordinal,row_count,payload_sha256,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ordinal`,[plan.input.runId,plan.manifestSha256,kind,++ordinal,lines.length,currentExportByteDigest(payload),payload]);
    lines=[];bytes=0;
  };
  for await (const {line} of currentExportLines(path)) {
    const size=Buffer.byteLength(line);if (bytes+size>262144) await flush();
    lines.push(line);bytes+=size;hash.update(line);totalRows++;totalBytes+=size;
  }
  await flush();const expected=plan.payloads[kind];
  if (hash.digest('hex')!==expected.sha256||totalRows!==expected.rows||totalBytes!==expected.bytes) throw new HistoryError('CURRENT_EXPORT_SOURCE_CHANGED_DURING_IMPORT');
  return ordinal;
}
export async function persistCells(session:DataSession,runtime:string,plan:PreparedCurrentExport,storage:CurrentExportStorage='QA'):Promise<number> {
  const tables=currentExportStorage(runtime,storage);
  let batch:string[]=[],bytes=2,writes=0;
  const flush=async():Promise<void>=>{
    if (!batch.length) return;
    await session.query(`INSERT INTO ${tables.cell}(run_id,source_key,warehouse_id,sku_id,unit,confirmed_opening,source_net,endpoint_count,proof)
      SELECT $1,x.source_key,x.warehouse_id,x.sku_id,x.unit,x.confirmed_opening,x.source_net,x.endpoint_count,x.proof
      FROM jsonb_to_recordset($2::jsonb) AS x(source_key text,warehouse_id uuid,sku_id uuid,unit text,
        confirmed_opening numeric,source_net numeric,endpoint_count integer,proof jsonb)`,[plan.input.runId,'['+batch.join(',')+']']);
    writes++;batch=[];bytes=2;
  };
  for (const cell of plan.cells) {
    const row=JSON.stringify({source_key:cell.key,warehouse_id:cell.mapping.runtimeWarehouseId,sku_id:cell.mapping.runtimeSkuId,unit:cell.mapping.sourceQuantityKey[2],
      confirmed_opening:cell.opening,source_net:cell.net,endpoint_count:cell.endpointCount,proof:cell.proof}),size=Buffer.byteLength(row);
    if (size+2>262144) throw new HistoryError('CURRENT_EXPORT_CELL_PROOF_TOO_LARGE');
    if (bytes+size+(batch.length?1:0)>262144) await flush();bytes+=size+(batch.length?1:0);batch.push(row);
  }
  await flush();return writes;
}
export async function assertMappingTargets(session:DataSession,runtime:string,plan:PreparedCurrentExport):Promise<void> {
  for (let start=0;start<plan.cells.length;start+=500) {
    const batch=plan.cells.slice(start,start+500).map(({mapping:m})=>({warehouse_key:m.runtimeWarehouseKey,warehouse_id:m.runtimeWarehouseId,
      sku_key:m.runtimeSkuKey,sku_id:m.runtimeSkuId}));
    const row=(await session.query<{missing:number}>(`SELECT count(*)::integer missing FROM jsonb_to_recordset($1::jsonb)
      AS x(warehouse_key text,warehouse_id uuid,sku_key text,sku_id uuid)
      LEFT JOIN ${runtime}.inventory_quantity_identity w ON w.kind='WAREHOUSE' AND w.target_key=x.warehouse_key AND w.id=x.warehouse_id
      LEFT JOIN ${runtime}.inventory_quantity_identity s ON s.kind='SKU' AND s.target_key=x.sku_key AND s.id=x.sku_id
      WHERE w.id IS NULL OR s.id IS NULL`,[JSON.stringify(batch)])).rows[0];
    if (!row||row.missing!==0) throw new HistoryError('CURRENT_EXPORT_ACTUAL_TARGET_IDENTITY_MISSING');
  }
}
export async function verifyStoredRun(session:DataSession,runtime:string,plan:PreparedCurrentExport,storage:CurrentExportStorage='QA'):Promise<void> {
  const tables=currentExportStorage(runtime,storage);
  const stored=(await session.query<{source_key:string;quantity:string;opening:string;net:string}>(`SELECT source_key,(confirmed_opening+source_net)::text quantity,confirmed_opening::text opening,
    source_net::text net FROM ${tables.cell} WHERE run_id=$1 ORDER BY source_key`,[plan.input.runId])).rows;
  const expected=plan.cells.map(c=>({source_key:c.key,opening:c.opening,net:c.net})).sort((a,b)=>a.source_key<b.source_key?-1:a.source_key>b.source_key?1:0);
  const actual=stored.map(({source_key,opening,net})=>({source_key,opening,net})).sort((a,b)=>a.source_key<b.source_key?-1:a.source_key>b.source_key?1:0);
  if (historyDigest(actual)!==historyDigest(expected)) throw new HistoryError('CURRENT_EXPORT_STORED_COMPONENT_MISMATCH');
}
export async function verifyCurrentExportStoredPayloads(session:DataSession,runtime:string,run:CurrentExportRun,storage:CurrentExportStorage='QA'):Promise<void> {
  schema(runtime);
  const tables=currentExportStorage(runtime,storage);
  const expected=run.body['payloads'] as PreparedCurrentExport['payloads'];
  if (!expected) throw new HistoryError('CURRENT_EXPORT_STORAGE_CORRUPT');
  for (const kind of ['ENDPOINTS','OPENINGS','MAPPINGS'] as const) {
    let ordinal=0,bytes=0,rows=0;const hash=createHash('sha256');
    for (;;) {
      const page=(await session.query<{ordinal:number;manifest_sha256:string;row_count:number;payload_sha256:string;payload:string}>(`SELECT ordinal,manifest_sha256,row_count,payload_sha256,payload
        FROM ${tables.chunk} WHERE run_id=$1 AND kind=$2 AND ordinal>$3 ORDER BY ordinal LIMIT 16`,[run.id,kind,ordinal])).rows;
      if (!page.length) break;
      for (const chunk of page) {
        if (chunk.ordinal!==ordinal+1||chunk.manifest_sha256!==run.manifest_sha256||currentExportByteDigest(chunk.payload)!==chunk.payload_sha256
          || chunk.row_count!==chunk.payload.split('\n').length-1||!chunk.payload.endsWith('\n')||Buffer.byteLength(chunk.payload)>262144) throw new HistoryError('CURRENT_EXPORT_STORAGE_CORRUPT');
        ordinal=chunk.ordinal;bytes+=Buffer.byteLength(chunk.payload);rows+=chunk.row_count;hash.update(chunk.payload);
      }
    }
    if (!expected[kind]||bytes!==expected[kind].bytes||rows!==expected[kind].rows||hash.digest('hex')!==expected[kind].sha256) throw new HistoryError('CURRENT_EXPORT_STORAGE_CORRUPT');
  }
}
/** The formal consumer computes source nets and persists immutable bounded records in one guarded transaction. */
export async function importCurrentExportInventory(access:DataAccess,c:DatabaseConfig,target:HistoryImportTarget,root:string,input:CurrentExportInput):Promise<CurrentExportImportResult> {
  assertIsolatedTarget(c);const socket=lstatSync(c.host);
  if (c.environment!=='qa'||!c.database.startsWith('demo_8877_')||!isAbsolute(c.host)||socket.isSymbolicLink()||!socket.isDirectory()
    || socket.mode&0o077||process.getuid&&socket.uid!==process.getuid()) throw new HistoryError('CURRENT_EXPORT_PRIVATE_QA_REQUIRED');
  if (historyDigest(historyImportTarget(c))!==historyDigest(target)||historyDigest(input.target)!==historyDigest(target)) throw new HistoryError('DECLARED_CURRENT_EXPORT_TARGET_MISMATCH');
  const plan=await prepareCurrentExport(root,input),r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  return access.transaction(async session=>{
    await session.lock([{scope:'reference',key:'inventory-opening-snapshot'},{scope:'inventory',key:'posting-ledger'}]);await targetBinding(session,c,target);
    const previous=await activeCurrentExportRun(session,r);
    const result=(applied:boolean,writes:number,chunkCount:number):CurrentExportImportResult=>({applied,runId:input.runId,manifestSha256:plan.manifestSha256,
      cellCount:plan.cells.length,endpointCount:plan.counts.sourceEndpoints,writes,chunkCount});
    if (previous) {
      if (previous.id!==plan.input.runId||previous.manifest_sha256!==plan.manifestSha256||historyDigest(previous.target)!==historyDigest(target)) throw new HistoryError('CURRENT_EXPORT_BASELINE_ALREADY_BOUND');
      await verifyCurrentExportStoredPayloads(session,r,previous);
      await verifyStoredRun(session,r,plan);return result(false,0,0);
    }
    const n=(await session.query<{n:string}>(`SELECT ((SELECT count(*) FROM ${r}.inventory_history_run)+(SELECT count(*) FROM ${r}.inventory_opening_run)
      +(SELECT count(*) FROM ${r}.posting)+(SELECT count(*) FROM ${r}.movement)+(SELECT count(*) FROM ${r}.inventory_delta)
      +(SELECT count(*) FROM ${s}.tplus_inventory_balance_source))::text n`)).rows[0]?.n;
    if (n!=='0') throw new HistoryError('NEW_EMPTY_INVENTORY_TARGET_REQUIRED');
    await assertMappingTargets(session,r,plan);
    await session.query(`INSERT INTO ${r}.inventory_current_export_run(id,manifest_sha256,body,target) VALUES($1,$2,$3::jsonb,$4::jsonb) RETURNING id`,
      [plan.input.runId,plan.manifestSha256,JSON.stringify(plan.body),JSON.stringify(target)]);
    let writes=1,chunkCount=0;
    for (const kind of ['ENDPOINTS','OPENINGS','MAPPINGS'] as const) chunkCount+=await persistPayload(session,r,plan,kind);
    writes+=chunkCount;writes+=await persistCells(session,r,plan);await verifyStoredRun(session,r,plan);
    return result(true,writes,chunkCount);
  });
}
