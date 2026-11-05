import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {writeExplicitZeroStreamPackage} from './fixtures/unified-import/explicit-zero-stream-package.mjs';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
test('stream planner verifies private approval then clones only public planning options',async()=>{
 const d=await mkdtemp(join(tmpdir(),'private-token-plan-'));let plan;const original=globalThis.structuredClone;
 try{
  const p=await writeExplicitZeroStreamPackage(join(d,'input'),3),report=join(d,'report');
  const summary=await streamPreflight(join(d,'input'),report,{expectedManifestSha256:p.manifestSha256,allowSynthetic:true,explicitZeroApproval:p.approval});
  const options={allowSynthetic:true,explicitZeroApproval:p.approval,target:{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_profile',catalog_sha256:'a'.repeat(64)},initialization_identity:{staff_id:'10000000-0000-0000-0000-000000000001',account_id:'20000000-0000-0000-0000-000000000001',login_name:'synthetic-admin',staff_name:'SYNTHETIC admin'}};
  globalThis.structuredClone=value=>{if(value&&Object.hasOwn(value,'explicitZeroApproval'))throw Error('PRIVATE_APPROVAL_CLONE_PROHIBITED_BY_TEST');return original(value)};
  plan=await prepareStreamPlan(join(report,'index.sqlite'),summary,p.manifest,options);assert.equal(plan.common.explicit_zero_approval.record_count,3);
  await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),summary,p.manifest,{...options,explicitZeroApproval:original(p.approval)}),/EXPLICIT_ZERO_APPROVAL_UNVERIFIED/);
 }finally{globalThis.structuredClone=original;await plan?.dispose();await rm(d,{recursive:true,force:true})}
});
