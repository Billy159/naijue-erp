from pathlib import Path
import ast,hashlib,json,re
R=Path.cwd();D=R/'outputs/D1/20261117-r3-two-fixed-artifact-admission-source-02';O=R/'outputs/QB/20261117-r3-two-fixed-artifact-admission-review-01'
sha=lambda b:hashlib.sha256(b).hexdigest();checks={}
def ck(k,v):
 checks[k]=bool(v)
 if not v:raise AssertionError(k)
def val(path,name):return ast.literal_eval(next(n.value for n in ast.parse(path.read_bytes()).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets)))
def load(path):return json.loads(path.read_bytes())
ck('ExactSource',sha((D/'SOURCE-PINS.json').read_bytes())=='846aa1c8626d3a47cea3426a566e5e560e40f9a4ebea5c40040e62ef7266a662')
s=load(D/'SOURCE-PINS.json');ck('AllTenFrozenMembers',len(s['files'])==10 and all(sha((D/k).read_bytes())==v['sha256']and len((D/k).read_bytes())==v['bytes']for k,v in s['files'].items()))
config=load(D/'FIXED-PROFILES.json');profiles=config['profiles'];ck('ModuleExactlyTwoFixedProfiles',profiles==val(D/'r3_two_fixed_artifact_admission.py','PROFILES'))
reuse=load(D/'REUSED-ARTIFACT-EVIDENCE.json');pair=Path(reuse['pairSource']['path']).parent
for field in ('pairSource','pairReview'):
 row=reuse[field];ck(field+'Exact',sha(Path(row['path']).read_bytes())==row['sha256'])
ck('PrivatePriorReviewExact',sha(Path(reuse['private']['priorReviewPath']).read_bytes())==reuse['private']['priorReviewSha256'])
ps=load(pair/'SOURCE-PINS.json');pr=load(Path(reuse['pairReview']['path']))
for kind,p in profiles.items():
 ck(kind+'ReusedScopeAndBundleContracts',p['fixedScope']==pr['fixedScopes'][kind]==load(pair/kind/'FIXED-SCOPE.json')and all(ps['files'][kind+'/'+name]==pin and sha((pair/kind/name).read_bytes())==pin for name,pin in p['bundlePins'].items()))
 ck(kind+'ScopeTimeout',p['timeoutSeconds']==35 and p['maximumWindowMs']==(1080000 if kind=='app' else 600000))
ck('FutureBaselineAndProfileNotClaimed',config['futureActiveRootBaseline']is None and config['dynamicAuthorityPins']is None and s['executionReady']is False and s['registrationCASPrepared']is False)

# Evaluate only the pure patch definitions, with None profile binding. This is
# a source transform of actual signed38 bytes, not a future runtime profile.
p=D/'patch_dispatcher.py';tree=ast.parse(p.read_bytes());ns={'ast':ast,'hashlib':hashlib,'re':re}
nodes=[n for n in tree.body if isinstance(n,(ast.Assign,ast.FunctionDef))];exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pure patch definitions>','exec'),ns)
baseline=R/'outputs/主控/20261117-r3-normal38-registration-window-01/admin_exec.ISSUED.py';raw=baseline.read_bytes();actualpin=sha(raw)
ck('ActualSigned38Dispatcher',actualpin=='e46f75794d7e151b0fba870c3b33786dacb54585e0476736db432fa8e60b4f8c')
patched=ns['render'](raw,actualpin,sha((D/'r3_two_fixed_artifact_admission.py').read_bytes()))
before=ast.parse(raw);after=ast.parse(patched)
def assign(tree,name):return next(ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets))
prefix=assign(before,'R3_ORIGINAL02_ABSENT_KEYS');new=assign(after,'R3_ORIGINAL02_ABSENT_KEYS')
ck('Actual101PrefixPreservedAndExactlyFourAppended',len(prefix)==101 and len(new)==105 and new==prefix+list(ns['KEYS'])and len(set(new))==105)
ck('UnboundTransformNotExecutionReady',assign(after,'FIXED_ARTIFACT_PROFILE_SHA256')is None)
for name in ('R3_ORIGINAL02_ABSENT_SOURCE_SHA256','R3_ORIGINAL02_ABSENT_POLICY_SHA256'):ck(name+'Unchanged',assign(before,name)==assign(after,name))
before_guards=[ast.dump(n)for n in ast.walk(before)if isinstance(n,ast.Compare)and any(isinstance(x,ast.Name)and x.id=='R3_ORIGINAL02_ABSENT_KEYS'for x in n.comparators)];after_guards=[ast.dump(n)for n in ast.walk(after)if isinstance(n,ast.Compare)and any(isinstance(x,ast.Name)and x.id=='R3_ORIGINAL02_ABSENT_KEYS'for x in n.comparators)]
ck('AllThreeActualGuardASTsPreserved',len(before_guards)==3 and before_guards==after_guards)
try:ns['render'](patched,sha(patched),sha((D/'r3_two_fixed_artifact_admission.py').read_bytes()));rejected=False
except AssertionError:rejected=True
ck('AlreadyPatchedSourceRefused',rejected)
ck('ExactFourConfigKeys',set(ns['KEYS'])=={p[k]for p in profiles.values()for k in ('installKey','restoreKey')})

# The exact producer predicate is exercised only on genuine failed03 data.
it=ast.parse((D/'issue_profile.py').read_bytes());fn=next(n for n in it.body if isinstance(n,ast.FunctionDef)and n.name=='validate_closed_receipts');env={};exec(compile(ast.Module(body=[fn],type_ignores=[]),'<pure saved receipt validation>','exec'),env)
V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL37-RUNTIME-01'
normal=load(baseline.parent/'direct38-batched-real.json')
try:env['validate_closed_receipts'](normal,load(V/'prepare/ACTUAL-PREPARE03-RESULT.json'),load(V/'stop/ACTUAL-STOP37-RESULT.json'),load(V/'restore/ACTUAL-RESTORE37-RESULT.json'));rejected=False
except AssertionError:rejected=True
ck('RealFailed03CannotStandInForActualWriter',rejected)
for p in D.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
ck('ProducerNoSelfClockOrPGCalls',not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr in ('time','time_ns','now','utcnow','connect','flock')for n in ast.walk(it)))
mt=ast.parse((D/'r3_two_fixed_artifact_admission.py').read_bytes())
ck('AdapterNoSecondFlockOrPGImplementation',not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr in ('connect','flock')for n in ast.walk(mt)))
e={'checks':checks,'actualExisting38DispatcherSha256':actualpin,'actualProtectedPrefixLength':101,'transformedProtectedCount':105,'transformedProfilePin':None,'meaning':'Pure in-memory patch of signed38 source; not post-writer baseline, profile, registered dispatcher or runtime admission.','actions':{'serverActions':0,'PGConnections':0,'clockCalls':0,'issuerClientReaderCASReceiverOrRootPolicyInvoked':False,'archivesReadRehashedRebuiltOrExtracted':False,'futureAuthorityServiceClockProfileOrPositiveWriterFixtureCreated':False}}
b=(json.dumps(e,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
with(O/'STATIC-EVIDENCE.json').open('xb')as f:f.write(b)
print(json.dumps({'checks':len(checks),'evidenceSha256':sha(b),'actualPrefix':101,'appendedTotal':105},sort_keys=True))
