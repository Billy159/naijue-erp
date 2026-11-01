import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentSourceCensus,readDocumentSourceCensus} from '../scripts/import-v3/native-cleaning/document-source-census.mjs';
const envelope=(id,n,row)=>({source_document_id:id,source_revision:String(n),raw_json:JSON.stringify(row)});
const head=(c,id='d',n=1,extra={})=>c.document(envelope(id,n,{id,current_revision:n,document_type:'SALE',status:'DRAFT',baseline_was_included:false,current_effect_active:false,...extra}));
const rev=(c,n,body,extra={})=>c.revision(envelope('d',n,{document_id:'d',revision:n,original_imported:true,body,...extra}));

test('select exact current pointer without choosing last or highest revision',()=>{
 const c=createDocumentSourceCensus();head(c,'d',2,{status:'DELETED',baseline_was_included:true});
 rev(c,2,{header:{},lines:[{sku_id:'private-sku',source_quantity:'-2.0000'}],fundsRecords:[]});
 rev(c,3,{header:{},lines:[{source_quantity:'not current'}]});
 const r=c.finish();assert.equal(r.currentRevisions,1);assert.equal(r.unselectedRevisions,1);
 assert.equal(r.states.DELETED,1);assert.equal(r.states.VOID,0);assert.equal(r.baselineIncluded,1);
 assert.equal(r.lines.quantityNegative,1);assert.equal(r.lines.quantityInvalid,0);assert.equal(r.targetWrites,0);
 assert.equal(JSON.stringify(r).includes('private-sku'),false);
});
test('quantity retains exact decimal and distinguishes NULL, missing, zero and target incompatibility',()=>{
 const c=createDocumentSourceCensus();head(c);
 rev(c,1,{header:{},fundsRecords:[],lines:[{}, {source_quantity:null},{source_quantity:true},
  {source_quantity:'0.0000'},{source_quantity:'1.0001'},{source_quantity:'9223372036854775808'},
  {source_quantity:'-9223372036854775809'},{source_quantity:'1e2'},{source_quantity:123.25}]});
 const r=c.finish().lines;
 assert.equal(r.quantityMissing,1);assert.equal(r.quantityNull,1);assert.equal(r.quantityInvalid,2);
 assert.equal(r.quantityZero,1);assert.equal(r.quantityNonInteger,2);assert.equal(r.quantityInteger,3);
 assert.equal(r.quantityOutsideTargetBigint,2);assert.equal(r.quantityNegative,1);
});
test('unknown status and body shapes are counted rather than coerced to target states or empty arrays',()=>{
 const c=createDocumentSourceCensus();head(c,'d',1,{status:'private-unknown',document_type:'private-type',current_effect_active:null});rev(c,1,null);
 const r=c.finish();assert.equal(r.states.OTHER,1);assert.equal(r.types.OTHER,1);assert.equal(r.body.other,1);
 assert.equal(r.body.linesArray,0);assert.equal(r.unknownActiveEffectFlag,1);assert.equal(JSON.stringify(r).includes('private-unknown'),false);
});
test('reject missing current, duplicate revisions and mismatched envelope identity',()=>{
 const a=createDocumentSourceCensus();head(a,'d',2);rev(a,1,{});assert.throws(()=>a.finish(),/CURRENT_REVISION_MISSING/);
 const b=createDocumentSourceCensus();head(b);rev(b,1,{});assert.throws(()=>rev(b,1,{}),/DUPLICATE_REVISION/);
 const d=createDocumentSourceCensus();assert.throws(()=>d.document(envelope('other',1,{id:'d',current_revision:1})),/HEADER_IDENTITY/);
 const e=createDocumentSourceCensus();head(e);assert.throws(()=>e.revision(envelope('d',1,{document_id:'other',revision:1,original_imported:true,body:{}})),/REVISION_IDENTITY/);
});
test('actual private file reader verifies both files before returning aggregate census',async()=>{
 const {mkdtemp,mkdir,writeFile}=await import('node:fs/promises');const {join}=await import('node:path');
 const {tmpdir}=await import('node:os');const {createHash}=await import('node:crypto');
 const directory=join(await mkdtemp(join(tmpdir(),'erp-synthetic-document-census-')),'snapshot');await mkdir(directory,{mode:0o700});
 const rows=[envelope('d',1,{id:'d',current_revision:1,document_type:'TRANSFER',status:'APPROVED',baseline_was_included:true,current_effect_active:true}),
  envelope('d',1,{document_id:'d',revision:1,original_imported:false,body:{header:{},lines:[{sku_id:'s',source_quantity:'2'}],fundsRecords:[]}})];
 const hash=x=>createHash('sha256').update(x).digest('hex'),files=[];
 for(const [i,table] of ['erp_prod_runtime.document','erp_prod_runtime.revision'].entries()){
  const bytes=Buffer.from(JSON.stringify(rows[i])+'\n'),filename=table+'.ndjson';await writeFile(join(directory,filename),bytes,{mode:0o600});
  files.push({table,filename,rows:'1',bytes:bytes.length,sha256:hash(bytes)});
 }
 const manifest=Buffer.from(JSON.stringify({status:'COMPLETE_SCOPED_PRIVATE_SNAPSHOT',files:[...files,...Array.from({length:91},(_,i)=>({table:'unused-'+i}))]}));
 await writeFile(join(directory,'SNAPSHOT.json'),manifest,{mode:0o600});
 const options={directory,expectedManifestSha256:hash(manifest),expectedUid:process.getuid()};
 const r=await readDocumentSourceCensus(options);assert.equal(r.sourceRows,'2');assert.equal(r.types.TRANSFER,1);assert.equal(r.currentRuntime,1);assert.equal(r.lines.quantityInteger,1);
 await writeFile(join(directory,files[1].filename),'');await assert.rejects(readDocumentSourceCensus(options),/FILE_PROTECTION_REFUSED/);
});
