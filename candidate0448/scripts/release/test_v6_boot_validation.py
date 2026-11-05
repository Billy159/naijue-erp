"""Pure boot/deploy contract regressions: no server, credentials, Docker or PG.

Set RELEASE_SOURCE_ROOT to select baseline/candidate. All runtime references are
in-memory synthetic values, and filesystem stat calls use explicit doubles.
"""
import contextlib
import hashlib
import os
import pathlib
import stat
import types
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(os.environ.get(
    'RELEASE_SOURCE_ROOT', str(pathlib.Path(__file__).resolve().parents[2])))


def load(name):
    module = types.ModuleType(name)
    module.__file__ = str(ROOT / 'scripts/release' / (name + '.py'))
    source = pathlib.Path(module.__file__).read_bytes()
    exec(compile(source, module.__file__, 'exec'), module.__dict__)
    return module, source


B, BOOT_SOURCE = load('boot-entry')
D, DEPLOY_SOURCE = load('deploy-candidate')
H = 'a' * 64
PRIVATE_KEY = str(D.ROOT / 'private' / 'credential-request.key')


def ref(name):
    return {'path': str(B.ROOT / 'synthetic' / (name + '.json')), 'sha256': H}


def deployment(selector='exact26-full', profile=None, credential=False):
    node = 'sha256:' + 'b' * 64
    p = {
        'format': 'naijue-candidate-deployment-v1', 'buildId': 'synthetic-boot',
        'sourceCommit': 'c' * 40, 'runtimeSelector': selector,
        'publicOrigin': 'https://1n5635n614.goho.co',
        'schemaVersions': list(range(1, 20 if selector == 'schema19' else 27)),
        'releaseDirectory': str(B.ROOT / 'releases' / 'synthetic-boot'),
        'archive': {'sha256': H}, 'manifest': ref('manifest'),
        'nginxConfiguration': ref('nginx'),
        'capacityHost': {
            'collector': {'hostFile': str(B.ROOT / 'capacity' / 'collector.mjs'),
                          'containerFile': '/run/naijue-rewrite/capacity/capacity-live-statfs.mjs', 'sha256': H},
            'profile': {'hostFile': str(B.ROOT / 'capacity' / 'profile.json'),
                        'containerFile': '/run/naijue-rewrite/capacity/owner-profile.json', 'sha256': H},
            'interpreter': {'containerFile': '/usr/local/bin/node', 'sha256': H, 'imageId': node},
            'reviewSha256': H,
        },
        'runtimeConfiguration': {'path': str(B.ROOT / 'private' / 'runtime.json'), 'identity': {'inode': 123}},
        'beforeCAS': {
            'services': {name: {'id': H, 'imageId': node, 'startedAt': 'synthetic', 'restartCount': 0} for name in B.OLD},
            'files': [{'path': '/srv/naijue-erp/prod/synthetic.json', 'sha256': H}],
        },
        'images': {role: {'id': node, 'platform': 'linux/amd64'} for role in ('node', 'web')},
        'networks': {role: {'id': H, 'name': name} for role, name in
                     [('front', 'naijue-prod-front'), ('data', 'naijue-prod-data'), ('install', 'naijue-prod-ingress')]},
        'names': {role: 'naijue-rewrite-synthetic-' + suffix for role, suffix in
                  [('app', 'app'), ('stageWeb', 'stage-web'), ('publicWeb', 'web'), ('installer', 'installer')]},
        'limits': {'app': {'user': '10001:10001'}},
    }
    if selector == 'exact26-full':
        refs = {name: ref(name) for name in D.FULL_REFERENCES}
        full = {
            'references': refs,
            'media': {'hostRoot': str(B.ROOT / 'media'), 'containerRoot': '/run/naijue-rewrite/media/images',
                      'rootKey': 'images', 'writable': True},
            'inventorySpool': {'hostRoot': str(B.ROOT / 'spool'), 'containerRoot': '/private/inventory-exports'},
        }
        if profile is not None:
            full['catalogProfile'] = profile
        if credential:
            full['credentialRequestKey'] = {'hostFile': PRIVATE_KEY, 'containerFile': '/run/naijue-rewrite/credential-request.key'}
        p.update(runtime26Full=full, newDatabaseReceipt=refs['metadata'])
    elif selector == 'exact26-r1':
        p['runtime26'] = {name: ref(name) for name in
                          ('upgradeReceipt', 'review', 'independentReview', 'buildReceipt', 'sourceManifest', 'buildManifest')}
        p['newDatabaseReceipt'] = ref('new-database')
    return p


@contextlib.contextmanager
def synthetic_files(*, mode=0o600, size=32, uid=10001, links=1, symlink=False, parent_mode=0o700):
    """Exercise real credential canonical/stat checks without any host access."""
    file_stat = types.SimpleNamespace(st_mode=stat.S_IFREG | mode, st_nlink=links,
                                     st_size=size, st_uid=uid, st_gid=10001,
                                     st_dev=7, st_ino=9, st_mtime_ns=11)
    directory_stat = types.SimpleNamespace(st_mode=stat.S_IFDIR | parent_mode)
    with contextlib.ExitStack() as stack:
        # Boot's unrelated artifact-path checks are not the regression target.
        stack.enter_context(patch.object(B, 'safe', side_effect=lambda value, **kw: pathlib.Path(value)))
        stack.enter_context(patch.object(pathlib.Path, 'is_symlink', return_value=symlink))
        stack.enter_context(patch.object(pathlib.Path, 'lstat', return_value=file_stat))
        stack.enter_context(patch.object(pathlib.Path, 'resolve', lambda path, **kw: path))
        stack.enter_context(patch.object(pathlib.Path, 'stat', lambda path, **kw: directory_stat if path.name == 'private' else file_stat))
        stack.enter_context(patch.object(pathlib.Path, 'read_bytes', side_effect=AssertionError('RUNTIME_FILE_CONTENT_MUST_NOT_BE_READ')))
        stack.enter_context(patch.object(D, 'bytes_file', side_effect=AssertionError('CREDENTIAL_CONTENT_MUST_NOT_BE_READ')))
        stack.enter_context(patch.object(B.subprocess, 'run', side_effect=AssertionError('NO_NATIVE_COMMANDS')))
        yield


def boot_fixture(dp):
    p = {
        'format': 'naijue-boot-entry-v1', 'operationId': 'synthetic-op', 'fenceId': 'synthetic-fence',
        'legacyUnits': {name: {'sha256': H, 'unitFileState': 'enabled', 'activeState': 'active', 'subState': 'exited', 'dropIns': []}
                        for name in B.LEGACY},
        'restartPolicies': {name: B.POLICY for name in B.OLD},
        'deploymentPlan': ref('deployment-plan'),
        'deploymentTool': {'path': str(B.ROOT / 'synthetic' / 'deploy-candidate.py'), 'sha256': hashlib.sha256(DEPLOY_SOURCE).hexdigest()},
        'stageReceipt': ref('stage-receipt'), 'bootAudit': ref('boot-audit'),
    }
    stage = {
        'status': 'CANDIDATE_STAGED_HEALTH_ONLY_NOT_BUSINESS',
        **{key: dp[key] for key in ('buildId', 'sourceCommit', 'releaseDirectory', 'schemaVersions')},
        'archiveSha256': H, 'manifestSha256': H, 'installedPayloadSha256': H,
        'capacityFinalPlan': p['deploymentPlan'],
        'capacityFinalRuntimeIdentity': dp['runtimeConfiguration']['identity'],
        'capacityProducer': dp['capacityHost'],
        'runtime26BindingSha256': D.runtime_binding(dp),
        'containers': {role: {'id': H, 'specSha256': H} for role in ('app', 'stageWeb')},
    }
    audit = {
        'format': 'naijue-legacy-boot-audit-v1', 'result': 'PASS', 'reviewedBy': 'C',
        'monitorBehavior': 'OBSERVATION_ONLY', 'otherEntryLaunchers': 'NONE_OUTSIDE_FENCED_UNITS_AND_DOCKER_RESTART',
        'legacyUnitSha256': {name: H for name in B.LEGACY},
        'files': [{'path': '/srv/naijue-erp/t48/entry-monitor/monitor.py', 'sha256': H}],
        'enabledActors': list(B.LEGACY), 'evidence': [ref('audit-evidence')],
    }
    rows = {p['deploymentPlan']['path']: dp, p['deploymentTool']['path']: DEPLOY_SOURCE,
            p['stageReceipt']['path']: stage, p['bootAudit']['path']: audit}
    return p, rows


class V6BootValidation(unittest.TestCase):
    def test_explicit_v6_shape_reaches_boot(self):
        with synthetic_files():
            B.deployment_binding(deployment(profile='complete-write-v6'))

    def test_v6_private_credential_shape_reaches_boot(self):
        with synthetic_files():
            B.deployment_binding(deployment(profile='complete-write-v6', credential=True))

    def test_explicit_legacy_profile_and_credential_remain_supported(self):
        with synthetic_files():
            B.deployment_binding(deployment(profile='legacy-v1', credential=True))

    def test_original_selector_and_implicit_legacy_shapes_remain_supported(self):
        with synthetic_files():
            for selector in ('schema19', 'exact26-r1', 'exact26-full'):
                with self.subTest(selector=selector):
                    B.deployment_binding(deployment(selector))
            p = deployment('schema19')
            del p['runtimeSelector']
            B.deployment_binding(p)

    def test_unknown_profiles_and_keys_never_open_full_shape(self):
        with synthetic_files():
            for profile in ('unknown', 'complete-write-v7', '', False, [], {}, None):
                p = deployment()
                p['runtime26Full']['catalogProfile'] = profile
                with self.subTest(profile=profile), self.assertRaises(B.Refused):
                    B.deployment_binding(p)
            for key in ('credentialBytes', 'catalog', 'extra', 'runtime26'):
                p = deployment()
                p['runtime26Full'][key] = True
                with self.subTest(key=key), self.assertRaisesRegex(B.Refused, 'CLOSED_FULL_REFERENCES_REQUIRED'):
                    B.deployment_binding(p)

    def test_selector_reference_and_metadata_guards_stay_closed(self):
        edits = [lambda p: p.update(runtimeSelector='unknown'),
                 lambda p: p.update(runtimeSelector='schema19'),
                 lambda p: p.update(runtime26={}),
                 lambda p: p['runtime26Full']['references'].update(extra=ref('extra')),
                 lambda p: p['runtime26Full']['references']['review'].update(sha256='bad'),
                 lambda p: p['runtime26Full']['references']['review'].update(path='/outside/review.json'),
                 lambda p: p['runtime26Full']['references'].update(review=ref('metadata')),
                 lambda p: p.update(newDatabaseReceipt=ref('old-metadata'))]
        with synthetic_files():
            for index, edit in enumerate(edits):
                p = deployment()
                edit(p)
                with self.subTest(index=index), self.assertRaises(B.Refused):
                    B.deployment_binding(p)

    def test_full_loader_uses_real_pinned_helper_for_v6_credentials(self):
        with synthetic_files():
            p, rows = boot_fixture(deployment(profile='complete-write-v6', credential=True))
            with patch.object(B, 'read', return_value=B.encode(p)), patch.object(B, 'reference', side_effect=lambda row, *a: rows[row['path']]):
                actual, helper, dp, stage = B.load_plan('/synthetic/boot-plan.json')
            self.assertEqual(actual, p)
            self.assertEqual(dp['runtime26Full']['catalogProfile'], 'complete-write-v6')
            self.assertEqual(stage['runtime26BindingSha256'], helper.runtime_binding(dp))
            self.assertNotIn('sha256', helper.credential_key_binding(dp))

    def test_loader_retains_exact_helper_approval_and_stage_binding(self):
        with synthetic_files():
            p, rows = boot_fixture(deployment())
            p['deploymentTool']['sha256'] = 'f' * 64
            with patch.object(B, 'read', return_value=B.encode(p)), patch.object(B, 'reference', side_effect=lambda row, *a: rows[row['path']]), self.assertRaisesRegex(B.Refused, 'REVIEWED_DEPLOYMENT_HELPER_REQUIRED'):
                B.load_plan('/synthetic/boot-plan.json')
            p, rows = boot_fixture(deployment())
            rows[p['stageReceipt']['path']]['runtime26BindingSha256'] = 'f' * 64
            with patch.object(B, 'read', return_value=B.encode(p)), patch.object(B, 'reference', side_effect=lambda row, *a: rows[row['path']]), self.assertRaisesRegex(B.Refused, 'STAGED_RUNTIME_SELECTION_OR_REVIEW_CHANGED'):
                B.load_plan('/synthetic/boot-plan.json')

    def test_full_loader_preserves_credential_reference_refusals(self):
        cases = [({'extra': 'secret'}, 'CLOSED_CREDENTIAL_KEY_REFERENCE_REQUIRED'),
                 ({'containerFile': '/wrong'}, 'EXACT_PRIVATE_CREDENTIAL_CONTAINER_FILE_REQUIRED'),
                 ({'hostFile': 'relative'}, 'CANONICAL_ABSOLUTE_REFERENCE_REQUIRED'),
                 ({'hostFile': '/outside/key'}, 'REFERENCE_OUTSIDE_OWNED_ROOT'),
                 ({'hostFile': str(D.ROOT / 'releases' / 'key')}, 'SEPARATE_PRIVATE_CREDENTIAL_FILE_REQUIRED'),
                 ({'hostFile': str(D.ROOT / 'media' / 'key')}, 'SEPARATE_PRIVATE_CREDENTIAL_FILE_REQUIRED'),
                 ({'hostFile': str(D.ROOT / 'spool' / 'key')}, 'SEPARATE_PRIVATE_CREDENTIAL_FILE_REQUIRED')]
        with synthetic_files():
            for changes, code in cases:
                dp = deployment(profile='complete-write-v6', credential=True)
                p, rows = boot_fixture(dp)
                dp['runtime26Full']['credentialRequestKey'].update(changes)
                # load_plan creates a new helper module, so its Refused type is
                # intentionally not D.Refused. Match its exact refusal code.
                with self.subTest(changes=changes), patch.object(B, 'read', return_value=B.encode(p)), patch.object(B, 'reference', side_effect=lambda row, *a: rows[row['path']]), self.assertRaisesRegex(Exception, '^' + code + '$'):
                    B.load_plan('/synthetic/boot-plan.json')

    def test_full_loader_preserves_credential_stat_refusals(self):
        cases = [({'mode': 0o644}, 'PRIVATE_REFERENCE_PERMISSIONS_REQUIRED'),
                 ({'mode': 0o620}, 'REFERENCE_WRITABLE_BY_OTHERS'),
                 ({'size': 31}, 'EXACT_PRIVATE_CREDENTIAL_FILE_IDENTITY_REQUIRED'),
                 ({'uid': 10002}, 'EXACT_PRIVATE_CREDENTIAL_FILE_IDENTITY_REQUIRED'),
                 ({'links': 2}, 'REGULAR_REFERENCE_REQUIRED'),
                 ({'symlink': True}, 'SYMLINK_REFERENCE_REFUSED'),
                 ({'parent_mode': 0o722}, 'PRIVATE_CREDENTIAL_PARENT_REQUIRED')]
        for facts, code in cases:
            with synthetic_files():
                p, rows = boot_fixture(deployment(profile='complete-write-v6', credential=True))
            with self.subTest(facts=facts), synthetic_files(**facts), patch.object(B, 'read', return_value=B.encode(p)), patch.object(B, 'reference', side_effect=lambda row, *a: rows[row['path']]), self.assertRaisesRegex(Exception, '^' + code + '$'):
                B.load_plan('/synthetic/boot-plan.json')

    def test_current_helper_preserves_credential_reference_security(self):
        edits = [lambda p: p['runtime26Full']['credentialRequestKey'].update(extra='secret'),
                 lambda p: p['runtime26Full']['credentialRequestKey'].update(containerFile='/wrong'),
                 lambda p: p['runtime26Full']['credentialRequestKey'].update(hostFile='relative'),
                 lambda p: p['runtime26Full']['credentialRequestKey'].update(hostFile='/outside/key'),
                 lambda p: p['runtime26Full']['credentialRequestKey'].update(hostFile=str(D.ROOT / 'releases' / 'key')),
                 lambda p: p['runtime26Full']['credentialRequestKey'].update(hostFile=str(D.ROOT / 'media' / 'key')),
                 lambda p: p['runtime26Full']['credentialRequestKey'].update(hostFile=str(D.ROOT / 'spool' / 'key')),
                 lambda p: p['runtime26Full']['credentialRequestKey'].update(hostFile=str(D.ROOT / 'private' / 'bad,key'))]
        with synthetic_files():
            for index, edit in enumerate(edits):
                p = deployment(profile='complete-write-v6', credential=True)
                edit(p)
                with self.subTest(index=index), self.assertRaises(D.Refused):
                    D.runtime_binding(p)

    def test_current_helper_preserves_private_stat_identity_guards(self):
        cases = [{'mode': 0o644}, {'mode': 0o620}, {'size': 31}, {'uid': 10002},
                 {'links': 2}, {'symlink': True}, {'parent_mode': 0o722}]
        for case in cases:
            with self.subTest(case=case), synthetic_files(**case), self.assertRaises(D.Refused):
                D.runtime_binding(deployment(profile='complete-write-v6', credential=True))

    def test_v6_selection_and_credential_identity_remain_bound_without_secret_hash(self):
        with synthetic_files():
            p = deployment(credential=True)
            legacy = D.runtime_binding(p)
            p['runtime26Full']['catalogProfile'] = 'legacy-v1'
            self.assertEqual(D.runtime_binding(p), legacy)
            p['runtime26Full']['catalogProfile'] = 'complete-write-v6'
            current = D.runtime_binding(p)
            self.assertNotEqual(current, legacy)
            binding = D.credential_key_binding(p)
            self.assertEqual(set(binding), {'hostFile', 'containerFile', 'identity'})
            self.assertNotIn('sha256', binding['identity'])
            with patch.object(D, 'file_identity', return_value={**binding['identity'], 'inode': 10}):
                self.assertNotEqual(D.runtime_binding(p), current)

    def test_reviewed_helper_pin_matches_unchanged_source(self):
        self.assertEqual(B.DEPLOYMENT_CAPACITY_SHA256, hashlib.sha256(DEPLOY_SOURCE).hexdigest())


if __name__ == '__main__':
    unittest.main()
