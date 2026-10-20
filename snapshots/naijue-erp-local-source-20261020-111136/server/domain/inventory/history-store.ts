import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {isAbsolute, join, relative, resolve} from 'node:path';
import type {DataAccess} from '../../database/access.js';
import {assertIsolatedTarget, databaseIdentifier as ident, type DatabaseConfig} from '../../database/config.js';
import {identityRecord} from '../../database/identity.js';
import type {DataSession} from '../../database/session.js';
import {formatScaled, parseScaled} from '../transactions/decimal.js';
import {calculateHistoryPlan, HistoryError, historyDigest, mappedHistoryLegs, type HistoryArtifact, type HistoryPlanInput, type CalculatedHistoryPlan} from './history-plan.js';
import {prepareHistoryMappings, persistHistoryMappings, readHistoryMappings, type HistoryMappingStorage} from './history-mapping-storage.js';

export interface HistoryImportTarget {
  readonly database: string; readonly environment: string; readonly instanceId: string; readonly clusterId: string;
  readonly host: string; readonly port: number; readonly user: string; readonly schemas: DatabaseConfig['schemas'];
}
export const historyImportTarget = (c: DatabaseConfig): HistoryImportTarget => ({database:c.database,environment:c.environment,
  instanceId:c.instanceId,clusterId:c.clusterId,host:c.host,port:c.port,user:c.user,schemas:{...c.schemas}});
type StoredHistoryInput = Pick<HistoryPlanInput,'cutoff'|'openingBoundary'|'artifacts'|'mappings'|'quantityScale'>;
export interface StoredHistoryRun {id: string; manifest_sha256: string; body: {input: StoredHistoryInput; mappingStorage?:HistoryMappingStorage}; target: HistoryImportTarget}
interface PersistedHistoryRun extends Omit<StoredHistoryRun,'body'> {
  body:{input:Omit<StoredHistoryInput,'mappings'> & {mappings?:HistoryPlanInput['mappings']}; mappingStorage?:HistoryMappingStorage};
}
export async function activeHistoryRun(session: DataSession, runtime: string): Promise<StoredHistoryRun | null> {
  if (!/^"[a-z][a-z0-9_]{0,62}"$/.test(runtime)) throw new HistoryError('INVALID_HISTORY_SCHEMA');
  const run=(await session.query<PersistedHistoryRun>(`SELECT id,manifest_sha256,body,target FROM ${runtime}.inventory_history_run`)).rows[0];
  if (!run) return null;
  if (!run.body?.input) throw new HistoryError('HISTORY_MAPPING_STORAGE_CORRUPT');
  if (!Object.hasOwn(run.body,'mappingStorage')) {
    if (!Array.isArray(run.body.input.mappings)) throw new HistoryError('HISTORY_MAPPING_STORAGE_CORRUPT');
    return run as StoredHistoryRun; // Accepted pre-chunk manifests remain readable without a rewrite.
  }
  if (Object.hasOwn(run.body.input,'mappings')) throw new HistoryError('HISTORY_MAPPING_STORAGE_CORRUPT');
  const mappings=await readHistoryMappings(session,runtime,run.id,run.manifest_sha256,run.body.mappingStorage);
  return {...run,body:{...run.body,input:{...run.body.input,mappings}}};
}

/** Explicit source directory only; hashes are read before opening any database action. */
export function verifyHistoryArtifacts(root: string, artifacts: readonly HistoryArtifact[]): void {
  if (!isAbsolute(root) || realpathSync(root) !== resolve(root) || !lstatSync(root).isDirectory()) throw new HistoryError('EXPLICIT_ARTIFACT_ROOT_REQUIRED');
  for (const artifact of artifacts) {
    const path = resolve(root,artifact.file);
    if (relative(root,path).startsWith('..') || path === root || realpathSync(path) !== path || !lstatSync(path).isFile()
      || /(?:^|\/)(?:\.env(?:\.|$)|[^/]*(?:password|secret|credential|passfile)[^/]*$)/i.test(artifact.file)) throw new HistoryError('ARTIFACT_PATH_REJECTED',artifact.file);
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (actual !== artifact.sha256) throw new HistoryError('ORIGINAL_ARTIFACT_HASH_CHANGED',artifact.file);
  }
}
function verifyDataArtifacts(root: string, input: HistoryPlanInput): void {
  const documents = new Map<string,unknown>();
  const read = (file:string):unknown => {
    if (!documents.has(file)) documents.set(file,JSON.parse(readFileSync(join(root,file),'utf8')) as unknown);
    return documents.get(file);
  };
  const targetRows = new Map<string,Map<string|number,Record<string,unknown>|null>>();
  const reportedKeys = new Map<string,Set<string>>();
  // Exchanges bind the selected data. A derived audit is not an original-opening exchange.
  for (const [role,expected] of [
    ['T31_EXCHANGE',{schemaVersion:'T33-T31-SELECTED-v1',openingBoundary:input.openingBoundary,cutoff:input.cutoff,events:input.events}],
    ['MAPPING_EXCHANGE',{mappings:input.mappings}],
    ['COVERAGE_EXCHANGE',input.coverage],
  ] as const) {
    const matches = input.artifacts.filter(a => a.role === role);
    if (matches.length !== 1 || historyDigest(JSON.parse(readFileSync(join(root,matches[0]!.file),'utf8'))) !== historyDigest(expected)) {
      throw new HistoryError('EXCHANGE_DATA_NOT_BOUND_TO_ARTIFACT',role);
    }
  }
  const derived = input.originalOpenings.some(o => o.kind === 'DERIVED_FROM_TARGET_INVENTORY');
  const exchanges = input.artifacts.filter(a => a.role === 'OPENING_EXCHANGE');
  if (!derived || exchanges.length) {
    if (exchanges.length !== 1 || historyDigest(JSON.parse(readFileSync(join(root,exchanges[0]!.file),'utf8')))
      !== historyDigest({openingBoundary:input.openingBoundary,originalOpenings:input.originalOpenings})) throw new HistoryError('EXCHANGE_DATA_NOT_BOUND_TO_ARTIFACT','OPENING_EXCHANGE');
  }
  if (derived) for (const opening of input.originalOpenings) {
    if (opening.kind !== 'DERIVED_FROM_TARGET_INVENTORY') throw new HistoryError('MIXED_OR_UNAUTHORIZED_OPENING_METHOD');
    for (const ref of opening.evidence) {
      const body = read(ref.file);
      const rows = Array.isArray(body) ? body : (body as {audits?:unknown[]})?.audits;
      const actual = typeof ref.row === 'number' ? rows ? rows[ref.row-1] : ref.row === 1 ? body : undefined : undefined;
      if (actual === undefined || historyDigest(actual) !== historyDigest(opening.derivedAudit)) throw new HistoryError('DERIVED_AUDIT_NOT_BOUND_TO_ARTIFACT',ref);
    }
    if (opening.derivedAudit.targetCoverage === 'RULE_PROVEN_ZERO') {
      for (const ref of opening.derivedAudit.zeroTargetRuleEvidence!) {
        if (ref.row !== 1 || historyDigest(read(ref.file)) !== historyDigest(opening.derivedAudit.zeroTargetRule)) throw new HistoryError('ZERO_TARGET_RULE_NOT_BOUND_TO_ARTIFACT',ref);
      }
      for (const ref of opening.derivedAudit.targetRowReferences) if (ref.file.endsWith('.json')) {
        const document = read(ref.file) as {rows?:Record<string,unknown>[]};
        if (!Array.isArray(document?.rows)) throw new HistoryError('ZERO_TARGET_IS_NOT_OMITTED',ref);
        if (!reportedKeys.has(ref.file)) reportedKeys.set(ref.file,new Set(document.rows.map(row => JSON.stringify([row['warehouseId'],row['originalSkuId'],row['measurementUnit']]))));
        if (reportedKeys.get(ref.file)!.has(JSON.stringify([opening.warehouseId,opening.originalSkuId,opening.measurementUnit]))) throw new HistoryError('ZERO_TARGET_IS_NOT_OMITTED',ref);
      }
    }
    // Normalized JSON targets can also be checked directly. Opaque original reports stay
    // hash/row-bound and require their upstream extraction and independent final review.
    if (['EXPLICIT_REPORTED_CELL','ONE_EXPLICIT_SYNTHETIC_CELL'].includes(opening.derivedAudit.targetCoverage)) for (const ref of opening.derivedAudit.targetRowReferences) {
      if (!ref.file.endsWith('.json')) continue;
      const document = read(ref.file) as {rows?:Record<string,unknown>[];cutoff?:unknown};
      if (!targetRows.has(ref.file)) {
        const index = new Map<string|number,Record<string,unknown>|null>();
        if (Array.isArray(document?.rows)) for (const [position,row] of document.rows.entries()) {
          const key = row['row'] ?? position+1;
          if (typeof key === 'string' || typeof key === 'number') index.set(key,index.has(key) ? null : row);
        }
        targetRows.set(ref.file,index);
      }
      const actual = targetRows.get(ref.file)!.get(ref.row);
      if (!actual || actual['warehouseId'] !== opening.warehouseId || actual['originalSkuId'] !== opening.originalSkuId
        || actual['measurementUnit'] !== opening.measurementUnit || typeof actual['targetQuantity'] !== 'string'
        || parseScaled(actual['targetQuantity'],4,false) !== parseScaled(opening.derivedAudit.targetQuantity,4,false)
        || document && 'cutoff' in document && historyDigest(document.cutoff) !== historyDigest(input.cutoff)) throw new HistoryError('TARGET_ROW_NOT_BOUND_TO_DERIVATION',ref);
    }
  }
}
export function verifyHistoryInputArtifacts(root:string,input:HistoryPlanInput):void {
  verifyHistoryArtifacts(root,input.artifacts);verifyDataArtifacts(root,input);
}

async function bindTarget(session: DataSession, config: DatabaseConfig, target: HistoryImportTarget): Promise<void> {
  const row = (await session.query<{database:string;user:string;identity:unknown;cluster:string;listen:string}>(`SELECT current_database() database,session_user AS user,
    current_setting('listen_addresses') listen,identity,${ident(config.schemas.control)}.cluster_identifier() cluster FROM ${ident(config.schemas.control)}.environment_identity WHERE singleton`)).rows[0];
  if (!row || row.database !== target.database || row.user !== target.user || row.cluster !== target.clusterId
    || row.listen !== '' || historyDigest(row.identity) !== historyDigest(identityRecord(config))) throw new HistoryError('CONNECTED_HISTORY_TARGET_MISMATCH');
}
async function assertFresh(session: DataSession, source: string, runtime: string): Promise<void> {
  const n = (await session.query<{n:string}>(`SELECT ((SELECT count(*) FROM ${runtime}.inventory_opening_run)
    +(SELECT count(*) FROM ${runtime}.inventory_current_export_run)
    +(SELECT count(*) FROM ${runtime}.posting)+(SELECT count(*) FROM ${runtime}.movement)+(SELECT count(*) FROM ${runtime}.inventory_delta)
    +(SELECT count(*) FROM ${source}.tplus_inventory_balance_source))::text n`)).rows[0]?.n;
  if (n !== '0') throw new HistoryError('NEW_EMPTY_INVENTORY_TARGET_REQUIRED');
}
function contributionDigest(legs: readonly {warehouseId:string;skuId:string;unit:string;quantity:string}[]):string {
  const totals=new Map<string,bigint>();
  for(const l of legs){const key=JSON.stringify([l.warehouseId,l.skuId,l.unit]);totals.set(key,(totals.get(key)??0n)+parseScaled(l.quantity,4,false));}
  return historyDigest([...totals].filter(([,q])=>q!==0n).map(([key,q])=>[key,formatScaled(q,4)]).sort(([a],[b])=>a!.localeCompare(b!)));
}
function importedDocumentContribution(body:unknown,family:string):{warehouseId:string;skuId:string;unit:string;quantity:string}[] {
  const value=body as {lines?:Record<string,unknown>[]},result:{warehouseId:string;skuId:string;unit:string;quantity:string}[]=[];
  if(!value || !Array.isArray(value.lines) || !['SALE','TRANSFER'].includes(family))throw new HistoryError('RUNTIME_DOCUMENT_CONTRIBUTION_BINDING_MISMATCH');
  for(const line of value.lines){
    const unit=line['measurement_unit']??line['unit'],skuId=line['sku_id'];
    if(typeof unit!=='string' || !unit || typeof skuId!=='string' || line['measurement_unit']!==undefined && line['unit']!==undefined && line['measurement_unit']!==line['unit'])throw new HistoryError('RUNTIME_DOCUMENT_CONTRIBUTION_BINDING_MISMATCH');
    const add=(warehouse:unknown,q:bigint):void=>{if(typeof warehouse!=='string')throw new HistoryError('RUNTIME_DOCUMENT_CONTRIBUTION_BINDING_MISMATCH');result.push({warehouseId:warehouse,skuId,unit,quantity:formatScaled(q,4)});};
    const raw=family==='SALE'?line['stock_quantity_contribution']:line['source_quantity'];
    if(typeof raw!=='string')throw new HistoryError('RUNTIME_DOCUMENT_CONTRIBUTION_BINDING_MISMATCH');
    const quantity=parseScaled(raw,4,false);
    if(family==='SALE')add(line['warehouse_id'],quantity);else{add(line['from_warehouse_id'],-quantity);add(line['to_warehouse_id'],quantity);}
  }
  return result;
}
async function checkIdentities(session: DataSession, source: string, runtime: string, plan: CalculatedHistoryPlan): Promise<void> {
  for (const cell of plan.cells) {
    const known = (await session.query<{warehouse:boolean;sku:boolean}>(`SELECT
      EXISTS(SELECT 1 FROM ${source}.warehouse WHERE id=$1::uuid UNION SELECT 1 FROM ${runtime}.master_reference_overlay WHERE kind='warehouses' AND id=$1::uuid) warehouse,
      EXISTS(SELECT 1 FROM ${source}.variant WHERE id=$2::uuid UNION SELECT 1 FROM ${runtime}.variant_overlay WHERE id=$2::uuid) sku`,[cell.targetWarehouseId,cell.targetSkuId])).rows[0];
    if (!known?.warehouse || !known.sku) throw new HistoryError('TARGET_ORIGINAL_IDENTITY_MISSING',cell);
    if (cell.warehouseId !== cell.targetWarehouseId) {
      const sourceCode=(await session.query<{code:string}>(`SELECT code FROM ${source}.warehouse WHERE id=$1::uuid`,[cell.targetWarehouseId])).rows[0]?.code;
      if (sourceCode !== cell.warehouseId) throw new HistoryError('ORIGINAL_WAREHOUSE_NAMESPACE_MISMATCH',cell);
    }
  }
  for (const e of plan.events) if (e.documentBinding) {
    const b = e.documentBinding;
    const effective=e.atCutoff.stateDecision.stateAtCutoff==='EFFECTIVE';
    const d = (await session.query<{document_type:string;number:string;body:unknown;original_imported:boolean;current_effect_active:boolean;active_effect_revision:number|null;active_effect_identity:string|null}>(`SELECT d.document_type,d.number,d.current_effect_active,d.active_effect_revision,d.active_effect_identity,r.body,r.original_imported
      FROM ${runtime}.document d JOIN ${runtime}.revision r ON r.document_id=d.id AND r.revision=$2
      WHERE d.id=$1::uuid`,[b.documentId,b.revision])).rows[0];
    if (!d || !d.original_imported || historyDigest(d.body) !== b.bodySha256
      || d.current_effect_active!==effective || d.active_effect_revision !== (effective?b.revision:null) || d.active_effect_identity !== b.effectIdentity
      || d.document_type!==e.atCutoff.family || !e.sourceNumbers.includes(d.number)
      || contributionDigest(importedDocumentContribution(d.body,d.document_type))!==contributionDigest(mappedHistoryLegs({...e.atCutoff,
        legs:e.atCutoff.legs.map(l=>({...l,contributionQuantity:l.candidateQuantity}))},plan.manifest.input.mappings))) throw new HistoryError('RUNTIME_DOCUMENT_CONTRIBUTION_BINDING_MISMATCH',e.eventId);
  }
}
export interface HistoryImportResult {readonly applied:boolean; readonly revision:string; readonly manifestSha256:string; readonly cellCount:number; readonly eventCount:number; readonly writes:number}

/** One T09 transaction. There is no production activation, default connection, or HTTP import route. */
export async function importHistoryInventory(access: DataAccess, config: DatabaseConfig, target: HistoryImportTarget,
  artifactRoot: string, input: HistoryPlanInput): Promise<HistoryImportResult> {
  assertIsolatedTarget(config);
  if (!isAbsolute(config.host)) throw new HistoryError('T33_PRIVATE_LOCAL_SOCKET_REQUIRED');
  const socket=lstatSync(config.host);
  if(!socket.isDirectory() || socket.isSymbolicLink() || socket.mode & 0o077 || process.getuid && socket.uid!==process.getuid())throw new HistoryError('T33_PRIVATE_LOCAL_SOCKET_REQUIRED');
  if (historyDigest(historyImportTarget(config)) !== historyDigest(target)) throw new HistoryError('DECLARED_HISTORY_TARGET_MISMATCH');
  const plan = calculateHistoryPlan(structuredClone(input));
  verifyHistoryInputArtifacts(artifactRoot,plan.manifest.input);
  const preparedMappings=prepareHistoryMappings(plan.manifest.input.mappings);
  const source = ident(config.schemas.source), runtime = ident(config.schemas.runtime);
  return access.transaction(async session => {
    await session.lock([{scope:'reference',key:'inventory-opening-snapshot'},{scope:'inventory',key:'posting-ledger'}]);
    await bindTarget(session,config,target);
    const prior = await activeHistoryRun(session,runtime);
    const result = (applied:boolean,writes:number):HistoryImportResult => ({applied,revision:input.revision,manifestSha256:plan.manifestSha256,
      cellCount:plan.cells.length,eventCount:plan.events.length,writes});
    if (prior) {
      if (prior.id !== input.revision || prior.manifest_sha256 !== plan.manifestSha256 || historyDigest(prior.target) !== historyDigest(target)) throw new HistoryError('HISTORY_BASELINE_ALREADY_BOUND');
      return result(false,0);
    }
    await assertFresh(session,source,runtime); await checkIdentities(session,source,runtime,plan);
    // Contributions and complete identity evidence use bounded rows, keeping the run header small.
    const {events: ignoredEvents,originalOpenings:ignoredOpenings,mappings:ignoredMappings,coverage,...header} = plan.manifest.input;
    const stored = {schemaVersion:plan.manifest.schemaVersion,inputSha256:plan.manifest.inputSha256,cellsSha256:plan.manifest.cellsSha256,
      eventsSha256:plan.manifest.eventsSha256,quantitySource:plan.manifest.quantitySource,inventoryReportIsQuantityInput:plan.manifest.inventoryReportIsQuantityInput,
      ...(plan.manifest.quantityMethod ? {quantityMethod:plan.manifest.quantityMethod} : {}),
      input:{...header,coverage:{complete:coverage.complete,evidence:coverage.evidence}},mappingStorage:preparedMappings.descriptor,
      cellCount:plan.cells.length,eventCount:plan.events.length};
    let writes = 0;
    await session.query(`INSERT INTO ${runtime}.inventory_history_run(id,manifest_sha256,body,target) VALUES($1,$2,$3::jsonb,$4::jsonb) RETURNING id`,
      [input.revision,plan.manifestSha256,JSON.stringify(stored),JSON.stringify(target)]); writes++;
    writes+=await persistHistoryMappings(session,runtime,input.revision,plan.manifestSha256,preparedMappings);
    for (const c of plan.cells) {
      const {eventReferences,...cell} = c;
      await session.query(`INSERT INTO ${runtime}.inventory_history_cell(run_id,warehouse_id,sku_id,unit,quantity,proof)
        VALUES($1,$2::uuid,$3::uuid,$4,$5::numeric,$6::jsonb) RETURNING sku_id`,[input.revision,c.targetWarehouseId,c.targetSkuId,c.measurementUnit,c.quantity,
        JSON.stringify({...cell,eventReferencesSha256:historyDigest(eventReferences),eventReferenceCount:eventReferences.length})]); writes++;
    }
    for (const e of plan.events) {
      const metadata = {...e,atOpening:{...e.atOpening,legs:[]},atCutoff:{...e.atCutoff,legs:[]}};
      await session.query(`INSERT INTO ${runtime}.inventory_history_event(run_id,event_id,document_id,body) VALUES($1,$2,$3::uuid,$4::jsonb) RETURNING event_id`,
        [input.revision,e.eventId,e.documentBinding?.documentId ?? null,JSON.stringify(metadata)]); writes++;
      for (const [boundary,p] of [['OPENING',e.atOpening],['CUTOFF',e.atCutoff]] as const) {
        const legs = mappedHistoryLegs(p,input.mappings);
        for (let i=0;i<legs.length;i++) {
          const l = legs[i]!, original = p.legs[i]!;
          await session.query(`INSERT INTO ${runtime}.inventory_history_event_leg(run_id,event_id,boundary,contribution_id,warehouse_id,sku_id,unit,quantity,proof)
            VALUES($1,$2,$3,$4,$5::uuid,$6::uuid,$7,$8::numeric,$9::jsonb) RETURNING contribution_id`,
            [input.revision,e.eventId,boundary,original.contributionId,l.warehouseId,l.skuId,l.unit,l.quantity,JSON.stringify(original)]); writes++;
        }
      }
      for (const alias of new Set(e.sourceNumbers)) {
        await session.query(`INSERT INTO ${runtime}.inventory_history_alias(run_id,source_number,event_id) VALUES($1,$2,$3) RETURNING source_number`,[input.revision,alias,e.eventId]); writes++;
      }
    }
    const actual = (await session.query<{warehouse_id:string;sku_id:string;unit:string;quantity:string}>(`SELECT warehouse_id,sku_id,unit,quantity::text FROM ${runtime}.inventory_history_projection ORDER BY warehouse_id,sku_id,unit`)).rows;
    const expected = plan.cells.map(c => ({warehouse_id:c.targetWarehouseId,sku_id:c.targetSkuId,unit:c.measurementUnit,quantity:formatScaled(parseScaled(c.quantity,4,false),4)}))
      .sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    actual.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (historyDigest(actual) !== historyDigest(expected)) throw new HistoryError('IMPORTED_HISTORY_PROJECTION_MISMATCH');
    return result(true,writes);
  });
}
