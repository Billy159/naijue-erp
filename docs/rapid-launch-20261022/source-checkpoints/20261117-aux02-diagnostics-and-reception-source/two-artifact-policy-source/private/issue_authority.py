"""External C issuer only; no clock, server or runtime self-signing."""
from pathlib import Path
import json,hashlib
import reception_scope as s
def issue(starts_at,expires_at,decision_reference,review_file,review_pin,output):
 raw=Path(review_file).read_bytes();s.need(s.sha(raw)==review_pin,'EXACT_REVIEW_REQUIRED');review=json.loads(raw);pins=(s.BUNDLE.parent/'SOURCE-PINS.json').read_bytes()
 s.need(review.get('sourceOnly')is True and review.get('findings')==[] and review.get('sourcePinsSha256')==s.sha(pins)and review.get('state')=='SOURCE_PASS_TWO_FIXED_ARTIFACT_POLICY_PAIRS','SCOPED_SOURCE_REVIEW_REQUIRED')
 _,fixed,_=s.pins();authority={**fixed,'startsAt':starts_at,'expiresAt':expires_at,'decisionReference':decision_reference};body=(json.dumps(authority,sort_keys=True)+'\n').encode();s.bind(body,s.sha(body),fixed,False)
 out=Path(output)
 with out.open('xb')as f:f.write(body)
 return {'authoritySha256':s.sha(body),'installKey':s.INSTALL,'restoreKey':s.RESTORE,'policyPath':str(s.POLICY),'artifactKey':s.KEY}
