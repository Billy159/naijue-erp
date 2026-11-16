"""Bind only the exact T45 apply02 freeze; generate source, never issue or register."""
from pathlib import Path
import ast,hashlib,json,pprint,runpy
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
PREV=HERE.parent/'20261116-r3-normal34-root-source-01'
NORMAL=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL34-APPLY02-CLI-SUCCESSOR-UNISSUED-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def checked(path,pin):
 raw=path.read_bytes();assert sha(raw)==pin,path;return raw
def put(name,s):
 if name.endswith('.py'):compile(s,name,'exec')
 (HERE/name).write_text(s)
def assign(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in n.targets));l=s.splitlines(keepends=True)
 return ''.join(l[:n.lineno-1])+name+' = '+value+'\n'+''.join(l[n.end_lineno:])
def function(s,name):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef) and n.name==name)
 return '\n'.join(s.splitlines()[n.lineno-1:n.end_lineno])+'\n'
def replacefun(s,name,new):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef) and n.name==name);l=s.splitlines(keepends=True)
 return ''.join(l[:n.lineno-1])+new.rstrip()+'\n'+''.join(l[n.end_lineno:])
def const(name,value):
 return name+' = '+pprint.pformat(value,width=130,sort_dicts=True)+'\n'

frozen=json.loads(checked(NORMAL/'SOURCE-PINS.json','9dde7aaf1b3b40ec6fd90a344b62c1b158492c07f21c4d1b471289a9c96bc349'))
for leaf,row in frozen['files'].items():
 raw=checked(NORMAL/leaf,row['sha256']);assert len(raw)==row['bytes']
interface=json.loads(checked(NORMAL/'INTERFACE.UNISSUED.json','7747f3c5109112e7b1390117bd43e932bd140706330af6bbe72fa810387f2a9c'))
phases=json.loads(checked(NORMAL/'PHASES34-APPLY02.UNISSUED.json','cde56820391c940d014173e7654e47874d7cfb49bb864aa7f8674972b67e84e4'))
facts=json.loads((HERE/'CURRENT-FACTS.json').read_bytes());base=runpy.run_path(str(PREV/'register_cas.py'),run_name='source_only')
assert interface['rootConsumerPolicyRelativePath']=='r3-05-write-continuity/direct34-batched-real.json'
assert interface['outerApplyRequestKey']=='t45-r3-ordinary34-auth-apply-20261116-02'
assert interface['innerRoleRequestKey']==facts['refusedApplyKey'] and interface['originalUnusedRolePermitSha256']==facts['oldUnusedRolesSha256']
assert interface['preserveRoleScopeByteForByte'] is True
w=json.loads((PREV/'NINE-PHASES.UNISSUED.json').read_bytes());fields=('jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField')
for phase,row in phases['jobs'].items():
 w['jobs'][phase]={k:row[k] for k in fields};w['phaseDirectories'][phase]=row['sourceDirectory']
jobs={k:row['jobId'] for k,row in w['jobs'].items()}
assert all(jobs[k]==base['JOBS'][k] for k in jobs if k!='apply')
w.update(consumerSourceDirectory=str(NORMAL),consumerSourcePinsSha256=sha((NORMAL/'SOURCE-PINS.json').read_bytes()),
 innerRoleApplyKey=interface['innerRoleRequestKey'],refusedApply34=interface['actualRefusedOuter01'],
 unusedRolePermitSha256=facts['oldUnusedRolesSha256'],guardPolicyRelativePath=interface['rootConsumerPolicyRelativePath'],
 normal34Apply02SourceOnly=True,authoritiesIssued=False)
put('NINE-PHASES.UNISSUED.json',json.dumps(w,sort_keys=True,indent=2)+'\n')
fragment=(HERE/'refused_apply34_fragment.py').read_text();fragment_ast=ast.parse(fragment)
refused_constants=''.join('\n'.join(fragment.splitlines()[n.lineno-1:n.end_lineno])+'\n' for n in fragment_ast.body if isinstance(n,ast.Assign))
refused_function=function(fragment,'refused_apply34_history')
def add_refusal(s):
 s=s.replace('def required_history():',refused_constants+'\n'+refused_function+'\ndef required_history():',1)
 body=function(s,'required_history');body=body.replace('    return identities','    refused_apply34_history()\n    return identities')
 return replacefun(s,'required_history',body)
helper=(PREV/'r3_direct34_normal.py').read_text()
# e539 contains both its original header and an injected constants block.
# Change every exact top-level JOBS assignment, leaving ORIGINAL_JOBS untouched.
nodes=[n for n in ast.parse(helper).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='JOBS' for t in n.targets)]
assert len(nodes)==2
lines=helper.splitlines(keepends=True)
for n in reversed(nodes):lines[n.lineno-1:n.end_lineno]=['JOBS = '+repr(jobs)+'\n']
helper=''.join(lines)
helper=add_refusal(helper)
helper=helper.replace("        if phase is None:\n", "        self.need(job.get('jobId')!=REFUSED_KEY,'REFUSED_APPLY34_01_REISSUE_FORBIDDEN')\n        if phase is None:\n",1)
put('r3_direct34_apply02.py',helper)
current=ROOT/'outputs/主控/20261116-r3-normal34-registration-window-01/admin_exec.ISSUED.py'
template=checked(current,facts['currentDispatcherSha256']).decode()
template=assign(template,'R3_ORIGINAL02_ABSENT_POLICY_SHA256','None')
template=assign(template,'R3_ORIGINAL02_ABSENT_SOURCE_SHA256',repr(sha(helper.encode())))
template=template.replace("PUBLIC/'r3_direct34_normal.py'","PUBLIC/'r3_direct34_apply02.py'")
keys=ast.literal_eval(next(n.value for n in ast.parse(template).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='R3_ORIGINAL02_ABSENT_KEYS' for t in n.targets)))
template=assign(template,'R3_ORIGINAL02_ABSENT_KEYS',repr(list(dict.fromkeys(keys+list(jobs.values())))))
put('admin_exec.APPLY02-UNREGISTERED.py',template)
s=(PREV/'register_cas.py').read_text();B,P,H=(base[k] for k in ('B','P','H'))
values={'BASIS':'{Path(k):v for k,v in '+pprint.pformat(facts['basis'],width=130)+'.items()}',
 'ENTRY':"B/'r3-normal34-apply02-registration-source-20261117-01/register_cas.py'",
 'AUDIT':"B/'r3-normal34-apply02-registration-cas-20261117-01'",
 'NEW_MODULE':"P/'r3_direct34_apply02.py'",'OLD_DISPATCHER':repr(facts['currentDispatcherSha256']),
 'JOBS':repr(jobs),'EXPECTED_RULES':pprint.pformat(w['jobs'],width=130),
 'HELPER':repr(sha(helper.encode())),'TEMPLATE':repr(sha(template.encode()))}
for key,value in values.items():s=assign(s,key,value)
s=add_refusal(s)
s=s.replace('T45_NORMAL34_REGISTRATION_CAS_V1','T45_NORMAL34_APPLY02_REGISTRATION_CAS_V1').replace('EXACT_NORMAL34_REGISTERED_NO_PHASE_SUBMITTED','EXACT_NORMAL34_APPLY02_REGISTERED_NO_PHASE_SUBMITTED').replace('.normal34-','.normal34-apply02-')
s=s.replace("and role_pins[0]!=ROLE_SHA","and role_pins[0] not in (ROLE_SHA,REFUSED_ROLE_SHA)")
q=function(s,'quiet')
q=q.replace("    required_history()","    need(not os.path.lexists(state/'state/fresh35-first-production-20261110-r3/ordinary34-auth-capture-20261116-01'),'UNUSED_INNER34_CAPTURE_REQUIRED')\n    required_history()",1)
q=q.replace("    return completed_preparation()","    q=subprocess.run(['/usr/bin/docker','ps','-a','--filter','name=^/'+REFUSED_KEY+'$','--format','{{.ID}}'],capture_output=True,timeout=5)\n    need(q.returncode==0 and not q.stderr and not q.stdout.strip(),'REFUSED_APPLY34_CONTAINER_MUST_BE_ABSENT')\n    return completed_preparation()")
s=replacefun(s,'quiet',q)
reg=function(s,'register')
reg=reg.replace('(AUDIT, NEW_MODULE, NEW_POLICY,','(AUDIT, NEW_MODULE,')
reg=reg.replace("read(H/'direct33-restore02-only.json')[0]","read(NEW_POLICY)[0]")
a=reg.index("            need(not os.path.lexists(NEW_POLICY)");b=reg.index("            result['published'].append('policy')",a)
reg=reg[:a]+"            pending_policy=H/'.normal34-apply02-policy.pending'\n            need(not os.path.lexists(pending_policy),'POLICY_PENDING_ALREADY_PRESENT')\n            put(pending_policy,files['policy'])\n            os.replace(pending_policy,NEW_POLICY)\n            sync(H)\n"+reg[b:]
# After replacing the existing consumer policy, all snapshots explicitly expect its new digest.
a=reg.index("            result['published'].append('policy')")
reg=reg[:a]+reg[a:].replace('snapshot(a)','snapshot(a,policy=sha(files[\'policy\']))').replace('snapshot(a,sha(new))',"snapshot(a,sha(new),sha(files['policy']))")
s=replacefun(s,'register',reg)
put('register_cas.py',s)
carrier=(PREV/'original-cas-normal34-carrier.UNISSUED.py').read_text().replace('r3-normal34-registration-source-20261116-01','r3-normal34-apply02-registration-source-20261117-01').replace('r3-normal34-registration-cas-20261116-01','r3-normal34-apply02-registration-cas-20261117-01').replace('EXACT_NORMAL34_REGISTERED_NO_PHASE_SUBMITTED','EXACT_NORMAL34_APPLY02_REGISTERED_NO_PHASE_SUBMITTED')
carrier=assign(carrier,'SOURCE',repr(sha(s.encode()))).replace('SOURCE = ','SOURCE=',1)
put('original-cas-apply02-carrier.UNISSUED.py',carrier)
reader=(PREV/'read_registration_basis.py').read_text()
reader=assign(reader,'BASIS',pprint.pformat(facts['basis'],width=130));reader=assign(reader,'JOBS',repr(jobs))
reader=add_refusal(reader)
reader=replacefun(reader,'quiet',q)
reader=reader.replace("'READONLY_NORMAL34_REGISTRATION_BASIS'","'READONLY_NORMAL34_APPLY02_REGISTRATION_BASIS'")
reader=reader.replace("'grantExpiresAtEpoch':grant['expiresAtEpoch']","'unusedRolePermitSha256':REFUSED_ROLE_SHA,'refusedApply34':refused_apply34_history(),'unusedInner34':True,'grantExpiresAtEpoch':grant['expiresAtEpoch']")
put('read_registration_basis.py',reader)
# Actual issuance still binds the future independent reports and real fresh basis, never a draft token.
issuer=(PREV/'issue_registration.py').read_text()
for key,value in [('FROZEN_RULES_SHA',repr(sha((HERE/'NINE-PHASES.UNISSUED.json').read_bytes()))),('CONSUMER_PIN',repr(w['consumerSourcePinsSha256']))]:issuer=assign(issuer,key,value)
node=next(n for n in ast.parse(issuer).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CONSUMER_REVIEW_PIN' for t in n.targets));l=issuer.splitlines(keepends=True);issuer=''.join(l[:node.lineno-1])+''.join(l[node.end_lineno:])
issuer=issuer.replace('==consumer_review_pin==CONSUMER_REVIEW_PIN','==consumer_review_pin')
issuer=issuer.replace("consumer_review['state']=='SOURCE_PASS_NORMAL34_CONSUMER_ONLY_PENDING_ROOT_PAIR'","consumer_review['state'].startswith('SOURCE_PASS_')")
issuer=issuer.replace('==consumer_review_pin\n','==consumer_review_pin==CONSUMER_REVIEW_PIN\n')
issuer=issuer.replace("consumer_review['state'].startswith('SOURCE_PASS_')","consumer_review['state']=='SOURCE_PASS_NORMAL34_APPLY02_CLI_CONSUMER_ONLY_PENDING_ROOT_PAIR'")
issuer=issuer.replace('def checked_consumer(',"CONSUMER_REVIEW_PIN='79621a4a25ae25a3fa7be67a82ca1020c3ea58123e09389737a61406290fcf37'\n\ndef checked_consumer(",1)
issuer=issuer.replace("'SOURCE_PASS_NORMAL34_ROOT_PAIR_ONLY'","'SOURCE_PASS_NORMAL34_APPLY02_ROOT_PAIR_ONLY'")
issuer=replacefun(issuer,'checked_consumer',"def checked_consumer(witness):\n    directory=Path(witness['consumerSourceDirectory']);frozen=json.loads(checked(directory/'SOURCE-PINS.json',CONSUMER_PIN))\n    assert frozen['clockOrAuthorityIssued'] is False and frozen['newKeyExecuted'] is False and frozen['serverConnections']==frozen['PGConnections']==0\n    for leaf,row in frozen['files'].items():\n        assert not Path(leaf).is_absolute() and '..' not in Path(leaf).parts\n        raw=checked(directory/leaf,row['sha256']);assert len(raw)==row['bytes']\n    return frozen\n")
for a,b in [('r3_direct34_normal.py','r3_direct34_apply02.py'),('admin_exec.NORMAL34-UNREGISTERED.py','admin_exec.APPLY02-UNREGISTERED.py'),('original-cas-normal34-carrier','original-cas-apply02-carrier'),('ISSUED_NORMAL34_REGISTRATION_NO_PHASE_SUBMITTED','ISSUED_NORMAL34_APPLY02_REGISTRATION_NO_PHASE_SUBMITTED'),('READONLY_NORMAL34_REGISTRATION_BASIS','READONLY_NORMAL34_APPLY02_REGISTRATION_BASIS')]:issuer=issuer.replace(a,b)
issuer=issuer.replace("    assert basis['activeOperationUnits']", "    assert basis['unusedInner34'] is True and basis['unusedRolePermitSha256']==cas['REFUSED_ROLE_SHA'] and basis['refusedApply34']=={'requestKey':cas['REFUSED_KEY'],'terminalSha256':cas['REFUSED_TERMINAL_SHA'],'requestSha256':cas['REFUSED_REQUEST_SHA'],'phaseStarted':False,'credentialWriteOccurred':False}\n    assert basis['activeOperationUnits']",1)
put('issue_registration.py',issuer)
phase=(PREV/'issue_phase.py').read_text()
phase=assign(phase,'FROZEN_RULES_SHA',repr(sha((HERE/'NINE-PHASES.UNISSUED.json').read_bytes())))
phase=phase.replace('ISSUED_NORMAL34_REGISTRATION_NO_PHASE_SUBMITTED','ISSUED_NORMAL34_APPLY02_REGISTRATION_NO_PHASE_SUBMITTED').replace('2fe2e9ccec7c2d196067e0756bb317f42b79c43eae40b6ee693b97a6c2f7dfc9',w['consumerSourcePinsSha256'])
phase=phase.replace('20261116-r3-direct-service34-','20261117-r3-direct-service34-').replace("'-after-preparation-window-01'","'-apply02-window-01'")
phase=phase.replace("    inside = result['result']","    inside = result['result']\n    assert inside['requestKey']==roles['requestKey']=='t45-r3-ordinary34-auth-apply-20261116-01'",1)
put('issue_phase.py',phase)
print(json.dumps({'state':'APPLY02_ROOT_SOURCE_ASSEMBLED_UNISSUED','basisEntries':len(facts['basis']),'rules':len(jobs),'staticMembers':sum(len(row['bundlePins']) for row in w['jobs'].values()),'clockIssued':False,'PGConnections':0}))
