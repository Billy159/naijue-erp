"""Fixed metadata observation for the existing one-writer REAL access ledger."""
import hashlib,json,os,re,stat
from pathlib import Path
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-deb13-20261105-r1/phaseb-application-production-20261107-r3/state/real-r3')
RAW=Path('/srv/naijue-erp/isolated-targets/fresh35-deb13-20261105-r1/phaseb-application-production-20261107-r2/state/real-r3/package')
POINTER='nonroot-access-current.json'
def need(ok,code):
 if not ok:raise ValueError(code)
def sha(b):return hashlib.sha256(b).hexdigest()
def encode(v):return (json.dumps(v,sort_keys=True)+'\n').encode()
def meta(p):
 s=Path(p).lstat();need(not stat.S_ISLNK(s.st_mode) and (stat.S_ISDIR(s.st_mode) or stat.S_ISREG(s.st_mode)) and s.st_uid==0 and not s.st_mode&0o022,'ACCESS_OBSERVATION_PROTECTED_OBJECT_REQUIRED')
 return {'device':s.st_dev,'inode':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':oct(stat.S_IMODE(s.st_mode)),'nlink':s.st_nlink,'bytes':s.st_size,'directory':stat.S_ISDIR(s.st_mode),'mtimeNs':s.st_mtime_ns,'ctimeNs':s.st_ctime_ns}
def actual_path(path,base,raw):
 p=Path(path)
 if p==RAW or p.is_relative_to(RAW):return raw/p.relative_to(RAW)
 if p==HOST or p.is_relative_to(HOST):return base/p.relative_to(HOST)
 if p==HOST.parents[1]/'authority/fresh35-installed-real-window-v1.json':return Path('/etc/naijue-erp/fresh35-installed-real-window-v1.json') if base!=HOST else p
 raise ValueError('ACCESS_OBSERVATION_PATH_OUTSIDE_FIXED_SCOPE')
def pointer_bytes(base,read):
 p=base/POINTER
 return read(p,65536,True) if p.exists() or p.is_symlink() else None

def observe(base,raw,read,expected_plan=None,expected_description=None):
 data=pointer_bytes(base,read)
 if data is None:return None
 ref=json.loads(data);need(set(ref)=={'format','requestKey','phase','ledgerSha256','previousPointerSha256'} and ref['format']=='REAL_ACCESS_METADATA_REFERENCE_V1' and re.fullmatch(r't45-r4-real-(prepare|execute|inspect)-20261107-[0-9]{2}',ref['requestKey']) and ref['phase'] in ['before','active','restored'],'ACCESS_OBSERVATION_REFERENCE_REQUIRED')
 ledger=base/'nonroot-access'/ref['requestKey'];b=read(ledger/(ref['phase']+'-metadata.json'),131072,True);need(sha(b)==ref['ledgerSha256'],'ACCESS_OBSERVATION_LEDGER_CHANGED');v=json.loads(b)
 plan_raw=read(ledger/'before.json',65536,True);need(sha(plan_raw)==v['planLedgerSha256'],'ACCESS_OBSERVATION_PLAN_CHANGED')
 plan=json.loads(plan_raw);need(v['phase']==ref['phase'] and v['requestKey']==ref['requestKey'] and v['previousPointerSha256']==ref['previousPointerSha256'],'ACCESS_OBSERVATION_REFERENCE_DIFFERS')
 need(sha(read(ledger/'description.json',65536,True))==v['descriptionSha256'],'ACCESS_OBSERVATION_C_DESCRIPTION_CHANGED')
 description=json.loads(read(ledger/'description.json',65536,True));need(description['accessPlanSha256']==v['accessPlanSha256'] and description['requestKey']==ref['requestKey'],'ACCESS_OBSERVATION_C_PLAN_DIFFERS')
 need(sha(read(ledger/'access-plan.original.json',65536,True))==v['accessPlanSha256'],'ACCESS_OBSERVATION_C_PLAN_BYTES_CHANGED')
 need(json.loads(read(ledger/'access-plan.original.json',65536,True))==plan,'ACCESS_OBSERVATION_PLAN_BYTES_DIFFER')
 if ref['phase']=='active':need(expected_plan is not None and expected_description is not None,'ACCESS_OBSERVATION_ACTIVE_CONTEXT_REQUIRED')
 if expected_plan is not None:need(v['accessPlanSha256']==expected_plan and v['descriptionSha256']==expected_description and ref['phase']=='active','ACCESS_OBSERVATION_EXACT_ACTIVE_CONTEXT_REQUIRED')
 need(ref['phase']!='before','ACCESS_OBSERVATION_PREPARATION_INCOMPLETE')
 if ref['phase']=='restored':need(json.loads(read(ledger/'restored.json',65536,True))['childReaped'] is True,'ACCESS_OBSERVATION_CHILD_REAP_REQUIRED')
 need(set(v['entries'])=={r['before']['path'] for r in plan['changes']},'ACCESS_OBSERVATION_FINITE_ENTRIES_REQUIRED')
 # Only immutable RAW and approval objects are consumed during the Node job.
 # Working report/tmp directory metadata may change through that owned child.
 for row in plan['changes']:
  expected=v['entries'][row['before']['path']];declared={**row['before'],**(row['after'] if ref['phase']=='active' else {})}
  need(all(expected[k]==declared[k] for k in ['device','inode','uid','gid','mode','directory']),'ACCESS_OBSERVATION_DECLARED_METADATA_DIFFERS')
 for path,expected in v['entries'].items():
  p=Path(path)
  if p==RAW or p.is_relative_to(RAW) or p==HOST/'approvals' or p.parent==HOST/'approvals':
   need(meta(actual_path(path,base,raw))==expected,'ACCESS_OBSERVATION_METADATA_CHANGED')
 return v

def publish(phase,plan,ledger,description_raw,access_raw,previous,read,save):
 base=ledger.parent.parent;entries={r['before']['path']:meta(r['before']['path']) for r in plan['changes']}
 frame={'phase':phase,'requestKey':ledger.name,'accessPlanSha256':sha(access_raw),'descriptionSha256':sha(description_raw),'planLedgerSha256':sha(read(ledger/'before.json',65536,True)),'previousPointerSha256':sha(previous) if previous is not None else None,'entries':entries}
 save(ledger/(phase+'-metadata.json'),frame)
 frame_raw=read(ledger/(phase+'-metadata.json'),131072,True)
 ref={'format':'REAL_ACCESS_METADATA_REFERENCE_V1','requestKey':ledger.name,'phase':phase,'ledgerSha256':sha(frame_raw),'previousPointerSha256':frame['previousPointerSha256']}
 # Single original controller writer. Compare exact predecessor bytes/inode;
 # retain the old reference in the immutable ledger, never overwrite history.
 save(ledger/(phase+'-reference-receipt.json'),ref)
 current=pointer_bytes(base,read);need(current==previous,'ACCESS_OBSERVATION_PREDECESSOR_CHANGED')
 original=(base/POINTER).lstat() if previous is not None else None
 temp=ledger/(phase+'-reference.json');save(temp,ref)
 if previous is not None:need((base/POINTER).lstat().st_ino==original.st_ino and pointer_bytes(base,read)==previous,'ACCESS_OBSERVATION_PREDECESSOR_CHANGED')
 else:need(not (base/POINTER).exists(),'ACCESS_OBSERVATION_PREDECESSOR_CHANGED')
 os.replace(temp,base/POINTER)
 fd=os.open(base,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
 need(pointer_bytes(base,read)==encode(ref),'ACCESS_OBSERVATION_REFERENCE_READBACK_DIFFERS')
 return encode(ref)
