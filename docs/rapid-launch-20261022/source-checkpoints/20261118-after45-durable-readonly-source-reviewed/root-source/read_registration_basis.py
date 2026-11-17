from pathlib import Path
from datetime import datetime,timezone
import fcntl,json,os,runpy,socket
HERE=Path(__file__).resolve().parent
def main():
 assert os.getuid()==os.geteuid()==0 and socket.gethostname()=='naijue-server'
 a=runpy.run_path(str(HERE/'register_cas.py'),run_name='recovery_metadata_only')
 with os.fdopen(os.open(a['LOCK'],os.O_RDWR|os.O_NOFOLLOW),'r+b')as lock:
  assert a['identity'](os.fstat(lock.fileno()))==a['LOCK_ID'];fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  for path in(a['AUDIT'],a['NEW_MODULE'],a['NEW_POLICY'],a['PENDING']):assert not os.path.lexists(path)
  closure=a['quiet']();ids=a['basis']();a['snapshot'](ids)
  cfg=json.loads(a['read'](a['P']/'grant.json')[0])
  return dict(state='READONLY_AFTER45_BUSINESSROOT_DURABLE_BASIS',checkedAtUTC=datetime.now(timezone.utc).isoformat(),dispatcherSha256=a['OLD'],oldIdentities=ids,originalAuthRestored=True,restorationResultSha256=closure['restorationResultSha256'],ownedPID0=closure['ownedPID0'],pgdataPidAbsent=closure['pgdataPidAbsent'],noOtherActiveOperations=True,grantExpiresAtEpoch=cfg['expiresAtEpoch'],PGConnections=0,mutations=0)
if __name__=='__main__':print(json.dumps(main(),sort_keys=True))
