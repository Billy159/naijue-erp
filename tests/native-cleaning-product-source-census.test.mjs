import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectProductSourceRows,readProductSourceCensus} from '../scripts/import-v3/native-cleaning/product-source-census.mjs';
import {parseLegacyJsonText} from '../scripts/import-v3/native-cleaning/legacy-json.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const product=id=>({id,category_id:null,fit_id:null,counterparty_id:null});
const fixture=()=>({products:[product('source-p')],overlays:[],profiles:[],batches:[{batch_id:'one',status:'COMMITTED'}],
  sources:[{batch_id:'one',source_id:'original-p',product_id:'source-p',source_payload:{minimumPrice:'123.4500'}}]});

test('exact visible membership and source NULL facts are separate from target validity',()=>{
  const x=fixture();x.products.push(product('deleted-p'));
  x.overlays.push({id:'deleted-p',deleted:true,body:{}},{id:'new-p',deleted:false,body:{minimumPrice:null}});
  x.profiles.push({product_id:'deleted-p',body:{}},{product_id:'missing-p',body:{}});
  const r=inspectProductSourceRows(x);
  assert.deepEqual(r.membership,{total:2,source:1,overlayOnly:1,deletedPhysicalOverlays:1});
  assert.deepEqual(r.profiles,{unknownPhysicalProduct:1,notVisible:2});
  assert.equal(r.rawSourceProductNullReferences.category_id,2);
  assert.equal(r.minimumPrice.exactTwoDecimalOrLess,1);assert.equal(r.minimumPrice.null,1);
  assert.equal(r.targetWrites,0);assert.equal(r.identityAllocation,0);
  assert.equal(r.independentTargetReadbackVerified,false);
  assert.equal(JSON.stringify(r).includes('source-p'),false);
});
test('lossless number tokens preserve nonzero extra precision and explicit upper NULL stops',()=>{
  const x=fixture();x.sources[0].source_payload=parseLegacyJsonText('{"minimumPrice":9007199254740993.001}');
  assert.equal(inspectProductSourceRows(x).minimumPrice.nonzeroExtraPrecision,1);
  x.profiles=[{product_id:'source-p',body:{minimumPrice:null}}];
  assert.equal(inspectProductSourceRows(x).minimumPrice.null,1);
  x.profiles[0].body={minimumPrice:true};
  assert.equal(inspectProductSourceRows(x).minimumPrice.invalidSelectedType,1);
  x.profiles[0].body={minimumPrice:'-10000000000000000.00'};
  const r=inspectProductSourceRows(x);assert.equal(r.minimumPrice.negativeValues,1);assert.equal(r.minimumPrice.targetPrecisionOverflow,1);
});
test('multiple committed batches and duplicate source product associations are not guessed',()=>{
  const x=fixture();x.batches.push({batch_id:'two',status:'COMMITTED'});
  assert.equal(inspectProductSourceRows(x).minimumPrice.unresolvedBatch,1);
  x.profiles=[{product_id:'source-p',body:{minimumPrice:'0'}}];
  assert.equal(inspectProductSourceRows(x).minimumPrice.exactTwoDecimalOrLess,1);
  x.profiles=[];x.batches.pop();x.sources.push({...x.sources[0],source_id:'other-original'});
  const r=inspectProductSourceRows(x);assert.equal(r.selectedSource.ambiguousProducts,1);assert.equal(r.minimumPrice.ambiguousSource,1);
});
test('selected decimal text needs explicit interpretation; no rounding or filling blank',()=>{
  for (const value of ['','1e3',' 3.00','01.00']) {
    const x=fixture();x.sources[0].source_payload={minimumPrice:value};
    assert.equal(inspectProductSourceRows(x).minimumPrice.unsupportedDecimalText,1);
  }
  const x=fixture();x.products[0]={id:'source-p'};
  assert.throws(()=>inspectProductSourceRows(x),/SOURCE_COLUMN_MISSING/);
  const y=fixture();y.products.push(product('source-p'));
  assert.throws(()=>inspectProductSourceRows(y),/SOURCE_ID_REFUSED/);
});

async function files() {
  const directory=join(await mkdtemp(join(tmpdir(),'erp-synthetic-product-census-')),'snapshot');await mkdir(directory,{mode:0o700});
  const x=fixture(),names={products:'erp_prod_source.product',overlays:'erp_prod_runtime.product_overlay',profiles:'erp_prod_runtime.product_profile_overlay',batches:'erp_prod_source.tplus_import_run',sources:'erp_prod_source.tplus_product_source'};
  const entries=[];
  for (const [kind,table] of Object.entries(names)) {
    const bytes=Buffer.from(x[kind].map(row=>JSON.stringify({source_key_json:JSON.stringify([row.id??row.product_id??row.batch_id]),raw_json:JSON.stringify(row)})+'\n').join(''));
    const filename=`${table}.ndjson`;await writeFile(join(directory,filename),bytes,{mode:0o600});
    entries.push({table,filename,rows:String(x[kind].length),bytes:bytes.length,sha256:sha(bytes)});
  }
  // The scoped consumer is not the full93 verifier; unused descriptors are not
  // consumed or certified by it. Caller must adopt the separate full proof.
  const manifest={status:'COMPLETE_SCOPED_PRIVATE_SNAPSHOT',files:[...entries,...Array.from({length:88},(_,i)=>({table:`synthetic-unused-${i}`}))]};
  const bytes=Buffer.from(JSON.stringify(manifest));await writeFile(join(directory,'SNAPSHOT.json'),bytes,{mode:0o600});
  return {directory,expectedManifestSha256:sha(bytes),expectedUid:process.getuid()};
}
test('private5file consumer binds manifest and consumed bytes; returns aggregate only',async()=>{
  const f=await files(),r=await readProductSourceCensus(f);
  assert.equal(r.referenceFilesConsumed,5);assert.equal(r.databaseConnections,0);assert.equal(r.membership.total,1);
  assert.equal(r.minimumPrice.exactTwoDecimalOrLess,1);
  await assert.rejects(readProductSourceCensus({...f,expectedManifestSha256:'a'.repeat(64)}),/MANIFEST_PIN_REFUSED/);
  const p=join(f.directory,'erp_prod_source.product.ndjson'),bytes=await readFile(p);bytes[8]^=1;await writeFile(p,bytes);
  await assert.rejects(readProductSourceCensus(f),/FILE_DIGEST_REFUSED/);
});
test('private consumer rejects exposed source files and cancellation',async()=>{
  const f=await files();await chmod(join(f.directory,'erp_prod_source.product.ndjson'),0o644);
  await assert.rejects(readProductSourceCensus(f),/PRIVATE_FILE_REFUSED/);
  const abort=new AbortController();abort.abort();
  await assert.rejects(readProductSourceCensus({...f,signal:abort.signal}),{name:'AbortError'});
});
