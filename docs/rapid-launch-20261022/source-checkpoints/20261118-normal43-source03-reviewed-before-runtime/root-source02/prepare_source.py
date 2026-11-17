"""Bind only final T45 consumer43 metadata; future authorities stay unissued."""
from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2];OLD=D.with_name('20261117-r3-ordinary42-root-source-02');V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01';CONSUMER=V/'NORMAL43-FULL-DATA-CONTINUATION-SOURCE-02'
sha=lambda b:hashlib.sha256(b).hexdigest()
def checked(p,pin):
 b=Path(p).read_bytes();assert sha(b)==pin,p;return b
def main():
 c_raw=(CONSUMER/'SOURCE-PINS.json').read_bytes();c=json.loads(c_raw);i_raw=(CONSUMER/'INTERFACE.UNISSUED.json').read_bytes();i=json.loads(i_raw)
 actual=json.loads((D/'ACTUAL-HISTORY.json').read_bytes());scope=actual['scope'];h=json.loads((OLD/'HISTORY-INPUTS.json').read_bytes())
 assert c['sourceOnly']is True and i['phaseOrder']==scope['phaseOrder']
 fields=('jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField');rules={p:{k:i['jobs'][p][k]for k in fields}for p in i['phaseOrder']}
 assert {p:r['jobId']for p,r in rules.items()}==scope['jobs']and {p:r['timeoutSeconds']for p,r in rules.items()}==scope['phaseBudgetsSeconds']
 for p,r in rules.items():
  for n,pin in r['bundlePins'].items():checked(Path(i['jobs'][p]['sourceDirectory'])/n,pin)
 h['historical41Service']=h['priorService'];h['historical41Bindings']=h['predecessor']['bindings']
 h['actualInputs']+=actual['actualInputs'];h.pop('actual122',None)
 u=actual['upgrade42'];st=actual['stop42'];rt=actual['restore42'];start=actual['phase42']['start']
 closed=dict(phase42WorkDeadline=start['safeFacts']['actualSharedServiceWorkDeadline'],actualRoot127=actual['actualRoot127'],service=u['result']['service'],upgrade=dict(key=u['requestKey'],terminalSha256=u['rootPins']['terminal'],rootResultSha256=u['rootResultSha256'],value=u['result']),stop=dict(key=st['requestKey'],terminalSha256=st['terminal']['sha256'],rootResultSha256=st['results']['normal05-preserve-stop-result.json']['rootSha256'],value=st['results']['normal05-preserve-stop-result.json']['value'],cleanupSha256=st['guardianCleanup']['sha256'],cleanup=st['guardianCleanup']['value']),restore=dict(key=rt['requestKey'],terminalSha256=rt['terminal']['sha256'],rootResultSha256=rt['results']['maintenance-auth-result.json']['rootSha256'],value=rt['results']['maintenance-auth-result.json']['value'],cleanupSha256=rt['results']['maintenance-auth-cleanup.json']['rootSha256'],safeReceiptSha256=rt['privateSafeRestoreReceipt']['sha256'],ownContainer=rt['actualStoppedOwnRestoreContainer']),start=dict(key=start['requestKey'],terminalSha256=start['terminal']['sha256'],rootResultSha256=start['rootResultSha256']))
 h.update(state='ACTUAL127_WITH_SOURCE43_RETAINED_PREPARE05_NO_RUNTIME_AUTHORITY',actualRootPins={**h['actualRootPins'],'dispatcher':scope['actualBeforeDispatcherSha256']},closed42=closed,custodyStat9=actual['custodyStat9'],prepare05=actual['prepare05'],oldKeys=127,newKeys=5,candidateKeys=132,phaseOrder=scope['phaseOrder'],jobs=scope['jobs'],expectedRules=rules,policyName=i['rootPolicyLeaf'],policyFormat=i['rootPolicyFormat'],consumerDirectory=str(CONSUMER),consumerSourceDirectory=str(CONSUMER),consumerSourcePinsSha256=sha(c_raw),consumerInterfaceSha256=sha(i_raw),consumerFrozenInterfaceSha256=sha(i_raw),consumerRulesSha256=sha((CONSUMER/'PHASES43.UNISSUED.json').read_bytes()),phaseDirectories={p:i['jobs'][p]['sourceDirectory']for p in i['phaseOrder']},consumerReviewSha256=None,consumerReviewPath=None,priorService=i['priorService'],predecessor={'bindings':i['previousStartBindings']},stopCurrentBatchOperations=i['stopCurrentBatchOperations'],noWriterKeySelected=False,completedPrepareOnlyHistoricalReference=True,installedAfter42Catalog=u['result']['batchedCatalog'],operatorReadySha256=h['root08']['markerSha256'],minimumAvailableBytes=scope['minimumAvailableBytes'])
 old_w=json.loads((D.with_name('20261117-r3-normal38-root-source-01')/'SIX-PHASES.UNISSUED.json').read_bytes())
 for ref in (old_w['historicalInstallReadbackRef'],old_w['completionReadbackRefs']['input_materialize']):
  checked(ref['path'],ref['sha256']);h['actualInputs'].append(ref)
 lineage=json.loads((CONSUMER/'writer/bundle/source-catalog-lineage.json').read_bytes())
 e=lineage['historicalCatalogEvidence'];install=old_w['historicalInstall'];inp=old_w['actualCompletedPreparation']['input_materialize']
 h['historicalPlanCustody']=i['historicalPlanCustody'];assert set(i['historicalPlanCustody']['paths'])==set(__import__('runpy').run_path(str(D/'plan_custody.template.py'),init_globals={'Path':Path})['PLAN_CUSTODY'])
 h['writerHistoricalPins']=dict(batchedCatalog=lineage['historicalCatalog'],catalogUpdateTerminalSha256=e['terminalSha256'],catalogUpdateResultSha256=e['resultSha256'],catalogUpdateCompletionSha256=e['completionSha256'],installTerminalSha256=install['terminalSha256'],installResultSha256=install['rootResultSha256'],inputMaterializationTerminalSha256=inp['terminalSha256'],inputMaterializationResultSha256=inp['rootResultSha256'])
 timing_path=R/'outputs/主控/20261118-r3-after42-source43-scope-01/ROLE-TIMING-ADDENDUM-01.json'
 timing_raw=checked(timing_path,'6ac3a4e070f4a108bfbbae5e6dde1293330a3577ed4a34ecdd1408ee7d07cd11');h['roleTimingAddendum']=dict(path=str(timing_path),sha256=sha(timing_raw));h['actualInputs'].append(h['roleTimingAddendum'])
 execution_dir=V/'NORMAL43-EXECUTION-CONSUMER-02';execution_raw=checked(execution_dir/'INTERFACE.UNISSUED.json','c36a65dda42b2f0a15de00a450e1cfbfe90e4541f899fd201386d5c8af4a4418');execution=json.loads(execution_raw)
 assert execution['phaseOrder']==i['phaseOrder']and all({k:execution['jobs'][p][k]for k in fields}==rules[p]for p in rules)
 for p in rules:
  for leaf,pin in rules[p]['bundlePins'].items():checked(Path(execution['jobs'][p]['sourceDirectory'])/leaf,pin)
 h.update(executionConsumerDirectory=str(execution_dir),executionInterfacePath=str(execution_dir/'INTERFACE.UNISSUED.json'),executionInterfaceSha256=sha(execution_raw),phaseDirectories={p:execution['jobs'][p]['sourceDirectory']for p in rules})
 correction_path=R/'outputs/主控/20261118-r3-after42-source43-scope-01/INITIALIZER-CUSTODY-CORRECTION-01.json'
 correction_raw=checked(correction_path,'95fecf1ef02a2cff2220026da550263e76ac2184ec87b98a429d775c6faeb9f6');h['initializerCustodyCorrection']=dict(path=str(correction_path),sha256=sha(correction_raw));h['actualInputs'].append(h['initializerCustodyCorrection'])
 initializer_path=next(k for k in i['historicalPlanCustody']['paths']if k.endswith('/original-initializer.json'))
 assert i['historicalPlanCustody']['paths'][initializer_path]['bytes']==actual['prepare05']['result']['processCleanup']['privateInitializer']['bytes']==58716444
 # Review binding is added only from a real final consumer QA receipt.
 review_config=D/'CONSUMER-REVIEW-REF.json'
 if review_config.exists():
  ref=json.loads(review_config.read_bytes());review=json.loads(checked(ref['path'],ref['sha256']));assert review['sourceOnly']is True and review['findings']==[]and review['sourcePinsSha256']==h['consumerSourcePinsSha256']and review['interfaceSha256']==h['consumerInterfaceSha256'];h['consumerReviewSha256']=ref['sha256'];h['consumerReviewPath']=ref['path']
 h['consumer43Interface']=i
 (D/'HISTORY-INPUTS.json').write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n')
 (D/'FIVE-PHASES.UNISSUED.json').write_text(json.dumps(dict(h,futureC=None,futureWindow=None,historyOnlyNoRuntimeAuthorization=True),ensure_ascii=False,sort_keys=True,indent=2)+'\n')
 print('Bound exact final consumer43 SOURCE without runtime calls.')
if __name__=='__main__':main()
