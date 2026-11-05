import { isDeepStrictEqual } from 'node:util';

/** OFFLINE reconstruction model only: caller-provided facts are not verified.
 * This is not an issuer, SQL adapter, publication proof, or permission to write.
 * A live implementation must first bind every fact to a reviewed same-client
 * standard27 catalog and the published import_record/receipt/audit proof. */
type Row = Record<string, unknown> & { id: string };
type Family = 'skus' | 'barcodes' | 'images';
type State = { product: Row; skus: readonly Row[]; barcodes: readonly Row[]; images: readonly Row[] };
type Step = { receipt: { status: string; target_type: string; target_id: string; id: string; action: string; actor_account_id: string; request_hash: string; completed_at: string }; audit: { operation_id: string; actor_account_id: string; occurred_at: string; object_type: string; object_id: string; action: string; old_version: number; new_version: number; before_values: Record<string, unknown>; after_values: Record<string, unknown> } };
function fail(): never { throw new Error('STANDARD27_PRODUCT_EVIDENCE_INVALID'); }
function object(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function rows(value: readonly Row[], max: number): Map<string, Row> {
 if (!Array.isArray(value) || value.length > max) fail(); const out=new Map<string,Row>();
 for(const r of value) { if(!object(r)||typeof r.id!=='string'||!r.id||out.has(r.id)) fail(); out.set(r.id,structuredClone(r as Row)); } return out;
}
function instant(v:unknown):bigint {
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))fail();const frac=v.match(/\.(\d{1,6})(?:Z|[+-]\d\d:\d\d)$/)?.[1]??'';return BigInt(Date.parse(v))*1000n+BigInt(frac.padEnd(6,'0').slice(3));
}
function sameRows(left:Map<string,Row>,right:Map<string,Row>):boolean { return left.size===right.size && [...left].every(([id,row])=>right.has(id)&&isDeepStrictEqual(row,right.get(id))); }
export function modelStandard27ProductCapacity(input:{productId:string;baseline:State & {kind:'PUBLISHED_STANDARD_PRODUCT'|'RECONSTRUCTED_CREATE_LOCAL'};chain:readonly Step[];actual:State}):{version:number;count:number;bytes:number} {
 if(!input.productId||!['PUBLISHED_STANDARD_PRODUCT','RECONSTRUCTED_CREATE_LOCAL'].includes(input.baseline.kind)||input.baseline.product.id!==input.productId||!Number.isSafeInteger(input.baseline.product.version)||Number(input.baseline.product.version)<1||input.chain.length>1024) fail();
 const product=structuredClone(input.baseline.product), state={skus:rows(input.baseline.skus,5000),barcodes:rows(input.baseline.barcodes,20000),images:rows(input.baseline.images,1000)}; let bytes=0; const operationIds=new Set<string>();
 const validateState=()=>{
  const raw=new Set<unknown>(),main=new Set<unknown>();
  for(const sku of state.skus.values()) if(sku.product_id!==input.productId)fail();
  for(const image of state.images.values()) if(image.product_id!==input.productId)fail();
  for(const barcode of state.barcodes.values()) {if(typeof barcode.sku_id!=='string'||!state.skus.has(barcode.sku_id)||typeof barcode.barcode!=='string'||!barcode.barcode||raw.has(barcode.barcode))fail();raw.add(barcode.barcode);if(barcode.enabled===true&&barcode.barcode_kind==='MAIN'){if(main.has(barcode.sku_id))fail();main.add(barcode.sku_id);}}
 };
 validateState();
 for(const step of input.chain) {
  const r=step.receipt,a=step.audit;
  if(r.status!=='COMMITTED'||r.target_type!=='PRODUCT'||r.target_id!==input.productId||a.object_type!=='PRODUCT'||a.object_id!==input.productId||r.id!==a.operation_id||r.actor_account_id!==a.actor_account_id||(typeof r.request_hash!=='string'||!/^[a-f0-9]{64}$/.test(r.request_hash))||instant(r.completed_at)!==instant(a.occurred_at)||r.action!==a.action||!['EDIT','DISABLE','RESTORE'].includes(a.action)||a.old_version!==product.version||a.new_version!==a.old_version+1||!object(a.before_values)||!object(a.after_values)) fail();
  if(product.deleted_at!==undefined&&product.deleted_at!==null)fail();
  if(a.action==='DISABLE'||a.action==='RESTORE') {
   const expectedBefore=a.action==='DISABLE', expectedAfter=!expectedBefore;
   if(product.enabled!==expectedBefore||a.before_values.enabled!==expectedBefore||a.after_values.enabled!==expectedAfter||!isDeepStrictEqual(Object.keys(a.before_values).sort(),['enabled','version'])||!isDeepStrictEqual(Object.keys(a.after_values).sort(),['enabled','version']))fail();
  }
  if(operationIds.has(r.id)||!r.id)fail(); operationIds.add(r.id);
  if(Object.hasOwn(a.before_values,'version')&&a.before_values.version!==a.old_version||Object.hasOwn(a.after_values,'version')&&a.after_values.version!==a.new_version)fail();
  bytes+=Buffer.byteLength(JSON.stringify([a.before_values,a.after_values])); if(bytes>16*1024*1024) fail();
  for(const k of Object.keys(a.after_values)) if(!['skus','barcodes','images','version'].includes(k)&&!Object.hasOwn(a.before_values,k))fail();
  for(const k of Object.keys(a.before_values)) if(!['skus','barcodes','images','version'].includes(k)&&!Object.hasOwn(a.after_values,k))fail();
  for(const [k,v] of Object.entries(a.before_values)) if(!['skus','barcodes','images'].includes(k)&&(!Object.hasOwn(product,k)||!isDeepStrictEqual(product[k],v))) fail();
  for(const [k,v] of Object.entries(a.after_values)) if(!['skus','barcodes','images'].includes(k)) {if(k==='id'&&v!==input.productId)fail(); product[k]=structuredClone(v);}
  product.version=a.new_version;
  for(const family of ['skus','barcodes','images'] as const) {
   const before=(a.before_values[family]??[]) as readonly Row[],after=(a.after_values[family]??[]) as readonly Row[],old=rows(before,family==='skus'?5000:family==='barcodes'?20000:1000),next=rows(after,family==='skus'?5000:family==='barcodes'?20000:1000),map=state[family];
   for(const [id,row] of old) if(!map.has(id)||!isDeepStrictEqual(map.get(id),row)) fail();
   for(const [id,row] of old) if(!next.has(id)) {if(family!=='images')fail();map.delete(id);}
   for(const [id,row] of next) {const prior=map.get(id); if(prior&&!old.has(id)||!prior&&old.has(id))fail();
    if(prior && !isDeepStrictEqual(Object.keys(prior).sort(),Object.keys(row).sort()))fail();
    if(prior && family==='barcodes' && Object.keys(prior).some(k=>k!=='enabled'&&!isDeepStrictEqual(prior[k],row[k])))fail();
    if(prior && family==='skus' && Object.keys(prior).some(k=>k!=='enabled'&&k!=='version'&&!isDeepStrictEqual(prior[k],row[k])))fail();
    if(prior && family==='skus' && (typeof prior.version !== 'number'||row.version !== prior.version+1||row.enabled===prior.enabled))fail();
    if(!prior && family==='skus' && (row.version!==1||row.created_operation_id!==a.operation_id))fail();
    if(family==='images' && row.product_id!==input.productId)fail();
    if(prior && family==='images' && (typeof prior.version!=='number'||row.version!==prior.version+1))fail();
    if(!prior && family==='images' && row.version!==1)fail();
    map.set(id,row);
   }
  }
  validateState();
 }
 if(product.id!==input.productId||!isDeepStrictEqual(product,input.actual.product))fail();
 for(const family of ['skus','barcodes','images'] as const) if(!sameRows(state[family],rows(input.actual[family],family==='skus'?5000:family==='barcodes'?20000:1000)))fail();
 for(const sku of state.skus.values()) if(sku.product_id!==input.productId)fail();
 for(const image of state.images.values()) if(image.product_id!==input.productId)fail();
 for(const barcode of state.barcodes.values()) if(typeof barcode.sku_id!=='string'||!state.skus.has(barcode.sku_id))fail();
 return {version:Number(product.version),count:input.chain.length,bytes};
}

/** Offline-only CREATE baseline reconstruction. The receipt and audit values
 * remain caller-supplied until a future independently reviewed SQL collector
 * verifies them against the original transaction and actual database. */
export function modelStandard27CreatedProductCapacity(input:{productId:string;create:{receipt:Step['receipt'];audit:Omit<Step['audit'],'old_version'|'before_values'> & {old_version:null;before_values:null}};chain:readonly Step[];actual:State}):{version:number;count:number;bytes:number} {
 const {receipt:r,audit:a}=input.create;
 if(!input.productId||r.status!=='COMMITTED'||r.target_type!=='PRODUCT'||r.target_id!==input.productId||r.action!=='CREATE'||a.action!=='CREATE'||a.object_type!=='PRODUCT'||a.object_id!==input.productId||r.id!==a.operation_id||!r.id||r.actor_account_id!==a.actor_account_id||(typeof r.request_hash!=='string'||!/^[a-f0-9]{64}$/.test(r.request_hash))||instant(r.completed_at)!==instant(a.occurred_at)||a.old_version!==null||a.new_version!==1||a.before_values!==null||!object(a.after_values)||a.after_values.id!==input.productId||a.after_values.version!==1||a.after_values.deleted_at!==null) fail();
 if(input.chain.some(step=>step.receipt.id===r.id))fail();
 const {skus:rawSkus=[],barcodes:rawBarcodes=[],images:rawImages=[],...product}=a.after_values;
 if(!Array.isArray(rawSkus)||!Array.isArray(rawBarcodes)||!Array.isArray(rawImages))fail();
 const skus=[...rows(rawSkus as Row[],5000).values()],barcodes=[...rows(rawBarcodes as Row[],20000).values()],images=[...rows(rawImages as Row[],1000).values()];
 for(const sku of skus) if(sku.product_id!==input.productId||sku.version!==1||sku.created_operation_id!==r.id)fail();
 for(const image of images) if(image.product_id!==input.productId||image.version!==1||image.created_by_account_id!==r.actor_account_id||instant(image.created_at)!==instant(r.completed_at))fail();
 const output=modelStandard27ProductCapacity({productId:input.productId,baseline:{kind:'RECONSTRUCTED_CREATE_LOCAL',product:product as Row,skus,barcodes,images},chain:input.chain,actual:input.actual});
 const bytes=output.bytes+Buffer.byteLength(JSON.stringify([a.before_values,a.after_values])),count=output.count+1;
 if(bytes>16*1024*1024||count>1024)fail();
 return {version:output.version,count,bytes};
}
