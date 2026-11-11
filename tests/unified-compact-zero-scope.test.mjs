import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readdir,symlink} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {readExplicitZeroScopeApproval,isInventoryBaselineScope,hasInventoryApprovalDescriptor,inventoryBaselineScopeContains,explicitZeroApprovalCount,explicitZeroApprovalDescriptor,explicitZeroApprovalWire,iterateExplicitZeroRecords,explicitZeroApproved,explicitZeroScopeCounts,explicitZeroScopeRecordValid,explicitZeroScopeMembersMatch,closeExplicitZeroApproval,isExplicitZeroApprovalDescriptor} from '../packages/application/src/unified-explicit-zero-approval.ts';
const hash=b=>createHash('sha256').update(b).digest('hex');
const id=(kind,n)=>`${kind}0000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const ns='SYNTHETIC_COMPACT_ZERO',source='a'.repeat(64),cutoff='2026-11-11T00:00:00+08:00';
async function fixture({warehouses=2,skus=4,explicit,mask}={}){
 const dir=await mkdtemp(join(tmpdir(),'compact-zero-test-')),w=Array.from({length:warehouses},(_,i)=>({id:id(1,i+1)})),s=Array.from({length:skus},(_,i)=>({id:id(2,i+1)}));
 explicit??=[{warehouse_id:w[0].id,sku_id:s[0].id,quantity:'12'},{warehouse_id:w[0].id,sku_id:s[1].id,quantity:'-3'},{warehouse_id:w[1].id,sku_id:s[0].id,quantity:'0'}];
 mask??=[{warehouse_id:w[0].id,sku_id:s[1].id},{warehouse_id:w[1].id,sku_id:s[1].id}];
 const members=[...w.map(r=>({entity_type:'WAREHOUSE',source_namespace:ns,target_id:r.id})),...s.map(r=>({entity_type:'SKU',source_namespace:ns,target_id:r.id}))];
 async function pin(name,rows){const bytes=Buffer.from(rows.map(r=>JSON.stringify(r)+'\n').join(''));await writeFile(join(dir,name),bytes);return {relative_path:name,sha256:hash(bytes),row_count:rows.length,records_sha256:hash(bytes)};}
 const registry=await pin('registry.jsonl',members),identity_registry={relative_path:registry.relative_path,sha256:registry.sha256,row_count:registry.row_count};
 const core={source_namespace:ns,batch_key:'synthetic-current',inventory_file_sha256:source,cutoff_at:cutoff,identity_registry,warehouses:await pin('warehouses.jsonl',w),skus:await pin('skus.jsonl',s),explicit_values:await pin('explicit.jsonl',explicit),unknown_mask:await pin('unknown.jsonl',mask)};
 const original=await pin('input-manifest.json',[{format_version:'EXPLICIT_ZERO_SCOPE_INPUT_V2',...core}]);
 const overlaps=explicit.filter(e=>mask.some(u=>u.warehouse_id===e.warehouse_id&&u.sku_id===e.sku_id)).length;
 const summary={format_version:'EXPLICIT_ZERO_SCOPE_APPROVAL_V2',...core,decision_ref:'SYNTHETIC_ONLY_NOT_BUSINESS_APPROVAL',input_manifest:{relative_path:original.relative_path,sha256:original.sha256},counts:{universe:w.length*s.length,explicit_confirmed:explicit.length-overlaps,zero:w.length*s.length-explicit.length-mask.length+overlaps,unknown:mask.length,explicit_unknown_overlap:overlaps}};
 const input=()=>{const bytes=Buffer.from(JSON.stringify(summary)+'\n');return {bytes,trustedSha256:hash(bytes),directory:dir,sourceNamespace:ns,inventoryFileSha256:source,cutoffAt:cutoff};};
 return {dir,w,s,members,summary,input,pin,async close(){await rm(dir,{recursive:true,force:true});}};
}
test('V2 partitions the entire domain; unknown takes precedence, locators refer to actual summary line 1',async()=>{
 const f=await fixture();let a;try{a=await readExplicitZeroScopeApproval(f.input());assert.equal(a.facts,undefined);assert.deepEqual(explicitZeroScopeCounts(a),{universe:8,explicit_confirmed:2,zero:4,unknown:2,explicit_unknown_overlap:1});
 const rows=[...iterateExplicitZeroRecords(a,new Set(f.w.map(r=>r.id)),new Set(f.s.map(r=>r.id)),new Set())];assert.equal(rows.length,4);assert.equal(explicitZeroApprovalCount(a),4);
 for(const [i,r]of rows.entries()){assert.equal(r.source_refs[0].row,1);assert.equal(r.explicit_zero_evidence.approval_row,i+1);assert.equal(explicitZeroApproved(a,ns,source,cutoff,r),true);assert.equal(explicitZeroScopeRecordValid(a,r),true);const bad=structuredClone(r);bad.source_refs[0].row=i+2;assert.equal(explicitZeroApproved(a,ns,source,cutoff,bad),false);}
 assert.equal(explicitZeroScopeMembersMatch(a,f.members),true);assert.equal(explicitZeroScopeMembersMatch(a,f.members.slice(1)),false);assert.equal(explicitZeroScopeMembersMatch(a,[...f.members,{entity_type:'SKU',target_id:id(2,999)}]),false);
 assert.equal(explicitZeroScopeRecordValid(a,{fields:{warehouse_id:f.w[0].id,sku_id:f.s[0].id,quantity:'12'},source_refs:[{file_sha256:source}]}),true);
 assert.equal(explicitZeroScopeRecordValid(a,{fields:{warehouse_id:f.w[0].id,sku_id:f.s[1].id,quantity:'-3'},source_refs:[{file_sha256:source}]}),false);
 assert.equal(explicitZeroScopeRecordValid(a,{fields:{warehouse_id:f.w[0].id,sku_id:f.s[0].id,quantity:'0'},source_refs:[{file_sha256:source}]}),false);
 assert.equal(isExplicitZeroApprovalDescriptor(explicitZeroApprovalDescriptor(a),ns,cutoff),false); // unresolved domain cannot enter a plan
 assert.equal(explicitZeroApproved(structuredClone(a),ns,source,cutoff,rows[0]),false);
 }finally{closeExplicitZeroApproval(a);await f.close();}assert.throws(()=>explicitZeroApprovalWire(a));
});
test('odd-node V2 proof, mutation, cutoff, scope and cross-approval transplants are rejected',async()=>{
 const f=await fixture({explicit:[],mask:[]});let a,b;try{a=await readExplicitZeroScopeApproval(f.input());const rows=[...iterateExplicitZeroRecords(a,new Set(f.w.map(r=>r.id)),new Set(f.s.map(r=>r.id)),new Set())];
 assert.equal(isExplicitZeroApprovalDescriptor(explicitZeroApprovalDescriptor(a),ns,cutoff),true);for(const change of [r=>r.explicit_zero_evidence.merkle_proof.pop(),r=>r.explicit_zero_evidence.approval_row=2,r=>r.fields.sku_id=id(2,999),r=>r.source_key='invented']){const bad=structuredClone(rows[0]);change(bad);assert.equal(explicitZeroApproved(a,ns,source,cutoff,bad),false);}
 f.summary.decision_ref='OTHER_SYNTHETIC_DECISION';b=await readExplicitZeroScopeApproval(f.input());assert.equal(explicitZeroApproved(b,ns,source,cutoff,rows[0]),false);
 await assert.rejects(readExplicitZeroScopeApproval({...f.input(),cutoffAt:'2026-11-12T00:00:00+08:00'}));await assert.rejects(readExplicitZeroScopeApproval({...f.input(),trustedSha256:'b'.repeat(64)}));
 }finally{closeExplicitZeroApproval(a);closeExplicitZeroApproval(b);await f.close();}
 const odd=await fixture({warehouses:1,skus:3,explicit:[],mask:[]});try{a=await readExplicitZeroScopeApproval(odd.input());const rows=[...iterateExplicitZeroRecords(a,new Set(odd.w.map(r=>r.id)),new Set(odd.s.map(r=>r.id)),new Set())];assert.equal(rows.at(-1).explicit_zero_evidence.merkle_proof.length,2);assert.ok(rows.every(r=>explicitZeroApproved(a,ns,source,cutoff,r)));}finally{closeExplicitZeroApproval(a);await odd.close();}
});
test('empty zero set emits no record or descriptor, and invalid file/member/partition is rejected with scratch cleanup',async()=>{
 const f=await fixture({warehouses:1,skus:1,explicit:[{warehouse_id:id(1,1),sku_id:id(2,1),quantity:'0'}],mask:[]});let a;try{a=await readExplicitZeroScopeApproval(f.input());assert.equal(explicitZeroApprovalCount(a),0);assert.deepEqual([...iterateExplicitZeroRecords(a,new Set([id(1,1)]),new Set([id(2,1)]),new Set())],[]);assert.throws(()=>explicitZeroApprovalDescriptor(a),/EMPTY_DESCRIPTOR/);
 const before=(await readdir(tmpdir())).filter(n=>n.startsWith('explicit-zero-v2-')).sort();f.summary.counts.zero=1;await assert.rejects(readExplicitZeroScopeApproval(f.input()),/PARTITION/);assert.deepEqual((await readdir(tmpdir())).filter(n=>n.startsWith('explicit-zero-v2-')).sort(),before);f.summary.counts.zero=0;
 await writeFile(join(f.dir,'warehouses.jsonl'),JSON.stringify({id:id(1,2)})+'\n');await assert.rejects(readExplicitZeroScopeApproval(f.input()),/FILE_CHANGED/);
 }finally{closeExplicitZeroApproval(a);await f.close();}
});
test('pinned evidence cannot escape its directory or follow a symlink',async()=>{
 const f=await fixture({explicit:[],mask:[]});try{await rm(join(f.dir,'warehouses.jsonl'));await symlink('skus.jsonl',join(f.dir,'warehouses.jsonl'));await assert.rejects(readExplicitZeroScopeApproval(f.input()),/SYMLINK/);f.summary.warehouses.relative_path='../outside.jsonl';await assert.rejects(readExplicitZeroScopeApproval(f.input()));}finally{await f.close();}
});

test('baseline scope emits no inferred rows or Merkle material and keeps exact signed per-warehouse quantities',async()=>{
 const f=await fixture({explicit:[{warehouse_id:id(1,1),sku_id:id(2,1),quantity:'9007199254740993'},{warehouse_id:id(1,1),sku_id:id(2,2),quantity:'-3'},{warehouse_id:id(1,2),sku_id:id(2,1),quantity:'0'}],mask:[]});let a;
 try{f.summary.format_version='INVENTORY_BASELINE_SCOPE_V1';a=await readExplicitZeroScopeApproval(f.input());const d=explicitZeroApprovalDescriptor(a);
  assert.equal(isInventoryBaselineScope(a),true);assert.equal(hasInventoryApprovalDescriptor(a),true);assert.equal(explicitZeroApprovalCount(a),0);
  assert.deepEqual([...iterateExplicitZeroRecords(a,new Set(f.w.map(r=>r.id)),new Set(f.s.map(r=>r.id)),new Set())],[]);
  assert.equal(d.format_version,'INVENTORY_BASELINE_SCOPE_V1');assert.equal(d.nonzero_count,2);assert.equal(d.explicit_values.count,3);assert.equal(d.universe_count,8);
  assert.deepEqual(d.warehouse_totals,[{warehouse_id:id(1,1),explicit_count:2,nonzero_count:2,quantity:'9007199254740990'},{warehouse_id:id(1,2),explicit_count:1,nonzero_count:0,quantity:'0'}]);
  assert.equal(Object.hasOwn(d,'merkle_root_sha256'),false);assert.equal(isExplicitZeroApprovalDescriptor(d,ns,cutoff),true);
  assert.equal(inventoryBaselineScopeContains(a,id(1,2),id(2,4)),true);assert.equal(inventoryBaselineScopeContains(a,id(1,99),id(2,4)),false);
  assert.equal(explicitZeroScopeRecordValid(a,{fields:{warehouse_id:id(1,1),sku_id:id(2,1),quantity:'9007199254740993'},source_refs:[{file_sha256:source}]}),true);
  assert.equal(explicitZeroScopeRecordValid(a,{fields:{warehouse_id:id(1,1),sku_id:id(2,1),quantity:'0'},source_refs:[{file_sha256:source}]}),false);
  assert.equal(isExplicitZeroApprovalDescriptor({...d,nonzero_count:3},ns,cutoff),false);
  assert.equal(explicitZeroApproved(a,ns,source,cutoff,{explicit_zero_evidence:{approval_row:1}}),false);
 }finally{closeExplicitZeroApproval(a);await f.close();}
});
test('an unresolved baseline scope is rejected, and empty explicit input still carries its complete domain without zero rows',async()=>{
 const bad=await fixture();try{bad.summary.format_version='INVENTORY_BASELINE_SCOPE_V1';await assert.rejects(readExplicitZeroScopeApproval(bad.input()),/UNRESOLVED/);}finally{await bad.close();}
 const f=await fixture({explicit:[],mask:[]});let a;try{f.summary.format_version='INVENTORY_BASELINE_SCOPE_V1';a=await readExplicitZeroScopeApproval(f.input());assert.equal(hasInventoryApprovalDescriptor(a),true);const d=explicitZeroApprovalDescriptor(a);assert.equal(d.explicit_values.count,0);assert.equal(d.nonzero_count,0);assert.equal(d.warehouse_totals.length,2);assert.equal(isExplicitZeroApprovalDescriptor(d,ns,cutoff),true);}finally{closeExplicitZeroApproval(a);await f.close();}
});
