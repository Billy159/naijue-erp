import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMultisizeSyntheticProgram} from './multisize-program.ts';
test('synthetic published-program fixture contains one whole two-size group',()=>{
 const f=buildMultisizeSyntheticProgram({protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'1234567890123456789',database_oid:'12345',database_name:'synthetic_document_test',catalog_sha256:'0'.repeat(64)});
 const rows=f.program.steps.flatMap(s=>Array.isArray(s.request.payload.rows)?s.request.payload.rows:[]);
 const sizes=rows.filter(r=>r.entity_type==='SIZE'), members=rows.filter(r=>r.entity_type==='SIZE_GROUP_MEMBER');
 assert.equal(sizes.length,2);assert.equal(members.length,2);assert.equal(new Set(members.map(r=>r.fields.size_id)).size,2);
 assert.ok(sizes.some(r=>r.fields.id===f.addedSizeId&&r.fields.code==='901'));
});
test('synthetic product CREATE preserves an absent scheme in the real V2 parser',async()=>{
 const {parseProductMaintenanceCommandV2}=await import('../../../packages/application/src/product-maintenance-validation.ts');
 const {CATALOGUE_PRICE_KEYS}=await import('../../../packages/application/src/catalogue-price-input.ts');
 const f=buildMultisizeSyntheticProgram({protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'1234567890123456789',database_oid:'12345',database_name:'synthetic_document_test',catalog_sha256:'0'.repeat(64)});
 const c=parseProductMaintenanceCommandV2({action:'CREATE',requestKey:'synthetic-null',values:{productCode:'SYNTHETIC-NULL',name:'SYNTHETIC no scheme',categoryId:f.categoryId,supplierId:f.supplierId,seasonIds:[f.seasonId],sizeGroupId:f.sizeGroupId,year:2026,systemItemCode:'1234567',thickness:null,collarPantsType:null,defaultBarcodeSchemeId:null,enabled:true,prices:Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,null]))},skus:[],barcodes:[],skuSelection:{colorIds:[f.colorId],fitIds:[f.fitId]}});
 assert.equal(c.values.defaultBarcodeSchemeId,null);
});
test('synthetic fixture compiles a complete 202-size atomic group',()=>{
 const f=buildMultisizeSyntheticProgram({protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'1234567890123456789',database_oid:'12345',database_name:'synthetic_document_test',catalog_sha256:'0'.repeat(64)},202);
 assert.equal(f.sizeIds.length,202);assert.equal(new Set(f.sizeIds).size,202);
});
