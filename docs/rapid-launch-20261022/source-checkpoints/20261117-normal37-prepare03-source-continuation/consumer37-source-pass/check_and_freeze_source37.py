"""Narrow local source/literal edge inspection. No server, issuer, client or native execution."""
from pathlib import Path
import ast,hashlib,json,re,runpy
D=Path(__file__).resolve().parent;R=D.parent;O=R/'NORMAL36-SOURCE-SUCCESSOR-02'
sha=lambda b:hashlib.sha256(b).hexdigest()
def dump(name,v):
 with (D/name).open('x') as f:json.dump(v,f,sort_keys=True,indent=2);f.write('\n')
base=json.loads((O/'SOURCE-PINS.json').read_bytes());blue=json.loads((D/'PHASES37.UNISSUED.json').read_bytes())
files={str(p.relative_to(D)):p.read_bytes() for p in sorted(D.glob('*/bundle/*'))};current={};old={}
for n,b in files.items():current.setdefault(sha(b),[]).append(n)
for n,row in base['files'].items():
 if '/bundle/' in n:old.setdefault(row['sha256'],[]).append(n)
asts={n:ast.parse(b) for n,b in files.items() if n.endswith('.py')}
def value(n,label):
 node=next(x for x in asts[n].body if isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id==label for t in x.targets));return ast.literal_eval(node.value)
def edge(source,label,target):
 expected=value(source,label);actual=sha(files[target]);assert expected==actual,(source,label,target)
 return dict(source=source,binding=label,target=target,sha256=actual,kind='CURRENT37_LITERAL_LOAD_EDGE')
edges=[]
for p in ('prepare','writer','stop'):
 for label,target in [('READONLY_SHA','r3_05_readonly.py'),('NORMAL05_SHA','normal_service05_after08.py'),('PROOF_SHA','normal_service05_after08_proof.py')]:edges.append(edge(p+'/bundle/normal05_retained_stop.py',label,'start/bundle/'+target))
for p in ('apply','restore'):
 for label,target in [('CURRENT_SOURCE','normal_service05_after08.py'),('CURRENT_PROOF_SOURCE','normal_service05_after08_proof.py')]:edges.append(edge(p+'/bundle/ordinary05_roles_job.py',label,'start/bundle/'+target))
for label,target in [('READONLY_SHA','r3_05_readonly.py'),('R3_CLI_SHA','r3_05_cli.py'),('R3_RUNTIME_SHA','r3_05_runtime.py'),('PRIOR32_SHA','prior_preserved36.py'),('MATERIAL06_SHA','root06_material.py')]:edges.append(edge('start/bundle/normal_service05_after08.py',label,'start/bundle/'+target))
edges.append(edge('stop/bundle/normal05_preserve_stop.py','STOP_REFERENCE','stop/bundle/normal05_retained_stop.py'))
edges.append(edge('start/bundle/start_owned_describe.py','RUNNER_SHA','start/bundle/batched161-run.mjs'))
for n in asts:
 for label in ('PINS','STATIC_PINS'):
  nodes=[x for x in asts[n].body if isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id==label for t in x.targets)]
  if not nodes:continue
  pins=ast.literal_eval(nodes[0].value)
  for leaf,pin in pins.items():
   target=str(Path(n).parent/leaf);assert target in files and sha(files[target])==pin,(n,label,leaf)
   edges.append(dict(source=n,binding=label+'['+repr(leaf)+']',target=target,sha256=pin,kind='CURRENT37_DICTIONARY_LOAD_EDGE'))
# Validate literals in calls as well as named constants and PINS dictionaries.
parents={}
for n,t in asts.items():
 for parent in ast.walk(t):
  for child in ast.iter_child_nodes(parent):parents[(n,id(child))]=parent
literals=[];unresolved=[]
predecessor36_pins=set()
helper=runpy.run_path(str(D/'prior_preserved36.py'),run_name='source37_static_predecessor_metadata')
for label in ('TERMINAL','NORMAL_ROOT','NORMAL_PUBLIC','STOP_TERMINAL','STOP_ROOT','STOP_PUBLIC','CLEANUP','ACK','RESTORE_TERMINAL','RESTORE_ROOT','RESTORE_PUBLIC','RESTORED_SAFE','OLD_MAIN'):predecessor36_pins.add(helper[label])
predecessor36_pins.add(helper['SERVICE']['proofSha256'])
restore=json.loads((R/'NORMAL36-RUNTIME-01/restore/ACTUAL-RESTORE36-RESULT.json').read_bytes());helper['validate_restored_object'](restore['result'])
for phase,rule in blue['jobs'].items():
 expected={Path(n).name:sha(b) for n,b in files.items() if n.startswith(phase+'/bundle/')};assert rule['bundlePins']==expected and rule['authoritySha256'] is None
 assert rule['timeoutSeconds']=={'apply':300,'start':300,'prepare':780,'writer':3000,'stop':120,'restore':300}[phase]
for n,b in files.items():
 if n.endswith('.py'):compile(b,str(D/n),'exec')
 prior_name=n.replace('prior_preserved36.py','prior_preserved35.py');prior=(O/prior_name).read_text()
 for line,text in enumerate(b.decode().splitlines(),1):
  for pin in re.findall(r'(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])',text):
   if pin==helper['SERVICE']['containerId'] and n.endswith('/prior_preserved36.py'):kind='ACTUAL36_CONTAINER_ID_NOT_CONTENT_HASH';targets=[]
   elif pin in current:kind='CURRENT37_EXACT_MEMBER';targets=current[pin]
   elif pin in predecessor36_pins and n.endswith('/prior_preserved36.py'):kind='ACTUAL36_IMMUTABLE_PREDECESSOR_RECEIPT_OR_SOURCE';targets=old.get(pin,[])
   elif pin in old:kind='UNRESOLVED_OLD_MEMBER_LITERAL';targets=old[pin];unresolved.append(dict(source=n,line=line,pin=pin,targets=targets))
   elif pin in prior:kind='UNCHANGED_EXTERNAL_OR_HISTORICAL_PIN_FROM_APPROVED_PARENT';targets=[]
   else:kind='UNCLASSIFIED_NEW_LITERAL';targets=[];unresolved.append(dict(source=n,line=line,pin=pin))
   literals.append(dict(source=n,line=line,sha256=pin,classification=kind,targets=targets))
assert not unresolved,unresolved
# The native logical preparation identity is retained; only the outer attempt and plan become03.
mapping=blue['preparationIdentityMapping'];assert mapping=={'outerPreparationAttemptKey':'t45-r3-final33-plan-prepare-20261116-03','nativeLogicalPreparationKey':'t45-r3-final33-plan-prepare-20261116-01','businessWriterRequestKey':'t45-r3-batched-real-execute-20261115-01','batchPlanPath':'/var/lib/naijue-erp/fresh35-production/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-03/batched-plan.sqlite'}
for p in ('prepare','writer'):
 assert value(p+'/bundle/final33_host.py','LOGICAL_PREPARE')==mapping['nativeLogicalPreparationKey']
 assert value(p+'/bundle/final33_host.py','PREPARE')==mapping['outerPreparationAttemptKey']
 # Existing source budgets and input/calibration anchors remain identical.
 for key in ('INSTALL_KEY','CATALOG_UPDATE_KEY','INSTALL_PROOF_SHA','INSTALL_RESULT_SHA','SOURCE_ROWS_SHA256','SOURCE_SET_SHA256'):
  oldtree=ast.parse((O/p/'bundle/final33_host.py').read_bytes());node=next(x for x in oldtree.body if isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id==key for t in x.targets));assert value(p+'/bundle/final33_host.py',key)==ast.literal_eval(node.value)
assert value('apply/bundle/ordinary05_roles_job.py','CURRENT_SOURCE')==value('restore/bundle/ordinary05_roles_job.py','CURRENT_SOURCE')
assert files['prepare/bundle/normal05_retained_stop.py']==files['stop/bundle/normal05_retained_stop.py']==files['writer/bundle/normal05_retained_stop.py']
assert files['apply/bundle/ordinary05_roles_job.py']==files['restore/bundle/ordinary05_roles_job.py']
# New target IDs are scoped static names only; no new service/C/role authority exists in this package.
load_calls=[]
for n,t in asts.items():
 for call in ast.walk(t):
  if isinstance(call,ast.Call) and isinstance(call.func,ast.Name) and call.func.id in ('load','module','pinned'):
   load_calls.append(dict(source=n,line=call.lineno,expression=ast.unparse(call)))
dump('LITERAL-LOAD-DEPENDENCIES.json',dict(state='SOURCE37_LITERAL_AND_PINS_EDGE_COMPARISON_ONLY',edges=edges,allHashLiteralOccurrences=literals,allExplicitLoadCalls=load_calls,unresolved=unresolved,PGConnections=0,serverActions=0))
predecessor={k:dict(path=str(R/('NORMAL36-RUNTIME-01/'+k+'/ACTUAL-'+k.upper()+'36-RESULT.json')),sha256=sha((R/('NORMAL36-RUNTIME-01/'+k+'/ACTUAL-'+k.upper()+'36-RESULT.json')).read_bytes())) for k in ('start','stop','restore')}
interface={'state':'SOURCE_ONLY_NORMAL37_PREPARE03_UNISSUED','serverActions':0,'PGConnections':0,'clock':None,'dynamicAuthorities':None,'role37Authority':None,'current37ServiceProof':None,'runtimePins':None,'jobs':{p:r['jobId'] for p,r in blue['jobs'].items()},'phaseDirectories':{p:str(D/p/'bundle') for p in blue['jobs']},'rulesPath':str(D/'PHASES37.UNISSUED.json'),'rulesSha256':sha((D/'PHASES37.UNISSUED.json').read_bytes()),'rootPolicyPath':'/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct37-batched-real.json','preparationIdentityMapping':mapping,'predecessor':dict(closureKind='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED',**predecessor),'historicalCatalogUpdate':blue['historicalCatalogUpdate'],'historicalInstall':dict(requestKey='t45-r3-batched-install-20261116-02',terminalSha256='01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2',resultSha256='e14e9b649d9b4d4864360384e93e059cdda80c37e769de91f2452abd1af87792'),'roleAuthorityPolicy':'Only SOURCE. New finite role authority must be issued by Main; do not reuse/extend used d834.','originalClientInterface':'Original v3/600 constructor, exact single authority phase argument, same six phases and budgets. phase_cli only changes blueprint filename from PHASES36 to PHASES37.','collectorPath':str(D/'read_pending37.py'),'runtimeMembers':len(files),'native35UnknownPreserved':True,'usedPrepare01And02NeverReplayed':True,'businessWriterNeverSubmitted':True,'noNewServiceBirthOrAuthorityFixtures':True}
dump('INTERFACE.UNISSUED.json',interface)
dump('LOCAL-CHECKS.json',dict(state='NARROW_LOCAL37_LITERAL_EDGE_AND_SYNTAX_CHECKS_PASS_SOURCE_ONLY',runtimeMembers=len(files),pythonMembersCompiled=len(asts),literalEdges=len(edges),hashLiteralOccurrences=len(literals),explicitLoadCalls=len(load_calls),unresolvedOldCurrentPins=[],duplicateSupportBodiesEqual=True,applyRestoreRoleJobBodiesEqual=True,actual36PredecessorObjectChecked=True,historicalInstallCatalogAndInputsPreserved=True,fullJobBudgetsRetained=True,PGConnections=0,serverActions=0,clockCalls=0,clientOrIssuerInvoked=False,nativeOrSyntheticOrBuildRun=False))
manifest={str(p.relative_to(D)):dict(bytes=p.stat().st_size,sha256=sha(p.read_bytes())) for p in sorted(D.rglob('*')) if p.is_file() and p.name!='SOURCE-PINS.json'}
dump('SOURCE-PINS.json',dict(state='SOURCE_FROZEN_NORMAL37_PREPARE03_CONSUMER_UNISSUED',files=manifest,interfaceSha256=sha((D/'INTERFACE.UNISSUED.json').read_bytes()),rulesSha256=sha((D/'PHASES37.UNISSUED.json').read_bytes()),previousConsumerSourcePinsSha256=sha((O/'SOURCE-PINS.json').read_bytes()),runtimeMembers=len(files),actualExecutionDirectories=interface['phaseDirectories'],serverActions=0,PGConnections=0,clockCalls=0,authoritiesIssued=False,rootRegistrationOrExecution=False,runtimeCandidatePass=False))
print(json.dumps({'SOURCE':sha((D/'SOURCE-PINS.json').read_bytes()),'rules':interface['rulesSha256'],'interface':sha((D/'INTERFACE.UNISSUED.json').read_bytes()),'literalEdges':len(edges),'allLiteralOccurrences':len(literals),'runtimeMembers':len(files),'serverActions':0}))
