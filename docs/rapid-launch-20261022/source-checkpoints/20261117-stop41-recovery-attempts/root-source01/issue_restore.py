"""Eight-parameter exact recovery-stop bridge to original41 restoration."""
from pathlib import Path
import copy,hashlib,json,os,runpy
HERE=Path(__file__).resolve().parent;OLD=HERE.with_name('20261117-r3-ordinary41-root-source-01');ROOT=HERE.parents[2]
KEY='t45-r3-ordinary41-preserve-stop-recovery-20261117-01'
REVIEW=ROOT/'outputs/QB/20261117-r3-normal41-stop-recovery-joint-review-01/RESULT.json'
sha=lambda b:hashlib.sha256(b).hexdigest()
def issue(phase,rules_file,rules_pin,registration_directory,evidence_path=None,evidence_pin=None,predecessor_path=None,predecessor_pin=None):
 assert phase=='restore'
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw)
 for name,row in source['files'].items():assert sha((HERE/name).read_bytes())==row['sha256']
 qraw=REVIEW.read_bytes();q=json.loads(qraw);assert q['sourceOnly']is True and q['findings']==[]and q['rootPairReviewComplete']is True and q['sourcePinsSha256']==sha(source_raw)
 assert sha((OLD/'SOURCE-PINS.json').read_bytes())=='aadc9d64d157e46f0d7568ceecc69efca26f599fd68f4de8950d1942ac96a3a8'
 assert evidence_path and predecessor_path and sha(Path(evidence_path).read_bytes())==evidence_pin and sha(Path(predecessor_path).read_bytes())==predecessor_pin
 evidence=json.loads(Path(evidence_path).read_bytes());h=json.loads((HERE/'HISTORY.json').read_bytes())
 assert evidence['requestKey']==KEY and evidence['result']['service']==h['service']and evidence['result']['pgStopped']is True
 api=runpy.run_path(str(OLD/'issue_phase.py'),run_name='original41_exact_restore');original=api['issue'];g=original.__globals__;preservation=g['preservation_authority']
 def bridge(phase,witness,rule,start,evidence,roles,policy,now):
  assert phase=='restore'and roles['restorationDeadline']==h['originalRestorationDeadline']and start['service']==h['service']
  adjusted=copy.deepcopy(policy);assert adjusted['jobs']['stop']['jobId']=='t45-r3-ordinary41-preserve-stop-20261117-01';adjusted['jobs']['stop']['jobId']=KEY
  return preservation(phase,witness,rule,start,evidence,roles,adjusted,now)
 g['preservation_authority']=bridge
 try:result=original(phase,rules_file,rules_pin,registration_directory,evidence_path,evidence_pin,predecessor_path,predecessor_pin)
 finally:g['preservation_authority']=preservation
 target=Path(registration_directory)/'phase-restore/RECOVERY-STOP-RESTORE-BINDING.json'
 with os.fdopen(os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w')as f:json.dump(dict(originalRegisteredSourcePinsSha256='aadc9d64d157e46f0d7568ceecc69efca26f599fd68f4de8950d1942ac96a3a8',recoverySourcePinsSha256=sha(source_raw),recoveryReviewSha256=sha(qraw),authoritySha256=result['authoritySha256'],recoveryStopKey=KEY,evidenceSha256=evidence_pin),f,sort_keys=True)
 return result
