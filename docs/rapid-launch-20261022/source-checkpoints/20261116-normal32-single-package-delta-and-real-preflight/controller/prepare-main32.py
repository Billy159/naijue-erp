"""Bind the existing Main issuer and registrar to T45's one repaired package."""
import ast
import difflib
import hashlib
import json
from pathlib import Path
import sys


HERE = Path(__file__).resolve().parent
PARENT = HERE.parent / 'SERVICE31-INSTALL-TRANSPORT-02'
OUT = HERE.parent / 'SERVICE32-INSTALL-SESSION-SUCCESSOR-01'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path, expected=None):
    raw = path.read_bytes()
    if expected is not None:
        assert sha(raw) == expected, path
    return json.loads(raw)


def encode(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def change(source, old, new):
    assert source.count(old) == 1, old
    return source.replace(old, new, 1)


def assignment(source, name):
    return next(node for node in ast.parse(source).body if isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == name for target in node.targets))


def replace_node(source, node, new):
    lines = source.splitlines(keepends=True)
    return ''.join(lines[:node.lineno-1]) + new + '\n' + ''.join(lines[node.end_lineno:])


def assign(source, name, value):
    return replace_node(source, assignment(source, name), f'{name} = {value!r}')


def advance_names(source):
    for old, new in (('direct31', 'direct32'), ('DIRECT31', 'DIRECT32'),
                     ('service31', 'service32'), ('current31', 'current32'),
                     ('native-service-v2-service-31.json', 'native-service-v2-service-32.json'),
                     ('production-service-v2-service-31.json', 'production-service-v2-service-32.json')):
        source = source.replace(old, new)
    return source


def completed_specs(source, actual):
    method = next(node for node in ast.walk(ast.parse(source))
                  if isinstance(node, ast.FunctionDef) and node.name == 'previous_completed_closed')
    node = next(node for node in method.body if isinstance(node, ast.Assign)
                and node.targets[0].id == 'specifications')
    previous = ast.literal_eval(node.value)
    readbacks = actual['readbacks']
    records = {generation: [tuple(record[i] for i in (2, 4, 5)) for record in value['records']]
               for generation, value in previous.items()}
    records[31] = [(readbacks[phase]['rootPins']['terminal'], readbacks[phase]['rootPins']['result'],
                    readbacks[phase]['publicResultSha256']) for phase in ('start', 'stop', 'restore')]
    specs = {}
    for generation, pins in records.items():
        value = previous.get(generation)
        service = actual['service'] if value is None else value['service']
        stop = readbacks['stop']['rootPins']['cleanup'] if value is None else value['cleanup']
        auth = readbacks['restore']['rootPins']['cleanup'] if value is None else value['restoreCleanup']
        specs[generation] = (pins, service['containerId'], service['containerStartedAt'],
                             service['postmasterStart'], service['proofSha256'], stop, auth)
        assert service['serviceKey'] == f't45-first-r3-native-service-start-20261116-{generation}'
    spec_lines = [f'            {generation}: {value!r},' for generation, value in specs.items()]
    source = replace_node(source, node, '        specifications = {\n' + '\n'.join(spec_lines) + '\n        }')
    source = change(source, "        spec = specifications[generation]\n        records = spec['records']",
        """        pins, cid, birth, epoch, proof, cleanup_pin, restore_cleanup = specifications[generation]
        service = dict(containerId=cid, containerStartedAt=birth, postmasterStart=epoch, proofSha256=proof,
                       serviceKey=f't45-first-r3-native-service-start-20261116-{generation}')
        paths = (
            ('start', service['serviceKey'], 'normal-service-result.json'),
            ('stop', f't45-r3-ordinary{generation}-preserve-stop-20261116-01', 'normal05-preserve-stop-result.json'),
            ('restore', f't45-r3-ordinary{generation}-auth-restore-20261116-01', 'maintenance-auth-result.json'),
        )""")
    source = change(source, '        for phase, key, terminal_pin, leaf, root_pin, public_pin in records:',
                    '        for (phase, key, leaf), (terminal_pin, root_pin, public_pin) in zip(paths, pins):')
    source = change(source, "        service = spec['service']\n", '')
    source = change(source, "        cleanup_pin = spec['cleanup']\n", '')
    source = change(source, 'self.private(records[2][1])', 'self.private(paths[2][1])')
    source = change(source, "spec['restoreCleanup']", 'restore_cleanup')
    source = change(source, "spec['proofLeaf']", "f'fresh35-current-production-service-v2-service-{generation}.json'")
    for generation in (27, 30):
        source = change(source, f'        self.previous{generation}_closed()\n',
                        f'        self.previous_completed_closed({generation})\n' +
                        ('        self.previous_completed_closed(31)\n' if generation == 30 else ''))
        source = change(source, f'    def previous{generation}_closed(self):\n        self.previous_completed_closed({generation})\n\n', '')
    return source


def prepare(rules_path, rules_sha):
    config = read(HERE / 'INSTALL-SUCCESSOR-INPUT.json',
                  'e497b6e494a85776f15c83dc6be6f8142bb0892dde5d0736dcb47f74433e4ae1')
    witness = read(rules_path, rules_sha)
    assert config['serverActionAuthorizedByThisFile'] is False
    source_inputs = read(rules_path.parent.parent / 'SOURCE-AND-TRANSPORT-INPUTS.json',
                         '822a6c7956445be935e5e8a41111cb8234f0f214577142af57745c82631e7b26')
    assert source_inputs['actualMaterialization'] is False
    for field in ('sourceSetSha256','sourceRowsSha256','sourceFiles','expectedMaterializationSha256'):
        assert witness[field] == source_inputs[field], field
    jobs = {phase: value['jobId'] for phase, value in witness['jobs'].items()}
    assert {phase:key for phase,key in jobs.items() if phase != 'materialize'} == config['phaseKeys']
    assert jobs['materialize'] == source_inputs['materializationKey']
    assert witness['materializeNeverResubmit'] is True and witness['materializationAlreadyCompleted'] is False
    assert witness['parentMaterializationRequestKey'] == config['source']['baseMaterializationKey']
    assert witness['parentMaterializationSha256'] == config['source']['baseMaterializationMarkerSha256']
    assert witness['parentSourceSetSha256'] == config['source']['baseSourceSetSha256']
    assert witness['parentSourceRowsSha256'] == config['source']['baseSourceRowsSha256']
    assert witness['sourceFiles'] == config['source']['baseFiles']
    description_path = Path(witness['phaseDirectories']['materialize']) / 'source-description.json'
    description = read(description_path, witness['jobs']['materialize']['bundlePins'][description_path.name])
    assert sha(description_path.read_bytes()) == source_inputs['sourceDescriptionSha256']
    assert {row['path'] for row in description['changes']} == set(config['source']['expectedChangedOwnerFiles'])
    transport_path = Path(witness['phaseDirectories']['install']) / 'private_transport.py'
    transport = transport_path.read_bytes()
    transport_pin = sha(transport)
    assert transport_pin == witness['jobs']['install']['bundlePins'][transport_path.name]
    assert transport_pin == source_inputs['privateTransport']['sha256']
    assert len(transport) == source_inputs['privateTransport']['bytes']
    current = config['actual31']
    refs = current['readbacks']
    failed = config['historicalInstall']
    old_key, new_key = failed['requestKey'], jobs['install']

    pins = read(PARENT / 'PINS.json', '184e65b96ab721b88853e5028971343fad46134748b110b3910f109f212f07e8')
    names = ['r3_direct31_batched.py', 'admin_exec.DIRECT31-UNREGISTERED.py', 'register_cas.py',
             'original-cas-direct31-carrier.UNISSUED.py', 'issue_phase.py', 'issue_registration.py', 'issue_upgrade_authority.py']
    original = {}
    for name in names:
        raw = (PARENT / name).read_bytes()
        assert sha(raw) == pins[name]
        original[name] = raw.decode()

    module = assign(advance_names(original[names[0]]), 'JOBS', jobs)
    module = completed_specs(module, current)
    assert len(module.encode()) <= 65536, len(module.encode())
    module_pin = sha(module.encode())

    template = advance_names(original[names[1]])
    existing_keys = ast.literal_eval(assignment(template, 'R3_ORIGINAL02_ABSENT_KEYS').value)
    template = assign(template, 'R3_ORIGINAL02_ABSENT_KEYS', sorted(set(existing_keys) | set(jobs.values())))
    template = assign(template, 'R3_ORIGINAL02_ABSENT_SOURCE_SHA256', module_pin)
    template = change(template, f"'T45','{old_key}'", f"'T45','{new_key}'")
    template = template.replace('12284', str(len(transport)+1)).replace('12283', str(len(transport)))
    old_transport_pin = '725415efdb5f5ca4e591de08e44a1c2e19ee75e111d65c566b89d3d6dabbddf1'
    assert template.count(old_transport_pin) == 2
    template = template.replace(old_transport_pin, transport_pin)
    template_pin = sha(template.encode())

    registrar = assign(advance_names(original[names[2]]), 'JOBS', jobs)
    registrar = assign(registrar, 'OLD_DISPATCHER', current['dispatcherSha256'])
    registrar = assign(registrar, 'HELPER', module_pin)
    registrar = assign(registrar, 'TEMPLATE', template_pin)
    old_basis = assignment(original[names[2]], 'BASIS')
    basis = {ast.literal_eval(path.args[0]): ast.literal_eval(pin)
             for path, pin in zip(old_basis.value.keys, old_basis.value.values)}
    public = '/usr/local/lib/naijue-erp-night/grant-' + config['grantId']
    worker = '/root/erp-release-20261006-01-worker/grant-' + config['grantId']
    state = '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3'
    basis[public+'/admin_exec.py'] = current['dispatcherSha256']
    basis[public+'/r3_direct31_batched.py'] = current['moduleSha256']
    basis[worker+'/r3-05-write-continuity/direct31-batched-real.json'] = current['policySha256']
    basis[worker+'/r3-direct31-start-describe-registration-cas-20261116-01/old-dispatcher.bin'] = '5b6c3c83d362bcfaaf064e6427702c3eb7af995b8b823574ba55114a7d090b5c'
    result_leaves = dict(apply='maintenance-auth-result.json', start='normal-service-result.json',
                         install='batched-install-result.json', stop='normal05-preserve-stop-result.json',
                         restore='maintenance-auth-result.json')
    for phase, leaf in result_leaves.items():
        row = refs[phase]
        folder = worker+'/jobs/'+row['requestKey']
        basis[folder+'/r3-outer-terminal.json'] = row['rootPins']['terminal']
        basis[folder+'/results/'+leaf] = row['rootPins']['result']
        if phase in ('apply','restore'):
            basis[folder+'/results/maintenance-auth-cleanup.json'] = row['rootPins']['cleanup']
    start = read(Path(refs['start']['path']), refs['start']['sha256'])
    pre_stop = read(Path(refs['prestop']['path']), refs['prestop']['sha256'])
    basis[state+'/authority/fresh35-current-production-service-v2-service-31.json'] = current['service']['proofSha256']
    live_folder = state+'/state/native-services/'+refs['start']['requestKey']
    basis[live_folder+'/cleanup.json'] = refs['stop']['rootPins']['cleanup']
    basis[live_folder+'/retained-ack.json'] = pre_stop['protectedAckSha256']
    basis[worker+'/jobs/'+refs['start']['requestKey']+'/results/genuine-describe-process.json'] = start['describeProcessRootSha256']
    registrar = replace_node(registrar, assignment(registrar,'BASIS'), 'BASIS={\n'+
                              ''.join(f' Path({path!r}):{pin!r},\n' for path,pin in basis.items())+'}')
    registrar = change(registrar, "prior.policy_sha256=='fbb5bb55532d708103e0e70acd5512b8a77ab7538555938a30f179d2a3241b10'",
                       'prior.policy_sha256=='+repr(current['policySha256']))
    registrar = change(registrar, "old[H/'direct30-batched-real.json'][0]", "old[H/'direct31-batched-real.json'][0]")
    registrar = change(registrar, "   if phase=='materialize' and grant==GRANT:continue\n", '')
    old_result = refs['install']
    guard = f''' old_install={old_key!r}
 terminal=read(B/'jobs'/old_install/'r3-outer-terminal.json')[0]
 public=read(C/'results'/(old_install+'.json'),1000)[0]
 t=json.loads(terminal)
 need(terminal==public and sha(terminal)=={old_result['rootPins']['terminal']!r}
  and (t.get('jobId'),t.get('status'),t.get('exitCode'),t.get('phaseStarted'))==(old_install,'FAILED',2,True),
  'CONFIRMED_ORIGINAL_INSTALL_TERMINAL_REQUIRED')
 root=read(B/'jobs'/old_install/'results/batched-install-result.json')[0]
 public=read(C/'jobs'/old_install/'results/batched-install-result.json',1000)[0]
 result=json.loads(root);failed=result['upgradeFailure']
 need(sha(root)=={old_result['rootPins']['result']!r} and sha(public)=={old_result['publicResultSha256']!r}
  and result==json.loads(public) and result.get('requestKey')==old_install
  and result.get('state')=='STOPPED_NOT_COMPLETE' and result.get('safeCode')=={failed['safeCode']!r}
  and result.get('connectionCleanup')=='CLOSED' and failed.get('stage')=='PREDECESSOR154'
  and failed.get('acknowledgedLayers')==0 and failed.get('rollbackAcknowledged') is True
  and all(result.get(k) is True for k in ('childReaped','descendantsReaped','innerAuthorityRemoved','nativeResultBindingMatched')),
  'CONFIRMED_ORIGINAL_INSTALL_ZERO_LAYERS_REQUIRED')
'''
    registrar = change(registrar, " for grant in(GRANT,'5cc58239751e4e2a'):", guard+" for grant in(GRANT,'5cc58239751e4e2a'):")
    carrier = change(advance_names(original[names[3]]), pins[names[2]], sha(registrar.encode()))

    phase = advance_names(original[names[4]])
    phase = change(phase, "    assert phase != 'materialize', 'Completed root04 must never be submitted again'\n"
                          "    assert witness['materializeNeverResubmit'] is True and witness['materializationAlreadyCompleted'] is True\n"
                          "    assert witness['materializationMode'] == 'REUSE_ACTUAL_COMPLETED_ROOT04_NEVER_RESUBMIT'",
                          "    assert witness['materializeNeverResubmit'] is True and witness['materializationAlreadyCompleted'] is False\n"
                          f"    assert witness['materializationMode'] == {witness['materializationMode']!r}")
    phase = change(phase, 'Cleanly stop exact generation 28 and preserve its data directory.',
                          'Cleanly stop the exact authorized service and preserve its data directory.')
    phase = change(phase, 'actual completed30 predecessor', 'actual completed31 predecessor')
    phase = change(phase,
        "    assert result['connectionCleanup'] == 'CLOSED' and result['roleRestoreAcknowledged'] is True\n",
        """    assert result['connectionCleanup'] == 'CLOSED' and result['roleRestoreAcknowledged'] is True
    assert installed['resultObjectsEqual'] is True and result['acknowledgedLayers'] == 13
    program = context['start']['descriptor']['programSha256']
    assert result['programSha256'] == program
    assert result['captureDirectoryLeaf'] == 'batched161-upgrade-' + program
    assert len(result['completionSha256']) == 64 and set(result['completionSha256']) <= set('0123456789abcdef')
""")
    first = phase.index('    assert description[', phase.index('def materialize_authority('))
    end = phase.index('    host = api(',first)
    phase = phase[:first]+f'''    assert description['format'] == {description['format']!r}
    for key, witness_key in (('predecessorMaterializationSha256','parentMaterializationSha256'),
                             ('predecessorSourceRowsSha256','parentSourceRowsSha256'),
                             ('sourceSetSha256','sourceSetSha256'),('sourceRowsSha256','sourceRowsSha256'),
                             ('sourceFiles','sourceFiles')):
        assert description[key] == witness[witness_key]
    assert sorted(row['path'] for row in description['changes']) == {sorted(config['source']['expectedChangedOwnerFiles'])!r}
'''+phase[end:]
    phase = change(phase, "'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root04-20261116-01'",
                           "'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root05-20261116-01'")
    phase = change(phase, 'Exact reviewed two-file SQL39 model-composition source delta from preserved703; new04 once, old03 never replayed; no database or service action.',
                          'Exact reviewed two-file installer identity, RESET and capture delta from preserved completed root04. Materialize the new source once without starting PostgreSQL.')

    issuer = advance_names(original[names[5]])
    first = issuer.index("    assert witness['materializationAlreadyCompleted']")
    end = issuer.index("    assert basis['actualPins']",first)
    issuer = issuer[:first]+f'''    assert witness['materializationAlreadyCompleted'] is False and witness['materializeNeverResubmit'] is True
    assert witness['materializationMode'] == {witness['materializationMode']!r}
    assert jobs['materialize'] == {jobs['materialize']!r}
    assert witness['parentMaterializationRequestKey'] == {config['source']['baseMaterializationKey']!r}
    assert witness['parentMaterializationSha256'] == basis['acceptedMaterializationSha256'] == {config['source']['baseMaterializationMarkerSha256']!r}
    assert witness['parentSourceRowsSha256'] == {config['source']['baseSourceRowsSha256']!r}
    assert witness['parentSourceSetSha256'] == {config['source']['baseSourceSetSha256']!r}
    assert witness['sourceSetSha256'] == {witness['sourceSetSha256']!r}
    assert witness['sourceRowsSha256'] == {witness['sourceRowsSha256']!r}
    assert witness['sourceFiles'] == {witness['sourceFiles']}
    assert basis['basisMismatches'] == [] and basis['executionLockMatches'] is True
    assert basis['activeOperationUnits'] == basis['presentCandidateKeys'] == []
    assert set(basis['candidateKeys']) >= set(jobs.values()), 'All seven current requests require actual absence'
'''+issuer[end:]
    issuer = change(issuer, 'ISSUED_EXACT_COMPLETED_ROOT04_REUSE_REGISTRATION_NO_SERVER_ACTION',
                           'ISSUED_EXACT_FAILED_INSTALL_SUCCESSOR_REGISTRATION_NO_SERVER_ACTION')
    upgrade = advance_names(original[names[6]])
    upgrade = change(upgrade, old_key, new_key)
    upgrade = change(upgrade, refs['start']['requestKey'], jobs['start'])
    upgrade = change(upgrade, "    assert d['sourceSetSha256'] == live['sourceSetSha256']",
                            f"    assert d['sourceSetSha256'] == live['sourceSetSha256'] == {witness['sourceSetSha256']!r}")

    files = dict(zip(names, (module,template,registrar,carrier,phase,issuer,upgrade)))
    for name, source in files.items():
        compile(source,name,'exec')
    OUT.mkdir(mode=0o700)
    for previous_name, source in files.items():
        name = previous_name.replace('31', '32')
        (OUT/name).write_text(source)
        diff = ''.join(difflib.unified_diff(original[previous_name].splitlines(True),source.splitlines(True),
                                            fromfile=previous_name,tofile=name))
        if diff:
            (OUT/(name+'.patch')).write_text(diff)
    report = dict(state='LOCAL_MAIN32_SOURCE_REVIEW_PENDING',authorityFilesIssued=False,serverActions=0,
                  rulesSha256=rules_sha,commonParametersSha256=sha((HERE/'INSTALL-SUCCESSOR-INPUT.json').read_bytes()),
                  mainModuleBytes=len(module.encode()),rootBasisFiles=len(basis),actual31CloseoutSha256=current['closeoutSha256'],
                  oldInstallKey=old_key,newInstallKey=new_key,unchangedWriterKey=jobs['writer'],privateTransportSha256=transport_pin,
                  privateTransportBytes=len(transport),sourceSetSha256=witness['sourceSetSha256'])
    (OUT/'PREPARATION.json').write_bytes(encode(report))
    (OUT/'PINS.json').write_bytes(encode({p.name:sha(p.read_bytes()) for p in OUT.iterdir()}))
    print(json.dumps(dict(directory=str(OUT),pinsSha256=sha((OUT/'PINS.json').read_bytes()),**report)))


if __name__ == '__main__':
    prepare(Path(sys.argv[1]).resolve(), sys.argv[2])
