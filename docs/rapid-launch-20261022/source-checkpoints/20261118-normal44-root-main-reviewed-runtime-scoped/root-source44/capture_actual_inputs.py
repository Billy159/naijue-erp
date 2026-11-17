"""Project existing closed43 receipts only; no server, clock or authority."""
from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2]
OLD=D.with_name('20261118-r3-ordinary43-root-source-04')
V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 refs=[]
 def read(path,pin=None):
  path=Path(path);raw=path.read_bytes();assert pin is None or sha(raw)==pin,path
  refs.append(dict(path=str(path),sha256=sha(raw)));return json.loads(raw)
 scope=read(R/'outputs/主控/20261118-r3-after43-source44-scope-01/SOURCE-SCOPE.json','2ee1c9f2b8178f05131dbc40965dd2cf94378f8191427047d0f9cb2ad1b709a3')
 clarification=read(R/'outputs/主控/20261118-r3-after43-source44-scope-01/HISTORY-INTERFACE-CLARIFICATION-01.json','a2f9d9f83ae5451c020ca42a0a35fa9476fbff4c070707769b50f503a3cb362c')
 readability=read(R/'outputs/主控/20261118-r3-after43-source44-scope-01/ORDINARY-READABILITY-FRESH-ADDENDUM-01.json','bac3c76cba8e345bd1406191648cdc9abc0a85217d684cf569e19b890ecd1b48')
 assert(scope['rootBefore'],scope['rootAfter'])==(132,137)and scope['serverFreshClockIssuerCASPGOrWriterCurrentlyAuthorized']is False
 owner=read(V/'NORMAL43-FULL-DATA-CONTINUATION-RESULT-01/RESULT.json',scope['closed43OwnerResultSha256'])
 assert owner['state']=='NORMAL43_CAS_APPLY_COMPLETED_START_FAILED_CLEAN_STOP_ORIGINAL_AUTH_RESTORED_WRITER_NEVER_SUBMITTED'
 assert owner['writer']['submissionCalls']==0 and owner['businessImportCompleted']is False
 cas=read(V/'NORMAL43-ROOT-EXECUTION-PREPARATION-03/cas/ACTUAL-CAS-RESULT.json',owner['cas']['receiptSha256'])
 assert cas['dispatcherSha256']==scope['actualBeforeDispatcherSha256']and cas['old127AndThreeGuardsPreserved']is True
 runtime=V/'NORMAL43-EXECUTION-PREPARATION-02/runtime'
 start=read(runtime/'start/START-ORIGINAL-KEY-READBACK-01.PRIVATE.json')
 apply=read(runtime/'apply/ACTUAL-ORIGINAL-KEY-READBACK.PRIVATE.json')
 restore=read(runtime/'restore/ACTUAL-ORIGINAL-KEY-READBACK.PRIVATE.json')
 assert(start['terminal']['status'],start['terminal']['exitCode'])==('FAILED',2)
 assert all(start[k]is True for k in('pgdataPidAbsent','portAbsent','ownOperationUnitInactive','incompleteObjectsEqual'))
 assert start['cleanup']['originalPGDATAAndCleanStateVerified']is True
 assert restore['results']['maintenance-auth-result.json']['value']['result']['exactOriginalVerifierAndExpiryVerifiedPrivately']is True
 assert restore['results']['maintenance-auth-result.json']['value']['result']['naturalExpiryCountedAsRestoration']is False
 h=json.loads((OLD/'HISTORY-INPUTS.json').read_bytes())
 policy_path=R/'outputs/主控/20261118-r3-normal43-registration-window-01/direct43-batched-real.json'
 policy=policy_path.read_bytes();assert sha(policy)==cas['policySha256'];refs.append(dict(path=str(policy_path),sha256=sha(policy)))
 previous=(OLD/'admin_exec.NORMAL43-UNREGISTERED.py').read_bytes()
 needle=b'NORMAL43_POLICY_SHA256 = None';assert previous.count(needle)==1
 actual=previous.replace(needle,('NORMAL43_POLICY_SHA256 = '+repr(sha(policy))).encode())
 assert sha(actual)==cas['dispatcherSha256'];(D/'ACTUAL132-DISPATCHER.py').write_bytes(actual)
 custody=dict(h['custodyStat9'])
 base='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary43-auth-20261118-01/'
 custody.update({base+k:v for k,v in restore['privateRecoveryMetadataOnly'].items()})
 assert len(custody)==23 and all(len(v)==9 for v in custody.values())
 value=dict(state='ACTUAL_ROOT132_FAILED43_CLEANED_AUTH_RESTORED_SOURCE44_ONLY',scope=scope,historyInterfaceClarification=clarification,ordinaryReadabilityAddendum=readability,owner43=owner,actualRoot132=cas,apply43=apply,start43=start,restore43=restore,custodyStat9=custody,actualInputs=refs,clock=None,finiteAuthorities=None,current44C=None,current44Epoch=None)
 (D/'ACTUAL-HISTORY.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
 print('Captured existing132/closed43 metadata; original plan bodies and runtime untouched.')
if __name__=='__main__':main()
