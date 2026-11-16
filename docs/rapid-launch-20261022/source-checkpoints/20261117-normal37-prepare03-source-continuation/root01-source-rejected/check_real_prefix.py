"""Only exact existing metadata and static affected paths; never future fixtures or issuance."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
PARENT=HERE.with_name('20261117-r3-normal36-root-source-03')
sha=lambda b:hashlib.sha256(b).hexdigest()
def checked(path,pin):
    b=Path(path).read_bytes();assert sha(b)==pin,path;return json.loads(b)
def assignment(path,name):
    nodes=[n for n in ast.parse(Path(path).read_bytes()).body if isinstance(n,ast.Assign)and isinstance(n.targets[0],ast.Name)and n.targets[0].id==name]
    return ast.literal_eval(nodes[-1].value)
def main():
    issuer=runpy.run_path(str(HERE/'issue_registration.py'),run_name='real_preclock_registration_source')
    cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='real_static_cas_source')
    helper=runpy.run_path(str(HERE/'r3_direct37_aux_prepare.py'),run_name='real_static_helper_source')
    witness=json.loads((HERE/'SIX-PHASES.UNISSUED.json').read_bytes())
    review_path=ROOT/'outputs/QB/20261117-r3-normal37-consumer-review-01/RESULT.json'
    crpin='9fd6b7a992b6de3dedf6925910b1fc5e5d4397e57f233848b0816fbbb72440bc'
    consumer,interface,review=issuer['checked_consumer'](witness,review_path,crpin)
    rules,folders=issuer['checked_static_rules'](witness,cas)
    phase=runpy.run_path(str(HERE/'issue_phase.py'),run_name='real_preclock_phase_source')
    identity=phase['load_issuer_pair']()
    assert identity['native_scope']()=={'requestKey':'t45-r3-final33-plan-prepare-20261116-01','batchPlanPath':witness['preparationIdentityMapping']['batchPlanPath']}
    assert witness['preparationIdentityMapping']==interface['preparationIdentityMapping']
    host=runpy.run_path(str(folders['prepare']/rules['prepare']['script']),run_name='real_static_prepare_host_scope')
    host_scope=host['scope']()
    assert host['PREPARE']==identity['OUTER'] and host_scope['preparationRequestKey']==identity['LOGICAL'] and host_scope['batchPlanPath']==identity['MAPPING']['batchPlanPath']
    decision=checked(witness['continuationDecision']['path'],'e65a97ede2b12d55e37368154e2731a21e02d200adf14cf2132e82bb488c36e8')
    assert decision['currentOuterAttemptRequestKey']==identity['OUTER']=='t45-r3-final33-plan-prepare-20261116-03'
    old_decision=checked(issuer['DECISION'],issuer['DECISION_SHA'])
    assert old_decision['outerAttemptRequestKey']==decision['historicalDecisionOuterAttemptRequestKey']=='t45-r3-final33-plan-prepare-20261116-02'
    # Independent reconstruction from actual stage/receipts, never name-based renumbering.
    old=checked(V/'NORMAL36-REGISTRATION-BASIS-02/ACTUAL-REGISTRATION-BASIS.json','c382a46568aebcbfe9eef2efc783583ef8b0ff448147fb38b0af99b452412954')['actualPins']
    expected=dict(old);B=str(cas['B']);P=str(cas['P']);C=str(cas['C']);H='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3'
    live=checked(V/'LIVE36-STOP-CAS-ACTUAL-01/ACTUAL-LIVE36-CAS-READBACK.json','8e28f14879a90ab05d7f4467e7f7c9b9ef7c1d2506c2ab424e3ec507aa7adf9f')
    registration=checked(V/'NORMAL36-REGISTRATION-ACTUAL-01/ACTUAL-ROOT-REGISTRATION-READBACK.json','3d81bd24ac5c9271ee82efbfc7f1bbc2b4d1f13cfdd41ce9e72a340d4fef5b9c')
    assert registration['auditResultSha256']=='cb4a687d6613e053b788cdca79b02eb83dbe6f51d99ac79ac57845624242ed07'
    expected[P+'/admin_exec.py']=live['dispatcherSha256'];expected[B+'/r3-05-write-continuity/direct36-batched-real.json']=live['policySha256']
    expected[P+'/r3_direct36_aux_prepare.py']=sha((PARENT/'r3_direct36_aux_prepare.py').read_bytes())
    expected[B+'/r3-normal36-registration-cas-20261117-01/result.json']=registration['auditResultSha256']
    expected[B+'/r3-normal36-live-stop-cas-20261117-01/result.json']=live['auditResultSha256']
    stage={};history={}
    refs=[('apply','a09bb979c572e4d495daa30b48cc29e2b3e2bae59d81320fc294542568708559','maintenance-auth-result.json'),('start','2d9aa879a649ad9a47ccfeb4df218ee5adcca5059f1b0b5722197ca816acc486','normal-service-result.json'),('prepare','59586beda1f5daaa63cf006fba168c47091c7889745f83f671b7c4bf720cd3e7','final33-prepare-incomplete.json'),('stop','0a1248f28c51437bc83dc474eae05f0d43dbc9a626af9d10ee82cf541b2ad87c','normal05-preserve-stop-result.json'),('restore','8ae0035cca6a6c5b11266ea6e0a1998f317315b724c9230121d0fdfe7c073857','maintenance-auth-result.json')]
    for ph,pin,leaf in refs:
        name='ACTUAL-PREPARE02-RESULT.json'if ph=='prepare'else'ACTUAL-'+ph.upper()+'36-RESULT.json'
        d=checked(V/'NORMAL36-RUNTIME-01'/ph/name,pin);stage[ph]=d;key=d['terminal']['jobId']
        expected[B+'/jobs/'+key+'/r3-outer-terminal.json']=d['rootPins']['terminal'];expected[C+'/results/'+key+'.json']=d['rootPins']['terminal']
        if ph=='prepare':
            for n in ('final33-prepare-child-cleanup.json','final33-prepare-incomplete.json'):
                assert d[n]['objectsEqual'] is True
                expected[B+'/jobs/'+key+'/results/'+n]=d[n]['rootSha256'];expected[C+'/jobs/'+key+'/results/'+n]=d[n]['publicSha256']
            root_pin,public_pin=d[leaf]['rootSha256'],d[leaf]['publicSha256']
        else:
            expected[B+'/jobs/'+key+'/results/'+leaf]=d['rootPins']['result'];expected[C+'/jobs/'+key+'/results/'+leaf]=d['publicResultSha256'];root_pin,public_pin=d['rootPins']['result'],d['publicResultSha256']
        history[ph]=dict(key=key,leaf=leaf,terminal=d['rootPins']['terminal'],status=d['terminal']['status'],exitCode=d['terminal']['exitCode'],root=root_pin,public=public_pin)
    service=stage['start']['service'];restore=stage['restore']
    expected[H+'/authority/fresh35-current-production-service-v2-service-36.json']=service['proofSha256']
    expected[H+'/state/native-services/ordinary36-auth-20261116-01/authority.json']=sha((ROOT/'outputs/主控/20261117-r3-normal36-registration-window-01/roles-authorization.json').read_bytes())
    expected[H+'/state/native-services/ordinary36-auth-20261116-01/restored.json']=restore['privateRestorationReceiptSha256']
    expected[B+'/jobs/'+restore['requestKey']+'/results/maintenance-auth-cleanup.json']=restore['rootPins']['cleanup'];expected[B+'/jobs/'+restore['requestKey']+'/results/maintenance-auth-inside.json']=restore['rootPins']['inside']
    expected[H+'/state/native-services/'+service['serviceKey']+'/cleanup.json']=stage['stop']['rootPins']['cleanup']
    ack=json.loads((V/'STOP36-READONLY-BASIS-ACTUAL-01/ACTUAL-STOP36-BASIS.json').read_bytes())['retainedAckSha256']
    assert ack=='2aec997f4ec24c1bb3623a99aa9134d245601c99d87d175c9855ae9538b1c80e'
    expected[H+'/state/native-services/'+service['serviceKey']+'/retained-ack.json']=ack
    old_start_rules=json.loads((PARENT/'SIX-PHASES.UNISSUED.json').read_bytes())['jobs']['start']['bundlePins']
    for n in ('normal_service05_after08.py','normal_service05_after08_proof.py'):expected[B+'/jobs/'+service['serviceKey']+'/bundle/'+n]=old_start_rules[n]
    actual={str(k):v for k,v in cas['BASIS'].items()}
    assert actual==expected and len(actual)==289
    assert all(actual[k]==v for k,v in old.items()if k!=P+'/admin_exec.py')
    assert helper['HISTORY36']==cas['HISTORY36']==history and helper['CLOSED36_RESTORED_SHA']==restore['privateRestorationReceiptSha256']=='60d6d5a5b16b321c334222ffaef9dc8ac0a0bf69e822878743a920151bfdbb4d'
    private=assignment(PARENT/'register_cas.py','CUSTODY_FILES')+[H+'/state/native-services/ordinary36-auth-20261116-01/'+n for n in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json')]
    assert cas['CUSTODY_FILES']==helper['CUSTODY_FILES']==private and len(private)==16
    parent_jobs=assignment(PARENT/'r3_direct36_aux_prepare.py','JOBS')
    assert helper['JOBS']=={**parent_jobs,**cas['JOBS']} and len(cas['JOBS'])==6 and len(helper['JOBS'])==9
    # Explicit disjointness includes namespace descendants, not only equal leaves.
    reserved=[cas['NEW_MODULE'],cas['NEW_POLICY'],cas['AUDIT'],cas['ENTRY'].parent,cas['P']/'.normal37-dispatcher.pending',Path(H)/'state/native-services/ordinary37-auth-20261116-01',Path(H)/'state/native-services'/cas['JOBS']['start'],Path(H)/'authority/fresh35-current-production-service-v2-service-37.json',Path(H)/'state/fresh35-first-production-20261110-r3/ordinary37-auth-capture-20261116-01',Path(H)/'state/real-first-20261110-r3/reports'/cas['JOBS']['prepare']]
    for grant in ('b16447fbc81f4d64','5cc58239751e4e2a'):
        b=cas['B'].with_name('grant-'+grant);c=cas['C'].with_name('grant-'+grant)
        for key in cas['JOBS'].values():reserved.extend([b/'jobs'/key,c/'jobs'/key,c/'requests'/(key+'.json'),c/'requests'/(key+'.tmp'),c/'results'/(key+'.json')])
    pinned=[*cas['BASIS'],*map(Path,private)]
    collisions=[(str(p),str(q))for p in pinned for q in reserved if p==q or q in p.parents]
    assert collisions==[]
    assert len((HERE/'r3_direct37_aux_prepare.py').read_bytes())<=131072
    assert cas['HELPER']==sha((HERE/'r3_direct37_aux_prepare.py').read_bytes()) and cas['TEMPLATE']==sha((HERE/'admin_exec.NORMAL37-UNREGISTERED.py').read_bytes())
    carrier=(HERE/'original-cas-normal37-carrier.UNISSUED.py').read_text();assert 'SOURCE='+repr(sha((HERE/'register_cas.py').read_bytes())) in carrier
    for p in HERE.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
    return dict(state='PASS_REAL37_ISSUER_METADATA_PREFIX_AND_AFFECTED_PATH_INVARIANTS_ONLY',consumerReviewSha256=crpin,consumerSourcePinsSha256=witness['consumerSourcePinsSha256'],existingPinnedPathCount=len(actual),historical254NamesAndPinsPreservedExceptCurrentDispatcher=True,added36HistoryPathsReconstructedFromActualReceipts=len(set(actual)-set(old)),allExistingPinnedPathsAndFutureMustAbsentNamespacesDisjoint=True,pinnedFutureNamespaceCollisions=collisions,current36RestoredReceiptActualSha256=helper['CLOSED36_RESTORED_SHA'],future37RestoredReceiptOrAuthorityExistingPins=False,privateSnapshotMetadataOnlyFiles=16,activePolicyRuleCount=6,historicalReadOnlyJobLookupsRetained=3,helperBytes=(HERE/'r3_direct37_aux_prepare.py').stat().st_size,realRunpyNativeLogical01Outer03Mapping=True,historical65bPreservedAndRealContinuationE65Consumed=True,clockCalls=0,issuerOrReaderOrCASOrNativeInvoked=False,serverActions=0,PGConnections=0,syntheticFullCompileOrFutureAuthorityTargetCapabilityFixtureCreated=False)
if __name__=='__main__':print(json.dumps(main(),sort_keys=True,indent=2))
