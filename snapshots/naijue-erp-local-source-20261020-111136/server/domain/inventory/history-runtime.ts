import type {DataSession, ActionLock} from '../../database/session.js';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {AuthorizedContext} from '../../security/service.js';
import {formatScaled, parseScaled} from '../transactions/decimal.js';
import {HistoryError, historyDigest, historyInstant, mappedHistoryLegs, t31LegBodyDigest, validateT31Inputs, type HistoryArtifact, type HistoryEvent, type T31Inputs} from './history-plan.js';
import {activeHistoryRun, verifyHistoryArtifacts, type StoredHistoryRun} from './history-store.js';
import {assertCurrentExportReadOnly} from './current-export-store.js';

export interface HistoryEffect {readonly index:number; readonly warehouse:string; readonly sku:string; readonly quantity:bigint; readonly unit?:string}
interface UnitEffect {warehouseId:string;skuId:string;unit:string;quantity:string}
const cellKey = (l: UnitEffect):string => historyDigest([l.warehouseId,l.skuId,l.unit]);

export async function readHistoryBalance(session: DataSession, runtime: string, warehouse: string, sku: string, unit?:string): Promise<string | null> {
  if (!await activeHistoryRun(session,runtime)) return null;
  const rows = (await session.query<{quantity:string;unit:string}>(`SELECT quantity::text,unit FROM ${runtime}.inventory_history_projection
    WHERE warehouse_id=$1::uuid AND sku_id=$2::uuid AND ($3::text IS NULL OR unit=$3)`,[warehouse,sku,unit ?? null])).rows;
  if (rows.length > 1) throw new HistoryError('EXPLICIT_MEASUREMENT_UNIT_REQUIRED');
  return rows[0]?.quantity ?? '0.0000';
}

/** A covered historical reversal uses the persisted signed T31 legs, not an old snapshot or body guess. */
export async function historyBaselineEffects(session: DataSession, runtime: string, documentId: string,
  revision:number, effectIdentity:string): Promise<HistoryEffect[] | null> {
  const run = await activeHistoryRun(session,runtime); if (!run) return null;
  const e = (await session.query<{body:HistoryEvent;event_id:string}>(`SELECT body,event_id FROM ${runtime}.inventory_history_event WHERE run_id=$1 AND document_id=$2::uuid`,[run.id,documentId])).rows[0];
  if (!e || e.body.documentBinding?.revision !== revision || e.body.documentBinding.effectIdentity !== effectIdentity) throw new HistoryError('UNBOUND_HISTORICAL_REVERSAL');
  const legs = (await session.query<{warehouse:string;sku:string;unit:string;quantity:string}>(`SELECT warehouse_id AS warehouse,sku_id AS sku,unit,quantity::text
    FROM ${runtime}.inventory_history_event_leg WHERE run_id=$1 AND event_id=$2 AND boundary='CUTOFF' ORDER BY contribution_id`,[run.id,e.event_id])).rows;
  if (!legs.length) throw new HistoryError('MISSING_COUNTED_HISTORY_LEGS');
  return legs.map((l,index) => ({index,warehouse:l.warehouse,sku:l.sku,unit:l.unit,quantity:-parseScaled(l.quantity,4,false)}));
}
export async function historyPostingEffects(session:DataSession,runtime:string,postingId:string):Promise<HistoryEffect[]|null> {
  const run=await activeHistoryRun(session,runtime);if(!run)return null;
  const rows=(await session.query<{warehouse:string;sku:string;unit:string;quantity:string}>(`SELECT warehouse_id AS warehouse,sku_id AS sku,unit,quantity::text
    FROM ${runtime}.inventory_history_movement WHERE run_id=$1 AND posting_id=$2::uuid ORDER BY leg_index`,[run.id,postingId])).rows;
  if(!rows.length)throw new HistoryError('ACTIVE_HISTORY_POSTING_LEGS_MISSING');
  return rows.map((l,index)=>({index,warehouse:l.warehouse,sku:l.sku,unit:l.unit,quantity:-parseScaled(l.quantity,4,false)}));
}
export async function assertHistoryDocumentAdmission(session:DataSession,runtime:string,documentId:string,number:string,businessDay:string):Promise<void> {
  await assertCurrentExportReadOnly(session,runtime);
  const run = await activeHistoryRun(session,runtime); if (!run) return;
  const bound = (await session.query<{document_id:string|null}>(`SELECT e.document_id FROM ${runtime}.inventory_history_alias a
    JOIN ${runtime}.inventory_history_event e USING(run_id,event_id) WHERE a.run_id=$1 AND a.source_number=$2`,[run.id,number])).rows[0];
  if (bound && bound.document_id !== documentId) throw new HistoryError('ALREADY_COUNTED_HISTORY_CANNOT_BE_RECREATED');
  const isBound = (await session.query<{known:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${runtime}.inventory_history_event WHERE run_id=$1 AND document_id=$2::uuid) known`,[run.id,documentId])).rows[0]?.known;
  if (!isBound && businessDay < run.body.input.cutoff.at.slice(0,10)) throw new HistoryError('BACKDATED_NEW_DOCUMENT_REQUIRES_SOURCE_CORRECTION');
}

async function resolveUnit(session:DataSession,runtime:string,source:string,effect:HistoryEffect):Promise<string> {
  const known = (await session.query<{unit:string}>(`SELECT DISTINCT unit FROM ${runtime}.inventory_history_cell WHERE sku_id=$1::uuid
    UNION SELECT DISTINCT unit FROM ${runtime}.inventory_history_movement WHERE sku_id=$1::uuid`,[effect.sku])).rows.map(x => x.unit);
  if (effect.unit !== undefined) {
    if (!effect.unit || effect.unit.trim() !== effect.unit || effect.unit.length > 64 || effect.unit.includes('\0')) throw new HistoryError('INVALID_RUNTIME_MEASUREMENT_UNIT');
    if (!known.includes(effect.unit)) {
      const allowed = (await session.query<{known:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${source}.unit WHERE name=$1) known`,[effect.unit])).rows[0]?.known;
      if (!allowed) throw new HistoryError('UNPROVEN_RUNTIME_MEASUREMENT_UNIT');
    }
    return effect.unit;
  }
  if (known.length > 1) throw new HistoryError('EXPLICIT_MEASUREMENT_UNIT_REQUIRED');
  if (known[0]) return known[0];
  const unit = (await session.query<{unit:string|null}>(`SELECT coalesce(pp.body->>'unit',po.body->>'unit',u.name) unit
    FROM (SELECT product_id FROM ${source}.variant WHERE id=$1::uuid UNION SELECT product_id FROM ${runtime}.variant_overlay WHERE id=$1::uuid) v
    LEFT JOIN ${source}.product p ON p.id=v.product_id LEFT JOIN ${source}.unit u ON u.id=p.unit_id
    LEFT JOIN ${runtime}.product_profile_overlay pp ON pp.product_id=v.product_id LEFT JOIN ${runtime}.product_overlay po ON po.id=v.product_id`,[effect.sku])).rows[0]?.unit;
  if (!unit) throw new HistoryError('UNKNOWN_RUNTIME_MEASUREMENT_UNIT'); return unit;
}
async function writeEffects(session:DataSession,runtime:string,run:StoredHistoryRun,identity:string,legs:readonly UnitEffect[],proof:unknown,postingId:string|null):Promise<void> {
  for (let i=0;i<legs.length;i++) {
    const l = legs[i]!;
    const basis=(await session.query<{known:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${runtime}.inventory_history_cell WHERE run_id=$1
      AND warehouse_id=$2::uuid AND sku_id=$3::uuid AND unit=$4) known`,[run.id,l.warehouseId,l.skuId,l.unit])).rows[0]?.known;
    if(!basis){
      const mapped=run.body.input.mappings.some(m=>m.kind==='SKU'&&m.targetId===l.skuId);
      const born=(await session.query<{created_at:Date}>(`SELECT created_at FROM ${runtime}.variant_overlay WHERE id=$1::uuid`,[l.skuId])).rows[0];
      if(mapped || !born || born.created_at.getTime()<=historyInstant(run.body.input.cutoff.at))throw new HistoryError('RUNTIME_KEY_MISSING_PROVEN_OPENING');
    }
    await session.query(`INSERT INTO ${runtime}.inventory_history_movement(run_id,identity,leg_index,warehouse_id,sku_id,unit,quantity,posting_id,proof)
      VALUES($1,$2,$3,$4::uuid,$5::uuid,$6,$7::numeric,$8::uuid,$9::jsonb) RETURNING identity`,
      [run.id,identity,i,l.warehouseId,l.skuId,l.unit,l.quantity,postingId,JSON.stringify(proof)]);
    await session.query(`INSERT INTO ${runtime}.inventory_history_delta(run_id,warehouse_id,sku_id,unit,quantity)
      VALUES($1,$2::uuid,$3::uuid,$4,$5::numeric) ON CONFLICT(run_id,warehouse_id,sku_id,unit)
      DO UPDATE SET quantity=${runtime}.inventory_history_delta.quantity+excluded.quantity RETURNING sku_id`,[run.id,l.warehouseId,l.skuId,l.unit,l.quantity]);
  }
}
/** Called by T17 on its already authorized, locked transaction. The old two-dimensional delta is bypassed. */
export async function recordHistoryPosting(session:DataSession,runtime:string,postingId:string,effects:readonly HistoryEffect[]):Promise<boolean> {
  await assertCurrentExportReadOnly(session,runtime);
  const run = await activeHistoryRun(session,runtime); if (!run) return false;
  const p = (await session.query<{created_at:Date;document_id:string;revision:number;reason:string}>(`SELECT created_at,document_id,revision,reason FROM ${runtime}.posting WHERE id=$1::uuid`,[postingId])).rows[0];
  const t = historyInstant(run.body.input.cutoff.at);
  if (!p || p.created_at.getTime() < t || p.created_at.getTime() === t && run.body.input.cutoff.inclusive) throw new HistoryError('RUNTIME_POSTING_NOT_AFTER_CUTOFF');
  const legs:UnitEffect[] = [];
  const source = '"'+run.target.schemas.source+'"';
  for (const e of effects) legs.push({warehouseId:e.warehouse,skuId:e.sku,unit:await resolveUnit(session,runtime,source,e),quantity:formatScaled(e.quantity,4)});
  await writeEffects(session,runtime,run,'posting:'+postingId,legs,{kind:'T17_AUTHORIZED_POSTING',postingId,documentId:p.document_id,revision:p.revision,reason:p.reason,
    baselineManifestSha256:run.manifest_sha256,cutoff:run.body.input.cutoff},postingId);
  return true;
}

export interface HistoryEventChange {
  readonly eventId:string;readonly requestKey:string;readonly expectedOrdinal:number;
  readonly mode:'NEW_AFTER_CUTOFF'|'AUTHORIZED_CORRECTION';readonly inputs:T31Inputs;
  readonly artifacts:readonly HistoryArtifact[];readonly sourceNumbers:readonly string[];
}
export const historyEventChangeLocks = (c:HistoryEventChange):readonly ActionLock[] => [
  {scope:'idempotency',key:'history-event:'+c.requestKey},{scope:'reference',key:'inventory-opening-snapshot'},{scope:'inventory',key:'posting-ledger'},
];

/** Offline source corrections require T10 administrator authorization; mapped business documents use T17 instead. */
export async function applyHistoryEventChange(context:AuthorizedContext,change:HistoryEventChange,artifactRoot:string):Promise<{applied:boolean;ordinal:number;delta:UnitEffect[]}> {
  if (context.actor.role !== 'ADMIN') throw new HistoryError('SOURCE_HISTORY_CORRECTION_REQUIRES_ADMIN');
  const {session,repo}=context, r=repo.runtime, run=await activeHistoryRun(session,r); if (!run) throw new HistoryError('HISTORY_BASELINE_REQUIRED');
  if (!change.requestKey || change.requestKey.length>200 || change.eventId!==change.inputs.eventId || !Number.isSafeInteger(change.expectedOrdinal) || change.expectedOrdinal<0
    || !['NEW_AFTER_CUTOFF','AUTHORIZED_CORRECTION'].includes(change.mode) || !Array.isArray(change.sourceNumbers) || !change.sourceNumbers.length
    || change.sourceNumbers.some(n=>!n || n.trim()!==n || n.length>512)) throw new HistoryError('INVALID_HISTORY_CHANGE');
  const artifacts=[...run.body.input.artifacts,...change.artifacts];
  verifyHistoryArtifacts(artifactRoot,artifacts); validateT31Inputs(change.inputs,change.inputs.stateDecision.cutoff,artifacts,run.body.input.quantityScale);
  const exchangeArtifacts=change.artifacts.filter(a=>a.role==='T31_EXCHANGE');
  if(exchangeArtifacts.length!==1)throw new HistoryError('HISTORY_CHANGE_T31_EXCHANGE_REQUIRED');
  const exchange=JSON.parse(readFileSync(join(artifactRoot,exchangeArtifacts[0]!.file),'utf8')) as {cutoff:unknown;events:(HistoryEvent&{atBaseline?:T31Inputs})[]};
  const selected=exchange.events?.filter(e=>e.eventId===change.eventId);
  if(!selected || selected.length!==1 || historyDigest(selected[0]!.atCutoff)!==historyDigest(change.inputs)
    || historyDigest(selected[0]!.sourceNumbers)!==historyDigest(change.sourceNumbers) || historyDigest(exchange.cutoff)!==historyDigest(change.inputs.stateDecision.cutoff))throw new HistoryError('HISTORY_CHANGE_NOT_BOUND_TO_T31_EXCHANGE');
  const payload=historyDigest(change), previousRequest=(await session.query<{payload_sha256:string;ordinal:number}>(`SELECT payload_sha256,ordinal FROM ${r}.inventory_history_change WHERE run_id=$1 AND request_key=$2`,[run.id,change.requestKey])).rows[0];
  if(previousRequest){if(previousRequest.payload_sha256!==payload)throw new HistoryError('HISTORY_CHANGE_REQUEST_CONFLICT');return {applied:false,ordinal:previousRequest.ordinal,delta:[]};}
  const original=(await session.query<{body:HistoryEvent;document_id:string|null}>(`SELECT body,document_id FROM ${r}.inventory_history_event WHERE run_id=$1 AND event_id=$2`,[run.id,change.eventId])).rows[0];
  if (original?.document_id || !!original !== (change.mode==='AUTHORIZED_CORRECTION')) throw new HistoryError('WRONG_HISTORY_CORRECTION_ROUTE');
  if(!original){
    const baseline=selected[0]!.atBaseline;
    if(!baseline)throw new HistoryError('NEW_EVENT_BASELINE_STATE_REQUIRED');
    validateT31Inputs(baseline,run.body.input.cutoff,artifacts,run.body.input.quantityScale);
    if(baseline.eventId!==change.eventId || baseline.family!==change.inputs.family)throw new HistoryError('HISTORY_CHANGE_CANONICAL_PACKET_MISMATCH');
    if(baseline.legs.some(l=>parseScaled(l.contributionQuantity,4,false)!==0n))throw new HistoryError('NEW_EVENT_ALREADY_EFFECTIVE_AT_BASELINE');
  }
  const latest=(await session.query<{inputs:T31Inputs;ordinal:number}>(`SELECT inputs,ordinal FROM ${r}.inventory_history_change WHERE run_id=$1 AND event_id=$2 ORDER BY ordinal DESC LIMIT 1`,[run.id,change.eventId])).rows[0];
  if ((latest?.ordinal ?? 0)!==change.expectedOrdinal) throw new HistoryError('HISTORY_CHANGE_VERSION_CONFLICT');
  const boundary=change.inputs.stateDecision.cutoff, at=historyInstant(boundary.at), last=latest?.inputs.stateDecision.cutoff ?? run.body.input.cutoff;
  const now=(await session.query<{now:Date}>('SELECT clock_timestamp() now')).rows[0]!.now.getTime();
  if(at<historyInstant(last.at) || at===historyInstant(last.at) && !(last.inclusive===false && boundary.inclusive===true) || at>now) throw new HistoryError('HISTORY_CHANGE_TIME_NOT_FORWARD');
  const immutableVersion = [...(original?.body.atOpening && original.body.atCutoff ? [original.body.atOpening,original.body.atCutoff] : []),...(await session.query<{inputs:T31Inputs}>(`SELECT inputs FROM ${r}.inventory_history_change WHERE run_id=$1 AND event_id=$2`,[run.id,change.eventId])).rows.map(x=>x.inputs)];
  if(immutableVersion.some(p=>p.family!==change.inputs.family))throw new HistoryError('HISTORY_CHANGE_CANONICAL_PACKET_MISMATCH');
  for(const p of immutableVersion) if(p.stateDecision.selectedVersionId===change.inputs.stateDecision.selectedVersionId){
    const oldLegs=p.legs.length?p.legs:(await session.query<{proof:T31Inputs['legs'][number]}>(`SELECT proof FROM ${r}.inventory_history_event_leg WHERE run_id=$1 AND event_id=$2 AND boundary=$3 ORDER BY contribution_id`,[run.id,change.eventId,p===original?.body.atOpening?'OPENING':'CUTOFF'])).rows.map(x=>x.proof);
    if(t31LegBodyDigest(oldLegs)!==t31LegBodyDigest(change.inputs.legs))throw new HistoryError('IMMUTABLE_HISTORY_VERSION_CHANGED');
  }
  const before:UnitEffect[] = latest ? mappedHistoryLegs(latest.inputs,run.body.input.mappings) : original ? (await session.query<{warehouseId:string;skuId:string;unit:string;quantity:string}>(`SELECT warehouse_id AS "warehouseId",sku_id AS "skuId",unit,quantity::text FROM ${r}.inventory_history_event_leg WHERE run_id=$1 AND event_id=$2 AND boundary='CUTOFF'`,[run.id,change.eventId])).rows : [];
  const after=mappedHistoryLegs(change.inputs,run.body.input.mappings), totals=new Map<string,{leg:UnitEffect;quantity:bigint}>();
  for(const [legs,sign] of [[before,-1n],[after,1n]] as const)for(const l of legs){const k=cellKey(l);totals.set(k,{leg:l,quantity:(totals.get(k)?.quantity??0n)+sign*parseScaled(l.quantity,4,false)});}
  const delta=[...totals.values()].filter(x=>x.quantity!==0n).map(x=>({...x.leg,quantity:formatScaled(x.quantity,4)})), ordinal=change.expectedOrdinal+1;
  if(!original && !latest){await session.query(`INSERT INTO ${r}.inventory_history_event(run_id,event_id,body) VALUES($1,$2,$3::jsonb) RETURNING event_id`,[run.id,change.eventId,JSON.stringify({createdAfterCutoff:true,canonicalInputsSha256:historyDigest(change.inputs)})]);}
  for(const n of new Set(change.sourceNumbers)){
    const owner=(await session.query<{event_id:string}>(`SELECT event_id FROM ${r}.inventory_history_alias WHERE run_id=$1 AND source_number=$2`,[run.id,n])).rows[0];
    if(owner && owner.event_id!==change.eventId)throw new HistoryError('HISTORY_SOURCE_ALIAS_ALREADY_COUNTED');
    if(!owner)await session.query(`INSERT INTO ${r}.inventory_history_alias(run_id,source_number,event_id) VALUES($1,$2,$3) RETURNING event_id`,[run.id,n,change.eventId]);
  }
  await session.query(`INSERT INTO ${r}.inventory_history_change(run_id,event_id,ordinal,request_key,payload_sha256,actor_id,inputs) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING ordinal`,
    [run.id,change.eventId,ordinal,change.requestKey,payload,context.actor.id,JSON.stringify(change.inputs)]);
  await writeEffects(session,r,run,'change:'+change.requestKey,delta,{kind:change.mode,eventId:change.eventId,ordinal,actorId:context.actor.id,
    baselineManifestSha256:run.manifest_sha256,stateDecision:change.inputs.stateDecision},null);
  return {applied:true,ordinal,delta};
}
