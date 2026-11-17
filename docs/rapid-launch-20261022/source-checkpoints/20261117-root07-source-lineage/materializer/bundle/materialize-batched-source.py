"""One fixed source-only materialization through the original registered root job."""
from pathlib import Path
import hashlib,json,os,re,stat,sys,time

KEY = 't45-r3-batched-root07-source-delta-20261117-01'
GRANT='b16447fbc81f4d64'
JOB=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')/KEY
TARGET=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
OUTPUT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root07-20261117-01')
SOURCE=OUTPUT/'operation'
PREDECESSOR=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01')
DATA=TARGET/'state'/TARGET.name/'data'
# Set only after D1/D3's final same-tree delivery; None must refuse execution.
SOURCE_DESCRIPTION_SHA256='c0b18a897fa32f956f0c8d2950b2631c3be1a8debb517fc53f67097e84d3f7b9'
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
    scope()  # No expected or future completion receipt can be produced while unissued.
    return {'requestKey':KEY,'state':'EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION',
        'sourceDescriptionSha256':SOURCE_DESCRIPTION_SHA256,'sourceRowsSha256':d['sourceRowsSha256'],
        'sourceSetSha256':d['sourceSetSha256'],'sourceFiles':387,'sourceRoot':str(SOURCE),
        'predecessorMaterializationSha256':d['predecessorMaterializationSha256'],
        'inheritedUnchangedFiles':386,'changedFiles':1,'originalSourcePreserved':True,'nodeModulesChanged':False,
        'installerRunnerSha256':d['installerRunnerSha256'],'databaseConnections':0,'databaseWrites':0,
        'serviceStarted':False,'liveCatalogVerified':False,'automaticReplay':False}

def main():
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0
         and os.environ.get('ERP_SHARED_TASK_ID')=='T45' and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB)
         and Path(__file__)==JOB/'bundle/materialize-batched-source.py' and len(sys.argv)==2,'REGISTERED_ROOT_ENTRY_REQUIRED')
    raw=read(JOB/'bundle/materialize-authorization.json',65536)
    need(sha(raw)==sys.argv[1],'EXTERNAL_AUTHORITY_DIGEST_REQUIRED')
    at=time.time_ns()//1000000;a=validate(json.loads(raw),at)
    need(sha(read(Path(__file__),65536))==a['sourceSha256'],'SOURCE_AND_REVIEW_REQUIRED')
    raw=read(JOB/'bundle/source-description.json',65536)
    need(sha(raw)==SOURCE_DESCRIPTION_SHA256,'DESCRIPTION_DIFFERS');d=json.loads(raw)
    need(d['format']=='T45_R3_EXACT_FROZEN_SOURCE_DELTA_V1'
         and d['sourceFiles']==387,'EXACT_FROZEN_SOURCE_DELTA_REQUIRED')
    prior=read(PREDECESSOR/'source-materialization.json',65536);p=json.loads(prior)
    need(sha(prior)==d['predecessorMaterializationSha256']
         and p['sourceRowsSha256']==d['predecessorSourceRowsSha256'] and p['sourceFiles']==387
         and p['sourceSetSha256']==d['predecessorSourceSetSha256']
         and p['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
         and p['sourceRoot']==str(PREDECESSOR/'operation'),'EXACT_PROVEN_PREDECESSOR_REQUIRED')
    rowsraw=read(JOB/'bundle/source-rows.json',262144);need(sha(rowsraw)==d['sourceRowsSha256'],'SOURCE_ROWS_DIFFERS')
    rows=json.loads(rowsraw);expected={r['path']:r for r in rows}
    need(len(rows)==len(expected)==387 and all(re.fullmatch(r'[A-Za-z0-9_./-]+',n)
         and not n.startswith('/') and '..' not in n.split('/')
         and not n.startswith(('node_modules/','reference-inputs/')) for n in expected),'EXACT_SOURCE_PATH_REQUIRED')
    changes={r['path']:r for r in d['changes']}
    predecessor_pins = {'tools/unified-import/fresh35-host-session.mjs': '0a10be276269c1aadb3420acaddaed0dce3f1a033bbf9b4d2320ddfe80ecf60b'}
    payload_leaves = {'tools/unified-import/fresh35-host-session.mjs': 'fresh35-host-session.mjs'}
    need(set(changes) == set(predecessor_pins), 'EXACT_DELTA_PATHS_REQUIRED')
    need(d['predecessorMaterializationSha256']=='73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171' and d['predecessorSourceRowsSha256']=='078f2c0019df117ae9a32e2276feebca9094ce6dc91e5eaede3f8d9201202fe9' and d['predecessorSourceSetSha256']=='d20f9f89091f7a0c1006fdadf0c5fecc7711dc7398d8e2cf0471789c2f9ea898','ACTUAL_ROOT06_PREDECESSOR_REQUIRED')
    need(changes['tools/unified-import/fresh35-host-session.mjs']['sha256']=='36f5e49c10a4e7541ed6a77cc377030b7ff343b7bd462ab2001a41040488d368' and changes['tools/unified-import/fresh35-host-session.mjs']['bytes']==105724,'EXACT_REVIEWED_HOST_ONLY_REQUIRED')
    changed = {}
    for name, row in changes.items():
        need(row['payloadLeaf'] == payload_leaves[name] and expected[name]['sha256'] == row['sha256']
             and expected[name]['bytes'] == row['bytes'], 'DELTA_ROWS_DIFFER')
        before=PREDECESSOR/'operation'/name
        expected_old=predecessor_pins[name]
        need(row['beforeSha256']==expected_old,'PREDECESSOR_DELTA_PIN_DIFFERS')
        if expected_old is None:
            need(not os.path.lexists(before),'ADDED_SOURCE_ALREADY_PRESENT')
        else:
            need(sha(read(before,2*1024*1024))==expected_old,'PREDECESSOR_DELTA_CAS_DIFFERS')
        new=read(JOB/'bundle'/row['payloadLeaf'],2*1024*1024)
        need(len(new)==row['bytes'] and sha(new)==row['sha256'],'DELTA_BYTES_DIFFER');changed[name]=new
    runner=read(JOB/'bundle/batched161-run.mjs',65536)
    need(sha(runner)==d['installerRunnerSha256'],'RUNNER_DIFFERS')
    st=DATA.lstat();need([st.st_dev,st.st_ino,st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode)]==scope()['dataIdentity']
         and not os.path.lexists(DATA/'postmaster.pid'),'ORIGINAL_STOPPED_DATA_REQUIRED')
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
    result=materialization_result(d)
    write(OUTPUT/'source-materialization.json',pack(result),0o644)
    write(JOB/'results/batched-source-materialization.json',pack(result));print(json.dumps(result,sort_keys=True))

if __name__=='__main__':main()
