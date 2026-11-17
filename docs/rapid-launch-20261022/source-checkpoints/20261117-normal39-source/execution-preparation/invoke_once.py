"""Prepared original normal38 call. Import/compile is not execution or issuance."""
from pathlib import Path
import ast, hashlib, json, os, runpy, sys

HERE = Path(__file__).resolve().parent
CONSUMER = HERE.parent / 'NORMAL39-SOURCE-SUCCESSOR-02'
SOURCE_SHA = 'dd4a1ba183163c8a4c2e2a85f2dce52124530da945987da63976d21534b488da'
CLI_SHA = '758ee15f07f7dc458aad089de2efda267b33aa3f287739025f21db9572ac6585'
PHASES = ('apply', 'start', 'prepare', 'writer', 'stop', 'restore')
sha = lambda b: hashlib.sha256(b).hexdigest()

def need(ok, code):
    if not ok:
        raise ValueError(code)

def checked_cli():
    raw = (CONSUMER / 'SOURCE-PINS.json').read_bytes()
    need(sha(raw) == SOURCE_SHA, 'FROZEN_CONSUMER_DIFFERS')
    manifest = json.loads(raw)
    for leaf, row in manifest['files'].items():
        body = (CONSUMER / leaf).read_bytes()
        need(len(body) == row['bytes'] and sha(body) == row['sha256'], 'FROZEN_MEMBER_DIFFERS')
    body = (CONSUMER / 'phase_cli.py').read_bytes()
    need(sha(body) == CLI_SHA, 'FROZEN_CLI_DIFFERS')
    return runpy.run_path(str(CONSUMER / 'phase_cli.py'), run_name='normal39_original_invocation')

def prepared_request(phase, policy_file, policy_pin, authority_pin, output_directory):
    need(phase in PHASES, 'EXACT_SIX_PHASE_REQUIRED')
    cli = checked_cli()
    # This is the existing parser, collect_bundle_files and original request
    # constructor. It does not call state, remote, submit, main, or an issuer.
    client, argv, request = cli['prepare'](phase, policy_file, policy_pin,
                                          authority_pin, output_directory)
    policy = json.loads(Path(policy_file).read_bytes())
    fixed = json.loads((CONSUMER / 'PHASES39.UNISSUED.json').read_bytes())['jobs'][phase]
    rule = policy['jobs'][phase]
    expected = dict(fixed['bundlePins'])
    if phase in ('apply', 'restore'):
        roles = CONSUMER / phase / 'bundle/roles-authorization.json'
        expected['roles-authorization.json'] = sha(roles.read_bytes())
    need(rule['bundlePins'] == expected, 'EXACT_STATIC_AND_ISSUED_ROLE_MEMBERS_REQUIRED')
    folder = CONSUMER / phase / 'bundle'
    expected_files = {**expected, rule['authorityLeaf']: authority_pin}
    rows = []
    for leaf in sorted(expected_files):
        body = (folder / leaf).read_bytes()
        need(sha(body) == expected_files[leaf], 'ACTUAL_FINAL_MEMBER_DIFFERS')
        rows.append(dict(name=leaf, bytes=len(body), sha256=sha(body)))
    manifest = dict(taskId='T45', jobId=fixed['jobId'], files=rows)
    manifest_pin = sha((json.dumps(manifest, sort_keys=True) + '\n').encode())
    need(request['taskId'] == 'T45' and request['jobId'] == fixed['jobId']
         and request['script'] == fixed['script'] and request['args'] == [authority_pin]
         and request['timeoutSeconds'] == fixed['timeoutSeconds']
         and request['manifestSha256'] == manifest_pin
         and request['grantId'] == 'b16447fbc81f4d64', 'ACTUAL_ORIGINAL_REQUEST_DIFFERS')
    return client, argv, request

def safe_failure(error, stage, key):
    # Only enums/literal codes and controlled source coordinates are exported.
    allowed_types = {'ValueError', 'AssertionError', 'TypeError', 'KeyError',
                     'FileNotFoundError', 'PermissionError', 'SystemExit', 'TimeoutExpired'}
    sources = {
        str(CONSUMER / 'phase_cli.py'): 'PHASE_CLI', str(Path(__file__)): 'INVOKE'}
    allowed_codes = set()
    for path in (CONSUMER / 'phase_cli.py', Path(__file__)):
        tree = ast.parse(path.read_bytes())
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                value = node.value
                if value and len(value) <= 160 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789' for c in value):
                    allowed_codes.add(value)
    args = getattr(error, 'args', ())
    value = args[0] if type(args) is tuple and len(args) == 1 and type(args[0]) is str else None
    frames = []
    tb = error.__traceback__
    while tb is not None:
        frame = tb.tb_frame
        if frame.f_code.co_filename in sources:
            frames.append(dict(module=sources[frame.f_code.co_filename], line=tb.tb_lineno))
        tb = tb.tb_next
    return dict(requestKey=key, outcome='UNKNOWN_ORIGINAL_KEY_READBACK_REQUIRED',
                lastStage=stage, errorType=type(error).__name__ if type(error).__name__ in allowed_types else 'UNKNOWN',
                safeCode=value if value in allowed_codes else 'UNKNOWN', sourceFrames=frames,
                automaticReplay=False)

def execute_once(phase, policy_file, policy_pin, authority_pin, output_directory):
    # Call only after Main's actual reviewed registration/issuance and original
    # key readback. There is no local/fake authority or alternate transport.
    client, argv, request = prepared_request(phase, policy_file, policy_pin,
                                             authority_pin, output_directory)
    output = Path(output_directory)
    need(output.is_dir(), 'EXISTING_OPERATION_OUTPUT_REQUIRED')
    intent = dict(state='SUBMIT_ONCE_OUTCOME_UNKNOWN_UNTIL_ORIGINAL_KEY_READBACK',
                  request=request, consumerSourcePinsSha256=SOURCE_SHA)
    # Existence prevents this prepared caller from resubmitting its own intent.
    with (output / 'SUBMIT-ONCE-INTENT.json').open('x') as f:
        json.dump(intent, f, sort_keys=True, indent=2)
        f.write('\n'); f.flush(); os.fsync(f.fileno())
    previous = sys.argv
    try:
        sys.argv = [str(CONSUMER.parent.parents[3].parent / 'monitor/normal-admission-20261112-01/admin_client-t45-code-transport-v3.py'), *argv]
        client['main']()
    except BaseException as error:
        result = safe_failure(error, 'ORIGINAL_MAIN_CALLED', request['jobId'])
        with (output / 'CALL-FAILURE-READBACK-REQUIRED.json').open('x') as f:
            json.dump(result, f, sort_keys=True, indent=2); f.write('\n')
        return result
    finally:
        sys.argv = previous
    return dict(requestKey=request['jobId'], state='CALL_RETURNED_ORIGINAL_KEY_READBACK_REQUIRED',
                automaticReplay=False)

if __name__ == '__main__':
    try:
        need(len(sys.argv) == 7, 'SIX_EXACT_ISSUED_INPUTS_REQUIRED')
        result = execute_once(*sys.argv[1:])
    except BaseException as error:
        # A refusal before this invocation's main does not prove the original
        # key was never submitted by an earlier invocation.
        result = safe_failure(error, 'PRE_SUBMISSION_VALIDATION_OR_LOCAL_RECEIPT', 'UNKNOWN')
    print(json.dumps(result, sort_keys=True))
