"""One genuine describe inside the original start job, before its handoff."""
from pathlib import Path
import ctypes,hashlib,json,os,re,selectors,signal,stat,subprocess,sys,time

SERVICE='t45-first-r3-native-service-start-20261116-37'
ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
STATE=Path('/var/lib/naijue-erp/fresh35-production')
BOOT=STATE/'native-services'/SERVICE
NODE='/opt/naijue-erp/fresh35-combined-v1/runtime/node/bin/node'
RUNNER_SHA = '145c4e378ddee0c15a48721f8ca33bcc87aeb8ca928c5589834f4f8a20758f16'
MATERIAL_SHA='73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171'
SOURCE_SHA='d20f9f89091f7a0c1006fdadf0c5fecc7711dc7398d8e2cf0471789c2f9ea898'
STDOUT_LIMIT=131072
STDERR_LIMIT=65536
BRIDGE_SECONDS=158
PUBLISH_SECONDS=12
OUTPUTS={'payload':'genuine-describe-payload.json','descriptor':'genuine-descriptor.json',
         'liveFacts':'genuine-live-facts.json','process':'genuine-describe-process.json'}
STAGES=('IMPORT_BEGIN','IMPORT_END','TRUST_BEGIN','TRUST_END','SOURCE_LOAD_BEGIN',
        'SOURCE_LOAD_END','TARGET_BEGIN','TARGET_END','COMPILE_BEGIN','COMPILE_END')
ERROR_TYPES={'Error','TypeError','ReferenceError','SyntaxError','RangeError','AssertionError','AggregateError','OTHER'}
SYSTEM_CODES={'ERR_ASSERTION','ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ENOENT','EACCES','EPERM','ENOTDIR','ELOOP','EMFILE','ENFILE','OTHER'}
GUARD_CODES={'FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS','FRESH35_COMBINED_CURRENT_SOURCE_CHANGED'}
SOURCE_MODULES={'UPGRADE','TARGET','RECORD','SOURCE','CATALOG','DERIVE155','DERIVE_PARTY_AUDIT_KEY',
                'DERIVE_PARTY_SET_SCALAR','DERIVE_ROOT114','SCHEMA_PARSER','CONTRACT_PARSER','SQL39_CATALOG_DELTA'}

def need(v,code):
    if not v:raise ValueError(code)
def sha(b):return hashlib.sha256(b).hexdigest()
def encode(v):return (json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()

def safe_native_failure(value):
    """Only fixed enums and one bounded controlled frame reach the public process."""
    if type(value) is not dict:return {}
    out={}
    code=value.get('safeCode')
    if type(code) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,159}',code):out['safeCode']=code
    for key,allowed in (('errorType',ERROR_TYPES),('systemCode',SYSTEM_CODES),('guardCode',GUARD_CODES)):
        if key not in value:continue
        item=value[key]
        if item is None and key!='errorType' or type(item) is str and item in allowed:out[key]=item
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

def capture(argv,body,seconds,stdout_limit=STDOUT_LIMIT,stderr_limit=STDERR_LIMIT,*,descendants=False):
    """Capture at most the given bytes; TERM2/KILL2 in this process namespace."""
    child=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
        env={'PATH':'/usr/bin:/bin','HOME':'/','LC_ALL':'C','TZ':'UTC'},start_new_session=True)
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
    need(sha((BOOT/'batched161-run.mjs').read_bytes())==RUNNER_SHA,'DESCRIBE_EXACT_RUNNER_REQUIRED')
    value=capture([NODE,'--no-global-search-paths',str(BOOT/'batched161-run.mjs'),'describe'],body,150,descendants=True)
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
    material=ROOT/'state/installed-real-operation-batched-root06-20261116-01/source-materialization.json'
    need(sha(ops.read_file(material,65536))==MATERIAL_SHA,'DESCRIBE_EXISTING_SOURCE_RECEIPT_DIFFERS')
    jobs=worker.parent
    committed=ops.read_file(jobs/'t45-r3-baseline-scope-admin-provision-20261113-05/native-private/committed-result.json',65536,True)
    need(sha(committed)=='12826d6714f6750feab4ddbc224392f77f253c32bbb981f0892225980f33a9e5',
         'FINAL33_ORIGINAL_ADMIN_PROVISION_REQUIRED')
    provision=ops.strict(committed)
    custody=ops.read_file(jobs/'t45-r3-first-admin-custody-receive-20261113-01/custody/original-a.json',65536,True)
    need(sha(custody)==provision['originalAdminInputSha256'],'FINAL33_ORIGINAL_ADMIN_CUSTODY_REQUIRED')
    value=ops.strict(custody);original=value['request'];admin=original['admin'];origin=provision['provisionOrigin']
    need(provision['nativeResult']['state'] in ('COMMITTED','ALREADY_COMMITTED')
         and provision['nativeResult']['connection_cleanup']=='CLOSED'
         and original['format_version']=='FIRST_ADMIN_SETUP_V1' and original['mode']=='ADMIN_PROVISION_ONLY'
         and set(admin)=={'account_id','staff_id','login_name','staff_name'}
         and admin['login_name']=='admin' and admin['staff_name']=='系统管理员'
         and all(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',admin[k]) for k in ('account_id','staff_id'))
         and origin['operation_id']==original['operation_id'] and set(origin)=={'operation_id','request_sha256'}
         and re.fullmatch('[a-f0-9]{64}',origin['request_sha256']),'FINAL33_EXACT_ORIGINAL_ADMIN_IDENTITY_REQUIRED')
    # Only the four public identity fields and two provision fields cross this metadata bridge.
    request={'service':service,'backupAdminValidUntil':admin_until,'finalIdentity':{'admin':admin,'provision':origin}}
    custody=None;value=None;original=None
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
    need(type(payload) is dict and set(payload)=={'service','backupAdminValidUntil','installStartsAt','installExpiresAt'}
         and payload['service']==service and payload['backupAdminValidUntil']==admin_until
         and all(type(payload[k]) is int for k in ('installStartsAt','installExpiresAt'))
         and d['startsAt']==payload['installStartsAt'] and d['expiresAt']==payload['installExpiresAt']
         and d['backupAdminValidUntil']==admin_until
         and d['expiresAt']==min(d['startsAt']+1200000,admin_until,c['sharedPostgresNamespace']['serviceLeaseExpiresAt'])
         and d['startsAt']<=time.time_ns()//1000000<d['expiresAt'],'DESCRIBE_PRESERVED_REAL_WINDOW_REQUIRED')
    need(d['format']=='FRESH35_BATCHED161_COMMAND_SUCCESSOR_PROGRAM_V1' and d['sourceSetSha256']==SOURCE_SHA
         and d['currentServiceSha256']==service['proofSha256'] and d['postmasterStart']==service['postmasterStart']
         and facts['service']==service and facts['currentServiceSha256']==service['proofSha256']
         and facts['sourceSetSha256']==d['sourceSetSha256'] and facts['targetSha256']==d['targetSha256']
         and facts['backupAdminValidUntil']==admin_until and facts['physical']==c['physical']
         and all(facts[k]==d[k] for k in ('installedBatchedCatalog','predecessorBatchedCatalog','batchedCatalog'))
         and facts['actualSharedServiceWorkDeadline']==c['sharedPostgresNamespace']['serviceLeaseExpiresAt']-35000,
         'DESCRIBE_CURRENT_PROGRAM_BINDING_DIFFERS')
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
