"""Correct the top-level plan05 blueprint and add the original readonly collectors."""
from pathlib import Path
import ast,difflib,hashlib,json
D=Path(__file__).resolve().parent;V=D.parent;O=V/'NORMAL39-SOURCE-SUCCESSOR-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((O/'SOURCE-PINS.json').read_bytes())=='973b8f0240a58ce61fb590fadaf3ca46aaf0082b4a84e98bfe251ff2393ea0ad'
source=json.loads((O/'SOURCE-PINS.json').read_bytes())
for n,row in source['files'].items():
    if '/bundle/'not in n and n not in ('phase_cli.py','PRIOR38-HISTORICAL-EVIDENCE.json','SOURCE-DELTA-CHECKS.json'):continue
    raw=(O/n).read_bytes();assert sha(raw)==row['sha256']and len(raw)==row['bytes']
    p=D/n;p.parent.mkdir(parents=True,exist_ok=True)
    if p.exists():assert p.read_bytes()==raw
    else:
        with p.open('xb')as f:f.write(raw)
interface=json.loads((O/'INTERFACE.UNISSUED.json').read_bytes())
blue=json.loads((O/'PHASES39.UNISSUED.json').read_bytes())
blue['preparationIdentityMapping']=interface['preparationIdentityMapping']
blue['state']='UNISSUED_NORMAL39_PREPARE05_NATIVE01_ROOT07_SOURCE_ONLY'
for phase,rule in blue['jobs'].items():rule['sourceDirectory']=str(D/phase/'bundle')
def save(name,value):
    raw=(json.dumps(value,indent=2,sort_keys=True)+'\n').encode()
    if(D/name).exists():assert(D/name).read_bytes()==raw
    else:
        with(D/name).open('xb')as f:f.write(raw)
save('PHASES39.UNISSUED.json',blue)

# Observers consume actual issued authorities/current C only. Compile the
# unchanged embedded remote programs; no template values are supplied or run.
collector=(V/'PREPARE04-REFERENCEERROR-CONSUMER-WIP-01/read_pending38.py').read_text()
collector=collector.replace('PHASES38.UNISSUED.json','PHASES39.UNISSUED.json').replace('t45-first-r3-native-service-start-20261116-38','t45-first-r3-native-service-start-20261116-39').replace('fresh35-current-production-service-v2-service-38.json','fresh35-current-production-service-v2-service-39.json')
observers={'read_pending39.py':collector}
for phase,oldname in [('start','read_start38.py'),('stop_restore','read_stop_restore38.py')]:
    raw=(V/'NORMAL38-EXECUTION-PREPARATION-01'/oldname).read_text()
    raw=raw.replace('NORMAL38-SOURCE-SUCCESSOR-03',D.name).replace('t45-first-r3-native-service-start-20261116-38','t45-first-r3-native-service-start-20261116-39')
    raw=raw.replace('fresh35-current-production-service-v2-service-38.json','fresh35-current-production-service-v2-service-39.json')
    raw=raw.replace('t45-r3-ordinary38-','t45-r3-ordinary39-').replace('ordinary38-auth-20261116-01','ordinary39-auth-20261116-01')
    observers['read_start39.py'if phase=='start'else'read_stop_restore39.py']=raw
for name,raw in observers.items():
    compile(raw,str(D/name),'exec');tree=ast.parse(raw)
    embedded=max((n.value for n in ast.walk(tree)if isinstance(n,ast.Constant)and isinstance(n.value,str)),key=len)
    compile(embedded,'<unbound-fixed-readonly-observer>','exec')
    if(D/name).exists():assert(D/name).read_text()==raw
    else:
        with(D/name).open('x')as f:f.write(raw)

interface.update(state='SOURCE_ONLY_NORMAL39_OUTER05_NATIVE01_ROOT07_ACTUAL_RECEIPTS_NO_RUNTIME',
 phaseDirectories={p:str(D/p/'bundle')for p in blue['jobs']},rulesPath=str(D/'PHASES39.UNISSUED.json'),rulesSha256=sha((D/'PHASES39.UNISSUED.json').read_bytes()),
 correctedPredecessorSourcePinsSha256=sha((O/'SOURCE-PINS.json').read_bytes()),
 correctedPredecessorIssue='Top-level blueprint had old04 mapping; six runtime jobs and interface were05. Corrected to exact common mapping before any registration, authority or phase.',
 readonlyObservers={n:dict(path=str(D/n),sha256=sha((D/n).read_bytes()))for n in observers})
assert blue['preparationIdentityMapping']==interface['preparationIdentityMapping']
assert blue['preparationIdentityMapping']['outerPreparationAttemptKey']==blue['jobs']['prepare']['jobId']=='t45-r3-final33-plan-prepare-20261116-05'
assert blue['preparationIdentityMapping']['batchPlanPath'].endswith('/t45-r3-final33-plan-prepare-20261116-05/batched-plan.sqlite')
save('INTERFACE.UNISSUED.json',interface)
save('BLUEPRINT-CORRECTION-CHECKS.json',dict(state='SOURCE_ONLY_PLAN05_BLUEPRINT_CORRECTION_AND_OBSERVER_COMPILE',
 runtimeMembersUnchanged=53,all53RuntimePinsInheritedFromFrozen01=True,blueprintAndInterfacePreparationMappingEqual=True,
 nativeLogicalRequestKeyPreserved='t45-r3-final33-plan-prepare-20261116-01',
 observersAndEmbeddedProgramsCompiled=list(observers),authoritiesOrFutureCConstructed=False,serverActions=0,PGConnections=0,clockCalls=0))
with(D/'BLUEPRINT-ONLY-DIFF.patch').open('x')as f:f.writelines(difflib.unified_diff((O/'PHASES39.UNISSUED.json').read_text().splitlines(True),(D/'PHASES39.UNISSUED.json').read_text().splitlines(True),fromfile=str(O/'PHASES39.UNISSUED.json'),tofile=str(D/'PHASES39.UNISSUED.json')))
manifest={str(p.relative_to(D)):dict(bytes=p.stat().st_size,sha256=sha(p.read_bytes()))for p in D.rglob('*')if p.is_file()and p.name!='SOURCE-PINS.json'}
save('SOURCE-PINS.json',dict(state='SOURCE_FROZEN_NORMAL39_OUTER05_NATIVE01_ROOT07_CORRECTED_BLUEPRINT_NOT_ISSUED',files=manifest,
 interfaceSha256=sha((D/'INTERFACE.UNISSUED.json').read_bytes()),rulesSha256=sha((D/'PHASES39.UNISSUED.json').read_bytes()),
 predecessorSourcePinsSha256=sha((O/'SOURCE-PINS.json').read_bytes()),runtimeMembers=53,sourceOnly=True,
 authoritiesIssued=False,rootRegistrationOrExecution=False,runtimeCandidatePass=False,serverActions=0,PGConnections=0,clockCalls=0))
print(json.dumps({n:sha((D/n).read_bytes())for n in ('SOURCE-PINS.json','INTERFACE.UNISSUED.json','PHASES39.UNISSUED.json','phase_cli.py')}))
