"""One fresh root-only source basis. Main/T45 invoke; never run by D1."""
from pathlib import Path
from datetime import datetime,timezone
from types import ModuleType
import fcntl,hashlib,json,os,runpy,socket,sys

def read_basis(cas,module_raw):
 need=cas['need'];B,P,C,LOCK=cas['B'],cas['P'],cas['C'],cas['LOCK']
 need(os.geteuid()==0 and socket.gethostname()=='naijue-server','EXACT_ROOT_HOST_REQUIRED')
 need(hashlib.sha256(module_raw).hexdigest()==cas['MODULE_SHA256'],'EXACT_SOURCE_MODULE_REQUIRED')
 with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b')as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);identities={};pins={}
  for name,pin in cas['STATIC']['basis'].items():
   raw,meta=cas['read'](Path(name),1000 if name.startswith(str(C)+'/')else 0)
   need(cas['sha'](raw)==pin,'ACTUAL_BASELINE_PIN_CHANGED');identities[name]=meta;pins[name]=pin
  for name in cas['STATIC']['privateCustodyStatOnly']:
   identities[name]=cas['identity'](Path(name).lstat())
  identities['executionLock']=cas['identity'](os.fstat(lock.fileno()));need(identities['executionLock']==cas['LOCK_ID'],'ORIGINAL_LOCK_CHANGED')
  cas['snapshot']({'oldIdentities':identities});cas['quiet']()
  need(not any(os.path.lexists(path)for path in (cas['AUDIT'],cas['NEW_MODULE'],cas['NEW_POLICY'],cas['PENDING'],cas['ENTRY'].parent)),'REGISTRATION_ENTRY_OR_OUTPUT_PRESENT_READ_ORIGINAL')
  cfg=json.loads(cas['read'](P/'grant.json')[0]);old=cas['read'](P/'admin_exec.py')[0]
  wrapper=ModuleType('root07_actual_dispatcher');wrapper.__file__=str(P/'admin_exec.py');exec(compile(old,wrapper.__file__,'exec'),wrapper.__dict__)
  core,prior=wrapper.r3_continuity(cfg);need(prior.policy_sha256==cas['STATIC']['actualRootPins']['policy'],'EXACT_NORMAL38_POLICY_REQUIRED')
  module=ModuleType('root07_actual_stopped_check');module.__file__=str(cas['NEW_MODULE']);exec(compile(module_raw,module.__file__,'exec'),module.__dict__)
  module.validate_closed38(core,lambda value,code:need(value,code),{name:identities[name]for name in cas['STATIC']['privateCustodyStatOnly']})
  return dict(state='READONLY_ROOT07_SOURCE_REGISTRATION_BASIS',checkedAtUTC=datetime.now(timezone.utc).isoformat(),actualPins=pins,oldIdentities=identities,executionLockMatches=True,basisMismatches=[],activeOperationUnits=[],presentCandidateKeys=[],candidateKeys=[cas['STATIC']['rule']['jobId']],actual38StoppedAndOriginalAuthRestored=True,grantExpiresAtEpoch=cfg['expiresAtEpoch'],PGConnections=0,mutations=0,authenticationSnapshotBodiesOrDigestsRead=False)

if __name__=='__main__':
 assert len(sys.argv)==4
 path=Path(sys.argv[1]);assert hashlib.sha256(path.read_bytes()).hexdigest()==sys.argv[2]
 print(json.dumps(read_basis(runpy.run_path(str(path),run_name='root07_readonly_basis'),Path(sys.argv[3]).read_bytes()),sort_keys=True))
