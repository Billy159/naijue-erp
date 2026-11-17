"""Single fresh read-only basis for the exact reviewed stopped normal38 CAS."""
from pathlib import Path
from datetime import datetime,timezone
import fcntl,json,os,runpy,socket,sys,hashlib

def read_basis(cas):
 need=cas['need'];B,P,H,LOCK=cas['B'],cas['P'],cas['H'],cas['LOCK']
 need(os.geteuid()==0 and socket.gethostname()=='naijue-server','EXACT_ROOT_HOST_REQUIRED')
 with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  identities={};pins={}
  for path,pin in cas['BASIS'].items():
   raw,meta=cas['read'](path,1000 if str(path).startswith(str(cas['C'])+'/') else 0)
   need(cas['sha'](raw)==pin,'ACTUAL_BASELINE_PIN_CHANGED');pins[str(path)]=pin;identities[str(path)]=meta
  identities.update(cas['required_history']());identities['executionLock']=cas['identity'](os.fstat(lock.fileno()))
  need(identities['executionLock']==cas['LOCK_ID'],'ORIGINAL_LOCK_CHANGED')
  # required_history returns all metadata-only custody identities, including35.
  for name in cas['CUSTODY_FILES']:
   if name not in identities:identities[name]=cas['identity'](Path(name).lstat())
  done=cas['quiet']();cas['snapshot']({'oldIdentities':identities})
  grant=json.loads(cas['read'](P/'grant.json')[0])
  return dict(state='READONLY_NORMAL38_REGISTRATION_BASIS',checkedAtUTC=datetime.now(timezone.utc).isoformat(),actualPins=pins,oldIdentities=identities,basisMismatches=[],executionLockMatches=True,activeOperationUnits=[],presentCandidateKeys=[],candidateKeys=list(cas['JOBS'].values()),completedPreparation=done,predecessorClosureKind='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED',grantExpiresAtEpoch=grant['expiresAtEpoch'],PGConnections=0,mutations=0,authenticationSnapshotBodiesOrDigestsRead=False)
if __name__=='__main__':
 assert len(sys.argv)==3
 p=Path(sys.argv[1]);assert hashlib.sha256(p.read_bytes()).hexdigest()==sys.argv[2]
 print(json.dumps(read_basis(runpy.run_path(str(p),run_name='exact_source_basis')),sort_keys=True))
