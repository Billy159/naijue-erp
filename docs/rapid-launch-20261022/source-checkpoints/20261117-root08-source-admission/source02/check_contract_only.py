"""Check only the double-prepare contract correction and exact runtime byte reuse."""
from pathlib import Path
import ast,hashlib,json
HERE=Path(__file__).resolve().parent;OLD=HERE.with_name('20261117-r3-root08-source-admission-01')
sha=lambda raw:hashlib.sha256(raw).hexdigest()
raw=(OLD/'SOURCE-PINS.json').read_bytes();assert sha(raw)=='522be25769d2ef5d2eb64656b3afde8b7e216cc7ecb8e2f4ee9166841cbd8073'
prior=json.loads(raw);checks=[]
def check(name,ok):assert ok,name;checks.append(name)
allowed={'HANDOFF.md','ROOT08-API-CONTRACT.json','freeze_source.py'}
unchanged=[]
for name,row in prior['files'].items():
 if name in allowed:continue
 data=(HERE/name).read_bytes()
 check('old byte reuse '+name,len(data)==row['bytes']and sha(data)==row['sha256'])
 unchanged.append({'path':name,**row})
check('predecessor522 manifest unchanged',sha((OLD/'SOURCE-PINS.json').read_bytes())==sha((HERE/'PREDECESSOR-SOURCE-PINS.json').read_bytes())==sha(raw))
cli=ast.parse((HERE/'root08_cli.py').read_bytes());run=next(n for n in cli.body if isinstance(n,ast.FunctionDef)and n.name=='run_once')
check('existing run_once has exactly one internal prepare',sum(isinstance(n,ast.Call)and isinstance(n.func,ast.Name)and n.func.id=='prepare'for n in ast.walk(run))==1)
check('existing originalclient delegate remains',any(isinstance(n,ast.Call)and isinstance(n.func,ast.Subscript)and ast.literal_eval(n.func.slice)=='main'for n in ast.walk(run)))
prepare=next(n for n in cli.body if isinstance(n,ast.FunctionDef)and n.name=='prepare')
check('existing mkdir refusal unchanged',any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr=='mkdir'and any(k.arg=='exist_ok'and isinstance(k.value,ast.Constant)and k.value.value is False for k in n.keywords)for n in ast.walk(prepare)))
issuer=ast.parse((HERE/'main_issuer.py').read_bytes());issue=next(n for n in issuer.body if isinstance(n,ast.FunctionDef)and n.name=='issue_once')
check('Main original7parameters unchanged',len(issue.args.args)==7)
generator=ast.parse((HERE/'freeze_source.py').read_bytes())
contract=next(n for n in ast.walk(generator)if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='contract'for x in n.targets)).value
fields={ast.literal_eval(k):v for k,v in zip(contract.keys,contract.values)}
ordered=ast.literal_eval(fields['orderedAPIs']);offline=ast.literal_eval(fields['offlinePreparationOnly'])
apis=[x['api']for x in ordered]
check('ordered full execution has one run_once',apis.count('root08_cli.run_once(actual_cas_result_file)')==1)
check('ordered full execution has no separate prepare','root08_cli.prepare(actual_cas_result_file)'not in apis)
check('separate offline prepare explicit',offline['api']=='root08_cli.prepare(actual_cas_result_file)'and offline['mutuallyExclusiveWith']=='root08_cli.run_once(actual_cas_result_file)')
check('separate offline prepare cannot precede run_once','must not be followed by run_once'in offline['effect'])
check('no repeat local Rootstage preparation','prepare_channel.prepare_local()'not in apis and ast.literal_eval(fields['existingStaticStagePreparation'])['status']=='ALREADY_PREPARED_RUNTIME_BYTES_UNCHANGED')
text=(HERE/'HANDOFF.md').read_text()
check('handoff exact direct single-call correction','不得先调用`prepare`再调用`run_once`'in text and '只调用一次`root08_cli.run_once(actual_cas_result_file)`'in text)
check('no idempotence retry key change in contract','不加幂等/重放或另选key路径'in text)
check('existing88 and66 explicitly reused','88项' in text and '66项' in text and '不重跑'in text)
ast.parse((HERE/'freeze_source.py').read_bytes());checks.append('owner generator syntax only')
reuse={'state':'EXACT_SOURCE522_RUNTIME_AND_UNAFFECTED_BYTES_REUSED','predecessorSourcePinsSha256':sha(raw),
 'changedExistingFilesOnly':sorted(allowed),'unchangedFiles':unchanged,'runtimeCodeChanged':False,
 'workerFactoryRegisterMain7parametersRootEntryWindowKeyPreserved':True,
 'source02PathUsesExistingDynamicHERE':True,'T45PreparedTwoCodeFilesUnchanged':{
  name:prior['files'][name]for name in ('register_exact.py','read_paired_basis.py')},
 'old522AndNeedFixEvidencePreserved':True,'old88Or66OrConsumerRerun':False}
(HERE/'RUNTIME-BYTE-REUSE.json').write_text(json.dumps(reuse,ensure_ascii=False,indent=2)+'\n')
report={'state':'CONTRACT_ONLY_SINGLE_RUN_ONCE_CHECKS_PASS_RUNTIME_UNCHANGED','checksPassed':len(checks),'checks':checks,
 'oldRootChecks88Reused':True,'oldTransportChecks66Reused':True,'consumer4fedAbfaReused':True,
 'issuerReaderCASServerClockOrWorkerCalls':0,'futureAuthorityOrRuntimeFixtures':False,'source02RootReviewStillRequired':True}
(HERE/'CONTRACT-ONLY-CHECKS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'state':report['state'],'checksPassed':len(checks),'exactByteReusedFiles':len(unchanged)}))
if __name__=='__main__':pass
