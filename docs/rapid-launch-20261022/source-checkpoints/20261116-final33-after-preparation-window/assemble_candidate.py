from pathlib import Path
import ast,hashlib,json,pprint,runpy
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
BASE=ROOT/'outputs/主控/20261115-r3-direct-service24-issuer-local-01';OLD=BASE/'SERVICE33-INPUT02-SUCCESSOR-01';MAIN=BASE/'SERVICE33-FINAL-SOURCE-PREPARE-01'
T=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def replace_function(s,name,new):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)and n.name==name);lines=s.splitlines(keepends=True);return ''.join(lines[:n.lineno-1])+new.rstrip()+'\n'+''.join(lines[n.end_lineno:])
def put(name,s):
 compile(s,name,'exec')if name.endswith('.py')else None
 (HERE/name).write_text(s)
actual={}
for phase,rel,pin in [('input_materialize','INPUT02-SUCCESSOR-01/ACTUAL-INPUT02-KEY-COMPLETED.json','aefdacd67a9142b77d1fb2dbb6366f0a69033ab802fe11a461919bf8cc73a5f0'),('materialize','MAIN9-EXECUTION-01/ACTUAL-MATERIALIZE-COMPLETED.json','edf63f6072813ef13cd70794b5bcf0b5b31b10d001f5a3ef6c6e2376f98e2a19')]:
 p=T/rel;assert sha(p.read_bytes())==pin;actual[phase]=json.loads(p.read_bytes())
w=json.loads((OLD/'NINE-PHASES.UNISSUED.json').read_bytes());rules=w['jobs'];jobs={k:v['jobId']for k,v in rules.items()};assert sum(len(r['bundlePins'])for r in rules.values())==75
input_target=actual['input_materialize']['final33-input-materialization-result.json']['value']['targetDirectory'];source_target=actual['materialize']['result']['sourceRoot'].rsplit('/',1)[0]
expected={}
for phase,leaf,marker in [('input_materialize','final33-input-materialization-result.json',input_target+'/materialization-receipt.json'),('materialize','batched-source-materialization.json',source_target+'/source-materialization.json')]:
 a=actual[phase];r=a['final33-input-materialization-result.json']if phase=='input_materialize'else None
 expected[phase]={'requestKey':jobs[phase],'leaf':leaf,'marker':marker,'terminalSha256':a['terminalSha256']if r else a['rootPins']['terminal'],'rootResultSha256':r['rootSha256']if r else a['rootPins']['result'],'publicResultSha256':r['publicSha256']if r else a['publicResultSha256'],'value':r['value']if r else a['result']}
 assert a['terminal']['jobId']==jobs[phase]and a['terminal']['status']=='COMPLETED'and a['terminal']['exitCode']==0 and a['terminal']['phaseStarted']is True
 assert (r['objectsEqual']if r else a['resultObjectsEqual'])is True
oldapi=runpy.run_path(str(OLD/'register_cas.py'));basis={str(k):v for k,v in oldapi['BASIS'].items()};assert len(basis)==163
B=str(oldapi['B']);P=str(oldapi['P']);C='/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64'
basis[P+'/admin_exec.py']='97830e4ec03442e83e0cc6c00467abdddd6a36f61249553184676524c3634309';basis[str(oldapi['NEW_POLICY'])]='0d18b5d6e60e4709f814bc43bc64d6f725445a6c4df38425e5f0fe2cc56ebcd5';basis[P+'/r3_direct33_input02.py']=oldapi['HELPER']
basis[B+'/r3-direct33-input02-registration-cas-20261116-02/result.json']='20afba865671f741fadbdc4f92c19d2099feb8627e67f2da13dba5c3d5650a2e'
for row in expected.values():
 basis[B+'/jobs/'+row['requestKey']+'/r3-outer-terminal.json']=row['terminalSha256'];basis[B+'/jobs/'+row['requestKey']+'/results/'+row['leaf']]=row['rootResultSha256'];basis[row['marker']]=row['rootResultSha256']
common='''def check_completed_value(phase, terminal, value):
    expected = COMPLETED[phase]
    need((terminal.get('jobId'),terminal.get('status'),terminal.get('exitCode'),terminal.get('phaseStarted')) == (expected['requestKey'],'COMPLETED',0,True),'COMPLETED_TERMINAL_DIFFERS')
    need(value == expected['value'],'COMPLETED_RESULT_VALUE_DIFFERS')


def completed_preparation():
    result={}
    for phase, expected in COMPLETED.items():
        key=expected['requestKey']
        terminal=read(B/'jobs'/key/'r3-outer-terminal.json')[0]
        public_terminal=read(C/'results'/(key+'.json'),1000)[0]
        root=read(B/'jobs'/key/'results'/expected['leaf'])[0]
        public=read(C/'jobs'/key/'results'/expected['leaf'],1000)[0]
        marker=read(Path(expected['marker']))[0]
        need(sha(terminal)==expected['terminalSha256'] and terminal==public_terminal,'COMPLETED_TERMINAL_BYTES_DIFFER')
        need(sha(root)==expected['rootResultSha256'] and sha(public)==expected['publicResultSha256'] and root==marker,'COMPLETED_RESULT_OR_MARKER_SHA_DIFFERS')
        value=json.loads(root);need(value==json.loads(public),'COMPLETED_RESULT_OBJECTS_DIFFER')
        check_completed_value(phase,json.loads(terminal),value)
        if phase=='input_materialize':
            target=Path(value['targetDirectory']);s=target.lstat()
            need(target.resolve()==target and stat.S_ISDIR(s.st_mode) and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13665604,0,61035,0o750),'COMPLETED_INPUT_TARGET_IDENTITY_DIFFERS')
        else:
            for target in (Path(value['sourceRoot']).parent,Path(value['sourceRoot'])):
                s=target.lstat();need(target.resolve()==target and stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o755,'COMPLETED_SOURCE_TARGET_DIFFERS')
        result[phase]={k:v for k,v in expected.items() if k!='leaf'}
        result[phase].update(terminalBytesEqual=True,resultObjectsEqual=True,markerEqualsRoot=True)
    return result


def quiet():
    need(not os.path.lexists(P/'artifact-staging-authorization.json'),'PREVIOUS_INPUT_POLICY_NOT_WITHDRAWN')
    pgdata=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/fresh35-first-production-20261110-r3/data')
    need(not os.path.lexists(pgdata/'postmaster.pid'),'DATABASE_NOT_STOPPED')
    completed=completed_preparation()
    for grant in (GRANT,'5cc58239751e4e2a'):
        worker=B.with_name('grant-'+grant);control=C.with_name('grant-'+grant)
        for phase,key in JOBS.items():
            if grant==GRANT and phase in COMPLETED:continue
            need(not any(os.path.lexists(x)for x in (worker/'jobs'/key,control/'jobs'/key,control/'requests'/(key+'.json'),control/'requests'/(key+'.tmp'),control/'results'/(key+'.json'))),'REMAINING_KEY_PRESENT_NO_REPLAY')
    q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
    need(q.returncode==0 and not q.stdout.strip() and not q.stderr,'ACTIVE_OPERATION_OR_UNKNOWN')
    return completed
'''
# Existing three-file CAS; replace only live baseline, dedicated path and policy/quiet predicates.
s=(OLD/'register_cas.py').read_text();tree=ast.parse(s);n=next(n for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='BASIS'for x in n.targets));lines=s.splitlines(keepends=True)
s=''.join(lines[:n.lineno-1])+'BASIS = {Path(k):v for k,v in '+pprint.pformat(basis,width=130,sort_dicts=False)+'.items()}\nC=Path('+repr(C)+')\nJOBS='+repr(jobs)+'\nEXPECTED_RULES='+pprint.pformat(rules,width=130,sort_dicts=True)+'\nCOMPLETED='+pprint.pformat(expected,width=130,sort_dicts=True)+'\n'+''.join(lines[n.end_lineno:])
s=s.replace("r3-direct33-input02-registration-source-20261116-02","r3-direct33-after-preparation-registration-source-20261116-01").replace("AUDIT = B / 'r3-direct33-input02-registration-cas-20261116-02'","AUDIT = B / 'r3-direct33-after-preparation-registration-cas-20261116-01'").replace("NEW_MODULE = P / 'r3_direct33_input02.py'","NEW_MODULE = P / 'r3_direct33_after_preparation.py'")
s=s.replace("OLD_DISPATCHER = '"+oldapi['OLD_DISPATCHER']+"'","OLD_DISPATCHER = '"+basis[P+'/admin_exec.py']+"'")
s=s.replace('FINAL33_INPUT_REGISTRATION_','FINAL33_AFTER_PREPARATION_').replace('T45_FINAL33_INPUT_REGISTRATION_CAS_V1','T45_FINAL33_AFTER_PREPARATION_WINDOW_CAS_V1').replace('.direct33-input02-', '.direct33-after-preparation-')
s=replace_function(s,'quiet',common)
mainapi=runpy.run_path(str(MAIN/'register_cas.py'));maintext=(MAIN/'register_cas.py').read_text();node=next(n for n in ast.parse(maintext).body if isinstance(n,ast.FunctionDef)and n.name=='validate_policy_delta');validate='\n'.join(maintext.splitlines()[node.lineno-1:node.end_lineno])
validate+='''
 need(policy['expiresAt']==policy['startsAt']+10800000,'EXACT_THREE_HOUR_POLICY_REQUIRED')
 role_pins=[]
 for phase,expected in EXPECTED_RULES.items():
  rule=policy['jobs'][phase];actual=dict(rule);pins=dict(actual['bundlePins'])
  if phase in ('apply','restore'):
   need('roles-authorization.json'in pins,'DYNAMIC_ROLE_PIN_REQUIRED');role_pins.append(pins.pop('roles-authorization.json'))
  actual['bundlePins']=pins
  need(actual==expected,'FROZEN75_STATIC_RULES_DIFFER')
 need(len(role_pins)==2 and role_pins[0]==role_pins[1],'SAME_DYNAMIC_ROLES_PIN_REQUIRED')
'''
s=replace_function(s,'render','''def render(files):
    need(set(files)=={'module','policy','dispatcherTemplate'} and sha(files['module'])==HELPER and sha(files['dispatcherTemplate'])==TEMPLATE,'EXACT_AFTER_PREPARATION_SOURCE_REQUIRED')
    validate_policy_delta(json.loads(files['policy']),{'grantId':GRANT})
    needle=b'R3_ORIGINAL02_ABSENT_POLICY_SHA256 = None'
    need(files['dispatcherTemplate'].count(needle)==1,'EXACT_POLICY_PLACEHOLDER_REQUIRED')
    result=files['dispatcherTemplate'].replace(needle,('R3_ORIGINAL02_ABSENT_POLICY_SHA256 = '+repr(sha(files['policy']))).encode())
    compile(result,str(P/'admin_exec.py'),'exec');compile(files['module'],str(NEW_MODULE),'exec')
    return result
''')
s=s.replace('def render(files):',validate+'\n\ndef render(files):',1)
start=s.index('        predecessor=core.strict(read(NEW_POLICY)[0])');end=s.index('        candidate=ModuleType',start)
s=s[:start]+'''        validate_policy_delta(policy,predecessor if False else {'grantId':GRANT})
        need(sha(read(NEW_POLICY)[0])=='0d18b5d6e60e4709f814bc43bc64d6f725445a6c4df38425e5f0fe2cc56ebcd5'
             and policy['startsAt']==a['startsAt'] and now()+5100000<policy['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'EXACT_NEW_UNUSED_WINDOW_REQUIRED')
'''.replace("predecessor if False else ","")+s[end:]
s=s.replace('EXACT_MAIN9_INPUT02_SUCCESSOR_REGISTERED_NO_PHASE_SUBMITTED','EXACT_MAIN9_AFTER_PREPARATION_WINDOW_REGISTERED_NO_PHASE_SUBMITTED')
# New module name only in wrapper; exact a48 helper bytes are preserved.
template=(OLD/'admin_exec.INPUT02-UNREGISTERED.py').read_bytes();assert template.count(b"PUBLIC/'r3_direct33_input02.py'")==1
template=template.replace(b"PUBLIC/'r3_direct33_input02.py'",b"PUBLIC/'r3_direct33_after_preparation.py'");s=s.replace("TEMPLATE = '"+oldapi['TEMPLATE']+"'","TEMPLATE = '"+sha(template)+"'")
put('register_cas.py',s);(HERE/'r3_direct33_after_preparation.py').write_bytes((OLD/'r3_direct33_input02.py').read_bytes());(HERE/'admin_exec.AFTER-PREPARATION-UNREGISTERED.py').write_bytes(template)
carrier=(OLD/'original-cas-input02-carrier.UNISSUED.py').read_text().replace('r3-direct33-input02-registration-source-20261116-02','r3-direct33-after-preparation-registration-source-20261116-01').replace('r3-direct33-input02-registration-cas-20261116-02','r3-direct33-after-preparation-registration-cas-20261116-01').replace('FINAL33_INPUT_REGISTRATION_','FINAL33_AFTER_PREPARATION_').replace('EXACT_MAIN9_INPUT02_SUCCESSOR_REGISTERED_NO_PHASE_SUBMITTED','EXACT_MAIN9_AFTER_PREPARATION_WINDOW_REGISTERED_NO_PHASE_SUBMITTED')
carrier=carrier.replace("SOURCE='184e5c81f71fa86a2d40bd23881a121da0f47d1c2ff26408aaf82d85ef01dee1'","SOURCE='"+sha(s.encode())+"'")
put('original-cas-after-preparation-carrier.UNISSUED.py',carrier)
# Standalone root read-only reader: no issuer/CAS publication/put functions.
api=runpy.run_path(str(HERE/'register_cas.py'));tree=ast.parse(s);names={'need','sha','now','identity','read','check_completed_value','completed_preparation','quiet'}
reader='''"""Standalone fresh metadata reader; no PG, authorization issuance or writes."""\nfrom pathlib import Path\nfrom datetime import datetime,timezone\nimport hashlib,json,os,stat,subprocess,time\n'''
for key in ['GRANT','B','P','C','H','LOCK','LOCK_ID','JOBS','COMPLETED']:
 value=api[key];reader+=key+' = '+('Path('+repr(str(value))+')'if isinstance(value,Path)else pprint.pformat(value,width=130,sort_dicts=True))+'\n'
reader+='BASIS = '+pprint.pformat({str(k):v for k,v in api['BASIS'].items()},width=130,sort_dicts=True)+'\n'
for n in tree.body:
 if isinstance(n,ast.FunctionDef)and n.name in names:reader+='\n'+'\n'.join(s.splitlines()[n.lineno-1:n.end_lineno])+'\n'
reader+='''
def main():
    actual={};identities={};mismatch=[]
    for name,pin in BASIS.items():
        raw,meta=read(Path(name));actual[name]=sha(raw);identities[name]=meta
        if actual[name]!=pin:mismatch.append(name)
    need(not mismatch,'ACTUAL_BASIS_MISMATCH')
    identities['executionLock']=identity(LOCK.lstat());need(identities['executionLock']==LOCK_ID,'ORIGINAL_LOCK_CHANGED')
    completed=quiet();grant_raw,_=read(P/'grant.json');grant=json.loads(grant_raw)
    print(json.dumps({'state':'READONLY_AFTER_PREPARATION_REGISTRATION_BASIS','checkedAtUTC':datetime.now(timezone.utc).isoformat(),
      'actualPins':actual,'oldIdentities':identities,'basisMismatches':mismatch,'executionLockMatches':True,'activeOperationUnits':[],
      'candidateKeys':list(JOBS.values()),'presentCandidateKeys':[],'remainingCandidateKeys':[v for k,v in JOBS.items()if k not in COMPLETED],'alreadyCompletedCandidateKeys':[JOBS[k]for k in COMPLETED],'completedPreparation':completed,
      'acceptedMaterializationSha256':COMPLETED['materialize']['rootResultSha256'],'grantExpiresAtEpoch':grant['expiresAtEpoch'],
      'grantSha256':sha(grant_raw),'PGConnections':0,'mutations':0,'authorityIssued':False},sort_keys=True))
if __name__=='__main__':main()
''';put('read_registration_basis.py',reader)
w.update(materializationAlreadyCompleted=True,inputMaterializationAlreadyCompleted=True,inputMaterializeNeverResubmit=True,executionOrder=['apply','start','catalog_update','prepare','writer','stop','restore'],expectedMaterializationEvidence='ACTUAL_COMPLETED_ROOT06_ROOT_PUBLIC_OBJECT_AND_OPERATOR_MARKER',actualCompletedPreparation=expected,completionReadbackRefs={k:{'path':str(T/rel),'sha256':pin}for k,rel,pin in [('input_materialize','INPUT02-SUCCESSOR-01/ACTUAL-INPUT02-KEY-COMPLETED.json','aefdacd67a9142b77d1fb2dbb6366f0a69033ab802fe11a461919bf8cc73a5f0'),('materialize','MAIN9-EXECUTION-01/ACTUAL-MATERIALIZE-COMPLETED.json','edf63f6072813ef13cd70794b5bcf0b5b31b10d001f5a3ef6c6e2376f98e2a19')]},status='LOCAL_AFTER_PREPARATION_WINDOW_CANDIDATE_UNISSUED')
(HERE/'NINE-PHASES.UNISSUED.json').write_text(json.dumps(w,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
# Reuse dynamic main issuer; change only preparation-state checks and local carrier paths.
s=(MAIN/'issue_registration.py').read_text().replace('ROOT = HERE.parents[3]','ROOT = HERE.parents[2]')
s=s.replace("review['state'] == 'FINAL_SAME_VERSION_NORMAL_CHAIN_SOURCE_PASS'","review['state'] == 'SOURCE_PASS_AFTER_PREPARATION_WINDOW_ONLY' and review['findings']==[]")
s=s.replace("review['normalStartupHoldClosed'] is True","review['sourceOnly'] is True")
s=s.replace("witness['materializationAlreadyCompleted'] is False","witness['materializationAlreadyCompleted'] is True and witness['inputMaterializationAlreadyCompleted'] is True")
a=s.index("    assert basis['activeOperationUnits'] == basis['presentCandidateKeys'] == []");b=s.index("    assert basis['actualPins'][str(cas['P']",a)
s=s[:a]+'''    assert basis['activeOperationUnits'] == basis['presentCandidateKeys'] == []
    assert set(basis['candidateKeys']) == set(jobs.values())
    assert basis['completedPreparation'] == {phase:{**{k:v for k,v in row.items()if k!='leaf'},'terminalBytesEqual':True,'resultObjectsEqual':True,'markerEqualsRoot':True}for phase,row in cas['COMPLETED'].items()}
    for phase, ref in witness['completionReadbackRefs'].items():
        actual=json.loads(checked(ref['path'],ref['sha256']))
        value=actual['final33-input-materialization-result.json']['value']if phase=='input_materialize'else actual['result']
        cas['check_completed_value'](phase,actual['terminal'],value)
'''+s[b:]
s=s.replace("basis['acceptedMaterializationSha256'] == 'e8f8032b00601e976c094f0365064d0385d7af8f48f9f7bbb465dca896bf3a5e'","'e8f8032b00601e976c094f0365064d0385d7af8f48f9f7bbb465dca896bf3a5e'")
s=s.replace("'r3_direct33_batched.py'","'r3_direct33_after_preparation.py'").replace("'admin_exec.DIRECT33-UNREGISTERED.py'","'admin_exec.AFTER-PREPARATION-UNREGISTERED.py'").replace("'original-cas-direct33-carrier.UNISSUED.py'","'original-cas-after-preparation-carrier.UNISSUED.py'").replace("cas['render_dispatcher']","cas['render']")
s=s.replace("assert basis['basisMismatches'] == [] and basis['executionLockMatches'] is True","assert basis['basisMismatches'] == [] and basis['executionLockMatches'] is True\n    for leaf,row in review['files'].items():\n        assert Path(leaf).name==leaf and sha((HERE/leaf).read_bytes())==row['sha256']")
s=s.replace("    host['validate'](host_authority, 'apply', now)","    host['validate'](host_authority, 'apply', now)\n    assert roles['expiresAt']<roles['controllerValidUntil']<roles['backupAdminValidUntil']<roles['restorationDeadline']<=now+10_800_000<=grant_limit")
s=s.replace("'original-cas-direct33-carrier.ISSUED.py'","'original-cas-after-preparation-carrier.ISSUED.py'").replace("ISSUED_RETAINED_DB05_REGISTRATION_NO_SERVER_ACTION","ISSUED_AFTER_PREPARATION_WINDOW_NO_PHASE_SUBMITTED")
s=s.replace("    for leaf,row in review['files'].items():\n","    assert {'register_cas.py','r3_direct33_after_preparation.py','admin_exec.AFTER-PREPARATION-UNREGISTERED.py','original-cas-after-preparation-carrier.UNISSUED.py','read_registration_basis.py','issue_registration.py','issue_phase.py','NINE-PHASES.UNISSUED.json'}<=set(review['files'])\n    for leaf,row in review['files'].items():\n")
put('issue_registration.py',s)
# Keep existing native/start/actual-C generation bodies; only top-level dispatch.
s=(OLD/'issue_phase.py').read_text().replace('CONTROL = HERE.parent.parent',"CONTROL = HERE.parents[2] / 'outputs/主控'").replace('ROOT = HERE.parents[3]','ROOT = HERE.parents[2]')
s=s.replace("    assert witness['materializeNeverResubmit'] is True and witness['materializationAlreadyCompleted'] is False","    assert phase in ('apply','start','catalog_update','prepare','writer','stop','restore'), 'Completed input02/ROOT06 must never be reissued'\n    assert witness['materializeNeverResubmit'] is True and witness['materializationAlreadyCompleted'] is True and witness['inputMaterializationAlreadyCompleted'] is True\n    assert witness['inputMaterializeNeverResubmit'] is True\n    for done,ref in witness['completionReadbackRefs'].items():\n        actual=read(ref['path'],ref['sha256']);expected=witness['actualCompletedPreparation'][done]\n        value=actual['final33-input-materialization-result.json']['value']if done=='input_materialize'else actual['result']\n        assert value==expected['value'] and (actual['terminal']['jobId'],actual['terminal']['status'],actual['terminal']['exitCode'],actual['terminal']['phaseStarted'])==(expected['requestKey'],'COMPLETED',0,True)")
a=s.index("    if phase=='input_materialize':",s.index('def issue('));b=s.index("    elif phase=='start':",a)
s=s[:a]+'''    if phase=='apply':
        authority=read(issued/'host-authorization.json',manifest['applyHostSha256'])
        assert authority['rolesAuthoritySha256']==manifest['rolesSha256'] and authority['expiresAt']==roles['expiresAt']
        host=api(folder/rule['script'],rule);host['validate'](authority,'apply',now)
'''+s[b:]
s=s.replace("    directory=CONTROL/('20261116-r3-direct-service33-'+phase+'-window-01')","    directory=CONTROL/('20261116-r3-direct-service33-'+phase+'-after-preparation-window-01')")
put('issue_phase.py',s)
print(json.dumps({'basisEntries':len(basis),'staticPins':sum(len(r['bundlePins'])for r in rules.values()),'helperByteEqual':sha((HERE/'r3_direct33_after_preparation.py').read_bytes())==oldapi['HELPER'],'sourceOnly':True}))
