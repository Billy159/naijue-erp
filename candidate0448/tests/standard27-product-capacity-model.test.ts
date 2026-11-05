import test from 'node:test'; import assert from 'node:assert/strict';
import { modelStandard27ProductCapacity } from '../packages/application/src/standard27-product-capacity-model.ts';
const product='p1',base=()=>({ productId:product, baseline:{kind:'PUBLISHED_STANDARD_PRODUCT' as const, product:{id:product,version:1,name:'original'}, skus:[{id:'s1',product_id:product,enabled:true}],barcodes:[{id:'b1',sku_id:'s1',barcode:'0001',enabled:true}],images:[]},
  chain:[{receipt:{status:'COMMITTED',target_type:'PRODUCT',target_id:product,id:'op1',action:'EDIT',actor_account_id:'actor',request_hash:'a'.repeat(64),completed_at:'2026-11-03T00:00:00Z'},audit:{operation_id:'op1',actor_account_id:'actor',occurred_at:'2026-11-03T00:00:00Z',object_type:'PRODUCT',object_id:product,action:'EDIT',old_version:1,new_version:2,before_values:{name:'original'},after_values:{name:'edited'}}}],
  actual:{product:{id:product,version:2,name:'edited'},skus:[{id:'s1',product_id:product,enabled:true}],barcodes:[{id:'b1',sku_id:'s1',barcode:'0001',enabled:true}],images:[]} });
test('standard27 local model reconstructs exact root and protected SKU/barcode identity from published baseline plus receipt/audit chain',()=>{const p=base();assert.deepEqual(modelStandard27ProductCapacity(p),{version:2,count:1,bytes:Buffer.byteLength(JSON.stringify([p.chain[0]!.audit.before_values,p.chain[0]!.audit.after_values]))});});
test('tampered receipt, broken version, changed native binding and unrelated product all fail closed',()=>{
 for(const mutate of [(p:any)=>p.chain[0].receipt.status='FAILED',(p:any)=>p.chain[0].audit.old_version=2,(p:any)=>p.actual.barcodes[0].sku_id='s2',(p:any)=>p.actual.skus[0].product_id='p2',(p:any)=>p.actual.product.name='spoof']){const p=base();mutate(p);assert.throws(()=>modelStandard27ProductCapacity(p));}
});
test('SKU and barcode changes must carry exact before facts; native binding never changes',()=>{
 const p:any=base(), sku=p.actual.skus[0]!, barcode=p.actual.barcodes[0]!;
 p.chain[0]!.audit.before_values={name:'original',skus:[sku],barcodes:[barcode]};
 p.chain[0]!.audit.after_values={name:'edited',skus:[{...sku,enabled:false,version:2}],barcodes:[{...barcode,enabled:false}]};
 p.baseline.skus[0]!.version=1; p.actual.skus[0]={...sku,version:2,enabled:false};p.actual.barcodes[0]={...barcode,enabled:false};
 p.chain[0]!.audit.before_values.skus=[p.baseline.skus[0]];p.chain[0]!.audit.after_values.skus=[p.actual.skus[0]];
 assert.equal(modelStandard27ProductCapacity(p).version,2);
 (p.chain[0]!.audit.after_values.barcodes as any[])[0].barcode='different';assert.throws(()=>modelStandard27ProductCapacity(p));
});
test('negative: mismatched explicit version, cross-product image and repeated operation are rejected',()=>{
 const badVersion:any=base(); badVersion.chain[0]!.audit.after_values.version=999; assert.throws(()=>modelStandard27ProductCapacity(badVersion));
 const badImage:any=base(); badImage.chain[0]!.audit.after_values.images=[{id:'i1',product_id:'foreign',version:1}];badImage.actual.images=[{id:'i1',product_id:'foreign',version:1}];assert.throws(()=>modelStandard27ProductCapacity(badImage));
 const duplicate:any=base(); duplicate.chain.push({receipt:{...duplicate.chain[0]!.receipt},audit:{...duplicate.chain[0]!.audit,old_version:2,new_version:3,before_values:{name:'edited'},after_values:{name:'again'}}}); duplicate.actual.product.version=3;duplicate.actual.product.name='again';assert.throws(()=>modelStandard27ProductCapacity(duplicate));
});
test('negative: invalid historical baseline cannot be laundered through later child removal',()=>{
 const p:any=base();const foreign={id:'i1',product_id:'foreign',version:1};p.baseline.images=[foreign];p.chain[0].audit.before_values.images=[foreign];p.chain[0].audit.after_values.images=[];
 assert.throws(()=>modelStandard27ProductCapacity(p));
});
test('negative: root audit cannot introduce fields absent from original product schema',()=>{
 const p:any=base();p.chain[0].audit.before_values.invented=undefined;p.chain[0].audit.after_values.invented='x';p.actual.product.invented='x';assert.throws(()=>modelStandard27ProductCapacity(p));
});
test('valid disabled/restored product root chain is retained without changing SKU identities',()=>{
 const p:any=base();p.baseline.product.enabled=true;p.baseline.product.deleted_at=null;p.actual.product.enabled=true;p.actual.product.deleted_at=null;p.actual.product.version=4;
 const prev=p.chain[0];p.chain=[prev,{receipt:{...prev.receipt,id:'disable',action:'DISABLE'},audit:{...prev.audit,operation_id:'disable',action:'DISABLE',old_version:2,new_version:3,before_values:{enabled:true,version:2},after_values:{enabled:false,version:3}}},{receipt:{...prev.receipt,id:'restore',action:'RESTORE'},audit:{...prev.audit,operation_id:'restore',action:'RESTORE',old_version:3,new_version:4,before_values:{enabled:false,version:3},after_values:{enabled:true,version:4}}}];
 assert.equal(modelStandard27ProductCapacity(p).version,4);
 const bad=structuredClone(p);bad.chain[1].audit.before_values.enabled=false;assert.throws(()=>modelStandard27ProductCapacity(bad));
});
test('a new product needs exact CREATE receipt/audit before its subsequent original chain',async()=>{
 const {modelStandard27CreatedProductCapacity}=await import('../packages/application/src/standard27-product-capacity-model.ts');
 const p:any=base();p.baseline.product.deleted_at=null;p.actual.product.deleted_at=null;const op='create-op', created={receipt:{status:'COMMITTED',target_type:'PRODUCT',target_id:'p1',id:op,action:'CREATE',actor_account_id:'actor',request_hash:'a'.repeat(64),completed_at:'2026-11-03T00:00:00Z'},audit:{operation_id:op,object_type:'PRODUCT',object_id:'p1',action:'CREATE',actor_account_id:'actor',occurred_at:'2026-11-03T00:00:00Z',old_version:null,new_version:1,before_values:null,after_values:{...p.baseline.product,skus:[],barcodes:[],images:[]}}};
 p.baseline.skus=[];p.baseline.barcodes=[];p.actual.skus=[];p.actual.barcodes=[];
 assert.equal(modelStandard27CreatedProductCapacity({productId:'p1',create:created,chain:p.chain,actual:p.actual}).version,2);
 const bad=structuredClone(created);bad.audit.after_values.id='other';assert.throws(()=>modelStandard27CreatedProductCapacity({productId:'p1',create:bad,chain:p.chain,actual:p.actual}));
});
test('CREATE cannot start deleted or attach an image predating its creation receipt',async()=>{
 const {modelStandard27CreatedProductCapacity}=await import('../packages/application/src/standard27-product-capacity-model.ts');
 const product:any={id:'p1',version:1,name:'new',deleted_at:null}, receipt={status:'COMMITTED',target_type:'PRODUCT',target_id:'p1',id:'create',action:'CREATE',actor_account_id:'actor',request_hash:'a'.repeat(64),completed_at:'2026-11-03T00:00:00Z'};
 const audit:any={operation_id:'create',object_type:'PRODUCT',object_id:'p1',action:'CREATE',actor_account_id:'actor',occurred_at:receipt.completed_at,old_version:null,new_version:1,before_values:null,after_values:{...product,skus:[],barcodes:[],images:[]}};
 const deleted=structuredClone(audit);deleted.after_values.deleted_at='2020-01-01T00:00:00Z';assert.throws(()=>modelStandard27CreatedProductCapacity({productId:'p1',create:{receipt,audit:deleted},chain:[],actual:{product:{...product,deleted_at:deleted.after_values.deleted_at},skus:[],barcodes:[],images:[]}}));
 const stale=structuredClone(audit), image={id:'i',product_id:'p1',version:1,created_by_account_id:'actor',created_at:'1900-01-01T00:00:00Z'};stale.after_values.images=[image];assert.throws(()=>modelStandard27CreatedProductCapacity({productId:'p1',create:{receipt,audit:stale},chain:[],actual:{product,skus:[],barcodes:[],images:[image]}}));
});
test('CREATE image times without an explicit offset cannot prove receipt identity',async()=>{
 const {modelStandard27CreatedProductCapacity}=await import('../packages/application/src/standard27-product-capacity-model.ts'); const time='2026-11-03T00:00:00',product={id:'p1',version:1,deleted_at:null};
 const receipt={status:'COMMITTED',target_type:'PRODUCT',target_id:'p1',id:'op',action:'CREATE',actor_account_id:'actor',request_hash:'a'.repeat(64),completed_at:time};
 const image={id:'i',product_id:'p1',version:1,created_by_account_id:'actor',created_at:time};
 const audit={operation_id:'op',object_type:'PRODUCT',object_id:'p1',action:'CREATE',actor_account_id:'actor',occurred_at:time,old_version:null,new_version:1,before_values:null,after_values:{...product,images:[image]}};
 assert.throws(()=>modelStandard27CreatedProductCapacity({productId:'p1',create:{receipt,audit},chain:[],actual:{product,skus:[],barcodes:[],images:[image]}}));
});
test('equivalent receipt and audit instants do not require identical timezone spelling',()=>{
 const p:any=base();p.chain[0].receipt.completed_at='2026-11-03T08:00:00.000000+08:00';p.chain[0].audit.occurred_at='2026-11-03T00:00:00Z';assert.equal(modelStandard27ProductCapacity(p).version,2);
});
test('real audit_change has no request_hash column; receipt hash cannot be fabricated as audit evidence',()=>{
 const p:any=base();delete p.chain[0].audit.request_hash;assert.equal(modelStandard27ProductCapacity(p).version,2);
});
test('receipt hash must be an actual string, never coercible arrays or objects',()=>{
 let coerced=0;for(const hash of [['a'.repeat(64)],{toString(){coerced++;return 'a'.repeat(64)}}]){const p:any=base();p.chain[0].receipt.request_hash=hash;assert.throws(()=>modelStandard27ProductCapacity(p));}assert.equal(coerced,0);
});
