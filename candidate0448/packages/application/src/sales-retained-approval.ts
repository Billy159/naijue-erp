import type { SalesDocument, SalesHeaderRow } from '../../domain/src/documents.ts';
import { DomainError, requireDomain } from '../../domain/src/errors.ts';
import { entityId, version } from '../../domain/src/values.ts';
import type { OperationReceiptRow, SalesAuditRow } from './ports.ts';
import { canonicalRequestValue } from './canonical-request-value.ts';

/** Original-transaction immutable evidence, not client input or a source/import flag. */
export interface SalesRetainedApprovalEvent {
  readonly audit: Omit<SalesAuditRow, 'before'|'after'> & { readonly oldVersion: number; readonly newVersion: number; readonly before: unknown; readonly after: unknown };
  readonly receipt: OperationReceiptRow | null;
}
/** Technical evidence-work bound, never a silently truncated approval chain. */
export const SALES_RETAINED_APPROVAL_MAX_HISTORY = 2000;
export interface SalesRetainedApprovalHistory {
  readonly events: readonly SalesRetainedApprovalEvent[];
  /** Full sealed import snapshot, only from the same-client verified migration reader. */
  readonly migrationOrigin?: SalesDocument;
  /** Original client/receipt/target/version lease; must fail after close or write. */
  assertCurrent(): void;
}
declare const retainedApproval: unique symbol;
export interface RetainedSalesApproval { readonly [retainedApproval]: true }
/** In-process opaque capabilities need exact native-value equality, not a digest.
 * Receipt idempotency SHA256 remains in the backend-only request-hash module. */
const issued = new WeakMap<object, { readonly documentEncoding: string; readonly approved: SalesDocument; readonly owner: object; readonly assertCurrent: () => void }>();
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const own = (row: object,key: string): boolean => Object.prototype.hasOwnProperty.call(row,key);
/** Preserve sub-millisecond precision; SQL UTC formatting need not match original ISO spelling. */
function instant(value: unknown): string | undefined {
  if(typeof value!=='string')return undefined;
  const match=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if(!match)return undefined;const seconds=Date.parse(match[1]!+match[3]!);
  return Number.isFinite(seconds)?`${seconds}:${(match[2]??'').padEnd(9,'0')}`:undefined;
}
function equal(key:string,left:unknown,right:unknown):boolean {
  if((key==='updatedAt'||key==='approvedAt')&&left!==null&&right!==null)return instant(left)!==undefined&&instant(left)===instant(right);
  return left===right;
}
const saveKeys=new Set(['version','note','updatedAt','responsibleStaffId','createdByStaffId']);
const unapproveKeys=new Set(['version','status','updatedAt','approvedByAccountId','approvedByStaffId','approvedAt']);
function values(value:unknown):Record<string,unknown>|undefined {
  if(!record(value)||Object.keys(value).length!==3||!own(value,'header')||!own(value,'lines')||!own(value,'settlements')
    ||!record(value.header)||!Array.isArray(value.lines)||value.lines.length!==0||!Array.isArray(value.settlements)||value.settlements.length!==0)return undefined;
  return value.header;
}
function validHeader(key:string,value:unknown):boolean {
  switch(key){
    case 'version':return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
    case 'status':return value==='APPROVED'||value==='DRAFT';
    case 'note':return value===null||typeof value==='string';
    case 'updatedAt':case 'approvedAt':return value===null||instant(value)!==undefined;
    case 'responsibleStaffId':case 'approvedByStaffId':case 'createdByStaffId':if(value===null)return true;if(typeof value!=='string')return false;try{entityId('staff',value);return true;}catch{return false;}
    case 'approvedByAccountId':if(value===null)return true;if(typeof value!=='string')return false;try{entityId('account',value);return true;}catch{return false;}
    default:return false;
  }
}
function rewindHeader(header:SalesHeaderRow,before:Record<string,unknown>,after:Record<string,unknown>):SalesHeaderRow {
  let old=header;
  for(const key of Object.keys(after)){
    if(!own(before,key)){
      if(key==='createdByStaffId'){const {createdByStaffId:_absent,...rest}=old;old=rest;}
      if(key==='approvedByStaffId'){const {approvedByStaffId:_absent,...rest}=old;old=rest;}
      continue;
    }
    const value=before[key];
    switch(key){
      case 'version':requireDomain(typeof value==='number','INVALID_RETAINED_APPROVAL','Invalid old version');old={...old,version:version(value)};break;
      case 'status':requireDomain(value==='APPROVED'||value==='DRAFT','INVALID_RETAINED_APPROVAL','Invalid old status');old={...old,status:value};break;
      case 'note':case 'updatedAt':case 'approvedAt':requireDomain(value===null||typeof value==='string','INVALID_RETAINED_APPROVAL','Invalid old text');old={...old,[key]:value};break;
      case 'responsibleStaffId':case 'createdByStaffId':case 'approvedByStaffId':requireDomain(value===null||typeof value==='string','INVALID_RETAINED_APPROVAL','Invalid old staff');old={...old,[key]:value===null?null:entityId('staff',value)};break;
      case 'approvedByAccountId':requireDomain(value===null||typeof value==='string','INVALID_RETAINED_APPROVAL','Invalid old actor');old={...old,approvedByAccountId:value===null?null:entityId('account',value)};break;
    }
  }
  return old;
}
export function needsRetainedSalesApproval(document:SalesDocument):boolean {
  return document.lines.some(line=>line.isCurrent&&(line.pricingRule===null||line.zeroConfirmed===null||line.isGift===null||line.allocatedDiscount===null))
    ||document.settlements.some(row=>row.paymentMethodId===null);
}
/** Certify only a real prior APPROVED→UNAPPROVE plus every subsequent unchanged
 * financial version. Sparse evidence is reverse-checked against the locked current
 * header. No MIGRATE-only approval, self-comparison, guessed flags or amount edits. */
export function certifyRetainedSalesApproval(document:SalesDocument,history:SalesRetainedApprovalHistory,owner:object):RetainedSalesApproval|undefined {
  history.assertCurrent();
  if(history.events.length>SALES_RETAINED_APPROVAL_MAX_HISTORY)return undefined;
  const all=structuredClone(history.events);
  const start=all.findLastIndex(e=>e.audit.action==='UNAPPROVE');
  const events=start<0?all:all.slice(start);
  if(document.header.status!=='DRAFT'||document.header.approvedByAccountId!==null||document.header.approvedAt!==null
    ||(document.header.approvedByStaffId!==undefined&&document.header.approvedByStaffId!==null)||events.length===0)return undefined;
  const current:Record<string,unknown>={...document.header},operations=new Set<string>(),audits=new Set<string>(),keys=new Set<string>();
  let expected=document.header.version,restored=document.header;
  for(let i=events.length-1;i>=0;i--){
    const event=events[i]!,a=event.audit,r=event.receipt,first=i===0,action=first?'UNAPPROVE':'SAVE',before=values(a.before),after=values(a.after),allowed=first?unapproveKeys:saveKeys;
    if(!r||a.action!==action||r.action!==action||a.salesId!==document.header.id||r.targetSalesId!==document.header.id||a.operationId!==r.id
      ||a.actorAccountId!==r.actorAccountId||instant(a.occurredAt)===undefined||instant(a.occurredAt)!==instant(r.completedAt)||instant(current.updatedAt)!==instant(a.occurredAt)
      ||r.status!=='COMMITTED'||!r.requestKey||!/^[0-9a-f]{64}$/.test(r.requestHash)||r.result.operationId!==r.id||r.result.salesId!==document.header.id
      ||r.result.status!=='DRAFT'||r.result.version!==expected||!Array.isArray(r.result.ledgerEntryIds)
      ||(!first&&r.result.ledgerEntryIds.length!==0)||a.newVersion!==expected||a.oldVersion!==expected-1||a.oldVersion<1
      ||!before||!after||before.version!==a.oldVersion||after.version!==a.newVersion
      ||operations.has(a.operationId)||audits.has(a.id)||keys.has(JSON.stringify([r.actorAccountId,r.requestKey])))return undefined;
    operations.add(a.operationId);audits.add(a.id);keys.add(JSON.stringify([r.actorAccountId,r.requestKey]));
    const beforeKeys=Object.keys(before),afterKeys=Object.keys(after);
    if([...beforeKeys,...afterKeys].some(key=>!allowed.has(key))||beforeKeys.some(key=>!validHeader(key,before[key]))||afterKeys.some(key=>!validHeader(key,after[key]))
      ||(!first && (own(before,'createdByStaffId') || (own(after,'createdByStaffId') && after.createdByStaffId !== null)))
      ||afterKeys.some(key=>!equal(key,after[key],current[key]))
      ||beforeKeys.some(key=>!own(after,key))||afterKeys.some(key=>!own(before,key)&&!((first&&key==='approvedByStaffId'||!first&&key==='createdByStaffId')&&after[key]===null))
      ||(own(after,'updatedAt')&&instant(after.updatedAt)!==instant(a.occurredAt)))return undefined;
    if(first&&(before.status!=='APPROVED'||after.status!=='DRAFT'))return undefined;
    restored=rewindHeader(restored,before,after);
    for(const key of afterKeys){if(own(before,key))current[key]=before[key];else delete current[key];}
    expected=version(a.oldVersion);
  }
  if(current.status!=='APPROVED')return undefined;
  // Every copied value is either the locked typed native header or a validated
  // old sparse metadata value. Financial rows are never reconstructed or filled.
  const approved:SalesDocument={...structuredClone(document),header:structuredClone(restored)};
  const proof=Object.freeze({}) as RetainedSalesApproval;
  issued.set(proof,{documentEncoding:canonicalRequestValue(document),approved,owner,assertCurrent:history.assertCurrent.bind(history)});return proof;
}
export function retainedSalesApprovalSnapshot(proof:RetainedSalesApproval,document:SalesDocument,owner:object|undefined):SalesDocument {
  const evidence=issued.get(proof);requireDomain(evidence&&evidence.owner===owner&&evidence.documentEncoding===canonicalRequestValue(document),'INVALID_RETAINED_APPROVAL','Retained approval proof must bind this exact locked document');
  evidence.assertCurrent();
  return structuredClone(evidence.approved);
}

/** Reverse-check complete sparse native audit values against the locked rows.
 * Native SAVE retains removed lines as isCurrent=false, so before-only line
 * evidence is never valid. Settlement removals are different and are explicit. */
function rewindSalesHistory(document:SalesDocument,history:SalesRetainedApprovalHistory):{header:Record<string,unknown>;lines:Map<string,Record<string,unknown>>;settlements:Map<string,Record<string,unknown>>} {
  history.assertCurrent();
  const json=(value:unknown):any=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v));
  const fail:()=>never=()=>{throw new DomainError('UNKNOWN_PRICING_FACTS','Historical sparse audit does not match locked current facts');};
  const state=json(document),header:Record<string,unknown>=state.header;
  const lines=new Map<string,Record<string,unknown>>(state.lines.map((l:any)=>{const {salesId:_,...row}=l;return [l.id,row];}));
  const settlements=new Map<string,Record<string,unknown>>(state.settlements.map((r:any)=>[r.id,r]));
  const eq=(a:unknown,b:unknown)=>canonicalRequestValue(a)===canonicalRequestValue(b);
  let expected:number=document.header.version;
  const operations=new Set<string>(),audits=new Set<string>(),keys=new Set<string>();
  if(history.events.length>SALES_RETAINED_APPROVAL_MAX_HISTORY)fail();
  for(let i=history.events.length-1;i>=0;i--){
    const {audit:a,receipt:r}=history.events[i]!;
    if(!r||!['SAVE','APPROVE','UNAPPROVE'].includes(a.action)||a.newVersion!==expected||a.oldVersion!==expected-1||a.oldVersion<1
      ||a.salesId!==document.header.id||r.targetSalesId!==document.header.id||r.id!==a.operationId||r.actorAccountId!==a.actorAccountId||r.action!==a.action
      ||r.status!=='COMMITTED'||!r.requestKey||!/^([0-9a-f]{64})$/.test(r.requestHash)||r.result.operationId!==r.id||r.result.salesId!==document.header.id
      ||r.result.version!==expected||r.result.status!==header.status||!Array.isArray(r.result.ledgerEntryIds)||a.action==='SAVE'&&r.result.ledgerEntryIds.length!==0
      ||instant(a.occurredAt)===undefined||instant(a.occurredAt)!==instant(r.completedAt)||instant(header.updatedAt)!==instant(a.occurredAt)
      ||operations.has(a.operationId)||audits.has(a.id)||keys.has(JSON.stringify([r.actorAccountId,r.requestKey]))
      ||!record(a.before)||!record(a.after)||!record(a.before.header)||!record(a.after.header)||!Array.isArray(a.before.lines)||!Array.isArray(a.after.lines)
      ||!Array.isArray(a.before.settlements)||!Array.isArray(a.after.settlements)||a.before.header.version!==a.oldVersion||a.after.header.version!==a.newVersion)fail();
    operations.add(a.operationId);audits.add(a.id);keys.add(JSON.stringify([r.actorAccountId,r.requestKey]));
    const before=a.before as {header:Record<string,unknown>;lines:unknown[];settlements:unknown[]},after=a.after as typeof before;
    for(const k of Object.keys(after.header))if(!own(header,k)||!equal(k,after.header[k],header[k]))fail();
    for(const k of Object.keys(before.header))if(!own(after.header,k))fail();
    for(const k of Object.keys(after.header)){if(own(before.header,k))header[k]=before.header[k];else delete header[k];}
    const reverseRows=(beforeRows:unknown[],afterRows:unknown[],map:Map<string,Record<string,unknown>>,canRemove:boolean)=>{
      const index=(rows:unknown[])=>{const out=new Map<string,Record<string,unknown>>();for(const row of rows){if(!record(row)||typeof row.id!=='string'||out.has(row.id))fail();out.set(row.id,row);}return out;};
      const b=index(beforeRows),n=index(afterRows);
      for(const [id,row] of n){if(!map.has(id)||!eq(row,map.get(id)))fail();}
      for(const [id,row] of b){if(!n.has(id)&&(!canRemove||map.has(id)))fail();if(n.has(id)&&Object.keys(row).sort().join('|')!==Object.keys(n.get(id)!).sort().join('|'))fail();}
      for(const id of n.keys())map.delete(id);
      for(const [id,row] of b)map.set(id,row);
    };
    reverseRows(before.lines,after.lines,lines,false);reverseRows(before.settlements,after.settlements,settlements,true);
    if(a.action!=='SAVE'&&(before.lines.length||after.lines.length||before.settlements.length||after.settlements.length))fail();
    if(a.action==='UNAPPROVE'&&(before.header.status!=='APPROVED'||after.header.status!=='DRAFT'))fail();
    if(a.action==='APPROVE'&&(before.header.status!=='DRAFT'||after.header.status!=='APPROVED'))fail();
    expected=a.oldVersion;
  }
  if(history.migrationOrigin){
    const original=json(history.migrationOrigin);
    if(expected!==original.header.version||original.header.id!==document.header.id)fail();
    const headerKeys=Object.keys(header).sort();
    if(!eq(headerKeys,Object.keys(original.header).sort()))fail();
    for(const key of headerKeys){
      const a=header[key],b=original.header[key];
      if(['createdAt','updatedAt','approvedAt'].includes(key)&&a!==null&&b!==null){if(instant(a)===undefined||instant(a)!==instant(b))fail();}
      else if(!eq(a,b))fail();
    }
    const originalLines=original.lines.map((l:any)=>{const {salesId:_,...row}=l;return row;});
    const rowsEqual=(actual:Map<string,Record<string,unknown>>,expectedRows:Record<string,unknown>[])=>{
      if(actual.size!==expectedRows.length||new Set(expectedRows.map(r=>r.id)).size!==expectedRows.length)fail();
      for(const row of expectedRows)if(typeof row.id!=='string'||!eq(actual.get(row.id),row))fail();
    };
    rowsEqual(lines,originalLines);rowsEqual(settlements,original.settlements);
  }else if(expected!==1)fail();
  history.assertCurrent();return {header,lines,settlements};
}

const historicalOrigins=new WeakMap<object,{owner:object;assertCurrent:()=>void;encoding:string;signed:boolean;unchangedSettlements:ReadonlySet<string>}>();
export function isHistoricalSignedSale(document:SalesDocument|undefined,stockBasis?:'CUTOFF_HISTORY'|'RUNTIME_LEDGER',owner?:object):boolean {
  if(!document||stockBasis!=='CUTOFF_HISTORY'||document.header.businessType!=='SALE')return false;
  const proof=historicalOrigins.get(document);
  if(proof&&proof.owner===owner){proof.assertCurrent();requireDomain(proof.encoding===canonicalRequestValue(document),'UNKNOWN_PRICING_FACTS','Historical origin must bind the exact locked document');return proof.signed;}
  return document.lines.some(l=>l.isCurrent&&l.quantity<0n);
}
export async function loadHistoricalSaleOrigin(document:SalesDocument,stockBasis:'CUTOFF_HISTORY'|'RUNTIME_LEDGER'|undefined,tx:import('./ports.ts').SalesTransaction):Promise<void>{
  if(stockBasis!=='CUTOFF_HISTORY'||document.header.businessType!=='SALE')return;
  requireDomain(tx.getRetainedSalesApprovalHistory,'UNKNOWN_PRICING_FACTS','Historical original discount requires bound audit history');
  const history=await tx.getRetainedSalesApprovalHistory(document.header.id,document.header.version),origin=rewindSalesHistory(document,history);
  const signed=origin.header.businessType==='SALE'&&[...origin.lines.values()].some(l=>l.isCurrent===true&&typeof l.quantity==='string'&&/^-?[0-9]+$/.test(l.quantity)&&BigInt(l.quantity)<0n);
  if(signed){
    requireDomain(origin.header.orderDiscount===document.header.orderDiscount.toString(),'HISTORICAL_DISCOUNT_CHANGED','Original historical discount must remain exact');
  }
  historicalOrigins.set(document,{owner:tx,assertCurrent:()=>history.assertCurrent(),encoding:canonicalRequestValue(document),signed,unchangedSettlements:new Set(document.settlements.filter(row=>{const old=origin.settlements.get(row.id);return old!==undefined&&canonicalRequestValue({...old,lineNo:row.lineNo})===canonicalRequestValue(JSON.parse(JSON.stringify(row,(_k,v)=>typeof v==='bigint'?v.toString():v)));}).map(row=>row.id))});
}

export function hasUnchangedHistoricalSettlement(document:object,settlementId:string,owner:object|undefined):boolean {
  const proof=historicalOrigins.get(document);
  if(!proof||proof.owner!==owner)return false;
  proof.assertCurrent();requireDomain(proof.encoding===canonicalRequestValue(document),'UNKNOWN_SETTLEMENT_FACTS','Historical settlement provenance must bind exact locked document');
  return proof.unchangedSettlements.has(settlementId);
}

/** Historical NULLs are allowed only when no economic SAVE changed their row.
 * The bound audit/receipt chain is mandatory after native version 1. Neither a
 * source flag nor comparison with the current row proves unchanged provenance. */
export function assertHistoricalUnknownRowsUnchanged(document:SalesDocument,history:SalesRetainedApprovalHistory):void {
  history.assertCurrent();
  const unknown=document.lines.filter(l=>l.isCurrent&&(l.pricingRule===null||l.zeroConfirmed===null||l.isGift===null));
  if(!unknown.length)return;
  rewindSalesHistory(document,history);
  const changed=new Set<string>();
  const economic=['skuId','quantity','referencePrice','dealPrice','pricingRule','discountTenths','zeroConfirmed','lineAmount','isGift'];
  for(const event of history.events){
    if(event.audit.action!=='SAVE')continue;
    const before=event.audit.before as {lines:Record<string,unknown>[]},after=event.audit.after as typeof before;
    for(const row of after.lines){
      const old=before.lines.find(l=>l.id===row.id);
      if(!old||economic.some(k=>!own(old,k)||!own(row,k)||old[k]!==row[k]))changed.add(row.id as string);
    }
  }
  for(const line of unknown){
    const missing=['pricingRule','zeroConfirmed','isGift'].filter(k=>line[k as 'pricingRule'|'zeroConfirmed'|'isGift']===null);
    requireDomain(!changed.has(line.id),'UNKNOWN_PRICING_FACTS',`Line ${line.id}: missing ${missing.join(', ')} after economic edit; save draft and supply actual facts before approval`);
  }
  history.assertCurrent();
}

/** Presentation-only projection. The caller supplies an already authorized,
 * consistent native snapshot and its same-snapshot audit. No write capability is
 * issued and no request flag can grant an exception through this function. */
export function historicalSaleOriginProjection(document:SalesDocument,stockBasis:'CUTOFF_HISTORY'|'RUNTIME_LEDGER',history:SalesRetainedApprovalHistory):import('./sales-query-ports.ts').SalesHistoricalOrigin|undefined {
  if(stockBasis!=='CUTOFF_HISTORY'||document.header.businessType!=='SALE')return undefined;
  const origin=rewindSalesHistory(document,history);
  const signed=origin.header.businessType==='SALE'&&[...origin.lines.values()].some(l=>l.isCurrent===true&&typeof l.quantity==='string'&&/^-?[0-9]+$/.test(l.quantity)&&BigInt(l.quantity)<0n);
  if(!signed)return undefined;
  requireDomain(origin.header.orderDiscount===document.header.orderDiscount.toString(),'HISTORICAL_DISCOUNT_CHANGED','Historical original discount must remain exact');
  return {kind:'SIGNED_SALE',originalOrderDiscount:document.header.orderDiscount};
}
