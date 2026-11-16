"""Local exact metadata and pure delta checks. Never reads server state or calls issuers."""
from pathlib import Path
import ast,copy,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
    cas=runpy.run_path(str(HERE/'live_cas.py'),run_name='source_only_local_check')
    original=ROOT/'outputs/主控/20261117-r3-normal36-registration-window-01'
    raw=(original/'direct36-batched-real.json').read_bytes()
    assert sha(raw)==cas['OLD_POLICY']
    old=json.loads(raw);new=copy.deepcopy(old);new['jobs']['stop']['bundlePins']=cas['NEW_HOST']
    packed=cas['pack'](new);assert cas['delta'](raw,packed)==new
    failures=[]
    for phase,field,value in [('prepare','timeoutSeconds',781),('writer','jobId','FORBIDDEN_REPLAY'),('restore','timeoutSeconds',301),('stop','jobId','NEW_STOP_KEY')]:
        bad=copy.deepcopy(new);bad['jobs'][phase][field]=value
        try:cas['delta'](raw,cas['pack'](bad))
        except ValueError:failures.append(phase)
        else:raise AssertionError('Non-stop-pin delta accepted')
    for key in ('expiresAt','startsAt'):
        bad=copy.deepcopy(new);bad[key]+=1
        try:cas['delta'](raw,cas['pack'](bad))
        except ValueError:failures.append(key)
        else:raise AssertionError('Policy time changed')
    dispatcher=(original/'admin_exec.ISSUED.py').read_bytes();rendered=cas['render'](dispatcher,packed)
    before=ast.parse(dispatcher);after=ast.parse(rendered)
    changed=[]
    for a,b in zip(before.body,after.body):
        if ast.dump(a)!=ast.dump(b):
            assert isinstance(a,ast.Assign) and a.targets[0].id=='R3_ORIGINAL02_ABSENT_POLICY_SHA256'
            changed.append(a.targets[0].id)
    assert len(before.body)==len(after.body) and len(changed)==1
    basis=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL36-REGISTRATION-BASIS-02/ACTUAL-REGISTRATION-BASIS.json'
    assert sha(basis.read_bytes())=='c382a46568aebcbfe9eef2efc783583ef8b0ff448147fb38b0af99b452412954'
    historic=json.loads(basis.read_bytes())['actualPins']
    # All existing historical names and pins retained except current dispatcher bytes.
    assert all(cas['ACTUAL'][k]==v for k,v in historic.items()if k!=str(cas['DISPATCHER']))
    assert cas['ACTUAL'][str(cas['DISPATCHER'])]==cas['OLD_DISPATCHER']
    B=str(cas['B']);C=str(cas['C']);P=str(cas['P']);H=str(cas['HOST'])
    expected_new={P+'/r3_direct36_aux_prepare.py',B+'/r3-05-write-continuity/direct36-batched-real.json',H+'/authority/fresh35-current-production-service-v2-service-36.json',H+'/state/native-services/ordinary36-auth-20261116-01/authority.json'}
    for phase,leaf in [('apply','maintenance-auth-result.json'),('start','normal-service-result.json'),('prepare',None)]:
        key=old['jobs'][phase]['jobId']
        expected_new|={B+'/jobs/'+key+'/r3-outer-terminal.json',C+'/results/'+key+'.json'}
        for result_leaf in ([leaf]if leaf else ['final33-prepare-child-cleanup.json','final33-prepare-incomplete.json']):
            expected_new|={B+'/jobs/'+key+'/results/'+result_leaf,C+'/jobs/'+key+'/results/'+result_leaf}
    assert len(expected_new)==18 and set(cas['ACTUAL'])-set(historic)==expected_new
    assert len(cas['ACTUAL'])==272 and len(cas['HISTORICAL_CUSTODY'])==12
    expected=dict(historic);expected[str(cas['DISPATCHER'])]=cas['OLD_DISPATCHER']
    expected[P+'/r3_direct36_aux_prepare.py']=cas['HELPER']
    expected[B+'/r3-05-write-continuity/direct36-batched-real.json']=sha(raw)
    expected[H+'/authority/fresh35-current-production-service-v2-service-36.json']=cas['SERVICE']['proofSha256']
    expected[H+'/state/native-services/ordinary36-auth-20261116-01/authority.json']=sha((original/'roles-authorization.json').read_bytes())
    refs=[('apply','ACTUAL-APPLY36-RESULT.json','a09bb979c572e4d495daa30b48cc29e2b3e2bae59d81320fc294542568708559','maintenance-auth-result.json'),('start','ACTUAL-START36-RESULT.json','2d9aa879a649ad9a47ccfeb4df218ee5adcca5059f1b0b5722197ca816acc486','normal-service-result.json'),('prepare','ACTUAL-PREPARE02-RESULT.json','59586beda1f5daaa63cf006fba168c47091c7889745f83f671b7c4bf720cd3e7',None)]
    V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
    for phase,filename,pin,leaf in refs:
        r=(V/'NORMAL36-RUNTIME-01'/phase/filename).read_bytes();assert sha(r)==pin
        d=json.loads(r);key=old['jobs'][phase]['jobId']
        assert d['terminal']['jobId']==key
        expected[B+'/jobs/'+key+'/r3-outer-terminal.json']=d['rootPins']['terminal']
        expected[C+'/results/'+key+'.json']=d['rootPins']['terminal']
        if leaf:
            expected[B+'/jobs/'+key+'/results/'+leaf]=d['rootPins']['result']
            expected[C+'/jobs/'+key+'/results/'+leaf]=d['publicResultSha256']
        else:
            assert (d['terminal']['status'],d['terminal']['exitCode'])==('FAILED',2)
            for result_leaf in ['final33-prepare-child-cleanup.json','final33-prepare-incomplete.json']:
                assert d[result_leaf]['objectsEqual'] is True
                expected[B+'/jobs/'+key+'/results/'+result_leaf]=d[result_leaf]['rootSha256']
                expected[C+'/jobs/'+key+'/results/'+result_leaf]=d[result_leaf]['publicSha256']
    assert cas['ACTUAL']==expected,'Every current/historical path must bind its own actual receipt'
    assert sha((ROOT/'outputs/D1/20261117-r3-normal36-root-source-03/r3_direct36_aux_prepare.py').read_bytes())==cas['HELPER']
    assert not any('ordinary36-auth-'in k and Path(k).name in ('restored.json','restore-attempt.json')for k in cas['ACTUAL'])
    assert set(cas['JOBS'])=={'writer','stop','restore'}
    assert old['jobs']['prepare']['jobId']=='t45-r3-final33-plan-prepare-20261116-02'
    for p in HERE.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
    return dict(state='LOCAL_SOURCE_ONLY_EXACT_METADATA_AND_PURE_DELTA_PASS',policySemanticChanges=['jobs.stop.bundlePins.normal05_preserve_stop.py','jobs.stop.bundlePins.normal05_retained_stop.py'],dispatcherASTChanges=changed,negativeDeltasRejected=failures,historicalPinsPreserved=len(historic)-1,currentSafePinnedFiles=len(cas['ACTUAL']),exactNewSafePaths=len(expected_new),historicalPrivateMetadataOnlyFiles=len(cas['HISTORICAL_CUSTODY']),futureRestoreReceiptRequired=False,PGConnections=0,serverActions=0,clockCalls=0,issuersInvoked=False,authorityOrTargetOrCapabilityFixturesCreated=False,phaseSubmitted=False)
if __name__=='__main__':print(json.dumps(main(),sort_keys=True,indent=2))
