"""Future root-only, locked metadata read. D1 does not invoke this function."""
from pathlib import Path
from datetime import datetime,timezone
from types import ModuleType
import fcntl,json,os,runpy,socket
HERE=Path(__file__).resolve().parent
def main():
 assert os.getuid()==os.geteuid()==0 and socket.gethostname()=='naijue-server'
 a=runpy.run_path(str(HERE/'register_cas.py'),run_name='normal43_paired_metadata')
 lock=a['LOCK']
 with os.fdopen(os.open(lock,os.O_RDWR|os.O_NOFOLLOW),'r+b')as stream:
  assert a['identity'](os.fstat(stream.fileno()))==a['LOCK_ID'];fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB)
  for path in(a['AUDIT'],a['NEW_MODULE'],a['NEW_POLICY'],a['PENDING']):assert not os.path.lexists(path)
  closure=a['quiet']();identities=a['basis']();a['snapshot'](identities)
  capture=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/fresh35-first-production-20261110-r3/ordinary43-auth-capture-20261118-01');assert not os.path.lexists(capture),'CURRENT40_CAPTURE_ALREADY_PRESENT_NO_REPLAY'
  raw,_=a['read'](HERE/'r3_normal43_continuation.py')
  module=ModuleType('normal43_history');module.__file__=str(HERE/'r3_normal43_continuation.py');exec(compile(raw,module.__file__,'exec'),module.__dict__)
  core=ModuleType('normal43_read_core');core.read=lambda path:a['read'](path)[0];core.sha=a['sha'];core.strict=json.loads
  module.validate_history(core,a['need'],module.HISTORY['custodyStat9']);module.validate_closed40(core,a['need']);module.validate_latest41(core,a['need']);module.validate_closed42(core,a['need']);module.require_current_stopped(a['need'])
  restore=module.HISTORY['original39Restore'];base=a['B']/'jobs'/restore['key']
  term_raw,_=a['read'](base/'r3-outer-terminal.json');assert a['sha'](term_raw)==restore['terminalSha256']
  term=json.loads(term_raw);assert(term['jobId'],term['status'],term['exitCode'])==(restore['key'],'COMPLETED',0)
  ack_raw,_=a['read'](a['ACK42']);ack=json.loads(ack_raw)
  cfg=json.loads(a['read'](a['P']/'grant.json')[0])
  return dict(state='READONLY_NORMAL43_REGISTRATION_BASIS',checkedAtUTC=datetime.now(timezone.utc).isoformat(),oldIdentities=identities,dispatcherSha256=a['OLD'],diagnosticClosure=closure,grantExpiresAtEpoch=cfg['expiresAtEpoch'],executionLockMatches=True,candidateKeysAbsent=True,stoppedPGDATA=True,actual39StoppedAndOriginalAuthRestored=True,actualFailed40ClosedAndOriginalAuthRestored=True,actual41GuardianClosedAndOriginalAuthRestoredByRollback02=True,actual42UpgradeCommittedStoppedAndOriginalAuthRestored=True,original39AckSHAReadBackMatchesDerivedExpected=True,authenticationSnapshotBodiesOrDigestsRead=False,historicalPlanCustody={k:identities[k]for k in a['PLAN_CUSTODY']},planAndAckCustodyStat9={k:identities[k]for k in list(a['PLAN_CUSTODY'])+[str(a['ACK42'])]},prior42RetainedAckSha256=a['sha'](ack_raw),prior42RetainedAckValue=ack,PGConnections=0,mutations=0,registryOrJobSubmitted=False)
if __name__=='__main__':print(json.dumps(main(),sort_keys=True))
