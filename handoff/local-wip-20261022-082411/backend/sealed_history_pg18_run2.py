"""One CLEAR window, one new synthetic sealed18 target. No retry, private input or publication."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, re, secrets, shutil, socket, subprocess, sys

ROOT=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统')
REPO=ROOT/'work/erp-local-source-20261022'
REPORT=ROOT/'work/local-takeover-20261021-control/reports/backend'
RUN=ROOT/'work/local-takeover-20261021-backend-sealed-history-pg18/run-2'
SOCKET=Path('/private/tmp/nj-sealed18-20261022-r2')
PORT=55672
DB='naijue_erp_test_18e00102'
BIN=Path('/Users/billy/pg17/bin')
NODE=ROOT/'naijue-erp-v0.0.1/.runtime/node-v24.21.0-darwin-arm64/bin/node'
REQUIRED=2298478592
ENTRY='tests/integration/sealed-history18.integration.ts'
RESULT=REPORT/'sealed-history18-pg-run2-receipt.json'
assert sys.argv[1:] in [['preflight'],['run-clear-window-2']]
ACTION=sys.argv[1]
now=lambda:datetime.now(timezone.utc).isoformat()
def pin(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def dump(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def context():
    catalog=json.loads((REPORT/'CURRENT_BACKEND_FIXED_POINTS.json').read_text())
    for rel,p in catalog['exactPins'].items():assert pin(REPO/rel)['sha256']==p['sha256'],rel
    ddl=json.loads(subprocess.run([str(NODE),'--input-type=module','-e',"import {HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS as m} from './tests/integration/migration-manifest.ts'; console.log(JSON.stringify(m))"],cwd=REPO,check=True,capture_output=True,text=True).stdout)
    assert [x[0] for x in ddl]==list(range(1,19))
    pending=[ENTRY,'scripts/import-v2/extract-history-cell-evidence.py','tests/support/history18-routine-source-pins.json']
    pending+=['adapters/postgres/migrations/'+name for _,name,_ in ddl]
    seen=set()
    while pending:
        rel=pending.pop()
        if rel in seen:continue
        p=REPO/rel;assert p.is_file() and not p.is_symlink(),rel
        seen.add(rel)
        if p.suffix not in ['.ts','.mjs','.js','.mts']:continue
        for spec in re.findall(r'(?:from\s*|import\s*|import\s*\()\s*[\'\"]([^\'\"]+)[\'\"]',p.read_text()):
            if not spec.startswith('.'):continue
            q=(p.parent/spec).resolve();assert q.is_relative_to(REPO)
            if not q.is_file():
                matches=[Path(str(q)+suffix) for suffix in ['.ts','.mjs','.js','.json'] if Path(str(q)+suffix).is_file()]
                assert len(matches)==1,(rel,spec);q=matches[0]
            pending.append(str(q.relative_to(REPO)))
    for _,name,h in ddl:assert pin(REPO/'adapters/postgres/migrations'/name)['sha256']==h,name
    return [{'path':rel,**pin(REPO/rel)} for rel in sorted(seen)],ddl,len(catalog['exactPins'])
def preflight():
    assert not (RUN.exists() or RUN.is_symlink()),'Never reuse target'
    assert not (SOCKET.exists() or SOCKET.is_symlink()),'Never reuse socket'
    for p in [RUN,*RUN.parents]:assert not p.is_symlink() and not (p/'.git').exists(),'No linked/Git target ancestor'
    with socket.socket() as s:s.bind(('127.0.0.1',PORT))
    version=subprocess.run([str(BIN/'postgres'),'--version'],check=True,capture_output=True,text=True).stdout.strip()
    assert version.endswith('17.11')
    assert subprocess.run([str(NODE),'--version'],check=True,capture_output=True,text=True).stdout.strip()=='v24.21.0'
    pins,ddl,effective=context()
    v=os.statvfs(ROOT);free=v.f_bavail*v.f_frsize
    return {'atUtc':now(),'status':'READY' if free>=REQUIRED else 'NOT_RUN_RESOURCE','data':str(RUN/'data'),'run':str(RUN),'socket':str(SOCKET),'port':PORT,'database':DB,'suite':'sealed-history-0001-0018','entry':ENTRY,'freeBytes':free,'requiredBytes':REQUIRED,'deficitBytes':max(0,REQUIRED-free),'reserveBytes':2147483648,'pgBudgetBytes':134217728,'syntheticAndLogsBudgetBytes':16777216,'runner':pin(Path(__file__)),'contextFiles':len(pins),'contextBytes':sum(p['bytes'] for p in pins),'effectivePinsVerified':effective,'initdbStarted':False,'pgStarted':False,'realPrivateRead':False,'publication':'CLOSED'},pins,ddl
def command(args,log,timeout=40):
    with log.open('x') as out:r=subprocess.run([str(a) for a in args],stdout=out,stderr=subprocess.STDOUT,timeout=timeout)
    if r.returncode:raise RuntimeError('COMMAND_FAILED:'+log.name+':'+str(r.returncode))
def stopped():
    attempted=False
    if (RUN/'data/postmaster.pid').exists():
        attempted=True
        with (RUN/'stop.log').open('x') as out:
            r=subprocess.run([str(BIN/'pg_ctl'),'-D',str(RUN/'data'),'-w','-t','15','-m','fast','stop'],stdout=out,stderr=subprocess.STDOUT,timeout=25)
        stoprc=r.returncode
    else:stoprc=None
    status=subprocess.run([str(BIN/'pg_ctl'),'-D',str(RUN/'data'),'status'],capture_output=True,text=True)
    result={'atUtc':now(),'exactDataDirectory':str(RUN/'data'),'port':PORT,'stopAttempted':attempted,'stopExitCode':stoprc,'pgCtlStatusExit':status.returncode,'postmasterPidAbsent':not(RUN/'data/postmaster.pid').exists(),'deleted':False}
    dump(RUN/'STOPPED.json',result)
    assert result['pgCtlStatusExit']==3 and result['postmasterPidAbsent'],'Owned target stop not independently confirmed'
    return result

prepared,pins,ddl=preflight()
dump(REPORT/'sealed-history18-pg-run2-preflight.json',prepared)
if ACTION=='preflight' or prepared['status']!='READY':
    print(json.dumps(prepared,ensure_ascii=False,indent=2));sys.exit(0 if prepared['status']=='READY' else 3)
# Recheck immediately before the first owned-directory mutation; CLEAR never substitutes free space.
v=os.statvfs(ROOT);free=v.f_bavail*v.f_frsize
if free<REQUIRED:
    prepared.update(status='NOT_RUN_RESOURCE',freeBytes=free,deficitBytes=REQUIRED-free)
    dump(REPORT/'sealed-history18-pg-run2-preflight.json',prepared);print(json.dumps(prepared,ensure_ascii=False,indent=2));sys.exit(3)
assert not RESULT.exists()
RUN.mkdir(parents=True,exist_ok=False);RUN.chmod(0o700)
SOCKET.mkdir(exist_ok=False);SOCKET.chmod(0o700)
result={'atUtc':now(),'status':'STARTING','target':prepared,'commands':[],'contextBefore':pins,'realPrivateRead':False,'publication':'CLOSED'}
try:
    for p in pins:
        q=RUN/'source'/p['path'];q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(REPO/p['path'],q);assert pin(q)=={'bytes':p['bytes'],'sha256':p['sha256']}
    dump(RUN/'SOURCE_PINS.json',pins);dump(RUN/'TARGET.json',prepared)
    (RUN/'synthetic-tmp').mkdir(mode=0o700)
    password=secrets.token_hex(24)
    fd=os.open(RUN/'password',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(password)
    sql="CREATE ROLE naijue_erp_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '"+password+"';\nCREATE DATABASE "+DB+" OWNER naijue_erp_test;\n"
    fd=os.open(RUN/'provision.sql',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(sql)
    result['commands'].append({'command':[str(BIN/'initdb'),'-D',str(RUN/'data'),'-U','backend18_bootstrap','--auth-local=trust','--auth-host=scram-sha-256','--encoding=UTF8','--locale=C','--no-clean']})
    prepared['initdbStarted']=True
    command(result['commands'][-1]['command'],RUN/'initdb.log')
    with (RUN/'data/postgresql.conf').open('a') as f:f.write("\nlisten_addresses='127.0.0.1'\nport="+str(PORT)+"\nunix_socket_directories='"+str(SOCKET)+"'\nmax_connections=20\nshared_buffers='16MB'\nlog_statement='none'\nfsync=on\nfull_page_writes=on\n")
    result['commands'].append({'command':[str(BIN/'pg_ctl'),'-D',str(RUN/'data'),'-l',str(RUN/'server.log'),'-w','-t','15','start']})
    command(result['commands'][-1]['command'],RUN/'start.log');prepared['pgStarted']=True
    result['commands'].append({'command':[str(BIN/'psql'),'-X','-v','ON_ERROR_STOP=1','-h',str(SOCKET),'-p',str(PORT),'-U','backend18_bootstrap','-d','postgres','-f',str(RUN/'provision.sql')]})
    command(result['commands'][-1]['command'],RUN/'provision.log')
    env=dict(os.environ);env['PATH']=str(NODE.parent)+':'+env.get('PATH','');env['TMPDIR']=str(RUN/'synthetic-tmp')
    env.update(NODE_ENV='test',NAIJUE_PG_INTEGRATION='I_APPROVE_A_FRESH_DISPOSABLE_LOCAL_DATABASE',NAIJUE_PG_TEST_SUITE='sealed-history-0001-0018',NAIJUE_PG_EXPECT_DATABASE=DB,NAIJUE_PG_TEST_DATABASE_URL='postgresql://naijue_erp_test:'+password+'@127.0.0.1:'+str(PORT)+'/'+DB)
    args=[str(NODE),'--test','--test-reporter=tap',ENTRY];tap=REPORT/'sealed-history18-pg-run2.tap'
    result['commands'].append({'command':args,'cwd':str(REPO),'dedicatedEnv':'Loopback synthetic test URL, credentials not logged; exact suite/database; owned TMPDIR'})
    with tap.open('x') as out:r=subprocess.run(args,cwd=REPO,env=env,stdout=out,stderr=subprocess.STDOUT,timeout=55)
    result.update(status='PASS' if r.returncode==0 else 'FAIL',exitCode=r.returncode,tap={'path':str(tap),**pin(tap)})
    dump(RUN/'TEST_RESULT.json',{'atUtc':now(),'exitCode':r.returncode,'log':str(tap),'database':DB,'port':PORT})
except BaseException as error:
    result.update(status='FAIL',errorType=type(error).__name__,error=str(error))
finally:
    try:result['stop']=stopped()
    except BaseException as error:result['stopFailure']={'type':type(error).__name__,'message':str(error)};result['status']='FAIL_STOP_UNCONFIRMED'
    drift=[]
    for p in pins:
        if pin(REPO/p['path'])!={'bytes':p['bytes'],'sha256':p['sha256']}:drift.append(p['path'])
    result['sourceDriftAfter']=drift
    if drift:result['status']='FAIL_SOURCE_DRIFT'
    result['syntheticTempEmpty']=not any((RUN/'synthetic-tmp').iterdir()) if (RUN/'synthetic-tmp').exists() else None
    result['finishedAtUtc']=now();dump(RESULT,result)
print(json.dumps({k:v for k,v in result.items() if k not in ['contextBefore','commands']},ensure_ascii=False,indent=2))
sys.exit(0 if result['status']=='PASS' else 1)
