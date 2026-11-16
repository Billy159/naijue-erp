"""Issue the current installer authorities from the saved start and materialization receipts."""
import hashlib
import json
from pathlib import Path
import runpy
import sys


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CONTROL = ROOT / 'outputs/主控'
MAIN = HERE.parent / 'SERVICE32-INSTALL-SESSION-SUCCESSOR-01'
MAIN_PINS = '7f350d38f72968680420995a937b9ba5e4046f35b407538d29388c952af315f0'
T45 = ROOT / 'outputs/T45/revisions/20261116-r3-normal32-install-session-successor-local-01'
RULES = T45 / 'CANDIDATE-01/PHASES32.UNISSUED.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked(path, expected):
    path = Path(path).resolve()
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == expected, path
    return path, json.loads(raw)


def issue(start_path, start_pin, apply_path, apply_pin, material_path, material_pin, review_path, review_pin):
    _, pins = checked(MAIN/'PINS.json', MAIN_PINS)
    _, prepared = checked(MAIN/'PREPARATION.json', pins['PREPARATION.json'])
    rules_pin = prepared['rulesSha256']
    _, rules = checked(RULES, rules_pin)
    _, transport = checked(T45/'TRANSPORT32.json', 'dcb384e24b08e0bd7f8814cdf7029d0fe1d3c9ca5e9398e795e8ca221d810c5b')
    assert sha(Path(transport['clientPath'])) == transport['clientSha256']
    start_path, start = checked(start_path, start_pin)
    _, apply = checked(apply_path, apply_pin)
    _, material = checked(material_path, material_pin)
    review_path, review = checked(review_path, review_pin)
    assert review['state'] == 'FINAL_SAME_VERSION_NORMAL_CHAIN_SOURCE_PASS'
    assert review['normalStartupHoldClosed'] is True and review['rulesSha256'] == rules_pin
    for receipt, phase in ((material,'materialize'),(apply,'apply'),(start,'start')):
        terminal = receipt['terminal']
        assert terminal['jobId'] == rules['jobs'][phase]['jobId']
        assert (terminal['status'],terminal['exitCode']) == ('COMPLETED',0)
        assert receipt['resultObjectsEqual'] is True
    marker = material['operatorReadySha256']
    assert marker == material['rootPins']['result'] == rules['expectedMaterializationSha256']
    assert material['result']['sourceSetSha256'] == rules['sourceSetSha256']
    assert material['result']['sourceFiles'] == rules['sourceFiles']
    assert start['service']['serviceKey'] == rules['jobs']['start']['jobId']
    assert start['descriptionSource'] == 'STORED_START_JOB_OUTPUTS_NO_NODE_RERUN'
    assert start['descriptionRootPublicObjectsMatched'] is True
    descdir = start_path.with_name(start_path.stem+'-describe')
    desc, facts = descdir/'DESCRIPTOR.json', descdir/'LIVE-FACTS.json'
    assert json.loads(desc.read_bytes()) == start['descriptor']
    assert json.loads(facts.read_bytes()) == start['liveFacts']
    for name in ('issue_upgrade_authority.py','issue_phase.py'):
        assert sha(MAIN/name) == pins[name]
    inner_dir = CONTROL/'20261116-r3-direct-service32-inner-install-window-01'
    inner = runpy.run_path(str(MAIN/'issue_upgrade_authority.py'), run_name='local_authority')['issue'](
        str(desc), sha(desc), str(facts), sha(facts), str(review_path), review_pin, str(inner_dir))
    print(json.dumps({'inner':inner}), flush=True)
    context = dict(apply=apply, start=start, operatorReadySha256=marker,
                   innerAuthorityPath=inner['path'], innerAuthoritySha256=inner['sha256'])
    ctx = inner_dir/'INSTALL-CONTEXT.json'
    with ctx.open('x') as stream:
        json.dump(context, stream, sort_keys=True, indent=2)
    context_pin = sha(ctx)
    outer = runpy.run_path(str(MAIN/'issue_phase.py'), run_name='local_authority')['issue'](
        'install', str(RULES), rules_pin, str(CONTROL/'20261116-r3-direct32-registration-window-01'),
        str(start_path), start_pin, str(ctx), context_pin)
    print(json.dumps({'outer':outer, 'contextPath':str(ctx), 'contextSha256':context_pin, 'serverAction':False}))


if __name__ == '__main__':
    issue(*sys.argv[1:])
