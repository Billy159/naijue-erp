"""Unexecuted one-key CAS successor using the existing packet/lock/publish seam."""
from pathlib import Path
import base64,fcntl,hashlib,json,os,re,socket,stat,sys,time
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
P=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
H=B/'r3-05-write-continuity'
LOCK=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
LOCK_ID=(66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015)
KEY='t45-r3-batched-root08-source-delta-20261117-01'
ENTRY=B/'r3-root08-source-registration-source-20261117-01/register_exact.py'
AUDIT=B/'r3-root08-source-registration-cas-20261117-01'
NEW_MODULE=P/'r3_root08_source_admission.py'
NEW_POLICY=H/'root08-source-only-20261117-01.json'
PENDING=P/'.root08-source-dispatcher.pending'
OLD='b4013f9a04e35bfae287742a7d91b9c2a9daf1d06b0768262db01b8de40926de'
PRESERVE={str(P/'admin_exec.py'):OLD,str(P/'r3_normal39_continuation.py'):'b8ec4823753f791332631a1f907a79c4f9d752e2e74108d7b572510b7f610785',str(H/'direct39-batched-real.json'):'104048251747ed638ffb6464d9c12777855d7355c30261b53b75407f8dfc4173',str(P/'r3_root07_source_admission.py'):'76f8913957c728b82dbbd9d5831cfd085a95436f283aa8be997e47802dae6080',str(H/'root07-source-only-20261117-01.json'):'b87fa978f93da13582569027b8453cd3aedaaf3bd700aa26fdb8a500f6050189'}
PRESERVE.update({str(P/'r3_core0_durable_readonly.py'):'0fb16f260ce868b68cc49b20b7ea723c5426a9342ba4aa79200d7dda1ab6d10f',str(H/'core0-durable-readonly-20261117-01.json'):'b1f6bebd87b049d35f833b1fb6798e945be787294b9451bfa05232d5516497d3',str(B/'jobs/t45-r3-core0-durable-readonly-20261117-01/r3-outer-terminal.json'):'8e8af93929b3a17f3b81f7e7e394fa03d54ca4d13a82c105646b5b6ba361af5b',str(B/'jobs/t45-r3-core0-durable-readonly-20261117-01/bundle/durable_readonly_job.py'):'b65d7c50c8aedc11faa736cdc5fc72183ff83abd5df8e6660ff009cb3b0f74a0'})
PRESERVE.update({str(P/'r3_core0_durable_readonly_02.py'):'f6aca8ef0f69f606a8166264c634c5ae44d6e0070c17851a87d02bc1405e3257',str(H/'core0-durable-readonly-20261117-02.json'):'4b9e9042efe499a2aff77b93360493d3e00ab505b81f58712410c2e019e50cc5',str(P/'r3_direct38_aux_prepare.py'):'3b7ebfcb95df010fdbd585b5551851cba6cd65953e54352ab25ee01bb3ec368d',str(H/'direct38-batched-real.json'):'51da8cb64ce60386c60340126f95bb85a99a01d0275845a048dc600e092d949e'})
CUSTODY=[Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary39-auth-20261116-01')/name for name in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json')]
sha=lambda raw:hashlib.sha256(raw).hexdigest()
now=lambda:time.time_ns()//1000000
def need(ok,code):
 if not ok:raise ValueError(code)
def identity(s):return(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def read(path):
 need(path.resolve()==path,'CANONICAL_ROOT_FILE_REQUIRED')
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode)and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=131072,'PROTECTED_BOUNDED_ROOT_FILE_REQUIRED')
  raw=f.read(131073);need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'ROOT_INPUT_CHANGED')
 return raw,identity(s)
def sync(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def put(path,raw,mode=0o600):
 with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode),'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
 sync(path.parent)
def basis():
 out={}
 for path,pin in PRESERVE.items():
  raw,ident=read(Path(path));need(sha(raw)==pin,'RECORDED_CURRENT_ROOT_BASE_DIFFERS');out[path]=list(ident)
 for path in CUSTODY:
  s=path.lstat();need(path.resolve()==path and stat.S_ISREG(s.st_mode)and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400,'ORIGINAL_SNAPSHOT_STAT_ONLY_REQUIRED');out[str(path)]=list(identity(s))
 need(identity(LOCK.lstat())==LOCK_ID,'ORIGINAL_LOCK_DIFFERS');out['executionLock']=list(LOCK_ID)
 return out
def snapshot(old,new_dispatcher=None):
 need(set(old)==set(PRESERVE)|{str(path)for path in CUSTODY}|{'executionLock'},'EXACT_ROOT_BASIS_SET_REQUIRED')
 for path,pin in PRESERVE.items():
  raw,ident=read(Path(path));changed=path==str(P/'admin_exec.py')and new_dispatcher is not None
  need(sha(raw)==(new_dispatcher if changed else pin)and(changed or list(ident)==old[path]),'ORIGINAL_ROOT_CHANGED')
 for path in CUSTODY:need(list(identity(path.lstat()))==old[str(path)],'ORIGINAL_SNAPSHOT_STAT_CHANGED')
 need(identity(LOCK.lstat())==LOCK_ID==tuple(old['executionLock']),'ORIGINAL_LOCK_CHANGED')
def diagnostic_closed():
 import subprocess
 key='t45-r3-core0-durable-readonly-20261117-02';job=B/'jobs'/key
 def one(leaf):
  raw,_=read(job/leaf);return raw,json.loads(raw)
 terminal_raw,terminal=one('r3-outer-terminal.json')
 result_raw,result=one('results/durable-readonly-result.json')
 cleanup_raw,cleanup=one('results/durable-readonly-cleanup.json')
 need(sha(terminal_raw)=='68ef74f754d803b13788fe420517900570cd4f5c714e264a16b204182d7f65a6'
  and sha(result_raw)=='67e2ba34665b3f86123bdc6f49cdec697defb3a51091389cf95d60b36a481fd4'
  and sha(cleanup_raw)=='efa0d88a847a8bf83f1beb2decb5dd3c90918d28155616cef1db338426b3e45a','ACTUAL_DIAGNOSTIC02_RECEIPTS_CHANGED')
 need((terminal.get('jobId'),terminal.get('status'),terminal.get('exitCode'),terminal.get('phaseStarted'))==(key,'COMPLETED',0,True),'DIAGNOSTIC_NOT_COMPLETED_NO_ROOT08')
 need(result.get('status')=='DURABLE_READONLY_RESULT_AND_OWN_CONTAINER_CLEANUP_CONFIRMED'
  and result.get('requestKey')==key and result.get('businessDML')is False
  and result.get('automaticReplay')is False and result.get('cleanup')==cleanup
  and all(cleanup.get(k)is True for k in ('ownContainerStopped','ownedPidAbsent','pgdataPidAbsent','originalPortAbsent','dataPreserved')),
  'DIAGNOSTIC_CLEANUP_UNCONFIRMED_NO_ROOT08')
 inside=result['snapshot']['cleanup']
 need(all(inside.get(k)is True for k in ('childReaped','descendantsAbsent','cleanClusterAfterRead')),'DIAGNOSTIC_SINGLE_USER_CLEANUP_UNCONFIRMED')
 cid=cleanup.get('actualContainerId');need(cid=='5a815d05577502f9d1c18906e19f4cd42e4659d9fbb5264946407ac38f7fd9f7','ACTUAL_DIAGNOSTIC_CONTAINER_REQUIRED')
 q=subprocess.run(['/usr/bin/docker','inspect','--format','{{json .State}}',cid],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=16384,'ACTUAL_DIAGNOSTIC_CONTAINER_STATE_UNAVAILABLE')
 state=json.loads(q.stdout);need(state['Running']is False and state['Pid']==0,'ACTUAL_DIAGNOSTIC_CONTAINER_NOT_STOPPED')
 custody={}
 root=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state')
 for name in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json'):
  path=root/'native-services/ordinary39-auth-20261116-01'/name;s=path.lstat()
  need(path.resolve()==path and stat.S_ISREG(s.st_mode)and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400,'ORIGINAL39_SNAPSHOT_STAT_ONLY_REQUIRED')
  custody[str(path)]=list(identity(s))
 return {'state':'ACTUAL_DIAGNOSTIC_COMPLETED_CLEANED_PG_STOPPED_SOURCE_ONLY_BASIS',
  'requestKey':key,'terminalSha256':sha(terminal_raw),'resultSha256':sha(result_raw),'cleanupSha256':sha(cleanup_raw),
  'completed':True,'cleanupConfirmed':True,'actualContainerStopped':True,'actualContainerId':cid,'pgdataPidAbsent':True,
  'custodyStat9':custody,'authenticationSnapshotBodiesRead':False,'SQLUpgradePerformed':False,
  'businessDurableState':'NOT_CLASSIFIED_BY_SOURCE_REGISTRATION','PGConnections':0,'mutations':0}

def quiet(expected_diagnostic=None):
 import subprocess
 root=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
 data=root/'state/fresh35-first-production-20261110-r3/data';s=data.lstat()
 need(data.resolve()==data and stat.S_ISDIR(s.st_mode)and(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13502421,61035,61035,0o700)and not os.path.lexists(data/'postmaster.pid'),'EXACT_ORIGINAL_STOPPED_DATA_REQUIRED')
 fs=os.statvfs(root);need(fs.f_bavail*fs.f_frsize>=28*1024**3,'RESERVE_28GIB_REQUIRED')
 need(not os.path.lexists(P/'artifact-staging-authorization.json'),'UNRELATED_STAGING_WINDOW_ACTIVE')
 q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'ACTIVE_OPERATION_OR_UNKNOWN')
 for worker_root,control_root in ((B.parent,C.parent),):
  for root in (worker_root,control_root):
   for grant in root.glob('grant-*'):
    need(not any(os.path.lexists(grant/rel)for rel in ('jobs/'+KEY,'requests/'+KEY+'.json','requests/'+KEY+'.tmp','results/'+KEY+'.json')),'ROOT08_KEY_PRESENT_NO_REPLAY')
 closure=diagnostic_closed()
 if expected_diagnostic is not None:need({k:closure[k]for k in ('terminalSha256','resultSha256','cleanupSha256')}==expected_diagnostic,'ACTUAL_DIAGNOSTIC02_FRESH_CLOSURE_CHANGED')
 return closure
def consumer(dispatcher,cfg,module_raw,policy_raw):
 from types import ModuleType
 wrapper=ModuleType('fixed_durable_dispatcher');wrapper.__file__=str(P/'admin_exec.py');exec(compile(dispatcher,wrapper.__file__,'exec'),wrapper.__dict__)
 core,prior=wrapper.r3_continuity(cfg)
 module=ModuleType('fixed_durable_admission');module.__file__=str(NEW_MODULE);exec(compile(module_raw,module.__file__,'exec'),module.__dict__)
 original=core.read
 core.read=lambda path,**kw:policy_raw if path==NEW_POLICY else original(path,**kw)
 try:module.Root08SourceAdmission(core,prior,cfg,sha(policy_raw))
 finally:core.read=original
def register(packet,expected):
 need(os.getuid()==os.geteuid()==0 and socket.gethostname()=='naijue-server'and Path(__file__)==ENTRY,'EXACT_ORIGINAL_ROOT_CAS_ENTRY_REQUIRED')
 need(set(packet)=={'authorization','files'},'EXACT_ORIGINAL_PACKET_REQUIRED')
 authority=base64.b64decode(packet['authorization'],validate=True);need(sha(authority)==expected,'EXACT_EXTERNAL_REGISTRATION_AUTHORITY_REQUIRED');a=json.loads(authority)
 need(set(a)=={'format','requestKey','sourceSha256','sourcePins','oldIdentities','startsAt','expiresAt','independentReviewSha256','authorizationReference'}and a['format']=='T45_ROOT08_SOURCE_REGISTRATION_ONLY_V1'and a['requestKey']==KEY and a['sourceSha256']==sha(read(Path(__file__))[0]),'EXACT_ONE_KEY_REGISTRATION_SCOPE_REQUIRED')
 need(type(a['startsAt'])is type(a['expiresAt'])is int and a['startsAt']<=now()<now()+30000<a['expiresAt']<=a['startsAt']+300000,'FINITE_REGISTRATION_WINDOW_REQUIRED')
 files={k:base64.b64decode(v,validate=True)for k,v in packet['files'].items()}
 need(set(files)==set(a['sourcePins'])=={'module','policy','dispatcherTemplate'}and all(0<len(v)<=131072 and sha(v)==a['sourcePins'][k]for k,v in files.items()),'EXACT_APPROVED_SOURCE_PACKET_REQUIRED')
 policy=json.loads(files['policy']);need(policy['requestKey']==KEY and policy['sourceReviewSha256']==a['independentReviewSha256'],'SAME_REVIEW_REQUIRED')
 need(set(policy['diagnosticClosedPins'])=={'terminalSha256','resultSha256','cleanupSha256'}and all(type(pin)is str and re.fullmatch('[a-f0-9]{64}',pin)for pin in policy['diagnosticClosedPins'].values()),'ACTUAL_DIAGNOSTIC02_CLOSURE_PINS_REQUIRED')
 cfg=json.loads(read(P/'grant.json')[0]);need(now()+600000<policy['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'FINITE_GRANT_BUDGET_REQUIRED')
 needle=b'ROOT08_SOURCE_POLICY_SHA256 = None';need(files['dispatcherTemplate'].count(needle)==1,'EXACT_UNREGISTERED_TEMPLATE_REQUIRED')
 new=files['dispatcherTemplate'].replace(needle,('ROOT08_SOURCE_POLICY_SHA256 = '+repr(sha(files['policy']))).encode())
 compile(new,str(P/'admin_exec.py'),'exec');compile(files['module'],str(NEW_MODULE),'exec')
 need(not any(os.path.lexists(x)for x in(AUDIT,NEW_MODULE,NEW_POLICY,PENDING)),'REGISTRATION_ALREADY_PRESENT_OR_UNKNOWN')
 for folder in(B,P,H,LOCK.parent):
  for path in[*reversed(folder.parents),folder]:
   s=path.lstat();need(path.resolve()==path and stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022,'PROTECTED_REGISTRATION_PARENT_REQUIRED')
 with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b')as lock:
  need(identity(os.fstat(lock.fileno()))==LOCK_ID,'EXACT_ORIGINAL_LOCK_REQUIRED');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  snapshot(a['oldIdentities']);quiet(policy['diagnosticClosedPins'])
  consumer(new,cfg,files['module'],files['policy'])
  AUDIT.mkdir(mode=0o700);sync(AUDIT.parent);put(AUDIT/'authorization.json',authority);put(AUDIT/'old-dispatcher.bin',read(P/'admin_exec.py')[0])
  out={'status':'REGISTRATION_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY','published':[],'PGStarted':False,'materializationSubmitted':False,'automaticReplay':False}
  try:
   put(NEW_MODULE,files['module'],0o644);out['published'].append('module');snapshot(a['oldIdentities']);quiet(policy['diagnosticClosedPins'])
   put(NEW_POLICY,files['policy']);out['published'].append('policy');snapshot(a['oldIdentities']);quiet(policy['diagnosticClosedPins'])
   put(PENDING,new,0o755);need(now()+30000<a['expiresAt'],'REGISTRATION_EXPIRED_BEFORE_CAS')
   put(AUDIT/'publish-intent.json',(json.dumps({'before':OLD,'after':sha(new)},sort_keys=True)+'\n').encode())
   os.replace(PENDING,P/'admin_exec.py');sync(P);out['published'].append('dispatcher');snapshot(a['oldIdentities'],sha(new));quiet(policy['diagnosticClosedPins'])
   need(sha(read(NEW_MODULE)[0])==sha(files['module'])and sha(read(NEW_POLICY)[0])==sha(files['policy']),'REGISTRATION_READBACK_DIFFERS')
   consumer(read(P/'admin_exec.py')[0],cfg,read(NEW_MODULE)[0],read(NEW_POLICY)[0])
   out.update(status='EXACT_ROOT08_SOURCE_KEY_REGISTERED_NO_MATERIALIZATION_OR_SQL',dispatcherSha256=sha(new),moduleSha256=sha(files['module']),policySha256=sha(files['policy']),old109AndThreeGuardsPreserved=True)
  except BaseException as error:out['errorType']=type(error).__name__
  put(AUDIT/'result.json',(json.dumps(out,sort_keys=True)+'\n').encode());return out
if __name__=='__main__':
 need(len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'ONE_REAL_REGISTRATION_AUTHORITY_SHA_REQUIRED')
 result=register(json.load(sys.stdin),sys.argv[1]);print(json.dumps(result,sort_keys=True));raise SystemExit(0 if result['status']=='EXACT_ROOT08_SOURCE_KEY_REGISTERED_NO_MATERIALIZATION_OR_SQL'else 2)
