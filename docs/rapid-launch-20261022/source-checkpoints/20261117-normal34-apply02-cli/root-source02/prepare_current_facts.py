"""Prepare only immutable actual predecessors, independent of T45's pending successor interface."""
from pathlib import Path
import hashlib,json,pprint,runpy
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
PREVIOUS=HERE.parent/'20261116-r3-normal34-root-source-01'
T45=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
ACTUAL=T45/'NORMAL34-RUNTIME-WINDOW-01/apply'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def checked(path,pin=None):
 raw=path.read_bytes()
 if pin is not None:assert sha(raw)==pin,path
 return json.loads(raw)
base=runpy.run_path(str(PREVIOUS/'register_cas.py'),run_name='local_source_only')
readback=checked(T45/'NORMAL34-OBSERVABLE-CANDIDATE-UNISSUED-02/ACTUAL-ROOT-REGISTRATION-READBACK.json','101d4b1a16394f19789cb0e68d6bec7f44ffa2eff77749af1ee1582650968900')
typed=checked(ACTUAL/'ACTUAL-APPLY-REFUSED-BEFORE-PHASE.json','5d4cbf13587694bd76ba29fd9cf7fcedff0fc0ac6e8b62515d479d32fd70df21')
request=checked(ACTUAL/'receipts/release-submission-t45-r3-ordinary34-auth-apply-20261116-01.json',typed['requestSha256'])
terminal=checked(ACTUAL/'receipts/release-receipts/t45-r3-ordinary34-auth-apply-20261116-01/job.json',typed['terminalRootPublicSha256'])
assert terminal==typed['terminal'] and terminal['phaseStarted'] is False and terminal['exports']==[]
assert request['args']==typed['actualRequestArgs']==[]
assert terminal['status']=='REFUSED_R3_CONTINUITY_BEFORE_PHASE' and terminal['exitCode']==2
assert terminal['errorCode']=='R3_CONTINUITY_DIRECT33_EXACT_FINITE_AUTHORITY_REQUIRED'
assert all(typed[key] is True for key in ('new34BootAndCAbsent','new34CustodyAndCaptureAbsent','ownMaintenanceContainerAbsent','pgdataPidAbsent','prior33SafeRestoredReceiptUnchanged','otherSixKeysUnused','noPhasePrivateLogOrMaintenanceResults'))
B,P,C,H=(base[key] for key in ('B','P','C','H'))
basis={str(k):v for k,v in base['BASIS'].items()}
basis[str(P/'admin_exec.py')]=readback['actualPins']['dispatcher']
basis[str(base['NEW_MODULE'])]=readback['actualPins']['module']
basis[str(base['NEW_POLICY'])]=readback['actualPins']['policy']
basis[str(base['AUDIT']/'result.json')]=readback['auditResultSha256']
basis[str(base['AUDIT']/'old-dispatcher.bin')]=base['OLD_DISPATCHER']
key=typed['requestKey'];job=B/'jobs'/key
for path,pin in [('r3-outer-terminal.json',typed['terminalRootPublicSha256']),('request.json',typed['requestSha256']),('bundle/host-authorization.json',typed['authoritySha256']),('bundle/roles-authorization.json',typed['rolesAuthoritySha256']),('bundle/bundle-manifest.json',typed['manifestSha256'])]:basis[str(job/path)]=pin
assert len(basis)==203
facts={'state':'CURRENT_NORMAL34_ACTUAL_FACTS_ONLY_PENDING_SUCCESSOR_INTERFACE','basis':basis,
 'currentDispatcherSha256':readback['actualPins']['dispatcher'],'currentPolicySha256':readback['actualPins']['policy'],
 'currentHelperSha256':readback['actualPins']['module'],'refusedApplyKey':key,
 'terminalSha256':typed['terminalRootPublicSha256'],'requestSha256':typed['requestSha256'],
 'oldHostSha256':typed['authoritySha256'],'oldUnusedRolesSha256':typed['rolesAuthoritySha256'],
 'manifestSha256':typed['manifestSha256'],'terminal':terminal,'request':request,
 'privateCredentialSnapshots':'METADATA_ONLY_INHERITED_FOUR_FILES','newClockIssued':False,
 'newRegistrationOrKeyCreated':False,'serverConnections':0,'PGConnections':0,
 'successorInterface':'PENDING_T45_EXACT_FROZEN_SOURCE'}
(HERE/'CURRENT-FACTS.json').write_text(json.dumps(facts,sort_keys=True,indent=2)+'\n')
fragment='from pathlib import Path\nimport json,os\n'
for name,value in [('REFUSED_KEY',key),('REFUSED_TERMINAL_SHA',typed['terminalRootPublicSha256']),('REFUSED_REQUEST_SHA',typed['requestSha256']),('REFUSED_HOST_SHA',typed['authoritySha256']),('REFUSED_ROLE_SHA',typed['rolesAuthoritySha256']),('REFUSED_MANIFEST_SHA',typed['manifestSha256']),('REFUSED_TERMINAL',terminal),('REFUSED_REQUEST',request)]:fragment+=name+' = '+pprint.pformat(value,width=130,sort_dicts=True)+'\n'
fragment+='''
def refused_apply34_history():
    # Immutable original-key evidence only. Do not require future custody/PG state here.
    job=B/'jobs'/REFUSED_KEY
    terminal=read(job/'r3-outer-terminal.json')[0]
    public=read(C/'results'/(REFUSED_KEY+'.json'),1000)[0]
    request=read(job/'request.json')[0]
    need(sha(terminal)==REFUSED_TERMINAL_SHA and terminal==public and json.loads(terminal)==REFUSED_TERMINAL,'EXACT_APPLY34_BEFORE_PHASE_REFUSAL_REQUIRED')
    need(sha(request)==REFUSED_REQUEST_SHA and json.loads(request)==REFUSED_REQUEST and REFUSED_REQUEST['args']==[],'EXACT_ORIGINAL_APPLY34_EMPTY_ARGS_REQUIRED')
    need(REFUSED_TERMINAL['phaseStarted'] is False and REFUSED_TERMINAL['exports']==[] and REFUSED_TERMINAL['status']=='REFUSED_R3_CONTINUITY_BEFORE_PHASE' and REFUSED_TERMINAL['exitCode']==2 and REFUSED_TERMINAL['errorCode']=='R3_CONTINUITY_DIRECT33_EXACT_FINITE_AUTHORITY_REQUIRED','NO_EXECUTED_APPLY_OR_FAKE_RESTORE_ALLOWED')
    for leaf,pin in [('host-authorization.json',REFUSED_HOST_SHA),('roles-authorization.json',REFUSED_ROLE_SHA),('bundle-manifest.json',REFUSED_MANIFEST_SHA)]:
        need(sha(read(job/'bundle'/leaf)[0])==pin,'EXACT_REFUSED_APPLY34_BUNDLE_REQUIRED')
    need(not os.path.lexists(job/'phase.private.log') and not any(os.path.lexists(job/'results'/leaf) for leaf in ('maintenance-auth-intent.json','maintenance-auth-inside.json','maintenance-auth-cleanup.json','maintenance-auth-result.json')),'ORIGINAL_REFUSED_KEY_CHILD_EVIDENCE_PRESENT')
    return {'requestKey':REFUSED_KEY,'terminalSha256':REFUSED_TERMINAL_SHA,'requestSha256':REFUSED_REQUEST_SHA,'phaseStarted':False,'credentialWriteOccurred':False}
'''
compile(fragment,'refused_apply34_fragment.py','exec')
(HERE/'refused_apply34_fragment.py').write_text(fragment)
print(json.dumps({'state':facts['state'],'basisEntries':len(basis),'successorInterface':facts['successorInterface'],'clockIssued':False,'PGConnections':0}))
