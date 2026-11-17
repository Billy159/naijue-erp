"""Prepare only exact42 consumer metadata; all future authority values stay absent."""
from pathlib import Path
import ast,hashlib,json,runpy
D=Path(__file__).resolve().parent;R=D.parents[2];OLD=D.with_name('20261117-r3-ordinary41-root-source-01');V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
CONSUMER=V/'NORMAL42-THREE-ROUTINE-MAINTENANCE-SOURCE-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def checked(path,pin):
 b=Path(path).read_bytes();assert sha(b)==pin,path;return b
def assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def main():
 # No WIP can be turned into final metadata merely by staging it.
 final_raw=(CONSUMER/'SOURCE-PINS.json').read_bytes();final=json.loads(final_raw);interface_raw=(CONSUMER/'INTERFACE.UNISSUED.json').read_bytes();i=json.loads(interface_raw)
 assert final['sourceOnly']is True and i['phaseOrder']==['apply','start','upgrade','stop','restore']
 actual=json.loads((D/'ACTUAL-HISTORY.json').read_bytes());h=json.loads((OLD/'HISTORY-INPUTS.json').read_bytes())
 fields={'jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField'};rules={p:{k:i['jobs'][p][k]for k in fields}for p in i['phaseOrder']};jobs={p:rules[p]['jobId']for p in i['phaseOrder']}
 for p,rule in rules.items():
  for n,pin in rule['bundlePins'].items():checked(Path(i['jobs'][p]['sourceDirectory'])/n,pin)
 basis_path=V/'ORIGINAL-AUTH41-ROLLBACK02-ROOT-EXECUTION-PREPARATION-01/fresh/ACTUAL-BASIS-BASIS.json'
 basis_raw=checked(basis_path,'2728eff1074b7d27fe504b6dff28ed99c2ab73a634db2b1e3a86e9b86c034e40');basis=json.loads(basis_raw)
 custody={k:v for k,v in basis['oldIdentities'].items()if '/state/native-services/ordinary'in k};assert len(custody)==13 and all(len(row)==9 for row in custody.values())
 h.update(custodyStat9=custody,custodyMetadataSource={'path':str(basis_path),'sha256':sha(basis_raw)},actualRootPins={**h['actualRootPins'],'dispatcher':actual['actualDispatcherSha256']},rollback02=actual['rollback02'],actualRollback02ModuleSha256=actual['actualRollback02ModuleSha256'],actualRollback02PolicySha256=actual['actualRollback02PolicySha256'],oldKeys=122,newKeys=5,candidateKeys=127)
 h['actualInputs']+=actual['actualSources']
 review_path=R/'outputs/QB/20261118-r3-normal42-three-routine-maintenance-joint-review-01/CONSUMER-RESULT.json'
 review_pin='ce35e6651cfa8d287e5735040fba6d96645fab699dfe020390c01434d467cb5e'
 review=json.loads(checked(review_path,review_pin));assert review['sourceOnly']is True and review['findings']==[]and review['sourcePinsSha256']==sha(final_raw)and review['interfaceSha256']==sha(interface_raw)
 h['consumerReviewSha256']=review_pin;h['consumerReviewPath']=str(review_path)
 h.update(state='ACTUAL122_WITH_SOURCE42_NO_FINITE_AUTHORITY',policyName=i['rootPolicyLeaf'],policyFormat=i['rootPolicyFormat'],phaseOrder=i['phaseOrder'],consumerDirectory=str(CONSUMER),consumerSourceDirectory=str(CONSUMER),consumerSourcePinsSha256=sha(final_raw),consumerInterfaceSha256=sha(interface_raw),consumerFrozenInterfaceSha256=sha(interface_raw),consumerRulesSha256=sha((CONSUMER/'PHASES42.UNISSUED.json').read_bytes()),jobs=jobs,expectedRules=rules,phaseDirectories={p:i['jobs'][p]['sourceDirectory']for p in i['phaseOrder']},oldKeys=122,candidateKeys=127,newKeys=5,actual122=actual)
 # Last service41 and its guardian closure plus rollback02 are independent
 # facts. No fabricated successful Stop41 binding is permitted.
 h['priorService']=i['priorService'];h['predecessor']={'bindings':i['previousStartBindings']};h['stopCurrentBatchOperations']=i['stopCurrentBatchOperations'];h['operatorReadySha256']=h['root08']['markerSha256']
 (D/'HISTORY-INPUTS.json').write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n')
 w=dict(h,futureC=None,futureWindow=None,historyOnlyNoRuntimeAuthorization=True)
 (D/'FIVE-PHASES.UNISSUED.json').write_text(json.dumps(w,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
 print('Prepared exact consumer42 input metadata only; no scopes or clocks called.')
if __name__=='__main__':main()
