"""Main-only finite issuance for reviewed live35 source CAS; never renews role or service."""
from pathlib import Path
import base64,hashlib,json,runpy,sys,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
ORIGINAL=ROOT/'outputs/主控/20261117-r3-normal35-registration-window-01'
CONSUMER=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL35-NATIVE-SPEC-SUCCESSOR-UNISSUED-01'
CONSUMER_SHA='1d2cff53cee31d52cf214be3b4d5ded5408761328579fb0ff734373b3de0c279'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def checked(path,pin):
    raw=Path(path).read_bytes();assert sha(raw)==pin,path;return raw
def pack(v):return (json.dumps(v,sort_keys=True,indent=2)+'\n').encode()

def issue(review_file,review_pin,basis_file,basis_pin,output):
    pins=json.loads((HERE/'SOURCE-PINS.json').read_text())
    review=json.loads(checked(review_file,review_pin))
    assert review['sourceOnly'] is True and review['findings']==[]
    assert review['state']=='SOURCE_PASS_NORMAL35_LIVE_TWO_HOSTS_CAS_ONLY'
    assert review['consumerReviewSha256']=='19667cb10bb6075e789556239c8dfcdb48d3a3b7008ed00db260ac221271a2c0'
    assert review['sourcePinsSha256']==sha((HERE/'SOURCE-PINS.json').read_bytes())
    for name,row in pins['files'].items():checked(HERE/name,row['sha256'])
    consumer=json.loads(checked(CONSUMER/'SOURCE-PINS.json',CONSUMER_SHA))
    consumer_review=json.loads(checked(ROOT/'outputs/QB/20261117-r3-normal35-live-spec-review-01/CONSUMER-RESULT.json',review['consumerReviewSha256']))
    assert consumer_review['sourceOnly'] is True and consumer_review['findings']==[] and consumer_review['sourcePinsSha256']==CONSUMER_SHA
    for name,row in consumer['files'].items():
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        raw=checked(CONSUMER/name,row['sha256']);assert len(raw)==row['bytes']
    basis=json.loads(checked(basis_file,basis_pin))
    cas=runpy.run_path(str(HERE/'live_cas.py'),run_name='local_source_only')
    assert basis['state']=='READONLY_LIVE35_TWO_UNUSED_HOSTS_BASIS'
    assert basis['service']==cas['SERVICE'] and basis['deadlines']==cas['DEADLINES'] and basis['unusedKeys']==cas['JOBS']
    assert basis['activeOperationUnits']==[] and basis['PGConnections']==basis['mutations']==0 and basis['privateBodiesOrDigestsRead'] is False
    assert basis['oldIdentities']['executionLock']==cas['LOCK_ID']
    old_policy=checked(ORIGINAL/'direct35-batched-real.json',cas['OLD_POLICY'])
    policy=json.loads(old_policy)
    for phase in ('prepare','writer'):policy['jobs'][phase]['bundlePins']['final33_host.py']=cas['NEW_HOST']
    raw_policy=pack(policy);cas['delta'](old_policy,raw_policy)
    old_dispatcher=checked(ORIGINAL/'admin_exec.ISSUED.py',cas['OLD_DISPATCHER']);new_dispatcher=cas['render'](old_dispatcher,raw_policy)
    role=checked(ORIGINAL/'roles-authorization.json',cas['ROLE'])
    manifest=json.loads((ORIGINAL/'ISSUED.json').read_text())
    assert manifest['policySha256']==cas['OLD_POLICY'] and manifest['dispatcherSha256']==cas['OLD_DISPATCHER'] and manifest['rolesSha256']==cas['ROLE']
    assert manifest['controllerValidUntil']==cas['DEADLINES']['controller'] and manifest['backupAdminValidUntil']==cas['DEADLINES']['admin'] and manifest['restorationDeadline']==cas['DEADLINES']['restore'] and manifest['policyExpiresAt']==cas['DEADLINES']['parent']
    # New CAS authorization only; the used apply/start times and actual service remain unchanged.
    at=time.time_ns()//1000000
    assert 0<=at-basis['checkedAt']<=300000,'fresh real live basis required'
    assert at+4020000<min(cas['DEADLINES']['controller'],cas['DEADLINES']['admin'],basis['serviceLeaseExpiresAt']-35000,cas['DEADLINES']['parent'],int(basis['grantExpiresAtEpoch']*1000)),'complete 4020-second remaining chain unavailable; clean stop/restore required'
    assert at+(4020+300+120)*1000<cas['DEADLINES']['restore']
    expires=min(at+600000,cas['DEADLINES']['controller']-4020000)
    assert at+30000<expires
    a=dict(format='LIVE35_TWO_UNUSED_HOSTS_CAS_V1',grantId=cas['GRANT'],sourceSha256=sha((HERE/'live_cas.py').read_bytes()),newPolicySha256=sha(raw_policy),reviewSha256=review_pin,oldIdentities=basis['oldIdentities'],service=cas['SERVICE'],deadlines=cas['DEADLINES'],startsAt=at,expiresAt=expires,authorizationReference='Main existing real import authorization; live35 only unused prepare/writer host spec correction; original roles, service and all used keys unchanged.')
    auth=pack(a);packet=dict(authorization=base64.b64encode(auth).decode(),policy=base64.b64encode(raw_policy).decode())
    carrier=(HERE/'original-cas-live35-carrier.UNISSUED.py').read_text().replace('AUTH_SHA_LITERAL',repr(sha(auth))).replace('AUTH_START_LITERAL',str(at)).replace('AUTH_EXPIRES_LITERAL',str(expires))
    compile(carrier,'live35_carrier','exec')
    witness=(HERE/'TWO-PHASES.UNISSUED.json').read_bytes()
    manifest.update(state='ISSUED_LIVE35_TWO_UNUSED_HOSTS_SOURCE_CAS',rulesSha256=sha(witness),consumerSourcePinsSha256=CONSUMER_SHA,policySha256=sha(raw_policy),dispatcherSha256=sha(new_dispatcher),independentReviewSha256=review_pin,originalRegistrationDirectory=str(ORIGINAL),liveCasAuthoritySha256=sha(auth),liveCasExpiresAt=expires)
    output=Path(output).resolve();assert output.parent==ROOT/'outputs/主控';output.mkdir(mode=0o700)
    files={'authorization.json':auth,'packet.json':pack(packet),'envelope.json':pack(dict(source=base64.b64encode((HERE/'live_cas.py').read_bytes()).decode(),packet=packet)),'direct35-batched-real.json':raw_policy,'roles-authorization.json':role,'admin_exec.ISSUED.py':new_dispatcher,'original-cas-live35-carrier.ISSUED.py':carrier.encode(),'ISSUED.json':pack(manifest)}
    for name,raw in files.items():
        with (output/name).open('xb') as f:f.write(raw)
    return dict(state=manifest['state'],directory=str(output),authoritySha256=sha(auth),carrierSha256=sha(carrier.encode()),policySha256=sha(raw_policy),dispatcherSha256=sha(new_dispatcher),expiresAt=expires,roleBytesAndDeadlinesUnchanged=True,phaseSubmitted=False)

if __name__=='__main__':print(json.dumps(issue(*sys.argv[1:]),sort_keys=True))
