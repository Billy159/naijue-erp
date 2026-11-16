"""Local SOURCE assembly only. Never execute a client, native factory or issuer."""
from pathlib import Path
import ast, hashlib, json, runpy

D=Path(__file__).resolve().parent
R=D.parent
O=R/'NORMAL34-APPLY02-CLI-SUCCESSOR-UNISSUED-01'
F=R.parents[2]/'D1/20261117-r3-start34-postcompile-diagnosis-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((O/'SOURCE-PINS.json').read_bytes())=='9dde7aaf1b3b40ec6fd90a344b62c1b158492c07f21c4d1b471289a9c96bc349'
assert sha((F/'PINS.json').read_bytes())=='e9160fad6e29da984578353cb5213a2c0371a6ef3fec1dd7ef793dea70a72aa0'
base=json.loads((O/'SOURCE-PINS.json').read_bytes())
W=R/'NORMAL34-APPLY02-RUNTIME-01'
failed=json.loads((W/'start/ACTUAL-START34-RESULT.json').read_bytes())
restored=json.loads((W/'restore/ACTUAL-RESTORE34-COMPLETED.json').read_bytes())
applied=json.loads((W/'ACTUAL-APPLY02-COMPLETED.json').read_bytes())
assert sha((W/'start/ACTUAL-START34-RESULT.json').read_bytes())=='09a37c519d0ca0433191977dd9d1f2466ceb0337d7763b284e1a03c19b1afd8d'
assert sha((W/'restore/ACTUAL-RESTORE34-COMPLETED.json').read_bytes())=='1dab92bb68f7a6051205fec4de10e476a9ba018a7f4fffcaadb933c604d62703'
# Exact public C tuple may only come from an existing, pinned evidence file.
# A missing tuple is a SOURCE blocker, never a guessed predecessor timestamp.
tuple_path=D/'PRIOR34-C-METADATA.json'
tuple_record=json.loads(tuple_path.read_bytes()) if tuple_path.exists() else None
if tuple_record is not None:
 assert tuple_record['proofSha256']==failed['currentProofSha256']
 assert tuple_record['containerId']==failed['incomplete']['cid']
 assert tuple_record['serviceKey']==failed['requestKey']
 assert type(tuple_record['containerStartedAt']) is str and type(tuple_record['postmasterStart']) is str
started=tuple_record['containerStartedAt'] if tuple_record else None
epoch=tuple_record['postmasterStart'] if tuple_record else None
mapping={
 't45-r3-ordinary34-auth-apply-20261116-02':'t45-r3-ordinary35-auth-apply-20261116-01',
 't45-r3-ordinary34-auth-apply-20261116-01':'t45-r3-ordinary35-auth-apply-20261116-01',
 't45-first-r3-native-service-start-20261116-34':'t45-first-r3-native-service-start-20261116-35',
 't45-r3-ordinary34-preserve-stop-20261116-01':'t45-r3-ordinary35-preserve-stop-20261116-01',
 't45-r3-ordinary34-auth-restore-20261116-01':'t45-r3-ordinary35-auth-restore-20261116-01',
 't45-fresh35-first-production-20261110-r3-service-34':'t45-fresh35-first-production-20261110-r3-service-35',
 'fresh35-current-production-service-v2-service-34.json':'fresh35-current-production-service-v2-service-35.json',
 'r3-service-34-worker-proof':'r3-service-35-worker-proof',
 'ordinary34-auth-20261116-01':'ordinary35-auth-20261116-01',
 'ordinary34-auth-capture-20261116-01':'ordinary35-auth-capture-20261116-01',
 'prior_failed33.py':'prior_failed34.py',
 'r3-05-write-continuity/direct34-batched-real.json':'r3-05-write-continuity/direct35-batched-real.json',
}
def replace(s, pairs):
 for old,new in pairs.items():s=s.replace(old,new)
 return s
def assignment(s,name,value):
 t=ast.parse(s);nodes=[x for x in t.body if isinstance(x,ast.Assign) and any(isinstance(z,ast.Name) and z.id==name for z in x.targets)]
 assert len(nodes)==1,name
 lines=s.splitlines(keepends=True);n=nodes[0]
 return ''.join(lines[:n.lineno-1])+name+' = '+repr(value)+'\n'+''.join(lines[n.end_lineno:])
original={};texts={};origin={}
for name,pin in base['files'].items():
 if '/bundle/' not in name:continue
 raw=(O/name).read_bytes();assert sha(raw)==pin['sha256'] and len(raw)==pin['bytes'],name
 newname=name.replace('prior_failed33.py','prior_failed34.py')
 original[newname]=raw.decode();origin[newname]=name
 texts[newname]=replace(raw.decode(),mapping)
entry=(F/'source/batched161-run.mjs').read_bytes()
assert sha(entry)=='fab8555f5aa763f76309655e2b999ee4fed01865e11fd32db5f3e641f4d39f23'
texts['start/bundle/batched161-run.mjs']=replace(entry.decode(),mapping)
service={'containerId':failed['incomplete']['cid'],'containerStartedAt':started,'postmasterStart':epoch,
 'proofSha256':failed['currentProofSha256'],'serviceKey':failed['requestKey']}
for name in tuple(texts):
 s=texts[name]
 if name.endswith('/prior_failed34.py'):
  # Rebase the immutable predecessor validator from actual33 to actual34 only.
  s=original[name].replace('failed33','failed34').replace('PRIOR33_','PRIOR34_').replace('OLD33_','OLD34_')
  fields={'KEY':failed['requestKey'],'RESTORE':restored['requestKey'],'SERVICE':service,
   'TERMINAL':failed['terminalRootPublicSha256'],'NORMAL_ROOT':failed['normalResultRootSha256'],
   'NORMAL_PUBLIC':failed['normalResultPublicSha256'],'INCOMPLETE_ROOT':failed['incompleteRootSha256'],
   'INCOMPLETE_PUBLIC':failed['incompletePublicSha256'],'CLEANUP':failed['cleanupRootSha256'],
   'ACK':failed['incomplete']['retainedAckSha256'],'RESTORE_TERMINAL':restored['terminalRootPublicSha256'],
   'RESTORE_ROOT':restored['rootPins']['result'],'RESTORE_PUBLIC':restored['publicResultSha256'],
   'OLD_MAIN':base['files']['start/bundle/normal_service05_after08.py']['sha256'],
   'OLD_PROOF':base['files']['start/bundle/normal_service05_after08_proof.py']['sha256']}
  for k,v in fields.items():s=assignment(s,k,v)
  s=s.replace("'t45-r3-ordinary33-auth-restore-20261116-01'",repr(restored['requestKey']))
  s=s.replace('fresh35-current-production-service-v2-service-33.json','fresh35-current-production-service-v2-service-34.json')
  s=s.replace('ordinary33-auth-20261116-01/restored.json','ordinary34-auth-20261116-01/restored.json')
  s=s.replace('adfe3f7b83825b304346292a84296b9f6d05d99edaab41db85dff39021979470',restored['privateRestorationReceiptSha256'])
  t=ast.parse(s);loop=next(n for n in ast.walk(t) if isinstance(n,ast.For) and isinstance(n.target,ast.Name) and n.target.id=='cid')
  lines=s.splitlines(keepends=True);lines[loop.lineno-1]='    for cid in '+repr((service['containerId'],applied['cleanup']['cid'],restored['result']['cleanup']['cid']))+':\n';s=''.join(lines)
  marker='def validate(ops,control,authority=None):\n'
  s=s.replace(marker,marker+"    need(type(SERVICE['containerStartedAt']) is str and type(SERVICE['postmasterStart']) is str,'EXACT_C_TUPLE_EVIDENCE_REQUIRED')\n")
 elif name.endswith('/ordinary05_roles.py'):
  # The immediately preceding exact original authentication is in custody34.
  s=s.replace("'previousServiceRequestKey': 't45-first-r3-native-service-start-20261116-33'","'previousServiceRequestKey': 't45-first-r3-native-service-start-20261116-34'")
  s=s.replace('ordinary33-auth-20261116-01/original-auth.json','ordinary34-auth-20261116-01/original-auth.json')
 elif name.endswith('/ordinary05_roles_job.py'):
  s=assignment(s,'PRIOR_CID',service['containerId']);s=assignment(s,'PRIOR_NAME','t45-fresh35-first-production-20261110-r3-service-34')
  s=s.replace("'t45-first-r3-native-service-start-20261116-33'",repr(failed['requestKey']))
  s=s.replace("prior['State']['StartedAt']=='2026-11-16T14:39:10.568097848Z'","prior['State']['StartedAt']=="+repr(started))
  tree=ast.parse(s);fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='require_unentered_apply01')
  lines=s.splitlines(keepends=True)
  fresh="""def require_unused_apply35(ops, control):
    key='t45-r3-ordinary35-auth-apply-20261116-01'
    root=WORKER/key
    # The dispatcher owns this current request directory; only preexisting
    # phase effects/custody/capture/container are forbidden here.
    need(not any(present(p) for p in [*[root/'results'/n for n in ('maintenance-auth-intent.json','maintenance-auth-inside.json','maintenance-auth-cleanup.json','maintenance-auth-result.json')],ROOT/'state/native-services/ordinary35-auth-20261116-01',ROOT/'state/fresh35-first-production-20261110-r3/ordinary35-auth-capture-20261116-01']),'ORDINARY35_APPLY_EFFECTS_ALREADY_PRESENT_NO_REPLAY')
    ids=command(['docker','ps','-a','--filter','name=^/'+key+'$','--format','{{.ID}}'],5)
    need(not ids.strip(),'ORDINARY35_APPLY_CONTAINER_PRESENT_NO_REPLAY')
"""
  s=''.join(lines[:fn.lineno-1])+fresh+''.join(lines[fn.end_lineno:]);s=s.replace('require_unentered_apply01(ops,control)','require_unused_apply35(ops,control)')
 elif name.endswith('/normal_service05_after08.py'):
  s=assignment(s,'PREVIOUS_JOB',failed['requestKey'])
 elif name.endswith('/normal_service05_after08_proof.py'):
  s=assignment(s,'PREVIOUS_JOB',failed['requestKey']);s=assignment(s,'PREVIOUS_EPOCH',epoch)
  s=s.replace("'restoreRequestKey':'t45-r3-ordinary33-auth-restore-20261116-02'","'restoreRequestKey':"+repr(restored['requestKey']))
  marker='    fixed=scope();dynamic='
  assert marker in s
  s=s.replace(marker,"    need(type(PREVIOUS_EPOCH) is str,'NORMAL35_EXACT_PRIOR34_EPOCH_EVIDENCE_REQUIRED')\n"+marker)
 texts[name]=s
# Recompute the whole dependency graph from exact old pin to new member pin.
# All duplicates of an old member must produce identical new bytes.
versions={n:{sha(original[n].encode())} for n in texts}
for iteration in range(20):
 replacements={}
 for n,s in texts.items():
  new=sha(s.encode())
  versions[n].add(new)
  for old in versions[n]:
   if old!=new:
    assert old not in replacements or replacements[old]==new,('AMBIGUOUS_PIN',n)
    replacements[old]=new
 # Immutable34 OLD_MAIN/OLD_PROOF deliberately remain historical pins. They
 # are not dependencies on the new35 host and must never become self-cycles.
 updated={n:(s if n.endswith('/prior_failed34.py') else replace(s,replacements)) for n,s in texts.items()}
 if updated==texts:break
 texts=updated
else:raise AssertionError('SOURCE_PIN_GRAPH_DID_NOT_SETTLE')
for n,s in texts.items():
 p=D/n;p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);p.write_text(s)
 if p.suffix=='.py':compile(s,str(p),'exec')
plan=json.loads((O/'PHASES34-APPLY02.UNISSUED.json').read_bytes())
plan=replace(json.dumps(plan),mapping);plan=json.loads(plan)
plan['state']='UNISSUED_NORMAL35_SOURCE_ONLY';plan['d1PostcompileSourcePinsSha256']=sha((F/'PINS.json').read_bytes())
plan['finalEntrySha256']=sha(texts['start/bundle/batched161-run.mjs'].encode())
plan['predecessor34Evidence']={'start':sha((W/'start/ACTUAL-START34-RESULT.json').read_bytes()),'restore':sha((W/'restore/ACTUAL-RESTORE34-COMPLETED.json').read_bytes()),'C':failed['currentProofSha256'],'ACK':failed['incomplete']['retainedAckSha256'],'cleanup':failed['cleanupRootSha256'],'safeRestored':restored['privateRestorationReceiptSha256'],'tupleComplete':tuple_record is not None}
plan['allUsedKeysNonReplayable']=True
prior=runpy.run_path(str(D/'start/bundle/prior_failed34.py'))
plan['predecessor']={'service':prior['SERVICE'],'bindings':prior['binding']()}
plan['previousConsumerSourcePinsSha256']='2a9d90b6f7f56218b3b48cef21dd9bd2a655e1131a9ab79f48c43dd5a5f7ec43'
for phase,j in plan['jobs'].items():
 j['sourceDirectory']=str(D/phase/'bundle');j['bundlePins']={p.name:sha(p.read_bytes()) for p in sorted((D/phase/'bundle').iterdir())}
(D/'PHASES35.UNISSUED.json').write_text(json.dumps(plan,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
cli=(O/'phase_cli.py').read_text().replace('PHASES34-APPLY02.UNISSUED.json','PHASES35.UNISSUED.json');(D/'phase_cli.py').write_text(cli)
delta={n:{'oldPath':origin[n],'old':sha(original[n].encode()),'new':sha(s.encode())} for n,s in texts.items() if original[n]!=s}
(D/'DELTA.json').write_text(json.dumps(delta,sort_keys=True,indent=2)+'\n')
(D/'WIP-STATUS.json').write_text(json.dumps({'state':'LOCAL_SOURCE_WIP_EXACT_PRIOR34_C_TUPLE_REQUIRED' if tuple_record is None else 'LOCAL_SOURCE_READY_FOR_NARROW_CHECKS','runtimeMembers':len(texts),'changedRuntimeMembers':len(delta),'tupleComplete':tuple_record is not None,'authorityIssued':False,'serverConnections':0,'PGConnections':0,'clockIssued':False,'newKeySubmitted':False,'runtimePass':False},sort_keys=True,indent=2)+'\n')
print(json.dumps({'sourceMembers':len(texts),'changedMembers':len(delta),'pinGraphIterations':iteration,'tupleComplete':tuple_record is not None,'serverActions':0}))
