from pathlib import Path
import ast, hashlib, json, difflib

HERE = Path(__file__).resolve().parent
PARENT = HERE.parent / 'SERVICE30-PREFIX155-REPAIR-02'
OUT = HERE.parent / 'SERVICE31-INSTALL-TRANSPORT-01'
ROOT = HERE.parents[3]
ACTUAL = ROOT / 'outputs/T45/revisions/20261116-r3-service30-registration-actual-01'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def encode(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()

def assigned(source, name):
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == name for t in n.targets))
    return node

def replace_node(source, node, replacement):
    lines = source.splitlines(keepends=True)
    return ''.join(lines[:node.lineno-1]) + replacement + '\n' + ''.join(lines[node.end_lineno:])

def replace_once(source, old, new):
    assert source.count(old) == 1, (old, source.count(old))
    return source.replace(old, new)

pins = json.loads((PARENT / 'PINS.json').read_bytes())
names = ['r3_direct30_batched.py', 'admin_exec.DIRECT30-UNREGISTERED.py',
         'register_cas.py', 'original-cas-direct30-carrier.UNISSUED.py',
         'issue_phase.py', 'issue_registration.py', 'issue_upgrade_authority.py']
sources = {}
for name in names:
    raw = (PARENT/name).read_bytes()
    assert sha(raw) == pins[name]
    sources[name.replace('30', '31')] = (raw.decode().replace('direct30', 'direct31')
        .replace('DIRECT30', 'DIRECT31').replace('service30', 'service31')
        .replace('current30', 'current31').replace('ordinary30', 'ordinary31')
        .replace('service-30.json', 'service-31.json').replace('start-20261116-30', 'start-20261116-31'))

actual = {}
for phase, leaf in [('materialize','READBACK-02.json'), ('apply','READBACK-01.json'),
                    ('start','READBACK-02.json'), ('stop','READBACK-01.json'), ('restore','READBACK-01.json')]:
    actual[phase] = json.loads((ACTUAL/phase/leaf).read_bytes())
    assert actual[phase]['terminal']['status'] == 'COMPLETED' and actual[phase]['terminal']['exitCode'] == 0
closed = json.loads((ACTUAL/'RESULT30-CLOSED.json').read_bytes())
assert sha((ACTUAL/'RESULT30-CLOSED.json').read_bytes()) == '698a2dfbe46c7770e529de3340c7197732f79f9a120baf6458488d208c2085f9'
assert actual['restore']['result']['result']['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True
assert actual['restore']['result']['result']['naturalExpiryCountedAsRestoration'] is False

# Preserve every check in the existing successful27 closure. Only the two fixed
# internal records differ; no externally supplied generation or paths are accepted.
name = 'r3_direct31_batched.py'
s = sources[name]
cls = next(n for n in ast.parse(s).body if isinstance(n, ast.ClassDef))
oldmethod = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'previous27_closed')
oldtext = '\n'.join(s.splitlines()[oldmethod.lineno-1:oldmethod.end_lineno])
assignments = {n.targets[0].id:n.value for n in oldmethod.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name)}
spec27 = dict(records=ast.literal_eval(assignments['records']), service=ast.literal_eval(assignments['service']),
              cleanup=ast.literal_eval(assignments['cleanup_pin']),
              restoreCleanup='b8286a2e7449b7b9e165975fd5492fc6084eea1d1b9322e1b5f57e40c4c57339',
              proofLeaf='fresh35-current-production-service-v2-service-27.json')
spec30 = dict(records=[], service=actual['start']['service'], cleanup=actual['stop']['rootPins']['cleanup'],
              restoreCleanup=actual['restore']['rootPins']['cleanup'],
              proofLeaf='fresh35-current-production-service-v2-service-30.json')
for phase, leaf in [('start','normal-service-result.json'),('stop','normal05-preserve-stop-result.json'),('restore','maintenance-auth-result.json')]:
    r = actual[phase]
    spec30['records'].append((phase,r['terminal']['jobId'],r['rootPins']['terminal'],leaf,r['rootPins']['result'],r['publicResultSha256']))
body = oldtext[oldtext.index('        values = {}'):]
start = body.index('        service = {')
end = body.index('        started, stopped, restored =')
body = body[:start] + "        service = spec['service']\n" + body[end:]
body = body.replace("cleanup_pin = 'fda7c05908d7b94223901638b83a417d2d7f1c624d6d195abae6ede6fc0702e8'", "cleanup_pin = spec['cleanup']")
body = body.replace("'b8286a2e7449b7b9e165975fd5492fc6084eea1d1b9322e1b5f57e40c4c57339'", "spec['restoreCleanup']")
body = body.replace("HOST / 'authority/fresh35-current-production-service-v2-service-27.json'", "HOST / 'authority' / spec['proofLeaf']")
body = body.replace("'PREVIOUS27_", "f'PREVIOUS{generation}_")
method = ("    def previous27_closed(self):\n        self.previous_completed_closed(27)\n\n"
          "    def previous30_closed(self):\n        self.previous_completed_closed(30)\n\n"
          "    def previous_completed_closed(self, generation):\n        c = self.core\n"
          f"        specifications = {repr({27:spec27,30:spec30})}\n"
          "        self.need(type(generation) is int and generation in specifications, 'FIXED_SUCCESSFUL_GENERATION_REQUIRED')\n"
          "        spec = specifications[generation]\n        records = spec['records']\n" + body)
s = replace_once(s, oldtext, method)
s = replace_once(s, '        self.previous29_closed()\n', '        self.previous29_closed()\n        self.previous30_closed()\n')
assert len(s.encode()) <= 65536, len(s.encode())
sources[name] = s
module_sha = sha(s.encode())

name = 'admin_exec.DIRECT31-UNREGISTERED.py'
s = sources[name]
oldkeys = ast.literal_eval(assigned((PARENT/'admin_exec.DIRECT30-UNREGISTERED.py').read_text(), 'R3_ORIGINAL02_ABSENT_KEYS').value)
newkeys = [actual[p]['terminal']['jobId'].replace('ordinary30','ordinary31').replace('start-20261116-30','start-20261116-31') for p in ('apply','start','stop','restore')]
s = replace_node(s, assigned(s,'R3_ORIGINAL02_ABSENT_KEYS'), 'R3_ORIGINAL02_ABSENT_KEYS = '+repr(sorted(set(oldkeys+newkeys))))
s = replace_node(s, assigned(s,'R3_ORIGINAL02_ABSENT_SOURCE_SHA256'), 'R3_ORIGINAL02_ABSENT_SOURCE_SHA256 = '+repr(module_sha))
sources[name] = s
template_sha = sha(s.encode())

name = 'register_cas.py'
s = sources[name]
oldsource = (PARENT/name).read_text()
node = assigned(oldsource,'BASIS')
basis = {ast.literal_eval(k.args[0]):ast.literal_eval(v) for k,v in zip(node.value.keys,node.value.values)}
B = '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64'
P = '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64'
H = '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3'
basis[P+'/admin_exec.py'] = '5b6c3c83d362bcfaaf064e6427702c3eb7af995b8b823574ba55114a7d090b5c'
basis[P+'/r3_direct30_batched.py'] = pins['r3_direct30_batched.py']
basis[B+'/r3-05-write-continuity/direct30-batched-real.json'] = 'fbb5bb55532d708103e0e70acd5512b8a77ab7538555938a30f179d2a3241b10'
basis[B+'/r3-direct30-start-describe-registration-cas-20261116-01/old-dispatcher.bin'] = 'e15c47bb947a402f87de40e9972161b577df78611dd7a8f87019ad2f48ea54ed'
for phase in ('materialize','apply','start','stop','restore'):
    r = actual[phase]; key = r['terminal']['jobId']; folder = B+'/jobs/'+key
    basis[folder+'/r3-outer-terminal.json'] = r['rootPins']['terminal']
    leaf = {'materialize':'batched-source-materialization.json','apply':'maintenance-auth-result.json', 'start':'normal-service-result.json','stop':'normal05-preserve-stop-result.json','restore':'maintenance-auth-result.json'}[phase]
    basis[folder+'/results/'+leaf] = r['rootPins']['result']
    if phase in ('apply','restore'):basis[folder+'/results/maintenance-auth-cleanup.json'] = r['rootPins']['cleanup']
basis[H+'/authority/'+spec30['proofLeaf']] = spec30['service']['proofSha256']
basis[H+'/state/native-services/'+spec30['service']['serviceKey']+'/cleanup.json'] = spec30['cleanup']
basis[H+'/state/installed-real-operation-batched-root04-20261116-01/source-materialization.json'] = actual['materialize']['rootPins']['result']
basis[B+'/jobs/'+spec30['service']['serviceKey']+'/results/genuine-describe-process.json'] = actual['start']['describeProcessRootSha256']
s = replace_node(s, assigned(s,'BASIS'), 'BASIS={\n'+''.join(f' Path({path!r}):{pin!r},\n' for path,pin in basis.items())+'}')
s = replace_node(s, assigned(s,'OLD_DISPATCHER'), 'OLD_DISPATCHER = '+repr(basis[P+'/admin_exec.py']))
s = replace_node(s, assigned(s,'HELPER'), 'HELPER = '+repr(module_sha))
s = replace_node(s, assigned(s,'TEMPLATE'), 'TEMPLATE = '+repr(template_sha))
s = s.replace("prior.policy_sha256=='faed7dec0ccd88d74745e47bbdca94bbb8a9095f550d8016945f38d76ead827e'", "prior.policy_sha256=='fbb5bb55532d708103e0e70acd5512b8a77ab7538555938a30f179d2a3241b10'")
s = replace_once(s, "old[H/'direct29-batched-real.json'][0]", "old[H/'direct30-batched-real.json'][0]")
needle = " for grant in(GRANT,'5cc58239751e4e2a'):"
reuse = f""" reused04='{actual['materialize']['terminal']['jobId']}'
 raw04=read(B/'jobs'/reused04/'r3-outer-terminal.json')[0];public04=read(C/'results'/(reused04+'.json'),1000)[0];mat04=json.loads(raw04)
 need(sha(raw04)=='{actual['materialize']['rootPins']['terminal']}' and raw04==public04 and mat04.get('jobId')==reused04 and mat04.get('status')=='COMPLETED' and mat04.get('exitCode')==0,'ACTUAL_COMPLETED04_TERMINAL_REQUIRED')
 proof04=read(host/'state/installed-real-operation-batched-root04-20261116-01/source-materialization.json')[0];mat04=json.loads(proof04)
 need(sha(proof04)=='{actual['materialize']['rootPins']['result']}' and mat04.get('sourceSetSha256')=='{closed['sourceSetSha256']}' and mat04.get('sourceRowsSha256')=='{closed['sourceRowsSha256']}' and mat04.get('sourceFiles')==382,'ACTUAL_COMPLETED04_PROOF_REQUIRED')
"""
s = replace_once(s, needle, reuse+needle)
s = replace_once(s, "  for phase,key in JOBS.items():\n", "  for phase,key in JOBS.items():\n   if phase=='materialize' and grant==GRANT:continue\n")
sources[name] = s
cas_sha = sha(s.encode())
name = 'original-cas-direct31-carrier.UNISSUED.py'
sources[name] = replace_once(sources[name], pins['register_cas.py'], cas_sha)

name = 'issue_registration.py'
s = sources[name]
s = s.replace("assert witness['materializationAlreadyCompleted'] is False", "assert witness['materializationAlreadyCompleted'] is True")
s = s.replace("'NEW_EXACT_ROOT04_DELTA_ONCE'", "'REUSE_ACTUAL_COMPLETED_ROOT04_NEVER_RESUBMIT'")
s = replace_once(s, "assert basis['acceptedMaterializationSha256'] == witness['parentMaterializationSha256']", "assert witness['materializationAlreadyCompletedOperatorReadySha256'] == expected_material == '8bb064ba27cbdaeb04b64408fee3ac2f2c7c9b28c7a7720761105ca1d7d191e1'\n    assert witness['materializationReusedFromKey'] == jobs['materialize']\n    assert basis['acceptedMaterializationSha256'] == expected_material")
s = replace_once(s, "assert set(basis['candidateKeys']) >= set(jobs.values()), 'All seven new current phase keys, including new04, require actual absence'", "assert set(basis['candidateKeys']) >= set(jobs.values()) - {jobs['materialize']}, 'Only six unsubmitted current phases require absence; completed04 is protected reuse'")
s = s.replace('ISSUED_EXACT_ROOT03_SUCCESSOR_REGISTRATION_NO_SERVER_ACTION','ISSUED_EXACT_COMPLETED_ROOT04_REUSE_REGISTRATION_NO_SERVER_ACTION')
sources[name] = s

name = 'issue_phase.py'
s = sources[name]
s = replace_once(s, "    # Actual28 failed after C/ACK; there is no standalone stop28 terminal.\n    for key in ('previousStopRequestKey', 'previousStopTerminalSha256', 'previousStopResultSha256'):\n        a.pop(key, None)\n", "    # The actual completed30 predecessor has its own successful stop and auth restoration.\n")
s = replace_once(s, "previousIncompleteRootSha256=witness['priorStartIncompleteRootSha256']", "previousStopTerminalSha256=witness['priorStopTerminalSha256']")
s = replace_once(s, "previousRetainedAckSha256=witness['priorRetainedAckSha256']", "previousStopResultSha256=witness['priorStopPublicResultSha256']")
start=s.index("    assert witness['materializeNeverResubmit'] is True\n",s.index('def issue('))
end=s.index('    issued = Path(registration_directory)',start)
s=s[:start]+"    assert phase != 'materialize', 'Completed root04 must never be submitted again'\n    assert witness['materializeNeverResubmit'] is True and witness['materializationAlreadyCompleted'] is True\n    assert witness['materializationMode'] == 'REUSE_ACTUAL_COMPLETED_ROOT04_NEVER_RESUBMIT'\n"+s[end:]
# The old helper remains unreachable as history; the entry refuses materialize before any issuance.
sources[name] = s

OUT.mkdir(mode=0o700)
for name,s in sources.items():
    compile(s,name,'exec')
    (OUT/name).write_text(s)
    oldname = name.replace('31','30') if name not in ('issue_phase.py','issue_registration.py','issue_upgrade_authority.py','register_cas.py') else name
    diff = ''.join(difflib.unified_diff((PARENT/oldname).read_text().splitlines(True),s.splitlines(True),fromfile=oldname,tofile=name))
    (OUT/(name+'.patch')).write_text(diff)
report=dict(state='LOCAL_MAIN31_PREPARATION_ONLY_REVIEW_PENDING',serverActions=0,authorityFilesIssued=False,
            parentPinsSha256=sha((PARENT/'PINS.json').read_bytes()),moduleBytes=len(sources['r3_direct31_batched.py'].encode()),
            unchangedSourceLimit=65536,rootBasisFiles=len(basis),originalRootBasisFiles=len(node.value.keys),
            source04ReusedNeverResubmit=True,successfulGenerations=[27,30],successfulClosureSpecs={27:spec27,30:spec30},
            actual30ClosedSha256=sha((ACTUAL/'RESULT30-CLOSED.json').read_bytes()))
(OUT/'PREPARATION.json').write_bytes(encode(report))
(OUT/'PINS.json').write_bytes(encode({p.name:sha(p.read_bytes()) for p in OUT.iterdir() if p.is_file()}))
print(json.dumps(dict(directory=str(OUT),pinsSha256=sha((OUT/'PINS.json').read_bytes()),moduleSha256=module_sha,
                      moduleBytes=report['moduleBytes'],basisFiles=len(basis))))
