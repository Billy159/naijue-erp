import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkuImportIdentity, createDocumentImportIdentity, createLineImportIdentity, validateStableIdentityBinding, parseStableSourceKey } from '../packages/application/src/unified-import-stable-identity.ts';
import { registryTargetId } from '../packages/application/src/unified-import-contract.ts';
const ns='synthetic-fixed-namespace';
const refs=[{file_sha256:'a'.repeat(64),sheet:'source',row:1}];
const dim=(entity_type:string,key:string)=>({entity_type,source_namespace:ns,canonical_source_key:key,target_id:registryTargetId(ns,entity_type,key),aliases:[],identity_basis:'STABLE_IMPORT_ID_V1' as const,source_refs:refs});
const dimensions={product:dim('PRODUCT','product-001'),color:dim('COLOR','color-01'),fit:dim('FIT','fit-A'),size:dim('SIZE','size-group-pants:910')};
const sku=(size='size-group-pants:910',enabled:boolean|null=true)=>createSkuImportIdentity({source_namespace:ns,dimensions:{...dimensions,size:dim('SIZE',size)},enabled,source_refs:refs});
test('131 four-dimensional candidates keep identities across reorder and provenance changes',()=>{
 const rows=Array.from({length:131},(_,i)=>sku(`size-${i}`));
 assert.equal(new Set(rows.map(x=>x.identity.target_id)).size,131);
 assert.equal(new Set(rows.map(x=>x.fields.sku_code)).size,131);
 for(const row of [...rows].reverse()){const again=sku(parseStableSourceKey(row.identity.canonical_source_key)!.parts[3]!);assert.equal(row.identity.target_id,again.identity.target_id);}
 const changed=createSkuImportIdentity({source_namespace:ns,dimensions,enabled:false,source_refs:[{...refs[0]!,file_sha256:'b'.repeat(64),row:99}]});
 assert.equal(changed.identity.target_id,sku().identity.target_id); assert.equal(changed.fields.enabled,false);
});
test('SKU keys preserve text boundaries and source groups; unknown activation is not enabled',()=>{
 assert.notEqual(sku('group-old:910').identity.target_id,sku('group-pants:910').identity.target_id);
 assert.notEqual(sku('01').identity.target_id,sku('1').identity.target_id);
 assert.throws(()=>sku('size',null),/SKU_ACTIVATION_FACT_REQUIRED/);
 assert.throws(()=>createSkuImportIdentity({source_namespace:ns,dimensions:{...dimensions,color:dim('COLOR','')},enabled:true,source_refs:refs}),/DIMENSION_IDENTITY_REQUIRED/);
});
const header=()=>createDocumentImportIdentity({source_namespace:ns,entity_type:'SALES_HEADER',basis:'ORIGINAL_ID',original_id:'original-sale-0001',source_refs:refs});
test('permanent header and occurrence identities preserve duplicate business lines across order and incremental additions',()=>{
 const h=header(); const line=(id:string)=>createLineImportIdentity({source_namespace:ns,entity_type:'SALES_LINE',header:h,basis:'PERSISTED_LEDGER_ID',original_id:id,source_refs:refs});
 const a=line('11111111-1111-4111-8111-111111111111'),b=line('22222222-2222-4222-8222-222222222222');
 assert.notEqual(a.target_id,b.target_id);assert.equal(line('11111111-1111-4111-8111-111111111111').target_id,a.target_id);
 assert.equal(header().target_id,h.target_id);
 assert.throws(()=>line('temporary-row-2'),/PERSISTENT_LEDGER_UUID_REQUIRED/);
 assert.throws(()=>createLineImportIdentity({source_namespace:ns,entity_type:'SALES_LINE',header:h,basis:'ORIGINAL_ID',original_id:'',source_refs:refs}),/PERMANENT_SOURCE_ID_REQUIRED/);
 assert.throws(()=>createLineImportIdentity({source_namespace:ns,entity_type:'TRANSFER_LINE',header:h,basis:'ORIGINAL_ID',original_id:'l1',source_refs:refs}),/PARENT_ENTITY_MISMATCH/);
});
test('shared resolver enforces actual dimension and parent references without reinterpreting legacy keys',()=>{
 const s=sku(); const lookup=(entity:string,key:string)=>Object.values(dimensions).find(x=>x.entity_type===entity&&x.canonical_source_key===key);
 assert.deepEqual(validateStableIdentityBinding(s.identity,s.fields,lookup),[]);
 assert.ok(validateStableIdentityBinding(s.identity,{...s.fields,size_id:dimensions.color.target_id},lookup).includes('STABLE_IDENTITY_REFERENCE_MISMATCH'));
 assert.deepEqual(validateStableIdentityBinding(dim('SKU','old-source-key'),{},lookup),[]);
 const h=header(),l=createLineImportIdentity({source_namespace:ns,entity_type:'SALES_LINE',header:h,basis:'ORIGINAL_ID',original_id:'line-1',source_refs:refs});
 assert.deepEqual(validateStableIdentityBinding(l,{sales_id:h.target_id},(e,k)=>e===h.entity_type&&k===h.canonical_source_key?h:undefined),[]);
 assert.ok(validateStableIdentityBinding(l,{sales_id:'00000000-0000-0000-0000-000000000000'},()=>h).includes('STABLE_IDENTITY_REFERENCE_MISMATCH'));
});

test('quoted delimiter and Unicode keys round-trip exactly without tuple collisions or normalization',()=>{
 const values=['色"号','色|号:组,[]','尺码\\原码','汉字😀','é','e\u0301'];
 const entries=values.map(value=>sku(value));
 assert.equal(new Set(entries.map(x=>x.identity.target_id)).size,values.length);
 entries.forEach((entry,i)=>assert.equal(parseStableSourceKey(entry.identity.canonical_source_key)!.parts[3],values[i]));
 const a=createSkuImportIdentity({source_namespace:ns,dimensions:{...dimensions,color:dim('COLOR','a|b'),fit:dim('FIT','c')},enabled:false,source_refs:refs});
 const b=createSkuImportIdentity({source_namespace:ns,dimensions:{...dimensions,color:dim('COLOR','a'),fit:dim('FIT','b|c')},enabled:false,source_refs:refs});
 assert.notEqual(a.identity.target_id,b.identity.target_id);
 const h=createDocumentImportIdentity({source_namespace:ns,entity_type:'TRANSFER_HEADER',basis:'ORIGINAL_ID',original_id:'调拨"|:😀\\001',source_refs:refs});
 const l=createLineImportIdentity({source_namespace:ns,entity_type:'TRANSFER_LINE',header:h,basis:'ORIGINAL_ID',original_id:'明细"|:😀\\001',source_refs:refs});
 assert.deepEqual(parseStableSourceKey(l.canonical_source_key)!.parts,[h.canonical_source_key,'ORIGINAL_ID','明细"|:😀\\001']);
});

test('settlement permanent occurrence keys bind the sales parent and preserve persisted ledger UUIDs',()=>{
 const h=header();
 const make=(id:string,parent=h,source_refs=refs)=>createLineImportIdentity({source_namespace:ns,entity_type:'SALES_SETTLEMENT',header:parent,basis:'PERSISTED_LEDGER_ID',original_id:id,source_refs});
 const id='11111111-1111-4111-8111-111111111111',a=make(id),b=make('22222222-2222-4222-8222-222222222222');
 assert.notEqual(a.target_id,b.target_id);
 assert.deepEqual(parseStableSourceKey(a.canonical_source_key)!.parts,[h.canonical_source_key,'PERSISTED_LEDGER_ID',id]);
 assert.equal(make(id,h,[{...refs[0]!,file_sha256:'b'.repeat(64),row:999}]).target_id,a.target_id);
 assert.notEqual(make(id,createDocumentImportIdentity({source_namespace:ns,entity_type:'SALES_HEADER',basis:'ORIGINAL_ID',original_id:'another-sale',source_refs:refs})).target_id,a.target_id);
 assert.throws(()=>make('row-2'),/PERSISTENT_LEDGER_UUID_REQUIRED/);
 assert.throws(()=>make(id,createDocumentImportIdentity({source_namespace:ns,entity_type:'TRANSFER_HEADER',basis:'ORIGINAL_ID',original_id:'transfer',source_refs:refs})),/PARENT_ENTITY_MISMATCH/);
 assert.deepEqual(validateStableIdentityBinding(a,{sales_id:h.target_id},()=>h),[]);
 assert.deepEqual(validateStableIdentityBinding(a,{sales_id:b.target_id},()=>h),['STABLE_IDENTITY_REFERENCE_MISMATCH']);
 assert.deepEqual(validateStableIdentityBinding(a,{sales_id:h.target_id},()=>undefined),['STABLE_IDENTITY_REFERENCE_MISSING']);
});

test('occurrence helper rejects inconsistent parent derivation while retaining verified existing UUIDs',()=>{
 const h=header(),id='99999999-9999-4999-8999-999999999999';
 const make=(parent:typeof h)=>createLineImportIdentity({source_namespace:ns,entity_type:'SALES_SETTLEMENT',header:parent,basis:'ORIGINAL_ID',original_id:'original-settlement-1',source_refs:refs});
 assert.throws(()=>make({...h,target_id:id}),/PARENT_IDENTITY_ALGORITHM_MISMATCH/);
 assert.throws(()=>make({...h,identity_basis:'UNVERIFIED' as typeof h.identity_basis}),/PARENT_ENTITY_MISMATCH/);
 const retained={...h,target_id:id,identity_basis:'EXISTING_VERIFIED' as const};
 const row=make(retained);assert.deepEqual(validateStableIdentityBinding(row,{sales_id:id},()=>retained),[]);
 assert.equal(make(h).target_id,row.target_id,'Child identity remains source-key based, not a migration of the parent target UUID');
});

import {materializeWarehouseInitializationRecord} from '../packages/application/src/unified-import-stable-identity.ts';
test('warehouse initialization plans only registry identity and version one without mutating source or inventing capture',()=>{
 const entry=dim('WAREHOUSE','warehouse:approved'),record={source_key:entry.canonical_source_key,source_refs:structuredClone(refs),fields:{name:'Synthetic warehouse',hall_id:dimensions.product.target_id,enabled:true}},before=JSON.stringify(record);
 const materialized=materializeWarehouseInitializationRecord({stage:'CLEANED',source_namespace:ns,record,identity:entry});
 assert.equal(materialized.fields.id,entry.target_id);assert.equal(materialized.fields.version,1);assert.equal(materialized.fields.created_operation_id,null);assert.equal(JSON.stringify(record),before);assert.deepEqual(materialized.source_refs,record.source_refs);assert.equal(Object.hasOwn(materialized.fields,'captured_at'),false);
 assert.throws(()=>materializeWarehouseInitializationRecord({stage:'CLEANED',source_namespace:ns,record,identity:undefined}),/REGISTRY_IDENTITY_REQUIRED/);
 assert.throws(()=>materializeWarehouseInitializationRecord({stage:'CLEANED',source_namespace:ns,record,identity:{...entry,canonical_source_key:'another'}}),/REGISTRY_IDENTITY_REQUIRED/);
 assert.throws(()=>materializeWarehouseInitializationRecord({stage:'READY',source_namespace:ns,record,identity:entry}),/READY_FIELDS_REQUIRED/);
 const ready={...materialized,fields:{...materialized.fields,version:7}},unchanged=JSON.stringify(ready);
 assert.deepEqual(materializeWarehouseInitializationRecord({stage:'READY',source_namespace:ns,record:ready,identity:entry}),ready);assert.equal(JSON.stringify(ready),unchanged);
 assert.throws(()=>materializeWarehouseInitializationRecord({stage:'READY',source_namespace:ns,record:{...ready,fields:{...ready.fields,id:dimensions.color.target_id}},identity:entry}),/IDENTITY_MISMATCH/);
 assert.throws(()=>materializeWarehouseInitializationRecord({stage:'CLEANED',source_namespace:ns,record:{...record,fields:{...record.fields,version:0}},identity:entry}),/INITIAL_VERSION_INVALID/);
});
