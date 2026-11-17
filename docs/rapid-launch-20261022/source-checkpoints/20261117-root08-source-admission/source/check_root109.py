"""Only the actual109->110 delta. Reuse accepted66 transport/consumer checks."""
from pathlib import Path
import ast,copy,difflib,hashlib,json,re
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
checks=[]
def check(name,value):assert value,name;checks.append(name)
raw=(V/'DURABLE-READONLY-EXECUTION-PREPARATION-03/cas/ACTUAL-CAS-RESULT.json').read_bytes()
check('actualCAS1ea0 exact',sha(raw)=='1ea0b632f7bc1dbac0cc6907fec61d3773d10b4e5a3abad03ac0c47902b9fda8')
receipt=json.loads(raw);static=json.loads((HERE/'STATIC-INPUTS.json').read_bytes())
old=(HERE/'ACTUAL109-DISPATCHER.py').read_text();new=(HERE/'admin_exec.ROOT08-UNREGISTERED.py').read_text()
check('actualdispatcher b401 exact',sha(old.encode())==receipt['dispatcherSha256']=='b4013f9a04e35bfae287742a7d91b9c2a9daf1d06b0768262db01b8de40926de')
check('diagnostic02 actualmodule f6ac exact',sha((V/'DURABLE-READONLY-SOURCE-03/r3_core0_durable_readonly_02.py').read_bytes())==receipt['moduleSha256']=='f6aca8ef0f69f606a8166264c634c5ae44d6e0070c17851a87d02bc1405e3257')
check('actualpolicy02 4b9e retained',static['baselineRootPins']['diagnostic02Policy']==receipt['policySha256']=='4b9e9042efe499a2aff77b93360493d3e00ab505b81f58712410c2e019e50cc5')
check('old01 module and policy retained',static['baselineRootPins']['diagnosticModule']=='0fb16f260ce868b68cc49b20b7ea723c5426a9342ba4aa79200d7dda1ab6d10f'and static['baselineRootPins']['diagnosticPolicy']=='b1f6bebd87b049d35f833b1fb6798e945be787294b9451bfa05232d5516497d3')
a,b=ast.parse(old),ast.parse(new)
funcs=lambda tree:{n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
fa,fb=funcs(a),funcs(b)
def value(tree,name):return ast.literal_eval(next(n.value for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets)))
check('109 exactprefix plus Root08 only110',len(value(a,'R3_ORIGINAL02_ABSENT_KEYS'))==109 and value(b,'R3_ORIGINAL02_ABSENT_KEYS')==value(a,'R3_ORIGINAL02_ABSENT_KEYS')+[static['requestKey']])
for name in fa:
 if name!='execute':check('originalfunction byte-preserved '+name,ast.get_source_segment(old,fa[name])==ast.get_source_segment(new,fb[name]))
execute=copy.deepcopy(fb['execute'])
for node in ast.walk(execute):
 for _,items in ast.iter_fields(node):
  if isinstance(items,list):items[:]=[n for n in items if not(isinstance(n,ast.If)and 'ROOT08_SOURCE_KEY'in ast.dump(n.test))]
check('execute only one Root08 branch added',ast.dump(execute,include_attributes=False)==ast.dump(fa['execute'],include_attributes=False))
guards=lambda tree:[ast.dump(n,include_attributes=False)for n in ast.walk(tree)if isinstance(n,ast.Compare)and any(isinstance(v,ast.Name)and v.id=='R3_ORIGINAL02_ABSENT_KEYS'for v in n.comparators)]
check('exact three guard AST retained',guards(a)==guards(b)and len(guards(b))==3)
argv=lambda fn:next(n.value for n in ast.walk(fn)if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='argv'for t in n.targets))
check('all launch-flag logic byte-equivalent',ast.dump(argv(fa['execute']),include_attributes=False)==ast.dump(argv(fb['execute']),include_attributes=False))
check('only diagnostic02 uses precise-I-S branch',"['-I','-S'] if job_id==DURABLE_CORE0_02_KEY else ['-s']"in new)
check('new Root08 defaults original-s path',value(b,'ROOT08_SOURCE_KEY')!=value(b,'DURABLE_CORE0_02_KEY'))
reg=(HERE/'register_exact.py').read_text();r=ast.parse(reg)
check('CAS actual OLD b401',value(r,'OLD')==receipt['dispatcherSha256'])
def roots(path):
 tree=ast.parse(path.read_text());ns={'Path':Path}
 for node in tree.body:
  if isinstance(node,ast.Assign)and any(isinstance(t,ast.Name)and t.id in ('B','C','P','H','LOCK','LOCK_ID','OLD','PRESERVE','CUSTODY')for t in node.targets):exec(compile(ast.Module(body=[node],type_ignores=[]),'static-path-metadata','exec'),ns)
  elif isinstance(node,ast.Expr)and isinstance(node.value,ast.Call)and isinstance(node.value.func,ast.Attribute)and isinstance(node.value.func.value,ast.Name)and node.value.func.value.id=='PRESERVE':exec(compile(ast.Module(body=[node],type_ignores=[]),'static-path-metadata','exec'),ns)
 return ns
before=roots(V/'DURABLE-READONLY-SOURCE-03/register_exact.py');after=roots(HERE/'register_exact.py')
check('original sharedlock and stat9 identity unchanged',before['LOCK']==after['LOCK']and before['LOCK_ID']==after['LOCK_ID'])
check('all predecessor preservedpins except actual dispatcher upgrade',all(after['PRESERVE'][k]==(receipt['dispatcherSha256']if k.endswith('/admin_exec.py')else v)for k,v in before['PRESERVE'].items()))
check('diagnostic02 module+policy added as exact preservation',after['PRESERVE'][str(after['P']/'r3_core0_durable_readonly_02.py')]==receipt['moduleSha256']and after['PRESERVE'][str(after['H']/'core0-durable-readonly-20261117-02.json')]==receipt['policySha256'])
check('prior failed diagnostic01 terminal retained','8e8af93929b3a17f3b81f7e7e394fa03d54ca4d13a82c105646b5b6ba361af5b'in after['PRESERVE'].values())
base_functions=funcs(ast.parse((V/'DURABLE-READONLY-SOURCE-03/register_exact.py').read_text()));new_functions=funcs(r)
for name in ('need','identity','read','sync','put'):
 check('original CAS helper '+name,ast.dump(base_functions[name],include_attributes=False)==ast.dump(new_functions[name],include_attributes=False))
closure=(HERE/'closure.template.py').read_text();issuer=(HERE/'main_issuer.py').read_text()
check('closure targets exact02, never FAILED01 fallback',"key='t45-r3-core0-durable-readonly-20261117-02'"in closure and "'COMPLETED',0,True"in closure and "'FAILED'"not in closure)
check('closure requires own container and inner cleanup',all(x in closure for x in ('actualContainerId','ownContainerStopped','ownedPidAbsent','pgdataPidAbsent','originalPortAbsent','cleanClusterAfterRead',"state['Running']is False")))
check('issuer exact02 closure and sourceScope field',"closure['requestKey']=='t45-r3-core0-durable-readonly-20261117-02'"in issuer and "scope=static['sourceScope']"in issuer)
check('issuer binds actual closure three pins',"'diagnosticClosedPins':{k:closure[k]"in issuer)
check('CAS fresh closure checked at all4 publish steps',reg.count("quiet(policy['diagnosticClosedPins'])")==4)
admission=(HERE/'r3_root08_source_admission.py').read_text()
check('Root08 admission rereads exact diagnostic02 closure',"c.sha(c.read(diagnostic/leaf))==p['diagnosticClosedPins'][name]"in admission)
check('all issuer static inputs actually exist',set(re.findall(r"static\['([^']+)'\]",issuer))<=set(static))
actual=static['requiredActualDiagnosticClosure']
check('actual terminal68ef only',actual['terminalSha256']=='68ef74f754d803b13788fe420517900570cd4f5c714e264a16b204182d7f65a6')
check('actual result67e2 and cleanup efa0 only',actual['resultSha256']=='67e2ba34665b3f86123bdc6f49cdec697defb3a51091389cf95d60b36a481fd4'and actual['cleanupSha256']=='efa0d88a847a8bf83f1beb2decb5dd3c90918d28155616cef1db338426b3e45a')
check('actual diagnosticCID5a81 distinct futureCNone',actual['actualContainerId']=='5a815d05577502f9d1c18906e19f4cd42e4659d9fbb5264946407ac38f7fd9f7'and static['C']is None)
check('actual snapshot body hashes not definition proof',static['actualDiagnosticScope']['functionDefinitionsObserved']is None and static['actualDiagnosticScope']['SQLUpgradePerformed']is False)
check('preserved existing rows not allDBempty',static['actualDiagnosticScope']['preservedNonzeroTableCounts']=={'audit_change':1,'operation_receipt':1,'schema_migration':27,'staff':1,'user_account':1}and static['actualDiagnosticScope']['allDatabaseEmptyClaimed']is False)
check('all future authority clockCepoch marker stillNone',all(static[k]is None for k in ('finiteAuthority','freshBasis','Root08Marker','clock','C','epoch')))
check('Main actual b07 recovery decision pin',static['actualDiagnosticEvidence']['recoveryDecision']['sha256']=='b07d9ba7ea9320e387ec43a2d99cd93a30faf99bfa95bb60915d8d3d59071b78')
check('fresh paired custody stat9 must agree',"assert closure['custodyStat9']=={str(path):identities[str(path)]"in issuer)
channel=(HERE/'prepare_channel.py').read_text();cli=(HERE/'root08_cli.py').read_text()
check('original stage exact source code files only',"('register_exact.py','read_paired_basis.py')"in channel)
check('original-client CAS separate one-shot API',"def register_once():"in channel and "cas.mkdir(mode=0o700,exist_ok=False)"in channel)
check('job preparation requires actual Root08 CAS match',"registration['dispatcherSha256']"in cli and "registration['moduleSha256']"in cli and "registration['policySha256']"in cli)
check('job execution delegates original clientmain',"client['main']()"in cli and "'08954fa485ba3ec179a25bd69524da5353c9deb01f6890bb6230955adf404e6f'"in cli)
check('job execution preserves original one-shot intent',"SUBMIT-ONCE-INTENT.json"in cli and "output.mkdir(mode=0o700,exist_ok=False)"in cli)
for path in (HERE/'r3_root08_source_admission.py',HERE/'main_issuer.py',HERE/'read_paired_basis.py',HERE/'prepare_channel.py',HERE/'root08_cli.py',HERE/'render_admission.py',HERE/'assemble_registration.py'):
 ast.parse(path.read_text());checks.append('Python syntax '+path.name)
(HERE/'ROOT109-TO-ROOT08.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='actual109-b401.py',tofile='Root08-unregistered110.py')))
report={'state':'ROOT109_TO_ROOT08_110_SOURCE_CHECKS_PASS_NOT_REGISTERED_OR_EXECUTED','checksPassed':len(checks),'checks':checks,
 'reusedNonBaseChecks':66,'consumer4fedAbfaRevalidated':False,'originalClientOrTransportRetested':False,
 'actualBase':receipt['dispatcherSha256'],'originalKeys':109,'candidateKeys':110,'guards':3,
 'issuerReaderCASWorkerServerClockCalls':0,'actualDiagnostic02Terminal':actual['terminalSha256'],'actualRoot08Marker':None}
(HERE/'BASE109-CHECKS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'state':report['state'],'checksPassed':len(checks)}))
