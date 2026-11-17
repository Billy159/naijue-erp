"""One static review of the frozen history closure, with no runtime entry."""
from pathlib import Path
import ast,base64,hashlib,json,posixpath
R=Path.cwd();D=R/'outputs/D1/20261117-r3-normal38-root-source-01'
A=R/'outputs/D1/20261117-r3-normal37-root-source-02'
O=R/'outputs/QB/20261117-r3-normal38-joint-review-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
checks={}
def ck(k,v):
    checks[k]=bool(v)
    if not v:raise AssertionError(k)
def read(p,pin=None):
    raw=Path(p).read_bytes()
    if pin:assert sha(raw)==pin
    return json.loads(raw)
def constants(p):
    tree=ast.parse(p.read_bytes());nodes=[n for n in tree.body if isinstance(n,ast.Assign)]
    for node in nodes:
        for call in (n for n in ast.walk(node)if isinstance(n,ast.Call)):
            assert isinstance(call.func,ast.Name)and call.func.id=='Path' or isinstance(call.func,ast.Attribute)and call.func.attr in ('with_name','items')
    env={'Path':Path}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<static path and literal assignments>','exec'),env)
    return env
def defs(p,names,env):
    nodes=[n for n in ast.parse(p.read_bytes()).body if isinstance(n,ast.FunctionDef)and n.name in names]
    assert len(nodes)==len(names)
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pure source metadata functions>','exec'),env)
    return env
ck('FrozenRoot01',sha((D/'SOURCE-PINS.json').read_bytes())=='25a4e7c2017afe8113af9b55fed3b576de121975de3dc53eac8ef260e8865170')
manifest=read(D/'SOURCE-PINS.json')
ck('FrozenRoot01All21Members',len(manifest['files'])==21 and all(sha((D/k).read_bytes())==v['sha256']and len((D/k).read_bytes())==v['bytes']for k,v in manifest['files'].items()))
c=constants(D/'register_cas.py');h=constants(D/'r3_direct38_aux_prepare.py')
oc=constants(A/'register_cas.py');oh=constants(A/'r3_direct37_aux_prepare.py')
old=read(A/'EXISTING-PATH-MAP.json','a8d82e43eb983e5303e8deb6df38f25fe4f820a751e696e7a99f1555716de123')['existingPins']
actual={str(k):v for k,v in c['BASIS'].items()};saved=read(D/'EXISTING-PATH-MAP.json')
ck('ActualStaticBASISMatchesSavedMap324',len(actual)==324 and actual==saved['existingPins'])
ck('NoOriginalHistoryPathsRenamed',set(old)<=set(actual))
dispatcher=str(c['P']/'admin_exec.py')
decision=read(R/'outputs/主控/20261117-r3-normal38-prepare04-source-continuation-decision-01/DECISION.json','fe13a24ab163b76493baa8797fb0807acea1c861010998850511a65b2fc0853c')
ck('Original288PinsAndOnlyCurrentDispatcherUpdated',all(actual[k]==(decision['activeRootBaseline']['dispatcherSha256']if k==dispatcher else v)for k,v in old.items()))
inputs=read(D/'EXISTING37-INPUTS.json')['rows'];typed={}
for name,row in inputs.items():
    typed[name]=read(row['path'],row['sha256']);ck('Actual37SavedReceipt_'+name,typed[name]==row['value'])
main=R/'outputs/主控/20261117-r3-normal37-registration-window-01'
main_manifest=read(main/'ISSUED.json');envelope=read(main/'registration-envelope.json')
start,stop,restore,prepare,reg,basis=(typed[k]for k in ('start','stop','restore','prepare','registration','stopBasis'))
new={}
B,C,P=c['B'],c['C'],c['P'];HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
for phase in ('apply','start','prepare','stop','restore'):
    t=typed[phase];e=c['HISTORY37'][phase];key=t['terminal']['jobId']
    ck('History37Typed_'+phase,e['key']==key and e['terminal']==t['rootPins']['terminal']and e['root']==t['rootPins']['result']and e['public']==t['publicResultSha256']and e['status']==t['terminal']['status']and e['exitCode']==t['terminal']['exitCode'])
    new[str(B/'jobs'/key/'r3-outer-terminal.json')]=t['rootPins']['terminal']
    new[str(C/'results'/(key+'.json'))]=t['rootPins']['terminal']
    new[str(B/'jobs'/key/'results'/e['leaf'])]=t['rootPins']['result']
    new[str(C/'jobs'/key/'results'/e['leaf'])]=t['publicResultSha256']
pk=prepare['terminal']['jobId'];rk=restore['terminal']['jobId'];sk=start['terminal']['jobId']
child=prepare['final33-prepare-child-cleanup.json']
for owner,pin in ((B,child['rootSha256']),(C,child['publicSha256'])):new[str(owner/'jobs'/pk/'results/final33-prepare-child-cleanup.json')]=pin
for label,leaf in (('cleanup','maintenance-auth-cleanup.json'),('inside','maintenance-auth-inside.json')):new[str(B/'jobs'/rk/'results'/leaf)]=restore['rootPins'][label]
prev_rules=read(A/'SIX-PHASES.UNISSUED.json')
for leaf in ('normal_service05_after08.py','normal_service05_after08_proof.py'):new[str(B/'jobs'/sk/'bundle'/leaf)]=prev_rules['jobs']['start']['bundlePins'][leaf]
new[str(HOST/'authority/fresh35-current-production-service-v2-service-37.json')]=start['service']['proofSha256']
new[str(HOST/'state/native-services'/sk/'retained-ack.json')]=basis['retainedAckSha256']
new[str(HOST/'state/native-services'/sk/'cleanup.json')]=stop['rootPins']['cleanup']
new[str(HOST/'state/native-services/ordinary37-auth-20261116-01/authority.json')]=main_manifest['rolesSha256']
new[str(HOST/'state/native-services/ordinary37-auth-20261116-01/restored.json')]=restore['privateRestorationReceiptSha256']
new[str(P/'r3_direct37_aux_prepare.py')]=reg['actualPins']['module']
new[str(B/'r3-05-write-continuity/direct37-batched-real.json')]=reg['actualPins']['policy']
new[str(B/'r3-normal37-registration-cas-20261117-01/result.json')]=reg['auditResultSha256']
new[str(B/'r3-normal37-registration-source-20261117-01/register_cas.py')]=sha(base64.b64decode(envelope['source'],validate=True))
ck('Independent35NewPathsFromActualTypedFields',len(new)==35 and set(new).isdisjoint(old) and all(actual.get(k)==v for k,v in new.items())and set(actual)==set(old)|set(new))
ck('History36And37OwnReceipts',actual[str(HOST/'state/native-services/ordinary36-auth-20261116-01/authority.json')]=='d8341c2a2f0067bf33073a1001e1f50f7f91f6fb872b626a8d2dbd9d57bea57f'and actual[str(HOST/'state/native-services/ordinary36-auth-20261116-01/restored.json')]=='60d6d5a5b16b321c334222ffaef9dc8ac0a0bf69e822878743a920151bfdbb4d'and actual[str(HOST/'state/native-services/ordinary37-auth-20261116-01/authority.json')]=='60b580ea352d16ad39ce76047a7238a4a0606ea8fb506e16ed3183e4325462ff'and actual[str(HOST/'state/native-services/ordinary37-auth-20261116-01/restored.json')]=='9a4711ac1b3feb35520261f3830e06f08c4ff3d824a66be0f7979cdaeae8d7c9')
ck('All20CustodyMetadataPathsPreserved',c['CUSTODY_FILES']==h['CUSTODY_FILES']==saved['privateMetadataOnlyPaths']and len(c['CUSTODY_FILES'])==20 and set(oc['CUSTODY_FILES'])<=set(c['CUSTODY_FILES'])and not set(c['CUSTODY_FILES'])&set(actual))
ck('Failed03NativeUnknownPreserved',prepare['result']['state']==prepare['result']['nativeConnectionCleanup']=='UNKNOWN'and prepare['result']['failureDiagnostic']['systemCode']=='EACCES'and child['value']['connectionCleanup']=='REAPED_EXCLUSIVE_PROCESS')
historic_changed={'ENTRY','AUDIT','NEW_MODULE','NEW_POLICY','OLD_DISPATCHER','HELPER','TEMPLATE','BASIS','JOBS','EXPECTED_RULES','CUSTODY_FILES'}
ck('AllOtherCASOriginalGlobalsEqual',all(c[k]==v for k,v in oc.items()if k!='__builtins__'and k not in historic_changed))
helper_changed={'POLICY_NAME','JOBS','SERVICE_KEY','PROOF','CUSTODY_FILES','AUXPAIR_OUTER','AUXPAIR_PLAN','AUXPAIR_MAPPING'}
ck('AllOtherHelperOriginalGlobalsEqual',all(h[k]==v for k,v in oh.items()if k!='__builtins__'and k not in helper_changed))
for oldfile,newfile,allowed in [('register_cas.py','register_cas.py',{'scope','required_history','quiet','register'}),('r3_direct37_aux_prepare.py','r3_direct38_aux_prepare.py',{'Original02AbsentContinuation'})]:
    aa={n.name:n for n in ast.parse((A/oldfile).read_bytes()).body if isinstance(n,(ast.FunctionDef,ast.ClassDef))};bb={n.name:n for n in ast.parse((D/newfile).read_bytes()).body if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
    ck(newfile+'AllUnchangedOldFunctionASTs',all(k in bb and ast.dump(v)==ast.dump(bb[k])for k,v in aa.items()if k not in allowed))
    if 'Original02AbsentContinuation'in aa:
        am={n.name:n for n in aa['Original02AbsentContinuation'].body if isinstance(n,ast.FunctionDef)};bm={n.name:n for n in bb['Original02AbsentContinuation'].body if isinstance(n,ast.FunctionDef)}
        ck('OldHelperMethodsUnchangedExceptExplicitHistoryAdmission',all(k in bm and ast.dump(v)==ast.dump(bm[k])for k,v in am.items()if k not in ('original_basis','admit')))
ck('OriginalSourceCapRetained',len((D/'register_cas.py').read_bytes())==122272<131072 and len((D/'r3_direct38_aux_prepare.py').read_bytes())==125406<131072)
collector=defs(D/'collect_guard_paths.py',{'path_expression','collect'},{'ast':ast,'Path':Path})
rows=collector['collect']((D/'register_cas.py').read_text(),('quiet','register'),c)+collector['collect']((D/'r3_direct38_aux_prepare.py').read_text(),('admit',),h)
ck('Collected73CurrentGuardPathsFromFinalSource',len({x['path']for x in rows})==73 and rows==read(D/'GUARD-PATHS.json')['rows'])
extra=collector['collect']((D/'register_cas.py').read_text(),('closed37_history',),c)
paths=[*actual,*c['CUSTODY_FILES']]
ck('AllExistingPathsNormalized',all(Path(x).is_absolute()and x==posixpath.normpath(x)for x in paths))
collisions=[(p,g['path'])for p in paths for g in rows+extra if Path(p)==Path(g['path'])or Path(g['path'])in Path(p).parents]
ck('Existing324PlusPrivate20DisjointFromGuardPaths',not collisions)
assertions=defs(D/'history_guard_assertions.py',{'assert_preserved_history','assert_no_guard_collision'},{'Path':Path,'posixpath':posixpath})
assertions['assert_preserved_history'](actual,old,dispatcher,c['OLD_DISPATCHER']);assertions['assert_no_guard_collision'](paths,rows)
badfile=R/'outputs/D1/20261117-r3-normal37-live-pending04-source-01/live_cas.py';bad=constants(badfile);badrows=collector['collect'](badfile.read_text(),('custody',),bad)
negative=[]
for label,fn,args in [('history',assertions['assert_preserved_history'],(bad['ACTUAL'],old,dispatcher,c['OLD_DISPATCHER'])),('absence',assertions['assert_no_guard_collision'],(list(bad['ACTUAL']),badrows))]:
    try:fn(*args)
    except AssertionError:negative.append(label)
ck('SameAssertionsRejectRealP04R01Twice',negative==['history','absence'])
def protected_keys(path):
    return ast.literal_eval(next(n.value for n in ast.parse(path.read_bytes()).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets)))
prefix=protected_keys(main/'admin_exec.ISSUED.py');keys=protected_keys(D/'admin_exec.NORMAL38-UNREGISTERED.py')
ck('Protected96PrefixPlusFiveCurrentKeys',len(prefix)==96 and len(keys)==101 and keys[:96]==prefix and set(c['JOBS'].values())<=set(keys)and len(keys)==len(set(keys)))
guards=[n for n in ast.walk(ast.parse((D/'admin_exec.NORMAL38-UNREGISTERED.py').read_bytes()))if isinstance(n,ast.Compare)and any(isinstance(x,ast.Name)and x.id=='R3_ORIGINAL02_ABSENT_KEYS'for x in n.comparators)]
ck('AllThreeExistingPhaseAndTerminalGuardsRetained',len(guards)==3)
payload=dict(state='REVIEWED_NORMAL38_UNCHANGED_HISTORY_BASELINE_ONLY_NOT_FINAL_SOURCE_PASS',checks=checks,independentNew37Pins=new,guardPaths=sorted({x['path']for x in rows}),extraHistorical37AbsenceGuardPaths=sorted({x['path']for x in extra}),rootSourcePinsSha256=sha((D/'SOURCE-PINS.json').read_bytes()),sourceCap=131072,negativeRealP04R01=negative,actions={'serverActions':0,'PGConnections':0,'clockCalls':0,'issuerReaderCASNativeOrJobInvoked':False,'futureBindingAuthorityTargetOrPositiveReportFixtureCreated':False})
raw=(json.dumps(payload,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
with(O/'HISTORY-BASELINE-EVIDENCE.json').open('xb')as f:f.write(raw)
print(json.dumps({'checks':len(checks),'newPins':len(new),'guardPaths':len({x['path']for x in rows}),'evidenceSha256':sha(raw)},sort_keys=True))
