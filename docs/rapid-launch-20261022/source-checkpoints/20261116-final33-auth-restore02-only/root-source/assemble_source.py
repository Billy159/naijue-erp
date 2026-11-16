from pathlib import Path
import ast,hashlib,json,pprint,runpy
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];PREV=HERE.parent/'20261116-r3-after-preparation-window-source-01';T=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01';HOST=T/'AUTH-RESTORE33-SUCCESSOR-01';REG=ROOT/'outputs/主控/20261116-r3-direct-service33-after-preparation-registration-window-01';OLD=ROOT/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE33-INPUT02-SUCCESSOR-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def put(name,s):
 if name.endswith('.py'):compile(s,name,'exec')
 (HERE/name).write_text(s)
def function(s,name):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)and n.name==name);return '\n'.join(s.splitlines()[n.lineno-1:n.end_lineno])+'\n'
def replacefun(s,name,new):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)and n.name==name);l=s.splitlines(keepends=True);return ''.join(l[:n.lineno-1])+new.rstrip()+'\n'+''.join(l[n.end_lineno:])
def assign(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));l=s.splitlines(keepends=True);return ''.join(l[:n.lineno-1])+name+' = '+value+'\n'+''.join(l[n.end_lineno:])
assert sha((HOST/'SOURCE-PINS.json').read_bytes())=='9f16aae184896fda45c79e124db496b2644a681f3744d8561972117dbfb8c9f5'
host=json.loads((HOST/'SOURCE-PINS.json').read_bytes());original=json.loads((REG/'ISSUED.json').read_bytes());roles_raw=(REG/'roles-authorization.json').read_bytes();assert sha(roles_raw)==host['externallyIssuedLeaves']['roles-authorization.json']['sha256']==original['rolesSha256'];roles=json.loads(roles_raw)
policy_raw=(REG/'direct33-batched-real.json').read_bytes();assert sha(policy_raw)==original['policySha256'];previous=json.loads(policy_raw);policy=json.loads(policy_raw);NEWKEY=host['jobId']
policy['jobs']['restore']={**previous['jobs']['restore'],'jobId':NEWKEY,'bundlePins':{**host['bundlePins'],'roles-authorization.json':sha(roles_raw)}}
assert all(policy['jobs'][k]==v for k,v in previous['jobs'].items()if k!='restore')
put('POLICY.RESTORE02.UNISSUED.json',json.dumps(policy,sort_keys=True,indent=2)+'\n')
base=runpy.run_path(str(PREV/'register_cas.py'));B=base['B'];P=base['P'];C=base['C'];H=base['H'];mainpolicy=base['NEW_POLICY'];newmodule=P/'r3_direct33_restore02_only.py';newpolicy=H/'direct33-restore02-only.json';audit=B/'r3-restore33-only-registration-cas-20261116-01';entry=B/'r3-restore33-only-registration-source-20261116-01/register_cas.py'
basis=dict(base['BASIS']);basis[P/'admin_exec.py']=original['dispatcherSha256'];basis[mainpolicy]=original['policySha256'];basis[P/'r3_direct33_after_preparation.py']=base['HELPER'];basis[B/'r3-direct33-after-preparation-registration-cas-20261116-01/result.json']='c0321dc4084523b38909646179798eef2d2fd748ec85863bd651558532c3044e'
used={}
for phase,rel,pin,leaf in [('apply','ACTUAL-APPLY-COMPLETED.json','90214088440ad520ec15db8ed319e44575ddc8d46ff9df5adc7541b2ee244950','maintenance-auth-result.json'),('start','ACTUAL-START-FAILED-01.json','9e2a0abb672daff71941282dd43f7683e92b31c29401dc8d45c5b6d54115a202','normal-service-result.json'),('restore01','ACTUAL-RESTORE-FAILED-01.json','112cababb9cb9a080e8bcc3ea61db5614ffb5aff8e7197f4af0c1ae4c6abee16','maintenance-auth-result.json')]:
 p=T/'RUNTIME-WINDOW-SUCCESSOR-01'/rel;assert sha(p.read_bytes())==pin;v=json.loads(p.read_bytes());key=v['requestKey'];used[phase]={'requestKey':key,'terminalSha256':v['rootPins']['terminal'],'rootResultSha256':v['rootPins']['result'],'publicResultSha256':v['publicResultSha256'],'leaf':leaf,'terminalStatus':v['terminal']['status'],'exitCode':v['terminal']['exitCode'],'value':v['result']}
 basis[B/'jobs'/key/'r3-outer-terminal.json']=v['rootPins']['terminal'];basis[B/'jobs'/key/'results'/leaf]=v['rootPins']['result']
start=json.loads((T/'RUNTIME-WINDOW-SUCCESSOR-01/ACTUAL-START-FAILED-01.json').read_bytes());boot=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services')/used['start']['requestKey'];custody=boot.parent/'ordinary33-auth-20261116-01'
basis[boot/'failed-start-cleanup.json']=start['cleanupRootSha256'];basis[B/'jobs'/used['start']['requestKey']/'results/normal-service-incomplete.json']=start['incompleteRootSha256'];basis[Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-33.json')]=start['currentProofSha256'];basis[B/'jobs'/used['restore01']['requestKey']/'bundle/ordinary05_roles_job.py']='ad07197b1e4785a2b13f9ee6cd62d14cf8010f0ab56de4e8e7956ce6934a5673';basis[B/'jobs'/used['restore01']['requestKey']/'bundle/host-authorization.json']='6bb04430023adc383c6c999c5e76fbf73ca0bc521eb8def228c4f483b6fb546a';basis[custody/'authority.json']=sha(roles_raw)
common='''def validate_used_value(phase,terminal,value):
    e=USED[phase]
    need((terminal.get('jobId'),terminal.get('status'),terminal.get('exitCode'),terminal.get('phaseStarted'))==(e['requestKey'],e['terminalStatus'],e['exitCode'],True),'EXACT_USED_TERMINAL_REQUIRED')
    need(value==e['value'],'EXACT_USED_RESULT_REQUIRED')

def required_history():
    completed=completed_preparation()
    for phase,e in USED.items():
        key=e['requestKey'];terminal=read(B/'jobs'/key/'r3-outer-terminal.json')[0];public_t=read(C/'results'/(key+'.json'),1000)[0]
        root=read(B/'jobs'/key/'results'/e['leaf'])[0];public=read(C/'jobs'/key/'results'/e['leaf'],1000)[0]
        need(sha(terminal)==e['terminalSha256'] and terminal==public_t,'EXACT_USED_TERMINAL_BYTES_REQUIRED')
        need(sha(root)==e['rootResultSha256'] and sha(public)==e['publicResultSha256'] and json.loads(root)==json.loads(public),'EXACT_USED_RESULT_OBJECTS_REQUIRED')
        validate_used_value(phase,json.loads(terminal),json.loads(root))
    for phase in ('catalog_update','prepare','writer','stop'):
        key=ORIGINAL_JOBS[phase]
        for grant in (GRANT,'5cc58239751e4e2a'):
            worker=B.with_name('grant-'+grant);control=C.with_name('grant-'+grant)
            need(not any(os.path.lexists(p)for p in (worker/'jobs'/key,control/'jobs'/key,control/'requests'/(key+'.json'),control/'requests'/(key+'.tmp'),control/'results'/(key+'.json'))),'BUSINESS_KEY_PRESENT_NO_REPLAY')
    failed=B/'jobs'/USED['restore01']['requestKey']
    need(not any(os.path.lexists(p)for p in (failed/'results/maintenance-auth-intent.json',failed/'results/maintenance-auth-inside.json',failed/'results/maintenance-auth-cleanup.json',CUSTODY/'restore-attempt.json',CUSTODY/'restored.json')),'ORIGINAL_RESTORE_ENTERED_OR_UNKNOWN')
    need(sha(read(CUSTODY/'authority.json')[0])==ROLE_SHA,'ORIGINAL_ROLE_AUTHORITY_CHANGED')
    cleanup=read(BOOT/'failed-start-cleanup.json')[0];incomplete=read(B/'jobs'/USED['start']['requestKey']/'results/normal-service-incomplete.json')[0]
    need(sha(cleanup)==CLEANUP_SHA and sha(incomplete)==INCOMPLETE_SHA,'FAILED_START_CLEAN_STOP_CHANGED')
    value=json.loads(cleanup);need(value['status']=='NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED' and value['originalPGDATAAndCleanStateVerified'] is True and value['dataDirectoryIdentity']=={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':448},'REAL_CLEAN_STOP_REQUIRED')
    custody={}
    for path in CUSTODY_FILES:
        p=Path(path);s=p.lstat();need(p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400 and 0<s.st_size<=65536,'ORIGINAL_PRIVATE_CUSTODY_REQUIRED');custody[path]=identity(s)
    return custody

def quiet():
    need(not os.path.lexists(P/'artifact-staging-authorization.json'),'PREVIOUS_INPUT_POLICY_NOT_WITHDRAWN')
    need(not os.path.lexists(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/fresh35-first-production-20261110-r3/data/postmaster.pid')),'PG_PID_PRESENT')
    required_history()
    for grant in (GRANT,'5cc58239751e4e2a'):
        worker=B.with_name('grant-'+grant);control=C.with_name('grant-'+grant)
        need(not any(os.path.lexists(p)for p in (worker/'jobs'/NEWKEY,control/'jobs'/NEWKEY,control/'requests'/(NEWKEY+'.json'),control/'requests'/(NEWKEY+'.tmp'),control/'results'/(NEWKEY+'.json'))),'RESTORE02_ALREADY_PRESENT_NO_REPLAY')
    q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
    need(q.returncode==0 and not q.stdout.strip() and not q.stderr,'ACTIVE_OPERATION_OR_UNKNOWN')
    q=subprocess.run(['/usr/bin/docker','inspect','--format','{{.State.Running}} {{.State.Pid}}',FAILED_CONTAINER],capture_output=True,timeout=5)
    need(q.returncode==0 and not q.stderr and q.stdout.strip()==b'false 0','FAILED_START_CONTAINER_NOT_STOPPED')
'''
constants={'USED':used,'ORIGINAL_JOBS':{k:v['jobId']for k,v in previous['jobs'].items()},'NEWKEY':NEWKEY,'CUSTODY':custody,'CUSTODY_FILES':[str(custody/x)for x in ('original-auth.json','finite-auth.json','applied.json')],'BOOT':boot,'ROLE_SHA':sha(roles_raw),'RESTORATION_DEADLINE':roles['restorationDeadline'],'PARENT_EXPIRES':previous['expiresAt'],'CLEANUP_SHA':start['cleanupRootSha256'],'INCOMPLETE_SHA':start['incompleteRootSha256'],'FAILED_CONTAINER':start['incomplete']['cid']}
consttext='\n'.join(k+' = '+('Path('+repr(str(v))+')'if isinstance(v,Path)else pprint.pformat(v,width=130,sort_dicts=True))for k,v in constants.items())+'\n'
# Narrow helper: retain original source body, but one restore02 route only.
helper=(OLD/'r3_direct33_input02.py').read_text();helper=helper.replace("POLICY_NAME = 'direct33-batched-real.json'","POLICY_NAME = 'direct33-restore02-only.json'");jobs={k:v['jobId']for k,v in policy['jobs'].items()};helper=assign(helper,'JOBS',repr(jobs))
prefix='from pathlib import Path\nimport hashlib,json,os,stat,subprocess,time\nGRANT='+repr(base['GRANT'])+'\nB=Path('+repr(str(B))+')\nP=Path('+repr(str(P))+')\nC=Path('+repr(str(C))+')\nCOMPLETED='+pprint.pformat(base['COMPLETED'],width=130)+'\n'+consttext+"AUTH_TEMPLATE="+pprint.pformat(json.loads((HOST/'HOST-AUTHORITY.UNISSUED.json').read_bytes()),width=130)+'\n'
meta='\n'.join(function((PREV/'register_cas.py').read_text(),n)for n in ['need','sha','identity','read','check_completed_value','completed_preparation'])
helper=helper[:helper.index('class Original02AbsentContinuation:')]+prefix+meta+'\n'+common[:common.index('def quiet():')]+helper[helper.index('class Original02AbsentContinuation:'):]
helper=helper.replace("        authority = self.frozen(phase, job, private)","        self.need(phase=='restore' and job.get('jobId')==NEWKEY,'RESTORE02_ONLY_NO_BUSINESS_ACTION')\n        authority = self.frozen(phase, job, private)\n        required_history()\n        self.need(set(authority)==set(AUTH_TEMPLATE) and all(authority[k]==v for k,v in AUTH_TEMPLATE.items()if k not in {'startsAt','expiresAt','independentReviewSha256','authorizationReference'}) and authority['expiresAt']<=RESTORATION_DEADLINE,'EXACT_RESTORE02_AUTHORITY_ONLY')")
# No fallback into readonly/other actions through this dedicated continuation.
helper=helper.replace("        if phase is None:\n            return self.readonly.admit(job, private)","        if phase is None:\n            self.need(False,'RESTORE02_ONLY_NO_OTHER_ACTION')")
put('r3_direct33_restore02_only.py',helper)
# New wrapper uses the original live main source; leave original main/module intact.
template=(REG/'admin_exec.ISSUED.py').read_text();assert sha(template.encode())==original['dispatcherSha256'];template=template.replace("R3_ORIGINAL02_ABSENT_POLICY_SHA256 = '"+original['policySha256']+"'","R3_ORIGINAL02_ABSENT_POLICY_SHA256 = None").replace("R3_ORIGINAL02_ABSENT_SOURCE_SHA256 = '"+base['HELPER']+"'","R3_ORIGINAL02_ABSENT_SOURCE_SHA256 = '"+sha(helper.encode())+"'").replace("PUBLIC/'r3_direct33_after_preparation.py'","PUBLIC/'r3_direct33_restore02_only.py'")
node=next(n for n in ast.parse(template).body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='R3_ORIGINAL02_ABSENT_KEYS'for x in n.targets));keys=ast.literal_eval(node.value);assert NEWKEY not in keys;keys.append(NEWKEY);template=assign(template,'R3_ORIGINAL02_ABSENT_KEYS',repr(keys));put('admin_exec.RESTORE33-UNREGISTERED.py',template)
# Reuse exact three-file CAS I/O, lock and rollback-unknown publication pattern.
s=(PREV/'register_cas.py').read_text();tree=ast.parse(s);n=next(n for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='BASIS'for t in n.targets));ls=s.splitlines(keepends=True);s=''.join(ls[:n.lineno-1])+'BASIS = {Path(k):v for k,v in '+pprint.pformat({str(k):v for k,v in basis.items()},width=130)+'.items()}\n'+''.join(ls[n.end_lineno:])
for key,value in [('ENTRY','Path('+repr(str(entry))+')'),('AUDIT','Path('+repr(str(audit))+')'),('NEW_MODULE','Path('+repr(str(newmodule))+')'),('NEW_POLICY','Path('+repr(str(newpolicy))+')'),('OLD_DISPATCHER',repr(original['dispatcherSha256'])),('HELPER',repr(sha(helper.encode()))),('TEMPLATE',repr(sha(template.encode())))]:s=assign(s,key,value)
s=s.replace('FINAL33_AFTER_PREPARATION_','RESTORE33_ONLY_REGISTRATION_').replace('T45_FINAL33_AFTER_PREPARATION_WINDOW_CAS_V1','T45_RESTORE33_ONLY_REGISTRATION_CAS_V1').replace('EXACT_MAIN9_AFTER_PREPARATION_WINDOW_REGISTERED_NO_PHASE_SUBMITTED','EXACT_RESTORE33_ONLY_REGISTERED_NO_PHASE_SUBMITTED').replace('.direct33-after-preparation-','.restore33-only-')
s=replacefun(s,'quiet',common)
s=s.replace('def validate_policy_delta(',consttext+'\nORIGINAL_POLICY='+pprint.pformat(previous,width=130)+'\nRESTORE_POLICY='+pprint.pformat(policy,width=130)+'\n\ndef validate_policy_delta(',1)
s=replacefun(s,'validate_policy_delta',"def validate_policy_delta(policy, previous):\n    need(policy==RESTORE_POLICY and previous==ORIGINAL_POLICY,'EXACT_RESTORE02_POLICY_ONLY')\n    need(all(policy[k]==previous[k]for k in ('format','grantId','startsAt','expiresAt')) and all(policy['jobs'][k]==v for k,v in previous['jobs'].items()if k!='restore'),'ORIGINAL_CLOCK_AND_BUSINESS_RULES_CHANGED')\n")
s=s.replace("validate_policy_delta(json.loads(files['policy']),{'grantId':GRANT})","validate_policy_delta(json.loads(files['policy']),ORIGINAL_POLICY)")
s=s.replace("{'executionLock'}, 'EXACT_INPUT_KEYS_REQUIRED')","{'executionLock'} | set(CUSTODY_FILES), 'EXACT_INPUT_KEYS_REQUIRED')")
s=s.replace("    for path,pin in BASIS.items():","    for private in CUSTODY_FILES:\n        need(identity(Path(private).lstat())==a['oldIdentities'][private],'ORIGINAL_PRIVATE_CUSTODY_CHANGED')\n    for path,pin in BASIS.items():",1)
scope=function(s,'scope');scope=scope.replace("sourceRegistrationOnly=True, businessDatabaseWrites=0, oldHistoryChanged=False)","sourceRegistrationOnly=True,businessDatabaseWrites=0,oldHistoryChanged=False,restoreRequestKey=NEWKEY,rolesAuthoritySha256=ROLE_SHA,rolesLifetimeExtended=False)");s=replacefun(s,'scope',scope)
register=function(s,'register');a=register.index('        validate_policy_delta(');b=register.index('        candidate=ModuleType',a);register=register[:a]+"        validate_policy_delta(policy,core.strict(read(H/'direct33-batched-real.json')[0]))\n        need(now()+300000<RESTORATION_DEADLINE and now()<policy['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'ORIGINAL_RESTORATION_WINDOW_ONLY')\n"+register[b:]
register=register.replace("put(AUDIT / 'old-policy.bin',read(NEW_POLICY)[0])","put(AUDIT / 'old-policy.bin',read(H/'direct33-batched-real.json')[0])")
a=register.index("            pending_policy=H/");b=register.index("            result['published'].append('policy')",a);register=register[:a]+"            need(not os.path.lexists(NEW_POLICY),'RESTORE_POLICY_ALREADY_PRESENT')\n            put(NEW_POLICY,files['policy'])\n"+register[b:]
register=register.replace("snapshot(a,policy=sha(files['policy']))","snapshot(a)").replace("snapshot(a,sha(new),sha(files['policy']))","snapshot(a,sha(new))")
register=register.replace("need(not any(os.path.lexists(path) for path in (AUDIT, NEW_MODULE,","need(not any(os.path.lexists(path) for path in (AUDIT, NEW_MODULE, NEW_POLICY,")
s=replacefun(s,'register',register);put('register_cas.py',s)
carrier=(PREV/'original-cas-after-preparation-carrier.UNISSUED.py').read_text().replace('r3-direct33-after-preparation-registration-source-20261116-01','r3-restore33-only-registration-source-20261116-01').replace('r3-direct33-after-preparation-registration-cas-20261116-01','r3-restore33-only-registration-cas-20261116-01').replace('FINAL33_AFTER_PREPARATION_','RESTORE33_ONLY_REGISTRATION_').replace('EXACT_MAIN9_AFTER_PREPARATION_WINDOW_REGISTERED_NO_PHASE_SUBMITTED','EXACT_RESTORE33_ONLY_REGISTERED_NO_PHASE_SUBMITTED')
carrier=assign(carrier,'SOURCE',repr(sha(s.encode()))).replace('SOURCE = ','SOURCE=',1);put('original-cas-restore33-carrier.UNISSUED.py',carrier)
# Standalone reader duplicates only protected reads and the fixed state predicates.
a=runpy.run_path(str(HERE/'register_cas.py'));reader='from pathlib import Path\nfrom datetime import datetime,timezone\nimport hashlib,json,os,stat,subprocess,time\n'
for k in ['GRANT','B','P','C','H','LOCK','LOCK_ID','JOBS','COMPLETED',*constants]:
 v=a[k];reader+=k+' = '+('Path('+repr(str(v))+')'if isinstance(v,Path)else pprint.pformat(v,width=130))+'\n'
reader+='BASIS='+pprint.pformat({str(k):v for k,v in basis.items()},width=130)+'\n'
for name in ['need','sha','now','identity','read','check_completed_value','completed_preparation','validate_used_value','required_history','quiet']:reader+='\n'+function(s,name)
reader+='''
def main():
    actual={};identities={}
    for name,pin in BASIS.items():
        raw,meta=read(Path(name));need(sha(raw)==pin,'BASIS_CHANGED');actual[name]=pin;identities[name]=meta
    identities.update(required_history());identities['executionLock']=identity(LOCK.lstat());need(identities['executionLock']==LOCK_ID,'ORIGINAL_LOCK_CHANGED')
    quiet();grant=json.loads(read(P/'grant.json')[0])
    print(json.dumps({'state':'READONLY_RESTORE33_ONLY_BASIS','checkedAtUTC':datetime.now(timezone.utc).isoformat(),'actualPins':actual,'oldIdentities':identities,'basisMismatches':[],'executionLockMatches':True,'activeOperationUnits':[],'restore02Unused':True,'restorationDeadline':RESTORATION_DEADLINE,'policyExpiresAt':PARENT_EXPIRES,'grantExpiresAtEpoch':grant['expiresAtEpoch'],'rolesAuthoritySha256':ROLE_SHA,'PGConnections':0,'mutations':0},sort_keys=True))
if __name__=='__main__':main()
''';put('read_registration_basis.py',reader)
print(json.dumps({'basisEntries':len(basis),'restorationDeadline':roles['restorationDeadline'],'newKey':NEWKEY,'originalPolicyUnchanged':True,'hostPinsPaired':host['bundlePins']}))
