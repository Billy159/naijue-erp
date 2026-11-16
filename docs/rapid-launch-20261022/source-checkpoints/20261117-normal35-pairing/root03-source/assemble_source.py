"""Generate the normal35 root source only after exact final consumer pins are supplied."""
from pathlib import Path
import ast,hashlib,json,pprint,runpy,sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
PREV=HERE.parent/'20261117-r3-normal34-apply02-root-source-02'
sha=lambda b:hashlib.sha256(b).hexdigest()
def checked(path,pin):
 b=path.read_bytes();assert sha(b)==pin,path;return b
def put(name,s):
 if name.endswith('.py'):compile(s,name,'exec')
 (HERE/name).write_text(s)
def assign(s,name,value,all_assignments=False):
 ns=[n for n in ast.parse(s).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in n.targets)]
 assert ns,name
 if not all_assignments:ns=ns[:1]
 lines=s.splitlines(keepends=True)
 for n in reversed(ns):lines[n.lineno-1:n.end_lineno]=[name+' = '+value+'\n']
 return ''.join(lines)
def function(s,name):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef) and n.name==name)
 return '\n'.join(s.splitlines()[n.lineno-1:n.end_lineno])+'\n'
def replacefun(s,name,new):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef) and n.name==name);lines=s.splitlines(keepends=True)
 return ''.join(lines[:n.lineno-1])+new.rstrip()+'\n'+''.join(lines[n.end_lineno:])
def const(name,value):return name+' = '+pprint.pformat(value,width=130,sort_dicts=True)+'\n'

assert len(sys.argv)==5,'PENDING: exact consumer directory/source/interface/phase pins required'
NORMAL=Path(sys.argv[1]).resolve();source_pin,interface_pin,phase_pin=sys.argv[2:]
assert NORMAL.is_relative_to(ROOT/'outputs/T45/revisions')
frozen=json.loads(checked(NORMAL/'SOURCE-PINS.json',source_pin))
for leaf,row in frozen['files'].items():
 raw=checked(NORMAL/leaf,row['sha256']);assert len(raw)==row['bytes']
interface=json.loads(checked(NORMAL/'INTERFACE.UNISSUED.json',interface_pin))
phases=json.loads(checked(NORMAL/'PHASES35.UNISSUED.json',phase_pin))
assert Path(interface['executionCLI']['source']).resolve()==NORMAL/'phase_cli.py','EXECUTION_CLI_MUST_BE_IN_THIS_EXACT_CONSUMER_DIRECTORY'
assert interface['rootConsumerPolicyRelativePath']=='r3-05-write-continuity/direct35-batched-real.json'
facts=json.loads((HERE/'CURRENT-FACTS.json').read_bytes());base=runpy.run_path(str(PREV/'register_cas.py'),run_name='local_constants_only')
prior=runpy.run_path(str(NORMAL/'start/bundle/prior_failed34.py'),run_name='local_prior_constants_only')
assert prior['SERVICE']==facts['start34ServiceTuple']
bindings=prior['binding']();closed=facts['closed34']
expected={'previousTerminalSha256':closed['start']['terminalSha256'],'previousResultSha256':closed['start']['publicResultSha256'],
 'previousCleanupSha256':facts['start34CleanupSha256'],'previousCurrentProofSha256':facts['start34CurrentProofSha256'],
 'previousIncompleteRootSha256':facts['start34IncompleteRootSha256'],'previousRetainedAckSha256':facts['start34RetainedAckSha256'],
 'restoreTerminalSha256':closed['restore']['terminalSha256'],'restoreResultSha256':closed['restore']['publicResultSha256']}
assert bindings==expected
assert all(interface['actualPredecessorTuple'][key]==value for key,value in facts['start34ServiceTuple'].items())
assert phases['predecessor']=={'service':facts['start34ServiceTuple'],'bindings':expected},'FINAL_NORMATIVE_PREDECESSOR_MUST_BE_REAL34'
w=json.loads((PREV/'NINE-PHASES.UNISSUED.json').read_bytes());fields=('jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField')
for phase,row in phases['jobs'].items():w['jobs'][phase]={key:row[key] for key in fields};w['phaseDirectories'][phase]=row['sourceDirectory']
jobs={key:row['jobId'] for key,row in w['jobs'].items()}
assert {key:jobs[key] for key in ('apply','start','stop','restore')}=={
 'apply':'t45-r3-ordinary35-auth-apply-20261116-01','start':'t45-first-r3-native-service-start-20261116-35',
 'stop':'t45-r3-ordinary35-preserve-stop-20261116-01','restore':'t45-r3-ordinary35-auth-restore-20261116-01'}
assert all(jobs[key]==base['JOBS'][key] for key in ('catalog_update','prepare','writer','input_materialize','materialize'))
w.update(historicalPredecessor33=w['predecessor'],predecessor={'service':facts['start34ServiceTuple'],'bindings':bindings},
 priorService=facts['start34ServiceTuple'],consumerSourceDirectory=str(NORMAL),consumerSourcePinsSha256=source_pin,
 guardPolicyRelativePath=interface['rootConsumerPolicyRelativePath'],normal35SourceOnly=True,authoritiesIssued=False,
 actualClosed34Refs={key:{'path':row['path'],'sha256':row['typedSha256']} for key,row in closed.items()},
 innerRoleApplyKey=interface['innerRoleRequestKey'],prior34UsedRolePermitSha256=facts['used34RolePermitSha256'])
w['historicalPriorClosedSha256']=w['actualPriorClosedSha256'];w['actualPriorClosedSha256']=closed['restore']['typedSha256']
for legacy in ('normal34SourceOnly','normal34Apply02SourceOnly','unusedRolePermitSha256'):w.pop(legacy,None)
historical_path=ROOT/'outputs/T45/revisions/20261116-r3-service32-registration-actual-01/install/READBACK-02.json'
historical_pin='6808ecbd33dc8a0f76fc4f2c22690ac2b0cb773340a1151eae71f8b9e944fa8b'
historical= json.loads(checked(historical_path,historical_pin))
assert historical['rootPins']['terminal']==w['historicalInstall']['terminalSha256']
assert historical['rootPins']['result']==w['historicalInstall']['rootResultSha256']
assert historical['publicResultSha256']==w['historicalInstall']['publicResultSha256']
assert historical['result']['service']['serviceKey']=='t45-first-r3-native-service-start-20261116-32'
w['historicalInstallService']=historical['result']['service']
w['historicalInstallReadbackRef']={'path':str(historical_path),'sha256':historical_pin}
put('NINE-PHASES.UNISSUED.json',json.dumps(w,sort_keys=True,indent=2)+'\n')
B,P,H=(base[key] for key in ('B','P','H'));host=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
constants={'CLOSED34':closed,'CLOSED34_SERVICE':facts['start34ServiceTuple'],'CLOSED34_BINDINGS':bindings,
 'CLOSED34_INCOMPLETE_SHA':facts['start34IncompleteRootSha256'],'CLOSED34_INCOMPLETE_PUBLIC_SHA':facts['start34IncompletePublicSha256'],
 'CLOSED34_ROLE_SHA':facts['used34RolePermitSha256'],'CLOSED34_RESTORED_SHA':facts['restored34SafeReceiptSha256']}
consttext=''.join(const(key,value) for key,value in constants.items())
consttext+="CLOSED34_BOOT=Path("+repr(str(host/'state/native-services'/closed['start']['requestKey']))+")\nCLOSED34_CUSTODY=Path("+repr(str(host/'state/native-services/ordinary34-auth-20261116-01'))+")\n"
history='''def closed34_history():
    for row in CLOSED34.values():
        key=row['requestKey'];terminal=read(B/'jobs'/key/'r3-outer-terminal.json')[0];public_t=read(C/'results'/(key+'.json'),1000)[0]
        root=read(B/'jobs'/key/'results'/row['leaf'])[0];public=read(C/'jobs'/key/'results'/row['leaf'],1000)[0]
        need(sha(terminal)==row['terminalSha256'] and terminal==public_t and json.loads(terminal)==row['terminal'],'EXACT_CLOSED34_TERMINAL_REQUIRED')
        need(sha(root)==row['rootResultSha256'] and sha(public)==row['publicResultSha256'] and json.loads(root)==json.loads(public)==row['value'],'EXACT_CLOSED34_RESULT_REQUIRED')
    start=CLOSED34['start'];restore=CLOSED34['restore'];incomplete=read(B/'jobs'/start['requestKey']/'results/normal-service-incomplete.json')[0]
    public=read(C/'jobs'/start['requestKey']/'results/normal-service-incomplete.json',1000)[0]
    need(sha(incomplete)==CLOSED34_INCOMPLETE_SHA and sha(public)==CLOSED34_INCOMPLETE_PUBLIC_SHA and json.loads(incomplete)==json.loads(public),'EXACT_CLOSED34_INCOMPLETE_PAIR_REQUIRED')
    inc=json.loads(incomplete);clean_raw=read(CLOSED34_BOOT/'failed-start-cleanup.json')[0];clean=json.loads(clean_raw)
    need(sha(clean_raw)==CLOSED34_BINDINGS['previousCleanupSha256'] and inc['successfulResultHandoff'] is False and inc['pid']==0 and inc['cid']==CLOSED34_SERVICE['containerId'] and all(inc[k] is True for k in ('confirmed','containerStopped','createAttempted','runtimeMaterialPreserved','currentProofPresent','retainedAckValidated')),'ACTUAL_FAILED34_AFTER_C_ACK_REQUIRED')
    need(inc['cleanStop']==dict(clean,cleanupLeaf='failed-start-cleanup.json',cleanupSha256=sha(clean_raw)) and clean['originalPGDATAAndCleanStateVerified'] is True and clean['dataDirectoryIdentity']=={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':448},'ACTUAL_FAILED34_CLEAN_ORIGINAL_DATA_REQUIRED')
    proof_raw=read(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-34.json'))[0]
    need(sha(proof_raw)==CLOSED34_SERVICE['proofSha256']==inc['currentProofSha256'],'EXACT_CLOSED34_C_REQUIRED')
    proof=json.loads(proof_raw);birth=proof['sharedPostgresNamespace']['container']
    need(proof['requestKey']==CLOSED34_SERVICE['serviceKey'] and birth['id']==CLOSED34_SERVICE['containerId'] and birth['startedAt']==CLOSED34_SERVICE['containerStartedAt'] and proof['physical']['postmasterStart']==CLOSED34_SERVICE['postmasterStart'] and proof['dataDirectoryIdentity']==clean['dataDirectoryIdentity'],'EXACT_REAL34_TUPLE_REQUIRED')
    ack=read(CLOSED34_BOOT/'retained-ack.json')[0]
    need(sha(ack)==CLOSED34_BINDINGS['previousRetainedAckSha256']==inc['retainedAckSha256'] and json.loads(ack)=={'requestKey':CLOSED34_SERVICE['serviceKey'],'proofSha256':CLOSED34_SERVICE['proofSha256'],'serviceLeaseExpiresAt':proof['sharedPostgresNamespace']['serviceLeaseExpiresAt']},'EXACT_CLOSED34_ACK_REQUIRED')
    inside=restore['value']['result']
    need(inside['requestKey']==restore['requestKey'] and inside['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and inside['databaseStillStopped'] is True and all(inside[k] is False for k in ('naturalExpiryCountedAsRestoration','runtimeAuthChanged','membershipsOrRoleAttributesChanged')),'ACTUAL_34_AUTH_RESTORED_REQUIRED')
    need(sha(read(CLOSED34_CUSTODY/'authority.json')[0])==CLOSED34_ROLE_SHA and sha(read(CLOSED34_CUSTODY/'restored.json')[0])==CLOSED34_RESTORED_SHA and json.loads(read(CLOSED34_CUSTODY/'restored.json')[0])==inside,'EXACT_34_ORIGINAL_AUTH_SAFE_RECEIPT_REQUIRED')
    for phase in ('apply','restore'):
        row=CLOSED34[phase];value=row['value'];raw=read(B/'jobs'/row['requestKey']/'results/maintenance-auth-cleanup.json')[0]
        need(json.loads(raw)==value['cleanup'] and all(value['cleanup'][k] is True for k in ('confirmed','ownContainerStopped','ownedPidAbsent','sourceDataPreserved')),'CLOSED34_MAINTENANCE_CLEANUP_REQUIRED')
    for phase,row in CLOSED34.items():
        key=row['requestKey'];cid=CLOSED34_SERVICE['containerId'] if phase=='start' else row['value']['cleanup']['cid']
        q=subprocess.run(['/usr/bin/docker','inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}',cid],capture_output=True,timeout=5)
        need(q.returncode==0 and not q.stderr and json.loads(q.stdout)=={'id':cid,'running':False,'pid':0,'operation':key},'EXACT_CLOSED34_CONTAINERS_STOPPED_REQUIRED')
    return {'service':CLOSED34_SERVICE,'restoredSha256':CLOSED34_RESTORED_SHA,'closureKind':'FAILED_AFTER_C_ACK_CLEAN_STOP_AUTH_RESTORED'}
'''
def add_history(s):
 s=s.replace('def required_history():',consttext+'\n'+history+'\ndef required_history():',1)
 body=function(s,'required_history').replace('    return identities','    closed34_history()\n    return identities')
 return replacefun(s,'required_history',body)
helper=(PREV/'r3_direct34_apply02.py').read_text();helper=assign(helper,'JOBS',repr(jobs),True)
helper=assign(helper,'POLICY_NAME',repr('direct35-batched-real.json'));helper=assign(helper,'PROOF',"HOST/'authority/fresh35-current-production-service-v2-service-35.json'")
helper=assign(helper,'CUSTODY_FILES',repr(facts['privateMetadataOnlyPaths']));helper=add_history(helper)
retired=[base['JOBS'][key] for key in ('apply','start','stop','restore')]
helper=helper.replace("        if phase is None:\n","        self.need(job.get('jobId') not in "+repr(retired)+",'USED34_MAINTENANCE_REISSUE_FORBIDDEN')\n        if phase is None:\n",1)
put('r3_direct35_normal.py',helper)
current=ROOT/'outputs/主控/20261117-r3-normal34-apply02-registration-window-01/admin_exec.ISSUED.py'
template=checked(current,facts['currentRoot']['dispatcher']).decode()
template=assign(template,'R3_ORIGINAL02_ABSENT_POLICY_SHA256','None');template=assign(template,'R3_ORIGINAL02_ABSENT_SOURCE_SHA256',repr(sha(helper.encode())))
template=template.replace("PUBLIC/'r3_direct34_apply02.py'","PUBLIC/'r3_direct35_normal.py'")
keys=ast.literal_eval(next(n.value for n in ast.parse(template).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='R3_ORIGINAL02_ABSENT_KEYS' for t in n.targets)))
template=assign(template,'R3_ORIGINAL02_ABSENT_KEYS',repr(list(dict.fromkeys(keys+list(jobs.values())))))
put('admin_exec.NORMAL35-UNREGISTERED.py',template)
s=add_history((PREV/'register_cas.py').read_text())
for key,value in {'BASIS':'{Path(k):v for k,v in '+pprint.pformat(facts['basis'],width=130)+'.items()}',
 'JOBS':repr(jobs),'EXPECTED_RULES':pprint.pformat(w['jobs'],width=130),'CUSTODY_FILES':repr(facts['privateMetadataOnlyPaths']),
 'ENTRY':"B/'r3-normal35-registration-source-20261117-01/register_cas.py'",'AUDIT':"B/'r3-normal35-registration-cas-20261117-01'",
 'NEW_MODULE':"P/'r3_direct35_normal.py'",'NEW_POLICY':"H/'direct35-batched-real.json'",'OLD_DISPATCHER':repr(facts['currentRoot']['dispatcher']),
 'HELPER':repr(sha(helper.encode())),'TEMPLATE':repr(sha(template.encode()))}.items():s=assign(s,key,value)
s=s.replace('T45_NORMAL34_APPLY02_REGISTRATION_CAS_V1','T45_NORMAL35_REGISTRATION_CAS_V1').replace('EXACT_NORMAL34_APPLY02_REGISTERED_NO_PHASE_SUBMITTED','EXACT_NORMAL35_REGISTERED_NO_PHASE_SUBMITTED').replace('.normal34-apply02-','.normal35-')
s=s.replace('role_pins[0] not in (ROLE_SHA,REFUSED_ROLE_SHA)','role_pins[0] not in (ROLE_SHA,REFUSED_ROLE_SHA,CLOSED34_ROLE_SHA)')
quiet=function(s,'quiet').replace('ordinary34-auth-20261116-01','ordinary35-auth-20261116-01').replace('ordinary34-auth-capture-20261116-01','ordinary35-auth-capture-20261116-01').replace('fresh35-current-production-service-v2-service-34.json','fresh35-current-production-service-v2-service-35.json')
s=replacefun(s,'quiet',quiet)
reg=function(s,'register').replace('(AUDIT, NEW_MODULE,','(AUDIT, NEW_MODULE, NEW_POLICY,')
reg=reg.replace("put(AUDIT / 'old-policy.bin',read(NEW_POLICY)[0])","put(AUDIT / 'old-policy.bin',read(H/'direct34-batched-real.json')[0])")
a=reg.index("            pending_policy=H/");b=reg.index("            result['published'].append('policy')",a)
reg=reg[:a]+"            need(not os.path.lexists(NEW_POLICY),'NORMAL35_POLICY_ALREADY_PRESENT')\n            put(NEW_POLICY,files['policy'])\n"+reg[b:]
reg=reg.replace("snapshot(a,policy=sha(files['policy']))",'snapshot(a)').replace("snapshot(a,sha(new),sha(files['policy']))",'snapshot(a,sha(new))')
s=replacefun(s,'register',reg);put('register_cas.py',s)
carrier=(PREV/'original-cas-apply02-carrier.UNISSUED.py').read_text().replace('r3-normal34-apply02-registration-source-20261117-01','r3-normal35-registration-source-20261117-01').replace('r3-normal34-apply02-registration-cas-20261117-01','r3-normal35-registration-cas-20261117-01').replace('EXACT_NORMAL34_APPLY02_REGISTERED_NO_PHASE_SUBMITTED','EXACT_NORMAL35_REGISTERED_NO_PHASE_SUBMITTED')
carrier=assign(carrier,'SOURCE',repr(sha(s.encode()))).replace('SOURCE = ','SOURCE=',1);put('original-cas-normal35-carrier.UNISSUED.py',carrier)
reader=add_history((PREV/'read_registration_basis.py').read_text())
reader=assign(reader,'BASIS',pprint.pformat(facts['basis'],width=130));reader=assign(reader,'JOBS',repr(jobs));reader=assign(reader,'CUSTODY_FILES',repr(facts['privateMetadataOnlyPaths']))
reader=replacefun(reader,'quiet',quiet).replace("'READONLY_NORMAL34_APPLY02_REGISTRATION_BASIS'","'READONLY_NORMAL35_REGISTRATION_BASIS'")
reader=reader.replace("'unusedRolePermitSha256':REFUSED_ROLE_SHA,",'').replace("'unusedInner34':True,","'prior34Closed':closed34_history(),")
reader=reader.replace("'predecessorBindings':PRIOR_BINDINGS","'historical33Bindings':PRIOR_BINDINGS,'predecessorBindings':CLOSED34_BINDINGS")
put('read_registration_basis.py',reader)
issuer=(PREV/'issue_registration.py').read_text()
for key,value in [('FROZEN_RULES_SHA',repr(sha((HERE/'NINE-PHASES.UNISSUED.json').read_bytes()))),('CONSUMER_PIN',repr(source_pin))]:issuer=assign(issuer,key,value)
# The final peer review is externally pinned by the root review, not replaced with a placeholder.
node=next(n for n in ast.parse(issuer).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CONSUMER_REVIEW_PIN' for t in n.targets));lines=issuer.splitlines(keepends=True);issuer=''.join(lines[:node.lineno-1])+''.join(lines[node.end_lineno:])
issuer=issuer.replace('==consumer_review_pin==CONSUMER_REVIEW_PIN','==consumer_review_pin').replace("consumer_review['state']=='SOURCE_PASS_NORMAL34_APPLY02_CLI_CONSUMER_ONLY_PENDING_ROOT_PAIR'","consumer_review['state'].startswith('SOURCE_PASS_NORMAL35_')")
issuer=replacefun(issuer,'checked_consumer',"def checked_consumer(witness):\n    directory=Path(witness['consumerSourceDirectory']);frozen=json.loads(checked(directory/'SOURCE-PINS.json',CONSUMER_PIN))\n    assert frozen['clockOrAuthorityIssued'] is False and frozen['newJobSubmitted'] is False and frozen['PGConnections']==frozen['serverActions']==0\n    interface=json.loads(checked(directory/'INTERFACE.UNISSUED.json','8c6adf9ad501f914226832b3663da8f18084439c7cd724007f1edc52998fa139'))\n    assert interface['sourceAssemblyServerActions']==interface['PGConnections']==0 and interface['newClock'] is None and interface['authoritySha256'] is None\n    for leaf,row in frozen['files'].items():\n        assert not Path(leaf).is_absolute() and '..' not in Path(leaf).parts\n        raw=checked(directory/leaf,row['sha256']);assert len(raw)==row['bytes']\n    return frozen\n")
issuer=issuer.replace("consumer_review['state'].startswith('SOURCE_PASS_NORMAL35_')","consumer_review['state']=='SOURCE_PASS_NORMAL35_CONSUMER_03_ONLY_PENDING_ROOT_PAIR'")
issuer=issuer.replace('==consumer_review_pin\n','==consumer_review_pin==CONSUMER_REVIEW_PIN\n')
issuer=issuer.replace('def checked_consumer(',"CONSUMER_REVIEW_PIN='f5262466669bd1120bd183fa6191dbe39a71a5fea5f3178a531fc76b0e189ae6'\n\ndef checked_consumer(",1)
issuer=issuer.replace("consumer_review['sourcePins']['sha256']","consumer_review['sourcePinsSha256']")
issuer=issuer.replace("    consumer_review=json.loads(checked(consumer_review_file,consumer_review_pin))","    assert Path(consumer_review_file).resolve()==ROOT/'outputs/QB/20261117-r3-normal35-consumer-review-03/RESULT.json'\n    consumer_review=json.loads(checked(consumer_review_file,consumer_review_pin))")
oldline=next(line for line in issuer.splitlines() if "assert basis['unusedInner34']" in line)
issuer=issuer.replace(oldline,"    assert basis['prior34Closed']=={'service':cas['CLOSED34_SERVICE'],'restoredSha256':cas['CLOSED34_RESTORED_SHA'],'closureKind':'FAILED_AFTER_C_ACK_CLEAN_STOP_AUTH_RESTORED'}")
issuer=issuer.replace("basis['predecessorBindings']==cas['PRIOR_BINDINGS']","basis['predecessorBindings']==cas['CLOSED34_BINDINGS']")
# Parse/check real input metadata before sampling the issuance clock; preserve the time predicates after it.
start=issuer.index('    now = time.time_ns() // 1_000_000')
end=issuer.index("    role_file = folders['apply']",start)
issuer=issuer[:start]+'''    grant_limit = int(basis['grantExpiresAtEpoch'] * 1000)
    captured = int(datetime.fromisoformat(basis['checkedAtUTC']).timestamp() * 1000)
    assert set(basis['oldIdentities']) == {str(p) for p in cas['BASIS']} | {'executionLock'} | set(cas['CUSTODY_FILES'])
    assert all(basis['actualPins'][str(p)] == pin for p, pin in cas['BASIS'].items())
    assert basis['oldIdentities']['executionLock'] == cas['LOCK_ID']
    now = time.time_ns() // 1_000_000
    assert now + 10_800_000 <= grant_limit, 'Original grant does not cover the complete finite operation window'
    assert 0 <= now - captured <= 900_000, 'fresh real CAS basis required'

'''+issuer[end:]
for a,b in [('SOURCE_PASS_NORMAL34_APPLY02_ROOT_PAIR_ONLY','SOURCE_PASS_NORMAL35_ROOT_PAIR_ONLY'),('READONLY_NORMAL34_APPLY02_REGISTRATION_BASIS','READONLY_NORMAL35_REGISTRATION_BASIS'),('ISSUED_NORMAL34_APPLY02_REGISTRATION_NO_PHASE_SUBMITTED','ISSUED_NORMAL35_REGISTRATION_NO_PHASE_SUBMITTED'),('r3_direct34_apply02.py','r3_direct35_normal.py'),('admin_exec.APPLY02-UNREGISTERED.py','admin_exec.NORMAL35-UNREGISTERED.py'),('original-cas-apply02-carrier','original-cas-normal35-carrier'),('direct34-batched-real.json','direct35-batched-real.json')]:issuer=issuer.replace(a,b)
put('issue_registration.py',issuer)
phase=(PREV/'issue_phase.py').read_text();phase=assign(phase,'FROZEN_RULES_SHA',repr(sha((HERE/'NINE-PHASES.UNISSUED.json').read_bytes())))
phase=phase.replace('ISSUED_NORMAL34_APPLY02_REGISTRATION_NO_PHASE_SUBMITTED','ISSUED_NORMAL35_REGISTRATION_NO_PHASE_SUBMITTED').replace('direct34-batched-real.json','direct35-batched-real.json').replace('9dde7aaf1b3b40ec6fd90a344b62c1b158492c07f21c4d1b471289a9c96bc349',source_pin)
phase=phase.replace("inside['requestKey']==roles['requestKey']=='t45-r3-ordinary34-auth-apply-20261116-01'","inside['requestKey']==roles['requestKey']==policy['jobs']['apply']['jobId']")
phase=phase.replace('20261117-r3-direct-service34-','20261117-r3-direct-service35-').replace("'-apply02-window-01'","'-window-01'")
historical_function=function(phase,'historical_catalog')
assert historical_function.count("witness['priorService']")==1
phase=replacefun(phase,'historical_catalog',historical_function.replace("witness['priorService']","witness['historicalInstallService']"))
put('issue_phase.py',phase)
print(json.dumps({'state':'NORMAL35_ROOT_SOURCE_ASSEMBLED_NOT_ISSUED','basisEntries':len(facts['basis']),'identityCount':facts['identityCountWithOriginalLock'],'consumerSourcePinsSha256':source_pin,'clockIssued':False,'PGConnections':0}))
