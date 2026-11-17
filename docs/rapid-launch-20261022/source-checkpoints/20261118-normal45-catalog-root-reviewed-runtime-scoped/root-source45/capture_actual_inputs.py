"""Read only stored real137/closed44 receipts. No future runtime material."""
from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2];OLD=D.with_name('20261118-r3-ordinary44-root-source-01')
V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 refs=[]
 def read(path,pin=None):
  path=Path(path);raw=path.read_bytes();assert pin is None or sha(raw)==pin,path
  refs.append(dict(path=str(path),sha256=sha(raw)));return json.loads(raw)
 scope=read(R/'outputs/主控/20261118-r3-after44-source45-scope-01/SOURCE-SCOPE.json','e71bb637bf12b2e8b1c024a76c737f67782837c6e06dd5ed24b149859df55105')
 assert(scope['rootBefore'],scope['rootAfter'])==(137,142)and scope['serverFreshClockIssuerCASPGOrWriterCurrentlyAuthorized']is False
 owner=read(V/'NORMAL44-FULL-DATA-CONTINUATION-RESULT-01/RESULT.json',scope['closed44OwnerResultSha256'])
 assert owner['state']=='NORMAL44_SAFE_CLOSED_WRITER_FAILED_BEFORE_CHILD_OR_CONNECTION_NO_IMPORT_SUCCESS'
 assert owner['databaseStopped']is owner['exactOriginalVerifierAndExpiryRestored']is True and owner['writerChildStarted']is False and owner['writerConnectionCleanup']=='NOT_OPENED'
 cas=read(V/'NORMAL44-ROOT-EXECUTION-PREPARATION-01/cas/ACTUAL-CAS-RESULT.json',owner['CASReceiptSha256'])
 assert cas['dispatcherSha256']==scope['actualBeforeDispatcherSha256']and cas['old132AndThreeGuardsPreserved']is True
 run=V/'NORMAL44-EXECUTION-PREPARATION-01/runtime'
 start=read(run/'start/ACTUAL-START44-PROTECTED-STORED-OUTPUTS.PRIVATE.json')
 writer=read(run/'writer/WRITER-ORIGINAL-KEY-READBACK-01.PRIVATE.json')
 stop=read(run/'stop/ACTUAL-ORIGINAL-KEY-READBACK.PRIVATE.json')
 restore=read(run/'restore/ACTUAL-ORIGINAL-KEY-READBACK.PRIVATE.json')
 apply=read(run/'apply/ACTUAL-ORIGINAL-KEY-READBACK.PRIVATE.json')
 assert(start['terminal']['status'],start['terminal']['exitCode'])==('COMPLETED',0)
 assert(writer['terminal']['value']['status'],writer['terminal']['value']['exitCode'])==('FAILED',2)
 assert writer['results']['final33-writer-child-cleanup.json']['value']['childStarted']is False
 h=json.loads((OLD/'HISTORY-INPUTS.json').read_bytes());custody=dict(h['custodyStat9'])
 base='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary44-auth-20261118-01/'
 custody.update({base+leaf:metadata for leaf,metadata in restore['privateRecoveryMetadataOnly'].items()});assert len(custody)==28
 policy_path=R/'outputs/主控/20261118-r3-normal44-registration-window-01/direct44-batched-real.json'
 policy=policy_path.read_bytes();assert sha(policy)==cas['policySha256'];refs.append(dict(path=str(policy_path),sha256=sha(policy)))
 template=(OLD/'admin_exec.NORMAL44-UNREGISTERED.py').read_bytes();needle=b'NORMAL44_POLICY_SHA256 = None';assert template.count(needle)==1
 actual=template.replace(needle,('NORMAL44_POLICY_SHA256 = '+repr(sha(policy))).encode());assert sha(actual)==cas['dispatcherSha256']
 (D/'ACTUAL137-DISPATCHER.py').write_bytes(actual)
 value=dict(state='ACTUAL137_CLOSED44_FAILED_WRITER_BEFORE_CHILD_SOURCE45_ONLY',scope=scope,owner44=owner,actualRoot137=cas,start44=start,writer44=writer,stop44=stop,restore44=restore,apply44=apply,custodyStat9=custody,actualInputs=refs,clock=None,finiteAuthorities=None,current45C=None,current45Epoch=None)
 (D/'ACTUAL-HISTORY.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
 print('Bound recorded Root137/closed44; no server or original plan body read.')
if __name__=='__main__':main()
