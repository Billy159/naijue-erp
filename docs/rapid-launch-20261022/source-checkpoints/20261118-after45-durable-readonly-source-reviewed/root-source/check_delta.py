from pathlib import Path
import ast,json,hashlib
D=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D1/20261118-r3-after45-businessroot-durable-root-source-01');R=D.parents[2];O=R/'outputs/D1/20261118-r3-original-auth45-guardian-restore-root-source-03';checks=[];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ok(x,l):
 assert x,l
 checks.append(l)
def metadata(p):
 e={'Path':Path}
 for n in ast.parse(p.read_text()).body:
  if isinstance(n,ast.Assign)and any(isinstance(a,ast.Name)and a.id in ('B','C','P','H','PRESERVE','CUSTODY','NEW_MODULE','NEW_POLICY','AUDIT','PENDING','ENTRY')for a in n.targets):exec(compile(ast.Module(body=[n],type_ignores=[]),'immutable_metadata','exec'),e)
 return e
h=json.loads((D/'HISTORY.json').read_bytes());b=json.loads((D/'CONSUMER-BINDING.json').read_bytes());old=ast.parse((D/'ACTUAL143-DISPATCHER.py').read_text());new=ast.parse((D/'admin_exec.DURABLE-UNREGISTERED.py').read_text())
def keys(t):return ast.literal_eval(next(n.value for n in t.body if isinstance(n,ast.Assign)and any(isinstance(a,ast.Name)and a.id=='R3_ORIGINAL02_ABSENT_KEYS'for a in n.targets)))
ok(sha(D/'ACTUAL143-DISPATCHER.py')==h['dispatcherSha256']=='f7d3d324aefca45933085b5a5e14c6802695585011ecdff48ac69df36e5c521e','Actual143 baseline reconstructed exactly')
ok(len(keys(old))==143 and keys(new)==keys(old)+[h['newJobId']],'Original143 keys plus sole readonly key to144')
of={n.name:n for n in old.body if isinstance(n,ast.FunctionDef)};nf={n.name:n for n in new.body if isinstance(n,ast.FunctionDef)};ok(all(ast.dump(v)==ast.dump(nf[k])for k,v in of.items()if k!='execute'),'All original dispatcher functions except execute unchanged')
ex=nf['execute'];count=0
for node in ast.walk(ex):
 for field,val in ast.iter_fields(node):
  if isinstance(val,list):
   kept=[]
   for v in val:
    if isinstance(v,ast.If)and isinstance(v.test,ast.Compare)and isinstance(v.test.comparators[0],ast.Name)and v.test.comparators[0].id=='AFTER45_DURABLE_KEY':count+=1
    else:kept.append(v)
   setattr(node,field,kept)
for node in ast.walk(ex):
 if isinstance(node,ast.Compare)and isinstance(node.ops[0],ast.In)and isinstance(node.comparators[0],ast.Tuple)and [getattr(x,'id',None)for x in node.comparators[0].elts]==['DURABLE_CORE0_02_KEY','AFTER45_DURABLE_KEY']:
  node.ops=[ast.Eq()];node.comparators=[ast.Name(id='DURABLE_CORE0_02_KEY',ctx=ast.Load())]
ok(count==1 and ast.dump(ex)==ast.dump(of['execute']),'Only new admission branch and exact new isolated argv exception; old guards preserved')
n=metadata(D/'register_cas.py');a=metadata(O/'register_cas.py');expected=dict(a['PRESERVE']);expected[str(n['P']/'admin_exec.py')]=h['dispatcherSha256'];expected[str(n['P']/'r3_original_auth45_guardian_restore.py')]=h['previousModuleSha256'];expected[str(n['H']/'original-auth45-guardian-restore-only-20261118-01.json')]=h['previousPolicySha256']
for leaf,pin in [('r3-outer-terminal.json',h['restore']['terminalSha256']),('results/maintenance-auth-result.json',h['restore']['resultSha256']),('results/maintenance-auth-cleanup.json',h['restore']['cleanupSha256'])]:expected[str(n['B']/'jobs'/h['restore']['key']/leaf)]=pin
ok(n['PRESERVE']==expected and len(expected)==110,'All corrected historical paths and hashes inherited exactly with explicit actual143 and restore receipts')
ok(n['CUSTODY']==a['CUSTODY']and len(n['CUSTODY'])==31,'Existing31 original auth snapshots remain stat only')
ok((set(n['PRESERVE'])|{str(p)for p in n['CUSTODY']}).isdisjoint({str(n[k])for k in ('NEW_MODULE','NEW_POLICY','AUDIT','PENDING')}),'Historical preservation disjoint all new absent targets')
# No original registration lock/publish/identity operation is changed.
af={x.name:ast.dump(x)for x in ast.parse((O/'register_cas.py').read_text()).body if isinstance(x,ast.FunctionDef)};bf={x.name:ast.dump(x)for x in ast.parse((D/'register_cas.py').read_text()).body if isinstance(x,ast.FunctionDef)}
ok(all(af[k]==bf[k]for k in ('identity','read','sync','put','basis','snapshot','quiet')),'Original CAS lock metadata and lifecycle primitives reused')
source=Path(b['consumerSourceDirectory']);pins=json.loads((source/'SOURCE-PINS.json').read_bytes());ok(sha(source/'SOURCE-PINS.json')==h['consumerSourcePinsSha256'],'Exact owner consumer source pin')
for leaf,pin in b['rule']['bundlePins'].items():ok(sha(Path(b['consumerBundleDirectory'])/leaf)==pin,'Exact consumer member '+leaf)
# Extract only actual stored restoration predicates, never execute a factory/read function.
mod=ast.parse((D/'r3_after45_businessroot_durable_readonly.py').read_text());f=next(x for x in mod.body if isinstance(x,ast.FunctionDef)and x.name=='read_closed_basis');need={x.args[1].value:x.args[0]for x in ast.walk(f)if isinstance(x,ast.Call)and isinstance(x.func,ast.Name)and x.func.id=='need'and isinstance(x.args[1],ast.Constant)};j=json.loads(Path(h['restoreReadback']['path']).read_bytes());env={'x':h['restore'],'t':j['terminal']['value'],'r':j['results']['maintenance-auth-result.json']['value'],'c':j['results']['maintenance-auth-cleanup.json']['value']}
for label in ('ACTUAL45_ORIGINAL_AUTH_RESTORATION_RECEIPT_REQUIRED','ACTUAL45_RESTORATION_HELPER_CLEANUP_REQUIRED'):ok(eval(compile(ast.Expression(need[label]),'<actual_restoration_metadata>','eval'),env),label)
issuer=(D/'issue_registration.py').read_text();ok(issuer.count('time.time_ns()')==1 and 'now+900000' in issuer and 'now+180000' in issuer and "roleChangesAuthorized']is False" in issuer and "businessWritesAuthorized']is False" in issuer,'Sole clock after final source reviews Main decision and fresh; readonly900 and CAS180')
ok('SOURCE' in (D/'prepare_channel.py').read_text()and 'r3_after45_businessroot_durable_readonly.py' in (D/'prepare_channel.py').read_text(),'Original channel exact new three source files')
for p in D.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
ok(True,'Syntax checked only no source entry factory or positive runtime fixture')
(D/'DELTA-CHECKS.json').write_text(json.dumps({'state':'PASS_SOURCE_ONLY_NOT_OBSERVED','checks':checks,'count':len(checks),'serverActions':0,'clockAUTHCASJobs':0,'NodePGFactory':0,'credentialsInitializerSQLiteBodiesRead':False},ensure_ascii=False,indent=2)+'\n');print('CHECKS',len(checks))
