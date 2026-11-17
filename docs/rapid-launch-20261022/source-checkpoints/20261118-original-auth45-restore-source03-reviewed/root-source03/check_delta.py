from pathlib import Path
import ast,json,hashlib
D=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D1/20261118-r3-original-auth45-guardian-restore-root-source-03');A=D.with_name('20261118-r3-original-auth45-guardian-restore-root-source-02');S=D.with_name('20261118-r3-ordinary45-root-source-01');R=D.parents[2];V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01';C=V/'ORIGINAL-AUTH45-GUARDIAN-RESTORE-SOURCE-01';checks=[];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ok(x,label):
 assert x,label
 checks.append(label)
def meta(p):
 t=ast.parse(p.read_text());e={'Path':Path}
 for n in t.body:
  if isinstance(n,ast.Assign)and any(isinstance(a,ast.Name)and a.id in ('B','C','P','H','PRESERVE','CUSTODY','NEW_MODULE','NEW_POLICY','AUDIT','PENDING','ENTRY')for a in n.targets):exec(compile(ast.Module(body=[n],type_ignores=[]),'immutable_path_metadata','exec'),e)
  elif isinstance(n,ast.Expr)and isinstance(n.value,ast.Call)and isinstance(n.value.func,ast.Attribute)and isinstance(n.value.func.value,ast.Name)and n.value.func.value.id in ('PRESERVE','CUSTODY'):exec(compile(ast.Module(body=[n],type_ignores=[]),'immutable_path_metadata','exec'),e)
 return e
old=meta(A/'register_cas.py');new=meta(D/'register_cas.py');base=meta(S/'register_cas.py');h=json.loads((D/'HISTORY.json').read_bytes())
ok(sha(A/'SOURCE-PINS.json')=='907486b1566997d3ee9d05a9834483ff83d55c6992d9ce37794ee987ca9f7623','Previous907 frozen intact')
f=V/'ORIGINAL-AUTH45-GUARDIAN-RESTORE-ROOT-EXECUTION-PREPARATION-01/fresh';p=f/'ACTUAL-FIXED-PRESERVE-PRESENCE.PRIVATE.json';j=json.loads(p.read_bytes());ok(sha(p)=='ac4689ac5fc4abb4376bc16539f55ae213a4da1d6c652879f159f8f86698662a'and j['missingIndexes']==[33,34]and j['metadataMismatches']==[],'Actual metadata presence missing only indexes33and34')
fix={str(new['NEW_MODULE']):str(new['P']/'r3_original_auth41_rollback02.py'),str(new['NEW_POLICY']):str(new['H']/'original-auth41-rollback-only-20261117-02.json')};ok(list(new['PRESERVE'].items())==[(fix.get(k,k),v)for k,v in old['PRESERVE'].items()],'Only two paths repaired in105 original ordered hashes')
for path in fix.values():ok(new['PRESERVE'][path]==base['PRESERVE'][path],'Historical41 exact path and hash from original Source45 '+Path(path).name)
expected=dict(base['PRESERVE']);expected[str(new['P']/'admin_exec.py')]=h['dispatcherSha256'];expected[str(new['P']/'r3_normal45_continuation.py')]=h['module45Sha256'];expected[str(new['H']/'direct45-batched-real.json')]=h['policy45Sha256']
for key,leaf,pin in [(h['service']['serviceKey'],'r3-outer-terminal.json',h['startPins']['terminal']),(h['service']['serviceKey'],'results/normal-service-result.json',h['startPins']['result']),(h['writer']['key'],'r3-outer-terminal.json',h['writer']['terminalSha256']),(h['writer']['key'],'results/final33-writer-result.json',h['writer']['resultSha256']),(h['writer']['key'],'results/final33-writer-child-cleanup.json',h['writer']['cleanupSha256'])]:expected[str(new['B']/'jobs'/key/leaf)]=pin
ok(new['PRESERVE']==expected,'Entire historical Source45 preserve map retained with only explicit actual142and45 additions')
protected=set(new['PRESERVE'])|{str(p)for p in new['CUSTODY']};targets={str(new[k])for k in ('NEW_MODULE','NEW_POLICY','AUDIT','PENDING')};ok(protected.isdisjoint(targets),'All existing protected paths disjoint from all new absent targets')
ok(new['CUSTODY']==old['CUSTODY']and len(new['CUSTODY'])==31,'All31 custody metadata paths unchanged')
for name in ('register_cas.py','register_cas.template.py'):
 a=ast.parse((A/name).read_text());b=ast.parse((D/name).read_text());af={n.name:ast.dump(n)for n in a.body if isinstance(n,ast.FunctionDef)};bf={n.name:ast.dump(n)for n in b.body if isinstance(n,ast.FunctionDef)};ok(af==bf,name+' all function guards unchanged')
 def filtered(t):return ast.dump(ast.Module(body=[n for n in t.body if not(isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id in ('PRESERVE','ENTRY')for x in n.targets))],type_ignores=[]))
 ok(filtered(a)==filtered(b),name+' only PRESERVE and ENTRY assignments changed')
ok(str(new['ENTRY']).endswith('r3-original-auth45-guardian-restore-registration-source-20261118-02/register_cas.py'),'New source stage02 entry exact')
for name,allowed in [('prepare_channel.py',{'TARGET','STAGE'}),('issue_registration.py',{'DECISION'})]:
 def strip(p):
  a=ast.parse(p.read_text());a.body=[n for n in a.body if not(isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id in allowed for x in n.targets))];return ast.dump(a)
 ok(strip(A/name)==strip(D/name),name+' only required successor directory constants changed')
for name in ('r3_original_auth45_guardian_restore.py','admin_exec.ROLLBACK-UNREGISTERED.py','read_registration_basis.py','HISTORY.json','CONSUMER-BINDING.json','CONSUMER-REVIEW-REF.json'):
 ok((D/name).read_bytes()==(A/name).read_bytes(),'Accepted unchanged '+name)
i=json.loads((C/'INTERFACE.UNISSUED.json').read_bytes());ok(h['innerScopeFixed']==i['rolesScopeFixed']and h['outerScopeFixed']==i['hostScopeFixed']and h['consumerReviewSha256']=='e648fbb87e1a4a7dc616353147d8c593d85c180c2bc25f32e8d0689c79f9e010','Consumer current45 fixed scopes and prior final review reused unchanged')
consumer=(C/'bundle/ordinary05_roles.py').read_text()+(C/'bundle/ordinary05_roles_job.py').read_text();ok(all(x not in consumer for x in ('PRESERVE','NEW_MODULE','NEW_POLICY','r3_original_auth45_guardian_restore.py','original-auth45-guardian-restore-only-20261118-01.json')),'Consumer has no analogous install target versus preserve path collection')
for name in ('register_cas.py','register_cas.template.py','prepare_channel.py','issue_registration.py'):compile((D/name).read_bytes(),str(D/name),'exec')
ok(True,'Only changed source syntax checked without entries or future fixtures')
result={'state':'PASS_SOURCE03_PRESERVE_PATH_DELTA_ONLY_NOT_RUNTIME','checks':checks,'count':len(checks),'reusedRootReviewSha256':'9558a85cbfe32ec84954269dd26516f7d82a5fa77a7ea95729a6882f39b4b680','reusedConsumerReviewSha256':h['consumerReviewSha256'],'root02FreshFailed':True,'serverActions':0,'clockAUTHCASJobs':0,'PGNodeFactoryCalls':0};(D/'DELTA-CHECKS.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print('NECESSARY_DELTA_CHECKS',len(checks))
