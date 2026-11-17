"""Main-only STOP37 issuer for actual pending04 policy; original restoration remains separate."""
from pathlib import Path
from datetime import datetime
import hashlib,json,os,runpy,sys,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
CONTROL=ROOT/'outputs/主控'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin;return json.loads(raw)
def issue(registration_directory,cas_readback,cas_readback_pin,stop_basis,stop_basis_pin):
 cas=runpy.run_path(str(HERE/'live_cas.py'),run_name='source_only_cas_api')
 pins=json.loads((HERE/'SOURCE-PINS.json').read_text())
 for name,row in pins['files'].items():assert sha((HERE/name).read_bytes())==row['sha256']
 issued=Path(registration_directory).resolve();assert issued.parent==CONTROL
 manifest=json.loads((issued/'ISSUED.json').read_text());assert manifest['state']=='ISSUED_LIVE37_PENDING04_SOURCE_CAS'
 policy=read(issued/'direct37-batched-real.json',manifest['policySha256'])
 roles=read(issued/'roles-authorization.json',cas['ROLE'])
 old=(CONTROL/'20261117-r3-normal37-registration-window-01/direct37-batched-real.json').read_bytes()
 cas['delta'](old,(issued/'direct37-batched-real.json').read_bytes())
 actual=read(cas_readback,cas_readback_pin)
 assert actual['state']=='ACTUAL_LIVE37_PENDING04_THREE_FILES_CAS_READBACK_MATCHED'
 assert actual['dispatcherSha256']==manifest['dispatcherSha256'] and actual['policySha256']==manifest['policySha256']
 assert actual['authorizationSha256']==manifest['liveCasAuthoritySha256']
 assert actual['service']==cas['SERVICE'] and actual['deadlines']==cas['DEADLINES'] and actual['rolesAuthoritySha256']==cas['ROLE']
 assert actual['PGConnections']==actual['mutations']==0
 witness=read(HERE/'PENDING04-RULES.UNISSUED.json',manifest['rulesSha256'])
 # Reuse the original pure preservation validator with only the pending STOP directory/rule changed.
 api=runpy.run_path(str(HERE/'issue_phase.py'),run_name='pending04_pure_preservation_api')
 v=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
 start=read(v/'NORMAL37-RUNTIME-01/start/ACTUAL-START37-RESULT.json',START37_RECEIPT_SHA)
 assert start['service']==cas['SERVICE']
 evidence=read(stop_basis,stop_basis_pin)
 assert set(evidence['currentBatchTerminals'])=={'t45-r3-batched-install-20261116-02','t45-r3-batched161-command-successor-20261116-01',cas['JOBS']['prepare'],cas['JOBS']['writer']}
 # A future04 null is an observed absence only, never a fabricated terminal.
 assert evidence['PGConnections']==evidence['mutations']==0 and evidence['authenticationSnapshotBodiesOrDigestsRead'] is False
 rule=policy['jobs']['stop'];assert rule['bundlePins']['normal05_preserve_stop.py']==cas['NEW_STOP']
 os.environ['ERP_SHARED_JOB_ID']=rule['jobId'];os.environ['ERP_SHARED_JOB_DIR']='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/'+rule['jobId']
 at=time.time_ns()//1000000
 checked=int(datetime.fromisoformat(evidence['checkedAtUTC'].replace('Z','+00:00')).timestamp()*1000)
 # The CAS happened before preparation/writer; its successful readback need not be fresh hours later.
 assert 0<=at-checked<=300000,'fresh actual STOP basis required'
 assert at+540000<cas['DEADLINES']['restore']
 authority=api['preservation_authority']('stop',witness,rule,start,evidence,roles,policy,at)
 assert authority['service']==cas['SERVICE'] and at+rule['timeoutSeconds']*1000<authority['expiresAt']<=policy['expiresAt']
 raw=(json.dumps(authority,sort_keys=True,indent=2)+'\n').encode()
 directory=CONTROL/'20261117-r3-direct-service37-stop-window-04';directory.mkdir(mode=0o700)
 report=dict(path=str(directory/rule['authorityLeaf']),sha256=sha(raw),bytes=len(raw),key=rule['jobId'],expiresAt=authority['expiresAt'],startsAt=at,stopOnly=True,casReadbackSha256=cas_readback_pin,stopBasisSha256=stop_basis_pin)
 with (directory/rule['authorityLeaf']).open('xb')as f:f.write(raw)
 with (directory/'ISSUED.json').open('x')as f:json.dump(report,f,sort_keys=True)
 return report
START37_RECEIPT_SHA='e7c2b22bd1de3ea2af4cb8d5e746ac65dbf0a10b7caff3ddfe0f32fa28df7e17'
if __name__=='__main__':print(json.dumps(issue(*sys.argv[1:]),sort_keys=True))
