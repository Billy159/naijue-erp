"""Fixed C-authorized preservation of three pre-PG failed R3 controls only."""
import hashlib,importlib.util,json,os,re,stat,sys,time
from pathlib import Path
sys.dont_write_bytecode=True
KEY='t45-r4-preserve-failed-controls-20261107-01'
OPS='79c169a03391223ee7154fac89e83db2b27d9783a63f0ceffeff518b6d52b8fd'
CID='aebc1ded534bbbc975f59f17e470a4bc64f48f6e94e9abb4d2ac14220982667a'
FILES={'production-start-intent.json':'126e47b3fe8f6cd40a0ad5f704da60224dc109bbd1a0f9a4b201a480d749a5be','production-container-receipt.json':'967470b1264aa71385811f79abdd4b2dd9b2be0b9f1f4d62f93a2c65fe224bc7','authority/fresh35-production-provision-v2.json':'f65138aef3cb0ac4a846bc794f99c4b5b1bf755ffee9c9d8b103c051776a88e9'}
R={'status':'NOT_STARTED','jobKey':KEY,'filesMoved':[],'originalJobReplayed':False,'containerChanged':False,'PGExecuted':False,'materialCopied':False,'automaticRetry':False}
def need(v,c):
 if not v:raise ValueError(c)
def identity(s):return (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def metadata(s):return dict(zip(['device','inode','mode','uid','gid','nlink','bytes','mtimeNs','ctimeNs'],identity(s)))
def main():
 job=Path(os.environ['ERP_SHARED_JOB_DIR']);need(os.getuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45' and job==Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/jobs')/KEY,'EXACT_ROOT_T45_ARCHIVE_JOB_REQUIRED')
 leaf=job/'bundle/fresh35-production-carrier.py';need(hashlib.sha256(leaf.read_bytes()).hexdigest()==OPS,'EXACT_REVIEWED_R4_OPS_REQUIRED')
 spec=importlib.util.spec_from_file_location('r4_fixed_preservation',leaf);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.trusted(job);m.trusted(m.ROOT)
 need(m.ROOT.name=='phaseb-application-production-20261107-r3' and m.NAME=='t45-fresh35-production-20261107-r4','EXACT_REUSED_ROOT_AND_NEW_NAME_REQUIRED')
 terminals={}
 for key,pin,status in [('t45-prod35-r3-materials-20261107-01','bc260ca031433a2f3264213f8b55c76f5e783b88e7d17d022b1a2bb7cbbc1314','FAILED'),('t45-prod35-r3-provision-20261107-01','364b1a816542d9e31618bd28254fd598e7c46e6352bff5f1c4fdfbb618ca950a','FAILED'),('t45-r3-mount-failure-readonly-20261107-01','73fefc1e951d317acf4a2f467ba4c7b95a58d385a9d4e569cf35c6c9861ccc2c','COMPLETED')]:
  raw=m.read_file(m.CONTROL/'results'/(key+'.json'),65536,root=False);v=m.strict(raw);need(m.sha(raw)==pin and v.get('jobId')==key and v.get('taskId')=='T45' and v.get('status')==status,'EXACT_ORIGINAL_TERMINAL_REQUIRED');terminals[key]=pin
 original=m.inspect(CID);need(original['id']==CID and original['name']=='/t45-fresh35-production-20261107-r3' and original['image']==m.ENV_IMAGE and original['running'] is False and original['pid']==0 and original['labels'].get('t45.operation')=='t45-prod35-3b82-20261107-r3' and original['labels'].get('t45.source')==m.SOURCE,'EXACT_OLD_STOPPED_CARRIER_REQUIRED')
 need(not m.run(['docker','ps','-a','--filter','name=^/'+m.NAME+'$','--format','{{.ID}}']).strip(),'NEW_R4_CONTAINER_PRESENT_NO_REPLAY')
 absent=['state/production-fresh35-20261107-r3','state/production-fresh35-20261107-r4','state/data','state/wal','data','wal']
 for rel in absent:
  p=m.ROOT/rel;need(not p.exists() and not p.is_symlink(),'PG_WORK_OR_DATA_PRESENT_NO_ARCHIVE')
 # Fixed port metadata in the host namespace; the future container is separate.
 for table in ['/proc/net/tcp','/proc/net/tcp6']:
  for line in Path(table).read_text().splitlines()[1:]:need(int(line.split()[1].split(':')[1],16)!=18654,'R4_PROPOSED_PORT_ALREADY_PRESENT')
 unit=dict(v.split('=',1) for v in m.run(['systemctl','show','naijue-erp-op-5cc58239-db01634e82c5','--no-pager','--property=ActiveState,SubState,MainPID,ControlPID,ControlGroup']).decode().splitlines() if '=' in v)
 need(unit.get('ActiveState') in ['inactive','failed'] and unit.get('MainPID')=='0' and unit.get('ControlPID')=='0' and not unit.get('ControlGroup'),'ORIGINAL_PROVISION_UNIT_STILL_LIVE')
 plan=m.load_production_plan(str(job/'bundle/production-plan.json'),'b8168605c99f0db21757da65c40a497f7c3f46b756c3814879c05ac1c0ab7053');m.shared_real_package_binding();m.production_front(plan)
 snapshot={}
 for rel,pin in FILES.items():
  p=m.trusted(m.ROOT/rel);before=p.lstat();raw=m.read_file(p,65536,True);need(m.sha(raw)==pin and stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1 and stat.S_IMODE(before.st_mode)==0o600 and identity(before)==identity(p.lstat()),'ORIGINAL_CONTROL_BYTES_OR_METADATA_DIFFER');snapshot[rel]=(before,raw)
 dest=m.ROOT/'failed-provision-r3-20261107-01';need(not dest.exists() and not dest.is_symlink(),'ARCHIVE_PRESENT_OR_UNKNOWN_NO_REPLAY')
 free=os.statvfs(m.ROOT);need(free.f_bavail*free.f_frsize>=8207515646,'CURRENT_SPACE_BELOW_ORIGINAL_MINIMUM')
 for rel,(before,raw) in snapshot.items():need(identity((m.ROOT/rel).lstat())==identity(before) and m.read_file(m.ROOT/rel,65536,True)==raw,'CONTROL_CHANGED_BEFORE_ARCHIVE')
 dest.mkdir(mode=0o700);m.syncdir(dest.parent);(dest/'authority').mkdir(mode=0o700);m.syncdir(dest)
 manifest={'format':'T45_FIXED_FAILED_R3_CONTROL_PRESERVATION_V1','originalContainerId':CID,'originalTerminals':terminals,'originalUnit':unit,'files':{rel:{'sha256':FILES[rel],'before':metadata(s)} for rel,(s,_) in snapshot.items()},'materialUnchanged':True,'oldC14BytesNotRenewed':True}
 m.new_json(dest/'preservation-manifest.json',manifest)
 for rel,(before,raw) in snapshot.items():
  src=m.ROOT/rel;target=dest/rel;need(identity(src.lstat())==identity(before) and m.read_file(src,65536,True)==raw and not target.exists() and not target.is_symlink(),'CONTROL_CAS_CHANGED_OR_ARCHIVE_TARGET_PRESENT')
  os.rename(src,target);m.syncdir(src.parent);m.syncdir(target.parent);after=target.lstat();need(after.st_ino==before.st_ino and after.st_dev==before.st_dev and after.st_mode==before.st_mode and after.st_uid==before.st_uid and after.st_gid==before.st_gid and after.st_nlink==before.st_nlink and after.st_size==before.st_size and after.st_mtime_ns==before.st_mtime_ns and m.read_file(target,65536,True)==raw,'MOVED_CONTROL_READBACK_DIFFERS');R['filesMoved'].append({'relativePath':rel,'sha256':FILES[rel],'before':metadata(before),'after':metadata(after)})
 R.update(status='EXACT_THREE_FAILED_R3_CONTROLS_PRESERVED_NO_PG',archivePath=str(dest),originalContainerId=CID,originalContainerStopped=True,originalUnitNoLive=True,absentPGPaths=absent,hostPort18654Absent=True,futureContainerNamespacePortNotYetObserved=True,currentFreeBytes=os.statvfs(m.ROOT).f_bavail*os.statvfs(m.ROOT).f_frsize)
if __name__=='__main__':
 code=0
 try:main()
 except Exception as e:R.update(status='STOP_PARTIAL_PRESERVATION_OR_UNKNOWN_NO_REPLAY',safeCode=str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]+',str(e)) else type(e).__name__);code=2
 finally:(Path(os.environ['ERP_SHARED_JOB_DIR'])/'results/r3-controls-preservation-result.json').write_text(json.dumps(R,indent=2)+'\n')
 raise SystemExit(code)
