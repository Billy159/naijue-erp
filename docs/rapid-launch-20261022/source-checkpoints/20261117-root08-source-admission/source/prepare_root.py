"""Local Root08 root-source rendering from the actually registered durable02 root109."""
from pathlib import Path
import hashlib,json,shutil
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
BASE=V/'DURABLE-READONLY-SOURCE-03'
CONSUMER=HERE.with_name('20261117-r3-root08-materialization-source-01')
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def main():
 actual=V/'DURABLE-READONLY-EXECUTION-PREPARATION-03/cas/ACTUAL-CAS-RESULT.json'
 raw=actual.read_bytes();assert sha(raw)=='1ea0b632f7bc1dbac0cc6907fec61d3773d10b4e5a3abad03ac0c47902b9fda8';receipt=json.loads(raw)
 template=(BASE/'admin_exec.DURABLE-UNREGISTERED.py').read_bytes()
 needle=b'DURABLE_CORE0_02_POLICY_SHA256 = None';assert template.count(needle)==1
 dispatcher=template.replace(needle,('DURABLE_CORE0_02_POLICY_SHA256 = '+repr(receipt['policySha256'])).encode())
 assert sha(dispatcher)==receipt['dispatcherSha256']=='b4013f9a04e35bfae287742a7d91b9c2a9daf1d06b0768262db01b8de40926de'
 assert sha((BASE/'r3_core0_durable_readonly_02.py').read_bytes())==receipt['moduleSha256']=='f6aca8ef0f69f606a8166264c634c5ae44d6e0070c17851a87d02bc1405e3257'
 (HERE/'ACTUAL109-DISPATCHER.py').write_bytes(dispatcher)
 source=(CONSUMER/'SOURCE-PINS.json').read_bytes();assert sha(source)=='4fed5130c1566729ae4d57e4bf2d6ba32d201b7500fb7f18bf91e48cea6a71a2'
 review=ROOT/'outputs/QB/20261117-r3-root08-materialization-joint-review-01/CONSUMER-RESULT.json'
 assert sha(review.read_bytes())=='abfa3e0957368558fd96c7e1130302621f63998eb0216fc3896196e7c1ef39af'
 transport=HERE/'transport';transport.mkdir(exist_ok=True)
 bundle={};aliases={}
 for file in sorted((CONSUMER/'bundle').iterdir()):
  if not file.is_file():continue
  name=file.name+'.json'if file.suffix=='.asset'else file.name
  raw=file.read_bytes()
  if(transport/name).exists():assert(transport/name).read_bytes()==raw
  else:(transport/name).write_bytes(raw)
  bundle[name]={'bytes':len(raw),'sha256':sha(raw)}
  if name!=file.name:aliases[name]=file.name
 assert len(bundle)==11 and len(aliases)==8 and max(row['bytes']for row in bundle.values())==977195
 readback=V/'DURABLE-READONLY-EXECUTION-PREPARATION-03/diagnostic-call/READBACK-02.json'
 assert sha(readback.read_bytes())=='b460ff5de8330945d9f65d17410f3b623808a4521c56815930a0364302ac13bf'
 actual_diagnostic=json.loads(readback.read_bytes())
 summary=V/'DURABLE-READONLY-EXECUTION-PREPARATION-03/RESULT-ACTUAL-DIAGNOSTIC02.json'
 assert sha(summary.read_bytes())=='bcceec1cdc67b6f70374cd68da483b944a43ec97f4d10aee4f04f242a7641bea'
 recovery=ROOT/'outputs/主控/20261117-r3-durable02-recovery-decision-01/DECISION.json'
 assert sha(recovery.read_bytes())=='b07d9ba7ea9320e387ec43a2d99cd93a30faf99bfa95bb60915d8d3d59071b78'
 assert actual_diagnostic['terminal']['status']=='COMPLETED'and actual_diagnostic['terminal']['exitCode']==0
 assert actual_diagnostic['activeOperationUnits']==[]and actual_diagnostic['ownActualContainer']['running']is False
 assert actual_diagnostic['result']['snapshot']['cleanup']=={'childReaped':True,'descendantsAbsent':True,'cleanClusterAfterRead':True,'networkConnectionsOpened':0}
 static={'format':'D1_ROOT08_ROOT_ADMISSION_STATIC_V1','requestKey':'t45-r3-batched-root08-source-delta-20261117-01',
  'actualCasReceipt':{'path':str(actual),'sha256':sha(actual.read_bytes())},'baselineRootPins':{'dispatcher':receipt['dispatcherSha256'],
   'diagnosticModule':'0fb16f260ce868b68cc49b20b7ea723c5426a9342ba4aa79200d7dda1ab6d10f',
   'diagnosticPolicy':'b1f6bebd87b049d35f833b1fb6798e945be787294b9451bfa05232d5516497d3',
   'diagnostic02Module':receipt['moduleSha256'],'diagnostic02Policy':receipt['policySha256']},
  'consumerSourcePinsSha256':sha(source),'consumerReviewSha256':sha(review.read_bytes()),'workerSha256':bundle['materialize-batched-source.py']['sha256'],
  'profileSha256':bundle['source-profile.json']['sha256'],'bundle':bundle,'aliases':aliases,'authorityLeaf':'materialize-authorization.json',
  'sourceScope':{'format':'T45_R3_BATCHED_SOURCE_MATERIALIZATION_V1','requestKey':'t45-r3-batched-root08-source-delta-20261117-01','grantId':'b16447fbc81f4d64',
   'decision':'MATERIALIZE_EXACT_FROZEN_SOURCE_ONLY_NO_DATABASE_OR_SERVICE',
   'outputDirectory':'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root08-20261117-01',
   'sourceDescriptionSha256':bundle['source-profile.json']['sha256'],'dataIdentity':[66304,13502421,61035,61035,448],
   'minimumAvailableAfterBytes':28*1024**3,'maximumOperationSeconds':300},
  'requiredClosedDiagnosticKey':'t45-r3-core0-durable-readonly-20261117-02',
  'diagnostic02Terminal':None,'diagnostic02Cleanup':None,'diagnostic02Container':None,
  'actualDiagnosticEvidence':{'readback':{'path':str(readback),'sha256':sha(readback.read_bytes())},'summary':{'path':str(summary),'sha256':sha(summary.read_bytes())},'recoveryDecision':{'path':str(recovery),'sha256':sha(recovery.read_bytes())}},
  'requiredActualDiagnosticClosure':{'requestKey':'t45-r3-core0-durable-readonly-20261117-02','terminalSha256':actual_diagnostic['rootPins']['terminal'],'resultSha256':actual_diagnostic['rootPins']['result'],'cleanupSha256':actual_diagnostic['rootPins']['cleanup'],'actualContainerId':actual_diagnostic['ownActualContainer']['id']},
  'actualDiagnosticScope':{'bodyHashesOnly':actual_diagnostic['result']['snapshot']['evidence']['functionBodySha256'],'functionDefinitionsObserved':None,'rootOperation':actual_diagnostic['result']['snapshot']['evidence']['rootOperation'],'failedSubBatch':actual_diagnostic['result']['snapshot']['evidence']['failedSubBatch'],'namespace':actual_diagnostic['result']['snapshot']['evidence']['namespace'],'preservedNonzeroTableCounts':json.loads(summary.read_bytes())['nonzeroTableCountsPreserved'],'allDatabaseEmptyClaimed':False,'SQLUpgradePerformed':False},
  'finiteAuthority':None,'freshBasis':None,'Root08Marker':None,'clock':None,'C':None,'epoch':None}
 (HERE/'STATIC-INPUTS.json').write_text(json.dumps(static,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
 print(json.dumps({'state':'ROOT109_ACTUAL_SOURCE_CALIBRATED_ROOT08_LOCAL_ONLY','transportMembers':len(bundle),'largestAssetBytes':977195}))
if __name__=='__main__':main()
