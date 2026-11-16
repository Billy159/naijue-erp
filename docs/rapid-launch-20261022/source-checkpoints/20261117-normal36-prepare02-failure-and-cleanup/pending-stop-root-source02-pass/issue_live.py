"""Main-only finite issuance for reviewed live36_stop source CAS; never renews role or service."""
from pathlib import Path
import base64,hashlib,json,runpy,sys,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
ORIGINAL=ROOT/'outputs/主控/20261117-r3-normal36-registration-window-01'
CONSUMER=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/STOP36-CLEANUP-PIN-FIX-UNISSUED-01'
CONSUMER_SHA='59708ff131224173c7850af0b5a272870c5695144283746e2fd17bf63697c217'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def checked(path,pin):
    raw=Path(path).read_bytes();assert sha(raw)==pin,path;return raw
def pack(v):return (json.dumps(v,sort_keys=True,indent=2)+'\n').encode()

def issue(review_file,review_pin,basis_file,basis_pin,output):
    pins=json.loads((HERE/'SOURCE-PINS.json').read_text())
    review=json.loads(checked(review_file,review_pin))
    assert review['sourceOnly'] is True and review['findings']==[]
    assert review['state']=='SOURCE_PASS_NORMAL36_LIVE_STOP_TWO_PINS_CAS_ISSUER_ONLY'
    assert review['consumerReviewSha256']=='2fb95f9d0cb2b7d607fc1c4142b1c713c96b6a4e7f9f373d64b0e5f9b044e025'
    assert review['sourcePinsSha256']==sha((HERE/'SOURCE-PINS.json').read_bytes())
    for name,row in pins['files'].items():checked(HERE/name,row['sha256'])
    consumer=json.loads(checked(CONSUMER/'SOURCE-PINS.json',CONSUMER_SHA))
    consumer_review=json.loads(checked(ROOT/'outputs/QB/20261117-r3-stop36-pin-review-01/RESULT.json',review['consumerReviewSha256']))
    assert consumer_review['sourceOnly'] is True and consumer_review['findings']==[] and consumer_review['sourcePinsSha256']==CONSUMER_SHA
    for name,row in consumer['files'].items():
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        raw=checked(CONSUMER/name,row['sha256']);assert len(raw)==row['bytes']
    basis=json.loads(checked(basis_file,basis_pin))
    cas=runpy.run_path(str(HERE/'live_cas.py'),run_name='local_source_only')
    assert basis['state']=='READONLY_LIVE36_PENDING_STOP_TWO_PINS_BASIS'
    assert basis['service']==cas['SERVICE'] and basis['deadlines']==cas['DEADLINES'] and basis['unusedKeys']==cas['JOBS']
    assert basis['activeOperationUnits']==[] and basis['PGConnections']==basis['mutations']==0 and basis['privateBodiesOrDigestsRead'] is False
    assert basis['oldIdentities']['executionLock']==cas['LOCK_ID']
    old_policy=checked(ORIGINAL/'direct36-batched-real.json',cas['OLD_POLICY'])
    policy=json.loads(old_policy)
    policy['jobs']['stop']['bundlePins']=cas['NEW_HOST']
    raw_policy=pack(policy);cas['delta'](old_policy,raw_policy)
    old_dispatcher=checked(ORIGINAL/'admin_exec.ISSUED.py',cas['OLD_DISPATCHER']);new_dispatcher=cas['render'](old_dispatcher,raw_policy)
    role=checked(ORIGINAL/'roles-authorization.json',cas['ROLE'])
    manifest=json.loads((ORIGINAL/'ISSUED.json').read_text())
    assert manifest['policySha256']==cas['OLD_POLICY'] and manifest['dispatcherSha256']==cas['OLD_DISPATCHER'] and manifest['rolesSha256']==cas['ROLE']
    assert manifest['controllerValidUntil']==cas['DEADLINES']['controller'] and manifest['backupAdminValidUntil']==cas['DEADLINES']['admin'] and manifest['restorationDeadline']==cas['DEADLINES']['restore'] and manifest['policyExpiresAt']==cas['DEADLINES']['parent']
    # New CAS authorization only; the used apply/start times and actual service remain unchanged.
    at=time.time_ns()//1000000
    assert 0<=at-basis['checkedAt']<=300000,'fresh real live basis required'
    assert at+240000<min(basis['serviceLeaseExpiresAt']-35000,cas['DEADLINES']['parent'],int(basis['grantExpiresAtEpoch']*1000)),'safe stop budget unavailable'
    assert at+540000<cas['DEADLINES']['restore'],'original restoration deadline unavailable'
    expires=min(at+300000,basis['serviceLeaseExpiresAt']-35000-240000,cas['DEADLINES']['restore']-540000,cas['DEADLINES']['parent'])
    assert at+30000<expires
    a=dict(format='LIVE36_PENDING_STOP_TWO_PINS_CAS_V1',grantId=cas['GRANT'],sourceSha256=sha((HERE/'live_cas.py').read_bytes()),newPolicySha256=sha(raw_policy),reviewSha256=review_pin,oldIdentities=basis['oldIdentities'],service=cas['SERVICE'],deadlines=cas['DEADLINES'],startsAt=at,expiresAt=expires,authorizationReference='Main existing real import authorization; active36 pending STOP two-pin correction only; original roles, service and all used keys unchanged.')
    auth=pack(a);packet=dict(authorization=base64.b64encode(auth).decode(),policy=base64.b64encode(raw_policy).decode())
    carrier=(HERE/'original-cas-live36-stop-carrier.UNISSUED.py').read_text().replace('AUTH_SHA_LITERAL',repr(sha(auth))).replace('AUTH_START_LITERAL',str(at)).replace('AUTH_EXPIRES_LITERAL',str(expires))
    compile(carrier,'live36_stop_carrier','exec')
    witness=(HERE/'STOP-DELTA.UNISSUED.json').read_bytes()
    manifest.update(state='ISSUED_LIVE36_PENDING_STOP_TWO_PINS_SOURCE_CAS',rulesSha256=sha(witness),consumerSourcePinsSha256=CONSUMER_SHA,policySha256=sha(raw_policy),dispatcherSha256=sha(new_dispatcher),independentReviewSha256=review_pin,originalRegistrationDirectory=str(ORIGINAL),liveCasAuthoritySha256=sha(auth),liveCasExpiresAt=expires)
    output=Path(output).resolve();assert output.parent==ROOT/'outputs/主控';output.mkdir(mode=0o700)
    files={'authorization.json':auth,'packet.json':pack(packet),'envelope.json':pack(dict(source=base64.b64encode((HERE/'live_cas.py').read_bytes()).decode(),packet=packet)),'direct36-batched-real.json':raw_policy,'roles-authorization.json':role,'admin_exec.ISSUED.py':new_dispatcher,'original-cas-live36-stop-carrier.ISSUED.py':carrier.encode(),'ISSUED.json':pack(manifest)}
    for name,raw in files.items():
        with (output/name).open('xb') as f:f.write(raw)
    return dict(state=manifest['state'],directory=str(output),authoritySha256=sha(auth),carrierSha256=sha(carrier.encode()),policySha256=sha(raw_policy),dispatcherSha256=sha(new_dispatcher),expiresAt=expires,roleBytesAndDeadlinesUnchanged=True,phaseSubmitted=False)

if __name__=='__main__':print(json.dumps(issue(*sys.argv[1:]),sort_keys=True))
