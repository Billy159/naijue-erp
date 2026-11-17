"""Local exact43 receipt adapter. No clock, SSH, issuer, factory or submission."""
from pathlib import Path
import ast,hashlib,json,os
ADAPTER_SOURCE=Path(__file__).resolve().parent
HERE=ADAPTER_SOURCE.parent/'NORMAL44-EXECUTION-PREPARATION-01'
V=HERE.parent
SOURCE=V/'NORMAL44-FULL-DATA-CONTINUATION-SOURCE-01'
EXECUTION=V/'NORMAL44-EXECUTION-CONSUMER-01'
ROOT_PREP=V/'NORMAL44-ROOT-EXECUTION-PREPARATION-01'
JOBS={'apply':'t45-r3-ordinary44-auth-apply-20261118-01','start':'t45-first-r3-native-service-start-20261118-44','writer':'t45-r3-batched-real-after43-execute-20261118-01','stop':'t45-r3-ordinary44-preserve-stop-20261118-01','restore':'t45-r3-ordinary44-auth-restore-20261118-01'}
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(path):return json.loads(path.read_bytes())
def save_once(path,value):
 path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w')as f:json.dump(value,f,sort_keys=True,indent=2);f.write('\n')
 return {'path':str(path),'sha256':sha(path.read_bytes())}
def original_result(phase):
 assert phase in JOBS
 raw=read(HERE/'runtime'/phase/'ACTUAL-ORIGINAL-KEY-READBACK.PRIVATE.json')
 assert raw['requestKey']==JOBS[phase]and raw['terminal']is not None
 term=raw['terminal'];assert term['value']['jobId']==JOBS[phase]
 result={**raw,'terminal':term['value'],'rootPins':{'terminal':term['sha256']},'terminalRootPublicSha256':term['sha256'],'noOtherOperationUnits':not raw['activeOperationUnits'],'ownOperationUnitInactive':not raw['activeOperationUnits'],'portAbsent':raw['originalPortAbsent']}
 leaves={'apply':'maintenance-auth-result.json','writer':'final33-writer-result.json','stop':'normal05-preserve-stop-result.json','restore':'maintenance-auth-result.json'}
 if phase in leaves and leaves[phase]in raw['results']:
  item=raw['results'][leaves[phase]];assert item['objectsEqual']is True
  result.update(result=item['value'],rootResultSha256=item['rootSha256'],publicResultSha256=item['publicSha256'],resultObjectsEqual=True);result['rootPins']['result']=item['rootSha256']
 if 'guardianCleanup'in raw:
  result['rootPins']['cleanup']=raw['guardianCleanup']['sha256'];result['cleanup']=raw['guardianCleanup']['value']
 return result
def stored_start():
 start=read(HERE/'runtime/start/ACTUAL-START44-PROTECTED-STORED-OUTPUTS.PRIVATE.json')
 assert start['requestKey']==JOBS['start']and(start['terminal']['status'],start['terminal']['exitCode'])==('COMPLETED',0)
 assert start['descriptionSource']=='STORED_START_JOB_OUTPUTS_NO_NODE_RERUN'and start['descriptionRootPublicObjectsMatched']is True
 assert start['service']['serviceKey']==JOBS['start']and start['actualSharedServiceWorkDeadline']+35000==start['outerAuthorityLeaseExpiresAt']
 assert start['rawLiveFacts']==json.loads(start['describeStoredOutputs']['liveFacts']['text'])
 assert start['runnerConservativeWorkDeadline']==start['rawLiveFacts']['runnerConservativeWorkDeadline']==start['actualSharedServiceWorkDeadline']-35000
 for kind,ref in start['result']['describe']['outputs'].items():
  item=start['describeStoredOutputs'][kind];body=item['text'].encode()
  assert {k:item[k]for k in('leaf','bytes','sha256')}==ref and len(body)==ref['bytes']and sha(body)==ref['sha256']
 return start
def writer_context():
 apply=original_result('apply');assert(apply['terminal']['status'],apply['terminal']['exitCode'])==('COMPLETED',0)
 start=stored_start()
 assert start['expectedBinding']==start['descriptor']['expectedBinding']==start['rawLiveFacts']['expectedBinding']
 description={'descriptor':start['descriptor'],'liveFacts':start['rawLiveFacts'],'payload':start['describePayload'],'process':start['describeProcess'],'outputs':start['describeStoredOutputs']}
 fresh=read(ROOT_PREP/'fresh/ACTUAL-BASIS-BASIS.json')
 custody=fresh['historicalPlanCustody']
 assert set(custody)==set(read(SOURCE/'INTERFACE.UNISSUED.json')['historicalPlanCustody']['paths'])
 context={'apply':apply,'start':start,'operatorReadySha256':'5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c','executionDescription':description,'planCustody':custody}
 return save_once(HERE/'runtime/writer/MAIN-WRITER-CONTEXT.PRIVATE.json',context)
def assignment(source,name,value):
 node=next(n for n in ast.parse(source).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets))
 return source.replace(ast.get_source_segment(source,node),name+' = '+repr(value),1)
def render_stop_basis():
 # All substituted values originate from this exact43 accepted job/CAS and
 # protected Start outputs. There is no CLI path/key/hash parameter.
 start=stored_start();observation_path=HERE/'runtime/writer/ACTUAL-ORIGINAL-KEY-READBACK.PRIVATE.json';observed=read(observation_path)
 assert observed['requestKey']==JOBS['writer']and not observed['activeOperationUnits']
 if observed['terminal']is None:
  # A missing terminal alone never proves that submission did not occur.
  assert not observed['presentAcrossExistingGrants']and not observed['results']
  evidence=read(HERE/'runtime/writer/ACTUAL-NO-SUBMISSION-EVIDENCE.json')
  assert evidence['requestKey']==JOBS['writer']and evidence['state']=='CONFIRMED_BEFORE_REMOTE_SUBMISSION'
  assert evidence['observerSha256']==sha(observation_path.read_bytes())and evidence['remoteSubmissionCalls']==0
  assert evidence['submissionInFlight']is False and evidence['localSubmitOutcomeKnown']is True
  terminal_pin,outcome=None,None
 else:
  terminal=observed['terminal'];value=terminal['value']
  assert value['jobId']==JOBS['writer']and value['taskId']=='T45'and value['grantId']=='b16447fbc81f4d64'
  assert value['finishedAtUTC']and type(value['phaseStarted'])is bool
  assert value['status']in('COMPLETED','FAILED','INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY')or(value['status']in('REFUSED_D0_INTERLOCK_BEFORE_PHASE','REFUSED_R3_CONTINUITY_BEFORE_PHASE')and value['phaseStarted']is False and type(value['exitCode'])is int and value['exitCode']==2)
  terminal_pin=terminal['sha256'];outcome=tuple(value[k]for k in('status','exitCode','phaseStarted','finishedAtUTC'))
 cas=read(ROOT_PREP/'cas/ACTUAL-CAS-RESULT.json')
 assert cas['PGStarted']is False and cas['maintenanceSubmitted']is False
 history={'t45-r3-batched-install-20261116-02':'01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2','t45-r3-batched161-command-successor-20261116-01':'515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb','t45-r3-final33-plan-prepare-20261116-05':'2f7a11142ced7b8056c52eb5af5ba5f2dcfad78d11918fe88f4cc4350d8795d1','t45-r3-batched-real-execute-20261115-01':'00132d00459328530dd4656d9a9e853b81abfbc92a73076fcde733d080cbdb35','t45-r3-settlement24-three-routine-upgrade42-20261117-01':'d6e9b9fbba71248f93560603d7108bde2f35ebacb80468b5a925f476a357514d',JOBS['writer']:terminal_pin}
 root='/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64';worker='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64'
 source_pins=[('dispatcher',root+'/admin_exec.py',cas['dispatcherSha256']),('helper',root+'/r3_normal44_continuation.py',cas['moduleSha256']),('policy',worker+'/r3-05-write-continuity/direct44-batched-real.json',cas['policySha256']),('currentSource',worker+'/jobs/'+JOBS['start']+'/bundle/normal_service05_after08.py',read(SOURCE/'INTERFACE.UNISSUED.json')['stopLiveHelperBindings']['guardian'])]
 source=(ADAPTER_SOURCE/'read_stop_basis44.template.py').read_text()
 for name,value in [('SERVICE',start['service']),('EXPECTED_TERMINALS',history),('ROOT_PIN_BINDINGS',source_pins),('WRITER_TERMINAL_OUTCOME',outcome)]:source=assignment(source,name,value)
 compile(source,'read_stop_basis44.ACTUAL.py','exec')
 path=HERE/'runtime/stop/read_stop_basis44.ACTUAL.py';path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w')as f:f.write(source)
 return {'path':str(path),'sha256':sha(path.read_bytes())}
def restore_evidence():
 stop=original_result('stop');assert(stop['terminal']['status'],stop['terminal']['exitCode'])==('COMPLETED',0)
 assert stop['result']['service']==stored_start()['service']and stop['result']['pgStopped']is True and stop['pgdataPidAbsent']and stop['portAbsent']and not stop['activeOperationUnits']
 assert stop['rootPins']['cleanup']==stop['result']['cleanupSha256']
 return save_once(HERE/'runtime/restore/MAIN-RESTORE-EVIDENCE.PRIVATE.json',stop)
