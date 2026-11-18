"""One fixed source-only materialization through the original registered root job."""
from pathlib import Path
import hashlib,json,os,re,stat,sys,time,subprocess

KEY = 't45-r3-batched-root09-after45-resume-progress-source-20261118-02'
GRANT='b16447fbc81f4d64'
JOB=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')/KEY
TARGET=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
OUTPUT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root09-after45-resume-progress-20261118-02')
SOURCE=OUTPUT/'operation'
PREDECESSOR=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root08-20261117-01')
DATA=TARGET/'state'/TARGET.name/'data'
# Static SOURCE profile is not execution authority. No authority file is delivered.
SOURCE_DESCRIPTION_SHA256='ebabec0f925cffa01f0f472681ff1bac64c92a97cdad6096ae4ba4416672cb89'
sha=lambda b:hashlib.sha256(b).hexdigest()


def need(ok,code):
    if not ok:raise ValueError('BATCHED_SOURCE_'+code)


def trusted_parents(path):
    for parent in reversed(path.parents):
        s=parent.lstat()
        need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022 and not parent.is_symlink(),'TRUSTED_ROOT_PARENT_REQUIRED')


def read(path,maximum=131072):
    trusted_parents(path)
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
        s=os.fstat(f.fileno())
        need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=maximum,'FIXED_INPUT_REQUIRED')
        raw=f.read(maximum+1)
        identity=lambda z:(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
        need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'INPUT_CHANGED')
        return raw


def write(path,raw,mode=0o600):
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode),'wb') as f:
        os.fchmod(f.fileno(),mode)
        need(f.write(raw)==len(raw),'SHORT_WRITE');f.flush();os.fsync(f.fileno())
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)


def pack(value):
    return (json.dumps(value,sort_keys=True)+'\n').encode()


def encode(value):return pack(value)


def scope():
    need(type(KEY) is str and isinstance(JOB,Path) and isinstance(OUTPUT,Path) and isinstance(SOURCE,Path) and type(SOURCE_DESCRIPTION_SHA256) is str,'EXACT_MAIN_IDENTITY_AND_D1_PINS_STILL_UNISSUED')
    return {'format':'T45_R3_BATCHED_SOURCE_MATERIALIZATION_V1','requestKey':KEY,'grantId':GRANT,
        'decision':'MATERIALIZE_EXACT_FROZEN_SOURCE_ONLY_NO_DATABASE_OR_SERVICE','outputDirectory':str(OUTPUT),
        'sourceDescriptionSha256':SOURCE_DESCRIPTION_SHA256,'dataIdentity':[66304,13502421,61035,61035,448],
        'minimumAvailableAfterBytes':28*1024**3,'maximumOperationSeconds':300}


def validate(a,at):
    fixed=scope()
    need(type(SOURCE_DESCRIPTION_SHA256) is str and re.fullmatch('[0-9a-f]{64}',SOURCE_DESCRIPTION_SHA256),'FINAL_SAME_VERSION_DESCRIPTION_REQUIRED')
    need(set(a)==set(fixed)|{'startsAt','expiresAt','authorizationReference','independentReviewSha256','sourceSha256'}
         and all(a[k]==v for k,v in fixed.items()),'EXACT_EXTERNAL_SCOPE_REQUIRED')
    need(type(a['startsAt']) is type(a['expiresAt']) is int and a['startsAt']<=at<at+300000<a['expiresAt']<=a['startsAt']+900000,'FINITE_WINDOW_REQUIRED')
    need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512
         and re.fullmatch('[a-f0-9]{64}',a['independentReviewSha256']) and re.fullmatch('[a-f0-9]{64}',a['sourceSha256']),'SOURCE_AND_REVIEW_REQUIRED')
    return a


def materialization_result(d):
    scope()  # Called only after the authorized filesystem copy and final protection checks.
    return {'requestKey':KEY,'state':'SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED',
        'sourceDescriptionSha256':SOURCE_DESCRIPTION_SHA256,'sourceRowsSha256':d['sourceRowsSha256'],
        'sourceSetSha256':d['sourceSetSha256'],'sourceFiles':392,'sourceRoot':str(SOURCE),
        'predecessorMaterializationSha256':d['predecessorMaterializationSha256'],
        'inheritedUnchangedFiles':389,'changedFiles':3,'addedFiles':0,'originalSourcePreserved':True,'nodeModulesChanged':False,
        'installerRunnerSha256':d['installerRunnerSha256'],'databaseConnections':0,'databaseWrites':0,
        'serviceStarted':False,'liveCatalogVerified':False,'automaticReplay':False,
        'SQLUpgradePerformed':False,'importReady':False,'businessDurableState':'PERSISTED_PARTIAL',
        'sourceModelSha256':d['sourceModelSha256'],'oldLineageProvesNewSQLInstalled':False,'ordinaryActorReadability':d['actualOrdinaryActorReadability'],'privateBaselinePreserved':True}


def check_delta(d,rows,prior_rows):
    need(d['format']=='T45_ROOT09_EXACT_SOURCE_MATERIALIZATION_PROFILE_V1'
         and d['requestKey']==KEY and d['outputDirectory']==str(OUTPUT)
         and d['predecessorDirectory']==str(PREDECESSOR) and d['sourceFiles']==392
         and d['changedFiles']==3 and d['addedFiles']==0 and d['inheritedUnchangedFiles']==389,
         'EXACT_ROOT09_PROFILE_REQUIRED')
    expected={r['path']:r for r in rows};previous={r['path']:r for r in prior_rows}
    need(len(rows)==len(expected)==392 and len(prior_rows)==len(previous)==392
         and set(previous)<=set(expected) and all(re.fullmatch(r'[A-Za-z0-9_./-]+',n)
         and not n.startswith('/') and '..' not in n.split('/')
         and not n.startswith(('node_modules/','reference-inputs/')) for n in expected),'EXACT_SOURCE_PATH_REQUIRED')
    changes={r['path']:r for r in d['changes']}
    need(len(d['changes'])==len(changes)==3 and set(changes)=={n for n in expected if expected[n]!=previous.get(n)},'EXACT_THREE_DELTAS_REQUIRED')
    need(sum(n in previous for n in changes)==3 and sum(n not in previous for n in changes)==0,'EXACT_THREE_CHANGED_ZERO_ADDED_REQUIRED')
    for name,row in changes.items():
        need(re.fullmatch(r'delta-0[0-2]\.asset',row['payloadLeaf'])
             and row['beforeSha256']==(previous[name]['sha256']if name in previous else None)
             and expected[name]=={k:row[k]for k in ('bytes','path','sha256')},'DELTA_ROWS_DIFFER')
    need(len({r['payloadLeaf']for r in changes.values()})==3,'UNIQUE_DELTA_ASSETS_REQUIRED')
    physical={'format':'T45_ROOT09_PHYSICAL_SOURCE_SET_V1','predecessorSourceSetSha256':d['predecessorSourceSetSha256'],'sourceRows':rows}
    need(sha(json.dumps(physical,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode())==d['sourceSetSha256'],'NEW_PHYSICAL_SOURCE_SET_REQUIRED')
    return expected,changes


WORKER=JOB.parent
ROOT=TARGET
HOST_DATA=DATA
TERMINALS={'t45-r3-batched-real-after44-execute-20261118-01': ('a574859a24eb391e9bf9e1ec7aa1ba9918d6b0e427bbd614072e07b7406df6cd', 'FAILED', 2), 't45-r3-original-auth45-guardian-restore-20261118-01': ('09c82002e59d70c8ef086af7c65219ae049876cdc59258f480e2f69aae241210', 'COMPLETED', 0)}
ORIGINAL45_SNAPSHOT_STAT9={'original-auth.json': [66304, 13667754, 0, 0, 256, 1, 2533, 1794946941117538527, 1794946941117538527], 'finite-auth.json': [66304, 13667757, 0, 0, 256, 1, 2549, 1794946941258536319, 1794946941258536319], 'applied.json': [66304, 13667760, 0, 0, 256, 1, 493, 1794946942390518589, 1794946942390518589]}
def cmd(args,timeout=5):
    q=subprocess.run(args,capture_output=True,timeout=timeout)
    need(q.returncode==0 and not q.stderr,'FIXED_CLOSURE_COMMAND_FAILED')
    return q.stdout

def data_stopped(path):
    z=path.lstat();need(path.resolve()==path and stat.S_ISDIR(z.st_mode)and[z.st_dev,z.st_ino,z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode)]==[66304,13502421,61035,61035,448]and not os.path.lexists(path/'postmaster.pid'),'EXACT_STOPPED_DATA_REQUIRED')

def closed45():
    for key, (pin,status,code) in TERMINALS.items():
        raw=read(WORKER/key/'r3-outer-terminal.json');v=json.loads(raw)
        need(sha(raw)==pin and v['jobId']==key and(v['status'],v['exitCode'])==(status,code),'EXACT_CLOSED45_TERMINAL_REQUIRED')
    restore='t45-r3-original-auth45-guardian-restore-20261118-01'
    raw=read(WORKER/restore/'results/maintenance-auth-result.json')
    need(sha(raw)=='1b6cdcc959a65390d577143cfbf22ca63a54b5d31cb3faea731a3b9898afc113','EXACT_RESTORE45_RESULT_REQUIRED')
    r=json.loads(raw)['result']
    need(r['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and r['naturalExpiryCountedAsRestoration']is False and r['runtimeAuthChanged']is False and r['membershipsOrRoleAttributesChanged']is False and r['databaseStillStopped']is True and r['originalHardDeadlineMet']is False,'EXACT_AUTH_RESTORATION_REQUIRED')
    custody=ROOT/'state/native-services/ordinary45-auth-20261118-01'
    raw=read(custody/'original-auth-rollback-restored.json')
    need(sha(raw)=='28a5928a29fdf2c9c8094798af22a7ba6a709af9f40ea50e8e27cc8b3f32b37e'and json.loads(raw)==r,'ACTUAL_PRIVATE_SAFE_RESTORATION_RECEIPT_REQUIRED')
    # Authentication snapshots: metadata only, never read or hash their bodies.
    fixed=ORIGINAL45_SNAPSHOT_STAT9
    for leaf,expected in fixed.items():
        p=custody/leaf;z=p.lstat()
        actual=[z.st_dev,z.st_ino,z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode),z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]
        need(p.resolve()==p and stat.S_ISREG(z.st_mode)and actual==expected,'UNCHANGED_ORIGINAL_AUTH45_METADATA_REQUIRED')
    for cid in('a8a29eb7604992be310e4f23b5aa43e064acb52298bd150df49bfc66db20d127','db1e52517061426869b8735caac0d8c16e02e917999291d8c0f75f6dc402d33f'):
        value=json.loads(cmd(['/usr/bin/docker','inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}}}',cid]))
        need(value==dict(id=cid,running=False,pid=0),'ACTUAL45_AND_RESTORE_HELPERS_MUST_STAY_STOPPED')
    data_stopped(HOST_DATA)
    need(not cmd(['/usr/bin/ss','-H','-ltn','sport = :56791']).strip(), 'ORIGINAL_PORT_MUST_REMAIN_ABSENT')
    active = cmd(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'])
    own = 'naijue-erp-op-b16447fb-' + sha(KEY.encode())[:12] + '.service'
    need(all(row.split()[0] == own for row in active.decode().splitlines() if row.strip()), 'OTHER_OPERATION_ACTIVE')
    backup_units = cmd(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','*naijue*backup*','*naijue*capture*'])
    programs = cmd(['/bin/ps','-eo','comm=']).decode().splitlines()
    need(not backup_units.strip() and not any(s.strip() in ('pg_dump','pg_dumpall','pg_basebackup','pgbackrest','wal-g','barman') for s in programs), 'BACKUP_ACTIVE')
    fs = os.statvfs(ROOT)
    need(fs.f_bavail * fs.f_frsize >= 28*1024**3, 'RESERVE_28GIB_REQUIRED')

def protected_stat9():
    paths=[DATA,TARGET/'state/r3-final33-private-import-input-20261116-01',
        JOB.parent/'t45-r3-first-admin-custody-receive-20261113-01/custody/original-a.json',
        JOB.parent/'t45-r3-batched-real-execute-20261115-01/native-private/native-result.json']
    plan=TARGET/'state/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-05'
    paths.extend(plan/name for name in ('original-initializer.json','batched-plan.sqlite'))
    snapshot=TARGET/'state/native-services/ordinary39-auth-20261116-01'
    paths.extend(snapshot/name for name in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json'))
    paths.extend(Path(directory)/name for directory,dirs,files in os.walk(PREDECESSOR,followlinks=False) for name in dirs+files)
    paths.append(PREDECESSOR)
    # Original inputs are metadata only. No payload or authentication body is read.
    source=paths[1]
    for directory,dirs,files in os.walk(source,followlinks=False):
        paths.extend(Path(directory)/name for name in dirs+files)
    result={}
    for path in paths:
        s=path.lstat();need(not stat.S_ISLNK(s.st_mode),'PROTECTED_SYMLINK_FORBIDDEN')
        result[str(path)]=(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
    return result

def ordinary_actor_readability(rows):
    bind_root=TARGET/'state'
    trusted_parents(bind_root)
    need(bind_root.resolve()==bind_root,'FIXED_EXISTING_STATE_BIND_REQUIRED')
    root_fd=os.open(bind_root,os.O_PATH|os.O_DIRECTORY|os.O_NOFOLLOW)
    def ident(z):
        return[z.st_dev,z.st_ino,z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode),z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]
    def failed(stage,row_index=None,errno=None):
        # Only a closed diagnosis. Never save exception messages or stderr.
        write(JOB/'results/batched-source-access-failure.json',pack(dict(
            format='T45_SOURCE_MAPPED_ACCESS_FAILURE_V1',requestKey=KEY,
            stage=stage,rowIndex=row_index,errno=errno,bodyReads=False)))
        need(False,'ACTUAL_ORDINARY_ACTOR_CODE_READABILITY_REQUIRED')
    try:
        root_stat=ident(os.fstat(root_fd))
        need(stat.S_ISDIR(os.fstat(root_fd).st_mode)
             and root_stat[:5]==[66304,13502389,0,61035,0o710]
             and ident(bind_root.lstat())==root_stat,'EXACT_EXISTING_STATE_BIND_DIRECTORY_REQUIRED')
        prefix=SOURCE.relative_to(bind_root)
        selected=[]
        for row in rows:
            if row['path']=='runtime/baseline-scope-input-pins.json':
                continue
            name=str(prefix/row['path'])
            selected.append(dict(relative=name,stat9=ident(os.stat(name,dir_fd=root_fd,follow_symlinks=False))))
        need(len(selected)==391,'EXACT_ORDINARY_CODE_COUNT_REQUIRED')
        child=r'''
import json,os,stat,sys
p=json.load(sys.stdin)
actor=dict(uid=os.getuid(),euid=os.geteuid(),gid=os.getgid(),egid=os.getegid(),groups=os.getgroups())
def ident(z):return[z.st_dev,z.st_ino,z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode),z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]
result=dict(actor=actor,openedCodeFilesWithoutBodyRead=0,privateBaselineExcluded=True,failure=None)
if actor!=dict(uid=61035,euid=61035,gid=61035,egid=61035,groups=[]):
    result['failure']=dict(stage='ACTOR',rowIndex=None,errno=None)
else:
    for index,row in enumerate(p['rows']):
        opened=None;stage='STAT'
        try:
            z=os.stat(row['relative'],dir_fd=p['rootFd'],follow_symlinks=False)
            if not stat.S_ISREG(z.st_mode)or ident(z)!=row['stat9']:
                result['failure']=dict(stage='STAT_IDENTITY',rowIndex=index,errno=None);break
            stage='OPEN'
            opened=os.open(row['relative'],os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW,dir_fd=p['rootFd'])
            if ident(os.fstat(opened))!=row['stat9']:
                result['failure']=dict(stage='OPEN_IDENTITY',rowIndex=index,errno=None);break
            result['openedCodeFilesWithoutBodyRead']+=1
        except OSError as error:
            result['failure']=dict(stage=stage,rowIndex=index,errno=error.errno);break
        finally:
            if opened is not None:os.close(opened)
print(json.dumps(result,sort_keys=True))
'''
        try:
            q=subprocess.run(['/usr/bin/python3','-I','-S','-c',child],
                input=json.dumps(dict(rootFd=root_fd,rows=selected)).encode(),
                capture_output=True,pass_fds=(root_fd,),timeout=20,
                user=61035,group=61035,extra_groups=[],
                env={'PATH':'/usr/bin:/bin','LC_ALL':'C','HOME':'/','TZ':'UTC'})
        except subprocess.TimeoutExpired:
            failed('TIMEOUT')
        except OSError as error:
            failed('SPAWN',errno=error.errno)
        if q.returncode!=0 or q.stderr or not 0<len(q.stdout)<=4096:
            failed('CHILD_RESULT')
        try:
            out=json.loads(q.stdout)
        except(ValueError,UnicodeError):
            failed('CHILD_SCHEMA')
        expected_actor=dict(uid=61035,euid=61035,gid=61035,egid=61035,groups=[])
        if type(out)is not dict or set(out)!={'actor','openedCodeFilesWithoutBodyRead','privateBaselineExcluded','failure'}or out['actor']!=expected_actor or out['privateBaselineExcluded']is not True:
            failed('CHILD_SCHEMA')
        fault=out['failure']
        if fault is not None:
            if type(fault)is not dict or set(fault)!={'stage','rowIndex','errno'}or fault['stage']not in('ACTOR','STAT','OPEN','STAT_IDENTITY','OPEN_IDENTITY')or not(fault['rowIndex']is None or type(fault['rowIndex'])is int and 0<=fault['rowIndex']<391)or not(fault['errno']is None or type(fault['errno'])is int and 0<fault['errno']<4096):
                failed('CHILD_SCHEMA')
            failed(fault['stage'],fault['rowIndex'],fault['errno'])
        need(out['openedCodeFilesWithoutBodyRead']==391 and ident(os.fstat(root_fd))==root_stat
             and ident(bind_root.lstat())==root_stat,'MAPPED_STATE_ROOT_CHANGED')
        baseline=SOURCE/'runtime/baseline-scope-input-pins.json';z=baseline.lstat()
        old=(PREDECESSOR/'operation/runtime/baseline-scope-input-pins.json').lstat()
        need((z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode))==(old.st_uid,old.st_gid,stat.S_IMODE(old.st_mode))==(0,0,0o400),'ROOT_PRIVATE_BASELINE_ACCESS_SEMANTICS_REQUIRED')
        return dict(uid=61035,gid=61035,groups=[],openedCodeFilesWithoutBodyRead=391,
                    privateBaselineExcluded=True,mappingBasis='EXISTING_STATE_BIND_ROOT_FD',
                    bodyReads=False,hostAncestorPermissionsChanged=False)
    finally:
        os.close(root_fd)

def main():
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0
         and os.environ.get('ERP_SHARED_TASK_ID')=='T45' and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB)
         and Path(__file__)==JOB/'bundle/materialize-batched-source.py' and len(sys.argv)==2,'REGISTERED_ROOT_ENTRY_REQUIRED')
    raw=read(JOB/'bundle/materialize-authorization.json',65536)
    need(sha(raw)==sys.argv[1],'EXTERNAL_AUTHORITY_DIGEST_REQUIRED')
    at=time.time_ns()//1000000;a=validate(json.loads(raw),at)
    need(sha(read(Path(__file__),65536))==a['sourceSha256'],'SOURCE_AND_REVIEW_REQUIRED')
    raw=read(JOB/'bundle/source-profile.json',65536)
    need(sha(raw)==SOURCE_DESCRIPTION_SHA256,'DESCRIPTION_DIFFERS');d=json.loads(raw)
    prior=read(PREDECESSOR/'source-materialization.json',65536);p=json.loads(prior)
    need(sha(prior)==d['predecessorMaterializationSha256']
         and p['sourceRowsSha256']==d['predecessorSourceRowsSha256'] and p['sourceFiles']==392
         and p['sourceSetSha256']==d['predecessorSourceSetSha256']
         and p['state']=='SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED'
         and p['sourceRoot']==str(PREDECESSOR/'operation'),'EXACT_PROVEN_PREDECESSOR_REQUIRED')
    rowsraw=read(JOB/'bundle/source-rows.json',262144);need(sha(rowsraw)==d['sourceRowsSha256'],'SOURCE_ROWS_DIFFERS')
    prior_rows_raw=read(JOB.parent/d['predecessorKey']/'bundle/source-rows.json',262144)
    need(sha(prior_rows_raw)==d['predecessorSourceRowsSha256'],'ACTUAL_PARENT_ROWS_REQUIRED')
    rows=json.loads(rowsraw);expected,changes=check_delta(d,rows,json.loads(prior_rows_raw))
    changed = {}
    for name, row in changes.items():
        before=PREDECESSOR/'operation'/name
        expected_old=row['beforeSha256']
        if expected_old is None:
            need(not os.path.lexists(before),'ADDED_SOURCE_ALREADY_PRESENT')
        else:
            need(sha(read(before,2*1024*1024))==expected_old,'PREDECESSOR_DELTA_CAS_DIFFERS')
        new=read(JOB/'bundle'/row['payloadLeaf'],2*1024*1024)
        need(len(new)==row['bytes'] and sha(new)==row['sha256'],'DELTA_BYTES_DIFFER');changed[name]=new
    runner=read(PREDECESSOR/'batched161-run.mjs',65536)
    need(sha(runner)==d['installerRunnerSha256'],'RUNNER_DIFFERS')
    st=DATA.lstat();need([st.st_dev,st.st_ino,st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode)]==scope()['dataIdentity']
         and not os.path.lexists(DATA/'postmaster.pid'),'ORIGINAL_STOPPED_DATA_REQUIRED')
    closed45();protected_before=protected_stat9()
    need(not os.path.lexists(OUTPUT),'OUTPUT_ALREADY_EXISTS_READ_ORIGINAL_KEY')
    v=os.statvfs(TARGET);need(v.f_bavail*v.f_frsize-sum(r['bytes'] for r in rows)>=28*1024**3,'ORIGINAL_SPACE_RESERVE_REQUIRED')
    end=min(time.monotonic()+265,time.monotonic()+(a['expiresAt']-at)/1000-35)
    write(JOB/'results/batched-source-materialization-intent.json',pack({'requestKey':KEY,
         'sourceDescriptionSha256':SOURCE_DESCRIPTION_SHA256,'outputDirectory':str(OUTPUT),'automaticReplay':False}))
    trusted_parents(OUTPUT);OUTPUT.mkdir(mode=0o755);SOURCE.mkdir(mode=0o755)
    for row in rows:
        need(time.monotonic()<end,'WORK_WINDOW_EXPIRED');name=row['path']
        # Unchanged bytes inherit the root-protected original proof. No full-closure rehash or retransmission.
        data=changed[name] if name in changed else read(PREDECESSOR/'operation'/name,16*1024**2)
        need(len(data)==row['bytes'],'INHERITED_MEMBER_SIZE_DIFFERS')
        dest=SOURCE/name;dest.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
        write(dest,data,0o400 if name=='runtime/baseline-scope-input-pins.json' else 0o644)
    for name,row in changes.items():
        need(sha(read(SOURCE/name,2*1024*1024))==row['sha256'],'DELTA_READBACK_DIFFERS')
    write(OUTPUT/'batched161-run.mjs',runner,0o644)
    closed45();need(protected_stat9()==protected_before,'ORIGINAL_DATA_INPUT_OR_SNAPSHOT_CHANGED')
    d['actualOrdinaryActorReadability']=ordinary_actor_readability(rows)
    result=materialization_result(d)
    write(OUTPUT/'source-materialization.json',pack(result),0o644)
    write(JOB/'results/batched-source-materialization.json',pack(result));print(json.dumps(result,sort_keys=True))

if __name__=='__main__':main()
