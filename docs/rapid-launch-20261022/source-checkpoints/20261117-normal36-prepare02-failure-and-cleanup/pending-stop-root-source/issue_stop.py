"""Main-only stop36 issuer after exact live CAS readback; no other phase can be issued."""
from pathlib import Path
from datetime import datetime
import hashlib,json,os,runpy,sys,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
CONTROL=ROOT/'outputs/主控'
ORIGINAL=ROOT/'outputs/D1/20261117-r3-normal36-root-source-03'
CONSUMER=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/STOP36-CLEANUP-PIN-FIX-UNISSUED-01'
V=CONSUMER.parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(path,pin):
    raw=Path(path).read_bytes();assert sha(raw)==pin,path;return json.loads(raw)
def issue(registration_directory,cas_readback,cas_readback_pin,stop_basis,stop_basis_pin):
    cas=runpy.run_path(str(HERE/'live_cas.py'),run_name='source_only_cas_api')
    pins=json.loads((HERE/'SOURCE-PINS.json').read_text())
    for name,row in pins['files'].items():
        assert sha((HERE/name).read_bytes())==row['sha256']
    issued=Path(registration_directory).resolve();assert issued.parent==CONTROL
    manifest=json.loads((issued/'ISSUED.json').read_text())
    assert manifest['state']=='ISSUED_LIVE36_PENDING_STOP_TWO_PINS_SOURCE_CAS'
    review=read(CONTROL.parent/'QB/20261117-r3-normal36-live-stop-review-01/RESULT.json',manifest['independentReviewSha256'])
    assert review['state']=='SOURCE_PASS_NORMAL36_LIVE_STOP_TWO_PINS_CAS_ISSUER_ONLY' and review['sourceOnly'] is True and review['findings']==[]
    assert review['sourcePinsSha256']==sha((HERE/'SOURCE-PINS.json').read_bytes())
    policy=read(issued/'direct36-batched-real.json',manifest['policySha256'])
    roles=read(issued/'roles-authorization.json',cas['ROLE'])
    old=(CONTROL/'20261117-r3-normal36-registration-window-01/direct36-batched-real.json').read_bytes()
    cas['delta'](old,(issued/'direct36-batched-real.json').read_bytes())
    actual=read(cas_readback,cas_readback_pin)
    assert actual['state']=='ACTUAL_LIVE36_STOP_TWO_PINS_CAS_READBACK_MATCHED'
    assert actual['dispatcherSha256']==manifest['dispatcherSha256'] and actual['policySha256']==manifest['policySha256']
    assert actual['authorizationSha256']==manifest['liveCasAuthoritySha256']
    assert actual['service']==cas['SERVICE'] and actual['deadlines']==cas['DEADLINES'] and actual['rolesAuthoritySha256']==cas['ROLE']
    assert actual['PGConnections']==actual['mutations']==0 and actual['unusedKeys']==cas['JOBS']
    consumer=read(CONSUMER/'SOURCE-PINS.json','59708ff131224173c7850af0b5a272870c5695144283746e2fd17bf63697c217')
    for name,row in consumer['files'].items():assert sha((CONSUMER/name).read_bytes())==row['sha256']
    witness=read(ORIGINAL/'SIX-PHASES.UNISSUED.json','b25acf54558fe9b0236e627f5ede5f785ad84f063f73ea0ff689730db41b4b4e')
    witness['phaseDirectories']['stop']=str(CONSUMER/'stop/bundle')
    original_issuer=ORIGINAL/'issue_phase.py'
    assert sha(original_issuer.read_bytes())==ORIGINAL_ISSUER_SHA
    api=runpy.run_path(str(original_issuer),run_name='stop_only_original_pure_api')
    start=read(V/'NORMAL36-RUNTIME-01/start/ACTUAL-START36-RESULT.json','2d9aa879a649ad9a47ccfeb4df218ee5adcca5059f1b0b5722197ca816acc486')
    assert start['service']==cas['SERVICE'] and start['rootPins']['terminal']=='c6bc4d7dfb5be9afca0a1505159a1c487d8504a35f8df1f3de3db84b2b9f5a06'
    evidence=read(stop_basis,stop_basis_pin)
    assert evidence['currentBatchTerminals']=={
        't45-r3-batched-install-20261116-02':'01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2',
        't45-r3-batched161-command-successor-20261116-01':'515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb',
        't45-r3-final33-plan-prepare-20261116-02':'fb41bffdf48ee9447cf3f51653e0c3764e9e2f77ae1eb303d4a6dcf070177aac',
        't45-r3-batched-real-execute-20261115-01':None}
    assert evidence['writerUnsubmitted'] is True and evidence['PGConnections']==evidence['mutations']==0
    assert evidence['authenticationSnapshotBodiesOrDigestsRead'] is False
    rule=policy['jobs']['stop'];assert rule['bundlePins']==cas['NEW_HOST']
    os.environ['ERP_SHARED_JOB_ID']=rule['jobId']
    os.environ['ERP_SHARED_JOB_DIR']='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/'+rule['jobId']
    at=time.time_ns()//1000000
    checked=int(datetime.fromisoformat(evidence['checkedAtUTC'].replace('Z','+00:00')).timestamp()*1000)
    assert 0<=at-actual['checkedAt']<=300000 and 0<=at-checked<=300000,'fresh actual CAS readback and STOP basis required'
    assert at+540000<cas['DEADLINES']['restore']
    authority=api['preservation_authority']('stop',witness,rule,start,evidence,roles,policy,at)
    assert authority['service']==cas['SERVICE'] and at+rule['timeoutSeconds']*1000<authority['expiresAt']<=policy['expiresAt']
    assert authority['startsAt']>=policy['startsAt']
    raw=(json.dumps(authority,sort_keys=True,indent=2)+'\n').encode()
    directory=CONTROL/'20261117-r3-direct-service36-stop-window-01';directory.mkdir(mode=0o700)
    report=dict(path=str(directory/rule['authorityLeaf']),sha256=sha(raw),bytes=len(raw),key=rule['jobId'],expiresAt=authority['expiresAt'],startsAt=at,stopOnly=True,casReadbackSha256=cas_readback_pin,stopBasisSha256=stop_basis_pin)
    with (directory/rule['authorityLeaf']).open('xb')as f:f.write(raw)
    with (directory/'ISSUED.json').open('x')as f:json.dump(report,f,sort_keys=True)
    return report
ORIGINAL_ISSUER_SHA='90f959296e4f57dcdcbdb3bbd6e2b8c45a531000d2431cde13eac855f39e4fd1'
if __name__=='__main__':print(json.dumps(issue(*sys.argv[1:]),sort_keys=True))
