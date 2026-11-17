"""Finite local AST/byte checks only; no issuer, authority, server or clock calls."""
from pathlib import Path
import ast, hashlib, json, runpy

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
checks={}
def need(value,name):
    assert value,name
    checks[name]=True
def sha(raw):return hashlib.sha256(raw).hexdigest()
def load(path):return json.loads(path.read_bytes())
def tree(path):return ast.parse(path.read_bytes())
def functions(t):return {n.name:n for n in t.body if isinstance(n,ast.FunctionDef)}
def dump(n):return ast.dump(n,include_attributes=False)
def constants(t):
    result={}
    for n in t.body:
        if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
            try:result[n.targets[0].id]=ast.literal_eval(n.value)
            except (ValueError,TypeError):pass
    return result

history=load(HERE/'HISTORY-INPUTS.json')
witness=load(HERE/'SIX-PHASES.UNISSUED.json')
decision=load(Path(witness['continuationDecision']['path']))
need(sha(Path(witness['continuationDecision']['path']).read_bytes())==witness['continuationDecision']['sha256']=='247e9972441b302fbd6d6399b978792e08a9a834c24b33f7565588c933ed9a4b','actualMain247')
consumer=Path(witness['consumerSourceDirectory'])
for leaf,field in [('SOURCE-PINS.json','consumerSourcePinsSha256'),('INTERFACE.UNISSUED.json','consumerInterfaceSha256'),('PHASES39.UNISSUED.json','consumerRulesSha256')]:
    need(sha((consumer/leaf).read_bytes())==witness[field],'peer-'+leaf)
need(witness['consumerSourcePinsSha256']=='dd4a1ba183163c8a4c2e2a85f2dce52124530da945987da63976d21534b488da','onlyFinalConsumer02')
interface=load(consumer/'INTERFACE.UNISSUED.json');blueprint=load(consumer/'PHASES39.UNISSUED.json')
mapping=dict(outerPreparationAttemptKey=decision['outerPreparationAttemptKey'],nativeLogicalPreparationKey=decision['nativeLogicalPreparationRequestKey'],businessWriterRequestKey=decision['businessWriterRequestKey'],batchPlanPath=decision['batchPlanPath'])
need(mapping==witness['preparationIdentityMapping']==interface['preparationIdentityMapping']==blueprint['preparationIdentityMapping'],'Main247IndependentIdentityMapping')
need(witness['jobs']==history['jobs']==decision['jobs']==interface['jobs']=={p:r['jobId']for p,r in blueprint['jobs'].items()},'allSixJobIdentities')
cas=constants(tree(HERE/'register_cas.py'))
helper=constants(tree(HERE/'r3_normal39_continuation.py'))
fields={'jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField'}
rules={p:{k:r[k]for k in fields}for p,r in blueprint['jobs'].items()}
need(rules==cas['STATIC']['expectedRules']==helper['EXPECTED_RULES'],'exactSixConsumerRules')
need(cas['STATIC']['basis']==history['basis'] and len(history['basis'])==33,'basis33Exactly')
need(len(history['private38CustodyStat9'])==len(cas['STATIC']['privateCustodyStatOnly'])==5,'privateFiveStatOnly')
need(not set(history['basis']).intersection(history['private38CustodyStat9']),'noPrivateBodiesOrDigestsInBasis')
for phase,r in rules.items():
    folder=Path(witness['phaseDirectories'][phase])
    need(folder==consumer/phase/'bundle',phase+'Directory')
    for leaf,pin in r['bundlePins'].items():need(sha((folder/leaf).read_bytes())==pin,phase+'-'+leaf)
prior=tree(consumer/'start/bundle/prior_preserved38.py');pc=constants(prior)
binding=functions(prior)['binding'].body[0].value
def prior_literal(n):
    if isinstance(n,ast.Name):return pc[n.id]
    if isinstance(n,ast.Subscript):return prior_literal(n.value)[ast.literal_eval(n.slice)]
    return ast.literal_eval(n)
expected={k.arg:prior_literal(k.value)for k in binding.keywords}
need(witness['predecessor']['bindings']==witness['predecessorBindings']==expected,'actual38PublicPredecessorBinding')
need(witness['priorService']==pc['SERVICE']==history['records38']['stop']['value']['service'],'actual38Service')
need(history['derivedPrior38Ack']['expectedSha256']==pc['ACK'] and history['derivedPrior38Ack']['rawSHAAlreadyObserved']is False and history['derivedPrior38Ack']['mustReadAndVerifyInSingleFresh39Basis']is True,'derivedAckHonestFutureReadBoundary')
need(witness['sourceLineage']==history['sourceLineage'] and witness['operatorReadySha256']==history['sourceLineage']['materializationResultSha256']=='84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065','actualRoot07SourceBinding')
patch=runpy.run_path(str(HERE/'patch_dispatcher.py'),run_name='pure_normal39_patch_check')
module=(HERE/'r3_normal39_continuation.py').read_bytes();actual=(HERE/'ACTUAL69-DISPATCHER.py').read_bytes()
rendered=patch['render'](actual,sha(module),None)
need(rendered==(HERE/'admin_exec.NORMAL39-UNREGISTERED.py').read_bytes(),'deterministicDispatcherTemplate')
oldtree=ast.parse(actual);newtree=ast.parse(rendered);oldc=constants(oldtree);newc=constants(newtree)
need(newc['R3_ORIGINAL02_ABSENT_KEYS'][:102]==oldc['R3_ORIGINAL02_ABSENT_KEYS'] and len(newc['R3_ORIGINAL02_ABSENT_KEYS'])==107,'preserve102AppendOnlyFive')
need(witness['jobs']['writer']in newc['NORMAL39_KEYS'] and len(newc['NORMAL39_KEYS'])==6,'stableWriterOwnedByNewWrapper')
oldf=functions(oldtree);newf=functions(newtree)
need(all(dump(n)==dump(newf[name])for name,n in oldf.items()if name!='execute'),'allOldFunctionsIncludingRoot07AdapterPreserved')
execute=ast.get_source_segment(rendered.decode(),newf['execute'])
need(execute.index('in NORMAL39_KEYS')<execute.index('hold.admit(') and execute.count('hold.admit(')==1,'new39RoutesBeforeOnlyAdmission')
need('admit('not in ast.get_source_segment(actual.decode(),oldf['r3_continuity']),'oldFactoryDoesNotAdmitStableWriter')
oldcas=functions(tree(ROOT/'outputs/D1/20261117-r3-root07-source-admission-01/register_cas.py'));newcas=functions(tree(HERE/'register_cas.py'))
need(all(dump(oldcas[k])==dump(newcas[k])for k in ('need','sha','now','pack','identity','read','sync','put')),'eightOriginalCASPrimitivesUnchanged')
oldt=tree(ROOT/'outputs/D1/20261117-r3-normal38-root-source-02/r3_direct38_aux_prepare.py')
oldmethods={n.name:n for n in ast.walk(oldt)if isinstance(n,ast.FunctionDef)}
newmethods={n.name:n for n in ast.walk(tree(HERE/'r3_normal39_continuation.py'))if isinstance(n,ast.FunctionDef)}
need(all(dump(newmethods[k])==dump(oldmethods[k])for k in ('frozen','submitted','successful','current_service','current_batch_settled_or_absent')),'fiveOriginalGenericMethodsUnchanged')
history_source=ast.get_source_segment(module.decode(),newmethods['validate_history'])
need('require_current_stopped'not in history_source and 'postmaster.pid'not in history_source and '/run/'not in history_source,'historyDoesNotRequireCurrentDataStoppedOrOldPointer')
private_loop=next(n for n in newmethods['validate_history'].body if isinstance(n,ast.For)and'private38CustodyStat9'in dump(n.iter))
need(all(not(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr in ('read','read_bytes','sha'))for n in ast.walk(private_loop)),'privateHistoryLoopStatOnly')
need(cas['MODULE_SHA256']==sha(module) and cas['TEMPLATE_SHA256']==sha(rendered),'CASModuleTemplatePins')
need('SOURCE='+repr(sha((HERE/'register_cas.py').read_bytes()))in(HERE/'original-cas-normal39-carrier.UNISSUED.py').read_text(),'carrierCASPin')
reg=functions(tree(HERE/'issue_registration.py'))['issue'];phase=functions(tree(HERE/'issue_phase.py'))['issue']
need(len(reg.args.args)==7 and len(phase.args.args)==8,'originalSevenEightArgumentAPIs')
phasec=constants(tree(HERE/'issue_phase.py'))
need(phasec['FROZEN_RULES_SHA']==sha((HERE/'SIX-PHASES.UNISSUED.json').read_bytes()) and phasec['CONSUMER_SOURCE_PIN']==witness['consumerSourcePinsSha256'],'phaseIssuerFinalPins')
need(constants(tree(HERE/'issue_registration.py'))['WIP_PENDING']is False and phasec['WIP_PENDING']is False,'sourceCompleteBothIssuers')
need("witness['jobs']['prepare']['jobId']"not in(HERE/'issue_phase.py').read_text(),'phaseIssuerUsesJobIDMapping')
reg_source=ast.get_source_segment((HERE/'issue_registration.py').read_text(),reg)
need(reg_source.index('now=time.time_ns()')>reg_source.index('rules,folders=checked_static_rules(')>reg_source.index('checked_consumer('),'registrationChecksBeforeOnlyClock')
need(reg_source.count('time.time_ns()')==1,'oneMainOnlyIssuanceClock')
for file in HERE.glob('*.py'):
    ast.parse(file.read_bytes())
    need(file.stat().st_size<=131072,'syntaxAndCap-'+file.name)
report=dict(state='LOCAL_STATIC_CHECKS_COMPLETE_NOT_RUNTIME_ACCEPTANCE',sourceOnly=True,checks=checks,checkCount=len(checks),serverActions=0,PGConnections=0,nativeCalls=0,clockCalls=0,issuerInvocations=0,positiveFutureFixtures=0,authoritiesIssued=False,reviewRequired=True)
(HERE/'LOCAL-CHECKS.json').write_text(json.dumps(report,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
print(json.dumps(dict(state=report['state'],checks=len(checks)),sort_keys=True))
