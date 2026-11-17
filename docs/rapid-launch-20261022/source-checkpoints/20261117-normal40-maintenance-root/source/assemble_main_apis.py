"""Render Main's unchanged seven/eight parameter entry points; no issuer invocation."""
from pathlib import Path
import ast,hashlib,json
HERE=Path(__file__).resolve().parent;OLD=HERE.with_name('20261117-r3-normal39-root-source-01')
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def functions(source,names):
 tree=ast.parse(source);return '\n\n'.join(ast.get_source_segment(source,n)for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names)+'\n'
def main():
 h=json.loads((HERE/'HISTORY-INPUTS.json').read_bytes());consumer=Path(h['consumerDirectory']);i=json.loads((consumer/'INTERFACE.UNISSUED.json').read_bytes())
 prior=(consumer/'prior_preserved39.py').read_text();constants={}
 for n in ast.parse(prior).body:
  if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
   try:constants[n.targets[0].id]=ast.literal_eval(n.value)
   except(ValueError,TypeError):pass
 binding={a:constants[b]for a,b in dict(previousTerminalSha256='TERMINAL',previousResultSha256='NORMAL_PUBLIC',previousCurrentProofSha256='SERVICE',previousRetainedAckSha256='ACK',previousCleanupSha256='CLEANUP',previousStopRequestKey='STOP',previousStopTerminalSha256='STOP_TERMINAL',previousStopResultSha256='STOP_PUBLIC',restoreTerminalSha256='RESTORE_TERMINAL',restoreResultSha256='RESTORE_PUBLIC').items()}
 binding['previousCurrentProofSha256']=constants['SERVICE']['proofSha256']
 w={**h,'consumerSourceDirectory':str(consumer),'priorService':constants['SERVICE'],'predecessor':{'bindings':binding},'operatorReadySha256':h['root08']['markerSha256'],'stopCurrentBatchOperations':i['stopCurrentBatchOperations'], 'consumerReviewSha256':'65c7667606f40aa7931194142227e73881b660b2c6a136dfbb736fda489ff618','historyOnlyNoRuntimeAuthorization':True,'futureC':None,'futureWindow':None}
 (HERE/'FIVE-PHASES.UNISSUED.json').write_text(json.dumps(w,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
 common='''from pathlib import Path
import base64,hashlib,json,os,runpy,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
CONTROL=ROOT/'outputs/主控';T45=ROOT/'outputs/T45/revisions'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(value):return(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\\n').encode()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin,path;return raw
def read(path,pin=None):
 assert pin is not None,'EXACT_EVIDENCE_PIN_REQUIRED';return json.loads(checked(path,pin))
def verify_source():
 raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(raw)
 assert source['sourceOnly']is True
 for leaf,row in source['files'].items():assert len(checked(HERE/leaf,row['sha256']))==row['bytes']
 return sha(raw),source
def api(path,rule):
 checked(path,rule['bundlePins'][path.name]);sys.path.insert(0,str(path.parent))
 return runpy.run_path(str(path),run_name='main_unissued_consumer_api')
def witness():return json.loads((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes())
'''
 registration='''"""Main-only finite registration API. SOURCE defines this function without calling it."""
'''+common+'''
from datetime import datetime
def issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin):
 source_pin,source=verify_source();w=witness()
 for ref in w['actualInputs']:checked(ref['path'],ref['sha256'])
 human=read(ROOT/'outputs/主控/20261115-r3-direct-real-import-route-01/USER-AUTHORITY.json','836d9281a81ca798eb6a989112012508a8e0696c58cf2d9ae44c186563786fc0')
 assert human['messageId']=='01a1df2e-293d-7061-ab16-5b0cc2e0e753'
 review=read(review_file,review_pin);consumer_review=read(consumer_review_file,consumer_review_pin)
 assert review['sourceOnly']is True and review['findings']==[]and review['rootPairReviewComplete']is True
 assert review['sourcePinsSha256']==source_pin and review['consumerSourcePinsSha256']==w['consumerSourcePinsSha256']and review['consumerReviewSha256']==consumer_review_pin
 assert consumer_review_pin==w['consumerReviewSha256']
 assert consumer_review['sourceOnly']is True and consumer_review['findings']==[]
 assert consumer_review['sourcePinsSha256']==w['consumerSourcePinsSha256']and consumer_review['interfaceSha256']==w['consumerInterfaceSha256']
 folder=Path(w['consumerSourceDirectory']);consumer=read(folder/'SOURCE-PINS.json',w['consumerSourcePinsSha256'])
 interface=read(folder/'INTERFACE.UNISSUED.json',w['consumerInterfaceSha256'])
 read(folder/'PHASES40.UNISSUED.json',w['consumerRulesSha256'])
 assert consumer['sourceOnly']is True and interface['phaseOrder']==['apply','start','upgrade','stop','restore']
 for leaf,row in consumer['files'].items():assert len(checked(folder/leaf,row['sha256']))==row['bytes']
 basis=read(basis_file,basis_pin);cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='main40_registration_source')
 assert basis['state']=='READONLY_NORMAL40_REGISTRATION_BASIS'and basis['dispatcherSha256']==cas['OLD']
 assert basis['PGConnections']==basis['mutations']==0 and basis['original39AckSHAReadBackMatchesDerivedExpected']is True
 assert basis['executionLockMatches']is True and basis['candidateKeysAbsent']is True and basis['stoppedPGDATA']is True
 assert set(basis['oldIdentities'])==set(cas['PRESERVE'])|{str(p)for p in cas['CUSTODY']}|{'executionLock'}
 assert basis['oldIdentities']['executionLock']==list(cas['LOCK_ID'])
 assert {str(p):basis['oldIdentities'][str(p)]for p in cas['CUSTODY']}==w['custodyStat9']
 rules=json.loads(json.dumps(w['expectedRules']));folders={p:Path(w['phaseDirectories'][p])for p in rules}
 for phase,rule in rules.items():
  assert folders[phase]==folder/phase/'bundle'
  for leaf,pin in rule['bundlePins'].items():checked(folders[phase]/leaf,pin)
 role_file=folders['apply']/'ordinary05_roles.py';host_file=folders['apply']/'ordinary05_roles_job.py'
 role=api(role_file,rules['apply']);host=api(host_file,rules['apply'])
 assert role['scope']()==interface['rolesFixedScope']and host['scope']('apply')==interface['jobs']['apply']['hostFixedScope']
 stamp=datetime.fromisoformat(basis['checkedAtUTC']);assert stamp.tzinfo is not None
 out=Path(output_directory).resolve();assert out.parent==CONTROL and not out.exists()
 # Sole Main clock, after exact source/review/fresh checks. No saved SOURCE clock.
 now=time.time_ns()//1000000
 assert 0<=now-int(stamp.timestamp()*1000)<=120000 and now+5100000<=int(basis['grantExpiresAtEpoch']*1000)
 ref='Main ordinary40 exact five-step maintenance only; no import or writer; original39 authentication preserved and restored.'
 roles=dict(role['scope'](),startsAt=now,expiresAt=now+900000,controllerValidUntil=now+3600000,backupAdminValidUntil=now+3720000,restorationDeadline=now+4500000,authorizationReference=ref,rolesSourceSha256=sha(role_file.read_bytes()),independentReviewSha256=review_pin)
 role['validate'](roles,now);roles_raw=encode(roles)
 apply=dict(host['scope']('apply'),startsAt=now,expiresAt=roles['expiresAt'],authorizationReference=ref,independentReviewSha256=review_pin,rolesAuthoritySha256=sha(roles_raw),rolesSourceSha256=roles['rolesSourceSha256'],hostSourceSha256=sha(host_file.read_bytes()))
 host['validate'](apply,'apply',now)
 for phase in ('apply','restore'):rules[phase]['bundlePins']['roles-authorization.json']=sha(roles_raw)
 policy=dict(format='T45_R3_NORMAL40_BATCHED_REAL_V1',grantId='b16447fbc81f4d64',startsAt=now,expiresAt=now+5100000,jobs=rules)
 cas['validate_policy_delta'](policy)
 files={'module':(HERE/'r3_normal40_continuation.py').read_bytes(),'policy':encode(policy),'dispatcherTemplate':(HERE/'admin_exec.NORMAL40-UNREGISTERED.py').read_bytes()}
 dispatcher=files['dispatcherTemplate'].replace(b'NORMAL40_POLICY_SHA256 = None',('NORMAL40_POLICY_SHA256 = '+repr(sha(files['policy']))).encode());assert dispatcher!=files['dispatcherTemplate']
 authorization=dict(format='T45_NORMAL40_REGISTRATION_CAS_V1',jobs=w['jobs'],sourceSha256=sha((HERE/'register_cas.py').read_bytes()),sourcePins={k:sha(v)for k,v in files.items()},oldIdentities=basis['oldIdentities'],startsAt=now,expiresAt=now+600000,authorizationReference=ref,independentReviewSha256=review_pin)
 raw=encode(authorization);b64=lambda raw:base64.b64encode(raw).decode()
 manifest=dict(state='ISSUED_NORMAL40_FIVE_PHASE_REGISTRATION_NO_PHASE_SUBMITTED',sourcePinsSha256=source_pin,rulesSha256=sha((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes()),consumerSourcePinsSha256=w['consumerSourcePinsSha256'],consumerReviewSha256=consumer_review_pin,independentReviewSha256=review_pin,basisSha256=basis_pin,rolesSha256=sha(roles_raw),applyHostSha256=sha(encode(apply)),policySha256=sha(files['policy']),dispatcherSha256=sha(dispatcher),registrationSha256=sha(raw),jobs=w['jobs'],phaseSubmitted=False)
 outputs={'roles-authorization.json':roles_raw,'host-authorization.json':encode(apply),'direct40-batched-real.json':files['policy'],'admin_exec.ISSUED.py':dispatcher,'registration-authorization.json':raw,'registration-packet.json':encode({'authorization':b64(raw),'files':{k:b64(v)for k,v in files.items()}}),'ISSUED.json':encode(manifest)}
 out.mkdir(mode=0o700)
 for leaf,body in outputs.items():
  with os.fdopen(os.open(out/leaf,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb')as stream:stream.write(body)
 return manifest
'''
 (HERE/'issue_registration.py').write_text(registration)
 old=(OLD/'issue_phase.py').read_text()
 helpers=functions(old,{'normalize_apply','observation','preservation_authority','normal_common','runtime_catalog_facts','catalog_update_authority'})
 helpers=helpers.replace("set(evidence['currentBatchTerminals']) == {\n            witness['historicalInstall']['requestKey'], 't45-r3-batched161-command-successor-20261116-01',\n            policy['jobs']['prepare']['jobId'], policy['jobs']['writer']['jobId']}","set(evidence['currentBatchTerminals']) == set(witness['stopCurrentBatchOperations'])")
 helpers=helpers.replace("'catalog_update'","'upgrade'").replace("'84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065'",repr(h['root08']['markerSha256']))
 helpers=helpers.replace("assert d['format'] == 'FRESH35_BATCHED161_COMMAND_SUCCESSOR_PROGRAM_V1'","assert d['format'] == 'FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1'")
 helpers=helpers.replace("assert d['functionIdentity'] == 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)'","assert len(d['functionIdentities']) == len(d['routinePins']) == 3")
 helpers=helpers.replace("historical_catalog(witness, installed) == facts['installedBatchedCatalog']","host['BEFORE_CATALOG'] == facts['installedBatchedCatalog']\n    assert installed['rootPins']['terminal']=='01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2' and installed['rootPins']['result']=='e14e9b649d9b4d4864360384e93e059cdda80c37e769de91f2452abd1af87792'")
 start=functions(old,{'start_authority'}).replace("read(CONTROL/'20261115-r3-direct-service24-start-window-01/service-start-authorization.json')","read(CONTROL/'20261115-r3-direct-service24-start-window-01/service-start-authorization.json',"+repr('bf90fa60f69519b27c9da11d1133d3544850a72218ac26029bb8574aea30130c')+")").replace("('start','prepare','writer')","('start','upgrade')").replace('min(8400,','min(4200,').replace('assert seconds>3600','assert seconds>2400').replace('now+480000','now+300000').replace('service39 after actual closed38 and completed ROOT07 source','service40 after actual closed39 and completed ROOT08 source')
 phase='''"""Main-only phase API; exactly apply/start/upgrade/stop/restore. No import branch."""
'''+common+"CONTROLLER='erp35_controller_20261110_r3'\nADMIN='erp35_admin_20261110_r3'\nOLD_WRITER='ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'\nOLD_HOLD='25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757'\n"+helpers+start+'''
def issue(phase,rules_file,rules_pin,registration_directory,evidence_path=None,evidence_pin=None,predecessor_path=None,predecessor_pin=None):
 source_pin,source=verify_source();assert rules_pin==sha((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes());w=read(rules_file,rules_pin)
 assert rules_pin==sha((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes())and w==witness()
 assert phase in ('apply','start','upgrade','stop','restore')and w['noWriterKeySelected']is True
 issued=Path(registration_directory).resolve();assert issued.parent==CONTROL
 manifest=json.loads((issued/'ISSUED.json').read_bytes())
 assert manifest['sourcePinsSha256']==source_pin and manifest['state']=='ISSUED_NORMAL40_FIVE_PHASE_REGISTRATION_NO_PHASE_SUBMITTED'and manifest['rulesSha256']==rules_pin and manifest['consumerSourcePinsSha256']==w['consumerSourcePinsSha256']
 assert manifest['sourcePinsSha256']==source_pin
 policy=read(issued/'direct40-batched-real.json',manifest['policySha256']);roles=read(issued/'roles-authorization.json',manifest['rolesSha256']);rule=policy['jobs'][phase]
 cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='main40_policy_check');cas['validate_policy_delta'](policy)
 folder=Path(w['phaseDirectories'][phase]);assert folder.is_relative_to(T45.resolve())
 for leaf,pin in rule['bundlePins'].items():checked(issued/leaf if leaf=='roles-authorization.json'else folder/leaf,pin)
 evidence=read(evidence_path,evidence_pin)if evidence_path is not None else None
 predecessor=read(predecessor_path,predecessor_pin)if predecessor_path is not None else None
 # A new phase is materialized once; ambiguity is read under the original key.
 out=issued/('phase-'+phase);assert not out.exists()
 os.environ['ERP_SHARED_JOB_ID']=rule['jobId']
 os.environ['ERP_SHARED_JOB_DIR']='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/'+rule['jobId']
 now=time.time_ns()//1000000
 assert policy['startsAt']<=now<policy['expiresAt']
 if phase=='apply':
  a=read(issued/'host-authorization.json',manifest['applyHostSha256']);host=api(folder/rule['script'],rule);host['validate'](a,'apply',now)
 elif phase=='start':a=start_authority(w,rule,evidence,roles,policy,now)
 elif phase=='upgrade':
  assert evidence['operatorReadySha256']==w['operatorReadySha256']
  a,_=catalog_update_authority(w,rule,predecessor,evidence,roles,policy,manifest,now)
 else:a=preservation_authority(phase,w,rule,predecessor,evidence,roles,policy,now)
 assert now+rule['timeoutSeconds']*1000<a[rule['deadlineField']]<=policy['expiresAt']
 raw=encode(a);out.mkdir(mode=0o700)
 with os.fdopen(os.open(out/rule['authorityLeaf'],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb')as f:f.write(raw)
 report=dict(phase=phase,jobId=rule['jobId'],authoritySha256=sha(raw),sourcePinsSha256=source_pin,phaseSubmitted=False,automaticReplay=False)
 with os.fdopen(os.open(out/'ISSUED.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w')as f:json.dump(report,f,sort_keys=True)
 return report
'''
 (HERE/'issue_phase.py').write_text(phase)
 print('Rendered Main7/phase8 definitions; no clocks, authorities or consumer calls executed.')
if __name__=='__main__':main()
