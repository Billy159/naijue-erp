"""Real static proof + real stale predecessor refusal. No positive future receipt."""
from pathlib import Path
import ast
import hashlib
import importlib.util
import json

H = Path(__file__).resolve().parent
REPO = H.parents[2]
V = REPO / 'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
spec = importlib.util.spec_from_file_location('lineage_static_check', H / 'source_lineage.py')
m = importlib.util.module_from_spec(spec)
exec(compile((H / 'source_lineage.py').read_text(), str(H / 'source_lineage.py'), 'exec'), m.__dict__)
proof = m.check_lineage((H / 'SOURCE-CATALOG-LINEAGE.json').read_bytes())
prior = V / 'MAIN9-EXECUTION-01/materialize/receipts/release-receipts/t45-r3-batched-root06-source-delta-20261116-01/batched-source-materialization.json'
download = prior.read_bytes()
# Download is a pretty projection. Reuse the original materializer's exact
# pack() rule, then bind that encoding to the already-observed root digest.
raw = (json.dumps(json.loads(download), sort_keys=True) + '\n').encode()
assert m.sha(raw) == m.ROOT06_SHA256
try:
    m.check_marker(raw)
except ValueError as problem:
    assert str(problem) == 'SOURCE_LINEAGE_ACTUAL_ROOT07_MARKER_REQUIRED'
else:
    raise AssertionError('Actual ROOT06 may not stand in for future ROOT07')
actual = json.loads((V / 'NORMAL35-RUNTIME-01/catalog_update/ACTUAL-CATALOG35-RESULT.json').read_bytes())
assert actual['result']['batchedCatalog'] == m.HISTORICAL_CATALOG
assert {k: actual['rootPins'][v] for k, v in [('catalogUpdateTerminalSha256', 'terminal'), ('catalogUpdateResultSha256', 'result')]} == {k: m.HISTORY_PINS[k] for k in ['catalogUpdateTerminalSha256', 'catalogUpdateResultSha256']}
oldpath = V / 'PREPARE04-REFERENCEERROR-CONSUMER-WIP-01/prepare/bundle/final33_host.py'
a, b = oldpath.read_text(), (H / 'final33_host.SOURCE-CANDIDATE.py').read_text()
oldtree, newtree = ast.parse(a), ast.parse(b)
functions = lambda tree: {n.name: n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
old, new = functions(oldtree), functions(newtree)
dump = lambda n: ast.dump(n, include_attributes=False)
unchanged = []
for name, node in old.items():
    if name not in ('validate', 'applied_catalog_successor'):
        assert dump(node) == dump(new[name]), name
        unchanged.append(name)
historical = new['historical_applied_catalog_successor']
restored = ast.parse(ast.get_source_segment(b, historical).replace('historical_applied_catalog_successor', 'applied_catalog_successor', 1))
# The ONLY old historical body change is the source of the expected catalog;
# all old root/public, service, completion, capture, commit/readback guards stay.
expected_old = " binding=a['expectedBinding']\n expected=dict(sourceSetSha256=binding['batchedSourceSetSha256'],catalogSpecSha256=binding['batchedCatalogSpecSha256'],\n  modelSha256=binding['batchedModelSha256'])"
expected_new = " expected=dict(sourceSetSha256='cf27add8653a4aa85b8cb10d609e2b85b1c4e55cf02f7fd2f5bf9e60ecb5ce9c',\n  catalogSpecSha256='9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29',\n  modelSha256='626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811')"
historical_text = ast.get_source_segment(b, historical).replace('historical_applied_catalog_successor', 'applied_catalog_successor', 1)
assert expected_new in historical_text
historical_text = historical_text.replace(expected_new, expected_old)
assert dump(ast.parse(historical_text).body[0]) == dump(old['applied_catalog_successor'])
wrapper = ast.get_source_segment(b, new['applied_catalog_successor'])
assert wrapper.index('historical_applied_catalog_successor(a)') < wrapper.index('helper.validate(')
assert m.sha((H / 'source_lineage.py').read_bytes()) in wrapper
vold = ast.get_source_segment(a, old['validate'])
vnew = ast.get_source_segment(b, new['validate'])
vnew = vnew.replace(",'sourceLineage'}", "}").replace(m.CURRENT_SOURCE_CATALOG['sourceSetSha256'], m.HISTORICAL_CATALOG['sourceSetSha256']).replace(m.CURRENT_SOURCE_CATALOG['catalogSpecSha256'], m.HISTORICAL_CATALOG['catalogSpecSha256'])
assert dump(ast.parse(vold).body[0]) == dump(ast.parse(vnew).body[0])
for p in [H / 'source_lineage.py', H / 'render_host_candidate.py', H / 'final33_host.SOURCE-CANDIDATE.py']:
    ast.parse(p.read_text(), str(p))
helpertree = ast.parse((H / 'source_lineage.py').read_text())
assert not any(isinstance(n, ast.Attribute) and n.attr in ('connect', 'execute', 'time', 'time_ns') for n in ast.walk(helpertree))
report = {'state': 'STATIC_STRICT_SOURCE_LINEAGE_CHECKS_PASS_ONLY', 'lineageSha256': m.LINEAGE_SHA256,
          'actualCatalog35Matched': True, 'realROOT06RejectedAsROOT07': True,
          'originalHistoricalGuardsPreserved': True, 'unchangedHostFunctions': unchanged,
          'currentAndHistoricalCatalogComparedSeparately': True, 'scopeValidationOnlyClosedLineageAndNewSourcePinsChanged': True,
          'positiveFutureRuntimeFixture': False, 'actualROOT07ReceiptAvailable': False,
          'PGConnections': 0, 'nativeCalls': 0, 'clockCallsByThisCheck': 0, 'executionReady': False}
(H / 'LOCAL-CHECKS.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'state': report['state'], 'unchangedHostFunctions': len(unchanged), 'historyGuardsPreserved': True, 'realROOT06Rejected': True}))
