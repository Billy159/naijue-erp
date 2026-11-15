"""Exact service24 stop successor; original historical hold guards stay intact."""
from pathlib import Path
import ast,difflib,hashlib,json
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'20261114-r3-service23-original06-readonly-actual-01/stop/bundle'
SERVICE=HERE.parent/'20261115-r3-batched-service24-source-local-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
meta=json.loads((SERVICE/'PREPARED.json').read_bytes())

def once(text,old,new):
 assert text.count(old)==1,old
 return text.replace(old,new)

helper_old=(OLD/'normal05_retained_stop.py').read_text()
helper=helper_old.replace('t45-first-r3-native-service-start-20261114-23','t45-first-r3-native-service-start-20261115-24').replace('t45-fresh35-first-production-20261110-r3-service-23','t45-fresh35-first-production-20261110-r3-service-24').replace('fresh35-current-production-service-v2-service-23.json','fresh35-current-production-service-v2-service-24.json')
for old,new in [('b412a27ab94db67733b44cb06afb7537192a334fec5ad9a7eec801a17aa13dc0',meta['newProofSource']),('1d11e87d6183f298413069b58cc259531277130dfbf514f382a6621cdd83d1b7',meta['newSource']),('573b0f201e3179fd6c039588bd9f0496a04dbfff1ef5833577adcd9a7c7be1a0',sha((SERVICE/'start/bundle/r3_05_readonly.py').read_bytes()))]:
 helper=helper.replace(old,new)
old=(OLD/'normal05_preserve_stop.py').read_text()
new=old.replace('t45-r3-ordinary23-preserve-stop-20261114-01','t45-r3-ordinary24-preserve-stop-20261115-01').replace('t45-first-r3-native-service-start-20261114-23','t45-first-r3-native-service-start-20261115-24').replace('3db7c20b09f069b8188607e4241e59b764a86e3e316b72c4adc677f53fac2b4b',sha(helper.encode()))
new=once(new,"TERMINALS = {'COMPLETED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY'}", """TERMINALS = {'COMPLETED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY'}
CURRENT_BATCH_OPERATIONS = ('t45-r3-batched-install-20261115-01', 't45-r3-batched-real-execute-20261115-01')""")
new=once(new,"'policySha256', 'startsAt', 'expiresAt', 'authorizationReference', 'sourceSha256'}", "'policySha256', 'startsAt', 'expiresAt', 'authorizationReference', 'sourceSha256', 'currentBatchTerminals'}")
new=once(new,"         and all(a[k] == v for k,v in fixed.items()), 'PRESERVE_EXACT_AUTHORITY_REQUIRED')\n    service = a['service']\n", """         and all(a[k] == v for k,v in fixed.items()), 'PRESERVE_EXACT_AUTHORITY_REQUIRED')
    need(type(a['currentBatchTerminals']) is dict
         and set(a['currentBatchTerminals']) == set(CURRENT_BATCH_OPERATIONS)
         and all(v is None or type(v) is str and DIGEST.fullmatch(v)
                 for v in a['currentBatchTerminals'].values()), 'PRESERVE_CURRENT_BATCH_SCOPE_REQUIRED')
    service = a['service']
""")
new=once(new,'def preservation_stop(a):', '''def current_batch_terminals(a):
    observed = {}
    for key in CURRENT_BATCH_OPERATIONS:
        expected = a['currentBatchTerminals'][key]
        if expected is None:
            for grant in (GRANT, '5cc58239751e4e2a'):
                c, w = CONTROL.with_name('grant-' + grant), ROOT.with_name('grant-' + grant)
                need(not any(os.path.lexists(p) for p in (c/'requests'/(key+'.json'), c/'requests'/(key+'.tmp'),
                     c/'jobs'/key, c/'results'/(key+'.json'), w/'jobs'/key)),
                     'PRESERVE_CURRENT_OPERATION_ALREADY_PRESENT_OR_UNKNOWN')
            observed[key] = {'state': 'NOT_SUBMITTED'}
            continue
        raw = read(ROOT/'jobs'/key/'r3-outer-terminal.json', expected=expected)
        public = read(CONTROL/'results'/(key+'.json'), 1000, expected=expected)
        value = json.loads(raw)
        need(raw == public and value.get('jobId') == key and value.get('taskId') == 'T45'
             and value.get('grantId') == GRANT and value.get('status') in TERMINALS
             and value.get('finishedAtUTC'), 'PRESERVE_CURRENT_OPERATION_TERMINAL_REQUIRED')
        unit = 'naijue-erp-op-' + GRANT[:8] + '-' + pin(key.encode())[:12] + '.service'
        q = subprocess.run(['/usr/bin/systemctl', 'list-units', '--no-legend', '--plain',
                            '--state=active,activating,deactivating', unit], capture_output=True, timeout=5)
        need(q.returncode == 0 and not q.stdout.strip(), 'PRESERVE_CURRENT_OPERATION_UNIT_STILL_ACTIVE')
        observed[key] = {'state': value['status'], 'terminalSha256': expected}
    return observed


def preservation_stop(a):''')
new=once(new,'    terminal, active = terminal_and_hold(a)', '    current = current_batch_terminals(a)\n    terminal, active = terminal_and_hold(a)')
new=once(new,"                businessAdvanced=False, originalKeyReplayed=False)", "                businessAdvanced=False, originalKeyReplayed=False, currentBatchTerminals=current)")
out=HERE/'bundle';out.mkdir(exist_ok=True)
rows=[]
for name,before,after in [('normal05_retained_stop.py',helper_old,helper),('normal05_preserve_stop.py',old,new)]:
 ast.parse(after,filename=name)
 (out/name).write_text(after)
 (HERE/(name+'.diff')).write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='service23/'+name,tofile='service24/'+name)))
 rows.append({'name':name,'beforeSha256':sha(before.encode()),'sha256':sha(after.encode()),'bytes':len(after.encode())})
value={'scope':'UNISSUED_EXACT_SERVICE24_STOP_SOURCE','currentBatchOperations':list(('t45-r3-batched-install-20261115-01','t45-r3-batched-real-execute-20261115-01')),
 'historicalFailed19AndActiveHoldGuardsPreserved':True,'currentTerminalOrAbsenceProofRequiredBeforeStop':True,
 'serverCalls':0,'authorityIssued':False,'pythonSyntax':'PASS_AST_ONLY','files':rows}
(HERE/'PREPARED.json').write_text(json.dumps(value,sort_keys=True,indent=2)+'\n')
print(json.dumps(value,sort_keys=True))
