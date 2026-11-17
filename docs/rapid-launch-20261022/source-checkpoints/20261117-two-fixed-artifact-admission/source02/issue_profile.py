"""Main-only explicit-time profile binding after real writer/STOP/exactRESTORE and fresh root baseline."""
from pathlib import Path
from types import ModuleType
import ast,hashlib,json,runpy,posixpath
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
CONTROL=ROOT/'outputs/主控'
PAIR=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/ARTIFACT-ROOT-PAIRING-SOURCE-01'
PAIR_SHA='2a8a9b55c9a2377ee85863b86c340d2109586caec35dbb776447fe114818948b'
PAIR_REVIEW=ROOT/'outputs/QB/20261117-r3-two-artifact-policy-pair-review-01/RESULT.json'
PAIR_REVIEW_SHA='f1c250b87fd5d0b91c6eddff7898a6e8efc2c01e6102ed89e1a0350500c7275b'
sha=lambda b:hashlib.sha256(b).hexdigest()
pack=lambda v:(json.dumps(v,sort_keys=True,indent=2)+'\n').encode()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin;return raw

def existing_inputs():
 source=json.loads(checked(PAIR/'SOURCE-PINS.json',PAIR_SHA));review=json.loads(checked(PAIR_REVIEW,PAIR_REVIEW_SHA))
 assert review['state']=='SOURCE_PASS_TWO_FIXED_ARTIFACT_POLICY_PAIRS'and review['sourceOnly']is True and review['findings']==[]and review['sourcePinsSha256']==PAIR_SHA
 for name,pin in source['files'].items():checked(PAIR/name,pin)
 return source

def validate_closed_receipts(policy,writer,stop,restore):
 keys={p:policy['jobs'][p]['jobId']for p in ('start','writer','stop','restore')}
 assert keys['writer']=='t45-r3-batched-real-execute-20261115-01'
 for data,key in [(writer,keys['writer']),(stop,keys['stop']),(restore,keys['restore'])]:
  t=data['terminal'];assert(t['jobId'],t['taskId'],t['grantId'],t['status'],t['exitCode'],t['phaseStarted'])==(key,'T45','b16447fbc81f4d64','COMPLETED',0,True)
  assert data['rootPins']['terminal']==data['terminalRootPublicSha256']and data['resultObjectsEqual']is True and data['ownOperationUnitInactive']is True
  assert len(data['rootPins']['result'])==len(data['publicResultSha256'])==64
 w=writer['result'];s=stop['result'];r=restore['result'];inside=r['result'];service=w['service']
 assert w['requestKey']==keys['writer']and w['state']=='COMPLETED'and w['nativeResultBindingMatched']is True and w['lifecycleConfirmed']is True and w['nativeConnectionCleanup']=='CLOSED'and w['readbackConnectionCleanup']=='CLOSED'and type(w['verification'])is dict and w['verification']['state']=='VERIFIED'
 assert all(w['processCleanup'][k]is True for k in ('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty'))
 assert service['serviceKey']==keys['start']and s['requestKey']==keys['stop']and s['service']==service and s['pgStopped']is True and s['businessAdvanced']is False and stop['pgdataPidAbsent']is True and restore['pgdataPidAbsent']is True
 assert r['requestKey']==inside['requestKey']==keys['restore']and inside['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'and inside['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inside['databaseStillStopped']is True and all(inside[k]is False for k in ('naturalExpiryCountedAsRestoration','runtimeAuthChanged','membershipsOrRoleAttributesChanged'))
 assert restore['privateRestorationReceiptMatched']is True and restore['privateRestorationReceiptPresent']is True and all(r['cleanup'][k]is True for k in ('ownContainerStopped','ownedPidAbsent'))
 evidence={'writerTerminal':writer['rootPins']['terminal'],'writerResult':writer['rootPins']['result'],'stopTerminal':stop['rootPins']['terminal'],'stopResult':stop['rootPins']['result'],'restoreTerminal':restore['rootPins']['terminal'],'restoreResult':restore['rootPins']['result'],'restoredReceipt':restore['privateRestorationReceiptSha256'],'currentProof':service['proofSha256']}
 return keys,service,evidence

def issue(starts_at,expires_at,decision_reference,authority_files,authority_pins,
          writer_file,writer_pin,stop_file,stop_pin,restore_file,restore_pin,
          baseline_file,baseline_pin,dispatcher_file,normal_policy_file,
          review_file,review_pin,output_directory):
 source=existing_inputs();source_pins=json.loads((HERE/'SOURCE-PINS.json').read_text())
 review=json.loads(checked(review_file,review_pin));assert review['state']=='SOURCE_PASS_TWO_FIXED_ARTIFACT_ROOT_ADMISSION_ONLY'and review['sourceOnly']is True and review['findings']==[]and review['sourcePinsSha256']==sha((HERE/'SOURCE-PINS.json').read_bytes())
 for name,row in source_pins['files'].items():checked(HERE/name,row['sha256'])
 profiles=json.loads((HERE/'FIXED-PROFILES.json').read_text())['profiles'];baseline=json.loads(checked(baseline_file,baseline_pin))
 assert baseline['state']=='READONLY_POST_WRITER_ARTIFACT_BASELINE'and baseline['grantId']=='b16447fbc81f4d64'
 assert baseline['PGStopped']is True and baseline['noOtherOperationUnits']is True and baseline['PGConnections']==baseline['mutations']==0 and baseline['privateSnapshotBodiesOrDigestsRead']is False
 four={row[p]for row in profiles.values()for p in ('installKey','restoreKey')};assert set(baseline['fourKeysAbsent'])==four and all(v is True for v in baseline['fourKeysAbsent'].values())
 dispatcher=checked(dispatcher_file,baseline['dispatcherSha256']);policy=json.loads(checked(normal_policy_file,baseline['normalPolicySha256']))
 assert type(starts_at)is type(expires_at)is int and policy['startsAt']<=starts_at<expires_at<=min(policy['expiresAt'],int(baseline['grantExpiresAtEpoch']*1000))
 assert 0<=starts_at-baseline['checkedAtEpochMs']<=300000
 assert type(decision_reference)is str and 0<len(decision_reference)<=512 and set(authority_files)==set(authority_pins)==set(profiles)
 # Read exact actual normal digest constants. No service number or active SHA is predicted.
 tree=ast.parse(dispatcher);constants={n.targets[0].id:ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name)and n.targets[0].id in ('R3_ORIGINAL02_ABSENT_POLICY_SHA256','R3_ORIGINAL02_ABSENT_SOURCE_SHA256')}
 assert constants['R3_ORIGINAL02_ABSENT_POLICY_SHA256']==baseline['normalPolicySha256']and constants['R3_ORIGINAL02_ABSENT_SOURCE_SHA256']==baseline['normalHelperSha256']
 writer=json.loads(checked(writer_file,writer_pin));stop=json.loads(checked(stop_file,stop_pin));restore=json.loads(checked(restore_file,restore_pin))
 keys,service,evidence=validate_closed_receipts(policy,writer,stop,restore)
 assert baseline['normalPhaseKeys']==keys and baseline['stoppedService']==service and baseline['evidencePins']==evidence
 host=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
 for name,parent in [('restoredReceiptPath',host/'state/native-services'),('currentProofPath',host/'authority')]:
  value=baseline[name];assert type(value)is str and value.startswith('/')and posixpath.normpath(value)==value
  path=Path(value);assert (path.name=='restored.json'and path.parent.parent==parent)if name=='restoredReceiptPath'else(path.parent==parent and path.suffix=='.json')
 # Only immutable reviewed source is compiled here. Explicit actual times come from Main.
 for leaf in ('r3_two_fixed_artifact_admission.py','patch_dispatcher.py'):compile((HERE/leaf).read_bytes(),str(HERE/leaf),'exec')
 patcher=runpy.run_path(str(HERE/'patch_dispatcher.py'),run_name='source_dispatcher_patch_api')
 module_raw=(HERE/'r3_two_fixed_artifact_admission.py').read_bytes();patcher['render'](dispatcher,baseline['dispatcherSha256'],sha(module_raw))
 for kind,row in profiles.items():
  raw=checked(authority_files[kind],authority_pins[kind]);path=PAIR/kind/'reception_scope.py';code=checked(path,source['files'][kind+'/reception_scope.py']);m=ModuleType('actual_'+kind+'_artifact_scope');m.__file__=str(path);exec(compile(code,str(path),'exec'),m.__dict__)
  value=m.bind(raw,authority_pins[kind],row['fixedScope'],False)
  assert starts_at<=value['startsAt']<value['expiresAt']<=expires_at-30000
 profile=dict(format='T45_TWO_FIXED_ARTIFACT_ROOT_ADMISSION_V1',grantId='b16447fbc81f4d64',startsAt=starts_at,expiresAt=expires_at,authorityPins=authority_pins,evidencePins=evidence,stoppedService=service,decisionReference=decision_reference,phaseKeys=keys,restoredReceiptPath=baseline['restoredReceiptPath'],currentProofPath=baseline['currentProofPath'],normalPolicySha256=baseline['normalPolicySha256'],baselineDispatcherSha256=baseline['dispatcherSha256'],baselineHelperSha256=baseline['normalHelperSha256'])
 raw=pack(profile);patched=patcher['render'](dispatcher,baseline['dispatcherSha256'],sha(module_raw),sha(raw))
 output=Path(output_directory).resolve();assert output.parent==CONTROL and not output.exists();output.mkdir(mode=0o700)
 report=dict(state='ISSUED_FINITE_TWO_FIXED_ARTIFACT_PROFILE_NOT_REGISTERED_OR_STAGED',profileSha256=sha(raw),dispatcherSha256=sha(patched),moduleSha256=sha(module_raw),baselineSha256=baseline_pin,baselineDispatcherSha256=baseline['dispatcherSha256'],startsAt=starts_at,expiresAt=expires_at,reviewSha256=review_pin,writerReadbackSha256=writer_pin,stopReadbackSha256=stop_pin,restoreReadbackSha256=restore_pin,artifactAuthorityPins=authority_pins,normalPolicyHelperOrRolesChanged=False,registrationExecuted=False)
 for name,body in {'profile.json':raw,'admin_exec.ISSUED.py':patched,'r3_two_fixed_artifact_admission.py':module_raw,'ISSUED.json':pack(report)}.items():
  with(output/name).open('xb')as f:f.write(body)
 return report
