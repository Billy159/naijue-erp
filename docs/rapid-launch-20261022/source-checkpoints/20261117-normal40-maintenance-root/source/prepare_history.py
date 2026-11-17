"""Local actual110/Root08/diagnostic history only; no runtime or authority calls."""
from pathlib import Path
import ast,hashlib,json
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
CONSUMER=V/'NORMAL40-THREE-ROUTINE-MAINTENANCE-SOURCE-02'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def checked(path,pin):
 raw=path.read_bytes();assert sha(raw)==pin,path;return json.loads(raw)
def main():
 cas_path=V/'ROOT08-EXECUTION-PREPARATION-02/cas/ACTUAL-CAS-RESULT.json'
 cas=checked(cas_path,'912e3dbdc73708f0b4c5abd94086f54877f28e79edc79d325cc90ceb02de83d1')
 raw=(CONSUMER/'ACTUAL110-DISPATCHER.py').read_bytes();assert sha(raw)==cas['dispatcherSha256']=='7cab381f7cd7aa402a0087a14ecb2571460dd11274b00cee0dbd62938fb8b814'
 (HERE/'ACTUAL110-DISPATCHER.py').write_bytes(raw)
 interface_raw=(CONSUMER/'INTERFACE.UNISSUED.json').read_bytes();interface=json.loads(interface_raw)
 assert interface['phaseOrder']==['apply','start','upgrade','stop','restore']and set(interface['jobs'])==set(interface['phaseOrder'])
 keys=ast.literal_eval(next(n.value for n in ast.parse(raw).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets)))
 assert len(keys)==110 and not set(keys)&{r['jobId']for r in interface['jobs'].values()}
 readback_path=V/'ROOT08-EXECUTION-PREPARATION-02/materialization-call/READBACK-01.json'
 readback=checked(readback_path,'b0b30523319b47c1660e918f2877376c674330866f03b96704a59d6fb6408865')
 marker=readback['materialization'];assert marker['markerSha256']==marker['rootSha256']=='5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c'
 assert readback['terminal']['rootSha256']=='e8849c90c8836a9d28e016b2216c3e5a725fd9998b39dc1c940a8f499d6f70b3'and readback['terminal']['status']=='COMPLETED'
 diagnostic_path=V/'DURABLE-READONLY-EXECUTION-PREPARATION-03/diagnostic-call/READBACK-02.json'
 diagnostic=checked(diagnostic_path,'b460ff5de8330945d9f65d17410f3b623808a4521c56815930a0364302ac13bf')
 decision_path=ROOT/'outputs/主控/20261117-r3-durable02-recovery-decision-01/DECISION.json'
 decision=checked(decision_path,'b07d9ba7ea9320e387ec43a2d99cd93a30faf99bfa95bb60915d8d3d59071b78')
 registry_path=V/'ROOT08-EXECUTION-PREPARATION-02/fresh/ACTUAL-REGISTRY-BASIS.json'
 registry=checked(registry_path,'f88b2c26abafaf24b532ee0cd519d58e88aaa1d303b40744f3b994f877c0c647')
 custody={k:v for k,v in registry['oldIdentities'].items()if '/ordinary39-auth-20261116-01/'in k};assert len(custody)==5
 history={'state':'ACTUAL110_ROOT08_DIAGNOSTIC_ANCHORS_CONSUMER_PINS_PENDING',
  'actualRootPins':{'dispatcher':cas['dispatcherSha256'],'root08Module':cas['moduleSha256'],'root08Policy':cas['policySha256']},
  'actualInputs':[{'path':str(path),'sha256':pin}for path,pin in [(cas_path,'912e3dbdc73708f0b4c5abd94086f54877f28e79edc79d325cc90ceb02de83d1'),(readback_path,'b0b30523319b47c1660e918f2877376c674330866f03b96704a59d6fb6408865'),(diagnostic_path,'b460ff5de8330945d9f65d17410f3b623808a4521c56815930a0364302ac13bf'),(decision_path,'b07d9ba7ea9320e387ec43a2d99cd93a30faf99bfa95bb60915d8d3d59071b78')]],
  'root08':{'key':readback['requestKey'],'terminalSha256':readback['terminal']['rootSha256'],'markerSha256':marker['markerSha256'],'rootResultSha256':marker['rootSha256'],'publicResultSha256':marker['publicSha256'],'value':marker['result']},
  'diagnostic02':{'key':diagnostic['requestKey'],'pins':diagnostic['rootPins'],'container':diagnostic['ownActualContainer'],'beforeBodySha256':diagnostic['result']['snapshot']['evidence']['functionBodySha256'],'beforeDefinitionsObserved':None},
  'fixedImportDurableScope':{'rootOperation':decision['observedOriginalRootOperation'],'subBatch':decision['observedOriginalFailedSubBatch'],'namespace':decision['observedNamespace'],'preservedExistingRows':{k:v for k,v in decision['tableCounts'].items()if v},'allDatabaseEmptyClaimed':False},
  'beforeModel':interface['beforeModel'],'afterModel':interface['afterModel'],'jobs':{k:interface['jobs'][k]['jobId']for k in interface['phaseOrder']},
  'policyName':'direct40-batched-real.json','policyFormat':'T45_R3_NORMAL40_BATCHED_REAL_V1','custodyStat9':custody,
  'custodyMetadataSource':{'path':str(registry_path),'sha256':'f88b2c26abafaf24b532ee0cd519d58e88aaa1d303b40744f3b994f877c0c647'},
  'original39Restore':{'key':'t45-r3-ordinary39-auth-restore-20261116-01','terminalSha256':'400bcdd5c5aa69a11b45a03a90bb64a1bbce17a835cb2bf57636949b4ec411c7','rootResultSha256':'08f94d2ddcc78e733cac57313d04b0573a8003d81fe76a1ad482c6d716ecbeca'},
  'retainedAck39':{'relativePath':'state/native-services/t45-first-r3-native-service-start-20261116-39/retained-ack.json','expectedRawSha256':'d035fa81890f8cbc0b7ded918c5ceac7f28259c2c126e3c651f8ff364c9bdb8f','actualFreshRead':None},
  'consumerDirectory':str(CONSUMER),'consumerInterfaceWipSha256':sha(interface_raw),'consumerSourcePinsSha256':None,
  'consumerFrozenInterfaceSha256':None,'rolesAuthority':None,'currentService':None,'epoch':None,'clock':None,'finiteAuthorities':None,
  'parentBudgetSeconds':5100,'reserveBytes':28*1024**3,'oldKeys':110,'newKeys':5,'candidateKeys':115,
  'originalWriterPermanentlyConsumed':True,'noWriterKeySelected':True,'Root08MarkerIsNotSQLInstalledProof':True}
 (HERE/'HISTORY-INPUTS.WIP.json').write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'state':history['state'],'actualRoot':cas['dispatcherSha256'],'newJobs':history['jobs']}))
if __name__=='__main__':main()
