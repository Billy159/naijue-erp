"""Exact actual37 FS/failed03 input readback for Main issuance; no native or clock."""
from pathlib import Path
import hashlib,json
REFS={'decision': ('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/主控/20261117-r3-normal37-pending04-source-continuation-decision-02/DECISION.json', '245668f34289e5e418fbc592180b5d0ccea06316a402c0955ff96d3157039346'), 'after': ('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL37-PLAN-PARENT-ACCESS-FIX-01/ACTUAL-C05-AFTER.json', 'b7794bcd006bd8531e907d6f67aa570da8f7df3dc5c8f25508b8df8555f31041'), 'supplemental': ('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL37-PERMISSION-DIAGNOSTIC-01/ACTUAL-SUPPLEMENTAL25-PERMISSIONS.json', 'bcde121658009e1e40b777f23bf7b3b916ae9a1c08c44dbca192b42055f0be49'), 'failed03': ('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL37-RUNTIME-01/prepare/ACTUAL-PREPARE03-RESULT.json', '58ba3f0dc52e8400c6c62a75c3098bf508c8e17771f76f7b9ae3c3644d284677')}
def read_actual_inputs():
 values={}
 for key,(path,pin)in REFS.items():
  raw=Path(path).read_bytes();assert hashlib.sha256(raw).hexdigest()==pin
  values[key]=json.loads(raw)
 d=values['decision'];a=values['after'];v=values['supplemental'];f=values['failed03']
 assert d['state']=='MAIN_PENDING04_SOURCE_CONTINUATION_ONLY_NO_FINITE_AUTHORITY_OR_RUNTIME' and d['normalGeneration']==37 and d['businessWriterNeverSubmitted'] is True
 assert d['currentOuterPreparationAttemptKey']=='t45-r3-final33-plan-prepare-20261116-04' and d['nativeLogicalPreparationRequestKey']=='t45-r3-final33-plan-prepare-20261116-01'
 assert d['permissionAfterSha256']==REFS['after'][1] and d['historicalPrepare03ResultSha256']==REFS['failed03'][1]
 assert d['finiteAuthorityIssued'] is False and d['roleOrServiceDeadlineExtended'] is False
 assert a['state']=='C05_EXACT_DIRECTORY_SEARCH_CORRECTED_AND_NATIVE_ENOENT_CONFIRMED' and a['accessACLAbsent'] is True and a['defaultACLAbsent'] is True
 assert a['afterIdentity'][:5]==[66304,13502393,0,61035,456] and a['roleDeadlinesUnchanged'] is True
 assert v['callerVerifiedCurrent37AndBirth'] is True
 mounts=v['callerVerifiedLiveMountMappings'];assert len(mounts)==25 and {r['slot']for r in mounts}==set(v['slots'])
 assert all(r['liveMountResolved'] is True and r['declaredHostMappingMatched'] is (None if r['slot'].startswith('REFERENCE_')else True)for r in mounts)
 assert v['expectedService']['proofSha256']==d['currentServiceProofSha256'] and v['PGConnections']==v['permissionOrAclChanges']==v['filesCreatedOrOpenedForWrite']==0
 assert v['fileBodiesOrDigestsRead'] is False and v['NodeOrNativeOrJobInvoked'] is False
 probe=v['nativeIdentityAccess'];assert {k:probe[k]for k in ('uid','euid','gid','egid','groups')}=={'uid':61035,'euid':61035,'gid':61035,'egid':61035,'groups':[]}
 assert len(v['slots'])==25
 for name,row in v['slots'].items():
  for label in row['chain']:
   m=v['metadata'][label];c=probe['checks'][label]
   if m['state']=='PRESENT':
    assert c['lstat']=='OK'
    if m['type']=='DIRECTORY':assert c['searchOrExecute'] is True
   else:assert m['state']==c['lstat']=='ENOENT' and name in ('INDEX_SIDECAR_WAL','INDEX_SIDECAR_SHM','INDEX_SIDECAR_JOURNAL','NATIVE_PREPARATION_AUTHORITY')
  leaf=row['chain'][-1];m=v['metadata'][leaf];c=probe['checks'][leaf]
  if m['state']=='PRESENT':
   if row['required']in ('read','read_search','read_write_search'):assert c['read'] is True
   if row['required']=='read_write_search':assert c['write'] is True and c['searchOrExecute'] is True
 assert f['rootPins']['terminal']=='b4eb5ad67321213f2db643dce96966e801098e80064823dd78ddef40d18e96f7'
 assert f['result']['state']=='UNKNOWN'
 return d
