"""Fixed same-R3 read-only normal05. No credential update, initdb or business writer.

New external coordination authority is separate from the five-minute startup and
finite externally configured service. Retained runtime material is root-only for this guardian;
it is NOT an APP mount or a claim that an unselected APP UID can read it.
"""
import time
ENTRY_MONOTONIC=time.monotonic()
import fcntl,hashlib,json,os,re,signal,stat,subprocess,sys
from pathlib import Path
from types import ModuleType

JOB = 't45-first-r3-native-service-start-20261116-28'
NAME = 't45-fresh35-first-production-20261110-r3-service-28'
WORKER=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')/JOB
ACTIVE_CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
STATE=Path('/var/lib/naijue-erp/fresh35-production')
WORK=STATE/'fresh35-first-production-20261110-r3'
REL=Path('native-services')/JOB
BOOT=STATE/REL
PREVIOUS_JOB = 't45-first-r3-native-service-start-20261116-27'
PREVIOUS_CARRIER_JOB=PREVIOUS_JOB
PREVIOUS_NAME = 't45-fresh35-first-production-20261110-r3-service-27'
PREVIOUS_PROOF = 'fresh35-current-production-service-v2-service-27.json'
ORIGINAL_REQUEST='t45-first-r3-native-service-start-20261110-01'
ORIGINAL_BOOT=STATE/'native-services'/ORIGINAL_REQUEST
OPS_SHA='40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360'
PLAN_SHA='7a416900f8b3988dc51b118a928c277f252fad1f736928d72003b1f21e0ce17d'
OLD_CID='ae4d582c1d4abddc8794b577412904452ea29b234308aad9b5685af7383d6900'
OLD_PHYSICAL={'systemIdentifier':'7706545564479176741','databaseOid':'16393','serverVersionNum':'170011','postmasterStart':'2026-11-10 14:12:48.798294+00'}
PROOF_NAME = 'fresh35-current-production-service-v2-service-28.json'
ROLE='erp35_runtime_20261110_r3'
DATABASE='erp_fresh35_20261110_r3'
HOST_WORK_SECONDS=190
MATERIALIZED_JOB=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-r2-data-materialize-20261112-01')
MATERIALIZED_RECEIPT='88c4a8dff9a092f50479733d88593ffcb5ebbcc16ab6ffbfc6e0c9ec4cbfb157'
MATERIALIZER_SHA='1f8a8cc826d153455de7c8f93af3402032dc82fd4f498c1912d50c79185e41b8'
MATERIALIZED_PROFILE_SHA='ce6d6a3c71497701f1dab5ddf5fac89cc93d0824324b0aa75512dfc05177d904'
R3_RUNTIME_SHA = '08fa48fd18853fd2eec2e5bb3995bf73a588de9242d4c7c8076d0db6289871c8'
R3_CLI_SHA = 'b3f963efd9e8b37b653bf9eeaf5e9bfdc71b689a0f45c100a1d95fb9348f05c0'
READONLY_SHA = 'febdf53124d39c5934c6ce33d120aa82b76a566edd8921b1927b294b8856bfe8'
BASELINE_RUNTIME_SHA='4da4cd69a818800e82cf14d1ca409863c3ed6904b5980955cea299fcf9c14278'
CONTAINER_DEADLINE_PROGRAM="""import os,sys,time
seconds=(int(sys.argv[1])-time.time_ns()//1000000)//1000-3
if seconds<=0: raise SystemExit(2)
os.execv('/usr/bin/timeout',['/usr/bin/timeout','--signal=TERM','--kill-after=3s',str(seconds),'/usr/bin/sleep','infinity'])
"""
INTERFACE='erp_unified27_runtime_2393dbc6db9581c2'
ROLE_CONDITION="r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconnlimit=2 AND (r.rolvaliduntil IS NULL OR r.rolvaliduntil='infinity'::timestamptz)"
MEMBERSHIP_CONDITION="(SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)=1 AND EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid WHERE m.member=r.oid AND g.rolname='"+INTERFACE+"' AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)"
READINESS_SQL="BEGIN READ ONLY; SET LOCAL statement_timeout='2s'; SELECT json_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'databaseOid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),'serverVersionNum',current_setting('server_version_num'),'postmasterStart',pg_catalog.pg_postmaster_start_time()::text,'database',current_database(),'actor',current_user,'sessionActor',session_user,'address',host(inet_server_addr()),'port',inet_server_port(),'readOnly',current_setting('transaction_read_only'),'roleBoundary',(SELECT "+ROLE_CONDITION+' AND '+MEMBERSHIP_CONDITION+" FROM pg_catalog.pg_roles r WHERE r.rolname=current_user),'runtimeLoginValidUntil',(SELECT rolvaliduntil::text FROM pg_catalog.pg_roles WHERE rolname=current_user))::text; ROLLBACK;"

def need(ok,code):
    if not ok:raise ValueError(code)
def now():return time.time_ns()//1000000
def sha(raw):return hashlib.sha256(raw).hexdigest()
def module(raw,path,name):
    m=ModuleType(name);m.__file__=str(path);exec(compile(raw,str(path),'exec'),m.__dict__);return m

def pinned(ops,path,digest):
    raw=ops.read_file(path,65536,True)
    need(sha(raw)==digest,'NORMAL05_R3_EXACT_INPUT_DIFFERS')
    return raw

def readonly_module(ops,boot):
    path=boot/'r3_05_readonly.py'
    return module(pinned(ops,path,READONLY_SHA),path,'r3_05_readonly')

def prepare_r3_mounts(ops,boot):
    cli=WORKER/'bundle/r3_05_cli.py';runtime=WORKER/'bundle/r3_05_runtime.py'
    sys.modules['r3_05_cli']=module(pinned(ops,cli,R3_CLI_SHA),cli,'r3_05_cli')
    r3=module(pinned(ops,runtime,R3_RUNTIME_SHA),runtime,'r3_05_runtime')
    base=MATERIALIZED_JOB/'bundle';materializer=base/'materialize-r3-r2.py';profile=base/'profile.json'
    source=pinned(ops,materializer,MATERIALIZER_SHA);profile_raw=pinned(ops,profile,MATERIALIZED_PROFILE_SHA)
    material=module(source,materializer,'r3_materialized')
    receipt=ops.strict(pinned(ops,MATERIALIZED_JOB/'results/r3-r2-private-materialization.json',MATERIALIZED_RECEIPT))
    _,mounts=r3.mount_plan(profile_raw,receipt,ops.strict,material.planned_mounts)
    ops.new_file(boot/materializer.name,source,0o400)
    ops.new_file(boot/'materialized-profile.json',profile_raw,0o400)
    r3.prepare_proof_projection(ops.new_file,ops.syncdir)
    return r3,mounts
def identity(path):
    s=path.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode),'NORMAL_DIRECTORY_REQUIRED')
    return {'device':s.st_dev,'inode':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode)}
BASIC_SQL="BEGIN READ ONLY; SET LOCAL statement_timeout='2s'; SELECT json_build_object('one',1,'currentUser',current_user,'sessionUser',session_user,'readOnly',current_setting('transaction_read_only'))::text; ROLLBACK;"
ROLE_SQL="BEGIN READ ONLY; SET LOCAL statement_timeout='2s'; SELECT json_build_object('readOnly',current_setting('transaction_read_only'),'role',(SELECT json_build_object('name',rolname,'canLogin',rolcanlogin,'superuser',rolsuper,'createDb',rolcreatedb,'createRole',rolcreaterole,'inherit',rolinherit,'replication',rolreplication,'bypassRls',rolbypassrls,'connectionLimit',rolconnlimit,'validUntil',rolvaliduntil::text) FROM pg_catalog.pg_roles WHERE rolname=session_user),'membershipCount',(SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname=session_user),'memberships',(SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT g.rolname AS role,m.admin_option,m.inherit_option,m.set_option FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member JOIN pg_catalog.pg_roles g ON g.oid=m.roleid WHERE r.rolname=session_user ORDER BY g.rolname LIMIT 8) x))::text; ROLLBACK;"
PRIVILEGES_SQL="BEGIN READ ONLY; SET LOCAL statement_timeout='2s'; SELECT json_build_object('readOnly',current_setting('transaction_read_only'),'controlSystemExecute',has_function_privilege(session_user,'pg_catalog.pg_control_system()','EXECUTE'),'rolesSelect',has_table_privilege(session_user,'pg_catalog.pg_roles','SELECT'),'membersSelect',has_table_privilege(session_user,'pg_catalog.pg_auth_members','SELECT'))::text; ROLLBACK;"
LOCK_CAPACITY_SQL="BEGIN READ ONLY; SET LOCAL statement_timeout='2s'; SELECT json_build_object('readOnly',current_setting('transaction_read_only'),'max_locks_per_transaction',current_setting('max_locks_per_transaction')::integer,'max_connections',current_setting('max_connections')::integer,'max_prepared_transactions',current_setting('max_prepared_transactions')::integer,'autovacuum_max_workers',current_setting('autovacuum_max_workers')::integer,'max_worker_processes',current_setting('max_worker_processes')::integer,'max_wal_senders',current_setting('max_wal_senders')::integer,'shared_buffers_bytes',pg_size_bytes(current_setting('shared_buffers')),'shared_memory_type',current_setting('shared_memory_type'),'shared_memory_size_bytes',CASE WHEN current_setting('shared_memory_size',true) IS NULL THEN NULL ELSE pg_size_bytes(current_setting('shared_memory_size')) END)::text; ROLLBACK;"
QUERY_PLAN={'BASIC_READ_ONLY':BASIC_SQL,'ROLE_ATTRIBUTES':ROLE_SQL,'PRIVILEGES':PRIVILEGES_SQL,'READINESS':READINESS_SQL,'LOCK_CAPACITY_SETTINGS':LOCK_CAPACITY_SQL}

def safe_query_error(stderr):
    need(type(stderr) is bytes and len(stderr)<=65536,'NORMAL_QUERY_ERROR_BOUNDS')
    state=re.findall(rb'(?:ERROR|FATAL):\s+([0-9A-Z]{5})(?=[:\s]|$)',stderr)
    severity='FATAL' if b'FATAL:' in stderr else 'ERROR' if b'ERROR:' in stderr else None
    category=('SERVER_STARTING' if severity=='FATAL' and b'database system is starting up' in stderr else
              'CONNECTION_REFUSED' if severity is None and b'Connection refused' in stderr else
              'AUTH_REFUSED' if severity=='FATAL' and b'authentication failed' in stderr else
              'QUERY_ERROR' if severity=='ERROR' else 'SERVER_FATAL' if severity=='FATAL' else
              'CLIENT_LOAD_ERROR' if b'error while loading shared libraries' in stderr or b'symbol lookup error' in stderr else
              'CLIENT_ERROR')
    return {'sqlstate':state[-1].decode() if state else None,'severity':severity,'category':category}

def query_runtime(ops,core,passfile,kind,seconds):
    need(kind in QUERY_PLAN and passfile==ORIGINAL_BOOT/'runtime.pgpass','NORMAL_FIXED_READONLY_QUERY_REQUIRED')
    ops.trusted(passfile);st=passfile.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and (st.st_dev,st.st_ino,st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode),st.st_size)
         ==(66304,13503994,0,0,0o600,131),'NORMAL_ORIGINAL_LIBPQ_REFERENCE_CHANGED')
    env=core.clean_env(WORK);env.update(PGPASSFILE=str(passfile),PGCONNECT_TIMEOUT='3',PGOPTIONS='-c search_path=pg_catalog -c statement_timeout=2000 -c TimeZone=UTC')
    result={'kind':kind,'ok':False,'returnCode':None,'sqlstate':None,'category':None,'result':None}
    try:
        q=subprocess.run([str(core.BIN/'psql'),'-X','-qAt','--no-password','--host','127.0.0.1','--port','56791','--dbname',DATABASE,
                          '--username',ROLE,'--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate'],input=QUERY_PLAN[kind].encode(),capture_output=True,env=env,timeout=seconds)
    except subprocess.TimeoutExpired:
        result['category']='CLIENT_TIMEOUT';return result
    except OSError as error:
        result.update(category='CLIENT_EXEC_ERROR',errno=error.errno);return result
    need(len(q.stdout)+len(q.stderr)<=65536,'NORMAL_QUERY_RESULT_BOUNDS')
    result.update(returnCode=q.returncode,stdoutBytes=len(q.stdout),stderrBytes=len(q.stderr))
    if q.returncode:
        result.update(safe_query_error(q.stderr));return result
    value=ops.strict(q.stdout);need(type(value) is dict and value.get('readOnly')=='on','NORMAL_ACTUAL_READONLY_TRANSACTION_REQUIRED')
    if kind=='BASIC_READ_ONLY':
        need(value=={'one':1,'currentUser':ROLE,'sessionUser':ROLE,'readOnly':'on'},'NORMAL_BASIC_RUNTIME_IDENTITY_DIFFERS')
    result.update(ok=True,category='PASS_READ_ONLY',result=value);return result

def reviewed_server_args(factory,old):
    argv=factory.production_server_args(old)
    need(type(argv) is list and all(type(x) is str for x in argv),'NORMAL20_FIXED_SERVER_ARGUMENTS_REQUIRED')
    settings={}
    for index,value in enumerate(argv[:-1]):
        if value=='-c' and '=' in argv[index+1]:
            key,actual=argv[index+1].split('=',1);settings[key]=actual
    need(settings.get('max_connections')=='8' and settings.get('shared_buffers')=='32MB'
         and 'max_locks_per_transaction' not in settings,'NORMAL20_ORIGINAL_SERVER_BUDGET_CHANGED')
    return [*argv,'-c','max_locks_per_transaction=65536']

def capacity_projection(observation):
    value=observation['result']
    expected={'max_locks_per_transaction':65536,'max_connections':8,'max_prepared_transactions':0,
              'autovacuum_max_workers':3,'max_worker_processes':8,'max_wal_senders':10,'shared_buffers_bytes':33554432}
    need(observation['ok'] and value.get('readOnly')=='on'
         and all(type(value.get(k)) is int and value[k]==v for k,v in expected.items()),
         'NORMAL20_LOCK_CAPACITY_BUDGET_INPUTS_DIFFER')
    b=value['max_connections']+value['autovacuum_max_workers']+value['max_worker_processes']+value['max_wal_senders']+2+value['max_prepared_transactions']
    need(b==31 and 65536*b>=1677658 and value.get('shared_memory_type') in ('mmap','sysv')
         and type(value.get('shared_memory_size_bytes')) is int and 0<value['shared_memory_size_bytes']<7516192768,
         'NORMAL20_SHARED_ALLOCATION_OR_BUDGET_REQUIRED')
    cgroup={}
    for leaf in ('memory.max','memory.current','memory.peak','memory.swap.max'):
        path=Path('/sys/fs/cgroup')/leaf
        need(path.is_file(),'NORMAL20_EXISTING_MEMORY_CGROUP_REQUIRED')
        text=path.read_text().strip();need(text=='max' or text.isdecimal(),'NORMAL20_MEMORY_CGROUP_FORMAT_REQUIRED')
        cgroup[leaf]=text if text=='max' else int(text)
    need(cgroup['memory.max']==7516192768 and type(cgroup['memory.current']) is int
         and 0<cgroup['memory.current']<cgroup['memory.max'],'NORMAL20_ACTUAL_MEMORY_LIMIT_OR_USAGE_DIFFERS')
    return {'requestKey':JOB,'settings':value,'capacityB':b,'lockSlots':65536*b,
            'requiredSlotsWithReviewedHeadroom':1677658,'cgroup':cgroup,'observedAt':now(),
            'parameterInputsMatchedReviewedBudget':True,'actualAllocationRecorded':True,
            'wholeExecutionPeakProven':False,'inspectionAuthorized':False,'businessExecutionAuthorized':False}

def wait_runtime_ready(ops,core,passfile,owned,sample,deadline,observations):
    last={'kind':'BASIC_READ_ONLY','ok':False,'returnCode':None,'sqlstate':None,'category':'READINESS_DEADLINE','result':None}
    while time.monotonic()<deadline:
        sample();need(core.same_process(owned),'NORMAL_READINESS_POSTMASTER_BIRTH_CHANGED')
        remaining=deadline-time.monotonic()
        if remaining<=.01:break
        last=query_runtime(ops,core,passfile,'BASIC_READ_ONLY',min(5,remaining));observations.append(last)
        sample();need(core.same_process(owned),'NORMAL_READINESS_POSTMASTER_BIRTH_CHANGED')
        if time.monotonic()>=deadline:return {**last,'ok':False,'category':'READINESS_DEADLINE'}
        if last['ok']:return last
        if last['returnCode']!=2 or last['category'] not in ('SERVER_STARTING','CONNECTION_REFUSED'):return last
        remaining=deadline-time.monotonic()
        if remaining<=0:break
        time.sleep(min(.25,remaining))
    return {**last,'ok':False,'category':'READINESS_DEADLINE'}

def original_material_paths(ops,proof,host=False):
    base=(ROOT/'state/native-services'/ORIGINAL_REQUEST) if host else ORIGINAL_BOOT
    expected=proof.scope()['originalRuntimeMaterial']
    paths={'configuration':base/'runtime-connection.json','libpqReference':base/'runtime.pgpass'}
    for key,path in paths.items():
        ops.trusted(path);st=path.lstat()
        actual={'device':st.st_dev,'inode':st.st_ino,'uid':st.st_uid,'gid':st.st_gid,'mode':stat.S_IMODE(st.st_mode),'bytes':st.st_size}
        need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and actual==expected[key],'NORMAL_ORIGINAL_RUNTIME_MATERIAL_IDENTITY_DIFFERS')
    return paths

def clean(core,work,expected):
    need(identity(work/'data')==expected and not os.path.lexists(work/'data/postmaster.pid') and core.port_absent(56791),'NORMAL_EXACT_STOPPED_PGDATA_REQUIRED')
    p=subprocess.run([str(core.BIN/'pg_controldata'),'-D',str(work/'data')],capture_output=True,env=core.clean_env(work),timeout=5,
                     user=61035,group=61035,extra_groups=[])
    need(p.returncode==0 and re.search(rb'^Database cluster state:\s*shut down\s*$',p.stdout,re.M)
         and re.search(rb'^Database system identifier:\s*7706545564479176741\s*$',p.stdout,re.M),'NORMAL_CLEAN_ORIGINAL_CLUSTER_REQUIRED')
def context(ops,proof):
    raw=ops.read_file(Path('/etc/naijue-erp/fresh35-production-provision-v2.json'),65536,True);a=ops.strict(raw)
    factory=ops.inside_production_factory(a)
    # Recheck only executables used now and their external libpq dependency;
    # the already-accepted complete installation closure is not scanned again.
    for name in ('postgres','psql','pg_controldata'):
        need(sha(ops.read_file(factory.core.BIN/name,32*1024**2))==factory.core.TOOL_PINS[name],'NORMAL_PINNED_PG_TOOL_DIFFERS')
    lib=Path('/usr/lib/x86_64-linux-gnu/libpq.so.5.17')
    need(Path('/lib/x86_64-linux-gnu/libpq.so.5').resolve()==lib
         and sha(ops.read_file(lib,2*1024**2))=='f64dcec14657e4123621448442cd3d0795744d238e588774f5c864f592f4860d','NORMAL_PINNED_LIBPQ_DIFFERS')
    record=ops.read_file(Path('/etc/naijue-erp/fresh35-combined-installation-v1.json'),1048576)
    need(sha(record)==proof.RECORD and a['ordinary']['runtimeLoginValidUntil'] is None,'NORMAL_ORIGINAL_RECORD_OR_LIFETIME_DIFFERS')
    t=ops.strict(ops.read_file(WORK/'target-binding.json',1048576,True));p=ops.strict(ops.read_file(WORK/'program-description.json',1048576,True));i=ops.strict(ops.read_file(WORK/'installation-result.json',65536,True))
    r=factory.assert_retention(a,t,p,i,record)
    need(r['target']['physical']==OLD_PHYSICAL and r['binding']=={'sourceSetSha256':proof.SOURCE,'targetSha256':proof.TARGET}
         and identity(WORK/'data')==proof.DATA,'NORMAL_ORIGINAL_PHYSICAL_BINDING_DIFFERS')
    return a,factory,record

def protected_lineage(ops,proof,authority,a):
    admin=ops.read_file(authority/'fresh35-admin154-successor-v1.json',65536)
    record38=ops.read_file(authority/proof.RECORD38,65536)
    proof.validate_post38(record38,proof.validate_admin154(admin,a),a)
    return admin,record38

def inside(ops,proof,a,authraw):
    lease=proof.validate_authority(a,now());began=time.monotonic();startup=min(a['expiresAt'],now()+300000)
    lease_monotonic=began+(lease-now())/1000
    outer_monotonic=lease_monotonic+(a['serviceLeaseExpiresAt']-lease)/1000
    lock=os.open(STATE/'native-services/service-operation.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    s=os.fstat(lock);need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o077,'NORMAL_OPERATION_LOCK_REQUIRED')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    old,factory,record=context(ops,proof);core=factory.core
    authority=Path('/etc/naijue-erp')
    lineage=protected_lineage(ops,proof,authority,a)
    clean(core,WORK,proof.DATA);hba=ops.read_file(WORK/'data/pg_hba.conf',65536,True,False)
    need(hba==core.hba_text(old['proposal']).encode(),'NORMAL_ORIGINAL_HBA_DIFFERS')
    original_paths=original_material_paths(ops,proof)
    birth=ops.strict(ops.read_file(BOOT/'carrier-birth.json',65536,True));ns=Path('/proc/self/ns/net').stat()
    need(birth['name']==NAME and birth['networkNamespace']=={'device':ns.st_dev,'inode':ns.st_ino},'NORMAL_ACTUAL_CONTAINER_NAMESPACE_DIFFERS')
    proc=owned=None;retained=False;interrupted=False;stop_reason='STARTUP_NOT_COMPLETE';previous=OLD_PHYSICAL['systemIdentifier']
    phase='ORIGINAL_INPUTS_VERIFIED';sqlstate=None;q_exit=None;error_category=None;query_stages=[]
    def stop(*_):
        nonlocal interrupted
        interrupted=True
    for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP):signal.signal(sig,stop)
    mount=ops.real_mount(str(STATE));observed={}
    def sample(admission=False):
        need(not interrupted and identity(WORK/'data')==proof.DATA,'NORMAL_STOP_OR_PGDATA_CHANGED')
        ops.first_capacity_sample(STATE,(66304,13502389),mount,admission)
        ops.first_capacity_paths(WORK,66304,mount,observed)
        need(time.monotonic()<lease_monotonic and now()<lease,'NORMAL_FINITE_SERVICE_OR_CAPACITY_EXPIRED')
        if not retained:need(time.monotonic()-began<300 and now()<startup,'NORMAL_FIVE_MINUTE_START_EXPIRED')
    try:
        materializer=BOOT/'materialize-r3-r2.py'
        material=module(pinned(ops,materializer,MATERIALIZER_SHA),materializer,'r3_materialized')
        profile=ops.strict(pinned(ops,BOOT/'materialized-profile.json',MATERIALIZED_PROFILE_SHA))
        material.verify_registry_alias(Path(profile['containerIntakeRoot']),profile,Path('/proc/self/mountinfo').read_text())
        sample(True);ops.new_json(BOOT/'guardian-process.json',core.process_identity(os.getpid()))
        startup_deadline=time.monotonic()+20
        phase='POSTGRES_START'
        with (BOOT/'server-private.log').open('xb',buffering=0) as log:
            proc=subprocess.Popen(reviewed_server_args(factory,old),stdin=subprocess.DEVNULL,stdout=log,stderr=log,
                                  env=core.clean_env(WORK),user=61035,group=61035,extra_groups=[],start_new_session=True)
        end=startup_deadline
        while time.monotonic()<end:
            sample();need(proc.poll() is None,'NORMAL_OWNED_POSTMASTER_LOST')
            try:owned=core.process_identity(proc.pid)
            except FileNotFoundError:time.sleep(.02);continue
            if core.same_process(owned) and core.owned_listener(owned,56791):break
            time.sleep(.1)
        need(owned and core.same_process(owned) and core.owned_listener(owned,56791),'NORMAL_OWNED_LISTENER_NOT_READY')
        phase='WAIT_RUNTIME_READY'
        ready=wait_runtime_ready(ops,core,original_paths['libpqReference'],owned,sample,startup_deadline,query_stages)
        q_exit=ready['returnCode'];sqlstate=ready['sqlstate'];error_category=ready['category']
        need(ready['ok'],'NORMAL_RUNTIME_READINESS_NOT_CONFIRMED')
        ops.new_json(BOOT/'runtime-authenticated.json',{'requestKey':JOB,'checkedAt':now(),'runtimeRole':ROLE,
                     'currentRuntimeReferenceUsable':True,'originalRuntimeRequestKey':ORIGINAL_REQUEST,
                     'previousRuntimeOutcome':'UNKNOWN_PRESERVED','qExitCode':0,'readOnly':True,'sqlstate':None})
        for kind in ('ROLE_ATTRIBUTES','PRIVILEGES','READINESS'):
            phase=kind;sample();need(proc.poll() is None and core.same_process(owned),'NORMAL_OWNED_POSTMASTER_LOST')
            observation=query_runtime(ops,core,original_paths['libpqReference'],kind,5)
            query_stages.append(observation);q_exit=observation['returnCode'];sqlstate=observation['sqlstate'];error_category=observation['category']
            need(observation['ok'],'NORMAL_RUNTIME_QUERY_FAILED')
        v=observation['result'];physical={k:v[k] for k in OLD_PHYSICAL}
        need(all(physical[k]==OLD_PHYSICAL[k] for k in ('systemIdentifier','databaseOid','serverVersionNum'))
             and proof.micros(physical['postmasterStart'])>proof.micros(OLD_PHYSICAL['postmasterStart'])
             and v['actor']==v['sessionActor']==ROLE and v['database']==DATABASE and v['address']=='127.0.0.1' and v['port']==56791
             and v['readOnly']=='on' and v['roleBoundary'] is True and v['runtimeLoginValidUntil'] in (None,'infinity'),
             'NORMAL_RUNTIME_PHYSICAL_OR_ROLE_BOUNDARY_DIFFERS')
        phase='LOCK_CAPACITY_SETTINGS';sample()
        capacity=query_runtime(ops,core,original_paths['libpqReference'],'LOCK_CAPACITY_SETTINGS',5)
        query_stages.append(capacity);q_exit=capacity['returnCode'];sqlstate=capacity['sqlstate'];error_category=capacity['category']
        projection=capacity_projection(capacity)
        ops.new_json(BOOT/'lock-capacity-settings.json',projection)
        sample();need(ops.read_file(WORK/'data/pg_hba.conf',65536,True,False)==hba,'NORMAL_ORIGINAL_HBA_CHANGED')
        fields=(Path('/proc')/str(owned['pid'])/'stat').read_text().rsplit(')',1)[1].split()
        need(fields[1]==str(os.getpid()) and core.same_process(owned),'NORMAL_POSTMASTER_GUARDIAN_PARENT_DIFFERS')
        ops.new_json(BOOT/'runtime-role-observation.json',{'requestKey':JOB,'physical':physical,'queryStages':query_stages,'currentRuntimeReferenceUsable':True,'previousRuntimeOutcome':'UNKNOWN_PRESERVED'})
        phase='PUBLISH_RETAINED_SERVICE'
        need(protected_lineage(ops,proof,authority,a)==lineage,'NORMAL_POST38_RECORD_CHANGED_BEFORE_RETAIN')
        r={'format':proof.RECEIPT_FORMAT,'state':proof.RECEIPT_STATE,'requestKey':JOB,'authorizationSha256':sha(authraw),'checkedAt':now(),
           'installationRecordSha256':proof.RECORD,'targetSha256':proof.TARGET,'sourceSetSha256':proof.SOURCE,
           'dataDirectory':str(WORK/'data'),'dataDirectoryIdentity':proof.DATA,'physical':physical,'container':birth,
           'postmaster':owned,'guardian':core.process_identity(os.getpid()),'runtimeRole':ROLE,'runtimeLoginValidUntil':None,'serviceLeaseExpiresAt':lease}
        receipt=proof.canonical(r);proof.build(record,authraw,receipt,now(),*lineage);ops.new_file(BOOT/'service-retained.json',receipt);phase='WAIT_PUBLISHED_PROOF'
        while not interrupted:
            sample();need(proc.poll() is None and core.same_process(owned),'NORMAL_POSTMASTER_LOST')
            if not retained and os.path.lexists(Path('/etc/naijue-erp')/PROOF_NAME):
                current=ops.read_file(Path('/etc/naijue-erp')/PROOF_NAME,65536)
                need(current==proof.build(record,authraw,receipt,now(),*lineage),'NORMAL_PUBLISHED_PROOF_DIFFERS')
                retained=True;phase='SERVICE_RETAINED';ops.new_json(BOOT/'retained-ack.json',{'requestKey':JOB,'proofSha256':sha(current),'serviceLeaseExpiresAt':lease})
            time.sleep(.1)
        stop_reason='EXACT_GUARDIAN_STOP_REQUESTED'
    except Exception as error:
        stop_reason=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__
    finally:
        cleanup=factory.stop_owned(old,proc,owned,previous,min(time.monotonic()+25,outer_monotonic))
        # Original 01 private runtime reference survives normal expiry and failure;
        # no automatic delete of the sole password or reset/replay is performed.
        ops.new_json(BOOT/'cleanup.json',{'requestKey':JOB,'retained':retained,'reason':stop_reason,'phase':phase,'qExitCode':q_exit,'sqlstate':sqlstate,'errorCategory':error_category,'queryStages':query_stages,'cleanup':cleanup,'runtimeMaterialPreserved':True,'previousRuntimeOutcome':'UNKNOWN_PRESERVED'})
        os.close(lock)
    return 0 if cleanup.get('cleanupComplete') is True else 2

def close_failed_start(ops,proof):
    old,factory,_=context(ops,proof);core=factory.core
    path=BOOT/'guardian-process.json'
    if os.path.lexists(path):
        expected=ops.strict(ops.read_file(path,65536,True))
        need(set(expected)=={'pid','starttime','exe'} and type(expected['pid']) is int and expected['pid']>1
             and re.fullmatch(r'/usr/bin/python3(?:\.[0-9]+)?',expected['exe']),'NORMAL_CLOSE_GUARDIAN_IDENTITY_REQUIRED')
        def live():
            try:return core.process_identity(expected['pid'])==expected
            except FileNotFoundError:return False
        if live():
            process=Path('/proc')/str(expected['pid'])
            argv=[v.decode() for v in (process/'cmdline').read_bytes().split(b'\0') if v]
            need(process.stat().st_uid==0 and argv[-2:]==[str(BOOT/'normal_service05_after08.py'),'--inside'] and live(),
                 'NORMAL_CLOSE_OWNED_GUARDIAN_REQUIRED')
            os.kill(expected['pid'],signal.SIGTERM)
            deadline=time.monotonic()+60
            while live() and time.monotonic()<deadline:time.sleep(.1)
            need(not live(),'NORMAL_CLOSE_GUARDIAN_STILL_LIVE')
    clean(core,WORK,proof.DATA)
    if os.path.lexists(BOOT/'cleanup.json'):
        cleanup=ops.strict(ops.read_file(BOOT/'cleanup.json',65536,True))
        need(cleanup['requestKey']==JOB and (cleanup['cleanup'].get('cleanupComplete') is True
             or cleanup['cleanup'].get('ownedPidAbsent') is True),'NORMAL_CLOSE_PRIOR_CLEANUP_DIFFERS')
    result={'status':'NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED','requestKey':JOB,
            'originalPGDATAAndCleanStateVerified':True,'runtimeMaterialPreserved':True,
            'dataDirectoryIdentity':identity(WORK/'data'),'checkedAt':now()}
    ops.new_json(BOOT/'failed-start-cleanup.json',result)
    return result

def carrier_info(ops,cid,seconds=5):
    raw=ops.run(['docker','inspect',cid],seconds=seconds)
    need(len(raw)<=262144,'NORMAL05_CONTAINER_INSPECT_BOUNDS')
    values=ops.strict(raw)
    need(type(values) is list and len(values)==1,'NORMAL05_EXACT_CARRIER_INSPECT_REQUIRED')
    v=values[0];state=v['State'];host=v['HostConfig'];config=v['Config']
    return {'id':v['Id'],'name':v['Name'],'image':v['Image'],'running':state['Running'],
            'pid':state['Pid'],'startedAt':state['StartedAt'],'networks':v['NetworkSettings']['Networks'],
            'entrypoint':config['Entrypoint'],'command':config['Cmd'],
            'network':host['NetworkMode'],'ports':host['PortBindings'],'user':config['User'],
            'readonly':host['ReadonlyRootfs'],'memory':host['Memory'],'swap':host['MemorySwap'],
            'cpu':host['NanoCpus'],'pids':host['PidsLimit'],'caps':host['CapAdd'],'capDrop':host['CapDrop'],
            'security':host['SecurityOpt'],'pidMode':host['PidMode'],'ipcMode':host['IpcMode'],
            'usernsMode':host['UsernsMode'],'labels':config['Labels'],'privileged':host['Privileged'],
            'devices':host['Devices'],'restart':host['RestartPolicy']['Name'],'shm':host['ShmSize'],
            'tmpfs':host['Tmpfs'],'mounts':v['Mounts']}


def start_work_left(deadline,expires_at):
    return min(deadline-time.monotonic(),(expires_at-now())/1000-110)


def container_deadline_args(expires):
    return ['-I','-S','-c',CONTAINER_DEADLINE_PROGRAM,str(expires)]


def owned_05(ops,info,receipt,plan,capacity_stopped=False):
    need(info['entrypoint']==['/usr/bin/python3'] and info['command']==container_deadline_args(plan['r3OuterExpiresAt']),
         'NORMAL05_R3_CONTAINER_DEADLINE_DIFFERS')
    expected={m['target']:(m['source'],False) for m in plan['r3ReadonlyMounts']}
    seen={};original=[]
    for mount in info['mounts']:
        target=mount['Destination']
        if target in expected:
            need(target not in seen and mount['Type']=='bind','NORMAL05_R3_BIND_TYPE_OR_DUPLICATE')
            seen[target]=(mount['Source'],mount['RW'])
        else:original.append(mount)
    need(seen==expected,'NORMAL05_R3_EXACT_READONLY_BINDS_REQUIRED')
    readonly=readonly_module(ops,ops.ROOT/'state'/REL)
    original=readonly.originals_for_verifier(ops,original)
    ops.owned_production({**info,'mounts':original},receipt,plan,capacity_stopped=capacity_stopped,name=NAME)


def close_start(ops,cid,plan,lease,boot):
    identity={'cid':cid,'image':ops.ENV_IMAGE,'expiresAt':lease}
    before=carrier_info(ops,cid)
    owned_05(ops,before,identity,plan,capacity_stopped=True)
    if before['running']:
        closed=ops.strict(ops.run(['docker','exec','--user','0:0',cid,'/usr/bin/python3','-I','-S',
                                   str(BOOT/'normal_service05_after08.py'),'--close-start-failure'],seconds=70))
        need(closed.get('status')=='NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED',
             'NORMAL_FAILED_START_CLEANUP_UNCONFIRMED')
        verified=carrier_info(ops,cid)
        owned_05(ops,verified,identity,plan,capacity_stopped=True)
        if verified['running']:
            need((verified['pid'],verified['startedAt'])==(before['pid'],before['startedAt']),
                 'NORMAL05_CLOSE_CARRIER_BIRTH_CHANGED')
            ops.run(['docker','stop','--time','5',cid],seconds=10)
    else:
        raw=ops.read_file(boot/'cleanup.json',65536,True)
        v=ops.strict(raw)
        need(v['requestKey']==JOB and all(v['cleanup'].get(flag) is True
             for flag in ('cleanupComplete','cleanShutdown','ownedPidAbsent','portAbsent')),
             'NORMAL05_STOPPED_CARRIER_CLEANUP_NOT_CONFIRMED')
        closed={'status':'NORMAL05_ALREADY_STOPPED_CLEANUP_READBACK','cleanupSha256':sha(raw)}
    final=carrier_info(ops,cid)
    owned_05(ops,final,identity,plan,capacity_stopped=True)
    need(not final['running'] and final['pid']==0,'NORMAL_FAILED_START_CONTAINER_STOP_UNCONFIRMED')
    leaf='failed-start-cleanup.json' if before['running'] else 'cleanup.json'
    raw=ops.read_file(boot/leaf,65536,True)
    closed={**closed,'cleanupLeaf':leaf,'cleanupSha256':sha(raw)}
    return {'confirmed':True,'containerStopped':True,'pid':final['pid'],'cleanStop':closed}


def carrier(ops,cid,plan,lease,seconds=5):
    info=carrier_info(ops,cid,seconds);owned_05(ops,info,{'cid':cid,'image':ops.ENV_IMAGE,'expiresAt':lease},plan)
    need(info['running'] and info['pid']>1,'NORMAL_CONTAINER_NOT_LIVE')
    endpoint=info['networks'][plan['productionCarrier']['front']['name']]
    return {'id':cid,'name':NAME,'imageId':info['image'],'startedAt':info['startedAt'],'hostPid':info['pid'],
            **ops.production_process_namespace(info['pid']),'frontEndpoint':{'id':endpoint['EndpointID'],'aliases':endpoint.get('Aliases') or []}}

def await_retained_ack(ops,boot,deadline,expires_at,cid,plan,lease,birth,proof_sha):
    while start_work_left(deadline,expires_at)>5:
        if os.path.lexists(boot/'retained-ack.json'):
            value=ops.strict(ops.read_file(boot/'retained-ack.json',65536,True))
            need(value=={'requestKey':JOB,'proofSha256':proof_sha,'serviceLeaseExpiresAt':lease},
                 'NORMAL_RETAINED_ACK_DIFFERS')
            need(start_work_left(deadline,expires_at)>5 and carrier(ops,cid,plan,lease)==birth
                 and start_work_left(deadline,expires_at)>0,'NORMAL05_LATE_OR_CHANGED_RETAINED_ACK')
            return True
        if os.path.lexists(boot/'cleanup.json'):
            break
        time.sleep(.1)
    return False


def publish_worker_proof(ops,r3,raw,deadline,expires_at,cid,plan,lease,birth):
    ops.new_file(r3.PROOF_PROJECTION/r3.SERVICE.name,raw,0o444)
    projected=ops.run(['docker','exec','--user','0:0',cid,'/usr/bin/cat',str(r3.SERVICE)],seconds=5)
    need(projected==raw,'NORMAL05_R3_WORKER_PROOF_PROJECTION_DIFFERS')
    remaining=start_work_left(deadline,expires_at)
    need(remaining>5,'NORMAL05_R3_PROJECTION_LATE')
    need(carrier(ops,cid,plan,lease,seconds=min(5,remaining-5))==birth,
         'NORMAL05_R3_PROJECTION_CARRIER_CHANGED')
    need(start_work_left(deadline,expires_at)>5,'NORMAL05_R3_PROJECTION_LATE')
    ops.new_file(ROOT/'authority'/PROOF_NAME,raw,0o444)
    readonly_module(ops,ROOT/'state'/REL).publish_proof(ops,raw)


def validate_current_phase_results(ops,proof,authority,record38):
    for phase,job in proof.PHASES.items():
        terminal=ops.read_file(ACTIVE_CONTROL/'results'/(job+'.json'),65536,False,False)
        proof.validate_terminal(terminal,job,authority['phaseTerminals'][phase])
        leaf='native-private/committed-result.json' if phase=='ADMIN_PROVISION_ONLY' else 'results/native154-result.json'
        result_path=WORKER.parent/job/leaf
        result=proof.validate_phase_result(phase,ops.read_file(result_path,65536,True),authority)
        if phase=='SQL38':
            need(result['sourceSql38NodeEnvelopeSha256']==record38['authorizationSha256'],
                 'NORMAL05_SQL38_RETAINED_NODE_AUTHORITY_DIFFERS')


def host(ops,proof,a,authraw,lifecycle):
    lease=proof.validate_authority(a,now());deadline=ENTRY_MONOTONIC+HOST_WORK_SECONDS;need(now()+300000<a['expiresAt'],'NORMAL_COORDINATION_BUDGET_TOO_SHORT')
    plan=ops.load_production_plan(str(WORKER/'bundle/production-plan.json'),PLAN_SHA);ops.materialized_root_identity(plan)
    original=carrier_info(ops,OLD_CID);oldreceipt=ops.strict(ops.read_file(ROOT/'production-container-receipt.json',65536,True))
    ops.owned_production(original,oldreceipt,plan,capacity_stopped=True)
    need(not original['running'] and original['pid']==0,'NORMAL_ORIGINAL_CARRIER_NOT_STOPPED')
    ops.production_front(plan);ops.first_host_install_volume(True,plan)
    control=ops.CONTROL
    for path,digest in ((control/'results/t45-first-r3-native-controller-cleanup-20261110-01.json',a['cleanupTerminalSha256']),
                        (control/'jobs/t45-first-r3-native-controller-cleanup-20261110-01/results/cleanup-original-controller-result.json',a['cleanupResultSha256']),
                        (control/'jobs/t45-first-r3-native-facts-close-20261110-01/results/native-closeout.json',a['closeoutResultSha256'])):
        need(sha(ops.read_file(path,65536,False,False))==digest,'NORMAL_PRIOR_CLEAN_CLOSEOUT_DIFFERS')
    terminal_raw=ops.read_file(ACTIVE_CONTROL/'results'/(PREVIOUS_CARRIER_JOB+'.json'),65536,False,False)
    result_raw=ops.read_file(ACTIVE_CONTROL/'jobs'/PREVIOUS_CARRIER_JOB/'results/normal-service-result.json',65536,False,False)
    need(sha(terminal_raw)==a['previousTerminalSha256'] and sha(result_raw)==a['previousResultSha256'],
         'NORMAL05_PREVIOUS_CARRIER_EVIDENCE_DIFFERS')
    proof.validate_terminal(terminal_raw,PREVIOUS_CARRIER_JOB,a['previousTerminalSha256'])
    result=ops.strict(result_raw)
    need(result.get('requestKey')==PREVIOUS_JOB
         and result.get('status')=='NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE'
         and result.get('proofSha256')==a['previousCurrentProofSha256'], 'NORMAL05_ACTUAL_CARRIER_TERMINAL_REQUIRED')
    for path,digest in ((ROOT/'state/native-services'/PREVIOUS_JOB/'cleanup.json',a['previousCleanupSha256']),
                        (ROOT/'authority'/PREVIOUS_PROOF,a['previousCurrentProofSha256']),
                        (control/'results/t45-r3-admin154-cold-copy-20261111-01.json',a['coldCopyTerminalSha256']),
                        (control/'jobs/t45-r3-admin154-cold-copy-20261111-01/results/cold-copy-result.json',a['coldCopyResultSha256']),
                        (ROOT/'state/cold-backups/admin154-before-20261111-01/complete.json',a['coldCopyCompleteSha256'])):
        need(sha(ops.read_file(path,65536,False,False))==digest,'NORMAL_PREVIOUS_SERVICE_OR_COLD_COPY_EVIDENCE_DIFFERS')
    cleanup=ops.strict(ops.read_file(ROOT/'state/native-services'/PREVIOUS_JOB/'cleanup.json',65536,True))
    need(cleanup['requestKey']==PREVIOUS_JOB and cleanup['cleanup']['cleanupComplete'] is True
         and cleanup['cleanup']['cleanShutdown'] is True and cleanup['cleanup']['ownedPidAbsent'] is True
         and cleanup['cleanup']['portAbsent'] is True and cleanup['cleanup']['dataPreserved'] is True,
         'NORMAL_PREVIOUS_CLEAN_STOP_REQUIRED')
    copy=ops.strict(ops.read_file(ROOT/'state/cold-backups/admin154-before-20261111-01/complete.json',65536,True))
    need(copy['status']=='VERIFIED_SAME_STOPPED_R3_COLD_COPY_ONLY_NOT_INDEPENDENT_RESTORE'
         and copy['sourceDevice']==66304 and copy['sourceInode']==13502421
         and copy['publicInstallationRecordSha256']==proof.RECORD
         and copy['sourceAndDestinationFilesVerified'] is True and copy['actualWalIncluded'] is True
         and copy['PGStarted'] is False and copy['SQLCalls']==copy['roleChanges']==0,
         'NORMAL_EXACT_PRE_MAINTENANCE_COLD_COPY_REQUIRED')
    previous_raw=ops.read_file(ROOT/'authority'/PREVIOUS_PROOF,65536)
    need(sha(previous_raw)==a['previousCurrentProofSha256'],'NORMAL05_PREVIOUS_PROOF_CHANGED')
    previous_proof=ops.strict(previous_raw)
    need(set(previous_proof)==proof.FIELDS and previous_proof['format']==proof.FORMAT
         and previous_proof['requestKey']==PREVIOUS_JOB
         and set(previous_proof['physical'])==set(proof.PHYSICAL)|{'postmasterStart'}
         and all(previous_proof['physical'][key]==value for key,value in proof.PHYSICAL.items())
         and proof.micros(previous_proof['physical']['postmasterStart'])==proof.micros(proof.PREVIOUS_EPOCH)
         and previous_proof['dataDirectory']==str(WORK/'data') and previous_proof['dataDirectoryIdentity']==proof.DATA
         and previous_proof['sharedPostgresNamespace']['creationOperationId']==PREVIOUS_JOB
         and previous_proof['installationRecordSha256']==proof.RECORD and previous_proof['sourceSetSha256']==proof.SOURCE
         and previous_proof['targetSha256']==proof.TARGET
         and previous_proof['sharedPostgresNamespace']['container']['name']==PREVIOUS_NAME,
         'NORMAL05_EXACT_SERVICE15_PROOF_REQUIRED')
    previous_cid=previous_proof['sharedPostgresNamespace']['container']['id']
    need(re.fullmatch('[a-f0-9]{64}',previous_cid) and previous_cid==result.get('cid'),
         'NORMAL05_EXACT_SERVICE15_CID_REQUIRED')
    stop_key=proof.PREVIOUS_STOP
    stopped_service=proof.validate_previous_stop(ops.read_file(ACTIVE_CONTROL/'results'/(stop_key+'.json'),65536,False,False),
         ops.read_file(ACTIVE_CONTROL/'jobs'/stop_key/'results/normal05-preserve-stop-result.json',65536,False,False),a,previous_cid)
    prior_authority=ops.read_file(ROOT/'state/native-services'/PREVIOUS_JOB/'service-start-authorization.json',65536,True)
    need(sha(prior_authority)==previous_proof['authorizationSha256'],'NORMAL_PREVIOUS_AUTHORITY_DIFFERS')
    prior=ops.strict(prior_authority);previous=carrier_info(ops,previous_cid)
    need(previous['id']==previous_cid and previous['name']=='/'+PREVIOUS_NAME
         and previous['image']==ops.ENV_IMAGE and previous['labels'].get('t45.operation')==PREVIOUS_JOB
         and previous['labels'].get('t45.production-service-expires-at')==str(prior['serviceLeaseExpiresAt']-35000)
         and stopped_service['containerStartedAt']==previous['startedAt'],
         'NORMAL16_ORIGINAL_05_CONTAINER_IDENTITY_REQUIRED')
    need(not previous['running'] and previous['pid']==0
         and previous['startedAt']==previous_proof['sharedPostgresNamespace']['container']['startedAt'],
         'NORMAL_EXACT_PREVIOUS_RETAINED_CONTAINER_STOP_REQUIRED')
    restore_key=a['restoreRequestKey']
    terminal_raw=ops.read_file(ACTIVE_CONTROL/'results'/(restore_key+'.json'),65536,False,False)
    restore_raw=ops.read_file(ACTIVE_CONTROL/'jobs'/restore_key/'results/maintenance-auth-result.json',65536,False,False)
    need(sha(terminal_raw)==a['restoreTerminalSha256'] and sha(restore_raw)==a['restoreResultSha256'],
         'NORMAL05_ORIGINAL_AUTH_RESTORE_RECEIPTS_DIFFER')
    proof.validate_terminal(terminal_raw,restore_key,a['restoreTerminalSha256'])
    restored=ops.strict(restore_raw)
    need(restored['requestKey']==restore_key and restored['phase']=='restore'
         and restored['status']=='FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'
         and restored['result']['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
         and restored['result'].get('databaseStillStopped') is True
         and restored['cleanup']['ownContainerStopped'] is True and restored['cleanup']['ownedPidAbsent'] is True,
         'NORMAL05_EXACT_ORIGINAL_AUTH_RESTORATION_REQUIRED')
    apply_key=a['applyRequestKey']
    apply_terminal=ops.read_file(ACTIVE_CONTROL/'results'/(apply_key+'.json'),65536,False,False)
    apply_raw=ops.read_file(ACTIVE_CONTROL/'jobs'/apply_key/'results/maintenance-auth-result.json',65536,False,False)
    proof.validate_terminal(apply_terminal,apply_key,a['applyTerminalSha256'])
    need(sha(apply_raw)==a['applyResultSha256'],'NORMAL16_EXACT_ROLE_APPLY_BYTES_REQUIRED')
    applied=ops.strict(apply_raw)
    finite=applied['result']
    deadlines=finite['credentialValidUntilByRole']
    need(applied['requestKey']==apply_key and applied['phase']=='apply'
         and applied['status']=='FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'
         and finite['status']=='EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK'
         and finite['runtimeAuthChanged'] is False and finite['membershipsOrRoleAttributesChanged'] is False
         and set(deadlines)=={'erp35_controller_20261110_r3','erp35_admin_20261110_r3'}
         and all(type(t) is int and a['expiresAt']<t<=lease for t in deadlines.values())
         and applied['cleanup']['ownContainerStopped'] is True and applied['cleanup']['ownedPidAbsent'] is True,
         'NORMAL16_EXACT_STOPPED_ROLE_APPLY_REQUIRED')
    authority=ROOT/'authority'
    lineage=protected_lineage(ops,proof,authority,a)
    validate_current_phase_results(ops,proof,a,ops.strict(lineage[1]))
    work=ROOT/'state'/WORK.name;record=ops.read_file(ROOT/'authority/fresh35-combined-installation-v1.json',1048576)
    need(sha(record)==proof.RECORD and identity(work/'data')==proof.DATA and not os.path.lexists(work/'data/postmaster.pid'),'NORMAL_ORIGINAL_HOST_DATA_DIFFERS')
    need(not ops.run(['docker','ps','-a','--filter','name=^/'+NAME+'$','--format','{{.ID}}'],seconds=5).strip(),'NORMAL_SERVICE_NAME_PRESENT_NO_REPLAY')
    need(start_work_left(deadline,a['expiresAt'])>30,'NORMAL05_INSUFFICIENT_START_WORK_BUDGET')
    parent=ROOT/'state/native-services'
    if not os.path.lexists(parent):parent.mkdir(mode=0o700)
    need(identity(parent)['uid']==0 and identity(parent)['mode']==0o700,'NORMAL_PRIVATE_PARENT_REQUIRED')
    boot=ROOT/'state'/REL;need(not os.path.lexists(boot),'NORMAL_OPERATION_PRESENT_NO_REPLAY');boot.mkdir(mode=0o700)
    lifecycle['phase']='STAGE_PRIVATE_SOURCES'
    for name,pin in (('normal_service05_after08.py',a['normalServiceSha256']),('normal_service05_after08_proof.py',a['proofSourceSha256']),('fresh35-production-carrier.py',OPS_SHA),('r3_05_readonly.py',READONLY_SHA),('operator-host.mjs','7c88c0fae43c544959b2834f81dfe32fec2b99fbedd9c1533494c68e109245ae'),('operator-stream-program.mjs','fa0ca2e0e41fe83925155406959d683458671d647caf475ce6ebf0b9761c87f6'),('operator-stream-import-cli.mjs','6836bb2aadbfcd81621e0a49143ff5a44b26c9a913c8b12b4925296037113e5e'),('operator-manifest.json','c4795906bdfab154e5cd66305a3e9ec698cd1a0b23e3a896258b396540a42184'),('batched161-run.mjs','ebe67655c91d5cbc1cd9196192bde3c7ed0b3541113c66ac87ed127a06a2112f'),('start_owned_describe.py','98a87b0394acd192e0d8e719d1be8e733edcc055010e1da883ea15fed38ee2d0')):
        raw=ops.read_file(WORKER/'bundle'/name,262144,True);need(sha(raw)==pin,'NORMAL_NEW_PRIVATE_SOURCE_DIFFERS');ops.new_file(boot/name,raw,0o400)
    ops.new_file(boot/'service-start-authorization.json',authraw,0o400)
    lifecycle['phase']='STAGE_READONLY_PROJECTIONS'
    original_material_paths(ops,proof,host=True)
    readonly=readonly_module(ops,boot)
    readonly.validate_operation(ops)
    readonly.stage(ops,boot,a)
    ops.new_json(boot/'readonly-mount-plan.json',readonly.host_mount_evidence(ops,a))
    lifecycle['phase']='PREPARE_R3_MOUNTS'
    r3,mounts=prepare_r3_mounts(ops,boot)
    outer=a['serviceLeaseExpiresAt']
    plan={**plan,'operationId':JOB,'r3ReadonlyMounts':mounts,'r3OuterExpiresAt':outer};cid=None;ack=False;attempted=False;handed_off=False
    try:
        remaining=(outer-now())//1000
        args=ops.production_common(ops.ENV_IMAGE,remaining,plan,{'serviceLease':{'expiresAt':lease}},name=NAME,service_expires_at=lease)
        args=r3.add_mounts_before_original_capacity(args,mounts,ops.mount)
        args=readonly.replace_args(ops,args)
        entry=args.index('--entrypoint')
        need(args[entry+1:]==['/usr/bin/timeout',ops.ENV_IMAGE,'--signal=TERM','--kill-after=3s',str(remaining),'/usr/bin/sleep','infinity'],
             'NORMAL05_R3_ORIGINAL_CONTAINER_COMMAND_DIFFERS')
        args[entry+1:]=['/usr/bin/python3',ops.ENV_IMAGE,*container_deadline_args(outer)]
        need(start_work_left(deadline,a['expiresAt'])>25,'NORMAL05_INSUFFICIENT_START_WORK_BUDGET')
        ops.new_json(WORKER/'results/normal-service-create-attempt.json',
                     {'requestKey':JOB,'authoritySha256':sha(authraw),'attemptOnce':True})
        attempted=True;lifecycle.update(createAttempted=True,phase='CONTAINER_CREATE')
        observed=ops.run(args,seconds=10).decode().strip()
        need(re.fullmatch('[a-f0-9]{64}',observed),'NORMAL_ACTUAL_CID_REQUIRED');cid=observed
        birth=carrier(ops,cid,plan,lease);ops.new_json(boot/'carrier-birth.json',birth)
        ops.new_json(WORKER/'results/normal-service-intent.json',{'requestKey':JOB,'cid':cid,'authoritySha256':sha(authraw),'attemptOnce':True})
        ops.run(['docker','exec','--detach','--user','0:0',cid,'/usr/bin/python3','-I','-S',str(BOOT/'normal_service05_after08.py'),'--inside'],seconds=10)
        r=None
        while start_work_left(deadline,a['expiresAt'])>5:
            ops.first_host_install_volume(False,{**plan,'operationId':ops.FIRST_OPERATION})
            need(carrier(ops,cid,plan,lease)==birth,'NORMAL_CONTAINER_BIRTH_CHANGED')
            if os.path.lexists(boot/'early-failure.json'):
                stage=ops.strict(ops.read_file(boot/'early-failure.json',65536,True));ops.new_json(WORKER/'results/normal-native-stage.json',stage)
                need(False,'NORMAL_GUARDIAN_EARLY_FAILURE')
            if os.path.lexists(boot/'cleanup.json'):
                stage=ops.strict(ops.read_file(boot/'cleanup.json',65536,True));ops.new_json(WORKER/'results/normal-native-stage.json',
                    {k:stage.get(k) for k in ('requestKey','phase','reason','qExitCode','sqlstate','errorCategory','queryStages','previousRuntimeOutcome')})
                need(False,'NORMAL_GUARDIAN_CLOSED_BEFORE_RETAIN')
            if os.path.lexists(boot/'service-retained.json'):
                r=ops.read_file(boot/'service-retained.json',65536,True);break
            time.sleep(.2)
        need(r is not None and start_work_left(deadline,a['expiresAt'])>5,'NORMAL_START_OPERATION_EXPIRED_OUTCOME_UNKNOWN')
        raw=proof.build(record,authraw,r,now(),*lineage);need(ops.strict(r)['container']==birth,'NORMAL_RETAINED_CARRIER_DIFFERS')
        need(sha(ops.read_file(ROOT/'authority/fresh35-combined-installation-v1.json',1048576))==proof.RECORD,'NORMAL_RECORD_CHANGED')
        need(protected_lineage(ops,proof,authority,a)==lineage,'NORMAL_POST38_RECORD_CHANGED_BEFORE_PUBLISH')
        publish_worker_proof(ops,r3,raw,deadline,a['expiresAt'],cid,plan,lease,birth)
        ack=await_retained_ack(ops,boot,deadline,a['expiresAt'],cid,plan,lease,birth,sha(raw))
        need(ack,'NORMAL_RETAINED_ACK_UNCONFIRMED')
        describe_path=boot/'start_owned_describe.py'
        describe=module(pinned(ops,describe_path,'98a87b0394acd192e0d8e719d1be8e733edcc055010e1da883ea15fed38ee2d0'),describe_path,'start_owned_describe')
        service={'serviceKey':JOB,'proofSha256':sha(raw),'containerId':birth['id'],
                 'containerStartedAt':birth['startedAt'],'postmasterStart':ops.strict(raw)['physical']['postmasterStart']}
        lifecycle['phase']='GENUINE_READONLY_DESCRIBE'
        described=describe.run(ops,boot,WORKER,service,raw,deadlines['erp35_admin_20261110_r3'],deadline,a['expiresAt'],start_work_left)
        need(carrier(ops,cid,plan,lease)==birth and ops.read_file(ROOT/'authority'/PROOF_NAME,65536)==raw
             and ops.strict(ops.read_file(boot/'retained-ack.json',65536,True))=={'requestKey':JOB,'proofSha256':sha(raw),'serviceLeaseExpiresAt':lease},
             'NORMAL_DESCRIBE_FINAL_C_ACK_OR_BIRTH_CHANGED')
        need(start_work_left(deadline,a['expiresAt'])>5,'NORMAL_DESCRIBE_HANDOFF_BUDGET_EXHAUSTED')
        result={'describe':described,'status':'NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE','requestKey':JOB,'cid':cid,
                'proofSha256':sha(raw),'serviceReceiptSha256':sha(r),'installationRecordSha256':proof.RECORD,'targetSha256':proof.TARGET,
                'sourceSetSha256':proof.SOURCE,'record38Sha256':a['record38Sha256'],'runtimeRole':ROLE,'runtimeLoginValidUntil':None,'serviceLeaseExpiresAt':lease,
                'currentRuntimeReferenceUsable':True,'databaseRoleChanges':0,'lockCapacitySettingsSha256':sha(ops.read_file(boot/'lock-capacity-settings.json',65536,True)),'lockCapacitySettings':ops.strict(ops.read_file(boot/'lock-capacity-settings.json',65536,True)),'queryStages':ops.strict(ops.read_file(boot/'runtime-role-observation.json',65536,True))['queryStages'],'originalRuntimeRequestKey':ORIGINAL_REQUEST,'previousRuntimeOutcome':'UNKNOWN_PRESERVED','readOnlyReadiness':True,'sqlstate':None,'appStarted':False,'businessWrites':0,'automaticRetry':False}
        ops.new_json(WORKER/'results/normal-service-result.json',result)
        need(start_work_left(deadline,a['expiresAt'])>0,'NORMAL_DESCRIBE_PERSISTENCE_BUDGET_EXHAUSTED')
        handed_off=True
        return result
    finally:
        # On error the five-minute preparation guard stops its own PG. Do not
        # kill an unknown process or delete the only retained runtime material.
        if attempted and not handed_off:
            record_start_cleanup(ops,proof,cid,plan,lease,boot,ack)


def observe_precontainer_absence(ops,proof):
    """Observe fixed resources only; this is not a claim to have stopped a container."""
    boot=ROOT/'state'/REL
    for selector in ('name=^/'+NAME+'$','label=t45.operation='+JOB):
        need(not ops.run(['docker','ps','-a','--no-trunc','--filter',selector,
                          '--format','{{.ID}}'],seconds=5).strip(),
             'NORMAL_PRECONTAINER_OWNED_CONTAINER_PRESENT')
    data=ROOT/'state'/WORK.name/'data'
    need(identity(data)==proof.DATA and not os.path.lexists(data/'postmaster.pid'),
         'NORMAL_PRECONTAINER_DATA_OR_PID_DIFFERS')
    need(not ops.run(['/usr/bin/ss','-H','-ltn','sport = :56791'],seconds=5).strip(),
         'NORMAL_PRECONTAINER_LISTENER_PRESENT')
    leaves=[WORKER/'results/normal-service-create-attempt.json',
            WORKER/'results/normal-service-intent.json',ROOT/'authority'/PROOF_NAME]
    leaves += [boot/name for name in ('carrier-birth.json','guardian-process.json',
               'retained-ack.json','service-retained.json','cleanup.json','failed-start-cleanup.json')]
    need(not any(os.path.lexists(p) for p in leaves),'NORMAL_PRECONTAINER_LIFECYCLE_PRESENT')
    return {'checkedAt':now(),'ownedContainerAbsent':True,'postmasterPidAbsent':True,
            'listenerAbsent':True,'lifecycleOutputsAbsent':True,'dataDirectoryIdentity':proof.DATA}


def record_precontainer_failure(ops,proof,a,authraw,lifecycle):
    result={'format':'T45_R3_PRECONTAINER_FAILURE_V1','requestKey':JOB,
            'state':'PRE_CONTAINER_FAILURE_OBSERVATION_UNKNOWN','phase':lifecycle['phase'],
            'createAttempted':False,'cid':None,'confirmed':False,'originalKeyOnly':True,
            'runtimeMaterialPreserved':True,'automaticRetry':False}
    try:
        need(lifecycle['createAttempted'] is False,'NORMAL_CREATE_ALREADY_ATTEMPTED')
        manifest=ops.read_file(WORKER/'manifest.json',65536,True)
        request=ops.read_file(WORKER/'request.json',65536,True)
        q=ops.strict(request)
        need((q['jobId'],q['taskId'],q['grantId'],q['script'],q['args'])==
             (JOB,'T45','b16447fbc81f4d64','normal_service05_after08.py',[sha(authraw)]),
             'NORMAL_PRECONTAINER_REQUEST_DIFFERS')
        result['binding']={'rootManifestSha256':sha(manifest),'rootRequestSha256':sha(request),
                           'authoritySha256':sha(authraw),'normalServiceSha256':a['normalServiceSha256'],
                           'proofSourceSha256':a['proofSourceSha256']}
        result['observation']=observe_precontainer_absence(ops,proof)
        result.update(state='PRE_CONTAINER_FAILURE_RESOURCES_ABSENT',confirmed=True)
    except Exception as error:
        result['safeCode']=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__
    ops.new_json(WORKER/'results/normal-service-incomplete.json',result)


def failed_start_publication(ops,proof,boot,cid):
    """Verify any published C/ACK as historical bytes; no assertion of a live service."""
    current=ROOT/'authority'/PROOF_NAME;ackpath=boot/'retained-ack.json'
    facts={'currentProofPresent':os.path.lexists(current),'retainedAckPresent':os.path.lexists(ackpath),
           'retainedAckValidated':False}
    if not facts['currentProofPresent']:
        need(not facts['retainedAckPresent'],'NORMAL_FAILED_START_ACK_WITHOUT_PROOF')
        return facts
    raw=ops.read_file(current,65536);p=ops.strict(raw)
    authraw=ops.read_file(boot/'service-start-authorization.json',65536,True)
    retained=ops.read_file(boot/'service-retained.json',65536,True)
    authority=ROOT/'authority'
    rebuilt=proof.build(ops.read_file(authority/'fresh35-combined-installation-v1.json',1048576),
         authraw,retained,p['checkedAt'],ops.read_file(authority/'fresh35-admin154-successor-v1.json',65536),
         ops.read_file(authority/proof.RECORD38,65536))
    need(raw==rebuilt and p['requestKey']==JOB
         and p['sharedPostgresNamespace']['container']['id']==cid,
         'NORMAL_FAILED_START_PUBLISHED_PROOF_DIFFERS')
    facts['currentProofSha256']=sha(raw)
    if facts['retainedAckPresent']:
        ackraw=ops.read_file(ackpath,65536,True)
        need(ops.strict(ackraw)=={'requestKey':JOB,'proofSha256':sha(raw),
             'serviceLeaseExpiresAt':p['sharedPostgresNamespace']['serviceLeaseExpiresAt']},
             'NORMAL_FAILED_START_PUBLISHED_ACK_DIFFERS')
        facts.update(retainedAckValidated=True,retainedAckSha256=sha(ackraw))
    return facts


def record_start_cleanup(ops,proof,cid,plan,lease,boot,ack):
    cleanup={'requestKey':JOB,'cid':cid,'runtimeMaterialPreserved':True,'originalKeyOnly':True,
             'automaticRetry':False,'confirmed':False,'createAttempted':True,
             'retainedAckObserved':ack,'successfulResultHandoff':False}
    try:
        if cid is None:
            values=ops.run(['docker','ps','-a','--no-trunc','--filter','name=^/'+NAME+'$',
                            '--format','{{.ID}}'],seconds=5).decode().splitlines()
            need(len(values)==1 and re.fullmatch('[a-f0-9]{64}',values[0]),
                 'NORMAL05_CREATE_OUTCOME_UNCONFIRMED')
            cid=values[0]
        cleanup['cid']=cid
        cleanup.update(close_start(ops,cid,plan,lease,boot))
        cleanup.update(failed_start_publication(ops,proof,boot,cid))
    except Exception as error:
        cleanup['confirmed']=False
        cleanup['safeCode']=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__
    ops.new_json(WORKER/'results/normal-service-incomplete.json',cleanup)


def main():
    internal=sys.argv[1:] in (['--inside'],['--close-start-failure']);closing=sys.argv[1:]==['--close-start-failure'];base=BOOT if internal else WORKER/'bundle'
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0 and (not internal or (sys.flags.isolated and sys.flags.no_site)),'NORMAL_ROOT_ISOLATED_ENTRY_REQUIRED')
    need(Path(__file__)==base/'normal_service05_after08.py','NORMAL_FIXED_ENTRY_REQUIRED')
    os.umask(0o077)
    global ENTRY_MONOTONIC
    if not internal:
        ticks=int(Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()[19])
        elapsed=max(0,time.clock_gettime(time.CLOCK_BOOTTIME)-ticks/os.sysconf('SC_CLK_TCK'))
        ENTRY_MONOTONIC=min(ENTRY_MONOTONIC,time.monotonic()-elapsed)
    opraw=(base/'fresh35-production-carrier.py').read_bytes();need(sha(opraw)==OPS_SHA,'NORMAL_ORIGINAL_OPS_SOURCE_DIFFERS');ops=module(opraw,base/'fresh35-production-carrier.py','normal_fixed_ops')
    authpath=BOOT/'service-start-authorization.json' if internal else WORKER/'bundle/service-start-authorization.json'
    authraw=ops.read_file(authpath,65536,True);a=ops.strict(authraw)
    proofraw=ops.read_file(base/'normal_service05_after08_proof.py',65536,True);need(sha(proofraw)==a.get('proofSourceSha256'),'NORMAL_PROOF_SOURCE_DIFFERS')
    proof=module(proofraw,base/'normal_service05_after08_proof.py','normal_fixed_proof');proof.validate_authority(a,a['startsAt'] if closing else now())
    need(sha(ops.read_file(Path(__file__),65536,True))==a['normalServiceSha256'],'NORMAL_SERVICE_SOURCE_DIFFERS')
    if closing:
        print(json.dumps(close_failed_start(ops,proof)));return 0
    if internal:
        try:return inside(ops,proof,a,authraw)
        except Exception as error:
            ops.new_json(BOOT/'early-failure.json',{'requestKey':JOB,'phase':'BEFORE_GUARDIAN_LOOP','safeCode':str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__,'previousRuntimeOutcome':'UNKNOWN_PRESERVED','automaticRetry':False})
            return 2
    need(os.environ.get('ERP_SHARED_TASK_ID')=='T45' and os.environ.get('ERP_SHARED_JOB_DIR')==str(WORKER)
         and len(sys.argv)==2 and sha(authraw)==sys.argv[1],'NORMAL_ORIGINAL_JOB_AND_EXTERNAL_AUTHORITY_REQUIRED')
    lifecycle={'phase':'VALIDATE_PRESERVED_INPUTS','createAttempted':False}
    def interrupted(*_):raise ValueError('NORMAL_START_INTERRUPTED_ORIGINAL_KEY_ONLY')
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,interrupted)
    try:result=host(ops,proof,a,authraw,lifecycle)
    except Exception as e:
        if not lifecycle['createAttempted']:
            record_precontainer_failure(ops,proof,a,authraw,lifecycle)
        result={'status':'NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY','requestKey':JOB,'safeCode':str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]+',str(e)) else type(e).__name__,'automaticRetry':False}
    # Successful persistence is inside host's cleanup protection. A partially
    # written result is evidence, never an overwrite/replay opportunity.
    if result['status']!='NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE' and not os.path.lexists(WORKER/'results/normal-service-result.json'):
        ops.new_json(WORKER/'results/normal-service-result.json',result)
    return 0 if result['status']=='NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE' else 2
if __name__=='__main__':raise SystemExit(main())
