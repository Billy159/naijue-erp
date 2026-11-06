#!/usr/bin/python3
"""One original materialize-app child, existing archive/image, no new PG.
Only this job's exact Python child is stopped if the original disk floor fails.
"""
import hashlib,importlib.util,json,os,re,signal,stat,subprocess,sys,time
from pathlib import Path
sys.dont_write_bytecode=True
SOURCE_SHA='aa564fe15f65a21b47c374f35c2814d3163c0ac0c086501a2c88b9c760e7ca7b'
KEY='t45-prod35-10fc5e-materialize-20261107-01'
FLOOR=4294967296
START_MINIMUM=8207515646
R={'status':'NOT_STARTED','jobKey':KEY,'sourceSha256':SOURCE_SHA,'postgresStarted':False,'newImageBuilt':False,'archiveUploaded':False,'businessDatabaseWrites':False,'automaticRetry':False}
def need(value,code):
 if not value:raise ValueError(code)
def stop_direct_materializer(child,identity,matched_stop):
 if identity is not None:return matched_stop(child,identity)
 # /proc metadata may fail before identity exists. This is still only the
 # direct, unreaped Popen child created below, never a process lookup. Kernel
 # waitid proves direct-child ownership without consuming its exit status.
 if child.poll() is not None:child.wait();return True
 try:os.waitid(os.P_PID,child.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
 except ChildProcessError:return False
 child.terminate()
 try:child.wait(timeout=3)
 except subprocess.TimeoutExpired:
  child.kill()
  try:child.wait(timeout=3)
  except subprocess.TimeoutExpired:return False
 return child.poll() is not None
def main():
 need(os.getuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45','ORIGINAL_ROOT_T45_REQUIRED')
 job=Path(os.environ['ERP_SHARED_JOB_DIR']);need(job==Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/jobs')/KEY,'EXACT_NEW_ORIGINAL_JOB_REQUIRED')
 leaf=job/'bundle/fresh35-production-carrier.py';need(hashlib.sha256(leaf.read_bytes()).hexdigest()==SOURCE_SHA,'EXACT_REVIEWED_OPS_REQUIRED')
 spec=importlib.util.spec_from_file_location('reviewed_materialize_ops',leaf);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.trusted(job);m.trusted(leaf)
 raw=m.read_file(job/'bundle/materialize-plan.json',65536,True);plan=m.load_plan(str(job/'bundle/materialize-plan.json'),m.sha(raw));need(plan['operationId']=='t45-prod35-10fc5e-20261107-01','EXACT_NEW_PRODUCTION_OPERATION_REQUIRED')
 need(not m.ROOT.exists() and not m.ROOT.is_symlink(),'PRODUCTION_ROOT_PRESENT_OR_UNKNOWN_NO_REPLAY')
 parent=m.trusted(m.ROOT.parent);before=parent.stat();fd=os.open(parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 child=None;identity=None;guard_start=time.monotonic();last=None;minimum=None;maxgap=0;samples=0
 def interrupted(*_):raise ValueError('MATERIALIZATION_PARENT_INTERRUPTED')
 for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(sig,interrupted)
 def sample(starting=False):
  nonlocal minimum,samples
  current=parent.stat();opened=os.fstat(fd);need((current.st_dev,current.st_ino)==(before.st_dev,before.st_ino)==(opened.st_dev,opened.st_ino),'MATERIALIZATION_VOLUME_CHANGED')
  s=os.fstatvfs(fd);available=s.f_bavail*s.f_frsize;need(available>=(START_MINIMUM if starting else FLOOR),'MATERIALIZATION_START_SPACE_INSUFFICIENT' if starting else 'MATERIALIZATION_SPACE_FLOOR_REACHED');minimum=available if minimum is None else min(minimum,available);samples+=1;return available
 try:
  R['freeBeforeBytes']=sample(True);last=time.monotonic()
  child=subprocess.Popen([sys.executable,'-I','-S',str(leaf),'--phase','materialize-app','--plan',str(job/'bundle/materialize-plan.json'),'--plan-sha256',m.sha(raw),'--execute'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=dict(os.environ),start_new_session=True)
  p=Path('/proc')/str(child.pid);identity={'pid':child.pid,'starttime':(p/'stat').read_text().rsplit(')',1)[1].split()[19],'exe':os.readlink(p/'exe')}
  while True:
   now=time.monotonic();maxgap=max(maxgap,now-last);need(now-last<=.25,'MATERIALIZATION_SPACE_SAMPLE_LATE')
   need(now-guard_start<880 and int(time.time()*1000)<plan['imagePreparationExpiresAt'],'MATERIALIZATION_PREPARATION_DEADLINE_EXPIRED')
   free=sample();end=time.monotonic();maxgap=max(maxgap,end-last);need(end-last<=.25,'MATERIALIZATION_SPACE_SAMPLE_LATE');last=end
   need(end-guard_start<880 and int(time.time()*1000)<plan['imagePreparationExpiresAt'],'MATERIALIZATION_PREPARATION_DEADLINE_EXPIRED')
   if child.poll() is not None:child.wait();break
   need(m.real_process_matches(identity),'OWNED_MATERIALIZER_IDENTITY_CHANGED');time.sleep(max(0,.2-(time.monotonic()-now)))
  R['childExitCode']=child.returncode;R['childReaped']=True;need(child.returncode==0,'MATERIALIZER_NOT_SUCCESSFUL_OR_UNKNOWN')
  result=m.strict(m.read_file(job/'results/fresh35-materialize-app-result.json',1048576,True));need(result['status']=='CURRENT_APPLICATION_MATERIALIZED_NO_DB_WINDOW' and result['application']==m.application_receipt(plan) and result['postgresStarted'] is False and result['imageBuilt'] is False,'MATERIALIZATION_RECEIPT_NOT_CONFIRMED')
  need(time.monotonic()-guard_start<880 and int(time.time()*1000)<plan['imagePreparationExpiresAt'],'MATERIALIZATION_PREPARATION_DEADLINE_EXPIRED')
  R.update(status='PASS_CURRENT_APPLICATION_MATERIALIZED_NO_DB_WINDOW',application=result['application'],freeAfterBytes=free,image=result['image'])
 finally:
  if child is not None:R['childReaped']=stop_direct_materializer(child,identity,m.real_stop_child)
  os.close(fd);R.update(samples=samples,maxSampleGapSeconds=maxgap,minimumAvailableBytes=minimum,stopFloorBytes=FLOOR,preparationOnly=True)
  need(child is None or R['childReaped'],'MATERIALIZATION_CHILD_CLEANUP_UNKNOWN')
if __name__=='__main__':
 code=0;began=time.monotonic()
 try:main()
 except Exception as e:R.update(status='STOP_OR_UNKNOWN_PARTIAL_PRESERVED_NO_REPLAY',safeCode=str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]+',str(e)) else type(e).__name__);code=2
 finally:R['elapsedSeconds']=time.monotonic()-began;(Path(os.environ['ERP_SHARED_JOB_DIR'])/'results/materialization-floor-result.json').write_text(json.dumps(R,indent=2)+'\n')
 raise SystemExit(code)
