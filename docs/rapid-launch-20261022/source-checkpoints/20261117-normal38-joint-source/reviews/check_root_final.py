from pathlib import Path
import ast,hashlib,json
R=Path.cwd();D=R/'outputs/D1/20261117-r3-normal38-root-source-02';A=D.with_name('20261117-r3-normal38-root-source-01')
V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01';P=V/'NORMAL38-SOURCE-SUCCESSOR-03'
O=R/'outputs/QB/20261117-r3-normal38-joint-review-01';sha=lambda b:hashlib.sha256(b).hexdigest();checks={}
def ck(k,v):
    checks[k]=bool(v)
    if not v:raise AssertionError(k)
def read(p):return json.loads(p.read_bytes())
def constants(p):
    nodes=[n for n in ast.parse(p.read_bytes()).body if isinstance(n,ast.Assign)]
    for n in nodes:
        for call in (x for x in ast.walk(n)if isinstance(x,ast.Call)):
            assert isinstance(call.func,ast.Name)and call.func.id=='Path' or isinstance(call.func,ast.Attribute)and call.func.attr in ('with_name','items')
    s={'Path':Path};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<static literal and path values>','exec'),s);return s
def defs(p,names,env):
    nodes=[n for n in ast.parse(p.read_bytes()).body if isinstance(n,ast.FunctionDef)and n.name in names]
    assert len(nodes)==len(names)
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pure metadata validators>','exec'),env);return env
s=read(D/'SOURCE-PINS.json');w=read(D/'SIX-PHASES.UNISSUED.json');interface=read(P/'INTERFACE.UNISSUED.json')
ck('ExactFinalRootSource',sha((D/'SOURCE-PINS.json').read_bytes())=='6590c4bfd1bbbf1f370da7b9181119b1ea9dc1f1ac5a73f267753150f07b5ff7')
ck('All22FrozenRootMembersExact',len(s['files'])==22 and all(sha((D/k).read_bytes())==v['sha256']and len((D/k).read_bytes())==v['bytes']for k,v in s['files'].items()))
ck('ExactFinalRulesAndConsumer',sha((D/'SIX-PHASES.UNISSUED.json').read_bytes())==s['rulesSha256']=='48228a026e57fe263545f8a3e30af59e9d3fbd5a22d8b44c4a2fa44d45672acc'and w['consumerSourcePinsSha256']==s['consumerSourcePinsSha256']=='fb8f2e938e62902db3165ed792656eb5ebd3cd13c1dec093dde308e4d1a62aec'and w['consumerInterfaceSha256']==sha((P/'INTERFACE.UNISSUED.json').read_bytes())=='30fe85689b72d4148f930877a455a108e4b924fa82a31992e4571eb6af0fcffe'and w['consumerRulesSha256']==interface['rulesSha256']=='f775c7870086b55e62851dd6b5bb558662ad9474f688c1ed13b8e528844d1ed6')
unchanged=['AST-COMPACTION-EQUIVALENCE.json','EXISTING-PATH-MAP.json','EXISTING37-INPUTS.json','GUARD-PATHS.json','P04-R01-NEGATIVE-JOINT-REGRESSION.json','admin_exec.NORMAL38-UNREGISTERED.py','check_real_prefix.py','collect_guard_paths.py','history_guard_assertions.py','identity_pair.py','issue_registration.py','issuer_aux_pair.py','r3_direct38_aux_prepare.py','read_registration_basis.py']
ck('AllHistoryGuardHelperCapAndIssuerBytesReused',all((A/k).read_bytes()==(D/k).read_bytes()for k in unchanged))
ck('SameTurnHistoryEvidenceReusedWithoutRerun',sha((O/'HISTORY-BASELINE-EVIDENCE.json').read_bytes())=='71d349b142e809e88dfa2dfb634198ebe7fdce59159e9056d3517c1edf52490d')
c=constants(D/'register_cas.py');oc=constants(A/'register_cas.py')
ck('CASOnlyExpectedRulesLiteralChanged',all(c[k]==v for k,v in oc.items()if k not in ('__builtins__','EXPECTED_RULES')))
def without_assignment(path,names):
    return ast.dump(ast.Module(body=[n for n in ast.parse(path.read_bytes()).body if not(isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id in names for t in n.targets))],type_ignores=[]))
ck('CASAllOperationsASTUnchanged',without_assignment(A/'register_cas.py',{'EXPECTED_RULES'})==without_assignment(D/'register_cas.py',{'EXPECTED_RULES'}))
ck('PhaseIssuerOnlyTwoSourcePinsChanged',without_assignment(A/'issue_phase.py',{'FROZEN_RULES_SHA','CONSUMER_SOURCE_PIN'})==without_assignment(D/'issue_phase.py',{'FROZEN_RULES_SHA','CONSUMER_SOURCE_PIN'}))
carrier='original-cas-normal38-carrier.UNISSUED.py'
ck('CarrierOnlyExactCASSourcePinChanged',(A/carrier).read_text().replace(sha((A/'register_cas.py').read_bytes()),sha((D/'register_cas.py').read_bytes()))==(D/carrier).read_text())
ck('ExactHelperAndTemplatePins',sha((D/'r3_direct38_aux_prepare.py').read_bytes())==c['HELPER']and sha((D/'admin_exec.NORMAL38-UNREGISTERED.py').read_bytes())==c['TEMPLATE'])
ck('Original131072Cap',len((D/'register_cas.py').read_bytes())==122272<131072 and len((D/'r3_direct38_aux_prepare.py').read_bytes())==125406<131072)
api=defs(D/'issue_registration.py',{'sha','checked','checked_static_rules'},{'Path':Path,'json':json,'hashlib':hashlib})
rules,folders=api['checked_static_rules'](w,c)
ck('RealFrozenSixFieldSchemaAccepted',len(rules)==6 and rules==w['jobs']==c['EXPECTED_RULES'])
ck('CurrentFolderInterfaceMatches',w['phaseDirectories']==interface['phaseDirectories']and w['consumerSourceDirectory']==str(P))
ck('OnlySixCurrentKeys',c['JOBS']==interface['jobs']and c['JOBS']['writer']=='t45-r3-batched-real-execute-20261115-01')
ck('Native01Outer04PairAcrossRootAndConsumer',w['preparationIdentityMapping']==interface['preparationIdentityMapping']==constants(D/'identity_pair.py')['MAPPING'])
decision_path=Path(w['continuationDecision']['path']);decision=read(decision_path)
ck('ActualMainDecisionAndHistoricalClosureExact',sha(decision_path.read_bytes())==w['continuationDecision']['sha256']=='fe13a24ab163b76493baa8797fb0807acea1c861010998850511a65b2fc0853c'and decision['prior37RestoreReadbackSha256']==w['actualPriorClosedSha256']=='785aae60cdee09935e446ded9af41393338589c2645f66650c87f40529d4be70'and decision['prior37SafeClosureSha256']==w['actual37SafeClosureSha256']=='f5bee4600fe863bf032cad64512010fa6800c52e14f2249e30d1b2514b759d85'and decision['finiteAuthorityIssued']is False)
prior=constants(P/'prior_preserved37.py');prior_api=defs(P/'prior_preserved37.py',{'need','validate_terminal_object','validate_restored_object','binding'},prior)
inputs=read(D/'EXISTING37-INPUTS.json')['rows'];actual={k:read(Path(v['path']))for k,v in inputs.items()}
for phase,key in [('start',prior['KEY']),('stop',prior['STOP']),('restore',prior['RESTORE'])]:prior_api['validate_terminal_object'](actual[phase]['terminal'],key,'COMPLETED',0)
prior_api['validate_restored_object'](actual['restore']['result'])
ck('ConsumerPredecessorPureValidatorsAcceptActual37',prior['SERVICE']==actual['start']['service']and prior_api['binding']()==w['predecessor']['bindings'])
ck('CatalogInputRootHistoricalOnly',set(w['jobs'])=={'apply','start','prepare','writer','stop','restore'}and all(w[k]is True for k in ('inputMaterializationAlreadyCompleted','materializationAlreadyCompleted','inputMaterializeNeverResubmit','materializeNeverResubmit')))
ck('NoDynamicConsumerRuntimeClaims',all(interface[k]is None for k in ('clock','dynamicAuthorities','role38Authority','current38ServiceProof','runtimePins')))

# Static source and wrapper preparation precedes Main's actual clock. This
# checks code order only; no source authority/time-producing function is run.
clock_preparation={}
for filename in ('issue_registration.py','issue_phase.py'):
    tree=ast.parse((D/filename).read_bytes());f=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='issue')
    clocks=[n.lineno for n in ast.walk(f)if isinstance(n,ast.Call)and ast.unparse(n.func)=='time.time_ns'];compiles=[n.lineno for n in ast.walk(f)if isinstance(n,ast.Call)and isinstance(n.func,ast.Name)and n.func.id=='compile']
    ck(filename+'StaticCompileBeforeClock',bool(clocks)and any(line<min(clocks)for line in compiles));clock_preparation[filename]={'clockLine':min(clocks),'compileLines':compiles,'parameters':[x.arg for x in f.args.args]}
ck('RegistrationKeepsSevenActualInputs',len(clock_preparation['issue_registration.py']['parameters'])==7)
for name in s['files']:
    if name.endswith('.py'):compile((D/name).read_bytes(),str(D/name),'exec')
refs=read(D/'JOINT-CHECK-REFERENCES.json')
for group in ('references','currentBindings'):
    for name,row in refs[group].items():ck(group+'_'+name,sha(Path(row['path']).read_bytes())==row['sha256'])
ck('ExactCurrentStageAndWrapperReference',refs['currentStageDeltaEvidence']['sha256']=='deea616f82221c5102830193ecdc3aed93be857d74d6a1f58f0a63fd3b574614'and s['currentInvokeSourceSha256']==refs['currentBindings']['invoke_once.py']['sha256']=='2ca2d032580f51a5101118098ce454b2bac4a3c94a78ad90dba1032b519ace6e')
extra_refs={
 'previousJointHandoff':(V/'NORMAL38-JOINT-WIRING-SOURCE-01/JOINT-CHECK-HANDOFF.json','7564f8efdb16ea5c0d030f2ae1fa5a6171c3999f6e1067da5182d0b3ee416502'),
 'previousFailureGaps':(V/'NORMAL38-JOINT-WIRING-SOURCE-01/FAILURE-COVERAGE-GAPS.json','207a207e394a3c7978e07ad846d2dcaa45181cc391238dca293fbd604aa298fe'),
 'currentJointHandoff':(V/'NORMAL38-JOINT-WIRING-SOURCE-02/JOINT-CHECK-HANDOFF.json','055ebba6871281f217ea32c0d644d371279f98ad56075f62ac065a21e2f6bc0d')}
for name,(p,pin)in extra_refs.items():ck(name+'Exact',sha(p.read_bytes())==pin)
payload=dict(state='FINAL_ROOT02_AND_CONSUMER03_SOURCE_PAIR_CHECKED_NOT_RUNTIME',checks=checks,rootSourcePinsSha256=sha((D/'SOURCE-PINS.json').read_bytes()),rulesSha256=sha((D/'SIX-PHASES.UNISSUED.json').read_bytes()),consumerSourcePinsSha256=sha((P/'SOURCE-PINS.json').read_bytes()),historyBaselineEvidenceSha256=sha((O/'HISTORY-BASELINE-EVIDENCE.json').read_bytes()),consumerEvidenceSha256=sha((O/'CONSUMER-INCREMENT-EVIDENCE.json').read_bytes()),clockPreparationStaticOrder=clock_preparation,actions={'serverActions':0,'PGConnections':0,'clockCalls':0,'clientIssuerReaderCASNativeOrJobInvoked':False,'pureMetadataValidatorsOnly':True,'futureBindingAuthorityTargetOrPositiveReportFixtureCreated':False})
raw=(json.dumps(payload,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
with(O/'ROOT-FINAL-INCREMENT-EVIDENCE.json').open('xb')as f:f.write(raw)
print(json.dumps({'checks':len(checks),'evidenceSha256':sha(raw)},sort_keys=True))
