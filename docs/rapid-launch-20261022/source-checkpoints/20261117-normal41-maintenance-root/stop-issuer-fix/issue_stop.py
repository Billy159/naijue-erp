"""Main-local STOP-only one-ID correction. No authority minted at module load."""
from pathlib import Path
import copy,hashlib,json,os,runpy
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
OLD=HERE.with_name('20261117-r3-ordinary41-root-source-01')
ORIGINAL_SOURCE='aadc9d64d157e46f0d7568ceecc69efca26f599fd68f4de8950d1942ac96a3a8'
REVIEW=ROOT/'outputs/QB/20261117-r3-ordinary41-stop-issuer-fix-review-01/RESULT.json'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def issue(phase,rules_file,rules_pin,registration_directory,evidence_path=None,evidence_pin=None,predecessor_path=None,predecessor_pin=None):
 assert phase=='stop','ONLY_EXISTING_STOP41_NO_OTHER_PHASE'
 raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(raw)
 for name,row in source['files'].items():
  body=(HERE/name).read_bytes();assert sha(body)==row['sha256']and len(body)==row['bytes']
 review_raw=REVIEW.read_bytes();review=json.loads(review_raw)
 assert review['sourceOnly']is True and review['findings']==[]and review['sourcePinsSha256']==sha(raw)
 assert review['originalRegisteredSourcePinsSha256']==ORIGINAL_SOURCE
 original_raw=(OLD/'SOURCE-PINS.json').read_bytes();assert sha(original_raw)==ORIGINAL_SOURCE
 original=json.loads(original_raw)
 for name,row in original['files'].items():
  body=(OLD/name).read_bytes();assert sha(body)==row['sha256']and len(body)==row['bytes']
 correction=json.loads((HERE/'CORRECTION.json').read_bytes())
 assert correction['originalRegisteredSourcePinsSha256']==ORIGINAL_SOURCE
 assert Path(rules_file).resolve()==OLD/'FIVE-PHASES.UNISSUED.json'and rules_pin==original['rulesSha256']
 assert evidence_path is not None and evidence_pin is not None and predecessor_path is not None and predecessor_pin is not None
 # Verify actual evidence bytes; the unchanged issuer also validates all actual
 # five terminal values, service observation, policy, roles, expiry and outputs.
 assert sha(Path(evidence_path).read_bytes())==evidence_pin and sha(Path(predecessor_path).read_bytes())==predecessor_pin
 old=runpy.run_path(str(OLD/'issue_phase.py'),run_name='main41_original_stop_issuer')
 original_issue=old['issue'];g=original_issue.__globals__;preservation=g['preservation_authority']
 def corrected(phase,witness,rule,start,evidence,roles,policy,now):
  assert phase=='stop'and witness['stopCurrentBatchOperations']==correction['before']
  assert rule['jobId']==witness['jobs']['stop']==correction['stopJobId']
  assert witness['jobs']['upgrade']==correction['after'][-1]
  corrected_witness=copy.deepcopy(witness);corrected_witness['stopCurrentBatchOperations']=correction['after']
  return preservation(phase,corrected_witness,rule,start,evidence,roles,policy,now)
 g['preservation_authority']=corrected
 try:result=original_issue(phase,rules_file,rules_pin,registration_directory,evidence_path,evidence_pin,predecessor_path,predecessor_pin)
 finally:g['preservation_authority']=preservation
 # Keep the original ISSUED/sourcePin unchanged. Record this correction and QA
 # separately; do not touch registration, roles, policy or old source.
 binding=dict(originalRegisteredSourcePinsSha256=ORIGINAL_SOURCE,correctionSourcePinsSha256=sha(raw),correctionReviewSha256=sha(review_raw),authoritySha256=result['authoritySha256'],originalRulesSha256=rules_pin,evidenceSha256=evidence_pin,predecessorSha256=predecessor_pin,stopJobId=result['jobId'],actualPhaseSubmitted=False)
 target=Path(registration_directory)/'phase-stop/STOP-CORRECTION-BINDING.json'
 with os.fdopen(os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w')as stream:json.dump(binding,stream,sort_keys=True)
 return result
