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
    assert len(cas['ACTUAL'])>len(historic)
    assert set(cas['JOBS'])=={'writer','stop','restore'}
    assert old['jobs']['prepare']['jobId']=='t45-r3-final33-plan-prepare-20261116-02'
    for p in HERE.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
    return dict(state='LOCAL_SOURCE_ONLY_EXACT_METADATA_AND_PURE_DELTA_PASS',policySemanticChanges=['jobs.stop.bundlePins.normal05_preserve_stop.py','jobs.stop.bundlePins.normal05_retained_stop.py'],dispatcherASTChanges=changed,negativeDeltasRejected=failures,historicalPinsPreserved=len(historic)-1,currentSafePinnedFiles=len(cas['ACTUAL']),PGConnections=0,serverActions=0,clockCalls=0,issuersInvoked=False,authorityOrTargetOrCapabilityFixturesCreated=False,phaseSubmitted=False)
if __name__=='__main__':print(json.dumps(main(),sort_keys=True,indent=2))
