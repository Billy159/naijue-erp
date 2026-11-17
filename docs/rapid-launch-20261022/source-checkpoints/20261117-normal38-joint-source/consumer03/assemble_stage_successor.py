"""Only three writer diagnostic stages and their required content references."""
from pathlib import Path
import ast, difflib, hashlib, json, re, subprocess
D=Path(__file__).resolve().parent
O=D.with_name('NORMAL38-SOURCE-SUCCESSOR-02')
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(name,value):
 with (D/name).open('x') as f:json.dump(value,f,sort_keys=True,indent=2);f.write('\n')
def once(raw,before,after):
 assert raw.count(before)==1,before
 return raw.replace(before,after)
def rewrite_literals(raw,change):
 lines=raw.splitlines(keepends=True);edits=[]
 for n in ast.walk(ast.parse(raw)):
  if isinstance(n,ast.Constant) and isinstance(n.value,str):
   v=change(n.value)
   if v!=n.value:
    lo=sum(map(len,lines[:n.lineno-1]))+n.col_offset;hi=sum(map(len,lines[:n.end_lineno-1]))+n.end_col_offset
    edits.append((lo,hi,repr(v).encode()))
 for lo,hi,b in sorted(edits,reverse=True):raw=raw[:lo]+b+raw[hi:]
 return raw
base=json.loads((O/'SOURCE-PINS.json').read_bytes())
assert sha((O/'SOURCE-PINS.json').read_bytes())=='7e3a6ebe38b74a7f60a990c15ad9f5ea915977133a9134aff8935ee1e58ae5e0'
names=[n for n in base['files'] if '/bundle/' in n]
old={n:(O/n).read_bytes() for n in names}
assert all(sha(b)==base['files'][n]['sha256'] for n,b in old.items())
files=dict(old)
stages=['WRITER_SCOPE','WRITER_CALL','WRITER_READBACK']
before="'EXECUTION_BINDING'"
after="'EXECUTION_BINDING','WRITER_SCOPE','WRITER_CALL','WRITER_READBACK'"
for phase in ('start','prepare','writer'):
 n=phase+'/bundle/final33-run.mjs';raw=files[n].decode()
 raw=once(raw,"'PREPARE_RESULT','EXECUTION_BINDING']);","'PREPARE_RESULT',"+after+"]);")
 raw=once(raw,"   failureStage='UNKNOWN';","   failureStage='WRITER_SCOPE';")
 raw=once(raw,"   result=await api.runFinalR3Writer03", "   failureStage='WRITER_CALL';\n   result=await api.runFinalR3Writer03")
 raw=once(raw,"    const verified=await api.runFinalR3Readback03", "    failureStage='WRITER_READBACK';\n    const verified=await api.runFinalR3Readback03")
 files[n]=raw.encode()
for phase in ('prepare','writer'):
 n=phase+'/bundle/final33_host.py'
 files[n]=once(files[n],b"'EXECUTION_BINDING', 'UNKNOWN'",b"'EXECUTION_BINDING', 'WRITER_SCOPE', 'WRITER_CALL', 'WRITER_READBACK', 'UNKNOWN'")
direct=dict(files)
versions={n:{sha(b)} for n,b in old.items()}
for iteration in range(20):
 changes={}
 for n,b in files.items():
  latest=sha(b);versions[n].add(latest)
  for h in versions[n]:
   if h!=latest:assert h not in changes or changes[h]==latest;changes[h]=latest
 nxt={}
 for n,b in files.items():
  if n.endswith('.py'):nxt[n]=rewrite_literals(b,lambda v:changes.get(v,v))
  elif n.endswith('.mjs'):nxt[n]=re.sub(rb"(['\"])([0-9a-f]{64})\1",lambda m:m.group(1)+changes.get(m.group(2).decode(),m.group(2).decode()).encode()+m.group(1),b)
  else:nxt[n]=b
 if nxt==files:break
 files=nxt
else:raise AssertionError('PIN_GRAPH_NOT_SETTLED')
# Independently reverse all pin substitutions. Only the five direct stage
# source edits above may remain; all other executable bytes must be identical.
reverse={sha(b):sha(old[n]) for n,b in files.items() if b!=old[n]}
for n,b in files.items():
 expect=re.sub(rb"(['\"])([0-9a-f]{64})\1",lambda m:m.group(1)+reverse.get(m.group(2).decode(),m.group(2).decode()).encode()+m.group(1),b)
 # AST string rewriting may normalize the quoting of a replaced pin.
 if n.endswith('.py'):
  target=ast.parse(direct[n]);actual=ast.parse(expect)
  assert ast.dump(target)==ast.dump(actual),n
 else:assert expect==direct[n],n
 p=D/n;p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('xb')as f:f.write(b)
 if n.endswith('.py'):compile(b,str(p),'exec')
 if n.endswith('.mjs'):
  q=subprocess.run(['node','--check',str(p)],capture_output=True);assert q.returncode==0,('SYNTAX',n)
for name in ('phase_cli.py','prior_preserved37.py','C05-STARTUP-PRESERVATION.json'):
 with (D/name).open('xb')as f:f.write((O/name).read_bytes())
collector=(O/'read_pending38.py').read_bytes()
collector=rewrite_literals(collector,lambda v:v.replace("'EXECUTION_BINDING', 'UNKNOWN'","'EXECUTION_BINDING', 'WRITER_SCOPE', 'WRITER_CALL', 'WRITER_READBACK', 'UNKNOWN'"))
assert collector!=(O/'read_pending38.py').read_bytes()
compile(collector,str(D/'read_pending38.py'),'exec')
program=next(n.value.value for n in ast.parse(collector).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='program' for t in n.targets))
compile(program,'<collector-source-with-unbound-literal-names>','exec')
with (D/'read_pending38.py').open('xb')as f:f.write(collector)
blue=json.loads((O/'PHASES38.UNISSUED.json').read_bytes())
for phase,rule in blue['jobs'].items():
 rule['sourceDirectory']=str(D/phase/'bundle');rule['bundlePins']={Path(n).name:sha(b)for n,b in files.items()if n.startswith(phase+'/bundle/')}
 assert rule['authoritySha256'] is None
save('PHASES38.UNISSUED.json',blue)
interface=json.loads((O/'INTERFACE.UNISSUED.json').read_bytes())
interface.update(phaseDirectories={p:str(D/p/'bundle')for p in blue['jobs']},rulesPath=str(D/'PHASES38.UNISSUED.json'),rulesSha256=sha((D/'PHASES38.UNISSUED.json').read_bytes()),C05PreservationEvidencePath=str(D/'C05-STARTUP-PRESERVATION.json'),writerDiagnosticStages=stages,priorConsumerSourcePinsSha256=sha((O/'SOURCE-PINS.json').read_bytes()))
save('INTERFACE.UNISSUED.json',interface)
patch=[]
for n,b in files.items():
 if b!=old[n]:patch.extend(difflib.unified_diff(old[n].decode().splitlines(True),b.decode().splitlines(True),fromfile=str(O/n),tofile=str(D/n)))
patch.extend(difflib.unified_diff((O/'read_pending38.py').read_text().splitlines(True),collector.decode().splitlines(True),fromfile=str(O/'read_pending38.py'),tofile=str(D/'read_pending38.py')))
with (D/'STAGE-ONLY-DIFF.patch').open('x')as f:f.writelines(patch)
evidence=[]
for n,b in files.items():
 if n.endswith('final33-run.mjs'):
  evidence.append(dict(source=n,sha256=sha(b),lines=[dict(line=i,text=l.strip())for i,l in enumerate(b.decode().splitlines(),1)if any(s in l for s in stages)]))
assert files['start/bundle/final33-run.mjs']==files['prepare/bundle/final33-run.mjs']==files['writer/bundle/final33-run.mjs']
for phase in ('prepare','writer'):
 t=ast.parse(files[phase+'/bundle/final33_host.py']);enums=next(ast.literal_eval(n.value)for n in t.body if isinstance(n,ast.Assign)and any(isinstance(a,ast.Name)and a.id=='DIAGNOSTIC_ENUMS'for a in n.targets))
 assert set(stages)<=set(enums['stage']) and set(enums)=={'format','stage','errorType','systemCode','guardCode','sqlstate'}
ct=ast.parse(program);cenums=next(ast.literal_eval(n.value)for n in ct.body if isinstance(n,ast.Assign)and any(isinstance(a,ast.Name)and a.id=='DIAGNOSTIC_ENUMS'for a in n.targets));assert cenums==enums
save('STAGE-DELTA-EVIDENCE.json',dict(state='SOURCE_ONLY_THREE_WRITER_STAGES_AND_REQUIRED_REFERENCES',directSourceEvidence=evidence,stages=stages,producerAndTwoHostAndReadonlyCollectorAllowlistAgree=True,existingSixFieldsOnly=True,allRuntimeDifferencesOnlyDirectStageEditsOrNecessaryPins=True,changedRuntimeMembers=[n for n in files if files[n]!=old[n]],unchangedRuntimeMembers=sum(files[n]==old[n]for n in files),pinGraphIterations=iteration,old37ReceiptsAndHistoryPreserved=True,oldConsumerUnmodified=True,reusedJointHandoffSha256='7564f8efdb16ea5c0d030f2ae1fa5a6171c3999f6e1067da5182d0b3ee416502',nativePGFaultFixtureFullBuildOrServerInvoked=False,clockCalls=0,serverActions=0,PGConnections=0))
manifest={str(p.relative_to(D)):dict(bytes=p.stat().st_size,sha256=sha(p.read_bytes()))for p in D.rglob('*')if p.is_file()and p.name!='SOURCE-PINS.json'}
save('SOURCE-PINS.json',dict(state='SOURCE_FROZEN_NORMAL38_THREE_WRITER_STAGES_UNISSUED',files=manifest,interfaceSha256=sha((D/'INTERFACE.UNISSUED.json').read_bytes()),rulesSha256=interface['rulesSha256'],previousApprovedConsumerSourcePinsSha256='d63d745735ec3da7dd5f20ec7ee402805a7b1777b49997a731c1fa0dcb61ad59',priorConsumerSourcePinsSha256=sha((O/'SOURCE-PINS.json').read_bytes()),actualExecutionDirectories=interface['phaseDirectories'],runtimeMembers=46,serverActions=0,PGConnections=0,clockCalls=0,authoritiesIssued=False,rootRegistrationOrExecution=False,runtimeCandidatePass=False))
print(json.dumps({k:sha((D/k).read_bytes())for k in ('SOURCE-PINS.json','PHASES38.UNISSUED.json','INTERFACE.UNISSUED.json','STAGE-DELTA-EVIDENCE.json')}))
