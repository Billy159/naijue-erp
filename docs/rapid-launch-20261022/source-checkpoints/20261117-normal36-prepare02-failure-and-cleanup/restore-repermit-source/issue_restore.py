"""Main-only new finite exact RESTORE36 permit. No role renewal or submission."""
from pathlib import Path
from datetime import datetime
import hashlib,json,runpy,sys,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
CONTROL=ROOT/'outputs/主控'
ORIGINAL=ROOT/'outputs/D1/20261117-r3-normal36-root-source-03'
V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
REG=CONTROL/'20261117-r3-normal36-registration-window-01'
LIVE=CONTROL/'20261117-r3-normal36-live-stop-window-01'
OLD_WINDOW=CONTROL/'20261117-r3-direct-service36-restore-window-01'
OUTPUT=CONTROL/'20261117-r3-direct-service36-restore-window-02'
KEY='t45-r3-ordinary36-auth-restore-20261116-01'
OLD_PERMIT='fbb6ccf5bc21f99fe01b381b44dea0d59938be91f9e959a91c9c77e9ce933c8e'
ROLE='d8341c2a2f0067bf33073a1001e1f50f7f91f6fb872b626a8d2dbd9d57bea57f'
sha=lambda b:hashlib.sha256(b).hexdigest()
def checked(path,pin):
    raw=Path(path).read_bytes();assert sha(raw)==pin,path;return raw
def read(path,pin):return json.loads(checked(path,pin))
def pack(value):return(json.dumps(value,sort_keys=True,indent=2)+'\n').encode()
def frozen_inputs():
    witness=read(ORIGINAL/'SIX-PHASES.UNISSUED.json','b25acf54558fe9b0236e627f5ede5f785ad84f063f73ea0ff689730db41b4b4e')
    old_policy=read(REG/'direct36-batched-real.json','b0476add83b3f8496be0944c8f5f29b933ebda42e3c0b68ed1f65ece7b57c36a')
    policy=read(LIVE/'direct36-batched-real.json','3dd91f04c776d7bd157bde7e5c5c44d63b1a3724ef167ade99cf6e9f0f13a633')
    assert old_policy['jobs']['restore']==policy['jobs']['restore']
    rule=policy['jobs']['restore'];assert(rule['jobId'],rule['timeoutSeconds'],rule['script'])==(KEY,300,'ordinary05_roles_job.py')
    roles=read(REG/'roles-authorization.json',ROLE)
    assert rule['bundlePins']['roles-authorization.json']==ROLE
    folder=Path(witness['phaseDirectories']['restore'])
    assert folder==V/'NORMAL36-SOURCE-SUCCESSOR-02/restore/bundle'
    for name,pin in rule['bundlePins'].items():checked(folder/name,pin)
    old_raw=checked(OLD_WINDOW/'host-authorization.json',OLD_PERMIT);old=json.loads(old_raw)
    assert old['requestKey']==KEY and old['phase']=='restore' and old['rolesAuthoritySha256']==ROLE
    assert checked(folder/rule['authorityLeaf'],OLD_PERMIT)==old_raw
    start=read(V/'NORMAL36-RUNTIME-01/start/ACTUAL-START36-RESULT.json','2d9aa879a649ad9a47ccfeb4df218ee5adcca5059f1b0b5722197ca816acc486')
    stop=read(V/'NORMAL36-RUNTIME-01/stop/ACTUAL-STOP36-RESULT.json','0a1248f28c51437bc83dc474eae05f0d43dbc9a626af9d10ee82cf541b2ad87c')
    assert stop['requestKey']==policy['jobs']['stop']['jobId'] and stop['result']['service']==start['service']==old['service']
    assert(stop['terminal']['status'],stop['terminal']['exitCode'])==('COMPLETED',0)
    assert stop['pgdataPidAbsent'] is True and stop['resultObjectsEqual'] is True
    assert stop['result']['pgStopped'] is True and stop['result']['cleanupSha256']==stop['rootPins']['cleanup']
    base=read(V/'RESTORE36-UNACCEPTED-RESUME-SOURCE-01/ACTUAL-INVENTORY.json','6c3917a736ee92bed1f1cc171a2b06f2ff37c392ecc9d15186f6f6e047770e69')
    expected={name:dict(bytes=(folder/name).stat().st_size,sha256=sha((folder/name).read_bytes()))for name in rule['bundlePins']}
    expected[rule['authorityLeaf']]=dict(bytes=len(old_raw),sha256=OLD_PERMIT)
    rows=[dict(name=name,**row)for name,row in sorted(expected.items())]
    manifest=(json.dumps(dict(taskId='T45',jobId=KEY,files=rows),sort_keys=True)+'\n').encode()
    assert sha(manifest)=='25c7073069327ed6d4a1e3e8dd316ccb8a4f9d8697a0dab767a62bee9f4c0ecd'
    expected['bundle-manifest.json']=dict(bytes=len(manifest),sha256=sha(manifest))
    assert base['expected']==expected
    return witness,policy,roles,rule,old,start,stop,base

def validate_inventory(actual,base):
    assert set(actual)==set(base)
    # Real empty original stage only; a later read may differ only in observation time.
    assert {k:v for k,v in actual.items()if k!='checkedAtUTC'}=={k:v for k,v in base.items()if k!='checkedAtUTC'}
    assert actual['state']=='RESTORE36_EXISTING_STAGE_COMPLETE_READONLY_INVENTORY' and actual['requestKey']==KEY
    assert actual['uploadedBundle']=={} and set(actual['missingLeafNames'])==set(actual['expected'])
    assert set(actual['directoryIdentities'])=={'job','bundle','results'}
    for leaf,inode in [('job',28841818),('bundle',28841819),('results',28841820)]:
        identity=actual['directoryIdentities'][leaf]
        assert len(identity)==9 and identity[:5]==[66304,inode,1000,1000,448]
    assert len(actual['dualGrantRequestWorkerAbsences'])==8 and all(v is True for v in actual['dualGrantRequestWorkerAbsences'].values())
    assert all(actual[k] is True for k in ('PGStopped','activeOperationsEmpty','noUploadProcessLeftovers','oldControlJobAbsent','restoreAttemptAndRestoredAbsent','resultsEmpty'))
    assert actual['PGConnections']==actual['mutations']==0 and actual['authenticationSnapshotBodiesOrDigestsRead'] is False
    return int(datetime.fromisoformat(actual['checkedAtUTC'].replace('Z','+00:00')).timestamp()*1000)

def issue(review_path,review_pin,inventory_path,inventory_pin):
    source=json.loads((HERE/'SOURCE-PINS.json').read_bytes())
    for name,row in source['files'].items():checked(HERE/name,row['sha256'])
    review=read(review_path,review_pin)
    assert Path(review_path).resolve()==ROOT/'outputs/QB/20261117-r3-normal36-restore-repermit-review-01/RESULT.json'
    assert review['state']=='SOURCE_PASS_NORMAL36_RESTORE_REPERMIT_WRAPPER_ONLY' and review['sourceOnly'] is True and review['findings']==[]
    assert review['sourcePinsSha256']==sha((HERE/'SOURCE-PINS.json').read_bytes())
    witness,policy,roles,rule,old,start,stop,base=frozen_inputs()
    inventory=read(inventory_path,inventory_pin);checked_at=validate_inventory(inventory,base)
    original_issuer=ORIGINAL/'issue_phase.py'
    checked(original_issuer,ORIGINAL_ISSUER_SHA)
    api=runpy.run_path(str(original_issuer),run_name='original_restore_pure_authority_api')
    # Only Main's actual invocation reaches this clock. No new role/service authority.
    at=time.time_ns()//1000000
    assert 0<=at-checked_at<=300000,'fresh real original-key empty-stage inventory required'
    assert policy['startsAt']<=at<at+300000<min(roles['restorationDeadline'],policy['expiresAt'])
    authority=api['preservation_authority']('restore',witness,rule,start,stop,roles,policy,at)
    assert {k:v for k,v in authority.items()if k not in ('startsAt','expiresAt')}=={k:v for k,v in old.items()if k not in ('startsAt','expiresAt')}
    assert authority['requestKey']==KEY and at+300000<authority['expiresAt']<=min(at+900000,roles['restorationDeadline'],policy['expiresAt'])
    raw=pack(authority);assert sha(raw)!=OLD_PERMIT
    OUTPUT.mkdir(mode=0o700)
    report=dict(state='ISSUED_NEW_FINITE_EXACT_RESTORE36_PERMIT_ONLY_NOT_SUBMITTED',path=str(OUTPUT/rule['authorityLeaf']),sha256=sha(raw),bytes=len(raw),key=KEY,startsAt=at,expiresAt=authority['expiresAt'],originalPermitSha256=OLD_PERMIT,oldPermitNeverPublish=True,rolesAuthoritySha256=ROLE,independentReviewSha256=review_pin,sourcePinsSha256=sha((HERE/'SOURCE-PINS.json').read_bytes()),inventorySha256=inventory_pin,policySha256='3dd91f04c776d7bd157bde7e5c5c44d63b1a3724ef167ade99cf6e9f0f13a633',roleOrRestorationDeadlineExtended=False,phaseSubmitted=False)
    with(OUTPUT/rule['authorityLeaf']).open('xb')as f:f.write(raw)
    with(OUTPUT/'ISSUED.json').open('xb')as f:f.write(pack(report))
    return report
ORIGINAL_ISSUER_SHA='90f959296e4f57dcdcbdb3bbd6e2b8c45a531000d2431cde13eac855f39e4fd1'
if __name__=='__main__':print(json.dumps(issue(*sys.argv[1:]),sort_keys=True))
