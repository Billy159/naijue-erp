import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {buildSyntheticBaselineScopeSqlProgram,createSyntheticBaselineScopeInput,createSyntheticBaselineScopeApproval} from './fixtures/unified-import/baseline-scope-synthetic.ts';
import {closeExplicitZeroApproval,explicitZeroApprovalDescriptor} from '../packages/application/src/unified-explicit-zero-approval.ts';
import {validateUnifiedPackage} from '../packages/application/src/unified-import-contract.ts';import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
test('the original READY validation and streaming preflight accept exact scope without manufacturing historical endpoint zero rows',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baseline-preflight-')),input=createSyntheticBaselineScopeInput(null);let scope;
 try{scope=await createSyntheticBaselineScopeApproval(input.pkg,join(dir,'scope'));const options={allowSynthetic:true,historicalSalesHallApproval:input.historicalSalesHallApproval,historicalLineAmountEvidence:input.historicalLineAmountEvidence,explicitZeroApproval:scope};
  const full=validateUnifiedPackage(input.pkg,options);assert.equal(full.valid,true,JSON.stringify(full.issues));
  const pkg=join(dir,'package');await mkdir(pkg);for(const [path,bytes]of Object.entries(input.pkg.artifacts)){await mkdir(dirname(join(pkg,path)),{recursive:true});await writeFile(join(pkg,path),bytes);}await writeFile(join(pkg,'manifest.json'),input.manifestBytes);
  const result=await streamPreflight(pkg,join(dir,'report'),{...options,expectedManifestSha256:input.expectedManifestSha256});assert.equal(result.checks_passed,true,await readFile(join(dir,'report/issues.jsonl'),'utf8'));assert.equal(result.counts.inventory_baseline,2);assert.deepEqual(result.explicit_zero_approval,explicitZeroApprovalDescriptor(scope));
  assert.equal(result.explicit_zero_approval.format_version,'INVENTORY_BASELINE_SCOPE_V1');assert.equal(result.explicit_zero_approval.nonzero_count,2);assert.equal(result.explicit_zero_approval.warehouse_totals.reduce((n,r)=>n+BigInt(r.quantity),0n),93n);
  const without=validateUnifiedPackage(input.pkg,{...options,explicitZeroApproval:undefined});assert.equal(without.valid,false);assert.ok(without.issues.some(i=>i.code==='BASELINE_KEY_COVERAGE_UNKNOWN'));
 }finally{closeExplicitZeroApproval(scope);await rm(dir,{recursive:true,force:true});}
});

test('the single-target PG fixture uses the existing pure standard planner with two real nonzero keys and no host authority',async()=>{
 const f=await buildSyntheticBaselineScopeSqlProgram({protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456',database_oid:'42',database_name:'synthetic_source_only',catalog_sha256:'a'.repeat(64)},tmpdir());
 try{assert.equal(f.initialize.payload.mode,'NEW_EMPTY');assert.equal(f.initialize.payload.explicit_zero_approval.format_version,'INVENTORY_BASELINE_SCOPE_V1');assert.equal(f.initialize.payload.expected.INVENTORY_KEY,2);assert.equal(f.initialize.payload.expected.INVENTORY_EFFECT,2);assert.equal(f.initialize.payload.explicit_zero_approval.warehouses.count,3);assert.equal(f.initialize.payload.explicit_zero_approval.skus.count,1);assert.equal(f.expectedBaseline.total,'93');assert.equal(f.steps.filter(s=>s.method==='baselineKeys').flatMap(s=>s.request.payload.rows).filter(r=>r.fields.quantity==='0'||r.explicit_zero_evidence).length,0);assert.equal(Object.hasOwn(f,'ordinaryAdmission'),false);}finally{await f.dispose();}
});
