"""Local generation37 consumer assembly; no client, issuer, clock or target execution."""
from pathlib import Path
import ast,hashlib,json,runpy,difflib
D=Path(__file__).resolve().parent;R=D.parent;O=R/'NORMAL36-SOURCE-SUCCESSOR-02'
sha=lambda b:hashlib.sha256(b).hexdigest()
def checked(path,pin):
 raw=path.read_bytes();assert sha(raw)==pin,path;return json.loads(raw)
base=checked(O/'SOURCE-PINS.json','498a16f17109bb5cc1142e4e9be9d3429ded9aab445222e77ce5965d906ed73f')
start=checked(R/'NORMAL36-RUNTIME-01/start/ACTUAL-START36-RESULT.json','2d9aa879a649ad9a47ccfeb4df218ee5adcca5059f1b0b5722197ca816acc486')
stop=checked(R/'NORMAL36-RUNTIME-01/stop/ACTUAL-STOP36-RESULT.json','0a1248f28c51437bc83dc474eae05f0d43dbc9a626af9d10ee82cf541b2ad87c')
restore=checked(R/'NORMAL36-RUNTIME-01/restore/ACTUAL-RESTORE36-RESULT.json','8ae0035cca6a6c5b11266ea6e0a1998f317315b724c9230121d0fdfe7c073857')
stop_basis=checked(R/'STOP36-READONLY-BASIS-ACTUAL-01/ACTUAL-STOP36-BASIS.json','91a62126e74575d0932fbfcbb9efb982c5e2e40de7d24971a4c4dc0cf501ba9c')
assert all(v['terminal']['status']=='COMPLETED' and v['terminal']['exitCode']==0 for v in (start,stop,restore))
assert restore['privateRestorationReceiptMatched'] and restore['result']['result']['exactOriginalVerifierAndExpiryVerifiedPrivately'] and restore['pgdataPidAbsent']
assert stop_basis['exactService']==start['service'] and stop_basis['writerUnsubmitted']
def assign(s,name,value):
 ns=[n for n in ast.parse(s).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in n.targets)];assert len(ns)==1,name
 n=ns[0];lines=s.splitlines(keepends=True);return ''.join(lines[:n.lineno-1])+name+' = '+repr(value)+'\n'+''.join(lines[n.end_lineno:])
# Exact own-round keys only. Historical service32/catalog35/input02/ROOT06 are never mapped.
mapping={
 't45-r3-ordinary36-auth-apply-20261116-01':'t45-r3-ordinary37-auth-apply-20261116-01',
 't45-r3-ordinary36-auth-restore-20261116-01':'t45-r3-ordinary37-auth-restore-20261116-01',
 't45-r3-ordinary36-preserve-stop-20261116-01':'t45-r3-ordinary37-preserve-stop-20261116-01',
 't45-first-r3-native-service-start-20261116-36':'t45-first-r3-native-service-start-20261116-37',
 't45-fresh35-first-production-20261110-r3-service-36':'t45-fresh35-first-production-20261110-r3-service-37',
 'fresh35-current-production-service-v2-service-36.json':'fresh35-current-production-service-v2-service-37.json',
 'ordinary36-auth-20261116-01':'ordinary37-auth-20261116-01',
 'ordinary36-auth-capture-20261116-01':'ordinary37-auth-capture-20261116-01',
 'direct36-batched-real.json':'direct37-batched-real.json',
 't45-r3-final33-plan-prepare-20261116-02':'t45-r3-final33-plan-prepare-20261116-03',
 'prior_preserved35.py':'prior_preserved36.py',
 'prior_preserved35':'prior_preserved36',
 'r3-service-36-worker-proof':'r3-service-37-worker-proof',
}
def rewrite(s,pairs):
 for a,b in pairs.items():s=s.replace(a,b)
 return s
helper=(O/'prior_preserved35.py').read_text()
helper=helper.replace('successful35','successful36').replace('PRIOR35_','PRIOR36_').replace('prior35_successful_source','prior36_successful_source').replace('fresh35-current-production-service-v2-service-35.json','fresh35-current-production-service-v2-service-36.json').replace('ordinary35-auth-20261116-01/restored.json','ordinary36-auth-20261116-01/restored.json')
fields={'KEY':start['requestKey'],'STOP':stop['requestKey'],'RESTORE':restore['requestKey'],'SERVICE':start['service'],'TERMINAL':start['rootPins']['terminal'],'NORMAL_ROOT':start['rootPins']['result'],'NORMAL_PUBLIC':start['publicResultSha256'],'STOP_TERMINAL':stop['rootPins']['terminal'],'STOP_ROOT':stop['rootPins']['result'],'STOP_PUBLIC':stop['publicResultSha256'],'CLEANUP':stop['rootPins']['cleanup'],'ACK':stop_basis['retainedAckSha256'],'RESTORE_TERMINAL':restore['rootPins']['terminal'],'RESTORE_ROOT':restore['rootPins']['result'],'RESTORE_PUBLIC':restore['publicResultSha256'],'RESTORED_SAFE':restore['privateRestorationReceiptSha256'],'OLD_MAIN':base['files']['start/bundle/normal_service05_after08.py']['sha256']}
for name,value in fields.items():helper=assign(helper,name,value)
original={};texts={};origin={}
for name,row in base['files'].items():
 if '/bundle/' not in name:continue
 raw=(O/name).read_bytes();assert sha(raw)==row['sha256'] and len(raw)==row['bytes']
 newname=name.replace('prior_preserved35.py','prior_preserved36.py');original[newname]=raw.decode();origin[newname]=name
 s=helper if name.endswith('/prior_preserved35.py') else rewrite(raw.decode(),mapping)
 if name.endswith('/ordinary05_roles.py'):
  s=s.replace("'previousServiceRequestKey': 't45-first-r3-native-service-start-20261116-35'","'previousServiceRequestKey': 't45-first-r3-native-service-start-20261116-36'")
 if name.endswith('/ordinary05_roles_job.py'):
  s=s.replace('require_unused_apply35','require_unused_apply37').replace('ORDINARY35_APPLY_EFFECTS_ALREADY_PRESENT_NO_REPLAY','ORDINARY37_APPLY_EFFECTS_ALREADY_PRESENT_NO_REPLAY').replace('ORDINARY35_APPLY_CONTAINER_PRESENT_NO_REPLAY','ORDINARY37_APPLY_CONTAINER_PRESENT_NO_REPLAY')
 if name.endswith('/normal_service05_after08.py') or name.endswith('/normal_service05_after08_proof.py'):
  s=assign(s,'PREVIOUS_JOB',start['requestKey'])
 if name.endswith('/normal_service05_after08_proof.py'):
  s=assign(s,'PREVIOUS_EPOCH',start['service']['postmasterStart'])
  s=s.replace("'previousStopRequestKey':'t45-r3-ordinary35-preserve-stop-20261116-01'","'previousStopRequestKey':'t45-r3-ordinary36-preserve-stop-20261116-01'").replace("'restoreRequestKey':'t45-r3-ordinary35-auth-restore-20261116-01'","'restoreRequestKey':'t45-r3-ordinary36-auth-restore-20261116-01'").replace('NORMAL36_EXACT_PRIOR35_EPOCH_EVIDENCE_REQUIRED','NORMAL37_EXACT_PRIOR36_EPOCH_EVIDENCE_REQUIRED')
 if name.endswith('/normal05_retained_stop.py'):
  # Seed all three actual current36 leaves; the following graph advances each to exact37.
  for constant,leaf in [('READONLY_SHA','r3_05_readonly.py'),('NORMAL05_SHA','normal_service05_after08.py'),('PROOF_SHA','normal_service05_after08_proof.py')]:s=assign(s,constant,base['files']['start/bundle/'+leaf]['sha256'])
 texts[newname]=s
# Track source-member identities only. Immutable predecessor36 source/receipt pins are exempt.
versions={n:{sha(original[n].encode())} for n in texts}
for iteration in range(30):
 replacements={}
 for n,s in texts.items():
  current=sha(s.encode());versions[n].add(current)
  for previous in versions[n]:
   if previous!=current:
    assert previous not in replacements or replacements[previous]==current,('AMBIGUOUS_PIN',n)
    replacements[previous]=current
 updated={n:(s if n.endswith('/prior_preserved36.py') else rewrite(s,replacements)) for n,s in texts.items()}
 if updated==texts:break
 texts=updated
else:raise AssertionError('EXACT37_SOURCE_PIN_GRAPH_DID_NOT_SETTLE')
for name,s in texts.items():
 p=D/name;p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 with p.open('x') as f:f.write(s)
 if p.suffix=='.py':compile(s,str(p),'exec')
with (D/'prior_preserved36.py').open('x') as f:f.write(helper)
blue=json.loads(rewrite((O/'PHASES36.UNISSUED.json').read_text(),mapping));blue['state']='UNISSUED_NORMAL37_PREPARE03_SOURCE_ONLY';blue['serverActions']=0
for phase,rule in blue['jobs'].items():
 rule['sourceDirectory']=str(D/phase/'bundle');rule['bundlePins']={Path(n).name:sha(s.encode()) for n,s in sorted(texts.items()) if n.startswith(phase+'/bundle/')};rule['authoritySha256']=None
 if phase in ('apply','restore'):rule['rolesAuthoritySha256']=None
with (D/'PHASES37.UNISSUED.json').open('x') as f:json.dump(blue,f,sort_keys=True,indent=2)
cli=(O/'phase_cli.py').read_text().replace('PHASES36.UNISSUED.json','PHASES37.UNISSUED.json')
with (D/'phase_cli.py').open('x') as f:f.write(cli)
collector=rewrite((O/'read_pending36.py').read_text(),mapping).replace('PHASES36.UNISSUED.json','PHASES37.UNISSUED.json')
with (D/'read_pending37.py').open('x') as f:f.write(collector)
patch=[]
for n,s in texts.items():
 if s!=original[n]:patch.extend(difflib.unified_diff(original[n].splitlines(keepends=True),s.splitlines(keepends=True),fromfile=str(O/origin[n]),tofile=str(D/n)))
with (D/'SOURCE-DIFF.patch').open('x') as f:f.writelines(patch)
status={'state':'SOURCE37_WIP_PIN_GRAPH_ASSEMBLED_PENDING_LITERAL_EDGE_AUDIT','members':len(texts),'changedMembers':sum(texts[n]!=original[n] for n in texts),'pinGraphIterations':iteration,'sourceOnly':True,'serverActions':0,'PGConnections':0,'clockCalls':0,'authorityIssued':False,'currentService37':None,'roles37Authority':None,'historicalPredecessor36':fields,'preparationIdentityMapping':blue['preparationIdentityMapping']}
with (D/'ASSEMBLY-STATE.json').open('x') as f:json.dump(status,f,sort_keys=True,indent=2)
print(json.dumps({'members':len(texts),'changedMembers':status['changedMembers'],'pinGraphIterations':iteration,'newService':None,'newAuthority':None,'serverActions':0}))
