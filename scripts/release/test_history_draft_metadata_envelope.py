"""C12-HELPER-F01 pure guard regression: no deployment helper import/actions.

Only three AST-extracted validation functions run in a restricted namespace.
Unrelated capacity/filesystem/credential plumbing uses explicit in-memory test
 doubles, as in existing V6/V7/V8 tests. Synthetic PASS strings here are protocol
fixtures, NEVER metadata review, real credentials, PostgreSQL or deployment.
"""
import ast
import copy
import hashlib
import json
import pathlib
import re
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/release/deploy-candidate.py'
CONTRACT_PATH = ROOT / 'config/release-contract.json'
CONTRACT = json.loads(CONTRACT_PATH.read_text())
DRAFT = 'history-draft-line-set-v1'
V7 = 'recorded-live-ledger-v7'
V8 = 'recorded-live-write-v8'
PIN = '7dde28550e9f4eaed427c6e1a57929d70cd11dc5c0866e79a87151bc5ebd7ff2'


def isolated_guard():
    tree = ast.parse(SOURCE.read_bytes(), filename=str(SOURCE))
    function_names = {'need', 'full_catalog_profile', 'validate_full_metadata'}
    functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in function_names]
    refused = [n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Refused']
    if len(functions) != 3 or len(refused) != 1 or any(n.decorator_list for n in functions + refused):
        raise AssertionError('EXACT_INERT_VALIDATOR_AST_REQUIRED')
    literals = {}
    names = {'DATABASE', 'ROLE', 'ORIGIN', 'HOST', 'RUNTIME26_REVIEW', 'RUNTIME26_INDEPENDENT', 'RUNTIME26_PURPOSES'}
    for n in tree.body:
        if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) and n.targets[0].id in names:
            literals[n.targets[0].id] = ast.literal_eval(n.value)
    if set(literals) != names:
        raise AssertionError('EXACT_GUARD_CONSTANTS_REQUIRED')
    generated = {}
    for n in tree.body:
        if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) and n.targets[0].id in {'RELEASE_CONTRACT', 'RELEASE_CONTRACT_SOURCE'}:
            call = n.value
            if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
                    and isinstance(call.func.value, ast.Name) and call.func.value.id == 'json'
                    and call.func.attr == 'loads' and len(call.args) == 1 and not call.keywords):
                raise AssertionError('ACTUAL_GENERATED_JSON_LITERAL_REQUIRED')
            generated[n.targets[0].id] = json.loads(ast.literal_eval(call.args[0]))
    source_bytes = CONTRACT_PATH.read_bytes()
    if generated.get('RELEASE_CONTRACT') != CONTRACT or generated.get('RELEASE_CONTRACT_SOURCE') != {
            'path': 'config/release-contract.json', 'bytes': len(source_bytes),
            'sha256': hashlib.sha256(source_bytes).hexdigest()}:
        raise AssertionError('ACTUAL_HELPER_GENERATED_CONTRACT_MUST_MATCH_SOURCE_PIN')
    plumbing_calls = []
    builtins = {k: v for k, v in vars(__import__('builtins')).items() if k in {
        '__build_class__', 'Exception', 'isinstance', 'dict', 'set', 'str', 'list', 'len', 'bool', 'type', 'all', 'int', 'range'}}
    scope = {'__name__': 'isolated_synthetic_metadata_guard', '__builtins__': builtins,
             **literals, 'RELEASE_CONTRACT': copy.deepcopy(generated['RELEASE_CONTRACT']),
             'FULL_PROFILE': CONTRACT['full']['profile'], 're': re, 'HASH': re.compile(r'[a-f0-9]{64}\Z')}

    def capacity(p, runtime, pending):
        plumbing_calls.append('capacity-test-double')
        return runtime

    def references(p):
        plumbing_calls.append('references-test-double')
        return p['runtime26Full']['references']

    def credential(p, runtime):
        plumbing_calls.append('credential-test-double')

    scope.update(capacity_runtime_configuration=capacity, runtime_references=references,
                 validate_full_credential=credential)
    # Never compile imports, assignments, entrypoints or any action function.
    module = ast.Module(body=refused + functions, type_ignores=[])
    exec(compile(module, str(SOURCE) + ':VALIDATION_ONLY_AST', 'exec'), scope)
    return types.SimpleNamespace(**scope), plumbing_calls


D, PLUMBING = isolated_guard()


def fixture(profile=DRAFT, address=None, port=None):
    descriptor = CONTRACT['full']['catalogProfiles'][profile]
    p = {'buildId': 'SYNTHETIC-HELPER-F01-ONLY', 'sourceCommit': 'c' * 40,
         'runtime26Full': {'catalogProfile': profile,
                          'references': {'review': {'sha256': 'a' * 64}, 'independentReview': {'sha256': 'b' * 64}},
                          'media': {'containerRoot': '/synthetic-only/media', 'rootKey': 'test'}}}
    target = {'database': D.DATABASE, 'databaseOid': '123', 'actingRole': D.ROLE, 'sessionUser': D.ROLE,
              'serverAddress': address, 'serverPort': port, 'postmasterStart': 'SYNTHETIC_ONLY_NO_REAL_SERVER'}
    runtime = {'schemaVersion': 1, 'profile': D.FULL_PROFILE, 'documentCommands': 'NATIVE_RUNTIME',
               'publicOrigin': D.ORIGIN, 'http': {'host': '0.0.0.0', 'port': 3000, 'acceptedHosts': [D.HOST]},
               'assets': {'root': '/app/web', 'entry': 'index.html'},
               'build': {'buildId': p['buildId'], 'sourceCommit': p['sourceCommit']}, 'postgres': {}, 'authentication': {},
               'runtime26Review': {'reviewFile': D.RUNTIME26_REVIEW, 'trustedReviewSha256': 'a' * 64},
               'existingPreparation': {'sales': False, 'transfers': False},
               'productMedia': {'root': '/synthetic-only/media', 'rootKey': 'test'}}
    review = {'version': 'C_NATIVE_RUNTIME26_REVIEW_V1', 'decision': 'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',
              'target': target, 'catalog': {'format': descriptor['format'], 'patchLevel': descriptor['patchLevel'], 'sha256': 'd' * 64},
              'purposes': D.RUNTIME26_PURPOSES + ['PRODUCT_MAINTENANCE', 'HISTORY_REVISION'],
              'scope': 'EXACT_TARGET_METADATA_ONLY', 'realImportExecutionAuthorized': False,
              'independentReview': {'path': D.RUNTIME26_INDEPENDENT, 'sha256': 'b' * 64, 'result': 'PASS'}}
    identity = {'database': target['database'], 'database_oid': target['databaseOid'], 'database_owner': 'SYNTHETIC_NON_RUNTIME_OWNER',
                'current_user': target['actingRole'], 'session_user': target['sessionUser'], 'server_version_num': '170011',
                'server_addr': address, 'server_port': port, 'postmaster_start': target['postmasterStart'], 'replication_role': 'origin'}
    metadata = {'identity': identity, 'migration_versions': list(range(1, 27)), 'catalog_sha256': 'd' * 64, 'source_routines_match': True}
    for field in ('aclProofField', 'observationProofField', 'deleteAclProofField'):
        if descriptor.get(field) is not None:
            metadata[descriptor[field]] = True
    return p, runtime, review, metadata, {'result': 'PASS', 'notice': 'SYNTHETIC_PROTOCOL_NOT_APPROVAL'}


class DraftMetadataEnvelope(unittest.TestCase):
    def validate(self, args):
        D.validate_full_metadata(*args)

    def test_valid_draft_exact_envelope_accepts_both_transport_identity_shapes(self):
        for address, port in [(None, None), ('127.0.0.1/32', 5432)]:
            with self.subTest(address=address):
                self.validate(fixture(address=address, port=port))

    def test_draft_missing_database_owner_or_server_version_rejected(self):
        for field in ('database_owner', 'server_version_num'):
            args = fixture()
            del args[3]['identity'][field]
            with self.subTest(missing=field), self.assertRaisesRegex(D.Refused, 'CLOSED_V8_ISSUER_IDENTITY_REQUIRED'):
                self.validate(args)

    def test_draft_extra_identity_key_rejected(self):
        args = fixture()
        args[3]['identity']['unreviewed'] = True
        with self.assertRaisesRegex(D.Refused, 'CLOSED_V8_ISSUER_IDENTITY_REQUIRED'):
            self.validate(args)

    def test_draft_extra_catalog_key_rejected(self):
        args = fixture()
        args[2]['catalog']['unreviewed'] = True
        with self.assertRaisesRegex(D.Refused, 'CLOSED_V8_REVIEW_CATALOG_REQUIRED'):
            self.validate(args)

    def test_v7_v8_valid_invalid_and_error_contracts_unchanged(self):
        for profile, label in [(V7, 'V7'), (V8, 'V8')]:
            self.validate(fixture(profile))
            for missing in ('database_owner', 'server_version_num'):
                args = fixture(profile)
                del args[3]['identity'][missing]
                with self.subTest(profile=profile, missing=missing), self.assertRaisesRegex(D.Refused, 'CLOSED_' + label + '_ISSUER_IDENTITY_REQUIRED'):
                    self.validate(args)
            for bag in ('identity', 'catalog'):
                args = fixture(profile)
                (args[3]['identity'] if bag == 'identity' else args[2]['catalog'])['extra'] = True
                error = 'CLOSED_' + label + ('_ISSUER_IDENTITY_REQUIRED' if bag == 'identity' else '_REVIEW_CATALOG_REQUIRED')
                with self.subTest(profile=profile, extra=bag), self.assertRaisesRegex(D.Refused, error):
                    self.validate(args)

    def test_draft_keeps_distinct_descriptor_exact_proofs_and_source_target_checks(self):
        descriptor = D.full_catalog_profile(fixture()[0])
        self.assertEqual(descriptor, CONTRACT['full']['catalogProfiles'][DRAFT])
        self.assertEqual(descriptor['requiredObservation'], 'HISTORY_DRAFT_TRANSFER_LINE_SET_FROM_V8')
        self.assertNotEqual(descriptor['format'], CONTRACT['full']['catalogProfiles'][V8]['format'])
        for field in ('complete_write_system_acl_match_v8', 'normal_delete_acl_match_v8', 'recorded_live_balance_contract_match', 'source_routines_match'):
            for value in (False, None, 0, 1, 'true'):
                args = fixture()
                args[3][field] = value
                with self.subTest(proof=field, value=value), self.assertRaises(D.Refused):
                    self.validate(args)
        for mutate in (lambda a: a[2]['catalog'].update(format='EXACT26_RUNTIME_CATALOG_EXPORT_V8'),
                       lambda a: a[2]['catalog'].update(patchLevel=CONTRACT['full']['catalogProfiles'][V8]['patchLevel']),
                       lambda a: a[3]['identity'].update(current_user='SYNTHETIC_WRONG_ROLE'),
                       lambda a: a[3]['migration_versions'].pop(), lambda a: a[3].update(catalog_sha256='e' * 64)):
            args = fixture()
            mutate(args)
            with self.assertRaises(D.Refused):
                self.validate(args)

    def test_no_helper_import_external_action_or_approval_pin_change(self):
        self.validate(fixture())
        self.assertFalse(any(key in vars(D) for key in ('subprocess', 'socket', 'Path', 'os', 'main', 'reference')))
        self.assertIn('credential-test-double', PLUMBING)
        for name in ('boot-entry.py', 'rollback-candidate.py'):
            text = (ROOT / 'scripts/release' / name).read_text()
            self.assertRegex(text, "(?m)^DEPLOYMENT_CAPACITY_SHA256 = '" + PIN + "'$")
        # Contract/profile facts are source data, unchanged by classification.
        self.assertEqual(hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest(), 'd4d6e1faa58eb0b7d400e9f88753c4ee7966a16da3cf88cbfc07eeb3a132f4bc')


if __name__ == '__main__':
    unittest.main()
