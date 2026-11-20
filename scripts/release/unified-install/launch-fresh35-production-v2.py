#!/usr/bin/python3
"""One externally authorized new production target. No REAL import or app start.

Creation, entry binding and installation have separate C-issued fixed files.
The existing primitive module owns initdb/PID checks; the original JS entry owns
the sole install client, transaction, journal and durable V2 publication.
"""
import hashlib
import importlib.util
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
from datetime import datetime

DEPLOY=Path('/opt/naijue-erp/fresh35-combined-v1')
SELF=DEPLOY/'scripts/release/unified-install/launch-fresh35-production-v2.py'
PRIMITIVES=DEPLOY/'scripts/release/unified-install/launch-fresh35-isolated-v1.py'
ENTRY=DEPLOY/'scripts/release/unified-install/fresh35-production-entry-v2.mjs'
ETC=Path('/etc/naijue-erp')
PARENT=Path('/var/lib/naijue-erp/fresh35-production')
AUTH=ETC/'fresh35-production-provision-v2.json'
ENTRY_AUTH=ETC/'fresh35-production-entry-v2.json'
INSTALL_AUTH=ETC/'fresh35-combined-execution-v1.json'
RECORD=ETC/'fresh35-combined-installation-v1.json'
MANIFEST=ETC/'fresh35-isolated-deployment-v1.json'
core=None

def need(value,code):
    if not value:raise RuntimeError('FRESH35_PRODUCTION_'+code)

def closed(value,keys):
    need(type(value) is dict and set(value)==set(keys),'CLOSED_INPUT_REQUIRED')

def parse(raw):
    def pairs(items):
        result={}
        for k,v in items:
            need(k not in result,'DUPLICATE_JSON_KEY');result[k]=v
        return result
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:need(False,'NONFINITE_JSON'))

def trusted(path):
    path=Path(path)
    need(path.is_absolute() and str(path)==os.path.normpath(path),'CANONICAL_PATH_REQUIRED')
    for p in [*reversed(path.parents),path]:
        s=p.lstat()
        need(s.st_uid==0 and not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode),'ROOT_TRUST_REQUIRED')
        need(not any(k.startswith('system.posix_acl_') for k in os.listxattr(p,follow_symlinks=False)),'UNREVIEWED_ACL')
    return path

def protected(path,limit=65536,mode=0o600):
    path=trusted(path);fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    def identity(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
    try:
        before=os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid==0 and before.st_nlink==1 and 0<before.st_size<=limit and (stat.S_IMODE(before.st_mode)==mode if mode is not None else not before.st_mode&0o077),'PROTECTED_INPUT_REQUIRED')
        data=bytearray()
        while len(data)<=before.st_size:
            block=os.read(fd,before.st_size+1-len(data))
            if not block:break
            data.extend(block)
        need(len(data)==before.st_size and identity(before)==identity(os.fstat(fd))==identity(path.lstat()),'PROTECTED_INPUT_CHANGED')
        return bytes(data)
    finally:os.close(fd)

def load_primitives(a):
    # Verify both Python leaves against C's protected deployment bytes BEFORE
    # executing the retained module. Importing it never calls its V1 main.
    raw=protected(MANIFEST,2*1024*1024,None)
    need(hashlib.sha256(raw).hexdigest()==a['deploymentManifestSha256'],'DEPLOYMENT_MANIFEST_DIFFERS')
    manifest=parse(raw);closed(manifest,['format','files'])
    need(manifest['format']=='FRESH35_ISOLATED_DEPLOYMENT_V1','DEPLOYMENT_FORMAT_REQUIRED')
    pins={}
    for row in manifest['files']:
        closed(row,['path','sha256']);need(row['path'] not in pins,'DUPLICATE_DEPLOYMENT_MEMBER');pins[row['path']]=row['sha256']
    for path in [PRIMITIVES,SELF]:
        trusted(path);name=str(path.relative_to(DEPLOY))
        need(name in pins and hashlib.sha256(path.read_bytes()).hexdigest()==pins[name],'DEPLOYED_PYTHON_LEAF_DIFFERS')
    sys.dont_write_bytecode=True
    spec=importlib.util.spec_from_file_location('fresh35_existing_process_primitives',PRIMITIVES)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.verify_deployment(a)
    return module

def validate_provision(a,now):
    closed(a,['format','decision','deploymentManifestSha256','sourceSetSha256','proposal','postgresUid','postgresGid','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference','purpose','ordinary','serviceLease'])
    need(a['format']=='FRESH35_PRODUCTION_PROVISION_AUTHORIZATION_V2' and a['decision']=='AUTHORIZE_EXACT_NEW_EMPTY_PRODUCTION_TARGET_ONLY' and a['purpose']=='PRODUCTION_NEW_EMPTY_EXACT35','CREATION_AUTHORITY_REQUIRED')
    for k in ['deploymentManifestSha256','sourceSetSha256','independentSafetyReviewSha256']:
        need(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}',a[k]),'AUTHORITY_HASH_REQUIRED')
    need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512,'AUTHORITY_REFERENCE_REQUIRED')
    need(all(type(a[k]) is int and 0<a[k]<2**31 for k in ['postgresUid','postgresGid']),'EXISTING_NONROOT_SERVICE_ACCOUNT_REQUIRED')
    need(type(now) is int and all(type(a[k]) is int for k in ['startsAt','expiresAt']) and a['startsAt']<=now<a['expiresAt']-90000 and 0<a['expiresAt']-a['startsAt']<=1200000,'INSTALL_WINDOW_REQUIRED')
    p=a['proposal'];closed(p,['database','owner','controller','runtime','admin','host','port','workspaceDirectory'])
    need(all(type(p[k]) is str and re.fullmatch('[a-z][a-z0-9_]{0,62}',p[k]) and not p[k].startswith('pg_') for k in ['database','owner','controller','runtime','admin']) and not p['database'].startswith('synthetic_'),'EXACT_PRODUCTION_IDENTITIES_REQUIRED')
    need(len({p[k] for k in ['owner','controller','runtime','admin']}|set(core.INTERFACES))==7,'DISTINCT_ROLE_IDENTITIES_REQUIRED')
    need(p['host']=='127.0.0.1' and type(p['port']) is int and 1024<p['port']<65536,'EXACT_LOCAL_INSTALL_ENDPOINT_REQUIRED')
    need(type(p['workspaceDirectory']) is str,'EXACT_NEW_PRODUCTION_WORKSPACE_REQUIRED')
    root=Path(p['workspaceDirectory'])
    need(root.is_absolute() and str(root)==os.path.normpath(str(root)) and root.parent==PARENT and re.fullmatch('[a-z0-9][a-z0-9_-]{0,95}',root.name),'EXACT_NEW_PRODUCTION_WORKSPACE_REQUIRED')
    o=a['ordinary'];closed(o,['connectHost','connectPort','serverAddress','serverPort','runtimeLoginValidUntil','referenceDirectory'])
    need(type(o['connectHost']) is str and 0<len(o['connectHost'])<=253 and not re.search(r'[\s\x00-\x1f\x7f\x27\x22\\]',o['connectHost']) and type(o['connectPort']) is int and 0<o['connectPort']<65536,'EXACT_ORDINARY_CONNECTION_REQUIRED')
    # This caller retains the existing reviewed loopback listener/HBA. Any
    # external mapping is C's exact ordinary endpoint, never a guessed peer CIDR.
    need(o['serverAddress']==p['host'] and type(o['serverPort']) is int and o['serverPort']==p['port'] and o['referenceDirectory']==str(DEPLOY/'reference-inputs'),'EXACT_ORDINARY_SERVER_REQUIRED')
    lease=a['serviceLease'];closed(lease,['expiresAt','onSuccess','onFailure'])
    need(type(lease['expiresAt']) is int and a['expiresAt']<lease['expiresAt']<2**53 and lease['onSuccess']=='RETAIN_EXACT_TARGET_UNTIL_SERVICE_DEADLINE' and lease['onFailure']=='STOP_EXACT_TARGET_PRESERVE_DATA','EXPLICIT_FINITE_SERVICE_LEASE_REQUIRED')
    if o['runtimeLoginValidUntil'] is not None:
        value=o['runtimeLoginValidUntil']
        need(type(value) is str and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z',value),'EXACT_RUNTIME_LIFETIME_REQUIRED')
        try:until=int(datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()*1000)
        except ValueError:need(False,'EXACT_RUNTIME_LIFETIME_REQUIRED')
        need(lease['expiresAt']<=until,'SERVICE_LEASE_OUTLIVES_RUNTIME')
    return a

def install_remaining(a,cap=None):
    left=(a['expiresAt']-int(time.time()*1000))/1000-45
    need(left>0,'INSTALL_CLEANUP_RESERVE_EXPIRED')
    return min(cap,left) if cap is not None else left

def production_server_args(a):
    return core.server_args(a['proposal'])

def write_initial_hba(a):
    root=Path(a['proposal']['workspaceDirectory']);path=root/'data/pg_hba.conf'
    fd=os.open(path,os.O_WRONLY|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_uid==a['postgresUid'] and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600,'OWNED_INITIAL_HBA_REQUIRED')
        need((s.st_dev,s.st_ino)==(path.lstat().st_dev,path.lstat().st_ino),'INITIAL_HBA_CHANGED')
        os.ftruncate(fd,0)
        with os.fdopen(fd,'wb',closefd=False) as file:
            file.write(core.hba_text(a['proposal']).encode());file.flush();os.fsync(fd)
    finally:os.close(fd)

def production_bootstrap_sql(a,passwords):
    roles,database,acl=core.bootstrap_sql(a,passwords)
    until=a['ordinary']['runtimeLoginValidUntil'] or 'infinity'
    # All final role attributes are fixed BEFORE install/record publication.
    # Temporary admin/owner/controller keep the original installation expiry.
    roles+="ALTER ROLE "+a['proposal']['runtime']+" VALID UNTIL '"+until+"';\n"
    return roles,database,acl

def validate_entry(a,target,entry):
    closed(entry,['format','decision','sourceSetSha256','target','independentSafetyReviewSha256','authorizationReference'])
    need(entry['format']=='FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_V2' and entry['decision']=='AUTHORIZE_EXACT_NEW35_PRODUCTION_INSTALL_AND_RECORD' and entry['sourceSetSha256']==a['sourceSetSha256'] and entry['target']==target,'EXACT_EXTERNAL_ENTRY_BINDING_REQUIRED')
    need(type(entry['independentSafetyReviewSha256']) is str and re.fullmatch('[a-f0-9]{64}',entry['independentSafetyReviewSha256']) and type(entry['authorizationReference']) is str and 0<len(entry['authorizationReference'])<=512,'EXTERNAL_ENTRY_REVIEW_REQUIRED')
    return entry

def validate_install(a,descriptor,authorization):
    closed(authorization,['format','decision','programSha256','sourceSetSha256','targetSha256','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'])
    need(authorization['format']=='FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1' and authorization['decision']=='AUTHORIZE_EXACT_NEW35_PRODUCTION_INSTALL_ONLY' and all(authorization[k]==descriptor[k] for k in ['sourceSetSha256','targetSha256','programSha256']) and all(authorization[k]==a[k] for k in ['startsAt','expiresAt']),'EXACT_EXTERNAL_INSTALL_BINDING_REQUIRED')
    need(type(authorization['independentSafetyReviewSha256']) is str and re.fullmatch('[a-f0-9]{64}',authorization['independentSafetyReviewSha256']) and type(authorization['authorizationReference']) is str and 0<len(authorization['authorizationReference'])<=512,'EXTERNAL_INSTALL_REVIEW_REQUIRED')

def production_entry(a,flag):
    need(flag in ['--bootstrap-observer','--describe','--execute'],'FIXED_ENTRY_FLAG_REQUIRED')
    root=Path(a['proposal']['workspaceDirectory'])
    return subprocess.run([str(core.NODE),'--no-global-search-paths',str(ENTRY),flag],capture_output=True,env=core.clean_env(root),timeout=install_remaining(a,None if flag=='--execute' else 60))

def wait_external(a,path,watch):
    while not path.exists() and not path.is_symlink():
        install_remaining(a);need(watch.poll() is None,'OWNED_GUARDIAN_LOST');time.sleep(.25)
    return protected(path)

def assert_retention(a,target,descriptor,result,record_raw):
    record=parse(record_raw)
    closed(record,['format','installedAt','binding','target','transactionReceipt','programSha256','catalogSpecSha256','catalogSha256','authorizationSha256','state'])
    need(result.get('state')=='RECORD_DURABLY_PUBLISHED' and result.get('recordPublished') is True and result.get('hostEnabled') is False and result.get('businessVerified') is False and all(result.get(k)==descriptor[k] for k in ['sourceSetSha256','programSha256','targetSha256']),'DURABLE_NATIVE_RESULT_REQUIRED')
    need(record.get('format')=='FRESH35_COMBINED_INSTALLATION_RECORD_V2' and record.get('state')=='COMMITTED_AND_CATALOG_CHECKED' and record.get('target')=={'format':'FRESH35_COMBINED_TARGET_BINDING_V2',**target,'authority':'BINDING_ONLY_NOT_CREATION_OR_EXECUTION_PERMISSION'} and record.get('binding')=={'sourceSetSha256':a['sourceSetSha256'],'targetSha256':descriptor['targetSha256']} and record.get('programSha256')==descriptor['programSha256'] and record.get('catalogSpecSha256')==descriptor['catalogSha256'] and record.get('catalogSha256')==result.get('catalogSha256'),'PROTECTED_DURABLE_V2_RECORD_REQUIRED')
    receipt=record['transactionReceipt'];closed(receipt,['nonce','database','actor','transactionId','backendPid'])
    need(type(receipt['nonce']) is str and re.fullmatch('[a-f0-9]{48}',receipt['nonce']) and receipt['database']==a['proposal']['database'] and receipt['actor']==a['proposal']['owner'] and type(receipt['transactionId']) is str and re.fullmatch('[1-9][0-9]*',receipt['transactionId']) and type(receipt['backendPid']) is int and receipt['backendPid']>0,'NATIVE_TRANSACTION_RECEIPT_REQUIRED')
    # The native publisher's exact protected bytes are independently checked;
    # parsing JSON alone can never manufacture its successful completion.
    need(hashlib.sha256(record_raw).hexdigest()==result.get('recordSha256'),'DURABLE_RECORD_BYTES_DIFFER')
    return record

def remove_expired_temporary_secrets(a,all_owned=False):
    root=Path(a['proposal']['workspaceDirectory']);p=a['proposal']
    names=[root/'credentials'/(p[k]+'.pgpass') for k in ['admin','owner','controller']]+[root/'credentials/owner-connection.json']
    if all_owned:names.append(root/'credentials'/(p['runtime']+'.pgpass'))
    for path in names:
        try:
            trusted(path);s=path.lstat()
            need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o077,'OWNED_PRIVATE_SECRET_REQUIRED');path.unlink()
        except FileNotFoundError:pass
    # initdb's password file and its private parent deliberately belong to the
    # original nonroot PG UID. Never treat that subtree as root-owned authority.
    try:
        parent=root/'pg-private';s=parent.lstat()
        need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==a['postgresUid'] and stat.S_IMODE(s.st_mode)==0o700,'OWNED_INIT_PRIVATE_DIRECTORY_REQUIRED')
        path=parent/'initpw';s=path.lstat()
        need(stat.S_ISREG(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==a['postgresUid'] and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600,'OWNED_INIT_PASSWORD_REQUIRED');path.unlink()
    except FileNotFoundError:pass

def stop_owned(a,proc,identity,system_id,deadline):
    result={'ownedPidAbsent':proc is None,'portAbsent':False,'cleanShutdown':False,'dataPreserved':True,'databasePrivilegesChanged':False,'errors':[]}
    if proc:
        for sig,seconds in [(signal.SIGINT,12),(signal.SIGQUIT,5),(signal.SIGKILL,3)]:
            if proc.poll() is not None:break
            if not identity or not core.same_process(identity):result['errors'].append('OWNERSHIP_CHANGED');break
            try:proc.send_signal(sig);proc.wait(timeout=min(seconds,max(.1,deadline-time.monotonic())))
            except subprocess.TimeoutExpired:pass
            except ProcessLookupError:proc.poll()
            except OSError:result['errors'].append('OWNED_PROCESS_SIGNAL_FAILED');break
        result['ownedPidAbsent']=proc.poll() is not None
    result['portAbsent']=core.port_absent(a['proposal']['port'])
    root=Path(a['proposal']['workspaceDirectory'])
    if proc and result['ownedPidAbsent'] and system_id and not (root/'data/postmaster.pid').exists():
        r=subprocess.run([str(core.BIN/'pg_controldata'),'-D',str(root/'data')],capture_output=True,env=core.clean_env(root),timeout=5)
        text=r.stdout.decode('utf-8','replace')
        result['cleanShutdown']=r.returncode==0 and bool(re.search(r'^Database system identifier:\s*'+re.escape(system_id)+r'$',text,re.M)) and bool(re.search(r'^Database cluster state:\s*shut down$',text,re.M))
    result['cleanupComplete']=all(result[k] for k in ['ownedPidAbsent','portAbsent','cleanShutdown']) and not result['errors']
    return result

def supervise(a):
    root=Path(a['proposal']['workspaceDirectory']);proc=None;identity=None;system_id=None;stop=False;retained=False
    start=time.monotonic();install_deadline=start+max(0,a['expiresAt']/1000-time.time());service_deadline=start+max(0,a['serviceLease']['expiresAt']/1000-time.time())
    initialization={'initialized':False,'initializerReaped':True,'descendantsReaped':True,'stopReason':'NOT_STARTED','errors':[]};initialization_attempted=False
    def requested(*_):
        nonlocal stop
        stop=True
    for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(sig,requested)
    sel=selectors.DefaultSelector();sel.register(sys.stdin,selectors.EVENT_READ)
    try:
        print('GUARDIAN_READY',flush=True)
        while not stop:
            limit=service_deadline if retained else install_deadline-45
            absolute=a['serviceLease']['expiresAt'] if retained else a['expiresAt']-45000
            if time.monotonic()>=limit or int(time.time()*1000)>=absolute:break
            if proc is not None and proc.poll() is not None:break
            if not sel.select(min(.25,max(.01,limit-time.monotonic()))):continue
            line=sys.stdin.readline()
            if line=='INITIALIZE\n':
                need(not initialization_attempted,'INITIALIZE_ONCE');initialization_attempted=True
                initialization=core.supervise_initializer(a,sel,lambda:stop,install_deadline);core.json_new(root/'initialization-result.json',initialization,mode=0o600)
                if not initialization['initialized']:break
                print('INITIALIZED',flush=True);continue
            if line=='START\n':
                need(initialization['initialized'] and proc is None and core.port_absent(a['proposal']['port']),'OWNED_NEW_SERVER_ONCE')
                system_id=parse(protected(root/'birth.json'))['systemIdentifier']
                with (root/'server-private.log').open('xb',buffering=0) as log:
                    proc=subprocess.Popen(production_server_args(a),stdin=subprocess.DEVNULL,stdout=log,stderr=log,env=core.clean_env(root),user=a['postgresUid'],group=a['postgresGid'],extra_groups=[],start_new_session=True)
                for _ in range(100):
                    if proc.poll() is not None:break
                    try:
                        identity=core.process_identity(proc.pid)
                        if core.same_process(identity):break
                    except FileNotFoundError:pass
                    time.sleep(.01)
                need(identity and core.same_process(identity),'OWNED_PG_PROCESS_REQUIRED');core.json_new(root/'owned-process.json',identity,mode=0o600)
                print('SERVER_STARTED',flush=True);continue
            if line=='RETAIN\n':
                need(proc is not None and not retained,'SERVICE_RETAIN_ONCE')
                assert_retention(a,parse(protected(root/'target-binding.json')),parse(protected(root/'program-description.json')),parse(protected(root/'installation-result.json')),protected(RECORD,1024*1024,0o644))
                retained=True;print('SERVICE_RETAINED',flush=True);continue
            break
    finally:
        # No new work is admitted after the lease. SIGINT starts immediately;
        # the bounded stop/reap/checkpoint budget is cleanup, not a service lease.
        result=stop_owned(a,proc,identity,system_id,time.monotonic()+25);result=core.include_initialization_cleanup(result,initialization)
        # Failure/unknown files remain private for original-key recovery. On a
        # genuine completed lease, only this caller's registered secrets clear.
        lease_elapsed=time.monotonic()>=service_deadline or int(time.time()*1000)>=a['serviceLease']['expiresAt']
        if retained and lease_elapsed and result['cleanupComplete']:
            try:remove_expired_temporary_secrets(a,True);result['ownedSecretsRemoved']=True
            except Exception:result['ownedSecretsRemoved']=False;result['cleanupComplete']=False
        core.json_new(root/'cleanup.json',result,mode=0o600)
        print('CLEANUP_COMPLETE' if result['cleanupComplete'] else 'CLEANUP_UNCONFIRMED',flush=True)
    return 0 if result['cleanupComplete'] else 1

def actual_facts(a,system_id,owned):
    p=a['proposal'];root=Path(p['workspaceDirectory'])
    need(core.owned_listener(owned,p['port']),'EXACT_OWNED_LISTENER_REQUIRED')
    sql="SELECT json_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'databaseOid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),'serverVersionNum',current_setting('server_version_num'),'postmasterStart',pg_catalog.pg_postmaster_start_time()::text,'address',host(inet_server_addr()),'port',inet_server_port(),'database',current_database(),'actor',session_user,'dataDirectory',current_setting('data_directory'),'hbaFile',current_setting('hba_file'))::text;"
    observed=parse(core.psql(a,p['admin'],p['database'],sql,timeout=min(20,install_remaining(a))))
    need(observed['systemIdentifier']==system_id and observed['serverVersionNum']=='170011' and re.fullmatch('[1-9][0-9]*',observed['databaseOid']) and observed['address']==p['host'] and observed['port']==p['port'] and observed['database']==p['database'] and observed['actor']==p['admin'] and observed['dataDirectory']==str(root/'data') and observed['hbaFile']==str(root/'data/pg_hba.conf'),'ACTUAL_NEW_TARGET_FACTS_DIFFER')
    target={'proposal':p,'physical':{k:observed[k] for k in ['systemIdentifier','databaseOid','serverVersionNum','postmasterStart']},'startsAt':a['startsAt'],'expiresAt':a['expiresAt'],'purpose':a['purpose'],'ordinary':a['ordinary']}
    return target

def verify_bootstrap_server(a,system_id,owned):
    # Match the original creator's physical check BEFORE any role/database DDL.
    p=a['proposal'];root=Path(p['workspaceDirectory'])
    need(core.owned_listener(owned,p['port']),'EXACT_OWNED_LISTENER_REQUIRED')
    sql="SELECT json_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'serverVersionNum',current_setting('server_version_num'),'address',host(inet_server_addr()),'port',inet_server_port(),'actor',session_user,'dataDirectory',current_setting('data_directory'),'hbaFile',current_setting('hba_file'))::text;"
    seen=parse(core.psql(a,p['admin'],'postgres',sql,timeout=min(20,install_remaining(a))))
    need(seen=={'systemIdentifier':system_id,'serverVersionNum':'170011','address':p['host'],'port':p['port'],'actor':p['admin'],'dataDirectory':str(root/'data'),'hbaFile':str(root/'data/pg_hba.conf')},'BOOTSTRAP_PHYSICAL_TARGET_DIFFERS')

def safe_child_failure(result,descriptor):
    failed={'state':'OUTCOME_UNKNOWN_NO_REPLAY','exitCode':result.returncode,'diagnosticUnavailable':True,'automaticRetry':False}
    if type(result.stderr) is not bytes or not 0<len(result.stderr)<=16384:return failed
    try:
        v=parse(result.stderr);closed(v,['state','installState','code','stage','step','originalSQLSTATE','originalInternalCode','rollbackSQLSTATE','rollbackInternalCode','validationStage','validationCode','automaticRetry'])
        need(v['state']=='INSTALL_FAILED_OR_OUTCOME_UNKNOWN' and v['code']=='FRESH35_PRODUCTION_ENTRY_FAILED' and v['automaticRetry'] is False,'SAFE_CHILD_DIAGNOSTIC_REQUIRED')
        need(v['installState'] in [None,'NOT_STARTED','IN_TRANSACTION','ROLLED_BACK','ROLLBACK_UNCONFIRMED','COMMIT_OUTCOME_UNKNOWN','COMMITTED_UNPUBLISHED','PUBLISHED_DURABILITY_UNKNOWN','FAILED_NO_INSTALLED_RESULT'],'SAFE_INSTALL_STATE_REQUIRED')
        need(v['stage'] in ['BOUND','BEGIN','STEP','OBSERVE','COMMIT','ROLLBACK','CLOSE','UNKNOWN'],'SAFE_STAGE_REQUIRED')
        need(v['step'] in {s['name'] for s in descriptor['statements']} if v['stage']=='STEP' else v['step'] is None,'SAFE_STEP_REQUIRED')
        need(v['validationStage'] is None and v['validationCode'] is None,'SAFE_VALIDATION_FIELDS_REQUIRED')
        for key in ['originalSQLSTATE','rollbackSQLSTATE','originalInternalCode','rollbackInternalCode']:
            if v[key] is not None:need(type(v[key]) is str and re.fullmatch('[A-Z0-9]{5}' if key.endswith('SQLSTATE') else '(?:FRESH35_COMBINED_[A-Z0-9_]{1,80}|CLIENT_CLOSE_TIMEOUT)',v[key]),'SAFE_CHILD_CODE_REQUIRED')
        failed.update(v);failed['diagnosticUnavailable']=False
    except (ValueError,UnicodeError,RuntimeError,TypeError,KeyError):pass
    return failed

def main():
    global core
    need(sys.platform=='linux' and os.getuid()==0 and os.geteuid()==0 and sys.flags.isolated and sys.flags.no_site,'ROOT_ISOLATED_PYTHON_REQUIRED')
    need(Path(__file__)==SELF and len(sys.argv)==2 and sys.argv[1] in ['--preflight-only','--run-authorized-once','--supervise-owned-child'],'FIXED_PRODUCTION_ENTRY_REQUIRED')
    raw=protected(AUTH);a=parse(raw);need(type(a) is dict and type(a.get('deploymentManifestSha256')) is str,'CREATION_AUTHORITY_REQUIRED')
    core=load_primitives(a);validate_provision(a,int(time.time()*1000));trusted(PARENT)
    p=a['proposal'];root=Path(p['workspaceDirectory'])
    if sys.argv[1]=='--supervise-owned-child':
        parent=parse(protected(root/'controller-process.json'))
        need(os.getppid()==parent['pid'] and core.process_identity(parent['pid'])==parent,'ONLY_LIVE_CREATING_CONTROLLER')
        args=[x.decode() for x in (Path('/proc')/str(parent['pid'])/'cmdline').read_bytes().split(b'\0') if x]
        need(args[-2:]==[str(SELF),'--run-authorized-once'] and protected(Path(str(AUTH)+'.consumed')).decode()==hashlib.sha256(raw).hexdigest()+'\n','EXACT_CONTROLLER_AND_CONSUMPTION_REQUIRED')
        return supervise(a)
    need(not root.exists() and not root.is_symlink() and core.port_absent(p['port']),'NEW_UNUSED_PRODUCTION_TARGET_REQUIRED')
    need(all(not f.exists() and not f.is_symlink() for f in [ENTRY_AUTH,INSTALL_AUTH,RECORD,Path(str(INSTALL_AUTH)+'.consumed')]),'NO_STALE_ENTRY_INSTALL_OR_RECORD')
    import pwd
    need(pwd.getpwuid(a['postgresUid']).pw_gid==a['postgresGid'],'EXISTING_SERVICE_ACCOUNT_REQUIRED')
    for path in Path('/proc').iterdir():
        if path.name.isdecimal():
            try:need(path.stat().st_uid!=a['postgresUid'],'SERVICE_ACCOUNT_ALREADY_ACTIVE')
            except FileNotFoundError:pass
    dependencies=core.load_linux_runtime_dependencies(root)
    if sys.argv[1]=='--preflight-only':
        print(json.dumps({'state':'PRODUCTION_SOURCE_PREFLIGHT_ONLY','createsTarget':False,'runtimeDependencies':dependencies}));return 0
    core.write_new(str(AUTH)+'.consumed',(hashlib.sha256(raw).hexdigest()+'\n').encode(),0o600)
    os.umask(0o077);root.mkdir(mode=0o700);os.chmod(root,0o711);(root/'credentials').mkdir(mode=0o700);(root/'pg-private').mkdir(mode=0o700);os.chown(root/'pg-private',a['postgresUid'],a['postgresGid'])
    watch=None;retained=False;durable=False;phase='CREATE';result=None
    def interrupted(*_):raise RuntimeError('FRESH35_PRODUCTION_PARENT_STOP')
    for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(sig,interrupted)
    try:
        core.json_new(root/'controller-process.json',core.process_identity(os.getpid()),mode=0o600);core.json_new(root/'runtime-dependencies.json',dependencies,mode=0o600)
        watch=subprocess.Popen([sys.executable,'-I','-S',str(SELF),'--supervise-owned-child'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=core.clean_env(root),start_new_session=True)
        sel=selectors.DefaultSelector();sel.register(watch.stdout,selectors.EVENT_READ)
        def ack(expected,seconds=8):need(sel.select(min(seconds,install_remaining(a))) and watch.stdout.readline()==expected+'\n','GUARDIAN_ACK_REQUIRED')
        ack('GUARDIAN_READY')
        import secrets
        passwords={p[k]:secrets.token_hex(32) for k in ['admin','owner','controller','runtime']}
        for role,password in passwords.items():core.write_new(root/'credentials'/(role+'.pgpass'),f"{p['host']}:{p['port']}:*:{role}:{password}\n".encode(),0o600)
        core.write_new(root/'pg-private/initpw',(passwords[p['admin']]+'\n').encode(),0o600);os.chown(root/'pg-private/initpw',a['postgresUid'],a['postgresGid'])
        core.json_new(root/'credentials/owner-connection.json',{'host':p['host'],'port':p['port'],'database':p['database'],'user':p['owner'],'password':passwords[p['owner']]},mode=0o600)
        (root/'data').mkdir(mode=0o700);os.chown(root/'data',a['postgresUid'],a['postgresGid'])
        watch.stdin.write('INITIALIZE\n');watch.stdin.flush();ack('INITIALIZED',65);write_initial_hba(a)
        data=subprocess.run([str(core.BIN/'pg_controldata'),'-D',str(root/'data')],capture_output=True,env=core.clean_env(root),timeout=5)
        sid=re.search(r'^Database system identifier:\s*([1-9][0-9]*)$',data.stdout.decode('utf-8','replace'),re.M);need(data.returncode==0 and sid,'NEW_SYSTEM_IDENTIFIER_REQUIRED');sid=sid[1];core.json_new(root/'birth.json',{'systemIdentifier':sid},mode=0o600)
        watch.stdin.write('START\n');watch.stdin.flush();ack('SERVER_STARTED');owned=parse(protected(root/'owned-process.json'))
        for _ in range(40):
            install_remaining(a);need(watch.poll() is None and core.same_process(owned),'OWNED_SERVER_REQUIRED')
            if core.owned_listener(owned,p['port']):
                try:core.psql(a,p['admin'],'postgres','SELECT 1;',timeout=5);break
                except RuntimeError:pass
            time.sleep(.25)
        else:need(False,'SERVER_NOT_READY')
        verify_bootstrap_server(a,sid,owned)
        roles,database,acl=production_bootstrap_sql(a,passwords)
        for db,sql in [('postgres',roles),('postgres',database),(p['database'],acl)]:
            install_remaining(a);need(core.owned_listener(owned,p['port']),'OWNED_BOOTSTRAP_LISTENER_REQUIRED');core.psql(a,p['admin'],db,sql,timeout=min(20,install_remaining(a)))
        passwords.clear();password=None;roles=None;sql=None
        target=actual_facts(a,sid,owned);core.json_new(root/'target-binding.json',target,mode=0o600)
        core.json_new(root/'creation-facts.json',{'state':'NEW_EMPTY_PRODUCTION_TARGET_FACTS_ONLY','sourceSetSha256':a['sourceSetSha256'],'target':target,'serviceLease':a['serviceLease'],'installStarted':False},mode=0o600)
        phase='WAIT_ENTRY';entry_raw=wait_external(a,ENTRY_AUTH,watch);validate_entry(a,target,parse(entry_raw));need(protected(AUTH)==raw,'CREATION_AUTHORITY_CHANGED')
        core.verify_deployment(a);generated=production_entry(a,'--bootstrap-observer');need(generated.returncode==0 and type(generated.stdout) is bytes and 0<len(generated.stdout)<=262144,'BOOTSTRAP_OBSERVER_SQL_REQUIRED')
        core.psql(a,p['admin'],p['database'],generated.stdout.decode('utf-8'),timeout=min(20,install_remaining(a)));generated=None
        phase='DESCRIBE';described=production_entry(a,'--describe');need(described.returncode==0 and 0<len(described.stdout)<=1024*1024,'PROGRAM_DESCRIPTION_REQUIRED');descriptor=parse(described.stdout);need(descriptor.get('sourceSetSha256')==a['sourceSetSha256'],'DESCRIBED_SOURCE_DIFFERS');core.json_new(root/'program-description.json',descriptor,mode=0o600)
        phase='WAIT_INSTALL';authorization=parse(wait_external(a,INSTALL_AUTH,watch));validate_install(a,descriptor,authorization);need(protected(ENTRY_AUTH)==entry_raw and protected(AUTH)==raw,'EXTERNAL_AUTHORITIES_CHANGED');core.verify_deployment(a)
        phase='EXECUTE';executed=production_entry(a,'--execute')
        if executed.returncode!=0:core.json_new(root/'installation-child-failure.json',safe_child_failure(executed,descriptor),mode=0o600);need(False,'INSTALL_FAILED_OR_OUTCOME_UNKNOWN')
        need(0<len(executed.stdout)<=65536,'INSTALL_RESULT_REQUIRED');result=parse(executed.stdout);phase='PUBLISH';assert_retention(a,target,descriptor,result,protected(RECORD,1024*1024,0o644));durable=True;core.json_new(root/'installation-result.json',result,mode=0o600)
        phase='RETAIN';watch.stdin.write('RETAIN\n');watch.stdin.flush();ack('SERVICE_RETAINED');retained=True
        core.json_new(root/'service-retained.json',{'state':'DURABLE_V2_RECORD_SERVICE_RETAINED_UNTIL_EXPLICIT_DEADLINE','recordSha256':result['recordSha256'],'sourceSetSha256':a['sourceSetSha256'],'target':target,'serviceLease':a['serviceLease'],'hostEnabled':False,'businessVerified':False},mode=0o600)
        service_limit=time.monotonic()+max(0,a['serviceLease']['expiresAt']/1000-time.time());temporary_cleared=False
        while time.monotonic()<service_limit and int(time.time()*1000)<a['serviceLease']['expiresAt']:
            need(watch.poll() is None and core.same_process(owned),'RETAINED_SERVICE_LOST')
            if not temporary_cleared and int(time.time()*1000)>=a['expiresAt']:remove_expired_temporary_secrets(a);temporary_cleared=True
            time.sleep(min(.5,max(.01,service_limit-time.monotonic())))
        phase='SERVICE_EXPIRED'
    except Exception:
        core.json_new(root/'caller-failure.json',{'state':'PRODUCTION_CALLER_FAILED_OR_OUTCOME_UNKNOWN','phase':phase,'recordMayExist':RECORD.exists(),'retentionAcknowledged':retained,'automaticRetry':False,'originalKeyRecoveryRequired':True},mode=0o600)
    finally:
        if watch is not None:
            if watch.poll() is None:
                try:watch.stdin.write('STOP\n');watch.stdin.flush()
                except (BrokenPipeError,OSError):pass
            try:watch.wait(timeout=30)
            except subprocess.TimeoutExpired:pass
        cleanup=parse(protected(root/'cleanup.json')) if (root/'cleanup.json').exists() else {'cleanupComplete':False}
        core.json_new(root/'caller-result.json',{'state':'SERVICE_LEASE_COMPLETED_AND_STOPPED' if retained and phase=='SERVICE_EXPIRED' and cleanup.get('cleanupComplete') is True else 'STOPPED_OR_CLEANUP_UNKNOWN_ORIGINAL_KEY_ONLY','phase':phase,'durableInstallationObserved':durable,'cleanup':cleanup,'hostEnabled':False,'businessVerified':False,'automaticRetry':False},mode=0o600)
    return 0 if retained and phase=='SERVICE_EXPIRED' and cleanup.get('cleanupComplete') is True else 2

if __name__=='__main__':
    try:sys.exit(main())
    except Exception:sys.stderr.write(json.dumps({'state':'PRODUCTION_CALLER_STOPPED_OR_UNKNOWN','automaticRetry':False})+'\n');sys.exit(2)
