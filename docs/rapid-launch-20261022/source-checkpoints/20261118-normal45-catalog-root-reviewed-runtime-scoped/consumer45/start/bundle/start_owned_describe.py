"""One genuine describe inside the original start job, before its handoff."""
from pathlib import Path
import ctypes,hashlib,json,os,re,selectors,signal,stat,subprocess,sys,time

SERVICE='t45-first-r3-native-service-start-20261118-45'
ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
STATE=Path('/var/lib/naijue-erp/fresh35-production')
BOOT=STATE/'native-services'/SERVICE
PROJECTION=STATE/'final33-private'/SERVICE
NODE='/opt/naijue-erp/fresh35-combined-v1/runtime/node/bin/node'
RUNNER_SHA = 'ee1d6a23ed8c6b56fcb24b5d87e1b92a3ea82d0a4f07d13565c88bbb6bb83ac7'
HELPER_SHA = '4123a6d98a1beced8070f6a20d03967dae2e17d095a22ee53890dd81e24f9575'
WITNESS_SHA = '78fcd3f7811343615343f6c59c841fe06a70aaadeeee3a41a6845abe26d86ee2'
MATERIAL_SHA = '5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c'
SOURCE_SHA = 'ac85caa5b8edc5768ffb8bd0f0668b0b9778b3c4be05c5498bbcd5ce45b1bbc3'
STDOUT_LIMIT=131072
STDERR_LIMIT=65536
BRIDGE_SECONDS=158
PUBLISH_SECONDS=12
OUTPUTS={'payload':'genuine-describe-payload.json','descriptor':'genuine-descriptor.json',
         'liveFacts':'genuine-live-facts.json','process':'genuine-describe-process.json'}
STAGES=('IMPORT_BEGIN','IMPORT_END','TRUST_BEGIN','TRUST_END','SOURCE_LOAD_BEGIN',
        'SOURCE_LOAD_END','TARGET_BEGIN','TARGET_END','COMPILE_BEGIN','COMPILE_END')
ERROR_TYPES = ('AssertionError', 'Error', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'UNKNOWN')
SYSTEM_CODES = ('EACCES', 'EADDRINUSE', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ELOOP', 'ENETUNREACH', 'ENOENT', 'ENOTDIR', 'EPERM', 'EPIPE', 'ERR_ACCESS_DENIED', 'ERR_ASSERTION', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_MODULE_NOT_FOUND', 'ERR_OUT_OF_RANGE', 'ERR_UNKNOWN_FILE_EXTENSION', 'ETIMEDOUT', 'UNKNOWN')
GUARD_CODES = ('FINAL44_DESCRIBE_AFTER42_REQUIRED', 'FINAL44_DESCRIBE_CANONICAL_REQUIRED', 'FINAL44_DESCRIBE_CURRENT_C_REQUIRED', 'FINAL44_DESCRIBE_ENV_REFUSED', 'FINAL44_DESCRIBE_FINITE_WINDOW_REQUIRED', 'FINAL44_DESCRIBE_FIXED_ENTRY_REQUIRED', 'FINAL44_DESCRIBE_HISTORICAL_INPUT_REQUIRED', 'FINAL44_DESCRIBE_INPUT_BOUND', 'FINAL44_DESCRIBE_INPUT_CHANGED', 'FINAL44_DESCRIBE_ORIGINAL_PLAN_CHANGED', 'FINAL44_DESCRIBE_PAYLOAD_REQUIRED', 'FINAL44_DESCRIBE_PROTECTED_REQUIRED', 'FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS', 'FRESH35_COMBINED_CURRENT_SOURCE_CHANGED', 'FRESH35_COMBINED_RECORD_ORDINARY_RUNTIME_REQUIRED', 'FRESH35_COMBINED_RECORD_OS_PROTECTED_RECORD_REQUIRED', 'FRESH35_PROTECTED_RECORD_REQUIRED', 'UNKNOWN')
SOURCE_MODULES = ('BINDING', 'CATALOG', 'DESCRIPTOR', 'HELPER', 'HOST', 'RECORD', 'SOURCE', 'TARGET')

def need(v,code):
    if not v:raise ValueError(code)
def sha(b):return hashlib.sha256(b).hexdigest()
def encode(v):return (json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()

def ordinary_ancestors(path):
    for parent in path.parents:
        s=parent.lstat()
        need(parent.resolve()==parent and stat.S_ISDIR(s.st_mode) and s.st_uid==0
             and not s.st_mode&0o022 and s.st_mode&(0o010 if s.st_gid==61035 else 0o001),
             'DESCRIBE_ORDINARY_ANCESTOR_REQUIRED')
        if parent==ROOT/'state':break

def projection_metadata(path,*,directory=False):
    s=path.lstat()
    need(path.resolve()==path and (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode) and s.st_nlink==1)
         and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,61035,0o710 if directory else 0o440),
         'DESCRIBE_EXACT_PROJECTION_REQUIRED')
    ordinary_ancestors(path)

def stage_projection(ops,boot):
    """Reuse the writer's group-traverse parent; only three nonsecret inputs."""
    parent=ROOT/'state/final33-private'
    if not os.path.lexists(parent):
        parent.mkdir(mode=0o700);os.chown(parent,0,61035);parent.chmod(0o710);ops.syncdir(parent.parent)
    projection_metadata(parent,directory=True)
    target=parent/SERVICE
    need(not os.path.lexists(target),'DESCRIBE_PROJECTION_PRESENT_NO_REPLAY')
    target.mkdir(mode=0o700);os.chown(target,0,61035);target.chmod(0o710);ops.syncdir(parent)
    for name,pin in (('final-execution-describe.mjs',RUNNER_SHA),('final33-run.mjs',HELPER_SHA),('historical-prepare05.json',WITNESS_SHA)):
        raw=ops.read_file(boot/name,65536,True)
        need(sha(raw)==pin,'DESCRIBE_PROJECTION_SOURCE_DIFFERS')
        ops.new_file(target/name,raw,0o440);os.chown(target/name,0,61035)
        projection_metadata(target/name)
    ops.syncdir(target)
    return {'source':str(target),'target':str(PROJECTION),'readonly':True}

def safe_native_failure(value):
    """Only fixed enums and one bounded controlled frame reach the public process."""
    if type(value) is not dict:return {}
    out={}
    code=value.get('safeCode')
    if code=='FINAL44_EXECUTION_DESCRIPTION_UNCONFIRMED':out['safeCode']=code
    for key,allowed in (('errorType',ERROR_TYPES),('systemCode',SYSTEM_CODES),('guardCode',GUARD_CODES)):
        if key not in value:continue
        item=value[key]
        if item is None and key!='errorType' or type(item) is str and item in allowed:out[key]=item
    if value.get('stage') in ('ENTRY','PAYLOAD','CURRENT_SERVICE','HISTORICAL_INPUT','SOURCE_IMPORT','EXECUTION_BINDING','RESULT','UNKNOWN'):out['stage']=value['stage']
    if 'sourceFrame' in value:
        frame=value['sourceFrame']
        if frame is None:out['sourceFrame']=None
        elif type(frame) is dict and set(frame)=={'module','line','column'} \
                and type(frame['module']) is str and frame['module'] in SOURCE_MODULES \
                and all(type(frame[k]) is int and 0<frame[k]<=9007199254740991 for k in ('line','column')):
            out['sourceFrame']=dict(frame)
    return out

def phase_trace(stderr):
    trace=[]
    for line in stderr.decode('utf8',errors='replace').splitlines():
        if not line.startswith('T45_DESCRIBE_STAGE '):continue
        try:value=json.loads(line[len('T45_DESCRIBE_STAGE '):])
        except ValueError:continue
        if type(value) is not dict or set(value)!={'stage','elapsedMilliseconds'}:continue
        stage=value['stage'];elapsed=value['elapsedMilliseconds']
        if len(trace)<len(STAGES) and stage==STAGES[len(trace)] and type(elapsed) in (int,float) \
                and 0<=elapsed<=2**53 and (not trace or elapsed>=trace[-1]['elapsedMilliseconds']):
            trace.append(value)
    return trace

def capture(argv,body,seconds,stdout_limit=STDOUT_LIMIT,stderr_limit=STDERR_LIMIT,*,descendants=False,ordinary=False):
    """Capture at most the given bytes; TERM2/KILL2 in this process namespace."""
    child=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
        env={'PATH':'/usr/bin:/bin','HOME':'/','LC_ALL':'C','TZ':'UTC'},start_new_session=True,
        **({'user':61035,'group':61035,'extra_groups':[]} if ordinary else {}))
    streams=selectors.DefaultSelector();buffers={'stdout':bytearray(),'stderr':bytearray()}
    limits={'stdout':stdout_limit,'stderr':stderr_limit};seen={'stdout':0,'stderr':0}
    reason=None;problem=None;cutoff=time.monotonic()+seconds
    for name,pipe in (('stdout',child.stdout),('stderr',child.stderr)):
        os.set_blocking(pipe.fileno(),False);streams.register(pipe,selectors.EVENT_READ,name)
    def drain(wait):
        nonlocal reason
        for key,_ in streams.select(wait):
            block=os.read(key.fileobj.fileno(),8192)
            if not block:streams.unregister(key.fileobj);continue
            name=key.data;seen[name]+=len(block)
            room=limits[name]-len(buffers[name]);buffers[name].extend(block[:max(0,room)])
            if seen[name]>limits[name] and reason is None:reason=name.upper()+'_LIMIT'
    def children():
        if not descendants:return []
        return [int(p) for p in (Path('/proc/self/task')/str(os.getpid())/'children').read_text().split()]
    def settled():
        child.poll()
        for pid in children():
            if pid!=child.pid:
                try:os.waitpid(pid,os.WNOHANG)
                except ChildProcessError:pass
        # Inside, the real Linux subreaper owns every surviving descendant.
        # The Docker client being reaped on the host proves only that client.
        return child.poll() is not None and not children()
    def stop(sig,wait):
        until=time.monotonic()+wait
        try:os.killpg(child.pid,sig)
        except ProcessLookupError:pass
        for pid in children():
            if pid!=child.pid:
                try:os.kill(pid,sig)
                except ProcessLookupError:pass
        while not settled() and time.monotonic()<until:
            drain(min(.05,max(0,until-time.monotonic())))
    try:
        child.stdin.write(body);child.stdin.close()
        while streams.get_map() or child.poll() is None:
            if reason is not None:break
            left=cutoff-time.monotonic()
            if left<=0:reason='TIMEOUT';break
            drain(min(.1,left))
    except BaseException as error:
        problem=type(error).__name__;reason=reason or 'INTERRUPTED_OR_CAPTURE_FAILED'
    finally:
        try:
            if not settled():stop(signal.SIGTERM,2)
            if not settled():stop(signal.SIGKILL,2)
            reaped=settled()
            if streams.get_map():drain(0)
        finally:
            streams.close()
            for pipe in (child.stdin,child.stdout,child.stderr):
                if not pipe.closed:pipe.close()
    return dict(exitCode=child.returncode,childReaped=child.returncode is not None,
        ownedProcessGroupReaped=reaped if descendants else None,descendantsReaped=reaped if descendants else None,
        reason=reason,captureErrorType=problem,stdout=bytes(buffers['stdout']),stderr=bytes(buffers['stderr']),
        stdoutBytesObserved=seen['stdout'],stderrBytesObserved=seen['stderr'])

def put(path,body):
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb') as f:
        need(f.write(body)==len(body),'DESCRIBE_SHORT_WRITE');f.flush();os.fsync(f.fileno())
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)

def inside():
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0
         and sys.flags.isolated and sys.flags.no_site and Path(__file__)==BOOT/'start_owned_describe.py'
         and sys.argv[1:]==['--inside'],'DESCRIBE_FIXED_ROOT_ENTRY_REQUIRED')
    os.umask(0o077)
    need(ctypes.CDLL(None,use_errno=True).prctl(36,1,0,0,0)==0,'DESCRIBE_SUBREAPER_REQUIRED')
    def interrupted(*_):raise ValueError('DESCRIBE_INTERRUPTED')
    for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP):signal.signal(sig,interrupted)
    body=sys.stdin.buffer.read(65537);need(0<len(body)<=65536,'DESCRIBE_INPUT_BOUND')
    projection_metadata(PROJECTION,directory=True)
    need({p.name for p in PROJECTION.iterdir()}=={'final-execution-describe.mjs','final33-run.mjs','historical-prepare05.json'},'DESCRIBE_EXACT_THREE_PROJECTION_FILES_REQUIRED')
    for name,pin in (('final-execution-describe.mjs',RUNNER_SHA),('final33-run.mjs',HELPER_SHA),('historical-prepare05.json',WITNESS_SHA)):
        path=PROJECTION/name;projection_metadata(path)
        need(sha(path.read_bytes())==pin,'DESCRIBE_PROJECTION_SOURCE_DIFFERS')
    need(sha((PROJECTION/'final-execution-describe.mjs').read_bytes())==RUNNER_SHA,'DESCRIBE_EXACT_RUNNER_REQUIRED')
    value=capture([NODE,'--no-global-search-paths',str(PROJECTION/'final-execution-describe.mjs'),'describe'],body,150,descendants=True,ordinary=True)
    try:
        native=json.loads(value['stdout'])
        value['nativeReplyKind']='OBJECT' if isinstance(native,dict) else 'NON_OBJECT'
    except (ValueError,UnicodeError):
        native=None;value['nativeReplyKind']='BAD_JSON' if value['stdout'] else 'EMPTY'
    code=native.get('sqlstate') if isinstance(native,dict) else None
    value['sqlstate']=code if type(code) is str and re.fullmatch('[0-9A-Z]{5}',code) else None
    if value['exitCode']!=0 and isinstance(native,dict):value.update(safe_native_failure(native))
    value['describeTrace']=phase_trace(value['stderr'])
    value['lastReachedStage']=value['describeTrace'][-1]['stage'] if value['describeTrace'] else None
    value['traceSource']='BOUNDED_PRIVATE_STDERR_FIXED_STAGE_MARKERS'
    put(BOOT/'genuine-describe-stdout.bin',value.pop('stdout'))
    put(BOOT/'genuine-describe-stderr.bin',value.pop('stderr'))
    value.update(requestKey=SERVICE,maximumChildSeconds=150,termSeconds=2,killSeconds=2,
        stdoutLimit=STDOUT_LIMIT,stderrLimit=STDERR_LIMIT,pidNamespace=os.readlink('/proc/self/ns/pid'))
    put(BOOT/OUTPUTS['process'],encode(value))
    print(json.dumps({'processReceiptWritten':True,'childReaped':value['childReaped'],
        'ownedProcessGroupReaped':value['ownedProcessGroupReaped']}))
    return 0 if value['reason'] is None and value['exitCode']==0 and value['ownedProcessGroupReaped'] else 2

def stored(ops,boot,name,maximum,*,empty=False):
    path=boot/name
    if not empty:return ops.read_file(path,maximum,True)
    need(path.resolve()==path,'DESCRIBE_CANONICAL_OUTPUT_REQUIRED')
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
        s=os.fstat(f.fileno())
        need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1
             and stat.S_IMODE(s.st_mode)==0o600 and 0<=s.st_size<=maximum,'DESCRIBE_OUTPUT_METADATA_REQUIRED')
        body=f.read(maximum+1)
        ident=lambda z:(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
        need(len(body)==s.st_size and ident(s)==ident(os.fstat(f.fileno()))==ident(path.lstat()),'DESCRIBE_OUTPUT_CHANGED')
    return body

def run(ops,boot,worker,service,current_raw,admin_until,deadline,expires_at,work_left):
    need(work_left(deadline,expires_at)>BRIDGE_SECONDS+PUBLISH_SECONDS,'DESCRIBE_FULL_WORK_BUDGET_REQUIRED')
    material=ROOT/'state/installed-real-operation-batched-root08-20261117-01/source-materialization.json'
    need(sha(ops.read_file(material,65536))==MATERIAL_SHA,'DESCRIBE_EXISTING_SOURCE_RECEIPT_DIFFERS')
    request={'service':service,'backupAdminValidUntil':admin_until}
    need(type(admin_until) is int,'DESCRIBE_VERIFIED_ADMIN_DEADLINE_REQUIRED')
    ops.new_file(boot/'genuine-describe-request.json',encode(request),0o600)
    need(work_left(deadline,expires_at)>BRIDGE_SECONDS+PUBLISH_SECONDS,'DESCRIBE_FULL_WORK_BUDGET_REQUIRED')
    bridge=capture(['/usr/bin/docker','exec','-i','--user','0:0',service['containerId'],
        '/usr/bin/python3','-I','-S',str(BOOT/'start_owned_describe.py'),'--inside'],encode(request),BRIDGE_SECONDS,
        stdout_limit=65536,stderr_limit=65536)
    ops.new_file(boot/'genuine-describe-bridge-stdout.bin',bridge.pop('stdout'))
    ops.new_file(boot/'genuine-describe-bridge-stderr.bin',bridge.pop('stderr'))
    ops.new_json(boot/'genuine-describe-bridge.json',bridge)
    need(bridge['reason'] is None and bridge['exitCode'] in (0,2) and bridge['childReaped'],
         'DESCRIBE_BRIDGE_UNCONFIRMED_ORIGINAL_KEY_ONLY')
    process_raw=stored(ops,boot,OUTPUTS['process'],65536);process=ops.strict(process_raw)
    ops.new_file(worker/'results'/OUTPUTS['process'],process_raw)
    need(process['requestKey']==SERVICE and process['childReaped'] and process['ownedProcessGroupReaped']
         and process['descendantsReaped'] and process['reason'] is None and process['exitCode']==0,
         'DESCRIBE_NATIVE_FAILED_READ_PRIVATE_PROCESS_RECEIPT')
    native_raw=stored(ops,boot,'genuine-describe-stdout.bin',STDOUT_LIMIT,empty=True)
    need(bool(native_raw),'DESCRIBE_NATIVE_EMPTY_REPLY')
    try:value=ops.strict(native_raw)
    except ValueError:raise ValueError('DESCRIBE_NATIVE_JSON_REQUIRED') from None
    need(type(value) is dict and value.get('state')=='PROGRAM_DESCRIBED_NO_PG_OR_WRITE'
         and value.get('databaseConnections')==value.get('mutations')==0,'DESCRIBE_GENUINE_REPLY_REQUIRED')
    d=value['descriptor'];facts=value['liveFacts'];payload=value['payload'];c=ops.strict(current_raw)
    need(type(payload) is dict and set(payload)=={'service','backupAdminValidUntil'}
         and payload==request,'DESCRIBE_PRESERVED_REAL_WINDOW_REQUIRED')
    binding=d['expectedBinding']
    need(d['format']=='FRESH35_FINAL_R3_EXECUTION_DESCRIPTION_V1' and d['requestKey']=='t45-r3-batched-real-after44-execute-20261118-01'
         and d['sourceSetSha256']==SOURCE_SHA and d['service']==service
         and d['currentServiceSha256']==service['proofSha256'] and d['postmasterStart']==service['postmasterStart']
         and binding['currentServiceSha256']==service['proofSha256'] and binding['postmasterStart']==service['postmasterStart']
         and facts['service']==service and facts['physical']==c['physical'] and facts['expectedBinding']==binding
         and facts['currentServiceSha256']==service['proofSha256'] and facts['batchedCatalog']==d['batchedCatalog']
         and facts['sourceSetSha256']==SOURCE_SHA and facts['backupAdminValidUntil']==admin_until
         and facts['actualSharedServiceWorkDeadline']==c['sharedPostgresNamespace']['serviceLeaseExpiresAt']
         and facts['runnerConservativeWorkDeadline']==facts['actualSharedServiceWorkDeadline']-35000,
         'DESCRIBE_CURRENT_EXECUTION_BINDING_DIFFERS')
    refs={}
    for kind,body in (('payload',encode(payload)),('descriptor',encode(d)),('liveFacts',encode(facts)),('process',process_raw)):
        maximum=65536 if kind in ('payload','process') else STDOUT_LIMIT
        need(0<len(body)<=maximum and len((json.dumps(json.loads(body),ensure_ascii=False,indent=2)+'\n').encode())<=maximum,
             'DESCRIBE_PUBLICATION_BOUND')
        if kind!='process':
            ops.new_file(boot/OUTPUTS[kind],body,0o600);ops.new_file(worker/'results'/OUTPUTS[kind],body)
        need(stored(ops,boot,OUTPUTS[kind],STDOUT_LIMIT)==body
             and ops.read_file(worker/'results'/OUTPUTS[kind],STDOUT_LIMIT,True)==body,'DESCRIBE_PUBLICATION_READBACK_DIFFERS')
        refs[kind]={'leaf':OUTPUTS[kind],'bytes':len(body),'sha256':sha(body)}
    need(work_left(deadline,expires_at)>5,'DESCRIBE_PUBLICATION_WORK_BUDGET_EXHAUSTED')
    return {'state':'PROGRAM_DESCRIBED_NO_PG_OR_WRITE','outputs':refs,'databaseConnections':0,'mutations':0}

if __name__=='__main__':raise SystemExit(inside())
