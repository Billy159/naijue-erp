"""Future root-only, locked metadata read. D1 does not invoke this function."""
from pathlib import Path
from datetime import datetime,timezone
from types import ModuleType
import fcntl,json,os,runpy,socket
HERE=Path(__file__).resolve().parent
def main():
 assert os.getuid()==os.geteuid()==0 and socket.gethostname()=='naijue-server'
 a=runpy.run_path(str(HERE/'register_cas.py'),run_name='normal41_paired_metadata')
 lock=a['LOCK']
 with os.fdopen(os.open(lock,os.O_RDWR|os.O_NOFOLLOW),'r+b')as stream:
  assert a['identity'](os.fstat(stream.fileno()))==a['LOCK_ID'];fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB)
  for path in(a['AUDIT'],a['NEW_MODULE'],a['NEW_POLICY'],a['PENDING']):assert not os.path.lexists(path)
  closure=a['quiet']();identities=a['basis']();a['snapshot'](identities)
  capture=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/fresh35-first-production-20261110-r3/ordinary41-auth-capture-20261117-01');assert not os.path.lexists(capture),'CURRENT40_CAPTURE_ALREADY_PRESENT_NO_REPLAY'
  raw,_=a['read'](HERE/'r3_normal41_continuation.py')
  module=ModuleType('normal41_history');module.__file__=str(HERE/'r3_normal41_continuation.py');exec(compile(raw,module.__file__,'exec'),module.__dict__)
  core=ModuleType('normal41_read_core');core.read=lambda path:a['read'](path)[0];core.sha=a['sha'];core.strict=json.loads
  module.validate_history(core,a['need'],module.HISTORY['custodyStat9']);module.validate_closed40(core,a['need']);module.require_current_stopped(a['need'])
  restore=module.HISTORY['original39Restore'];base=a['B']/'jobs'/restore['key']
  term_raw,_=a['read'](base/'r3-outer-terminal.json');assert a['sha'](term_raw)==restore['terminalSha256']
  term=json.loads(term_raw);assert(term['jobId'],term['status'],term['exitCode'])==(restore['key'],'COMPLETED',0)
  cfg=json.loads(a['read'](a['P']/'grant.json')[0])
  return dict(state='READONLY_NORMAL41_REGISTRATION_BASIS',checkedAtUTC=datetime.now(timezone.utc).isoformat(),oldIdentities=identities,dispatcherSha256=a['OLD'],diagnosticClosure=closure,grantExpiresAtEpoch=cfg['expiresAtEpoch'],executionLockMatches=True,candidateKeysAbsent=True,stoppedPGDATA=True,actual39StoppedAndOriginalAuthRestored=True,actualFailed40ClosedAndOriginalAuthRestored=True,original39AckSHAReadBackMatchesDerivedExpected=True,authenticationSnapshotBodiesOrDigestsRead=False,PGConnections=0,mutations=0,registryOrJobSubmitted=False)
if __name__=='__main__':print(json.dumps(main(),sort_keys=True))
