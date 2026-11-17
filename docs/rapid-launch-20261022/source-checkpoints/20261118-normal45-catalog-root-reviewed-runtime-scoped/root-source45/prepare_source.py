"""Bind final consumer44 to preserved real132/failed43 and original prepare05."""
from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2]
OLD=D.with_name('20261118-r3-ordinary44-root-source-01')
sha=lambda b:hashlib.sha256(b).hexdigest()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin,path;return raw
def main():
 a=json.loads((D/'ACTUAL-HISTORY.json').read_bytes());scope=a['scope'];h=json.loads((OLD/'HISTORY-INPUTS.json').read_bytes())
 ref=json.loads((D/'CONSUMER-REF.json').read_bytes());folder=Path(ref['sourceDirectory']);execution=Path(ref['executionDirectory'])
 source_raw=checked(folder/'SOURCE-PINS.json',ref['sourcePinsSha256']);source=json.loads(source_raw)
 interface_raw=checked(folder/'INTERFACE.UNISSUED.json',ref['interfaceSha256']);i=json.loads(interface_raw)
 rules_raw=checked(folder/'PHASES45.UNISSUED.json',ref['rulesSha256'])
 execution_raw=checked(execution/'INTERFACE.UNISSUED.json',ref['executionInterfaceSha256']);e=json.loads(execution_raw)
 assert source['sourceOnly']is True and i['phaseOrder']==e['phaseOrder']==scope['phaseOrder']
 for leaf,row in source['files'].items():assert len(checked(folder/leaf,row['sha256']))==row['bytes']
 fields=('jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField')
 rules={p:{k:i['jobs'][p][k]for k in fields}for p in i['phaseOrder']}
 assert {p:v['jobId']for p,v in rules.items()}==scope['jobs']and {p:v['timeoutSeconds']for p,v in rules.items()}==scope['phaseBudgetsSeconds']
 for phase,rule in rules.items():
  assert {k:e['jobs'][phase][k]for k in fields}==rule
  for leaf,pin in rule['bundlePins'].items():
   checked(Path(i['jobs'][phase]['sourceDirectory'])/leaf,pin);checked(Path(e['jobs'][phase]['sourceDirectory'])/leaf,pin)
 start=a['start44'];stop=a['stop44'];restore=a['restore44'];writer=a['writer44']
 def row(value,pin):return dict(value=value,sha256=pin)
 h['closed44']=dict(service=start['service'],startTerminal=row(start['terminal'],start['rootPins']['terminal']),startResult=row(start['result'],start['rootPins']['result']),ackSha256=start['retainedAckSha256'],writerKey=writer['requestKey'],writerTerminal=writer['terminal'],writerIncomplete=row(writer['results']['final33-writer-incomplete.json']['value'],writer['results']['final33-writer-incomplete.json']['rootSha256']),writerCleanup=row(writer['results']['final33-writer-child-cleanup.json']['value'],writer['results']['final33-writer-child-cleanup.json']['rootSha256']),stopKey=stop['requestKey'],stopTerminal=stop['terminal'],stopResult=row(stop['results']['normal05-preserve-stop-result.json']['value'],stop['results']['normal05-preserve-stop-result.json']['rootSha256']),guardianSha256=stop['guardianCleanup']['sha256'],restoreKey=restore['requestKey'],restoreTerminal=restore['terminal'],restoreResult=row(restore['results']['maintenance-auth-result.json']['value'],restore['results']['maintenance-auth-result.json']['rootSha256']),restoreCleanupSha256=restore['results']['maintenance-auth-cleanup.json']['rootSha256'],safeReceiptSha256=restore['privateSafeRestoreReceipt']['sha256'],stoppedService=stop['actualStoppedService'],ownRestoreContainer=restore['actualStoppedOwnRestoreContainer'])
 for ref in scope['sourcePlanRecordedInputs']:
  checked(ref['path'],ref['sha256']);h['actualInputs'].append(ref)
 h.update(state='ACTUAL137_WITH_SOURCE45_RETAINED_PREPARE05_NO_RUNTIME_AUTHORITY',actualRootPins={**h['actualRootPins'],'dispatcher':scope['actualBeforeDispatcherSha256']},actualRoot137=a['actualRoot137'],custodyStat9=a['custodyStat9'],oldKeys=137,newKeys=5,candidateKeys=142,phaseOrder=scope['phaseOrder'],jobs=scope['jobs'],expectedRules=rules,policyName=i['rootPolicyLeaf'],policyFormat=i['rootPolicyFormat'],consumerDirectory=str(folder),consumerSourceDirectory=str(folder),consumerSourcePinsSha256=sha(source_raw),consumerInterfaceSha256=sha(interface_raw),consumerFrozenInterfaceSha256=sha(interface_raw),consumerRulesSha256=sha(rules_raw),consumerReviewSha256=None,consumerReviewPath=None,priorService=i['priorService'],predecessor={'bindings':i['previousStartBindings']},stopCurrentBatchOperations=i['stopCurrentBatchOperations'],executionConsumerDirectory=str(execution),executionInterfacePath=str(execution/'INTERFACE.UNISSUED.json'),executionInterfaceSha256=sha(execution_raw),phaseDirectories={p:e['jobs'][p]['sourceDirectory']for p in rules},consumer45Interface=i,source45Scope=scope)
 h.pop('consumer44Interface',None);h['actualInputs']+=a['actualInputs']
 assert h['prepare05']['preparedBinding']['stepCount']==44910 and scope['roleTimingOffsetsSeconds']==dict(controller=4000,backupAdmin=4120,hardRestore=4900)
 assert h['installedAfter42Catalog']==json.loads((OLD/'HISTORY-INPUTS.json').read_bytes())['installedAfter42Catalog']
 review_path=D/'CONSUMER-REVIEW-REF.json'
 if review_path.exists():
  review_ref=json.loads(review_path.read_bytes());review=json.loads(checked(review_ref['path'],review_ref['sha256']))
  assert review['sourceOnly']is True and review['findings']==[]and review['sourcePinsSha256']==h['consumerSourcePinsSha256']and review['interfaceSha256']==h['consumerInterfaceSha256']
  h['consumerReviewSha256']=review_ref['sha256'];h['consumerReviewPath']=review_ref['path']
 (D/'HISTORY-INPUTS.json').write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n')
 # Same established five-phase witness, with only new source bindings/history.
 w=json.loads((OLD/'FIVE-PHASES.UNISSUED.json').read_bytes())
 for key in list(w):
  if key in h:w[key]=h[key]
 w.update(oldKeys=137,newKeys=5,candidateKeys=142,actualRoot137=a['actualRoot137'],closed43=h['closed43'],closed44=h['closed44'],historical42Service=h['historical42Service'],source45Scope=scope,consumer45Interface=i)
 for key in ('consumer44Interface',):w.pop(key,None)
 (D/'FIVE-PHASES.UNISSUED.json').write_text(json.dumps(w,ensure_ascii=False,indent=2)+'\n')
 print('Bound exact consumer45/source-only historical witness; no factory or runtime call.')
if __name__=='__main__':main()
