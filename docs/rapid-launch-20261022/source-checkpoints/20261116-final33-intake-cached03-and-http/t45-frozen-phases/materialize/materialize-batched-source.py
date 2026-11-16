"""One fixed source-only materialization through the original registered root job."""
from pathlib import Path
import hashlib,json,os,re,stat,sys,time

KEY = 't45-r3-batched-root06-source-delta-20261116-01'
GRANT='b16447fbc81f4d64'
JOB=Path('/root/erp-release-20261006-01-worker')/('grant-'+GRANT)/'jobs'/KEY
TARGET=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
OUTPUT=TARGET/'state/installed-real-operation-batched-root06-20261116-01'
SOURCE=OUTPUT/'operation'
PREDECESSOR=TARGET/'state/installed-real-operation-batched-root05-20261116-01'
DATA=TARGET/'state'/TARGET.name/'data'
# Set only after D1/D3's final same-tree delivery; None must refuse execution.
SOURCE_DESCRIPTION_SHA256='6ae38a43efeea1a146fae71fb1cd8d9996d70ec5df2362ebb9e8461d707c2d2e'
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
    return {'requestKey':KEY,'state':'EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION',
        'sourceDescriptionSha256':SOURCE_DESCRIPTION_SHA256,'sourceRowsSha256':d['sourceRowsSha256'],
        'sourceSetSha256':d['sourceSetSha256'],'sourceFiles':387,'sourceRoot':str(SOURCE),
        'predecessorMaterializationSha256':d['predecessorMaterializationSha256'],
        'inheritedUnchangedFiles':371,'changedFiles':16,'originalSourcePreserved':True,'nodeModulesChanged':False,
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
         and p['sourceRowsSha256']==d['predecessorSourceRowsSha256'] and p['sourceFiles']==382
         and p['sourceSetSha256']==d['predecessorSourceSetSha256']
         and p['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
         and p['sourceRoot']==str(PREDECESSOR/'operation'),'EXACT_PROVEN_PREDECESSOR_REQUIRED')
    rowsraw=read(JOB/'bundle/source-rows.json',262144);need(sha(rowsraw)==d['sourceRowsSha256'],'SOURCE_ROWS_DIFFERS')
    rows=json.loads(rowsraw);expected={r['path']:r for r in rows}
    need(len(rows)==len(expected)==387 and all(re.fullmatch(r'[A-Za-z0-9_./-]+',n)
         and not n.startswith('/') and '..' not in n.split('/')
         and not n.startswith(('node_modules/','reference-inputs/')) for n in expected),'EXACT_SOURCE_PATH_REQUIRED')
    changes={r['path']:r for r in d['changes']}
    predecessor_pins = {'adapters/postgres/patches/0028_batched_history_hall_provenance.sql': None, 'adapters/postgres/src/sales-historical-hall-projection.ts': 'e71cbd16fcba764ab7e279094d1cd036939b4668bbc248bcea6beb8e1628308b', 'packages/application/src/historical-sales-hall-evidence.ts': '9f4d82cb39801a6a7d11b95d556bc90fa115f607b2ede00fe588bc8ea2d0a6b5', 'packages/application/src/unified-historical-sales-hall-evidence.ts': '8d4854fa26d65221513e3e6ad74418d85b1ee2732153f2199d300a6eb4e3361a', 'scripts/release/unified-install/batched-import-v1/COMMAND-SUCCESSOR-161-BODIES.json': None, 'scripts/release/unified-install/batched-import-v1/COMMAND-SUCCESSOR-161-DEFINITIONS.json': None, 'scripts/release/unified-install/batched-import-v1/COMMAND-SUCCESSOR-161-MODEL.json': None, 'scripts/release/unified-install/batched-import-v1/COMMAND-SUCCESSOR-PINS.json': None, 'scripts/release/unified-install/fresh35-combined-catalog-v1.mjs': 'a94f298a235ec8a9f78bfb750849145c50bb65925182e88072997bdfb89e42a1', 'scripts/release/unified-install/fresh35-combined-source-v1.mjs': 'c393b5608d0dc95294e77fbf94cd6b393ee43dee41aaa75167215ae96b98741c', 'tools/unified-import/fresh35-host-session.mjs': 'a75d570011954da8c324774dd3bb674dbc9a9b7b2438f0cb322f27ff8b7ac632', 'scripts/release/unified-install/fresh35-admin154-record-v1.mjs': '496d28ee550cadffb33303f75849dea7384601f5af2a1c2450557db52bfd0175', 'tools/unified-import/batched-stream-cli-state.mjs': 'e94791c912f74458dd5689201135c7d5ca03fe090cf42a7b47c389129c66dc43', 'tools/unified-import/r3-service20-entry.mjs': '6c3ec2b2f60746298d1b42e2c1e3e1da8257b9107945acd0dcf7388e406a83a3', 'tools/unified-import/r3-service20-retained-import.mjs': 'd08326e8fb0d16d3eb207ccc1ce89b728b16085f7fe1b1947f640d8775a69cc1', 'tools/unified-import/whole-host-session.mjs': 'e764eb1de1335aff331d7976039ba9519d16bab16b685fe05e2a565bc58fee29'}
    payload_leaves = {'adapters/postgres/patches/0028_batched_history_hall_provenance.sql': '0028_batched_history_hall_provenance.sql', 'adapters/postgres/src/sales-historical-hall-projection.ts': 'sales-historical-hall-projection.ts.json', 'packages/application/src/historical-sales-hall-evidence.ts': 'historical-sales-hall-evidence.ts.json', 'packages/application/src/unified-historical-sales-hall-evidence.ts': 'unified-historical-sales-hall-evidence.ts.json', 'scripts/release/unified-install/batched-import-v1/COMMAND-SUCCESSOR-161-BODIES.json': 'COMMAND-SUCCESSOR-161-BODIES.json', 'scripts/release/unified-install/batched-import-v1/COMMAND-SUCCESSOR-161-DEFINITIONS.json': 'COMMAND-SUCCESSOR-161-DEFINITIONS.json', 'scripts/release/unified-install/batched-import-v1/COMMAND-SUCCESSOR-161-MODEL.json': 'COMMAND-SUCCESSOR-161-MODEL.json', 'scripts/release/unified-install/batched-import-v1/COMMAND-SUCCESSOR-PINS.json': 'COMMAND-SUCCESSOR-PINS.json', 'scripts/release/unified-install/fresh35-combined-catalog-v1.mjs': 'fresh35-combined-catalog-v1.mjs', 'scripts/release/unified-install/fresh35-combined-source-v1.mjs': 'fresh35-combined-source-v1.mjs', 'tools/unified-import/fresh35-host-session.mjs': 'fresh35-host-session.mjs', 'scripts/release/unified-install/fresh35-admin154-record-v1.mjs': 'fresh35-admin154-record-v1.mjs', 'tools/unified-import/batched-stream-cli-state.mjs': 'batched-stream-cli-state.mjs', 'tools/unified-import/r3-service20-entry.mjs': 'r3-service20-entry.mjs', 'tools/unified-import/r3-service20-retained-import.mjs': 'r3-service20-retained-import.mjs', 'tools/unified-import/whole-host-session.mjs': 'whole-host-session.mjs'}
    need(set(changes) == set(predecessor_pins), 'EXACT_DELTA_PATHS_REQUIRED')
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
