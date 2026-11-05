#!/usr/bin/python3
"""Linux-only trusted deployment controller. Source review is NOT run permission.
Invoke the fixed deployed file with OS-trusted Python -I -S. No permission repair,
OS account creation, authorization-file creation, old-cluster access or retry.
The external authority files are inputs; this controller cannot issue them.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone

DEPLOY = Path('/opt/naijue-erp/fresh35-combined-v1')
ETC = Path('/etc/naijue-erp')
PARENT = Path('/var/lib/naijue-erp/fresh35-isolated')
SELF = DEPLOY / 'scripts/release/unified-install/launch-fresh35-isolated-v1.py'
ENTRY = DEPLOY / 'scripts/release/unified-install/fresh35-isolated-entry-v1.mjs'
NODE = DEPLOY / 'runtime/node/bin/node'
BIN = DEPLOY / 'runtime/pg/usr/lib/postgresql/17/bin'
SHARE = DEPLOY / 'runtime/pg/usr/share/postgresql/17'
AUTH = ETC / 'fresh35-isolated-provision-v1.json'
MANIFEST = ETC / 'fresh35-isolated-deployment-v1.json'
INSTALL_AUTH = ETC / 'fresh35-combined-execution-v1.json'
INTERFACES = ('erp_unified27_initializer_2393dbc6db9581c2', 'erp_unified27_importer_2393dbc6db9581c2', 'erp_unified27_runtime_2393dbc6db9581c2')
TOOL_PINS = {'postgres':'5fa5f4cb92953e720a6814653888183abd7988d31a505125dec3a12bd51f29be','initdb':'120d1e6044d50b74e4325c751b1ecbf87c7e84c60b24e38b790b011761cb7847','psql':'292a3063f4712a759ec558e2f7f050b3f8a64d83d04404c9521202c299b5830a','pg_controldata':'9433d00692ced76322993d8ff831c091e1910ae94ff0f9150a170c86777be670'}
NODE_SHA = '7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c'

def need(value, code):
    if not value:
        raise RuntimeError('FRESH35_ISOLATED_' + code)

def digest(path):
    with Path(path).open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()

def strict_json(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            need(key not in out, 'DUPLICATE_JSON_KEY')
            out[key] = value
        return out
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False, 'NONFINITE_JSON'))

def trusted(path, tree=False):
    path = Path(path)
    need(path.is_absolute() and str(path) == os.path.normpath(path), 'CANONICAL_PATH')
    for current in [Path('/')] + list(reversed(path.parents))[1:] + [path]:
        info = current.lstat()
        need(info.st_uid == 0 and not info.st_mode & 0o022 and not stat.S_ISLNK(info.st_mode) and (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)), 'ROOT_TRUST_REQUIRED')
        # Any POSIX extended/default ACL is an unreviewed permission contract.
        need(not any(k.startswith('system.posix_acl_') for k in os.listxattr(current, follow_symlinks=False)), 'EXTENDED_ACL_NOT_REVIEWED')
    if tree and path.is_dir():
        for child in path.iterdir():
            trusted(child, True)

def read_private(path):
    trusted(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and info.st_mode & 0o077 == 0 and 0 < info.st_size <= 4*1024*1024, 'PRIVATE_AUTHORITY_INPUT')
        return os.read(fd, info.st_size + 1)
    finally:
        os.close(fd)

def exact_keys(value, names):
    need(type(value) is dict and set(value) == set(names), 'CLOSED_INPUT')

def validate_authorization(a, now_ms):
    exact_keys(a, ['format','decision','deploymentManifestSha256','sourceSetSha256','proposal','postgresUid','postgresGid','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'])
    need(a['format'] == 'FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1' and a['decision'] == 'AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_CONTROLLER_HOST', 'PROVISION_AUTHORITY_REQUIRED')
    for key in ['deploymentManifestSha256','sourceSetSha256','independentSafetyReviewSha256']:
        need(type(a[key]) is str and re.fullmatch('[a-f0-9]{64}', a[key]), 'AUTHORITY_HASH')
    need(type(a['authorizationReference']) is str and 0 < len(a['authorizationReference']) <= 512, 'AUTHORITY_REFERENCE')
    for key in ['postgresUid','postgresGid']:
        need(type(a[key]) is int and 0 < a[key] < 2**31, 'DEDICATED_NONROOT_POSTGRES_ACCOUNT')
    need(all(type(a[k]) is int for k in ['startsAt','expiresAt']) and a['startsAt'] <= now_ms < a['expiresAt'] - 90000 and 0 < a['expiresAt'] - a['startsAt'] <= 1200000, 'ORIGINAL_WINDOW')
    p = a['proposal']
    exact_keys(p, ['database','owner','controller','runtime','admin','host','port','workspaceDirectory'])
    m = re.fullmatch(r'synthetic_fresh35_([0-9]{8})_(r[1-9][0-9]{0,3})', p['database'])
    need(m is not None, 'NEW_DATABASE_NAME')
    for role in ['owner','controller','runtime','admin']:
        need(p[role] == 'fresh35_' + role + '_' + m[1] + '_' + m[2], 'EXACT_ROLE_NAMES')
    need(p['host'] == '127.0.0.1' and type(p['port']) is int and 1024 < p['port'] < 65536 and p['port'] not in [5432,55437,55438,55439,57628], 'NEW_LOOPBACK_ENDPOINT')
    need(p['workspaceDirectory'] == str(PARENT / ('cloud-pg-fresh35-' + m[1] + '-' + m[2])), 'EXACT_NEW_WORKSPACE')
    return a

def verify_deployment(a):
    trusted(DEPLOY, True)
    raw = read_private(MANIFEST)
    need(hashlib.sha256(raw).hexdigest() == a['deploymentManifestSha256'], 'DEPLOYMENT_MANIFEST_DIFFERS')
    m = strict_json(raw)
    exact_keys(m, ['format','files'])
    need(m['format'] == 'FRESH35_ISOLATED_DEPLOYMENT_V1' and type(m['files']) is list, 'DEPLOYMENT_MANIFEST')
    files = {}
    for row in m['files']:
        exact_keys(row, ['path','sha256'])
        p = row['path']
        need(type(p) is str and p and not p.startswith('/') and str(Path(p)) == p and '..' not in Path(p).parts and p not in files and re.fullmatch('[a-f0-9]{64}', row['sha256']), 'DEPLOYMENT_ENTRY')
        files[p] = row['sha256']
    actual = {str(p.relative_to(DEPLOY)): digest(p) for p in DEPLOY.rglob('*') if p.is_file()}
    need(actual == files, 'COMPLETE_DEPLOYMENT_BYTES_DIFFER')
    need(digest(NODE) == NODE_SHA, 'NODE_24_21_0_PIN')
    for name, sha in TOOL_PINS.items():
        need(digest(BIN/name) == sha, 'PG_17_11_TOOL_PIN')
    # Dependencies outside DEPLOY remain part of the OS trust root, checked here.
    trusted('/usr/lib/x86_64-linux-gnu/libpq.so.5.17')
    need(Path('/lib/x86_64-linux-gnu/libpq.so.5').resolve() == Path('/usr/lib/x86_64-linux-gnu/libpq.so.5.17') and digest('/usr/lib/x86_64-linux-gnu/libpq.so.5.17') == 'f64dcec14657e4123621448442cd3d0795744d238e588774f5c864f592f4860d', 'LIBPQ_PIN')

def write_new(path, data, mode=0o400):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as file:
            file.write(data)
            file.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    fd = os.open(Path(path).parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def json_new(path, value):
    write_new(path, (json.dumps(value, sort_keys=True) + '\n').encode())

def clean_env(root, role=None):
    out = {'PATH':'/usr/bin:/bin','LC_ALL':'C','HOME':str(root),'TZ':'UTC'}
    if role:
        out.update(PGPASSFILE=str(root/'credentials'/(role+'.pgpass')),PGCONNECT_TIMEOUT='5',PGOPTIONS='-c search_path=pg_catalog -c lock_timeout=5000 -c statement_timeout=15000 -c TimeZone=UTC')
    return out

def hba_text(p):
    return f"local all all reject\nhost postgres,{p['database']} {p['admin']} 127.0.0.1/32 scram-sha-256\nhost {p['database']} {p['owner']} 127.0.0.1/32 scram-sha-256\nhost {p['database']} {p['controller']} 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n"

def server_args(p):
    return [str(BIN/'postgres'),'-D',str(Path(p['workspaceDirectory'])/'data'),'-h','127.0.0.1','-p',str(p['port']),'-k','', *sum((['-c',s] for s in ['max_connections=8','shared_buffers=32MB','work_mem=4MB','max_parallel_workers=0','fsync=on','synchronous_commit=on','password_encryption=scram-sha-256','log_statement=none','log_min_error_statement=panic','log_min_duration_statement=-1','log_duration=off','log_connections=off','log_disconnections=off','log_min_messages=warning']), [])]

def bootstrap_sql(a, passwords):
    p = a['proposal']
    expiry = datetime.fromtimestamp(a['expiresAt']/1000,timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
    need(set(passwords) == {p[k] for k in ['admin','owner','controller','runtime']} and all(re.fullmatch('[a-f0-9]{64}', v) for v in passwords.values()), 'GENERATED_PASSWORD_SHAPE')
    roles = f"ALTER ROLE {p['admin']} VALID UNTIL '{expiry}';\n"
    for key in ['owner','controller','runtime']:
        r = p[key]
        roles += f"CREATE ROLE {r} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD '{passwords[r]}' VALID UNTIL '{expiry}';\n"
    for r in INTERFACES:
        roles += f'CREATE ROLE {r} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 0;\n'
    for r, member in [(INTERFACES[0],p['controller']),(INTERFACES[1],p['controller']),(INTERFACES[2],p['runtime'])]:
        roles += f'GRANT {r} TO {member} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;\n'
    database = f"CREATE DATABASE {p['database']} OWNER {p['owner']};\n"
    acl = f"REVOKE ALL ON DATABASE {p['database']} FROM PUBLIC; GRANT CONNECT ON DATABASE {p['database']} TO {p['controller']},{p['runtime']};\nGRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO {p['owner']},{p['controller']};\n"
    return roles, database, acl

def process_identity(pid):
    root = Path('/proc')/str(pid)
    return {'pid':pid,'starttime':root.joinpath('stat').read_text().rsplit(')',1)[1].split()[19],'exe':os.readlink(root/'exe')}

def same_process(identity):
    try:
        return process_identity(identity['pid']) == identity and identity['exe'] == str(BIN/'postgres')
    except FileNotFoundError:
        return False

def port_absent(port):
    for name in ['/proc/net/tcp','/proc/net/tcp6']:
        for line in Path(name).read_text().splitlines()[1:]:
            if int(line.split()[1].split(':')[1],16) == port:
                return False
    return True

def owned_listener(identity, port):
    if not same_process(identity):
        return False
    try:
        sockets = {os.readlink(p) for p in (Path('/proc')/str(identity['pid'])/'fd').iterdir()}
        return any((f := line.split())[1] == f'0100007F:{port:04X}' and f[3] == '0A' and 'socket:['+f[9]+']' in sockets for line in Path('/proc/net/tcp').read_text().splitlines()[1:])
    except (FileNotFoundError, PermissionError):
        return False

def psql(a, role, database, sql, timeout=20):
    p=a['proposal']; root=Path(p['workspaceDirectory'])
    r = subprocess.run([str(BIN/'psql'),'-X','-qAt','--no-password','--host','127.0.0.1','--port',str(p['port']),'--dbname',database,'--username',role,'--set','ON_ERROR_STOP=1'],input=sql.encode(),capture_output=True,env=clean_env(root,role),timeout=timeout)
    # Never persist SQL, stderr or passwords; detailed nonsensitive observations
    # are returned only after a successful fixed query.
    need(r.returncode == 0, 'PSQL_FAILED')
    return r.stdout.decode()

def clear_credentials(root, p):
    errors=[]
    for name in [p[k]+'.pgpass' for k in ['admin','owner','controller','runtime']]:
        path=root/'credentials'/name
        try:
            s=path.lstat(); need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1,'CREDENTIAL_FILE_IDENTITY'); path.unlink()
        except FileNotFoundError:
            pass
        except Exception as e:
            errors.append(type(e).__name__)
    path=root/'pg-private/initpw'
    try:
        s=path.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'INITPW_IDENTITY');path.unlink()
    except FileNotFoundError:
        pass
    except Exception as e:
        errors.append(type(e).__name__)
    return not errors and not any((root/'credentials').iterdir()) and not path.exists()

def cleanup_owned_server(a, proc, identity, system_id, deadline):
    """Only this Popen child, with PID/starttime/exe/listener rechecks. No restart.
    A failed revoke/unclean stop is retained as failure, not hidden by file removal.
    """
    p=a['proposal'];root=Path(p['workspaceDirectory']);errors=[]
    result={'loginsRevoked':False,'credentialsRemoved':False,'ownedPidAbsent':False,'portAbsent':False,'cleanShutdown':False}
    try:
        if proc and proc.poll() is None and identity and owned_listener(identity,p['port']) and system_id and time.monotonic()<deadline-5:
            names=[p[k] for k in ['owner','controller','runtime','admin']]
            sql="DO $revoke$ BEGIN IF (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) <> '"+system_id+"' THEN RAISE EXCEPTION 'PHYSICAL_TARGET_DIFFERS'; END IF; "+''.join("IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='"+r+"') THEN ALTER ROLE "+r+" NOLOGIN PASSWORD NULL VALID UNTIL '-infinity'; END IF; " for r in names)+"END $revoke$;"
            try:
                psql(a,p['admin'],'postgres',sql,timeout=min(8,max(1,deadline-time.monotonic()-3)));result['loginsRevoked']=True
            except Exception as e:
                errors.append({'phase':'revoke','type':type(e).__name__})
        if proc:
            for sig,seconds in [(signal.SIGINT,12),(signal.SIGQUIT,5),(signal.SIGKILL,3)]:
                if proc.poll() is not None:break
                if identity and not same_process(identity):errors.append({'phase':'stop','type':'OWNERSHIP_CHANGED'});break
                try:
                    # Direct, unreaped child PID cannot be reused. No discovered
                    # PID or broad process-group termination is ever used.
                    proc.send_signal(sig);proc.wait(timeout=min(seconds,max(.1,deadline-time.monotonic())))
                except subprocess.TimeoutExpired:pass
                except ProcessLookupError:proc.poll()
    except Exception as e:
        errors.append({'phase':'stop','type':type(e).__name__})
    finally:
        try:result['credentialsRemoved']=clear_credentials(root,p)
        except Exception as e:errors.append({'phase':'credentials','type':type(e).__name__})
        try:
            result['ownedPidAbsent']=proc is None or proc.poll() is not None
            result['portAbsent']=port_absent(p['port'])
            if proc and result['ownedPidAbsent'] and not (root/'data/postmaster.pid').exists():
                r=subprocess.run([str(BIN/'pg_controldata'),'-D',str(root/'data')],capture_output=True,env=clean_env(root),timeout=5)
                control=r.stdout.decode(errors='replace')
                match=re.search(r'^Database system identifier:\s*(\d+)$',control,re.M)
                result['cleanShutdown']=r.returncode==0 and bool(match) and match[1]==system_id and bool(re.search(r'^Database cluster state:\s*shut down$',control,re.M))
        except Exception as e:errors.append({'phase':'observe','type':type(e).__name__})
    result['errors']=errors;result['cleanupComplete']=all(result[k] for k in ['loginsRevoked','credentialsRemoved','ownedPidAbsent','portAbsent','cleanShutdown']) and not errors
    return result

def initialization_args(p):
    root=Path(p['workspaceDirectory'])
    return [str(BIN/'initdb'),'-D',str(root/'data'),'-L',str(SHARE),'--username',p['admin'],'--pwfile',str(root/'pg-private/initpw'),'--auth-local=scram-sha-256','--auth-host=scram-sha-256','--encoding=UTF8','--locale=C']

def enable_child_subreaper():
    # Per-process Linux supervision, not an OS-wide setting. Failure is fatal
    # before initdb exists. No ctypes/native call is made by the offline models.
    import ctypes
    libc=ctypes.CDLL(None,use_errno=True)
    need(libc.prctl(36,1,0,0,0)==0,'CHILD_SUBREAPER_REQUIRED')
    observed=ctypes.c_int(0)
    need(libc.prctl(37,ctypes.byref(observed),0,0,0)==0 and observed.value==1,'CHILD_SUBREAPER_NOT_EFFECTIVE')

def direct_child_pids():
    raw=(Path('/proc')/str(os.getpid())/'task'/str(os.getpid())/'children').read_text().split()
    need(all(re.fullmatch('[1-9][0-9]*',x) for x in raw),'CHILD_LIST_INVALID')
    values=[int(x) for x in raw];need(len(set(values))==len(values),'DUPLICATE_CHILD_PID')
    return values

def owned_initialization_child(pid,session_id,uid):
    # Called only for the guardian's actual direct children, after initdb is
    # reaped. A live direct child cannot be PID-reused until this guardian reaps
    # it. No other thread or code path waits/reaps children during this phase.
    path=Path('/proc')/str(pid)
    fields=(path/'stat').read_text().rsplit(')',1)[1].split()
    values=re.search(r'^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$',(path/'status').read_text(),re.M)
    need(int(fields[1])==os.getpid() and int(fields[2])==session_id and int(fields[3])==session_id and values is not None and all(int(v)==uid for v in values.groups()),'INITIALIZER_CHILD_OWNERSHIP_DIFFERS')
    if fields[0]!='Z':
        exe=os.readlink(path/'exe')
        need(exe in {str(BIN/'initdb'),str(BIN/'postgres'),str(Path('/bin/sh').resolve())},'INITIALIZER_CHILD_EXECUTABLE_DIFFERS')
    return {'pid':pid,'starttime':fields[19],'session':session_id,'state':fields[0]}

def stop_and_reap_initialization(proc,a,deadline):
    errors=[];initializer_reaped=False;descendants_reaped=False
    cleanup_end=min(deadline,time.monotonic()+20)
    try:
        # This is our direct, unreaped Popen child, not a looked-up process.
        for sig,seconds in [(signal.SIGTERM,3),(signal.SIGKILL,3)]:
            if proc.poll() is not None:break
            proc.send_signal(sig)
            try:proc.wait(timeout=min(seconds,max(.1,cleanup_end-time.monotonic())))
            except subprocess.TimeoutExpired:pass
        initializer_reaped=proc.poll() is not None
        if not initializer_reaped:
            errors.append('INITIALIZER_EXIT_UNCONFIRMED')
        else:
            # Linux subreaper adoption completes before the dead parent can be
            # waited. Killing each adopted parent may expose another generation;
            # repeat the actual direct-child list, never scan/kill by UID/name.
            while True:
                children=direct_child_pids()
                if not children:
                    descendants_reaped=True;break
                need(time.monotonic()<cleanup_end,'INITIALIZER_DESCENDANT_DEADLINE')
                for pid in children:
                    owned_initialization_child(pid,proc.pid,a['postgresUid'])
                    # ECHILD, identity uncertainty and permission failures stop
                    # this cleanup with false flags, never masquerade as gone.
                    reaped,_=os.waitpid(pid,os.WNOHANG)
                    if reaped==pid:continue
                    need(reaped==0,'INITIALIZER_CHILD_WAIT_DIFFERS')
                    for sig,seconds in [(signal.SIGTERM,1),(signal.SIGKILL,2)]:
                        owned_initialization_child(pid,proc.pid,a['postgresUid'])
                        os.kill(pid,sig)
                        until=min(cleanup_end,time.monotonic()+seconds)
                        while True:
                            reaped,_=os.waitpid(pid,os.WNOHANG)
                            if reaped==pid:break
                            need(reaped==0,'INITIALIZER_CHILD_WAIT_DIFFERS')
                            if time.monotonic()>=until:break
                            time.sleep(.02)
                        if reaped==pid:break
                    need(reaped==pid,'INITIALIZER_CHILD_EXIT_UNCONFIRMED')
    except Exception as error:
        errors.append(type(error).__name__)
    return {'initializerReaped':initializer_reaped,'descendantsReaped':descendants_reaped,'errors':errors}

def drive_initializer(io,deadline):
    """Shared real/mock control flow. Model IO cannot produce an install token.
    Parent EOF, signal or budget exhaustion never sends initialization success.
    """
    started=False;success=False;reason='INITIALIZER_NOT_STARTED';errors=[]
    cleanup={'initializerReaped':True,'descendantsReaped':True,'errors':[]}
    try:
        if io.parent_event(0) is not None:reason='PARENT_EOF';return {'initialized':False,'stopReason':reason,**cleanup}
        need(not io.stop_requested() and io.now()<deadline-60,'INITIALIZER_START_WINDOW')
        io.enable_subreaper();io.launch();started=True
        operation_end=min(deadline-60,io.now()+60)
        while True:
            event=io.parent_event(min(.1,max(0,operation_end-io.now())))
            if event is not None:reason='PARENT_EOF' if event=='EOF' else 'PARENT_STOP';break
            if io.stop_requested():reason='GUARDIAN_SIGNAL';break
            if io.now()>=operation_end:reason='INITIALIZER_DEADLINE';break
            status=io.poll_initializer()
            if status is None:continue
            if status!=0:reason='INITIALIZER_FAILED';break
            if io.children():reason='INITIALIZER_DESCENDANTS_REMAINED';break
            success=True;reason='INITIALIZER_EXITED';break
    except Exception as error:
        reason='INITIALIZER_ERROR';errors.append(type(error).__name__)
    finally:
        if started:
            try:cleanup=io.stop_and_reap()
            except Exception as error:cleanup={'initializerReaped':False,'descendantsReaped':False,'errors':[type(error).__name__]}
    return {'initialized':success and cleanup['initializerReaped'] and cleanup['descendantsReaped'] and not cleanup['errors'],
        'stopReason':reason,'initializerReaped':cleanup['initializerReaped'],'descendantsReaped':cleanup['descendantsReaped'],'errors':errors+cleanup['errors']}

def supervise_initializer(a,selector,stop_requested,deadline):
    p=a['proposal'];root=Path(p['workspaceDirectory'])
    class IO:
        child=None
        def now(self):return time.monotonic()
        def parent_event(self,timeout):
            if not selector.select(timeout):return None
            line=sys.stdin.readline()
            return 'EOF' if line=='' else 'STOP'
        def stop_requested(self):return stop_requested()
        def enable_subreaper(self):enable_child_subreaper()
        def launch(self):
            self.child=subprocess.Popen(initialization_args(p),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=clean_env(root),user=a['postgresUid'],group=a['postgresGid'],extra_groups=[],start_new_session=True)
        def poll_initializer(self):return self.child.poll()
        def children(self):return direct_child_pids()
        def stop_and_reap(self):return stop_and_reap_initialization(self.child,a,deadline)
    return drive_initializer(IO(),deadline)

def include_initialization_cleanup(result,initialization):
    result={**result,'initialization':initialization}
    result['cleanupComplete']=result['cleanupComplete'] and initialization['initializerReaped'] and initialization['descendantsReaped'] and not initialization['errors']
    return result

def retry_parent_credential_cleanup(watch,clear):
    # Guardian owns stop/reap then clear. Parent may retry only after it exited.
    return clear() if watch is None or watch.poll() is not None else False

def supervise(a):
    p=a['proposal'];root=Path(p['workspaceDirectory']);proc=None;identity=None;system_id=None;stop=False
    deadline=time.monotonic()+max(0,a['expiresAt']/1000-time.time())
    initialization={'initialized':False,'initializerReaped':True,'descendantsReaped':True,'stopReason':'NOT_STARTED','errors':[]}
    initialization_attempted=False
    def requested(*_):
        nonlocal stop
        stop=True
    for s in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(s,requested)
    sel=selectors.DefaultSelector();sel.register(sys.stdin,selectors.EVENT_READ)
    try:
        # Guardian is running before credentials/initdb. Parent EOF always reaches
        # cleanup, even if initialization never gets as far as launching PG.
        print('GUARDIAN_READY',flush=True)
        while not stop and time.monotonic()<deadline-45:
            if not sel.select(min(1,max(.01,deadline-45-time.monotonic()))):continue
            line=sys.stdin.readline()
            if line=='INITIALIZE\n':
                need(not initialization_attempted,'INITIALIZE_ONCE');initialization_attempted=True
                initialization=supervise_initializer(a,sel,lambda:stop,deadline)
                json_new(root/'initialization-result.json',initialization)
                if not initialization['initialized']:break
                print('INITIALIZED',flush=True);continue
            if line!='START\n':break
            need(initialization['initialized'],'INITIALIZATION_ACK_REQUIRED')
            need(proc is None and port_absent(p['port']),'START_ONCE_NEW_PORT')
            birth=strict_json((root/'birth.json').read_bytes());system_id=birth['systemIdentifier']
            with (root/'server-private.log').open('xb',buffering=0) as log:
                proc=subprocess.Popen(server_args(p),stdin=subprocess.DEVNULL,stdout=log,stderr=log,env=clean_env(root),user=a['postgresUid'],group=a['postgresGid'],extra_groups=[],start_new_session=True)
            for _ in range(100):
                if proc.poll() is not None:break
                try:
                    identity=process_identity(proc.pid)
                    if same_process(identity):break
                except FileNotFoundError:pass
                time.sleep(.01)
            need(identity and same_process(identity),'OWNED_PG_PROCESS')
            json_new(root/'owned-process.json',identity)
            json_new(root/'server-command.json',{'argv':server_args(p),'identity':identity,'deadlineMonotonic':deadline})
            print('SERVER_STARTED',flush=True)
            while not stop and time.monotonic()<deadline-45 and proc.poll() is None:
                if sel.select(min(1,max(.01,deadline-45-time.monotonic()))):
                    sys.stdin.readline();stop=True
            break
    finally:
        result=cleanup_owned_server(a,proc,identity,system_id,deadline)
        result=include_initialization_cleanup(result,initialization)
        json_new(root/'cleanup.json',result)
        print('CLEANUP_COMPLETE' if result['cleanupComplete'] else 'CLEANUP_UNCONFIRMED',flush=True)
    return 0 if result['cleanupComplete'] else 1

def main():
    need(sys.platform=='linux' and os.getuid()==0 and os.geteuid()==0 and sys.flags.isolated and sys.flags.no_site,'ROOT_ISOLATED_PYTHON_REQUIRED')
    need(Path(__file__)==SELF and len(sys.argv)==2 and sys.argv[1] in ['--preflight-only','--run-authorized-once','--supervise-owned-child'],'FIXED_ENTRY')
    trusted(Path(sys.executable).resolve());trusted(PARENT)
    raw=read_private(AUTH);a=validate_authorization(strict_json(raw),int(time.time()*1000));verify_deployment(a)
    p=a['proposal'];root=Path(p['workspaceDirectory'])
    if sys.argv[1]=='--supervise-owned-child':
        parent=strict_json(read_private(root/'controller-process.json'))
        need(os.getppid()==parent['pid'] and process_identity(parent['pid'])==parent,'ONLY_LIVE_CREATING_CONTROLLER')
        parent_args=(Path('/proc')/str(parent['pid'])/'cmdline').read_bytes().split(b'\0')
        need([x.decode() for x in parent_args if x][-2:]==[str(SELF),'--run-authorized-once'],'EXACT_CONTROLLER_MODE')
        need(read_private(Path(str(AUTH)+'.consumed')).decode()==hashlib.sha256(raw).hexdigest()+'\n','PROVISION_CONSUMPTION_DIFFERS')
        json_new(root/'guardian-started.json',{'controller':parent,'authorizationSha256':hashlib.sha256(raw).hexdigest(),'restartAllowed':False})
        return supervise(a)
    need(not root.exists() and not root.is_symlink() and port_absent(p['port']),'NEW_UNUSED_TARGET')
    need(not INSTALL_AUTH.exists() and not Path(str(INSTALL_AUTH)+'.consumed').exists(),'NO_STALE_INSTALL_AUTHORIZATION')
    # Dedicated service account must already exist and have no running process.
    import pwd
    need(pwd.getpwuid(a['postgresUid']).pw_gid==a['postgresGid'],'EXISTING_SERVICE_ACCOUNT')
    for path in Path('/proc').iterdir():
        if path.name.isdecimal():
            try:need(path.stat().st_uid!=a['postgresUid'],'SERVICE_ACCOUNT_ALREADY_ACTIVE')
            except FileNotFoundError:pass
    if sys.argv[1]=='--preflight-only':
        print(json.dumps({'state':'READ_ONLY_PREFLIGHT_PASSED','noCredentialsCreated':True,'noServicesStarted':True}));return 0
    # Single-use external authorization; no replacement, unlink, repair or retry.
    write_new(str(AUTH)+'.consumed',(hashlib.sha256(raw).hexdigest()+'\n').encode())
    os.umask(0o077);root.mkdir(mode=0o700);os.chmod(root,0o711)
    (root/'credentials').mkdir(mode=0o700);(root/'pg-private').mkdir(mode=0o700)
    os.chown(root/'pg-private',a['postgresUid'],a['postgresGid'])
    watch=None;success=False;record_published=None;host_verified=False;passwords={};deadline=time.monotonic()+max(0,a['expiresAt']/1000-time.time())
    def remaining():
        need(time.monotonic()<deadline-60,'CLEANUP_RESERVE');return max(1,min(60,deadline-time.monotonic()-45))
    def interrupted(*_):raise RuntimeError('FRESH35_ISOLATED_PARENT_STOP')
    for s in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(s,interrupted)
    try:
        json_new(root/'controller-process.json',process_identity(os.getpid()))
        watch=subprocess.Popen([sys.executable,'-I','-S',str(SELF),'--supervise-owned-child'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=clean_env(root),start_new_session=True)
        sel=selectors.DefaultSelector();sel.register(watch.stdout,selectors.EVENT_READ)
        need(sel.select(8) and watch.stdout.readline()=='GUARDIAN_READY\n','GUARDIAN_READY')
        import secrets
        passwords={p[k]:secrets.token_hex(32) for k in ['admin','owner','controller','runtime']}
        for role,pw in passwords.items():
            need(watch.poll() is None,'GUARDIAN_LOST_BEFORE_CREDENTIAL_WRITE');write_new(root/'credentials'/(role+'.pgpass'),f"127.0.0.1:{p['port']}:*:{role}:{pw}\n".encode(),0o600)
        write_new(root/'pg-private/initpw',(passwords[p['admin']]+'\n').encode(),0o400);os.chown(root/'pg-private/initpw',a['postgresUid'],a['postgresGid'])
        (root/'data').mkdir(mode=0o700);os.chown(root/'data',a['postgresUid'],a['postgresGid'])
        watch.stdin.write('INITIALIZE\n');watch.stdin.flush()
        need(sel.select(remaining()+5) and watch.stdout.readline()=='INITIALIZED\n','INITDB_FAILED_OR_NOT_REAPED')
        hba=hba_text(p);(root/'data/pg_hba.conf').write_text(hba)
        json_new(root/'hba-source.json',{'text':hba,'sha256':hashlib.sha256(hba.encode()).hexdigest()})
        r=subprocess.run([str(BIN/'pg_controldata'),'-D',str(root/'data')],capture_output=True,env=clean_env(root),timeout=5)
        m=re.search(r'^Database system identifier:\s*(\d+)$',r.stdout.decode(),re.M);need(r.returncode==0 and m,'CONTROL_SYSTEM_ID')
        sid=m[1];json_new(root/'birth.json',{'systemIdentifier':sid,'startsAt':a['startsAt'],'expiresAt':a['expiresAt']})
        watch.stdin.write('START\n');watch.stdin.flush();need(sel.select(8) and watch.stdout.readline()=='SERVER_STARTED\n','START_ACK')
        owned=strict_json((root/'owned-process.json').read_bytes())
        for _ in range(40):
            remaining();need(watch.poll() is None and same_process(owned),'SERVER_STILL_OWNED')
            if owned_listener(owned,p['port']):
                pidfile=(root/'data/postmaster.pid').read_text().splitlines()
                need(int(pidfile[0])==owned['pid'] and pidfile[1]==str(root/'data') and int(pidfile[3])==p['port'],'POSTMASTER_PID_DATA_PORT')
                try:psql(a,p['admin'],'postgres','SELECT 1;',5);break
                except RuntimeError:pass
            time.sleep(.25)
        else:need(False,'START_NOT_READY')
        identity_sql="SELECT json_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'databaseOid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),'serverVersionNum',current_setting('server_version_num'),'postmasterStart',pg_catalog.pg_postmaster_start_time()::text,'address',host(inet_server_addr()),'port',inet_server_port(),'dataDirectory',current_setting('data_directory'),'hbaFile',current_setting('hba_file'),'listenAddresses',current_setting('listen_addresses'),'unixSocketDirectories',current_setting('unix_socket_directories'),'actor',session_user)::text;"
        obs=strict_json(psql(a,p['admin'],'postgres',identity_sql));need(obs['systemIdentifier']==sid and obs['address']=='127.0.0.1' and obs['port']==p['port'] and obs['serverVersionNum']=='170011' and obs['dataDirectory']==str(root/'data') and obs['hbaFile']==str(root/'data/pg_hba.conf') and obs['listenAddresses']=='127.0.0.1' and obs['unixSocketDirectories']=='' and obs['actor']==p['admin'],'BOOTSTRAP_PHYSICAL_TARGET')
        role_sql,db_sql,acl_sql=bootstrap_sql(a,passwords)
        for database,sql in [('postgres',role_sql),('postgres',db_sql),(p['database'],acl_sql)]:
            remaining();need(owned_listener(owned,p['port']),'BOOTSTRAP_LISTENER');psql(a,p['admin'],database,sql)
        passwords.clear();role_sql=None;sql=None;pw=None
        obs=strict_json(psql(a,p['admin'],p['database'],identity_sql));need(obs['systemIdentifier']==sid and obs['dataDirectory']==str(root/'data'),'POST_BOOTSTRAP_IDENTITY')
        need((root/'data/pg_hba.conf').read_text()==hba,'HBA_BYTES_CHANGED')
        hba_rows=strict_json(psql(a,p['admin'],p['database'],"SELECT coalesce(json_agg(json_build_object('type',type,'database',database,'user_name',user_name,'address',address,'auth_method',auth_method,'error',error) ORDER BY rule_number),'[]'::json)::text FROM pg_catalog.pg_hba_file_rules;"))
        need(len(hba_rows)==6 and all(row['error'] is None for row in hba_rows),'HBA_PARSE_DIFFERS')
        json_new(root/'hba-observation.json',hba_rows)
        target={'proposal':p,'physical':{k:obs[k] for k in ['systemIdentifier','databaseOid','serverVersionNum','postmasterStart']},'startsAt':a['startsAt'],'expiresAt':a['expiresAt']}
        json_new(root/'target-binding.json',target)
        verify_deployment(a)
        # Describe runs real current program compilation but no SQL/connection.
        argv=[str(NODE),'--no-global-search-paths',str(ENTRY)]
        r=subprocess.run(argv+['--describe'],capture_output=True,env=clean_env(root),timeout=remaining());need(r.returncode==0,'PROGRAM_DESCRIPTION_FAILED')
        descriptor=strict_json(r.stdout);need(descriptor['sourceSetSha256']==a['sourceSetSha256'],'CURRENT_SOURCE_SET_DIFFERS');json_new(root/'program-description.json',descriptor)
        # External authority must review this physical target/program and supply
        # the existing exact protected install authorization. Never mint it here.
        print(json.dumps({'state':'AWAITING_EXTERNAL_EXACT_INSTALL_AUTHORIZATION','program':descriptor,'target':target,'expiresAt':a['expiresAt']}),flush=True)
        while not INSTALL_AUTH.exists():
            remaining();need(watch.poll() is None and owned_listener(owned,p['port']),'GUARDIAN_OR_TARGET_LOST');time.sleep(.25)
        read_private(INSTALL_AUTH);verify_deployment(a);need(owned_listener(owned,p['port']),'PRE_INSTALL_LISTENER')
        r=subprocess.run(argv+['--execute'],capture_output=True,env=clean_env(root),timeout=max(1,deadline-time.monotonic()-45));need(r.returncode==0,'INSTALL_FAILED_OR_OUTCOME_UNKNOWN')
        result=strict_json(r.stdout);need(result.get('state')=='RECORD_DURABLY_PUBLISHED' and result.get('recordPublished') is True and result.get('sourceSetSha256')==a['sourceSetSha256'],'INSTALL_COMPLETION_REQUIRED');json_new(root/'installation-result.json',result);record_published=True
        remaining();need(watch.poll() is None and owned_listener(owned,p['port']),'PRE_HOST_TARGET_LOST')
        r=subprocess.run(argv+['--verify-host'],capture_output=True,env=clean_env(root),timeout=max(1,deadline-time.monotonic()-45));need(r.returncode==0,'CONTROLLER_HOST_FAILED')
        host_result=strict_json(r.stdout);need(host_result.get('state')=='FRESH35_CONTROLLER_HOST_VERIFIED' and host_result.get('ordinaryUid')==a['postgresUid'] and host_result.get('businessVerified') is False,'CONTROLLER_HOST_RESULT_REQUIRED')
        json_new(root/'host-result.json',host_result);host_verified=True;success=True
    except Exception as error:
        json_new(root/'failure.json',{'code':str(error) if re.fullmatch('FRESH35_[A-Z0-9_]+',str(error)) else type(error).__name__,'automaticRetry':False,'commitOutcome':'CONSULT_APPLICATION_JOURNAL_NOT_INFERRED'})
    finally:
        passwords.clear()
        for s in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(s,signal.SIG_IGN)
        if watch:
            try:watch.stdin.close()
            except (BrokenPipeError,ValueError):pass
            try:watch.wait(timeout=max(1,min(40,deadline-time.monotonic())))
            except subprocess.TimeoutExpired:success=False
        # File cleanup is retried locally only; never retry SQL or restart PG.
        files_clear=retry_parent_credential_cleanup(watch,lambda:clear_credentials(root,p))
        cleanup=strict_json((root/'cleanup.json').read_bytes()) if (root/'cleanup.json').is_file() else {'cleanupComplete':False}
        success=success and files_clear and cleanup.get('cleanupComplete') is True
        json_new(root/'result.json',{'state':'ISOLATED_INSTALL_AND_HOST_VERIFIED_AND_STOPPED' if success else 'FAILED_OR_CLEANUP_UNCONFIRMED','cleanup':cleanup,'recordPublished':record_published,'hostVerified':host_verified,'hostEnabled':False,'businessVerified':False})
        print(json.dumps({'state':'ISOLATED_INSTALL_AND_HOST_VERIFIED_AND_STOPPED' if success else 'FAILED_OR_CLEANUP_UNCONFIRMED','recordPublished':record_published,'hostVerified':host_verified,'businessVerified':False,'workspace':str(root)}))
    return 0 if success else 1

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        sys.stderr.write((str(error) if re.fullmatch('FRESH35_[A-Z0-9_]+',str(error)) else 'FRESH35_ISOLATED_FAILED')+'\n');sys.exit(1)
