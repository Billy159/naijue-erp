import {TABLE_SCHEMAS} from './unified-import-contract.ts';
import {STANDARD_MASTER_TABLES} from './unified-import-execution.ts';
import type {StandardImportOccurrence} from './unified-import-execution.ts';
import {stableImportId} from './inventory-cutoff-import.ts';
import {requestHash} from './request-hash.ts';

/** Pure, NEW V2 scheduling only. NOT package validation, target admission, a SQL
 * request, or a CLI execution capability. V1 compiler/keys remain untouched.
 * Caller must separately pass full package preflight before any future execution.
 * No source/native row identity is allocated or replaced here. Empty input returns
 * zero chunks (never an empty SQL request); no initialization is planned. All
 * nonnull references must resolve inside this package master set. In particular,
 * initialized user_account references are UNSUPPORTED until a separately reviewed
 * initialization-identity binding exists. V2 output cannot be sent to the V1 CLI. */
export const MASTER_CHUNK_PLAN_V2='UNIFIED_STANDARD_MASTER_CHUNK_PLAN_V2' as const;
const scheduler='DEPENDENCY_ORDERED_MASTERS_V2' as const;
export interface MasterChunkPlanInputV2 {
  format_version:typeof MASTER_CHUNK_PLAN_V2;
  source_namespace:string;package_manifest_sha256:string;execution_plan_sha256:string;baseline_batch_id:string;
  master_rows:readonly StandardImportOccurrence[];
  /** Technical transaction bound, not a business value. Included in plan hash. */
  max_chunk_rows?:number;
}
export interface MasterChunkV2 {
  index:number;operation_id:string;request_key:string;rows:readonly StandardImportOccurrence[];
}
export interface MasterChunkPlanV2 {
  format_version:typeof MASTER_CHUNK_PLAN_V2;scheduler:typeof scheduler;
  execution_scope:'PURE_PLANNER_NOT_CLI_OR_DATABASE';
  source_namespace:string;package_manifest_sha256:string;execution_plan_sha256:string;baseline_batch_id:string;
  max_chunk_rows:number;master_occurrences:number;chunk_plan_sha256:string;chunks:readonly MasterChunkV2[];
}
export class MasterChunkPlanningErrorV2 extends Error {
  readonly code:string;
  constructor(code:string){super(code);this.name='MasterChunkPlanningErrorV2';this.code=code;}
}
function need(value:unknown,code:string):asserts value {if(!value)throw new MasterChunkPlanningErrorV2(code);}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const digest=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
function identityShape(value:unknown):boolean {
  if(value===null||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const v=value as Record<string,unknown>;
  return Object.keys(v).sort().join(',')==='aliases,canonical_source_key,entity_type,identity_basis,source_namespace,source_refs,target_id'
    &&['canonical_source_key','entity_type','source_namespace'].every(k=>typeof v[k]==='string'&&v[k].length>0)
    &&uuid(v.target_id)&&typeof v.identity_basis==='string'&&['EXISTING_VERIFIED','STABLE_IMPORT_ID_V1'].includes(v.identity_basis)
    &&Array.isArray(v.source_refs)&&Array.isArray(v.aliases)&&Array.from(v.aliases).every(a=>typeof a==='string'&&a.length>0);
}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const key=(...parts:string[])=>JSON.stringify(parts);
function freeze<T>(value:T):T {if(value!==null&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
/** Lexical min heap; avoids repeatedly sorting all ready nodes for large inputs. */
class Ready {
  private items:string[]=[];
  push(value:string):void {const a=this.items;a.push(value);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(compare(a[p]!,value)<=0)break;a[i]=a[p]!;i=p;}a[i]=value;}
  pop():string|undefined {const a=this.items;if(!a.length)return undefined;const first=a[0]!,last=a.pop()!;if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&compare(a[child+1]!,a[child]!)<0)child++;if(compare(last,a[child]!)<=0)break;a[i]=a[child]!;i=child;}a[i]=last;}return first;}
}

export function planMasterChunksV2(input:MasterChunkPlanInputV2):MasterChunkPlanV2 {
  need(input?.format_version===MASTER_CHUNK_PLAN_V2&&typeof input.source_namespace==='string'&&input.source_namespace.length>0&&digest(input.package_manifest_sha256)&&digest(input.execution_plan_sha256)&&uuid(input.baseline_batch_id)&&Array.isArray(input.master_rows),'MASTER_V2_BINDING_INVALID');
  const bound=input.max_chunk_rows??500;
  need(Number.isSafeInteger(bound)&&bound>=1&&bound<=500,'MASTER_V2_BOUND_INVALID');
  need(input.master_rows.length<=2147483647,'MASTER_V2_TOTAL_EXCEEDS_COUNTER_BOUND');
  // Check original identity shape BEFORE structuredClone can erase a non-plain
  // prototype. Canonical matches must not short-circuit malformed alias checks.
  for(const r of input.master_rows)if(r!==null&&typeof r==='object'&&TABLE_SCHEMAS[r.table]?.id)
    need(identityShape(r.identity),'MASTER_V2_SOURCE_IDENTITY_INVALID');
  // Clone once: caller mutation cannot change the identity/hash of returned rows.
  const rows=structuredClone(input.master_rows) as StandardImportOccurrence[];
  const nodes=new Map<string,StandardImportOccurrence>(),byTarget=new Map<string,string>(),sources=new Set<string>(),records=new Set<string>();
  const dependencies=new Map<string,Set<string>>(),parent=new Map<string,string>();
  const members=new Map<string,string>(),colorSkus=new Map<string,string[]>();
  for(const r of rows){
    need(r!==null&&typeof r==='object'&&STANDARD_MASTER_TABLES.includes(r.table),'MASTER_V2_MASTER_TABLE_REQUIRED');
    need(r.record!==null&&typeof r.record==='object'&&typeof r.record.source_key==='string'&&r.record.source_key.length>0&&r.record.fields!==null&&typeof r.record.fields==='object'&&!Array.isArray(r.record.fields),'MASTER_V2_ROW_INVALID');
    const f=r.record.fields,schema=TABLE_SCHEMAS[r.table]!;
    need(r.source_record_id===stableImportId('standard-import-record-v1',input.source_namespace,r.table.toUpperCase(),r.record.source_key),'MASTER_V2_SOURCE_IDENTITY_INVALID');
    let target:string;
    if(schema.id){
      need(uuid(f.id)&&r.identity!==null&&r.identity.source_namespace===input.source_namespace&&r.identity.entity_type===r.table.toUpperCase()&&r.identity.target_id===f.id&&(r.identity.canonical_source_key===r.record.source_key||r.identity.aliases.includes(r.record.source_key)),'MASTER_V2_SOURCE_IDENTITY_INVALID');
      target=f.id;
    }else{
      need(r.table==='size_group_member'||r.table==='payment_account_hall','MASTER_V2_COMPOSITE_UNSUPPORTED');
      const columns=r.table==='size_group_member'?['size_group_id','size_id']:['payment_account_id','hall_id'];
      need(columns.every(c=>uuid(f[c])),'MASTER_V2_REFERENCE_INVALID');
      target=key(...columns.map(c=>f[c] as string));
    }
    const id=key(r.table,r.record.source_key,target),targetKey=key(r.table,target),sourceKey=key(r.table,r.record.source_key);
    need(!nodes.has(id)&&!byTarget.has(targetKey)&&!sources.has(sourceKey)&&!records.has(r.source_record_id),'MASTER_V2_DUPLICATE_IDENTITY');
    nodes.set(id,r);byTarget.set(targetKey,id);sources.add(sourceKey);records.add(r.source_record_id);dependencies.set(id,new Set());parent.set(id,id);
    if(r.table==='size_group_member')members.set(key(f.size_group_id as string,f.size_id as string),id);
    if(r.table==='sku'){const pair=key(String(f.product_id),String(f.color_id));const list=colorSkus.get(pair)??[];list.push(id);colorSkus.set(pair,list);}
  }
  const reference=(table:string,value:unknown):string=>{need(uuid(value),'MASTER_V2_REFERENCE_INVALID');need(STANDARD_MASTER_TABLES.includes(table),'MASTER_V2_EXTERNAL_REFERENCE_UNSUPPORTED');const found=byTarget.get(key(table,value));need(found!==undefined,'MASTER_V2_REFERENCE_MISSING');return found;};
  const root=(id:string):string=>{let r=id;while(parent.get(r)!==r)r=parent.get(r)!;while(parent.get(id)!==id){const next=parent.get(id)!;parent.set(id,r);id=next;}return r;};
  const union=(a:string,b:string):void=>{a=root(a);b=root(b);if(a!==b)parent.set(compare(a,b)<0?b:a,compare(a,b)<0?a:b);};
  for(const [id,r]of nodes){
    const f=r.record.fields;
    for(const [name,rule]of Object.entries(TABLE_SCHEMAS[r.table]!)){
      if(!rule.reference)continue;const value=f[name];
      if(value===null){need(rule.nullable,'MASTER_V2_REFERENCE_INVALID');continue;}
      if(rule.kind==='uuid_array'){need(Array.isArray(value),'MASTER_V2_REFERENCE_INVALID');for(const v of value)dependencies.get(id)!.add(reference(rule.reference,v));}
      else dependencies.get(id)!.add(reference(rule.reference,value));
    }
    if(r.table==='hall'&&f.default_sales_warehouse_id!==null){
      const warehouse=reference('warehouse',f.default_sales_warehouse_id);
      need(nodes.get(warehouse)!.record.fields.hall_id===f.id,'MASTER_V2_HALL_DEFAULT_OWNERSHIP_INVALID');union(id,warehouse);
    }
    if(r.table==='product_category'&&f.parent_id!==null){
      const p=nodes.get(reference('product_category',f.parent_id))!;
      need(p.record.fields.id!==f.id&&p.record.fields.parent_id===null,'MASTER_V2_CATEGORY_GRAPH_INVALID');
    }
    if(r.table==='sku'){
      const product=nodes.get(reference('product',f.product_id))!;
      const membership=members.get(key(String(product.record.fields.size_group_id),String(f.size_id)));
      need(membership!==undefined,'MASTER_V2_SKU_MEMBERSHIP_MISSING');dependencies.get(id)!.add(membership);
    }
    if(r.table==='product_image'&&f.image_role==='COLOR'){
      const supporting=colorSkus.get(key(String(f.product_id),String(f.color_id)))?.sort(compare)[0];
      need(supporting!==undefined,'MASTER_V2_COLOR_IMAGE_SKU_MISSING');dependencies.get(id)!.add(supporting);
    }
  }
  const components=new Map<string,string[]>();
  for(const id of nodes.keys()){const component=root(id),list=components.get(component)??[];list.push(id);components.set(component,list);}
  const prerequisites=new Map<string,Set<string>>(),dependents=new Map<string,Set<string>>();
  for(const [component,list]of components){
    need(list.length<=bound,'MASTER_V2_ATOMIC_COMPONENT_EXCEEDS_BOUND');
    // Only approved hall/default-warehouse pair can form a non-singleton.
    need(list.length===1||(list.length===2&&list.some(id=>nodes.get(id)!.table==='hall')&&list.some(id=>nodes.get(id)!.table==='warehouse')),'MASTER_V2_GRAPH_UNRESOLVABLE');
    list.sort((a,b)=>{const rank=(id:string)=>nodes.get(id)!.table==='hall'?0:1;return list.length===2?rank(a)-rank(b)||compare(a,b):compare(a,b);});
    prerequisites.set(component,new Set());dependents.set(component,new Set());
  }
  for(const [id,deps]of dependencies)for(const dependency of deps){const to=root(id),from=root(dependency);if(to===from){need(id!==dependency&&components.get(to)!.length===2,'MASTER_V2_GRAPH_UNRESOLVABLE');continue;}prerequisites.get(to)!.add(from);dependents.get(from)!.add(to);}
  const ready=new Ready();for(const [id,deps]of prerequisites)if(deps.size===0)ready.push(id);
  const chunkRows:StandardImportOccurrence[][]=[];let current:StandardImportOccurrence[]=[],visited=0;
  for(let next=ready.pop();next!==undefined;next=ready.pop()){
    visited++;const list=components.get(next)!;
    if(current.length+list.length>bound){chunkRows.push(current);current=[];}
    current.push(...list.map(id=>nodes.get(id)!));
    for(const dependent of dependents.get(next)!){const deps=prerequisites.get(dependent)!;deps.delete(next);if(deps.size===0)ready.push(dependent);}
  }
  need(visited===components.size,'MASTER_V2_GRAPH_UNRESOLVABLE');if(current.length)chunkRows.push(current);
  const descriptor={format_version:MASTER_CHUNK_PLAN_V2,scheduler,execution_scope:'PURE_PLANNER_NOT_CLI_OR_DATABASE' as const,source_namespace:input.source_namespace,package_manifest_sha256:input.package_manifest_sha256,execution_plan_sha256:input.execution_plan_sha256,baseline_batch_id:input.baseline_batch_id,max_chunk_rows:bound,master_occurrences:rows.length};
  const chunk_plan_sha256=requestHash({...descriptor,chunks:chunkRows});
  const chunks=chunkRows.map((rows,index)=>{const operation_id=stableImportId('standard-import-master-operation-v2',input.baseline_batch_id,input.execution_plan_sha256,chunk_plan_sha256,String(index));return{index,operation_id,request_key:operation_id,rows};});
  return freeze({...descriptor,chunk_plan_sha256,chunks});
}
