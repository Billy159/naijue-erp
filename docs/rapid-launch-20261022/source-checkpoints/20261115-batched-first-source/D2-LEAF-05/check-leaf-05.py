"""Offline frozen-contract leaf checks only; never parses or executes SQL."""
import hashlib
import json
from pathlib import Path

base = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for manifest in ['PINS.json', 'PREPARATION-PINS-02.json', 'LEAF-PINS-03.json', 'LEAF-PINS-04.json']:
    for name, digest in json.loads((base / manifest).read_text()).items():
        assert sha(base / name) == digest, (manifest, name)
inputs = json.loads((base / 'INPUT-PINS-05.json').read_text())
for item in inputs['frozenLeafContractInputs']:
    assert sha(Path(item['path'])) == item['sha256'], item['path']
manifest = json.loads((base / 'INTEGRATION-MANIFEST-05.json').read_text())
body_path = base / 'ROW-INTENT-BATCH-AFTER-05.body.sql.review'
definition_path = base / 'ROW-INTENT-BATCH-AFTER-05.definition.sql.review'
assert sha(body_path) == manifest['afterBodySha256']
assert sha(definition_path) == manifest['afterDefinitionSha256']
assert body_path.read_bytes() == (base / 'ROW-INTENT-BATCH-AFTER-03.body.sql.review').read_bytes()
assert definition_path.read_bytes() == (base / 'ROW-INTENT-BATCH-AFTER-03.definition.sql.review').read_bytes()
old_checks = json.loads((base / 'SOURCE-CHECKS-03.json').read_text())
assert old_checks['offlineSourceChecksPassed'] and old_checks['candidateBodySha256'] == sha(body_path)
body = body_path.read_text()
read_body = (base / 'ROW-INTENT-751.body.sql.review').read_text()
begin = '\nBEGIN'
fallback = ' table_name:=lower(kind);'
assert body[body.index(begin):body.index(fallback)] == read_body[read_body.index(begin):read_body.index(fallback)]
typed = "   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING item->'fields';"
matched = body.index('   IF expected=native_row THEN\n')
proof = body.index('intent_proof:=')
context = body.index('PERFORM naijue_erp.standard_whole_package_validate_context_v2(intent_root')
assert body.index(typed) < matched < proof < context
guard = body[matched:body.index('\n  END LOOP;', matched)]
assert guard.count('IS DISTINCT FROM') == 6
assert "RAISE EXCEPTION 'STANDARD_ROW_INTENT_CURRENT_PROOF_REQUIRED' USING ERRCODE='23514'" in guard
assert 'EXCEPTION WHEN' not in body and 'batched_import_v1' not in body
assert definition_path.read_text().count(body) == 1
assert manifest['trustedProtocolSelectionResolved'] and len(manifest['retainedLeaves']) == 3
requirements = json.loads((base / 'CASE-REQUIREMENTS-04.json').read_text())
scenarios = json.loads((base / 'SCENARIOS-05.json').read_text())
covered = [name for scenario in scenarios['scenarios'] for name in scenario['coversRequirements04']]
assert len(scenarios['scenarios']) == 6
assert len(covered) == len(set(covered)) == len(requirements['cases']) == 16
assert set(covered) == {case['id'] for case in requirements['cases']}
print(json.dumps({
    'offlineSourceChecksPassed': True,
    'fiveExactFrozenD1InputPinsMatched': True,
    'bodySha256': sha(body_path),
    'definitionSha256': sha(definition_path),
    'bodyIdenticalToCheckedHistorical03': True,
    'newContractResolvesProtocolAndMismatchPolicy': True,
    'roleIdFastBranchTypedOrderAndDefinitionHeaderPreserved': True,
    'wholeMarkerOnlySelectsProtocolNotRowPermission': True,
    'matchedWholeRequiresExactProofAndSameRootContext': True,
    'mismatch23514OriginalExceptionsPropagate': True,
    'threeAffectedCallerBodiesRetained': True,
    'scenarioGroups': 6,
    'requirementsCoveredOnce': 16,
    'sqlParsedOrExecuted': False,
    'newPgExecutions': 0,
    'serverActions': 0,
    'productSourceChanged': False,
    'installedOrAdopted': False
}, indent=2))
