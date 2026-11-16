"""Issue one reviewed final-input receive group through the existing protocol."""
from pathlib import Path
import hashlib
import json
import os
import runpy
import sys
import time

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/INPUT-RECEPTION-01/CACHED-03'
FIRST_MANIFEST = '52a433465c79ce4b8d73cb848694a4675bc82f4c5d4208795abed9d4d3e0ad55'
SOURCE_HELPER = '66c569455eead6aee80c6fc974adc57a2eceed22be1f41a6cd6818afc6434faf'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def issue(group_directory, expected_manifest, output_directory, activation_delay_seconds=0):
    os.umask(0o077)
    review = ROOT / 'outputs/QB/20261116-final33-cached03-timeout-delta-review-01/RESULT.json'
    assert digest(review.read_bytes()) == '37d6765ce2233a85678d32a085abf7b3c7c0f1ec7bff0f49e0274324003df14c'
    reviewed = json.loads(review.read_bytes())
    assert reviewed['state'] == 'SOURCE_PASS_CACHED03_THREE_LEAF_TIMEOUT_DELTA_ONLY' and reviewed['findings'] == []
    first = BASE.parent / 'CACHED-02/first-standard-p001-p004'
    fixed = json.loads((first / 'AUTHORITY-FIELDS.UNISSUED.json').read_bytes())['fixed']
    assert digest((first / 'batch-manifest.json').read_bytes()) == fixed['batchManifestSha256'] == FIRST_MANIFEST
    fixed['codeSha256'] = reviewed['codeSha256']
    for leaf, pin in fixed['codeSha256'].items():
        assert digest((BASE / leaf).read_bytes()) == pin
    assert digest((BASE / 'final33-source.py').read_bytes()) == SOURCE_HELPER
    group = Path(group_directory).resolve(strict=True)
    if not group.is_relative_to(BASE.resolve()):
        index = ROOT / 'outputs/主控/20261115-r3-direct-service24-issuer-local-01/FINAL33-INPUT-CONTINUITY-01/GROUPS.json'
        assert digest(index.read_bytes()) == '4f6ffdc821ea5a12a7142897b508d3496e93f3b4c6ec356295326ef578fa0cf2'
        groups = json.loads(index.read_bytes())
        if not any(Path(row['directory']).resolve() == group and row['batchManifestSha256'] == expected_manifest
                   for row in groups):
            recovery = ROOT / 'outputs/主控/20261115-r3-direct-service24-issuer-local-01/FINAL33-INPUT-RECOVERY-CONTINUITY-01'
            assert group.is_relative_to(recovery.resolve())
            projection = json.loads((group / 'BOUNDARY-PROJECTION.json').read_bytes())
            assert projection['state'] == 'EXACT_WITHDRAWN_NATIVE_BOUNDARY_PROJECTED_NO_AUTHORITY_ISSUED'
            assert projection['recoveryManifestSha256'] == expected_manifest
            assert projection['normalizedManifestSha256'] in {row['batchManifestSha256'] for row in groups}
            plan = json.loads((group / 'batch-manifest.json').read_bytes())
            assert digest((json.dumps([{**part, 'window':{**part['window'], 'boundary':None}}
                                       for part in plan], sort_keys=True, separators=(',', ':')) + '\n').encode()) == projection['normalizedManifestSha256']
    manifest_raw = (group / 'batch-manifest.json').read_bytes()
    assert digest(manifest_raw) == expected_manifest
    sys.path.insert(0, str(BASE))
    protocol = runpy.run_path(str(BASE / 'batch_protocol.py'), run_name='local_authority')
    source = runpy.run_path(str(BASE / 'final33-source.py'), run_name='local_authority')
    now = time.time_ns() // 1_000_000
    delay = int(activation_delay_seconds)
    assert delay >= 0
    starts_at = now + delay * 1000
    policy_file = ROOT / 'outputs/主控/20261115-r3-direct-service24-issuer-local-01/FINAL33-INPUT-CACHED03-CONTINUITY-01/POLICY.CACHED03.json'
    assert digest(policy_file.read_bytes()) == '5d861a567b4918c65a327f077f92c19cda778086c71730e9a2930287b38979e1'
    policy = json.loads(policy_file.read_bytes())
    assert policy['codeSha256'] == fixed['codeSha256']
    assert policy['startsAt'] <= starts_at and starts_at + 1_080_000 <= policy['expiresAt'] - 300_000
    authority = dict(fixed, batchManifestSha256=expected_manifest,
                     startsAt=starts_at, expiresAt=starts_at + 1_080_000,
                     decisionReference='Authorized November 16 11:40 final input through the existing private T45 channel. Exact reviewed source and original fragment keys only.')
    raw = protocol['pack'](authority)
    pin = digest(raw)
    _, parts = protocol['bind'](raw, pin, manifest_raw)
    receiver = (BASE / 'artifact-receiver.d3-chunk.py').read_bytes()
    for part in parts:
        original, path, size, manifest = source['source_descriptor'](part['artifactKey'])
        assert manifest == authority['manifestSha256']
        assert all(part[key] == original[key] for key in ('archiveBytes', 'archiveSha256', 'fragmentIndex', 'fragmentOffset'))
        data = source['read_source'](path, size, part['fragmentOffset'], part['archiveBytes'])
        assert digest(data) == part['archiveSha256']
        prefix = hashlib.sha256()
        offset = 0
        for segment in part['window']['segments']:
            assert segment['offset'] == offset
            piece = data[offset:offset + segment['bytes']]
            assert len(piece) == segment['bytes'] and digest(piece) == segment['sha256']
            prefix.update(piece)
            assert prefix.hexdigest() == segment['prefixAfterSha256']
            offset += len(piece)
        assert offset == len(data)
        protocol['part_api'](receiver, authority, part, pin)
    output = Path(output_directory).resolve()
    assert output.parent == (ROOT / 'outputs/主控').resolve()
    output.mkdir(mode=0o700)
    for leaf, content in (('stage-authorization.json', raw), ('batch-manifest.json', manifest_raw)):
        with (output / leaf).open('xb') as stream:
            stream.write(content)
    install, restore = protocol['jobs'](pin)
    report = dict(state='FINITE_INPUT_RECEIVE_GROUP_ISSUED', authorizationPath=str(output / 'stage-authorization.json'),
                  authorizationSha256=pin, batchManifestPath=str(output / 'batch-manifest.json'),
                  batchManifestSha256=expected_manifest, issuedAt=now, startsAt=starts_at,
                  expiresAt=authority['expiresAt'],
                  installKey=install, restoreKey=restore, artifactKeys=[row['artifactKey'] for row in parts],
                  serverActions=0, businessWrites=0)
    with (output / 'ISSUED.json').open('x') as stream:
        json.dump(report, stream, indent=2)
        stream.write('\n')
    return report


if __name__ == '__main__':
    print(json.dumps(issue(*sys.argv[1:])))
