"""Fixed same-R3 read-only normal04. No credential update, initdb or business writer.

New external coordination authority is separate from the five-minute startup and
one-hour maximum service. Retained runtime material is root-only for this guardian;
it is NOT an APP mount or a claim that an unselected APP UID can read it.
"""
import fcntl,hashlib,json,os,re,signal,stat,subprocess,sys,time
from pathlib import Path
from types import ModuleType

JOB='t45-first-r3-native-service-start-20261111-04'
CARRIER_JOB='t45-first-r3-native-service-start-20261111-04-02'
NAME='t45-fresh35-first-production-20261110-r3-service-04'
WORKER=Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/jobs')/CARRIER_JOB
ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
STATE=Path('/var/lib/naijue-erp/fresh35-production')
WORK=STATE/'fresh35-first-production-20261110-r3'
REL=Path('native-services')/JOB
BOOT=STATE/REL
PREVIOUS_JOB='t45-first-r3-native-service-start-20261111-03'
ORIGINAL_REQUEST='t45-first-r3-native-service-start-20261110-01'
ORIGINAL_BOOT=STATE/'native-services'/ORIGINAL_REQUEST
PREVIOUS_CID='686989b5e1f3b1b3109b11454b47fa992665906b4e1456c5b531d14be429a569'
OPS_SHA='40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360'
PLAN_SHA='7a416900f8b3988dc51b118a928c277f252fad1f736928d72003b1f21e0ce17d'
OLD_CID='ae4d582c1d4abddc8794b577412904452ea29b234308aad9b5685af7383d6900'
OLD_PHYSICAL={'systemIdentifier':'7706545564479176741','databaseOid':'16393','serverVersionNum':'170011','postmasterStart':'2026-11-10 14:12:48.798294+00'}
PROOF_NAME='fresh35-current-production-service-v2-service-04.json'
ROLE='erp35_runtime_20261110_r3'
DATABASE='erp_fresh35_20261110_r3'
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
def identity(path):
    s=path.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode),'NORMAL_DIRECTORY_REQUIRED')
    return {'device':s.st_dev,'inode':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode)}
BASIC_SQL="BEGIN READ ONLY; SET LOCAL statement_timeout='2s'; SELECT json_build_object('one',1,'currentUser',current_user,'sessionUser',session_user,'readOnly',current_setting('transaction_read_only'))::text; ROLLBACK;"
ROLE_SQL="BEGIN READ ONLY; SET LOCAL statement_timeout='2s'; SELECT json_build_object('readOnly',current_setting('transaction_read_only'),'role',(SELECT json_build_object('name',rolname,'canLogin',rolcanlogin,'superuser',rolsuper,'createDb',rolcreatedb,'createRole',rolcreaterole,'inherit',rolinherit,'replication',rolreplication,'bypassRls',rolbypassrls,'connectionLimit',rolconnlimit,'validUntil',rolvaliduntil::text) FROM pg_catalog.pg_roles WHERE rolname=session_user),'membershipCount',(SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname=session_user),'memberships',(SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT g.rolname AS role,m.admin_option,m.inherit_option,m.set_option FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member JOIN pg_catalog.pg_roles g ON g.oid=m.roleid WHERE r.rolname=session_user ORDER BY g.rolname LIMIT 8) x))::text; ROLLBACK;"
PRIVILEGES_SQL="BEGIN READ ONLY; SET LOCAL statement_timeout='2s'; SELECT json_build_object('readOnly',current_setting('transaction_read_only'),'controlSystemExecute',has_function_privilege(session_user,'pg_catalog.pg_control_system()','EXECUTE'),'rolesSelect',has_table_privilege(session_user,'pg_catalog.pg_roles','SELECT'),'membersSelect',has_table_privilege(session_user,'pg_catalog.pg_auth_members','SELECT'))::text; ROLLBACK;"
QUERY_PLAN={'BASIC_READ_ONLY':BASIC_SQL,'ROLE_ATTRIBUTES':ROLE_SQL,'PRIVILEGES':PRIVILEGES_SQL,'READINESS':READINESS_SQL}

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

def inside(ops,proof,a,authraw):
    lease=proof.validate_authority(a,now());began=time.monotonic();startup=min(a['expiresAt'],now()+300000)
    lock=os.open(STATE/'native-services/service-operation.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    s=os.fstat(lock);need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o077,'NORMAL_OPERATION_LOCK_REQUIRED')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    old,factory,record=context(ops,proof);core=factory.core
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
        need(time.monotonic()-began<3600 and now()<lease,'NORMAL_FINITE_SERVICE_OR_CAPACITY_EXPIRED')
        if not retained:need(time.monotonic()-began<300 and now()<startup,'NORMAL_FIVE_MINUTE_START_EXPIRED')
    try:
        sample(True);ops.new_json(BOOT/'guardian-process.json',core.process_identity(os.getpid()))
        startup_deadline=time.monotonic()+20
        phase='POSTGRES_START'
        with (BOOT/'server-private.log').open('xb',buffering=0) as log:
            proc=subprocess.Popen(factory.production_server_args(old),stdin=subprocess.DEVNULL,stdout=log,stderr=log,
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
        sample();need(ops.read_file(WORK/'data/pg_hba.conf',65536,True,False)==hba,'NORMAL_ORIGINAL_HBA_CHANGED')
        fields=(Path('/proc')/str(owned['pid'])/'stat').read_text().rsplit(')',1)[1].split()
        need(fields[1]==str(os.getpid()) and core.same_process(owned),'NORMAL_POSTMASTER_GUARDIAN_PARENT_DIFFERS')
        ops.new_json(BOOT/'runtime-role-observation.json',{'requestKey':JOB,'physical':physical,'queryStages':query_stages,'currentRuntimeReferenceUsable':True,'previousRuntimeOutcome':'UNKNOWN_PRESERVED'})
        phase='PUBLISH_RETAINED_SERVICE'
        r={'format':proof.RECEIPT_FORMAT,'state':proof.RECEIPT_STATE,'requestKey':JOB,'authorizationSha256':sha(authraw),'checkedAt':now(),
           'installationRecordSha256':proof.RECORD,'targetSha256':proof.TARGET,'sourceSetSha256':proof.SOURCE,
           'dataDirectory':str(WORK/'data'),'dataDirectoryIdentity':proof.DATA,'physical':physical,'container':birth,
           'postmaster':owned,'guardian':core.process_identity(os.getpid()),'runtimeRole':ROLE,'runtimeLoginValidUntil':None,'serviceLeaseExpiresAt':lease}
        receipt=proof.canonical(r);proof.build(record,authraw,receipt,now());ops.new_file(BOOT/'service-retained.json',receipt);phase='WAIT_PUBLISHED_PROOF'
        while not interrupted:
            sample();need(proc.poll() is None and core.same_process(owned),'NORMAL_POSTMASTER_LOST')
            if not retained and os.path.lexists(Path('/etc/naijue-erp')/PROOF_NAME):
                current=ops.read_file(Path('/etc/naijue-erp')/PROOF_NAME,65536)
                need(current==proof.build(record,authraw,receipt,now()),'NORMAL_PUBLISHED_PROOF_DIFFERS')
                retained=True;phase='SERVICE_RETAINED';ops.new_json(BOOT/'retained-ack.json',{'requestKey':JOB,'proofSha256':sha(current),'serviceLeaseExpiresAt':lease})
            time.sleep(.1)
        stop_reason='EXACT_GUARDIAN_STOP_REQUESTED'
    except Exception as error:
        stop_reason=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__
    finally:
        cleanup=factory.stop_owned(old,proc,owned,previous,time.monotonic()+25)
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
            need(process.stat().st_uid==0 and argv[-2:]==[str(BOOT/'normal_service04.py'),'--inside'] and live(),
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
    return {'status':'NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED','requestKey':JOB,'originalPGDATAAndCleanStateVerified':True,'runtimeMaterialPreserved':True}

def carrier(ops,cid,plan,lease):
    info=ops.production_info(cid);ops.owned_production(info,{'cid':cid,'image':ops.ENV_IMAGE,'expiresAt':lease},plan,name=NAME)
    need(info['running'] and info['pid']>1,'NORMAL_CONTAINER_NOT_LIVE')
    endpoint=info['networks'][plan['productionCarrier']['front']['name']]
    return {'id':cid,'name':NAME,'imageId':info['image'],'startedAt':info['startedAt'],'hostPid':info['pid'],
            **ops.production_process_namespace(info['pid']),'frontEndpoint':{'id':endpoint['EndpointID'],'aliases':endpoint.get('Aliases') or []}}

def host(ops,proof,a,authraw):
    lease=proof.validate_authority(a,now());start=time.monotonic();need(now()+300000<a['expiresAt'],'NORMAL_COORDINATION_BUDGET_TOO_SHORT')
    plan=ops.load_production_plan(str(WORKER/'bundle/production-plan.json'),PLAN_SHA);ops.materialized_root_identity(plan)
    original=ops.production_info(OLD_CID);oldreceipt=ops.strict(ops.read_file(ROOT/'production-container-receipt.json',65536,True))
    ops.owned_production(original,oldreceipt,plan,capacity_stopped=True)
    need(not original['running'] and original['pid']==0,'NORMAL_ORIGINAL_CARRIER_NOT_STOPPED')
    ops.production_front(plan);ops.first_host_install_volume(True,plan)
    control=ops.CONTROL
    for path,digest in ((control/'results/t45-first-r3-native-controller-cleanup-20261110-01.json',a['cleanupTerminalSha256']),
                        (control/'jobs/t45-first-r3-native-controller-cleanup-20261110-01/results/cleanup-original-controller-result.json',a['cleanupResultSha256']),
                        (control/'jobs/t45-first-r3-native-facts-close-20261110-01/results/native-closeout.json',a['closeoutResultSha256'])):
        need(sha(ops.read_file(path,65536,False,False))==digest,'NORMAL_PRIOR_CLEAN_CLOSEOUT_DIFFERS')
    for path,digest in ((control/'results'/(PREVIOUS_JOB+'.json'),a['previousTerminalSha256']),
                        (control/'jobs'/PREVIOUS_JOB/'results/normal-service-result.json',a['previousResultSha256']),
                        (ROOT/'state/native-services'/PREVIOUS_JOB/'cleanup.json',a['previousCleanupSha256']),
                        (ROOT/'authority/fresh35-current-production-service-v2-service-03.json',a['previousCurrentProofSha256']),
                        (control/'results/t45-r3-admin154-cold-copy-20261111-01.json',a['coldCopyTerminalSha256']),
                        (control/'jobs/t45-r3-admin154-cold-copy-20261111-01/results/cold-copy-result.json',a['coldCopyResultSha256']),
                        (ROOT/'state/cold-backups/admin154-before-20261111-01/complete.json',a['coldCopyCompleteSha256'])):
        need(sha(ops.read_file(path,65536,False,False))==digest,'NORMAL_PREVIOUS_SERVICE_OR_COLD_COPY_EVIDENCE_DIFFERS')
    cleanup=ops.strict(ops.read_file(ROOT/'state/native-services'/PREVIOUS_JOB/'cleanup.json',65536,True))
    need(cleanup['requestKey']==PREVIOUS_JOB and cleanup['cleanup']['cleanupComplete'] is True
         and cleanup['cleanup']['cleanShutdown'] is True and cleanup['cleanup']['ownedPidAbsent'] is True
         and cleanup['cleanup']['portAbsent'] is True,'NORMAL_PREVIOUS_CLEAN_STOP_REQUIRED')
    copy=ops.strict(ops.read_file(ROOT/'state/cold-backups/admin154-before-20261111-01/complete.json',65536,True))
    need(copy['status']=='VERIFIED_SAME_STOPPED_R3_COLD_COPY_ONLY_NOT_INDEPENDENT_RESTORE'
         and copy['sourceDevice']==66304 and copy['sourceInode']==13502421
         and copy['publicInstallationRecordSha256']==proof.RECORD
         and copy['sourceAndDestinationFilesVerified'] is True and copy['actualWalIncluded'] is True
         and copy['PGStarted'] is False and copy['SQLCalls']==copy['roleChanges']==0,
         'NORMAL_EXACT_PRE_MAINTENANCE_COLD_COPY_REQUIRED')
    prior_authority=ops.read_file(ROOT/'state/native-services'/PREVIOUS_JOB/'service-start-authorization.json',65536,True)
    need(sha(prior_authority)=='55f3e0d51cd138db6543768211f096f4b009a11b8eaf98b62700c7c66ac3410b','NORMAL_PREVIOUS_AUTHORITY_DIFFERS')
    prior=ops.strict(prior_authority);previous=ops.production_info(PREVIOUS_CID)
    ops.owned_production(previous,{'cid':PREVIOUS_CID,'image':ops.ENV_IMAGE,'expiresAt':min(prior['serviceLeaseExpiresAt'],prior['capacityExpiresAt'])},
                         {**plan,'operationId':PREVIOUS_JOB},capacity_stopped=True,name='t45-fresh35-first-production-20261110-r3-service-03')
    need(not previous['running'] and previous['pid']==0,'NORMAL_PREVIOUS_RETAINED_CONTAINER_NOT_STOPPED')
    work=ROOT/'state'/WORK.name;record=ops.read_file(ROOT/'authority/fresh35-combined-installation-v1.json',1048576)
    need(sha(record)==proof.RECORD and identity(work/'data')==proof.DATA and not os.path.lexists(work/'data/postmaster.pid'),'NORMAL_ORIGINAL_HOST_DATA_DIFFERS')
    need(not ops.run(['docker','ps','-a','--filter','name=^/'+NAME+'$','--format','{{.ID}}'],seconds=5).strip(),'NORMAL_SERVICE_NAME_PRESENT_NO_REPLAY')
    parent=ROOT/'state/native-services'
    if not os.path.lexists(parent):parent.mkdir(mode=0o700)
    need(identity(parent)['uid']==0 and identity(parent)['mode']==0o700,'NORMAL_PRIVATE_PARENT_REQUIRED')
    boot=ROOT/'state'/REL;need(not os.path.lexists(boot),'NORMAL_OPERATION_PRESENT_NO_REPLAY');boot.mkdir(mode=0o700)
    for name,pin in (('normal_service04.py',a['normalServiceSha256']),('normal_service04_proof.py',a['proofSourceSha256']),('fresh35-production-carrier.py',OPS_SHA)):
        raw=ops.read_file(WORKER/'bundle'/name,262144,True);need(sha(raw)==pin,'NORMAL_NEW_PRIVATE_SOURCE_DIFFERS');ops.new_file(boot/name,raw,0o400)
    ops.new_file(boot/'service-start-authorization.json',authraw,0o400)
    original_material_paths(ops,proof,host=True)
    plan={**plan,'operationId':JOB};cid=None;ack=False
    try:
        remaining=max(1,(lease-now())//1000)+35
        args=ops.production_common(ops.ENV_IMAGE,remaining,plan,{'serviceLease':{'expiresAt':lease}},name=NAME,service_expires_at=lease)
        cid=ops.run(args,seconds=10).decode().strip();need(re.fullmatch('[a-f0-9]{64}',cid),'NORMAL_ACTUAL_CID_REQUIRED')
        birth=carrier(ops,cid,plan,lease);ops.new_json(boot/'carrier-birth.json',birth)
        ops.new_json(WORKER/'results/normal-service-intent.json',{'requestKey':JOB,'cid':cid,'authoritySha256':sha(authraw),'attemptOnce':True})
        ops.run(['docker','exec','--detach','--user','0:0',cid,'/usr/bin/python3','-I','-S',str(BOOT/'normal_service04.py'),'--inside'],seconds=10)
        r=None
        while time.monotonic()-start<300 and now()<a['expiresAt']:
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
        need(r is not None,'NORMAL_START_OPERATION_EXPIRED_OUTCOME_UNKNOWN')
        raw=proof.build(record,authraw,r,now());need(ops.strict(r)['container']==birth,'NORMAL_RETAINED_CARRIER_DIFFERS')
        need(sha(ops.read_file(ROOT/'authority/fresh35-combined-installation-v1.json',1048576))==proof.RECORD,'NORMAL_RECORD_CHANGED')
        ops.new_file(ROOT/'authority'/PROOF_NAME,raw,0o444)
        while time.monotonic()-start<300 and now()<a['expiresAt']:
            if os.path.lexists(boot/'retained-ack.json'):
                v=ops.strict(ops.read_file(boot/'retained-ack.json',65536,True));need(v=={'requestKey':JOB,'proofSha256':sha(raw),'serviceLeaseExpiresAt':lease},'NORMAL_RETAINED_ACK_DIFFERS');ack=True;break
            if os.path.lexists(boot/'cleanup.json'):break
            time.sleep(.1)
        need(ack and carrier(ops,cid,plan,lease)==birth,'NORMAL_RETAINED_ACK_UNCONFIRMED')
        return {'status':'NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE','requestKey':JOB,'carrierRequestKey':CARRIER_JOB,'cid':cid,
                'proofSha256':sha(raw),'serviceReceiptSha256':sha(r),'installationRecordSha256':proof.RECORD,'targetSha256':proof.TARGET,
                'sourceSetSha256':proof.SOURCE,'runtimeRole':ROLE,'runtimeLoginValidUntil':None,'serviceLeaseExpiresAt':lease,
                'currentRuntimeReferenceUsable':True,'databaseRoleChanges':0,'queryStages':ops.strict(ops.read_file(boot/'runtime-role-observation.json',65536,True))['queryStages'],'originalRuntimeRequestKey':ORIGINAL_REQUEST,'previousRuntimeOutcome':'UNKNOWN_PRESERVED','readOnlyReadiness':True,'sqlstate':None,'appStarted':False,'businessWrites':0,'automaticRetry':False}
    finally:
        # On error the five-minute preparation guard stops its own PG. Do not
        # kill an unknown process or delete the only retained runtime material.
        if cid and not ack:
            cleanup={'requestKey':JOB,'cid':cid,'runtimeMaterialPreserved':True,'originalKeyOnly':True,'automaticRetry':False,'confirmed':False}
            try:
                carrier(ops,cid,plan,lease)
                closed=ops.strict(ops.run(['docker','exec','--user','0:0',cid,'/usr/bin/python3','-I','-S',str(BOOT/'normal_service04.py'),'--close-start-failure'],seconds=65))
                need(closed.get('status')=='NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED','NORMAL_FAILED_START_CLEANUP_UNCONFIRMED')
                carrier(ops,cid,plan,lease)
                ops.run(['docker','stop','--time','5',cid],seconds=10)
                final=ops.production_info(cid);ops.owned_production(final,{'cid':cid,'image':ops.ENV_IMAGE,'expiresAt':lease},plan,capacity_stopped=True,name=NAME)
                need(not final['running'] and final['pid']==0,'NORMAL_FAILED_START_CONTAINER_STOP_UNCONFIRMED')
                cleanup.update(confirmed=True,containerStopped=True,cleanStop=closed)
            except Exception as error:
                cleanup['safeCode']=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__
            ops.new_json(WORKER/'results/normal-service-incomplete.json',cleanup)

def main():
    internal=sys.argv[1:] in (['--inside'],['--close-start-failure']);closing=sys.argv[1:]==['--close-start-failure'];base=BOOT if internal else WORKER/'bundle'
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0 and (not internal or (sys.flags.isolated and sys.flags.no_site)),'NORMAL_ROOT_ISOLATED_ENTRY_REQUIRED')
    need(Path(__file__)==base/'normal_service04.py','NORMAL_FIXED_ENTRY_REQUIRED')
    os.umask(0o077)
    opraw=(base/'fresh35-production-carrier.py').read_bytes();need(sha(opraw)==OPS_SHA,'NORMAL_ORIGINAL_OPS_SOURCE_DIFFERS');ops=module(opraw,base/'fresh35-production-carrier.py','normal_fixed_ops')
    authpath=BOOT/'service-start-authorization.json' if internal else WORKER/'bundle/service-start-authorization.json'
    authraw=ops.read_file(authpath,65536,True);a=ops.strict(authraw)
    proofraw=ops.read_file(base/'normal_service04_proof.py',65536,True);need(sha(proofraw)==a.get('proofSourceSha256'),'NORMAL_PROOF_SOURCE_DIFFERS')
    proof=module(proofraw,base/'normal_service04_proof.py','normal_fixed_proof');proof.validate_authority(a,a['startsAt'] if closing else now())
    need(sha(ops.read_file(Path(__file__),65536,True))==a['normalServiceSha256'],'NORMAL_SERVICE_SOURCE_DIFFERS')
    if closing:
        print(json.dumps(close_failed_start(ops,proof)));return 0
    if internal:
        try:return inside(ops,proof,a,authraw)
        except Exception as error:
            ops.new_json(BOOT/'early-failure.json',{'requestKey':JOB,'phase':'BEFORE_GUARDIAN_LOOP','safeCode':str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__,'previousRuntimeOutcome':'UNKNOWN_PRESERVED','automaticRetry':False})
            return 2
    need(a['carrierRequestKey']==CARRIER_JOB and os.environ.get('ERP_SHARED_TASK_ID')=='T45' and os.environ.get('ERP_SHARED_JOB_DIR')==str(WORKER)
         and len(sys.argv)==2 and sha(authraw)==sys.argv[1],'NORMAL_ORIGINAL_JOB_AND_EXTERNAL_AUTHORITY_REQUIRED')
    try:result=host(ops,proof,a,authraw)
    except Exception as e:result={'status':'NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY','requestKey':JOB,'carrierRequestKey':CARRIER_JOB,'safeCode':str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]+',str(e)) else type(e).__name__,'automaticRetry':False}
    ops.new_json(WORKER/'results/normal-service-result.json',result)
    return 0 if result['status']=='NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE' else 2
if __name__=='__main__':raise SystemExit(main())
