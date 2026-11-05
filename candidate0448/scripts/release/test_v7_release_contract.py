"""Pure V7 release/boot protocol tests. Fixtures prove no actual PostgreSQL ACL."""
import copy
import hashlib
import importlib.util
import os
import pathlib
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(os.environ.get('RELEASE_SOURCE_ROOT', str(pathlib.Path(__file__).resolve().parents[2])))
def load_support(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/release' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
V6 = load_support('synthetic_v6_metadata_support', 'test_v6_release_alignment.py')
T = load_support('synthetic_v6_boot_support', 'test_v6_boot_validation.py')
D = V6.D
NAME = 'recorded-live-ledger-v7'
PATCH = '26_hv2_live_ledger_pairs_complete_write_xmin_from_v22'
ORIGINAL_CAPACITY_PIN = 'f5a7e6aa2417579658a470f0c2a1ce6b6bf8c136c7abf300f0b2bf943e038852'

class V7ReleaseContract(unittest.TestCase):
    def fixture(self):
        args = V6.V6Release().fixture()
        p, runtime, review, metadata, independent = args
        p['runtime26Full']['catalogProfile'] = NAME
        review['catalog'].update(format='EXACT26_RUNTIME_CATALOG_EXPORT_V7', patchLevel=PATCH)
        metadata['recorded_live_balance_contract_match'] = True
        metadata['identity'].update(database_owner='synthetic_owner', server_version_num='180000')
        return args

    def validate(self, args):
        V6.V6Release().validate(args)

    def test_exact_v7_accepts_both_original_issuer_proofs(self):
        self.validate(self.fixture())

    def test_v1_v6_meanings_and_metadata_shapes_are_unchanged(self):
        self.validate(V6.V6Release().fixture(False))
        self.validate(V6.V6Release().fixture(True))
        args = V6.V6Release().fixture(True)
        args[3]['recorded_live_balance_contract_match'] = True
        with self.assertRaises(D.Refused):
            self.validate(args)

    def test_each_v7_proof_requires_exact_boolean_true(self):
        for field in ('complete_write_xmin_acl_match', 'recorded_live_balance_contract_match'):
            for value in (False, None, 0, 1, 'true', [], {}):
                args = self.fixture()
                args[3][field] = value
                with self.subTest(field=field, value=value), self.assertRaises(D.Refused):
                    self.validate(args)
            args = self.fixture()
            del args[3][field]
            with self.subTest(field=field, value='missing'), self.assertRaises(D.Refused):
                self.validate(args)

    def test_v7_exact_metadata_catalog_and_identity_shapes_reject_extras_or_missing(self):
        for location, field in ((3, 'source_xmin_acl_match'), ('catalog', 'extra'), ('identity', 'extra')):
            args = self.fixture()
            bag = args[3] if location == 3 else args[2]['catalog'] if location == 'catalog' else args[3]['identity']
            bag[field] = True
            with self.subTest(location=location), self.assertRaises(D.Refused):
                self.validate(args)
        for field in ('database_owner', 'server_version_num', 'replication_role'):
            args = self.fixture()
            del args[3]['identity'][field]
            with self.subTest(missing_identity=field), self.assertRaises(D.Refused):
                self.validate(args)

    def test_v7_never_falls_back_to_old_versions_or_infers_selection(self):
        for version in range(1, 7):
            args = self.fixture()
            args[2]['catalog']['format'] = 'EXACT26_RUNTIME_CATALOG_EXPORT_V' + str(version)
            with self.subTest(version=version), self.assertRaises(D.Refused):
                self.validate(args)
        for selection in (None, 'legacy-v1', 'complete-write-v6', 'complete-write-v7', 'unknown', False, [], {}):
            args = self.fixture()
            if selection is None:
                del args[0]['runtime26Full']['catalogProfile']
            else:
                args[0]['runtime26Full']['catalogProfile'] = selection
            with self.subTest(selection=selection), self.assertRaises(D.Refused):
                self.validate(args)
        args = self.fixture()
        args[2]['catalog']['patchLevel'] = V6.V6
        with self.assertRaises(D.Refused):
            self.validate(args)

    def test_original_target_source_purpose_and_catalog_guards_remain(self):
        def identity(args): args[3]['identity']['current_user'] = 'owner'
        def source(args): args[3]['source_routines_match'] = False
        def digest(args): args[3]['catalog_sha256'] = 'e' * 64
        def migrations(args): args[3]['migration_versions'].pop()
        def purposes(args): args[2]['purposes'].append('LIVE_LEDGER_PAIR_WRITE')
        def independent(args): args[4]['result'] = 'FAIL'
        def authority(args): args[2]['realImportExecutionAuthorized'] = True
        for change in (identity, source, digest, migrations, purposes, independent, authority):
            args = self.fixture()
            change(args)
            with self.subTest(change=change.__name__), self.assertRaises(D.Refused):
                self.validate(args)

    def test_v7_descriptor_is_bound_without_changing_legacy_or_v6_binding_bytes(self):
        p = self.fixture()[0]
        p.update(runtimeSelector='exact26-full', runtimeConfiguration={'path':'synthetic'})
        base = {'selector':p['runtimeSelector'], 'references':p['runtime26Full']['references'],
                'runtimeFile':p['runtimeConfiguration'], 'capacityHost':None, 'capacityGate':None,
                'capacityFinalInput':None, 'media':p['runtime26Full']['media'], 'inventorySpool':None}
        with patch.object(D, 'exact26_selected', return_value=True), patch.object(D, 'exact26_full', return_value=True):
            v7 = D.runtime_binding(p)
            p['runtime26Full']['catalogProfile'] = 'complete-write-v6'
            v6 = D.runtime_binding(p)
            old_descriptor = {'format':'EXACT26_RUNTIME_CATALOG_EXPORT_V6', 'patchLevel':V6.V6,
                              'aclProofField':'complete_write_xmin_acl_match'}
            self.assertEqual(v6, D.digest(D.encoded({**base, 'catalogBindingVersion':2, 'catalogProfile':old_descriptor})))
            del p['runtime26Full']['catalogProfile']
            legacy = D.runtime_binding(p)
            self.assertEqual(legacy, D.digest(D.encoded(base)))
            p['runtime26Full']['catalogProfile'] = 'legacy-v1'
            self.assertEqual(D.runtime_binding(p), legacy)
            self.assertNotEqual(v7, v6)
            self.assertNotEqual(v7, legacy)

    def test_finite_v7_boot_shape_preserves_unknown_profile_refusal(self):
        with T.synthetic_files():
            T.B.deployment_binding(T.deployment(profile=NAME, credential=True))
            for profile in ('complete-write-v7', 'unknown', '', None, False, [], {}):
                p = T.deployment()
                p['runtime26Full']['catalogProfile'] = profile
                with self.subTest(profile=profile), self.assertRaises(T.B.Refused):
                    T.B.deployment_binding(p)

    def test_changed_v7_helper_cannot_borrow_original_capacity_approval(self):
        # Negative stale-pin simulation only; never install a newly approved hash.
        with T.synthetic_files():
            p, rows = T.boot_fixture(T.deployment(profile=NAME, credential=True))
            self.assertNotEqual(hashlib.sha256(T.DEPLOY_SOURCE).hexdigest(), ORIGINAL_CAPACITY_PIN)
            with patch.object(T.B, 'DEPLOYMENT_CAPACITY_SHA256', ORIGINAL_CAPACITY_PIN), \
                 patch.object(T.B, 'read', return_value=T.B.encode(p)), \
                 patch.object(T.B, 'reference', side_effect=lambda row, *args: rows[row['path']]), \
                 self.assertRaisesRegex(T.B.Refused, '^REVIEWED_DEPLOYMENT_HELPER_REQUIRED$'):
                T.B.load_plan('/synthetic/boot-plan.json')

if __name__ == '__main__':
    unittest.main()
