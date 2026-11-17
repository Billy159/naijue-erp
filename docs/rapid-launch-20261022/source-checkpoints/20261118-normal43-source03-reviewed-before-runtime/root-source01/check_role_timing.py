"""Relative arithmetic only; no clock, C, role credential or authority fixture."""
from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2]
def main():
 p=R/'outputs/主控/20261118-r3-after42-source43-scope-01/ROLE-TIMING-ADDENDUM-01.json';raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()=='6ac3a4e070f4a108bfbbae5e6dde1293330a3577ed4a34ecdd1408ee7d07cd11'
 # Milliseconds relative to future Main t0; these are durations, not timestamps.
 controller,admin,restoration,parent=4000000,4120000,4900000,5100000
 assert controller+120000==admin<restoration<parent
 assert 3540000==300000+3000000+240000
 assert controller-3540000==460000
 for elapsed in(0,1,999,100000,459999):
  seconds=min(4200,(restoration-600000-elapsed)//1000);outer=elapsed+seconds*1000;work=outer-35000
  assert elapsed+3540000<controller and seconds>2400
  assert admin<work<outer<parent
  assert controller+120000<=min(work,outer,restoration,parent)
 assert not(460000+3540000<controller)
 reg=(D/'issue_registration.py').read_text();phase=(D/'issue_phase.py').read_text()
 assert all(s in reg for s in('controllerValidUntil=now+4000000','backupAdminValidUntil=now+4120000','restorationDeadline=now+4900000','expiresAt=now+900000','now+5100000','expiresAt=now+600000'))
 assert "for phase in ('start','writer')"in phase and '+240)*1000'in phase and 'min(4200,'in phase
 result=dict(state='SOURCE43_RELATIVE_TIMING_ARITHMETIC_PASS',checks=10,durationsMilliseconds=dict(controller=controller,admin=admin,restoration=restoration,parent=parent),strictStartElapsedLessThanMilliseconds=460000,earliestWorkDeadlineRelativeMilliseconds=4165000,outerMinusWorkMilliseconds=35000,clockCalls=0,authoritiesIssued=False,positiveAuthorityOrFutureServiceFixtures=False)
 (D/'ROLE-TIMING-CHECKS.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
