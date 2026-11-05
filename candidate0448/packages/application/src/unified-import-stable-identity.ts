import { stableImportId } from './inventory-cutoff-import.ts';

/** Additive source-key codec. Existing unprefixed registry identities are never migrated. */
export const STABLE_SOURCE_IDENTITY_VERSION = 'NAIJUE_SOURCE_IDENTITY_V1';
export const STABLE_SOURCE_KEY_PREFIX = 'naijue:source-identity:v1:';
type Basis = 'ORIGINAL_ID' | 'PERSISTED_LEDGER_ID';
type Header = 'SALES_HEADER' | 'TRANSFER_HEADER';
type Line = 'SALES_LINE' | 'TRANSFER_LINE' | 'SALES_SETTLEMENT';
interface Ref { file_sha256:string; sheet:string|null; row:number }
export interface StableRegistryIdentity { entity_type:string; source_namespace:string; canonical_source_key:string; target_id:string; aliases:string[]; identity_basis:'EXISTING_VERIFIED'|'STABLE_IMPORT_ID_V1'; source_refs:Ref[] }
interface Base { source_namespace:string; source_refs:Ref[] }
const text=(v:unknown):v is string=>typeof v==='string'&&!/[\uD800-\uDFFF]/u.test(v)&&!v.includes('\0')&&v.trim().length>0;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
function requireValue(condition:unknown,code:string):asserts condition { if(!condition)throw Error(code); }
function checkBase(b:Base){requireValue(text(b.source_namespace),'SOURCE_NAMESPACE_REQUIRED');requireValue(Array.isArray(b.source_refs)&&b.source_refs.length>0&&b.source_refs.every(r=>r&&Object.keys(r).sort().join(',')==='file_sha256,row,sheet'&&/^[a-f0-9]{64}$/.test(r.file_sha256)&&(r.sheet===null||text(r.sheet))&&Number.isSafeInteger(r.row)&&r.row>0&&r.row<=2147483647),'SOURCE_REFS_REQUIRED');}
function permanent(basis:Basis,id:string){requireValue(basis==='ORIGINAL_ID'||basis==='PERSISTED_LEDGER_ID','PERMANENT_ID_BASIS_REQUIRED');requireValue(text(id),'PERMANENT_SOURCE_ID_REQUIRED');if(basis==='PERSISTED_LEDGER_ID')requireValue(uuid(id),'PERSISTENT_LEDGER_UUID_REQUIRED');}
function key(entity:string,parts:string[]){return STABLE_SOURCE_KEY_PREFIX+JSON.stringify([entity,...parts]);}
function identity(b:Base,entity_type:string,canonical_source_key:string):StableRegistryIdentity {checkBase(b);return {entity_type,source_namespace:b.source_namespace,canonical_source_key,target_id:stableImportId('entity',b.source_namespace,entity_type,canonical_source_key),aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:b.source_refs.map(r=>({...r}))};}
export function parseStableSourceKey(value:string):{entity_type:string;parts:string[]}|null {
 if(!value.startsWith(STABLE_SOURCE_KEY_PREFIX))return null;
 let a:unknown;try{a=JSON.parse(value.slice(STABLE_SOURCE_KEY_PREFIX.length));}catch{throw Error('STABLE_SOURCE_KEY_INVALID');}
 requireValue(Array.isArray(a)&&a.every(text)&&value===STABLE_SOURCE_KEY_PREFIX+JSON.stringify(a),'STABLE_SOURCE_KEY_INVALID');
 const [entity,...parts]=a as string[];
 if(entity==='SKU')requireValue(parts.length===4,'STABLE_SOURCE_KEY_INVALID');
 else if(entity==='SALES_HEADER'||entity==='TRANSFER_HEADER'){requireValue(parts.length===2,'STABLE_SOURCE_KEY_INVALID');permanent(parts[0] as Basis,parts[1]!);}
 else if(entity==='SALES_LINE'||entity==='TRANSFER_LINE'||entity==='SALES_SETTLEMENT'){requireValue(parts.length===3,'STABLE_SOURCE_KEY_INVALID');permanent(parts[1] as Basis,parts[2]!);}
 else throw Error('STABLE_SOURCE_KEY_INVALID');
 return {entity_type:entity!,parts};
}
export function createSkuImportIdentity(input:Base&{dimensions:{product:StableRegistryIdentity;color:StableRegistryIdentity;fit:StableRegistryIdentity;size:StableRegistryIdentity};enabled:boolean|null}) {
 checkBase(input);requireValue(typeof input.enabled==='boolean','SKU_ACTIVATION_FACT_REQUIRED');
 const types=['PRODUCT','COLOR','FIT','SIZE'],names=['product','color','fit','size'] as const;
 const dims=names.map((name,i)=>{const d=input.dimensions?.[name];requireValue(d&&d.entity_type===types[i]&&d.source_namespace===input.source_namespace&&text(d.canonical_source_key)&&uuid(d.target_id),'DIMENSION_IDENTITY_REQUIRED');if(d.identity_basis==='STABLE_IMPORT_ID_V1')requireValue(d.target_id===stableImportId('entity',d.source_namespace,d.entity_type,d.canonical_source_key),'DIMENSION_IDENTITY_ALGORITHM_MISMATCH');else requireValue(d.identity_basis==='EXISTING_VERIFIED','DIMENSION_IDENTITY_REQUIRED');return d;});
 const entry=identity(input,'SKU',key('SKU',dims.map(d=>d.canonical_source_key)));
 return {identity:entry,fields:{id:entry.target_id,product_id:dims[0]!.target_id,color_id:dims[1]!.target_id,fit_id:dims[2]!.target_id,size_id:dims[3]!.target_id,sku_code:`NJIMP1-${entry.target_id}`,enabled:input.enabled,version:1,created_operation_id:null}};
}
export function createDocumentImportIdentity(input:Base&{entity_type:Header;basis:Basis;original_id:string}) {requireValue(input.entity_type==='SALES_HEADER'||input.entity_type==='TRANSFER_HEADER','DOCUMENT_ENTITY_INVALID');permanent(input.basis,input.original_id);return identity(input,input.entity_type,key(input.entity_type,[input.basis,input.original_id]));}
export function createLineImportIdentity(input:Base&{entity_type:Line;header:StableRegistryIdentity;basis:Basis;original_id:string}) {
 requireValue(input.entity_type==='SALES_LINE'||input.entity_type==='TRANSFER_LINE'||input.entity_type==='SALES_SETTLEMENT','LINE_ENTITY_INVALID');const expected=input.entity_type==='TRANSFER_LINE'?'TRANSFER_HEADER':'SALES_HEADER';
 requireValue(input.header?.entity_type===expected&&input.header.source_namespace===input.source_namespace&&text(input.header.canonical_source_key)&&uuid(input.header.target_id),'PARENT_ENTITY_MISMATCH');
 if(input.header.identity_basis==='STABLE_IMPORT_ID_V1')requireValue(input.header.target_id===stableImportId('entity',input.header.source_namespace,input.header.entity_type,input.header.canonical_source_key),'PARENT_IDENTITY_ALGORITHM_MISMATCH');
 else requireValue(input.header.identity_basis==='EXISTING_VERIFIED','PARENT_ENTITY_MISMATCH');
 permanent(input.basis,input.original_id);
 return identity(input,input.entity_type,key(input.entity_type,[input.header.canonical_source_key,input.basis,input.original_id]));
}
/** Shared by both preflight paths; legacy keys retain their previous contract. */
export function validateStableIdentityBinding(entry:StableRegistryIdentity,fields:Record<string,unknown>,lookup:(entity:string,key:string)=>StableRegistryIdentity|undefined):string[] {
 let parsed;try{parsed=parseStableSourceKey(entry.canonical_source_key);}catch{return ['STABLE_SOURCE_KEY_INVALID'];}if(!parsed)return [];
 if(parsed.entity_type!==entry.entity_type)return ['STABLE_IDENTITY_ENTITY_MISMATCH'];
 const expected=parsed.entity_type==='SKU'?[['PRODUCT','product_id'],['COLOR','color_id'],['FIT','fit_id'],['SIZE','size_id']]:(parsed.entity_type==='SALES_LINE'||parsed.entity_type==='SALES_SETTLEMENT')?[['SALES_HEADER','sales_id']]:parsed.entity_type==='TRANSFER_LINE'?[['TRANSFER_HEADER','transfer_id']]:[];
 const issues:string[]=[];for(const [i,[entityType,field]]of expected.entries()){const resolved=lookup(entityType!,parsed.parts[i]!);if(!resolved||resolved.entity_type!==entityType||resolved.source_namespace!==entry.source_namespace||resolved.canonical_source_key!==parsed.parts[i])issues.push('STABLE_IDENTITY_REFERENCE_MISSING');else if(fields[field!]!==resolved.target_id)issues.push('STABLE_IDENTITY_REFERENCE_MISMATCH');}
 return [...new Set(issues)];
}
