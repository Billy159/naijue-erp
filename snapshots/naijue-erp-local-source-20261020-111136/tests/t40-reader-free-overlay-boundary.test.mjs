import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {listMasterRecords} from '../server/security/master-data.ts';
import {SecurityRepository} from '../server/security/repository.ts';
import {SyntheticFundAccountReader, readSyntheticFundAccountConfig} from '../server/security/synthetic-fund-accounts.ts';

// Only a newly created, nonpayable synthetic profile is opened by this worker.
delete process.env.APPROVED_FUND_ACCOUNTS_FILE;
delete process.env.APPROVED_PARTY_ROLES_FILE;
const database={environment:'qa',database:'demo_8877_f01_f02_unit',instanceId:'11111111-1111-4111-8111-111111111111',clusterId:'12345',
  schemas:{source:'synthetic_source',runtime:'synthetic_runtime',auth:'synthetic_auth',control:'synthetic_control'},
  roles:{app:'synthetic_app'},host:'/no-postgres-used',port:55490,user:'synthetic_app',sslmode:'disable'};
const fundId='44444444-4444-4444-8444-444444444444',methodId='55555555-5555-4555-8555-555555555555',hallId='33333333-3333-4333-8333-333333333333';
const party={id:'77777777-7777-4777-8777-777777777777',code:'SYNTHETIC-C1',name:'Synthetic customer',role:'customer'};
const patch={name:'Synthetic test account',type:'checking',bank:'Synthetic bank',accountNumber:'SYNTHETIC-NONPAYABLE',department:'SYNTHETIC',enabled:true};
const fundFacts={origin:'QA_SYNTHETIC',hallIds:[hallId],enabled:true},partyFacts={records:[{origin:'QA_SYNTHETIC',enabled:true}]};
const profile={schemaVersion:'QA_SYNTHETIC_FUND_ACCOUNTS_V1',database:database.database,instanceId:database.instanceId,
  accounts:[{id:fundId,code:'SYNTHETIC-FA1',patch}],parties:[party]};

function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'naijue-t40-f01-f02-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'synthetic-profile.json'),raw=JSON.stringify(profile);
  writeFileSync(file,raw,{mode:0o600});
  const config=readSyntheticFundAccountConfig({APP_ENV:'qa',QA_SYNTHETIC_FUND_ACCOUNTS_FILE:file,
    QA_SYNTHETIC_FUND_ACCOUNTS_SHA256:createHash('sha256').update(raw).digest('hex')},database);
  return new SyntheticFundAccountReader(config,database);
}
function overlay(kind){
  return kind==='fundAccounts'
    ? {kind,id:fundId,body:{code:'SYNTHETIC-FA1',...patch,primaryPaymentMethodId:methodId,sourceFacts:structuredClone(fundFacts)},source_facts:structuredClone(fundFacts),version:1,updated_by:'SYNTHETIC-TEST'}
    : {kind,id:party.id,body:{code:party.code,name:party.name,enabled:true,usage:[party.role],tags:[party.role],sourceFacts:structuredClone(partyFacts)},source_facts:structuredClone(partyFacts),version:1,updated_by:'SYNTHETIC-TEST'};
}
async function readOverlay(reader,row,{sourceFund=false}={}){
  const session={query:async(sql,params=[])=>{
    assert.match(sql,/^\s*SELECT\b/,'counterexample adapter permits reads only');
    let rows;
    if(sql.includes('.tplus_import_run '))rows=sourceFund?[{batch_id:'SYNTHETIC-TEST'}]:[];
    else if(sql.includes('.tplus_fund_account '))rows=[{id:fundId,code:'SYNTHETIC-FA1',name:patch.name,account_number:patch.accountNumber,bank:patch.bank,
      account_type:patch.type,primary_payment_method_id:methodId,hall_ids:[hallId],source_department_id:patch.department,payload:{origin:'QA_SYNTHETIC',enabled:true}}];
    else if(sql.includes('.master_data_entity ')){
      assert.deepEqual(params[0],[row.kind]);rows=sourceFund?[]:[row];
    }else if(sql.includes('.master_data_state '))rows=[{revision:1}];
    else throw new Error('Unexpected isolated counterexample query');
    return {rows,rowCount:rows.length};
  }};
  const repo=new SecurityRepository(session,database,()=>reader.load(),(code,body,id,returnedFacts)=>reader.partyRole(code,body,id,returnedFacts));
  return listMasterRecords(session,repo,{kinds:[row.kind]});
}
const expectedCode=kind=>kind==='fundAccounts'?'QA_SYNTHETIC_FUND_SOURCE_MISMATCH':'QA_SYNTHETIC_PARTY_SOURCE_MISMATCH';
async function rejection(reader,row){
  try{
    const data=await readOverlay(reader,row);
    return {kind:row.kind,rejected:false,status:null,code:null,recordCount:data.records.length};
  }catch(error){return {kind:row.kind,rejected:true,status:error.statusCode,code:error.code};}
}
async function unchangedPositive(reader,row){
  const data=await readOverlay(reader,row);assert.equal(data.records.length,1);
  assert.deepEqual(data.records[0].body,row.body);
  assert.deepEqual(data.records[0].sourceFacts,row.body.sourceFacts??row.source_facts);
}

test('T39-RF-F01 rejects undeclared fund and party runtime body fields before returning masters',async t=>{
  const reader=fixture(t),outcomes=[];
  for(const kind of ['fundAccounts','parties']){
    const row=overlay(kind);await unchangedPositive(reader,row);
    row.body.unexpectedMetadata='UNDECLARED-QA-MARKER';
    outcomes.push(await rejection(reader,row));
  }
  t.diagnostic(JSON.stringify({finding:'F01',cases:outcomes}));
  assert.deepEqual(outcomes.map(({kind,rejected,status,code})=>({kind,rejected,status,code})),
    ['fundAccounts','parties'].map(kind=>({kind,rejected:true,status:503,code:expectedCode(kind)})));
});

test('T39-RF-F02 validates independent provenance and rejects mismatched valid copies',async t=>{
  const reader=fixture(t),outcomes=[];
  for(const kind of ['fundAccounts','parties']){
    await unchangedPositive(reader,overlay(kind));
    const extra=overlay(kind);extra.source_facts.unexpectedMetadata='UNDECLARED-QA-MARKER';
    outcomes.push({...await rejection(reader,extra),case:'unknown independent key'});
    const conflict=overlay(kind);
    if(kind==='fundAccounts')conflict.source_facts.enabled=false;
    else conflict.source_facts.records[0].enabled=false;
    outcomes.push({...await rejection(reader,conflict),case:'valid copies conflict'});
  }
  // A validated internal QA receipt remains supported; it is never public provenance.
  const receipt=overlay('fundAccounts');receipt.source_facts._approvedFundAccountRevision=reader.load().revision;
  await unchangedPositive(reader,receipt);
  // Matching source facts still work for the imported-source path affected by fund projection.
  const source=await readOverlay(reader,overlay('fundAccounts'),{sourceFund:true});
  assert.deepEqual(source.records[0].sourceFacts,fundFacts);
  // An absent body copy is distinct from a malformed present copy; use only the returned column.
  const columnOnly=overlay('parties');delete columnOnly.body.sourceFacts;
  await unchangedPositive(reader,columnOnly);
  t.diagnostic(JSON.stringify({finding:'F02',cases:outcomes}));
  assert(outcomes.every(row=>row.rejected&&row.status===503&&row.code===expectedCode(row.kind)));
});
