"""One fixed source-only materialization through the original registered root job."""
from pathlib import Path
import hashlib,json,os,re,stat,sys,time,subprocess

KEY = 't45-r3-batched-root08-source-delta-20261117-01'
GRANT='b16447fbc81f4d64'
JOB=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')/KEY
TARGET=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
OUTPUT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root08-20261117-01')
SOURCE=OUTPUT/'operation'
PREDECESSOR=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root07-20261117-01')
DATA=TARGET/'state'/TARGET.name/'data'
# Static SOURCE profile is not execution authority. No authority file is delivered.
SOURCE_DESCRIPTION_SHA256='5445b6ba2363d4f59a04edb927d91ef145873ce31a8266ea781955618b746ec6'
sha=lambda b:hashlib.sha256(b).hexdigest()


def need(ok,code):
    if not ok:raise ValueError('BATCHED_SOURCE_'+code)


def trusted_parents(path):
    for parent in reversed(path.parents):
        s=parent.lstat()
        need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022 and not parent.is_symlink(),'TRUSTED_ROOT_PARENT_REQUIRED')


def read(path,maximum):
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
    need(type(a['startsAt']) is type(a['expiresAt']) is int and a['startsAt']<=at<at+300000<a['expiresAt']<=a['startsAt']+1800000,'FINITE_WINDOW_REQUIRED')
    need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512
         and re.fullmatch('[a-f0-9]{64}',a['independentReviewSha256']) and re.fullmatch('[a-f0-9]{64}',a['sourceSha256']),'SOURCE_AND_REVIEW_REQUIRED')
    return a


def materialization_result(d):
    scope()  # Called only after the authorized filesystem copy and final protection checks.
    return {'requestKey':KEY,'state':'SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED',
        'sourceDescriptionSha256':SOURCE_DESCRIPTION_SHA256,'sourceRowsSha256':d['sourceRowsSha256'],
        'sourceSetSha256':d['sourceSetSha256'],'sourceFiles':392,'sourceRoot':str(SOURCE),
        'predecessorMaterializationSha256':d['predecessorMaterializationSha256'],
        'inheritedUnchangedFiles':384,'changedFiles':3,'addedFiles':5,'originalSourcePreserved':True,'nodeModulesChanged':False,
        'installerRunnerSha256':d['installerRunnerSha256'],'databaseConnections':0,'databaseWrites':0,
        'serviceStarted':False,'liveCatalogVerified':False,'automaticReplay':False,
        'SQLUpgradePerformed':False,'importReady':False,'businessDurableState':'UNKNOWN',
        'sourceModelSha256':d['sourceModelSha256'],'oldLineageProvesNewSQLInstalled':False}


def check_delta(d,rows,prior_rows):
    need(d['format']=='D1_ROOT08_EXACT_SOURCE_MATERIALIZATION_PROFILE_V1'
         and d['requestKey']==KEY and d['outputDirectory']==str(OUTPUT)
         and d['predecessorDirectory']==str(PREDECESSOR) and d['sourceFiles']==392
         and d['changedFiles']==3 and d['addedFiles']==5 and d['inheritedUnchangedFiles']==384,
         'EXACT_ROOT08_PROFILE_REQUIRED')
    expected={r['path']:r for r in rows};previous={r['path']:r for r in prior_rows}
    need(len(rows)==len(expected)==392 and len(prior_rows)==len(previous)==387
         and set(previous)<=set(expected) and all(re.fullmatch(r'[A-Za-z0-9_./-]+',n)
         and not n.startswith('/') and '..' not in n.split('/')
         and not n.startswith(('node_modules/','reference-inputs/')) for n in expected),'EXACT_SOURCE_PATH_REQUIRED')
    changes={r['path']:r for r in d['changes']}
    need(len(d['changes'])==len(changes)==8 and set(changes)=={n for n in expected if expected[n]!=previous.get(n)},'EXACT_EIGHT_DELTAS_REQUIRED')
    need(sum(n in previous for n in changes)==3 and sum(n not in previous for n in changes)==5,'EXACT_THREE_CHANGED_FIVE_ADDED_REQUIRED')
    for name,row in changes.items():
        need(re.fullmatch(r'delta-0[0-7]\.asset',row['payloadLeaf'])
             and row['beforeSha256']==(previous[name]['sha256']if name in previous else None)
             and expected[name]=={k:row[k]for k in ('bytes','path','sha256')},'DELTA_ROWS_DIFFER')
    need(len({r['payloadLeaf']for r in changes.values()})==8,'UNIQUE_DELTA_ASSETS_REQUIRED')
    return expected,changes


def closed39():
    jobs=JOB.parent
    def fact(key,leaf,pin):
        raw=read(jobs/key/leaf,262144);need(sha(raw)==pin,'ACTUAL_CLOSED39_FACT_DIFFERS');return json.loads(raw)
    terminal=fact('t45-r3-batched-real-execute-20261115-01','r3-outer-terminal.json','00132d00459328530dd4656d9a9e853b81abfbc92a73076fcde733d080cbdb35')
    result=fact('t45-r3-batched-real-execute-20261115-01','results/final33-writer-result.json','ad8746e056c391d9f9b7bd63728f53fecccb7a550c867cd47b0a443bfff70fb1')
    need(terminal['status']=='FAILED' and terminal['exitCode']==2
         and result['nativeConnectionCleanup']=='CLOSED'
         and result['nativeResultSha256']=='6b74421e4b43fb1580b622c94e39a3d0f79108df157f4c369b27dda0bb6c06d3'
         and all(result['processCleanup'][k]is True for k in ('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty')),'ACTUAL_FAILED_WRITER_AND_CLEANUP_REQUIRED')
    stop=fact('t45-r3-ordinary39-preserve-stop-20261116-01','results/normal05-preserve-stop-result.json','73567688aaa35d1a2b303ed03c03e5403ed648625131434b2338d4974a41a0d7')
    restore=fact('t45-r3-ordinary39-auth-restore-20261116-01','results/maintenance-auth-result.json','08f94d2ddcc78e733cac57313d04b0573a8003d81fe76a1ad482c6d716ecbeca')
    need(stop['pgStopped']is True and restore['result']['databaseStillStopped']is True
         and restore['result']['exactOriginalVerifierAndExpiryVerifiedPrivately']is True
         and restore['cleanup']['confirmed']is True and restore['cleanup']['ownContainerStopped']is True,'ACTUAL_STOP_AND_EXACT_RESTORE_REQUIRED')
    # Current root registration/admission must serialize this job. Do not bind a
    # future dispatcher digest here: list current units and exclude only this job.
    q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating',
        'naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
    own='naijue-erp-op-'+GRANT[:8]+'-'+sha(KEY.encode())[:12]+'.service'
    need(q.returncode==0 and not q.stderr and all(line.split()[0]==own for line in q.stdout.decode().splitlines()if line.strip()),'NO_OTHER_OPERATION_REQUIRED')
    need(not os.path.lexists(DATA/'postmaster.pid'),'ORIGINAL_STOPPED_DATA_REQUIRED')


def protected_stat9():
    paths=[DATA,TARGET/'state/r3-final33-private-import-input-20261116-01',
        JOB.parent/'t45-r3-first-admin-custody-receive-20261113-01/custody/original-a.json',
        JOB.parent/'t45-r3-batched-real-execute-20261115-01/native-private/native-result.json']
    plan=TARGET/'state/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-05'
    paths.extend(plan/name for name in ('original-initializer.json','batched-plan.sqlite'))
    snapshot=TARGET/'state/native-services/ordinary39-auth-20261116-01'
    paths.extend(snapshot/name for name in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json'))
    # Original inputs are metadata only. No payload or authentication body is read.
    source=paths[1]
    for directory,dirs,files in os.walk(source,followlinks=False):
        paths.extend(Path(directory)/name for name in dirs+files)
    result={}
    for path in paths:
        s=path.lstat();need(not stat.S_ISLNK(s.st_mode),'PROTECTED_SYMLINK_FORBIDDEN')
        result[str(path)]=(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
    return result

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
         and p['sourceRowsSha256']==d['predecessorSourceRowsSha256'] and p['sourceFiles']==387
         and p['sourceSetSha256']==d['predecessorSourceSetSha256']
         and p['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
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
    closed39();protected_before=protected_stat9()
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
    closed39();need(protected_stat9()==protected_before,'ORIGINAL_DATA_INPUT_OR_SNAPSHOT_CHANGED')
    result=materialization_result(d)
    write(OUTPUT/'source-materialization.json',pack(result),0o644)
    write(JOB/'results/batched-source-materialization.json',pack(result));print(json.dumps(result,sort_keys=True))

if __name__=='__main__':main()
