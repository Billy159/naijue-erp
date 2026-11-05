import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,open,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {TABLE_SCHEMAS,sha256,registryTargetId} from '../packages/application/src/unified-import-contract.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {createSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('273948 valid transfer lines complete full offline validation with bounded heap',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'stream-scale-'));const root=join(parent,'package');await mkdir(root);const count=273948;
 try{
  async function emit(name,n,make){const h=await open(join(root,name),'wx',0o600),digest=createHash('sha256');let size=0,buf='';try{for(let i=1;i<=n;i++){buf+=JSON.stringify(make(i))+'\n';if(i%128===0||i===n){digest.update(buf);size+=Buffer.byteLength(buf);await h.write(buf);buf='';}}}finally{await h.close();}return {relative_path:name,bytes:size,row_count:n,sha256:digest.digest('hex')};}
  const pkg=createSyntheticPackage(),base=pkg.records.transfer_line[0],namespace=pkg.manifest.source_namespace;
  for(const [path,bytes] of Object.entries(pkg.artifacts)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),bytes);}
  const originalRegistry=pkg.registry.filter(r=>r.entity_type!=='TRANSFER_LINE');
  const key=i=>'scale-line:'+i,target=i=>registryTargetId(namespace,'TRANSFER_LINE',key(i));
  await rm(join(root,'identity-registry.jsonl'));await rm(join(root,'transfer_line.jsonl'));
  const registry=await emit('identity-registry.jsonl',originalRegistry.length+count,n=>n<=originalRegistry.length?originalRegistry[n-1]:{entity_type:'TRANSFER_LINE',source_namespace:namespace,canonical_source_key:key(n-originalRegistry.length),target_id:target(n-originalRegistry.length),aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:base.source_refs});
  const lines=await emit('transfer_line.jsonl',count,i=>({source_key:key(i),source_refs:base.source_refs,fields:{...base.fields,id:target(i),line_no:i,quantity:base.fields.quantity}}));
  pkg.manifest.identity_registry=registry;pkg.manifest.inventory_source.warehouse_registry_sha256=registry.sha256;pkg.manifest.inventory_source.sku_registry_sha256=registry.sha256;
  Object.assign(pkg.manifest.files.find(p=>p.table==='transfer_line'),lines);
  pkg.reports['reconciliation.json'].tables.transfer_line={source_rows:count,retained_rows:count,rejected_rows:0};
  const reportBytes=JSON.stringify(pkg.reports['reconciliation.json'])+'\n';await writeFile(join(root,'reconciliation.json'),reportBytes);
  Object.assign(pkg.manifest.reports.find(p=>p.role==='RECONCILIATION'),{bytes:Buffer.byteLength(reportBytes),sha256:sha256(reportBytes)});
  const manifest=JSON.stringify(pkg.manifest);await writeFile(join(root,'manifest.json'),manifest);
  const result=await streamPreflight(root,join(root,'..','report'),{expectedManifestSha256:sha256(manifest),allowSynthetic:true});
  assert.equal(result.counts.transfer_line,count);assert.equal(result.issue_count,0);assert.equal(result.checks_passed,true);assert.equal(result.complete_package_validation,true);assert.equal(result.import_eligible,false);
  const {readFile}=await import('node:fs/promises');const issues=(await readFile(join(root,'../report/issues.jsonl'),'utf8')).trim();
  assert.equal(issues,'');
  console.log(JSON.stringify({synthetic_rows:count,bytes:result.bytes_scanned,peak_rss_bytes:result.peak_rss_bytes,heap_limit_note:'run with --max-old-space-size=128; RSS includes native SQLite and buffers'}));
 }finally{await rm(parent,{recursive:true,force:true});}
});
