"""Original private namespace/process lifecycle, fixed to the installer key."""
from pathlib import Path
from types import ModuleType
import hashlib,json,os,re,selectors,signal,stat,subprocess,sys,time
KEY='t45-r3-batched-install-20261115-01'
GRANT='b16447fbc81f4d64'
BASE=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT)
JOBS=BASE/'jobs';JOB=JOBS/KEY
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
HOST_STATE=HOST/'state';STATE=Path('/var/lib/naijue-erp/fresh35-production')
START='t45-first-r3-native-service-start-20261116-27'
FAILED='t45-first-20261110-r3-real-execute-20261114-02'
NODE='/opt/naijue-erp/fresh35-combined-v1/runtime/node/bin/node'
PHASE='install'
NODE_SHA='7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c'
ORIGINAL06_READBACK_PINS={'original06-readonly-inspect-process-cleanup.json': {'objectsEqual': True, 'publicSha256': '9dfbb6106448139d70a3d0c0c330faae32938f228054e75c781cd26f6e7820aa', 'rootSha256': '9b69502e2f956520450bd9130300335bbe27cc170256ee9a85bdbdc3bcc40033'}, 'original06-readonly-inspect-result.json': {'objectsEqual': True, 'publicSha256': '4f802da791fd685a894395daef5fa56226db1b0e8cb1a5f40725abc25979f5e4', 'rootSha256': '3836f40139addea497b08f3ca85000cba4ea7ad6d892f65c50a471c541d357dc'}, 'retained23-readback-child-cleanup.json': {'objectsEqual': True, 'publicSha256': '349a8299e9b1cffd3ff48a3dada30cecdd563dae7c52b09e2c0a6251e9aac1ef', 'rootSha256': 'aaae244a42d5b79cfcf314a500a6ff75849fdd19ffd5bac90062c2ab5744426b'}}
CHILD="\nimport ctypes,hashlib,json,os,select,signal,stat,subprocess,sys,time\nfrom pathlib import Path\nnode,projection,digest,cutoff,net,g,p,node_sha=PACKET\ndef need(v):\n if not v:raise ValueError('READBACK_EXACT_CHILD_SCOPE_REQUIRED')\ndef now():return time.time_ns()//1000000\ndef same():\n s=Path('/proc/self/ns/net').stat()\n need((s.st_dev,s.st_ino)==(net['device'],net['inode']))\n for x,u in ((g,0),(p,61035)):\n  d=Path('/proc')/str(x['pid'])\n  f=(d/'stat').read_text().rsplit(')',1)[1].split()\n  need(f[0] not in ('Z','X') and d.stat().st_uid==u and f[19]==x['starttime']\n       and os.readlink(d/'exe')==x['exe'] and (u==0 or int(f[1])==g['pid']))\nsame()\nneed(hashlib.sha256(Path(node).read_bytes()).hexdigest()==node_sha)\nneed(ctypes.CDLL(None,use_errno=True).prctl(36,1,0,0,0)==0)\nbody=sys.stdin.buffer.readline(65537)\nneed(0<len(body)<=65536 and body.endswith(b'\\n') and now()+12000<cutoff)\ndef interrupt(*_):raise ValueError('READBACK_CHILD_INTERRUPTED')\nfor sig in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP):signal.signal(sig,interrupt)\nchild=subprocess.Popen([node,'--no-global-search-paths',projection+'/batched161-run.mjs',digest],\n stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,\n env={'PATH':'/usr/bin:/bin','HOME':'/','LC_ALL':'C','TZ':'UTC','TMPDIR':projection+'/scratch','SQLITE_TMPDIR':projection+'/scratch'},user=0,group=0,\n extra_groups=[],start_new_session=True)\ncomplete=False\nreceived=False\nproblem=False\ntry:\n pending=body\n while True:\n  need(not select.select([sys.stdin],[],[],0)[0])\n  remaining=(cutoff-now())/1000-8\n  need(remaining>0)\n  try:\n   out,_=child.communicate(pending,timeout=min(0.5,remaining))\n   break\n  except subprocess.TimeoutExpired:\n   pending=None\n need(0<len(out)<=65536 and not select.select([sys.stdin],[],[],0)[0])\n received=True\n same()\n complete=True\nexcept BaseException:\n problem=True\nfinally:\n try:\n  if not complete:\n   try:os.killpg(child.pid,signal.SIGTERM)\n   except ProcessLookupError:pass\n   try:child.wait(timeout=3)\n   except subprocess.TimeoutExpired:\n    try:os.killpg(child.pid,signal.SIGKILL)\n    except ProcessLookupError:pass\n    child.wait(timeout=3)\n finally:\n  children=Path('/proc/self/task')/str(os.getpid())/'children'\n  reap_until=time.monotonic()+max(0,min(2.5,(cutoff-now())/1000-0.5))\n  while True:\n   remaining=children.read_text().split()\n   if not remaining:break\n   need(time.monotonic()<reap_until)\n   for pid in remaining:\n    need(time.monotonic()<reap_until)\n    try:\n     with_pid=int(pid)\n     need(int((Path('/proc')/pid/'stat').read_text().rsplit(')',1)[1].split()[1])==os.getpid())\n     os.kill(with_pid,signal.SIGKILL)\n     os.waitpid(with_pid,os.WNOHANG)\n    except (ChildProcessError,FileNotFoundError,ProcessLookupError):pass\n   time.sleep(min(0.05,max(0,reap_until-time.monotonic())))\ntry:result=json.loads(out)if received else None\nexcept Exception:result=None\nparsed=isinstance(result,dict)\nif not parsed:result={'state':'UNKNOWN','safeCode':'RETAINED20_CHILD_RESULT_UNCONFIRMED','connectionCleanup':'UNKNOWN'}\nprint(json.dumps({'exitCode':child.returncode,'result':result,'childReaped':True,'descendantsReaped':True,\n 'exclusiveProcessReaped':True,'resultReceived':received and parsed,\n 'lifecycleConfirmed':complete and not problem}))\n"

def need(v,c):
 if not v:raise ValueError(c)

def sha(b):return hashlib.sha256(b).hexdigest()

def now():return time.time_ns()//1000000

def encode(v):return(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()

def identity(s):return(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)

def read(path,maximum=65536,owner=0,exact_bytes=None):
 need(path.resolve()==path,'ORIGINAL_INSPECT_CANONICAL_INPUT_REQUIRED')
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode)and s.st_uid==owner and s.st_nlink==1
   and not s.st_mode&0o022 and 0<s.st_size<=maximum,'ORIGINAL_INSPECT_PROTECTED_INPUT_REQUIRED')
  need(exact_bytes is None or s.st_size==exact_bytes,'RETAINED22_EXACT_INITIALIZER_BYTES_REQUIRED')
  raw=f.read(maximum+1);need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'ORIGINAL_INSPECT_INPUT_CHANGED')
 return raw

def load(name,pin):
 path=JOB/'bundle'/name;raw=read(path,262144)
 need(sha(raw)==pin,'ORIGINAL_INSPECT_EXACT_SOURCE_REQUIRED')
 m=ModuleType(name[:-3]);m.__file__=str(path);sys.modules[m.__name__]=m;exec(compile(raw,str(path),'exec'),m.__dict__);return m

def put(path,raw,mode=0o600,gid=0):
 with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
  need(f.write(raw)==len(raw),'ORIGINAL_INSPECT_SHORT_PROJECTION_WRITE');f.flush();os.fchown(f.fileno(),0,gid);os.fchmod(f.fileno(),mode);os.fsync(f.fileno())
 sync(path.parent)

def sync(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)

def fixed_history():
 for path,pin in {
  BASE/'r3-05-write-continuity/policy.json':'25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757',
  BASE/'r3-05-write-continuity/active.json':'0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8',
  JOBS/FAILED/'r3-outer-terminal.json':'ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'}.items():
  need(sha(read(path))==pin,'BATCHED24_ORIGINAL_HOLD_CHANGED')
 key='t45-first-20261110-r3-real-readback-20261114-23-01'
 raw=read(JOBS/key/'r3-outer-terminal.json');t=json.loads(raw)
 need(sha(raw)=='7ed2e4ac060832c92da712c2dfd84351ad9c488cc8822d676fbdac2c2b8c6d28'
  and raw==read(CONTROL/'results'/(key+'.json'),owner=1000)
  and (t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'BATCHED24_ORIGINAL06_ABSENCE_TERMINAL_REQUIRED')
 for leaf,pins in ORIGINAL06_READBACK_PINS.items():
  raw=read(JOBS/key/'results'/leaf);public=read(CONTROL/'jobs'/key/'results'/leaf,owner=1000)
  need(sha(raw)==pins['rootSha256'] and sha(public)==pins['publicSha256'] and json.loads(raw)==json.loads(public),'BATCHED24_ORIGINAL06_READBACK_REQUIRED')
  if leaf=='original06-readonly-inspect-result.json':
   v=json.loads(raw)
   need(v['state']=='ABSENT' and v['originalWriterKey']=='t45-first-20261110-r3-real-execute-20261114-06'
    and v['service']['serviceKey']=='t45-first-r3-native-service-start-20261114-23'
    and v['originalCombinationMatched'] and v['rollbackAcknowledged'] and v['connectionCleanup']=='CLOSED'
    and v['businessWrites']==0 and v['originalRecoveryRuns']==0,'BATCHED24_ORIGINAL06_ABSENCE_REQUIRED')

def current(ops,support,a):
 fixed_history();boot=HOST_STATE/'native-services'/START
 raw=read(HOST/'authority/fresh35-current-production-service-v2-service-27.json');p=json.loads(raw);s=a['service'];b=p['sharedPostgresNamespace']['container']
 need(sha(raw)==s['proofSha256']and p['requestKey']==START and p['physical']['postmasterStart']==s['postmasterStart']
  and p['physical']['systemIdentifier']=='7706545564479176741'and p['physical']['databaseOid']=='16393'
  and b['id']==s['containerId']and b['startedAt']==s['containerStartedAt']
  and now()<a['expiresAt']<=p['sharedPostgresNamespace']['serviceLeaseExpiresAt'],'ORIGINAL_INSPECT_CURRENT_GENERATION_DIFFERS')
 support.inspect_birth(b,True)
 need(json.loads(read(boot/'carrier-birth.json'))==b and json.loads(read(boot/'retained-ack.json'))=={
  'requestKey':START,'proofSha256':s['proofSha256'],'serviceLeaseExpiresAt':p['sharedPostgresNamespace']['serviceLeaseExpiresAt']},'ORIGINAL_INSPECT_CURRENT_RETAINED_ACK_REQUIRED')
 terminal=read(JOBS/START/'r3-outer-terminal.json');t=json.loads(terminal)
 need(sha(terminal)==a['startTerminalSha256']and terminal==read(CONTROL/'results'/(START+'.json'),owner=1000)
  and(t['jobId'],t['status'],t['exitCode'])==(START,'COMPLETED',0),'ORIGINAL_INSPECT_START_TERMINAL_REQUIRED')
 result=read(JOBS/START/'results/normal-service-result.json');r=json.loads(result)
 need(sha(result)==a['startResultSha256']and r['requestKey']==START and r['proofSha256']==s['proofSha256']
  and r['lockCapacitySettingsSha256']==a['lockCapacitySettingsSha256'],'ORIGINAL_INSPECT_START_RESULT_REQUIRED')
 cap=read(boot/'lock-capacity-settings.json');c=json.loads(cap)
 need(sha(cap)==a['lockCapacitySettingsSha256']and r['lockCapacitySettings']==c and c['requestKey']==START
  and c['parameterInputsMatchedReviewedBudget']is True and c['capacityB']==31 and c['lockSlots']==2031616
  and c['settings']['max_locks_per_transaction']==65536 and c['cgroup']['memory.max']==7516192768,
  'ORIGINAL_INSPECT_MEASURED_CAPACITY_REQUIRED')
 return p,json.loads(read(boot/'service-start-authorization.json'))

def child_run(proof,a,payload):
 birth=proof['sharedPostgresNamespace']['container'];cutoff=min(a['expiresAt']-80000,now()+a['maximumChildSeconds']*1000)
 packet=(NODE,str(STATE/'batched-install27-private'/KEY),sha(read(JOB/'bundle/install-authorization.json',131072)),cutoff,birth['networkNamespace'],proof['guardian'],proof['postmaster'],NODE_SHA)
 source='PACKET='+repr(packet)+'\n'+CHILD
 argv=['/usr/bin/docker','exec','-i','--user','0:0',birth['id'],'/usr/bin/python3','-I','-S','-c',source]
 child=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 raw=bytearray()
 try:
  try:
   child.stdin.write(encode(payload));child.stdin.flush()
   with selectors.DefaultSelector()as mux:
    mux.register(child.stdout,selectors.EVENT_READ)
    while True:
     left=(cutoff+20000-now())/1000;need(left>0,'RETAINED20_CHILD_REAP_RECEIPT_DEADLINE')
     if not mux.select(min(1,left)):continue
     block=os.read(child.stdout.fileno(),min(8192,65537-len(raw)))
     if not block:break
     raw.extend(block);need(len(raw)<=65536,'ORIGINAL_INSPECT_CHILD_RECEIPT_BOUNDS')
   child.wait(timeout=max(.1,(cutoff+20000-now())/1000))
  finally:
   child.stdin.close()
   if child.poll()is None:
    try:child.wait(timeout=8)
    except subprocess.TimeoutExpired:
     child.terminate()
     try:child.wait(timeout=3)
     except subprocess.TimeoutExpired:
      child.kill();child.wait(timeout=3)
  need(child.returncode==0 and 0<len(raw)<=65536,'ORIGINAL_INSPECT_REMOTE_CHILD_CLEANUP_UNKNOWN')
  receipt=json.loads(raw)
  need(receipt.get('childReaped')is True and receipt.get('descendantsReaped')is True and receipt.get('exclusiveProcessReaped')is True,'ORIGINAL_INSPECT_CHILD_NOT_REAPED')
  put(JOB/('native-private/'+PHASE+'-process-cleanup.json'),encode(dict(requestKey=KEY,childReaped=True,descendantsReaped=True,remoteExitCode=receipt['exitCode'],resultReceiptSha256=sha(bytes(raw)))))
  return receipt
 finally:child.stdout.close()
