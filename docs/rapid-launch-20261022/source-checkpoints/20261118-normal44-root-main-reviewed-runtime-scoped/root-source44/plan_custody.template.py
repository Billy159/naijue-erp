# Explicit plan paths are historical prepare05 scope, not new runtime identities.
PLAN_DIRECTORY=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-05')
PLAN_CUSTODY={str(PLAN_DIRECTORY):'directory',str(PLAN_DIRECTORY/'batched-plan.sqlite'):'file',str(PLAN_DIRECTORY/'original-initializer.json'):'file'}
ACK42=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261117-42/retained-ack.json')
def plan_basis():
 out={}
 for name,kind in PLAN_CUSTODY.items():
  path=Path(name);s=path.lstat()
  need(path.resolve()==path and (s.st_uid,s.st_gid)==(61035,61035)and(stat.S_ISDIR(s.st_mode)and stat.S_IMODE(s.st_mode)==0o700 if kind=='directory'else stat.S_ISREG(s.st_mode)and stat.S_IMODE(s.st_mode)==0o600 and s.st_nlink==1 and s.st_size>0),'HISTORICAL_PREPARE05_PLAN_STAT_REQUIRED')
  if path.name=='original-initializer.json':need(s.st_size==58716444,'HISTORICAL_INITIALIZER_EXACT_BYTES_REQUIRED')
  out[name]=list(identity(s))
 s=ACK42.lstat();need(ACK42.resolve()==ACK42 and stat.S_ISREG(s.st_mode)and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o022,'HISTORICAL_ACK42_STAT_REQUIRED');out[str(ACK42)]=list(identity(s));return out
