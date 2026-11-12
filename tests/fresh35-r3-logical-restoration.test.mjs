import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bindFresh35RestoredTarget, fresh35RestoredTargetGuard } from '../scripts/release/unified-install/fresh35-combined-target-v1.mjs';
import {
 ADMIN154_PREDECESSOR_RECORD_SHA256, ADMIN154_PREDECESSOR_SOURCE_SHA256, ADMIN154_PATCH_SHA256
} from '../scripts/release/unified-install/fresh35-admin154-record-v1.mjs';
import {
 validateR3RestorationLineage, r3RestoredImportSql, isFresh35RestorationCompletion
} from '../scripts/release/unified-install/fresh35-restoration-v1.mjs';

const sha = digit => digit.repeat(64);
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const database = 'erp_fresh35_20261110_r3';
const owner = 'erp35_owner_20261110_r3';
const manifest = 'f4b86de73073da86fe8e49af5a871aaf1d3e856856a0912d835ea0180f1b0deb';

function fixture() {
 const physical = {database,systemIdentifier:'7706545564479176741',databaseOid:'16393',
  serverVersionNum:'170011',postmasterStart:'2026-11-11 21:33:07.105002+00'};
 const record = {
  binding:{sourceSetSha256:ADMIN154_PREDECESSOR_SOURCE_SHA256,targetSha256:sha('1')},
  target:{proposal:{database,owner},physical:{...physical,postmasterStart:'2026-11-10 12:01:23.000004+00'}},
  programSha256:sha('2'),catalogSha256:sha('3')
 };
 const parent = {
  format:'FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1',appliedAt:'2026-11-11T21:34:07Z',authorizationSha256:sha('4'),physical,
  transactionReceipt:{actor:owner,database,nonce:'a'.repeat(48),backendPid:123,transactionId:'100'},
  predecessor:{recordSha256:ADMIN154_PREDECESSOR_RECORD_SHA256,...record.binding,programSha256:record.programSha256,catalogSha256:record.catalogSha256},
  successor:{patchSqlSha256:ADMIN154_PATCH_SHA256,catalogSha256:sha('5'),
   sourceSetSha256:'0ba2beef0446879f02dc8a75678a9a2bbb241d6be5bc501fc25057443c1d8c32',
   catalogSpecSha256:'8f03acec34ddbc2c5c58b3b177d264932c248d5f193da39ba60ae580b95706cd',
   modelSha256:'0d80600b46c95f11bf2ddcb8101bce66e292735e4543a6a383039b32feda2d20'}
 };
 const {patchSqlSha256:_,...predecessor}=parent.successor;
 const final = {
  format:'FRESH35_COMPACT_ZERO_SUCCESSOR_RECORD_V2',appliedAt:'2026-11-11T21:36:07Z',authorizationSha256:sha('7'),physical:{...physical},
  transactionReceipt:{...parent.transactionReceipt,transactionId:'102'},
  predecessor:{recordSha256:sha('6'),...predecessor},
  successor:{catalogSha256:sha('8'),patchSqlSha256:'b61b31b6116b3f0891dc4cd1f9182aa438d22ad987e29ac2ec73c04f72f5d0ba',
   sourceSetSha256:'e11609061181457b7cd012a32d0b44a5d764586ee2d5353e62ce82f297db16bd',
   catalogSpecSha256:'fa5b53963510566921827476e21122efc2a8ac381769fcc5b22f8c3f4b4c58cf',
   modelSha256:'44b64832ab36289180f17757ea726d8de747da5ef24ef5365d642831e350b998'}
 };
 const setup={
  phase:'ADMIN_PROVISION_ONLY',requestKey:'t45-r3-baseline-scope-admin-provision-20261111-01',
  status:'ADMIN154_NATIVE_ADMIN_RESULT_RETAINED_NOT_BUSINESS_ACCEPTANCE',successorRecordSha256:sha('6'),
  nativeResult:{state:'COMMITTED',connection_cleanup:'CLOSED'},provisionOrigin:{operation_id:id(1),request_sha256:sha('9')}
 };
 return {record,parent,setup,final};
}

test('R3 recovery consumes the historical 154/A/38 chain without minting authority',()=>{
 const f=fixture();
 const result=validateR3RestorationLineage(f.record,f.parent,sha('6'),f.setup,f.final,sha('a'));
 assert.deepEqual(result,f.setup.provisionOrigin);
 assert.equal(isFresh35RestorationCompletion(result),false);
});

test('R3 recovery refuses crossed lineage, other epochs and an unconfirmed A',()=>{
 for(const [change,error] of [
  [f=>{f.final.successor.sourceSetSha256=sha('e')},/SOURCE_OR_CATALOG_DIFFERS/],
  [f=>{f.final.predecessor.recordSha256=sha('e')},/PARENT_DIFFERS/],
  [f=>{f.final.physical.postmasterStart='2026-11-11 21:33:07.105003+00'},/MAINTENANCE_GENERATION_REQUIRED/],
  [f=>{f.setup.successorRecordSha256=sha('e')},/ORIGINAL_PROVISION_RECEIPT_REQUIRED/],
  [f=>{f.setup.nativeResult.state='UNKNOWN'},/ORIGINAL_PROVISION_RECEIPT_REQUIRED/]
 ]){
  const f=fixture();change(f);
  assert.throws(()=>validateR3RestorationLineage(f.record,f.parent,sha('6'),f.setup,f.final,sha('a')),error);
 }
});

test('isolated DB readback checks the r2 publish and original A receipt, and rejects the old R1 batch',()=>{
 const i={batchId:id(2),documentBatchId:id(3),initializerOperationId:id(4),initializerRequestKey:id(4),
  packageSha256:manifest,planSha256:sha('a')};
 const a=fixture().setup.provisionOrigin, sql=r3RestoredImportSql(i,a);
 assert.match(sql,/^SELECT/);
 assert.match(sql,/DOCUMENT_PUBLISH/);
 assert.match(sql,/PROVISIONED_ADMIN_EMPTY_BUSINESS/);
 assert.match(sql,new RegExp(a.operation_id));
 assert.match(sql,new RegExp(a.request_sha256));
 assert.throws(()=>r3RestoredImportSql({...i,packageSha256:sha('b')},a),/ORIGINAL_IMPORT_BINDING_REQUIRED/);
 assert.throws(()=>r3RestoredImportSql({...i,initializerRequestKey:id(5)},a),/ORIGINAL_IMPORT_BINDING_REQUIRED/);
});

test('restored target uses the existing distinct bootstrap and checks backend exclusivity without provisioning an observer',async()=>{
 const now=Date.now(),port=58991,host='127.0.0.1';
 const target=bindFresh35RestoredTarget({
  proposal:{database,owner,controller:'erp35_controller_20261110_r3',runtime:'erp35_runtime_20261110_r3',
   admin:'restore_bootstrap',host,port,workspaceDirectory:'/restore-only/r3'},
  physical:{systemIdentifier:'7706545564479176742',databaseOid:'16394',serverVersionNum:'170011',
   postmasterStart:new Date(now-20000).toISOString().replace('T',' ').replace('Z','+00')},
  startsAt:now-1000,expiresAt:now+30000,purpose:'RESTORED_FROM_VERIFIED_INSTALLATION',
  ordinary:{connectHost:host,connectPort:port,serverAddress:host,serverPort:port,runtimeLoginValidUntil:null,referenceDirectory:'/restore-only/reference'},
  restoration:{sourceInstallationRecordSha256:ADMIN154_PREDECESSOR_RECORD_SHA256,sourceTargetSha256:sha('1'),
   sourceSystemIdentifier:'7706545564479176741',sourceAdmin:'erp35_admin_20261110_r3',
   databaseDumpSha256:sha('b'),databaseRestoreReceiptSha256:sha('c')}
 },now);
 const guard=fresh35RestoredTargetGuard(target);
 assert.match(guard,/pg_stat_activity/);
 assert.doesNotMatch(guard,/fresh35_exclusive_backends/);
 const runner=await readFile(new URL('../scripts/release/unified-install/fresh35-restoration-v1.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(runner,/fresh35CombinedBootstrapObserverSql|GRANT EXECUTE/);
});
