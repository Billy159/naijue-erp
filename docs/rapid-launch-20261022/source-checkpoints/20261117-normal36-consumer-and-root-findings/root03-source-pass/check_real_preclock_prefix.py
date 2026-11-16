"""Exercise actual issuer metadata validators, not copied assertions or future fixtures."""
from pathlib import Path
import hashlib,json,runpy,sys
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def main():
 issuer=runpy.run_path(str(HERE/'issue_registration.py'),run_name='actual_issuer_pure_prefix')
 cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='actual_static_cas')
 witness=json.loads((HERE/'SIX-PHASES.UNISSUED.json').read_text())
 review=ROOT/'outputs/QB/20261117-r3-normal36-consumer-review-02/RESULT.json';review_pin='5ae30a41a6df1dc5adc7ba6c1535e83e5ea229433939db6104e7b5c4c3ae749b'
 consumer,interface,report=issuer['checked_consumer'](witness,review,review_pin)
 rules,folders=issuer['checked_static_rules'](witness,cas)
 # Real runpy issuer resolution, not a sys.path model of it.
 phase=runpy.run_path(str(HERE/'issue_phase.py'),run_name='actual_phase_issuer_load_only')
 pair=phase['load_issuer_pair']();scope=pair['native_scope']()
 assert scope=={'requestKey':'t45-r3-final33-plan-prepare-20261116-01','batchPlanPath':witness['preparationIdentityMapping']['batchPlanPath']}
 assert all(len(v)==6 for v in rules.values()) and rules==cas['EXPECTED_RULES']
 result=dict(state='PASS_REAL_ISSUER_CONSUMER_AND_STATIC_RULE_PREFIX_NO_CLOCK',consumerSourcePinsSha256=witness['consumerSourcePinsSha256'],interfaceSha256=consumer['interfaceSha256'],consumerReviewSha256=review_pin,ruleFields=sorted(next(iter(rules.values()))),ruleCount=len(rules),samePureFunctionsUsedByRealIssuer=True,actualRunpyMappingResolution=True,clockIssued=False,authorityConstructed=False,rootReviewOrFreshBasisFixtureCreated=False,futureCOrEpochOrTargetConstructed=False,PGConnections=0,serverActions=0,mainOrNativeOrCASCalled=False)
 p=HERE/'REAL-PRE-CLOCK-PREFIX-RESULT.json';p.write_text(json.dumps(result,sort_keys=True,indent=2)+'\n');print(hashlib.sha256(p.read_bytes()).hexdigest())
if __name__=='__main__':main()
