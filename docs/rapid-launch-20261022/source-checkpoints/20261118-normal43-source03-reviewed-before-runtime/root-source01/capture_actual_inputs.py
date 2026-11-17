"""Local receipt projection only. Never inspect a server or issue authority."""
from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2];V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01';OLD=D.with_name('20261117-r3-ordinary42-root-source-02')
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 refs=[]
 def read(p,pin=None):
  b=p.read_bytes();assert pin is None or sha(b)==pin,p
  refs.append(dict(path=str(p),sha256=sha(b)));return json.loads(b)
 scope=read(R/'outputs/主控/20261118-r3-after42-source43-scope-01/SOURCE-SCOPE.json','89f3971ef29022be17de1bdf192f032f3af582f95dc45b3a66ef5a94ca09bae9')
 assert scope['phaseOrder']==['apply','start','writer','stop','restore']and scope['rootBefore']==127 and scope['rootAfter']==132 and scope['serverFreshClockIssuerCASPGOrWriterCurrentlyAuthorized']is False
 owner=read(V/'NORMAL42-MAINTENANCE-RESULT-01/RESULT.json','c34f8c48f037709f7ce9fc8a3341e18e336769e228b59947b550ad5c4dd95afe')
 assert owner['state']=='PASS_SCOPED_NORMAL42_THREE_ROUTINE_MAINTENANCE_AND_SAFE_CLOSEOUT'
 phase={}
 for k,p in owner['phaseEvidence'].items():phase[k]=read(Path(p['path']),p['sha256'])
 runtime=V/'NORMAL42-MAINTENANCE-EXECUTION-PREPARATION-01/runtime'
 upgrade=read(runtime/'upgrade/ACTUAL-UPGRADE42-RESULT.json','791d4f472921d827f900cb5165d1b7d852a60696449f7b6ead5e6fe695295a4d')
 stop=read(runtime/'stop/ACTUAL-ORIGINAL-KEY-READBACK.PRIVATE.json','97928ee0be902def451e3223cbb5dc07ce423d5233c9bd401e676066fa7cebe8')
 restore=read(runtime/'restore/ACTUAL-ORIGINAL-KEY-READBACK.PRIVATE.json','717f3510482959a4dc0a3c25a43cfbe3fbf1b51b47b1d7f60671258931bdaec5')
 cas=read(V/'NORMAL42-ROOT-EXECUTION-PREPARATION-01/cas/ACTUAL-CAS-RESULT.json','42cc4979c85d7ce38ad2f8470ccfcbe8fd8868f76e9bbf947152f44da8aa9c8e')
 prepare=read(V/'NORMAL39-EXECUTION-PREPARATION-01/runtime/prepare/RESULT-PREPARE05.json','4709f62e62f604200ed17e4be751d823fd521589ce1cf4451cb686a963f1fb46')
 result=read(V/'NORMAL39-EXECUTION-PREPARATION-01/runtime/prepare/release-receipts/t45-r3-final33-plan-prepare-20261116-05/final33-prepare-result.json')
 assert prepare['preparedBinding']==result['preparedBinding']and prepare['executionBinding']==result['executionBinding']and prepare['preparedBinding']['stepCount']==44910
 h=json.loads((OLD/'HISTORY-INPUTS.json').read_bytes());custody=dict(h['custodyStat9']);root='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary42-auth-20261118-01/'
 # Obtain the actual path from the frozen consumer42 role scope, rather than
 # inferring the snapshot directory date from its execution date.
 consumer=Path(h['consumerDirectory'])/'apply/bundle/ordinary05_roles.py'
 root='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary42-auth-20261117-01/'
 assert 'ordinary42-auth-20261117-01'in consumer.read_text()
 custody.update({root+k:v for k,v in restore['privateRecoveryMetadataOnly'].items()});assert len(custody)==18 and all(len(v)==9 for v in custody.values())
 value=dict(state='ACTUAL_ROOT127_CLOSED42_INSTALLED_AFTERADA_COMPLETED_PREPARE05_ONLY_NO_NEW_AUTHORITY',scope=scope,owner42=owner,phase42=phase,actualRoot127=cas,upgrade42=upgrade,stop42=stop,restore42=restore,custodyStat9=custody,prepare05=dict(safeReadbackSha256='4709f62e62f604200ed17e4be751d823fd521589ce1cf4451cb686a963f1fb46',key=prepare['requestKey'],terminalSha256=prepare['rootPins']['terminal'],rootResultSha256=prepare['rootPins']['result'],nativeResultSha256=result['nativeResultSha256'],preparedBinding=prepare['preparedBinding'],executionBinding=prepare['executionBinding'],result=result),actualInputs=refs,clock=None,finiteAuthorities=None,current43C=None,current43Epoch=None)
 (D/'ACTUAL-HISTORY.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');print('Projected real closed42 and retained prepare05 metadata; runtime actions0.')
if __name__=='__main__':main()
