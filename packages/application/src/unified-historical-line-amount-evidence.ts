import {createHash} from 'node:crypto';
import {decodeUtf8, parseStrictJson, validateMoneyString, validateQuantityString} from './unified-import-contract.ts';
import {isRetainedHistoricalSalesDocument} from './unified-import-historical-sales.ts';

type Ref = {readonly file_sha256:string; readonly sheet:string|null; readonly row:number};
type Row = {readonly source_key:string; readonly source_refs:readonly Ref[]; readonly fields:Record<string,unknown>};
export interface HistoricalLineAmountFact {
 readonly sales_source_key:string; readonly sales_id:string; readonly sales_source_refs:readonly Ref[];
 readonly line_source_key:string; readonly line_id:string; readonly source_refs:readonly Ref[];
 readonly quantity:string; readonly deal_price:string; readonly line_amount:string;
}
/** Separately reviewed source transcription, never a flag carried by a sales command.
 * The trusted SHA must come from outside the package. A matching digest binds the
 * reviewed bytes; it does not by itself establish the business truth of a source. */
export interface HistoricalLineAmountEvidence {
 readonly format_version:'HISTORICAL_LINE_AMOUNT_EVIDENCE_V1';
 readonly source_namespace:string; readonly evidence_sha256:string;
 readonly lines:readonly HistoricalLineAmountFact[];
}
export interface HistoricalLineAmountDifference {
 readonly sales_source_key:string; readonly sales_id:string; readonly line_source_key:string; readonly line_id:string;
 readonly quantity:string; readonly deal_price:string; readonly line_amount:string;
 readonly calculated_line_amount:string; readonly difference:string;
 readonly source_refs:readonly Ref[]; readonly evidence_sha256:string; readonly attestation_sha256:string;
 readonly disposition:'PRESERVED_SOURCE_DIFFERENCE'; readonly execution_boundary:'OFFLINE_ARCHIVE_ONLY';
}
const verified=new WeakMap<object,{sha256:string;utf8:string;rows:ReadonlyMap<string,HistoricalLineAmountFact>}>();
const hash=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const text=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=65536&&!/[\u0000-\u001f\u007f]/.test(x);
const closed=(x:unknown,keys:string[]):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join('|')===keys.sort().join('|');
const refsKey=(refs:readonly Ref[])=>JSON.stringify(refs.map(r=>[r.file_sha256,r.sheet,r.row]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
const cents=(s:string)=>BigInt(s.replace('.',''));
const decimal=(n:bigint)=>`${n<0n?'-':''}${(n<0n?-n:n)/100n}.${((n<0n?-n:n)%100n).toString().padStart(2,'0')}`;
function refs(value:unknown,sourceHashes:ReadonlySet<string>):value is readonly Ref[]{
 if(!Array.isArray(value)||value.length===0||value.length>100)return false;
 const seen=new Set<string>();
 return value.every(r=>{if(!closed(r,['file_sha256','sheet','row'])||!hash(r.file_sha256)||!sourceHashes.has(r.file_sha256)||(r.sheet!==null&&!text(r.sheet))||!Number.isSafeInteger(r.row)||Number(r.row)<1||Number(r.row)>2147483647)return false;const k=JSON.stringify([r.file_sha256,r.sheet,r.row]);if(seen.has(k))return false;seen.add(k);return true;});
}
export function readHistoricalLineAmountEvidence(input:{bytes:Uint8Array;trustedSha256:string;sourceNamespace:string;sourceHashes:ReadonlySet<string>}):HistoricalLineAmountEvidence {
 if(input.bytes.byteLength<1||input.bytes.byteLength>4*1024*1024)throw Error('HISTORICAL_LINE_AMOUNT_EVIDENCE_SIZE');
 if(!hash(input.trustedSha256)||createHash('sha256').update(input.bytes).digest('hex')!==input.trustedSha256)throw Error('HISTORICAL_LINE_AMOUNT_EVIDENCE_HASH');
 const v=parseStrictJson(decodeUtf8(input.bytes));
 if(!closed(v,['format_version','source_namespace','evidence_sha256','lines'])||v.format_version!=='HISTORICAL_LINE_AMOUNT_EVIDENCE_V1'||!text(v.source_namespace)||v.source_namespace!==input.sourceNamespace||!hash(v.evidence_sha256)||!input.sourceHashes.has(v.evidence_sha256))throw Error('HISTORICAL_LINE_AMOUNT_EVIDENCE_SOURCE');
 if(!Array.isArray(v.lines)||v.lines.length===0||v.lines.length>10000)throw Error('HISTORICAL_LINE_AMOUNT_EVIDENCE_LINES');
 const rows=new Map<string,HistoricalLineAmountFact>(),keys=new Set<string>(),occurrences=new Set<string>();
 for(const row of v.lines){
  if(!closed(row,['sales_source_key','sales_id','sales_source_refs','line_source_key','line_id','source_refs','quantity','deal_price','line_amount'])||!text(row.sales_source_key)||!uuid(row.sales_id)||!text(row.line_source_key)||!uuid(row.line_id)||!refs(row.sales_source_refs,input.sourceHashes)||!refs(row.source_refs,input.sourceHashes)||!validateQuantityString(row.quantity)||row.quantity==='0'||!validateMoneyString(row.deal_price)||row.deal_price.startsWith('-')||!validateMoneyString(row.line_amount)||cents(row.line_amount)===BigInt(row.quantity)*cents(row.deal_price))throw Error('HISTORICAL_LINE_AMOUNT_EVIDENCE_LINE');
  const occurrence=refsKey(row.source_refs);
  if(rows.has(row.line_id)||keys.has(row.line_source_key)||occurrences.has(occurrence))throw Error('HISTORICAL_LINE_AMOUNT_EVIDENCE_DUPLICATE');
  keys.add(row.line_source_key);occurrences.add(occurrence);
  for(const r of [...row.source_refs,...row.sales_source_refs])Object.freeze(r);Object.freeze(row.source_refs);Object.freeze(row.sales_source_refs);Object.freeze(row);
  rows.set(row.line_id,row as unknown as HistoricalLineAmountFact);
 }
 Object.freeze(v.lines);Object.freeze(v);verified.set(v,{sha256:input.trustedSha256,utf8:decodeUtf8(input.bytes),rows});return v as unknown as HistoricalLineAmountEvidence;
}
export function historicalLineAmountEvidenceMatchesSource(evidence:unknown,namespace:string,sourceHashes:ReadonlySet<string>):boolean {
 if(!evidence||typeof evidence!=='object'||!verified.has(evidence))return false;
 const e=evidence as HistoricalLineAmountEvidence;
 return e.source_namespace===namespace&&sourceHashes.has(e.evidence_sha256)&&e.lines.every(l=>[...l.source_refs,...l.sales_source_refs].every(r=>sourceHashes.has(r.file_sha256)));
}
/** Read projection preserves all three original strings. It is neither a SAVE
 * proposal nor an approval/posting capability; computed values are diagnostics. */
export function historicalLineAmountDifference(evidence:HistoricalLineAmountEvidence|undefined,input:{namespace:string;header:Row|undefined;headerId:unknown;line:Row;lineId:unknown;explicitCleanedSourceProfile?:boolean}):HistoricalLineAmountDifference|undefined {
 const proof=evidence&&verified.get(evidence),h=input.header,l=input.line;
 if(!proof||!evidence||evidence.source_namespace!==input.namespace||!isRetainedHistoricalSalesDocument(h,input.explicitCleanedSourceProfile)||!h||typeof input.lineId!=='string')return undefined;
 const row=proof.rows.get(input.lineId),f=l.fields;
 if(!row||row.sales_id!==input.headerId||row.sales_id!==f.sales_id||row.sales_source_key!==h.source_key||row.line_source_key!==l.source_key||row.quantity!==f.quantity||row.deal_price!==f.deal_price||row.line_amount!==f.line_amount||refsKey(row.source_refs)!==refsKey(l.source_refs)||refsKey(row.sales_source_refs)!==refsKey(h.source_refs))return undefined;
 const calculated=BigInt(row.quantity)*cents(row.deal_price);
 return {sales_source_key:row.sales_source_key,sales_id:row.sales_id,line_source_key:row.line_source_key,line_id:row.line_id,quantity:row.quantity,deal_price:row.deal_price,line_amount:row.line_amount,calculated_line_amount:decimal(calculated),difference:decimal(cents(row.line_amount)-calculated),source_refs:structuredClone(row.source_refs),evidence_sha256:evidence.evidence_sha256,attestation_sha256:proof.sha256,disposition:'PRESERVED_SOURCE_DIFFERENCE',execution_boundary:'OFFLINE_ARCHIVE_ONLY'};
}

/** Exact reviewed bytes for an offline archive, not an execution grant. */
export function historicalLineAmountEvidenceWire(evidence:HistoricalLineAmountEvidence):{utf8:string;sha256:string} {
 const proof=verified.get(evidence);if(!proof)throw Error('HISTORICAL_LINE_AMOUNT_EVIDENCE_UNVERIFIED');return {utf8:proof.utf8,sha256:proof.sha256};
}

/** Execution may retain only independently verified, exact original facts.
 * Ordinary SAVE/APPROVE economics are deliberately unaffected. */
export function assertHistoricalLineAmountExecution(evidence:HistoricalLineAmountEvidence|undefined,input:Parameters<typeof historicalLineAmountDifference>[1]):void {
 if(!historicalLineAmountDifference(evidence,input))throw Error('HISTORICAL_LINE_AMOUNT_EXECUTION_UNBOUND');
}
