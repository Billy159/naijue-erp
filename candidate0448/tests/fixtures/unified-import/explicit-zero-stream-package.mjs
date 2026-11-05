/** Fabricated scale package only. No business source or credentials are read. */
import {mkdir,open,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createSyntheticPackage} from './synthetic-package.ts';
import {sha256,registryTargetId} from '../../../packages/application/src/unified-import-contract.ts';
import {readExplicitZeroApproval,iterateExplicitZeroRecords} from '../../../packages/application/src/unified-explicit-zero-approval.ts';
export async function writeExplicitZeroStreamPackage(root,count){
 const p=createSyntheticPackage(),m=p.manifest,source=m.inventory_source.source_file_sha256,sku=p.records.sku[0].fields.id,warehouses=new Set();
 await mkdir(root,{recursive:true});
 const key=i=>'synthetic-zero-warehouse:'+i,id=i=>registryTargetId(m.source_namespace,'WAREHOUSE',key(i));
 let approvalText='';for(let i=1;i<=count;i++){const warehouse=id(i);warehouses.add(warehouse);approvalText+=JSON.stringify({format_version:'EXPLICIT_ZERO_APPROVAL_V1',source_namespace:m.source_namespace,inventory_file_sha256:source,cutoff_at:m.inventory_source.cutoff_at,source_key:'synthetic-zero:'+i,warehouse_id:warehouse,sku_id:sku,quantity:'0',decision:'CONFIRMED_ABSENT_IS_ZERO'})+'\n'}
 const approvalBytes=Buffer.from(approvalText),approvalSha256=sha256(approvalBytes);approvalText='';
 const approval=readExplicitZeroApproval({bytes:approvalBytes,trustedSha256:approvalSha256,sourceNamespace:m.source_namespace,inventoryFileSha256:source,cutoffAt:m.inventory_source.cutoff_at});
 const approvalPath=join(dirname(root),'explicit-zero-approved.jsonl');await writeFile(approvalPath,approvalBytes,{flag:'wx',mode:0o600});
 m.source_files.push({relative_path:'sources/explicit-zero-approved.jsonl',bytes:approvalBytes.length,sha256:approvalSha256});
 for(const [name,bytes] of Object.entries(p.artifacts)){if(['identity-registry.jsonl','warehouse.jsonl','inventory_baseline.jsonl','reconciliation.json'].includes(name))continue;await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),bytes)}
 async function emit(name,rows){const f=await open(join(root,name),'wx',0o600),hash=createHash('sha256');let buffer='',bytes=0,row_count=0;async function flush(){if(!buffer)return;const b=Buffer.from(buffer);bytes+=b.length;hash.update(b);await f.writeFile(b);buffer=''}try{for(const row of rows){buffer+=JSON.stringify(row)+'\n';row_count++;if(buffer.length>=262144)await flush()}await flush()}finally{await f.close()}return{relative_path:name,bytes,row_count,sha256:hash.digest('hex')}}
 const ref=i=>[{file_sha256:source,sheet:'SYNTHETIC_ZERO_WAREHOUSE',row:i}];
 const registry=await emit('identity-registry.jsonl',(function*(){yield* p.registry;for(let i=1;i<=count;i++)yield{entity_type:'WAREHOUSE',source_namespace:m.source_namespace,canonical_source_key:key(i),target_id:id(i),aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:ref(i)}})());
 m.identity_registry=registry;m.inventory_source.warehouse_registry_sha256=registry.sha256;m.inventory_source.sku_registry_sha256=registry.sha256;
 const wh=await emit('warehouse.jsonl',(function*(){yield* p.records.warehouse;for(let i=1;i<=count;i++)yield{source_key:key(i),fields:{...p.records.warehouse[0].fields,id:id(i),name:'SYNTHETIC ZERO WAREHOUSE '+i},source_refs:ref(i)}})());
 const baseline=await emit('inventory_baseline.jsonl',(function*(){yield* p.records.inventory_baseline;yield* iterateExplicitZeroRecords(approval,warehouses,new Set([sku]),new Set())})());
 Object.assign(m.files.find(x=>x.table==='warehouse'),wh);Object.assign(m.files.find(x=>x.table==='inventory_baseline'),baseline);
 for(const [table,n] of [['warehouse',count+2],['inventory_baseline',count+2]])p.reports['reconciliation.json'].tables[table]={source_rows:n,retained_rows:n,rejected_rows:0};
 const rb=Buffer.from(JSON.stringify(p.reports['reconciliation.json'])+'\n');await writeFile(join(root,'reconciliation.json'),rb);Object.assign(m.reports.find(x=>x.role==='RECONCILIATION'),{bytes:rb.length,sha256:sha256(rb)});
 const bytes=Buffer.from(JSON.stringify(m)+'\n');await writeFile(join(root,'manifest.json'),bytes);
 return{manifest:bytes,manifestSha256:sha256(bytes),approval,approvalPath,approvalSha256,approvalBytes:approvalBytes.length,baselineBytes:baseline.bytes,baselineCount:baseline.row_count};
}
