"""Seven fixed direct REAL phases; original history and request identities retained."""
from pathlib import Path
import os
import subprocess
import time


FORMAT = 'T45_R3_DIRECT28_BATCHED_REAL_V1'
POLICY_NAME = 'direct28-batched-real.json'
READONLY_POLICY = '338d30dc3b3d39de130f0152899eeb92a1aa91c9c60d2073b06a2227bb4024cd'
JOBS = {'apply': 't45-r3-ordinary28-auth-apply-20261116-01', 'install': 't45-r3-batched-install-20261115-01', 'materialize': 't45-r3-batched-root03-source-delta-20261116-01', 'restore': 't45-r3-ordinary28-auth-restore-20261116-01', 'start': 't45-first-r3-native-service-start-20261116-28', 'stop': 't45-r3-ordinary28-preserve-stop-20261116-01', 'writer': 't45-r3-batched-real-execute-20261115-01'}
ORIGINAL_WRITER = 't45-first-20261110-r3-real-execute-20261114-06'
INSPECT = 't45-r3-original-transaction-inspect-20261114-01'
INSPECT_TERMINAL = '33af79a05da4659e18febe940629f264bc1b3ffcdeede110aa1aac10af29a5c0'
INSPECT_RESULTS = {
    'original02-readonly-inspect-result.json': (
        '433d6ec22852aecdf6c3f1626b7a43648439839e80c1bae015589f03de4b96c1',
        '67089d704b994d1e98d6532a1e6e78c982d40d1d90e8e39e0b76d8bda6cb35a4'),
    'original02-readonly-inspect-process-cleanup.json': (
        '5daf2a828935ff91d33333c81af8e576372fb1f295f46065c1bae349f574647e',
        'd9cd2791e151625880d96b7eba6b07e8d2b6d9aa157022062ae8dbf4864d9f45'),
    'original02-readonly-inspect-child-cleanup.json': (
        'f82e9cef4af19aec31212139f9b661c5038986de8d9953cef13916b71955980f',
        '2f0c4aeaecefda51a2ba739ab4a04741051270762c1c79ff6c74825ccc64f29d'),
}
PREVIOUS21_READER_RESULTS = {'original03-readonly-inspect-process-cleanup.json': ('e1ecdbc1997e6a8cf12f13e77dba9337dbf663b626ac9a02ab5d18dcea6c6bcf', '90235e14a5fee775d19c4cbb4d35cb55cdabe623200e5a588a8c37cde832a85d'), 'original03-readonly-inspect-result.json': ('61345639bd63317a936e19609271159d579b4e5b3c9037599e41d02181aba8b7', '72986ce091248a503dd311613f6c38598b1784e66877db812a3b71649ca53e02'), 'retained21-readback-child-cleanup.json': ('5d1ec298eefa4ae826922e82d288c29bb1a7ce1793b0fd307ca84156ea12b97d', 'c3af674e83add83c349f7ac23aac691e7d9e2cc578bee0a71eb891340627e2ba')}
PREVIOUS22_READER_RESULTS = {'original04-readonly-inspect-process-cleanup.json': ('fb6580eb9fc66d8eb6314534e3c90608c4898f8f30a6a1de91249d9c49e47d48', 'de54e6bd915e751f380c1619ef2c6f5766d09d0c62e4517efa628c660199522c'), 'original04-readonly-inspect-result.json': ('c8bc01f1710444f3caf7b1b65265feb5ded0130635150ab44b754e59ac9179a3', '1cfba32fd2971ab40dbe8bc35417a3eeb9d960a425a38bf8c90260faa0d66895'), 'retained22-readback-child-cleanup.json': ('3fd5410e5936c1e7c85fc6404f49e740812fb04fd5ec81a5dd1186dc71d0851b', '5397ba062d5ee85e7d00d13f8b01124da2961cb8c4196a229a9cb1f12651fda2')}
SERVICE_KEY = JOBS['start']
HOST = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
PROOF = HOST / 'authority/fresh35-current-production-service-v2-service-28.json'
PREVIOUS_SERVICE = {'containerId': '036e8221eaafb4fb473b5f9a5e7a61142d57e8dcd8ea76374916cbbe80f2ded8', 'containerStartedAt': '2026-11-14T04:17:02.413303865Z', 'postmasterStart': '2026-11-14 04:17:03.806731+00', 'proofSha256': 'ea7f29a555c0672d11457a1ae45788f7ce2495ecc25683a748a6e9b8dd9ded9b', 'serviceKey': 't45-first-r3-native-service-start-20261114-22'}


class Original02AbsentContinuation:
    def __init__(self, readonly, cfg, policy_sha256):
        self.readonly, self.old, self.core = readonly, readonly.old, readonly.core
        self.root, self.cfg, self.jobs = readonly.root, cfg, readonly.jobs
        self.need(readonly.policy_sha256 == READONLY_POLICY, 'EXACT_READONLY_POLICY_REQUIRED')
        c = self.core
        raw = c.read(self.root / POLICY_NAME)
        self.need(c.digest(policy_sha256) and c.sha(raw) == policy_sha256,
                  'POLICY_NOT_REGISTERED')
        self.policy_sha256 = policy_sha256
        p = self.policy = c.strict(raw)
        self.need(type(p) is dict and set(p) == {
            'format', 'grantId', 'startsAt', 'expiresAt', 'jobs'}
            and p['format'] == FORMAT and p['grantId'] == c.GRANT == cfg['grantId']
            and type(p['startsAt']) is type(p['expiresAt']) is int
            and 0 < p['startsAt'] < p['expiresAt'] <= p['startsAt'] + 14400000
            and p['expiresAt'] <= int(cfg['expiresAtEpoch'] * 1000)
            and type(p['jobs']) is dict and set(p['jobs']) == set(JOBS),
            'EXACT_POLICY_REQUIRED')
        for phase, rule in p['jobs'].items():
            self.need(type(rule) is dict and set(rule) == {
                'jobId', 'script', 'authorityLeaf', 'bundlePins',
                'timeoutSeconds', 'deadlineField'}
                and rule['jobId'] == JOBS[phase]
                and all(type(rule[k]) is str and c.MEMBER.fullmatch(rule[k])
                        for k in ('script', 'authorityLeaf'))
                and rule['script'].endswith(('.py', '.mjs', '.js'))
                and rule['authorityLeaf'].endswith('.json')
                and rule['deadlineField'] == 'expiresAt'
                and type(rule['timeoutSeconds']) is int
                and 1 <= rule['timeoutSeconds'] <= 7200
                and type(rule['bundlePins']) is dict
                and 1 <= len(rule['bundlePins']) <= 127
                and rule['script'] in rule['bundlePins']
                and rule['authorityLeaf'] not in rule['bundlePins']
                and all(type(leaf) is str and c.MEMBER.fullmatch(leaf) and c.digest(pin)
                        for leaf, pin in rule['bundlePins'].items()),
                'EXACT_JOB_RULE_REQUIRED')

    def need(self, ok, code):
        self.core.need(ok, 'R3_CONTINUITY_DIRECT28_' + code)

    def private(self, key):
        return Path(self.cfg['private']) / 'jobs' / key

    def original_basis(self):
        self.readonly.original_basis()
        self.previous24_closed()
        self.previous25_closed()
        self.previous26_closed()
        self.previous27_closed()
        self.previous20()
        self.previous21()
        self.previous21_outcome()
        self.previous22_closed()
        self.failed06_outcome()
        self.previous22_outcome()
        self.failed05_outcome()
        self.original05_absent()
        c = self.core
        self.need(c.sha(c.read(self.root / 'failed19-readonly-recovery.json')) == READONLY_POLICY,
                  'READONLY_POLICY_CHANGED')
        pin, terminal = self.old.preservation_terminal(INSPECT, {'COMPLETED'})
        self.need(pin == INSPECT_TERMINAL and terminal.get('exitCode') == 0,
                  'OBSERVED_ABSENT_TERMINAL_REQUIRED')
        objects = {}
        for leaf, (root_pin, public_pin) in INSPECT_RESULTS.items():
            raw = c.read(self.private(INSPECT) / 'results' / leaf)
            public = c.read(Path(self.cfg['control']) / 'jobs' / INSPECT / 'results' / leaf,
                            root=False)
            value = c.strict(raw)
            self.need(c.sha(raw) == root_pin and c.sha(public) == public_pin
                      and value == c.strict(public) and value.get('requestKey') == INSPECT,
                      'OBSERVED_ABSENT_RESULTS_CHANGED')
            objects[leaf] = value
        result = objects['original02-readonly-inspect-result.json']
        child = objects['original02-readonly-inspect-child-cleanup.json']
        self.need(result.get('state') == 'ABSENT'
                  and result.get('originalCombinationMatched') is True
                  and result.get('originalRecoveryRuns') == 1
                  and result.get('connectionCleanup') == 'CLOSED'
                  and result.get('rollbackAcknowledged') is True
                  and all(child.get(k) is True for k in (
                      'childReaped', 'descendantsReaped',
                      'originalInputMetadataRestored', 'scratchEmpty')),
                  'OBSERVED_ABSENT_AND_CLEANUP_REQUIRED')

    def previous20(self):
        c = self.core
        values = {}
        for phase, key, terminal_pin, result_pin, cleanup_pin in (
            ('stop', 't45-r3-ordinary20-preserve-stop-20261114-01',
             'd0fe364e5686e6704aab0873277ee8e3557cb3fd3958ecca82d5e5da61b5ab19',
             'bd89b6685cf4195fc3b0a50603f79290490750cf001a5d8b773e77add58c53d3',
             '2c7137d143f65a82a1e38413f057c302ea8e9e7f2ee9d376a0fc9d8cf1c35af8'),
            ('restore', 't45-r3-ordinary20-auth-restore-20261114-01',
             '0ddac14cf8a9f4aa84857eb4a49aa5ac4febf2a4318bdfc14fc175565ab14b79',
             'db6941b64ea9758be4022d33593303a1ae41ae90bccefa532b21df8e0241eb4a',
             '984c70a1714cfe52465616e869a9593ae1528a87551e73d40adfd380366a9b6c')):
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0,
                      'PREVIOUS20_TERMINAL_CHANGED')
            leaf = 'normal05-preserve-stop-result.json' if phase == 'stop' else 'maintenance-auth-result.json'
            raw = c.read(self.private(key) / 'results' / leaf)
            value = c.strict(raw)
            self.need(c.sha(raw) == result_pin and value.get('requestKey') == key,
                      'PREVIOUS20_RESULT_CHANGED')
            if phase == 'restore':
                self.need(c.sha(c.read(self.private(key) / 'results/maintenance-auth-cleanup.json')) == cleanup_pin,
                          'PREVIOUS20_RESTORE_CLEANUP_CHANGED')
                self.need(value['result']['status'] == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
                          and value['cleanup']['ownContainerStopped'] is True
                          and value['cleanup']['ownedPidAbsent'] is True,
                          'PREVIOUS20_ORIGINAL_AUTH_RESTORATION_REQUIRED')
            else:
                raw_cleanup = c.read(HOST / 'state/native-services/t45-first-r3-native-service-start-20261114-20/cleanup.json')
                self.need(c.sha(raw_cleanup) == cleanup_pin and value.get('cleanupSha256') == cleanup_pin
                          and value.get('pgStopped') is True and value.get('holdRetained') is True,
                          'PREVIOUS20_CLEAN_STOP_REQUIRED')
                values['service'] = value['service']
        service = values['service']
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
            '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            service['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {
            'id': service['containerId'], 'startedAt': service['containerStartedAt'],
            'running': False, 'pid': 0, 'operation': service['serviceKey']},
            'PREVIOUS20_CONTAINER_NOT_STOPPED')


    def previous21_outcome(self):
        c = self.core
        writer = 't45-first-20261110-r3-real-execute-20261114-03'
        pin, terminal = self.old.preservation_terminal(writer, {'FAILED'})
        self.need(pin == '03e4eabb9cbf2ef9a9f6558219625a13c2412c45f31fafc65dfab0d7c8d0c3cf'
                  and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True,
                  'EXACT_FAILED03_TERMINAL_REQUIRED')
        reader = 't45-first-20261110-r3-real-readback-20261114-21'
        pin, terminal = self.old.preservation_terminal(reader, {'COMPLETED'})
        self.need(pin == '3e53c1c63dc3a863fe1d62f75c7f6a6122f944773b871f59075b5564a0a2a79e' and terminal.get('exitCode') == 0,
                  'EXACT_ORIGINAL03_INSPECT_TERMINAL_REQUIRED')
        for leaf, (root_pin, public_pin) in PREVIOUS21_READER_RESULTS.items():
            root_raw = c.read(self.private(reader) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / reader / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == reader,
                      'EXACT_ORIGINAL03_INSPECT_RECEIPT_REQUIRED')
            if leaf == 'original03-readonly-inspect-result.json':
                self.need(value.get('state') == 'ABSENT' and value.get('originalCombinationMatched') is True
                          and value.get('originalRecoveryRuns') == 1
                          and value.get('rollbackAcknowledged') is True
                          and value.get('connectionCleanup') == 'CLOSED',
                          'EXACT_ORIGINAL03_NATIVE_ABSENT_REQUIRED')
            if leaf == 'retained21-readback-child-cleanup.json':
                self.need(value.get('connectionCleanup') == 'CLOSED'
                          and all(value.get(key) is True for key in (
                              'childReaped', 'descendantsReaped', 'originalInputMetadataRestored', 'scratchEmpty')),
                          'EXACT_ORIGINAL03_INSPECT_CLEANUP_REQUIRED')

    def previous22_outcome(self):
        c = self.core
        writer = 't45-first-20261110-r3-real-execute-20261114-04'
        pin, terminal = self.old.preservation_terminal(writer, {'FAILED'})
        self.need(pin == 'e5612d1a32287ee5923f4906634e68ee9ddda69e33b8aefa33e073b57825d083'
                  and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True,
                  'EXACT_FAILED04_TERMINAL_REQUIRED')
        reader = 't45-first-20261110-r3-real-readback-20261114-22'
        pin, terminal = self.old.preservation_terminal(reader, {'COMPLETED'})
        self.need(pin == 'b6de0dd2a2078768ffba3b0d75ee7964946ba50cab6bf8a8b21b77228d4d9068' and terminal.get('exitCode') == 0,
                  'EXACT_ORIGINAL04_INSPECT_TERMINAL_REQUIRED')
        for leaf, (root_pin, public_pin) in PREVIOUS22_READER_RESULTS.items():
            root_raw = c.read(self.private(reader) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / reader / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == reader,
                      'EXACT_ORIGINAL04_INSPECT_RECEIPT_REQUIRED')
            if leaf == 'original04-readonly-inspect-result.json':
                self.need(value.get('state') == 'ABSENT' and value.get('originalCombinationMatched') is True
                          and value.get('originalRecoveryRuns') == 1
                          and value.get('initializerSerializedBytes') == 51225175
                          and value.get('rollbackAcknowledged') is True
                          and value.get('connectionCleanup') == 'CLOSED',
                          'EXACT_ORIGINAL04_NATIVE_ABSENT_REQUIRED')
            if leaf == 'retained22-readback-child-cleanup.json':
                self.need(value.get('connectionCleanup') == 'CLOSED'
                          and all(value.get(key) is True for key in (
                              'childReaped', 'descendantsReaped', 'originalInputMetadataRestored', 'scratchEmpty')),
                          'EXACT_ORIGINAL04_INSPECT_CLEANUP_REQUIRED')

    def failed05_outcome(self):
        c, key = self.core, 't45-first-20261110-r3-real-execute-20261114-05'
        terminal_pin, terminal = self.old.preservation_terminal(key, {'FAILED'})
        self.need(terminal_pin == '9309599188c16c457c04d5ee421abc8fb5677129d698067f7f37f9624775533e'
                  and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True,
                  'EXACT_FAILED05_OUTER_AND_CLEANUP_REQUIRED')
        expected = {'retained22-writer-result.json': ('5b6b16dcfdf90dd9fd8842276423c7fafa929567d44e4d10af58910e773f8194', 'e7a25589ba69e0995bcd5f80ea655c6abd0eec72a5ee0e27d848e11d86a92768'), 'retained22-writer-child-cleanup.json': ('1f81a8a0e108868822ad9a5454d02a1a2acdc446d602b83b8c0031a46e3292c6', '8b999f768573616d6c07fc3dc3176b0bd2195510749fc37caa850a5fa307aaa2')}
        for leaf, (root_pin, public_pin) in expected.items():
            root_raw = c.read(self.private(key) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == key,
                      'EXACT_FAILED05_RESULT_AND_CLEANUP_REQUIRED')
            if leaf == 'retained22-writer-child-cleanup.json':
                self.need(all(value.get(k) is True for k in ('childReaped', 'descendantsReaped',
                          'originalInputMetadataRestored', 'scratchEmpty')),
                          'EXACT_FAILED05_PROCESS_SETTLEMENT_REQUIRED')
            if leaf == 'retained22-writer-result.json':
                self.need(value.get('state') == 'UNKNOWN' and value.get('safeCode') ==
                          'FRESH35_HOST_RETAINED_ORIGINAL_PUBLISH_REQUIRED',
                          'EXACT_FAILED05_UNKNOWN_NATIVE_REQUIRED')

    def failed06_outcome(self):
        c, key = self.core, ORIGINAL_WRITER
        terminal_pin, terminal = self.old.preservation_terminal(key, {'FAILED'})
        self.need(terminal_pin == '3b185cc24fdbb986ffb4b68c6e3bde4b6e293523d698ee86dbdf5f2ebf63daa2'
                  and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True
                  and self.child_settled(ORIGINAL_WRITER, 'writer'), 'EXACT_FAILED06_OUTER_AND_CLEANUP_REQUIRED')
        expected = {'retained22-writer-result.json': ('794cf28dee5c43be9fcf7abcd6d6f744282828cebf9ca18024765beca1d7c0e8', '17e36e38b208e8642c1279f7136acc1419f809d2a60806ea15cf145a407d0e3f'), 'retained22-writer-child-cleanup.json': ('03f71ddce86d36f835ba6f625137fd9367eb6c621dcda2fd830cc90bf7b40876', 'de2c6b449a0934f8c012a6ea5769b240cfa7edb1be4a84a6c37babb6a1743dea')}
        for leaf, (root_pin, public_pin) in expected.items():
            root_raw = c.read(self.private(key) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == key,
                      'EXACT_FAILED06_RESULT_AND_CLEANUP_REQUIRED')
            if leaf == 'retained22-writer-result.json':
                self.need(value.get('state') == 'UNKNOWN' and value.get('safeCode') ==
                          'RETAINED20_CHILD_RESULT_UNCONFIRMED',
                          'EXACT_FAILED06_UNKNOWN_NATIVE_REQUIRED')

    def original05_absent(self):
        c, key = self.core, 't45-first-20261110-r3-real-readback-20261114-22-03'
        terminal_pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
        self.need(terminal_pin == 'e46d4d059a6551e878dfafdd8b17244843fa35fb4350e6dfd2416e0425da3443' and terminal.get('exitCode') == 0,
                  'EXACT_ORIGINAL05_READONLY_TERMINAL_REQUIRED')
        expected = {'original05-readonly-inspect-process-cleanup.json': ('6c0a0b249df143c2bdc110c6acb458d2e256923838c40ec2444f2c503003761f', '0fe98ff1753fa357164163d578b07e34de16a3b33927a3a37400e8b4b4f0f46e'), 'original05-readonly-inspect-result.json': ('4bc365494c2512e11a038818497f15cc8e697884e92f02bcdfc9fbd5fc3053ee', '82493e91c218b0ff5ee4d22622e0597e85f95f2e5bfeda51c05c853a3816ad33'), 'retained22-readback-child-cleanup.json': ('c4856e8e6cd52930148eef148b7919a6e580c585d50f24582b71710acc74b633', '7e77e9291654235f94aebf294ebf2bd8532db39c239c0fecf0c5781f4591ed4d')}
        for leaf, (root_pin, public_pin) in expected.items():
            root_raw = c.read(self.private(key) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == key,
                      'EXACT_ORIGINAL05_READONLY_RESULTS_REQUIRED')
            if leaf == 'original05-readonly-inspect-result.json':
                self.need(value.get('originalWriterKey') == 't45-first-20261110-r3-real-execute-20261114-05'
                          and value.get('state') == 'ABSENT' and value.get('readOnlyTransactionConfirmed') is True
                          and value.get('originalCombinationMatched') is True
                          and value.get('originalRecoveryRuns') == 0
                          and value.get('initializerRetainedWriterSha256') == '47a82a4e02c608e499268995d086b77a1163896c77dad9a6ea317f08b35f53f4'
                          and value.get('initializerSerializedBytes') == 51225175
                          and value.get('rollbackAcknowledged') is True and value.get('connectionCleanup') == 'CLOSED'
                          and value.get('businessWrites') == 0,
                          'EXACT_ORIGINAL05_NATIVE_ABSENT_REQUIRED')
            if leaf == 'retained22-readback-child-cleanup.json':
                self.need(value.get('childEntered') is True and value.get('connectionCleanup') == 'CLOSED'
                          and all(value.get(k) is True for k in ('childReaped', 'descendantsReaped',
                                  'originalInputMetadataRestored', 'scratchEmpty')),
                          'EXACT_ORIGINAL05_READONLY_CLEANUP_REQUIRED')

    def previous21(self):
        c = self.core
        values = {}
        for phase, key, terminal_pin, result_pin, cleanup_pin in (
            ('stop', 't45-r3-ordinary21-preserve-stop-20261114-01',
             'b70020b04b0dbe67de8f3871b1950d8ecc20130363ec074b2291d35c9f69ee2a',
             '9ffdfb46e0bb028e0f4862c5b8006f51de4a17125a4135d5c5cf56366a07476f',
             '2cbc2471f7acfc46fbf387ca19127e362579632b6328183e969ddbaf9bfa0066'),
            ('restore', 't45-r3-ordinary21-auth-restore-20261114-01',
             '34ea2e745715b7757ba0aefd0706524419af90f46d1de736808b7d169569bc25',
             '293da43c2535f31eeaa091a10fbaa2f7c7da4c86aa16b1330b247a5f2226356b',
             'f373d8e7fe600adfab16568adf37935ebde4dd98fada888f7135eaf89d5d9942')):
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0,
                      'PREVIOUS21_TERMINAL_CHANGED')
            leaf = 'normal05-preserve-stop-result.json' if phase == 'stop' else 'maintenance-auth-result.json'
            raw = c.read(self.private(key) / 'results' / leaf)
            value = c.strict(raw)
            self.need(c.sha(raw) == result_pin and value.get('requestKey') == key,
                      'PREVIOUS21_RESULT_CHANGED')
            if phase == 'restore':
                self.need(c.sha(c.read(self.private(key) / 'results/maintenance-auth-cleanup.json')) == cleanup_pin,
                          'PREVIOUS21_RESTORE_CLEANUP_CHANGED')
                self.need(value['result']['status'] == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
                          and value['cleanup']['ownContainerStopped'] is True
                          and value['cleanup']['ownedPidAbsent'] is True,
                          'PREVIOUS21_ORIGINAL_AUTH_RESTORATION_REQUIRED')
            else:
                raw_cleanup = c.read(HOST / 'state/native-services/t45-first-r3-native-service-start-20261114-21/cleanup.json')
                self.need(c.sha(raw_cleanup) == cleanup_pin and value.get('cleanupSha256') == cleanup_pin
                          and value.get('pgStopped') is True and value.get('holdRetained') is True,
                          'PREVIOUS21_CLEAN_STOP_REQUIRED')
                values['service'] = value['service']
        service = values['service']
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
            '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            service['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {
            'id': service['containerId'], 'startedAt': service['containerStartedAt'],
            'running': False, 'pid': 0, 'operation': service['serviceKey']},
            'PREVIOUS21_CONTAINER_NOT_STOPPED')


    def previous22_closed(self):
        c = self.core
        records = (
            ('t45-r3-ordinary22-preserve-stop-20261114-01', '78d2922382cedce0d840003e8b6967b24d64c638c9fb3dbc4c5f494b5fb6101c',
             'normal05-preserve-stop-result.json', '9060a62e627a97d7f19312768d4405dcad7d357883488ee600dc3ccb412ab772', 'a70d218148c8cbd791619633a4d58f4c452e6b4ae1a315d5a470435cb4dbb80e'),
            ('t45-r3-ordinary22-auth-restore-20261114-01', '9e668ec5999ca8e6e4fd8558a0de1cb5b8f4cb56487b0237a2a61c825bf705ce',
             'maintenance-auth-result.json', '60142ddc2b3e51436f2096a8558b1018909f99446f7b260ec3a8b93bb410115f', '2b35fcb2dadbf1858aec46c58dad65b5dd891434e0475e68d030ebba18d4e609'),
        )
        values = []
        for key, terminal_pin, leaf, root_pin, public_pin in records:
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0
                      and terminal.get('phaseStarted') is True, 'PREVIOUS22_TERMINAL_DIFFERS')
            root = c.read(self.private(key) / 'results' / leaf)
            public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf,
                            root=False)
            value = c.strict(root)
            self.need(c.sha(root) == root_pin and c.sha(public) == public_pin
                      and c.strict(public) == value and value.get('requestKey') == key,
                      'PREVIOUS22_RESULT_DIFFERS')
            values.append(value)
        stop, restore = values
        cleanup_pin = '5dfcffc05a1b77b9aace7f481266ff01de014b34c511e96459a922a3c9078d5d'
        raw = c.read(HOST / 'state/native-services' / PREVIOUS_SERVICE['serviceKey'] / 'cleanup.json')
        cleanup = c.strict(raw)
        self.need(c.sha(raw) == cleanup_pin and stop.get('cleanupSha256') == cleanup_pin
                  and stop.get('service') == PREVIOUS_SERVICE and stop.get('holdRetained') is True
                  and stop.get('pgStopped') is True and stop.get('businessAdvanced') is False
                  and all(cleanup['cleanup'].get(k) is True for k in
                          ('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),
                  'PREVIOUS22_CLEAN_STOP_REQUIRED')
        raw = c.read(self.private(records[1][0]) / 'results/maintenance-auth-cleanup.json')
        self.need(c.sha(raw) == '79441e3c87dcf726e2ec87aa8591626e2b19fded8262240eea96562f2b7ffea8'
                  and restore['result'].get('status') ==
                      'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
                  and restore['result'].get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True
                  and restore['result'].get('runtimeAuthChanged') is False
                  and restore['cleanup'].get('ownContainerStopped') is True
                  and restore['cleanup'].get('ownedPidAbsent') is True,
                  'PREVIOUS22_ORIGINAL_AUTH_RESTORATION_REQUIRED')
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
            '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            PREVIOUS_SERVICE['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {
            'id': PREVIOUS_SERVICE['containerId'], 'startedAt': PREVIOUS_SERVICE['containerStartedAt'],
            'running': False, 'pid': 0, 'operation': PREVIOUS_SERVICE['serviceKey']},
            'PREVIOUS22_CONTAINER_NOT_STOPPED')

    def previous24_closed(self):
        c = self.core
        rows = (
            ('t45-r3-ordinary24-preserve-stop-20261115-01', '0a9ea80f2c52494c584e2dc7999766e725e604c9ec7d12c92af7424d1eb83a39', 'normal05-preserve-stop-result.json', '24c937badca67b63d07d13a7e976dc6433c0468dc7de50cf100f20a6e5f096a0', '69a6c160c867b4049555a91313a6e4b42cdc10f2584aaa0d221fed3b4ede7a88'),
            ('t45-r3-ordinary24-auth-restore-20261115-01', '977a2d3ff1bb03e9bb8304a541dbc8b3e250df2c26aa0efe17b917c504947825', 'maintenance-auth-result.json', 'b275e1369531bb303ed0587a59a37af9215553afbedc782101ce2325ee8186ac', '47c6e57b0b1cbcfa95e019e37b082d96989aa77c09aec76a64e983601b8a9dff'))
        values = []
        for key, terminal_pin, leaf, root_pin, public_pin in rows:
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0, 'PREVIOUS24_EXACT_TERMINAL_REQUIRED')
            raw = c.read(self.private(key) / 'results' / leaf)
            public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            result = c.strict(raw)
            self.need(c.sha(raw) == root_pin and c.sha(public) == public_pin and result == c.strict(public) and result.get('requestKey') == key, 'PREVIOUS24_EXACT_RESULT_REQUIRED')
            values.append(result)
        stop, restore = values
        self.need(stop.get('pgStopped') is True and stop.get('holdRetained') is True and stop.get('businessAdvanced') is False and stop.get('originalKeyReplayed') is False, 'PREVIOUS24_STOP_REQUIRED')
        inside = restore.get('result', {})
        self.need(inside.get('status') == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True and inside.get('naturalExpiryCountedAsRestoration') is False and inside.get('runtimeAuthChanged') is False and inside.get('membershipsOrRoleAttributesChanged') is False and restore.get('cleanup', {}).get('ownContainerStopped') is True and restore.get('cleanup', {}).get('ownedPidAbsent') is True, 'PREVIOUS24_ORIGINAL_AUTH_RESTORATION_REQUIRED')
        service = stop['service']
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format', '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}', service['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {'id': service['containerId'], 'startedAt': service['containerStartedAt'], 'running': False, 'pid': 0, 'operation': service['serviceKey']}, 'PREVIOUS24_CONTAINER_NOT_STOPPED')

    def previous25_closed(self):
        c = self.core
        start = 't45-first-r3-native-service-start-20261116-25'
        terminal_pin, terminal = self.old.preservation_terminal(start, {'FAILED'})
        self.need(terminal_pin == '79c3657f7f0051c1646215ee7e5149ecfb6e6fa31606750167bc2e8f3b3f5738' and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True, 'EXACT_FAILED25_TERMINAL_REQUIRED')
        raw = c.read(self.private(start) / 'results/normal-service-result.json')
        public = c.read(Path(self.cfg['control']) / 'jobs' / start / 'results/normal-service-result.json', root=False)
        self.need(c.sha(raw) == 'c2a5ee898726e66ebb53e309cb39d803069fa1336f19fd5c50b016187f5e90be' and c.sha(public) == '10afe3a1ffe08b295773a9277fd3949b4752159a682c05e63f92f466ca66a896' and c.strict(raw) == c.strict(public), 'EXACT_FAILED25_RESULT_REQUIRED')
        restore = 't45-r3-ordinary25-auth-restore-20261116-01'
        pin, value = self.old.preservation_terminal(restore, {'COMPLETED'})
        self.need(pin == '1b82a691e39b0a72495542757664773a9a204f84bc3331da243ab7f6fb2be238' and value.get('exitCode') == 0, 'EXACT_RESTORED25_TERMINAL_REQUIRED')
        raw = c.read(self.private(restore) / 'results/maintenance-auth-result.json')
        public = c.read(Path(self.cfg['control']) / 'jobs' / restore / 'results/maintenance-auth-result.json', root=False)
        value = c.strict(raw)
        self.need(c.sha(raw) == 'ecf79874833ade08d7f63aceb1d6a80b587f1644ce727c22d9bc591cd54ea74d' and c.sha(public) == '86b34120506dbced1f182c2e3c429a8be7c209f8ffa347a0ce955b4efc26523f' and value == c.strict(public) and value.get('requestKey') == restore, 'EXACT_RESTORED25_RESULT_REQUIRED')
        inside = value['result']
        self.need(inside.get('status') == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True and inside.get('naturalExpiryCountedAsRestoration') is False and inside.get('runtimeAuthChanged') is False and inside.get('membershipsOrRoleAttributesChanged') is False and value['cleanup'].get('ownContainerStopped') is True and value['cleanup'].get('ownedPidAbsent') is True, 'EXACT_ORIGINAL_AUTH25_RESTORATION_REQUIRED')
        boot = HOST / 'state/native-services' / start
        expected = {'normal_service05_after08.py':'3ea7979bd8e7a6ad69247331dad49b9c348c281df70733f0f64bd03b169df1dc','normal_service05_after08_proof.py':'f2cd59a11222656b8697367abd20e790dbbc1ddd4edbadf838fe6584ceec446b','fresh35-production-carrier.py':'40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360'}
        self.need(set(p.name for p in boot.iterdir()) == set(expected) and all(c.sha(c.read(boot/name, maximum=262144)) == pin for name,pin in expected.items()) and not os.path.lexists(HOST/'authority/fresh35-current-production-service-v2-service-25.json'), 'FAILED25_PARTIAL_BOOT_OR_NO_C_CHANGED')
        q = subprocess.run(['/usr/bin/docker','ps','-aq','--filter','label=t45.operation='+start],capture_output=True,timeout=5)
        self.need(q.returncode == 0 and not q.stdout.strip() and not q.stderr, 'FAILED25_CONTAINER_PRESENT_OR_UNKNOWN')

    def previous26_closed(self):
        c = self.core
        start = 't45-first-r3-native-service-start-20261116-26'
        pin, terminal = self.old.preservation_terminal(start, {'FAILED'})
        self.need(pin == '853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39' and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True, 'EXACT_FAILED26_TERMINAL_REQUIRED')
        raw = c.read(self.private(start)/'results/normal-service-result.json')
        public = c.read(Path(self.cfg['control'])/'jobs'/start/'results/normal-service-result.json',root=False)
        self.need(c.sha(raw) == '5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca' and c.sha(public) == 'ff2e88f0b8cb3ad04ce5c4c06e07818d8b7c0456b8507b43bf81f529c34155d1' and c.strict(raw) == c.strict(public), 'EXACT_FAILED26_RESULT_REQUIRED')
        restore = 't45-r3-ordinary26-auth-restore-20261116-01'
        pin, terminal = self.old.preservation_terminal(restore, {'COMPLETED'})
        self.need(pin == '944dfa9b110fd836ee9e99a8944446111b1e68808d92280a5d220e91cd67fc63' and terminal.get('exitCode') == 0, 'EXACT_RESTORED26_TERMINAL_REQUIRED')
        raw = c.read(self.private(restore)/'results/maintenance-auth-result.json')
        public = c.read(Path(self.cfg['control'])/'jobs'/restore/'results/maintenance-auth-result.json',root=False)
        value = c.strict(raw)
        self.need(c.sha(raw) == 'd521106c1c1a5a20601f7ad125dd2c254ff1879a78d25c5a299c0464ed527bd8' and c.sha(public) == '57aff18487f294415830404abaf18f8a970b04b779d22e2d226018539c5879cb' and value == c.strict(public) and value.get('requestKey') == restore, 'EXACT_RESTORED26_RESULT_REQUIRED')
        inside = value['result']
        self.need(inside.get('status') == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True and inside.get('naturalExpiryCountedAsRestoration') is False and inside.get('runtimeAuthChanged') is False and inside.get('membershipsOrRoleAttributesChanged') is False and value['cleanup'].get('ownContainerStopped') is True and value['cleanup'].get('ownedPidAbsent') is True, 'EXACT_ORIGINAL_AUTH26_RESTORATION_REQUIRED')
        self.need(not os.path.lexists(HOST/'authority/fresh35-current-production-service-v2-service-26.json'), 'FAILED26_C_UNEXPECTED')
        q = subprocess.run(['/usr/bin/docker','ps','-aq','--filter','label=t45.operation='+start],capture_output=True,timeout=5)
        self.need(q.returncode == 0 and not q.stdout.strip() and not q.stderr, 'FAILED26_CONTAINER_PRESENT_OR_UNKNOWN')

    def previous27_closed(self):
        c = self.core
        records = (
            ('start', 't45-first-r3-native-service-start-20261116-27',
             'ba1caa324ceba9a191479d45bd6e1b497e78b5adc7946d21589c296a2e300cd4',
             'normal-service-result.json',
             '808c633e8d7f11bac5e09efa21cbb3b40f39272a103b89af191624915b869609',
             '4446a6673b6684ecf26c9d5da4982cd27d75fd68dca578c65072330921b6b5d7'),
            ('stop', 't45-r3-ordinary27-preserve-stop-20261116-01',
             '2dc418392380fe9313facee2b85cf06d79ad2b1e8fcac1faedd6c0263d1fd04f',
             'normal05-preserve-stop-result.json',
             'a5aa0eecb1cfa711b922a1cbbd227a25b7316c93bcfc83dc4ab4c60f5a56d24a',
             '62ca4c34ae9313a1d5c9de745878ef9f8567e2d6f98af11d283c16e64d0c9502'),
            ('restore', 't45-r3-ordinary27-auth-restore-20261116-01',
             '957f0f26d7ed9272ea675c855a7726e9627af7946774b9b8827fb720d47aafe0',
             'maintenance-auth-result.json',
             '90e8fc47b7df781cb325dc9e653510c2080da0e336748146e25d8751a4cc9fc7',
             '9e2a41c47eeb23745dae3558266f3b01b9776594f95a766e8a4f742ee30a2be2'),
        )
        values = {}
        for phase, key, terminal_pin, leaf, root_pin, public_pin in records:
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0
                      and terminal.get('phaseStarted') is True, 'PREVIOUS27_TERMINAL_CHANGED')
            raw = c.read(self.private(key) / 'results' / leaf)
            public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            value = c.strict(raw)
            self.need(c.sha(raw) == root_pin and c.sha(public) == public_pin
                      and value == c.strict(public) and value.get('requestKey') == key,
                      'PREVIOUS27_RESULT_CHANGED')
            values[phase] = value
        service = {
            'containerId': '6c8f40034cd8f1940648d7bc9d9614fa660cfac1fa3844aae6847516902f8448',
            'containerStartedAt': '2026-11-15T18:38:28.428863507Z',
            'postmasterStart': '2026-11-15 18:38:29.737044+00',
            'proofSha256': '2640ef4df8bc3e2c64f31d327a41a1c4fddc9adf99584b68169ab854fe6c6dbb',
            'serviceKey': 't45-first-r3-native-service-start-20261116-27',
        }
        started, stopped, restored = (values[p] for p in ('start', 'stop', 'restore'))
        self.need(started.get('status') == 'NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE'
                  and started.get('proofSha256') == service['proofSha256']
                  and started.get('cid') == service['containerId']
                  and started.get('readOnlyReadiness') is True,
                  'PREVIOUS27_ACTUAL_START_REQUIRED')
        cleanup_pin = 'fda7c05908d7b94223901638b83a417d2d7f1c624d6d195abae6ede6fc0702e8'
        raw = c.read(HOST / 'state/native-services' / service['serviceKey'] / 'cleanup.json')
        cleanup = c.strict(raw)
        self.need(c.sha(raw) == cleanup_pin and stopped.get('cleanupSha256') == cleanup_pin
                  and stopped.get('service') == service and stopped.get('pgStopped') is True
                  and stopped.get('holdRetained') is True and stopped.get('businessAdvanced') is False
                  and stopped.get('originalKeyReplayed') is False
                  and all(cleanup['cleanup'].get(k) is True for k in
                          ('cleanupComplete', 'cleanShutdown', 'dataPreserved', 'ownedPidAbsent', 'portAbsent')),
                  'PREVIOUS27_CLEAN_STOP_REQUIRED')
        raw = c.read(self.private(records[2][1]) / 'results/maintenance-auth-cleanup.json')
        inside = restored['result']
        self.need(c.sha(raw) == 'b8286a2e7449b7b9e165975fd5492fc6084eea1d1b9322e1b5f57e40c4c57339'
                  and inside.get('status') == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
                  and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True
                  and inside.get('naturalExpiryCountedAsRestoration') is False
                  and inside.get('runtimeAuthChanged') is False
                  and inside.get('membershipsOrRoleAttributesChanged') is False
                  and restored['cleanup'].get('ownContainerStopped') is True
                  and restored['cleanup'].get('ownedPidAbsent') is True,
                  'PREVIOUS27_ORIGINAL_AUTH_RESTORATION_REQUIRED')
        raw = c.read(HOST / 'authority/fresh35-current-production-service-v2-service-27.json')
        self.need(c.sha(raw) == service['proofSha256'], 'PREVIOUS27_PROTECTED_PROOF_CHANGED')
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
            '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            service['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {
            'id': service['containerId'], 'startedAt': service['containerStartedAt'],
            'running': False, 'pid': 0, 'operation': service['serviceKey']},
            'PREVIOUS27_CONTAINER_NOT_STOPPED')

    def current_service(self, service):
        c = self.core
        self.need(type(service) is dict and set(service) == {
            'serviceKey', 'proofSha256', 'containerId', 'containerStartedAt', 'postmasterStart'}
            and service['serviceKey'] == SERVICE_KEY
            and all(c.digest(service[k]) for k in ('proofSha256', 'containerId')),
            'EXACT_SERVICE_FIELDS_REQUIRED')
        self.successful('start')
        raw = c.read(PROOF)
        p = c.strict(raw)
        shared, physical = p['sharedPostgresNamespace'], p['physical']
        birth = shared['container']
        self.need(c.sha(raw) == service['proofSha256']
                  and p['requestKey'] == shared['creationOperationId'] == service['serviceKey']
                  and birth['id'] == service['containerId']
                  and birth['startedAt'] == service['containerStartedAt']
                  and physical['postmasterStart'] == service['postmasterStart']
                  and physical['systemIdentifier'] == '7706545564479176741'
                  and physical['databaseOid'] == '16393'
                  and physical['serverVersionNum'] == '170011'
                  and shared['serviceLeaseExpiresAt'] <= self.policy['expiresAt']
                  and time.time_ns() // 1000000 < shared['serviceLeaseExpiresAt'],
                  'EXACT_LIVE28_PROOF_REQUIRED')
        boot = HOST / 'state/native-services' / service['serviceKey']
        self.need(c.strict(c.read(boot / 'carrier-birth.json')) == birth
                  and c.strict(c.read(boot / 'retained-ack.json')) == {
                      'requestKey': service['serviceKey'],
                      'proofSha256': service['proofSha256'],
                      'serviceLeaseExpiresAt': shared['serviceLeaseExpiresAt']},
                  'EXACT_LIVE28_RETAINED_ACK_REQUIRED')
        try:
            raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
                '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
                '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
                '"operation":{{json (index .Config.Labels "t45.operation")}}}',
                service['containerId']], capture_output=True, timeout=5, check=True).stdout
        except (OSError, subprocess.SubprocessError):
            self.need(False, 'LIVE28_CONTAINER_EVIDENCE_UNAVAILABLE')
        v = c.strict(raw)
        self.need(0 < len(raw) <= 4096 and set(v) == {
            'id', 'startedAt', 'running', 'pid', 'operation'}
            and v['id'] == service['containerId'] and v['startedAt'] == service['containerStartedAt']
            and v['running'] is True and type(v['pid']) is int and v['pid'] > 0
            and v['operation'] == service['serviceKey'], 'LIVE28_CONTAINER_DIFFERS')
        return p

    def settled(self, phase):
        return self.child_settled(JOBS[phase], phase)

    def child_settled(self, key, phase):
        c = self.core
        if not os.path.lexists(self.private(key) / 'request.json'):
            return False
        # The dispatcher records a protected terminal even for a refusal before
        # launching these two jobs. Such a refusal never touches input access.
        _, terminal = self.old.preservation_terminal(key, {
            'COMPLETED', 'FAILED', 'REFUSED_D0_INTERLOCK_BEFORE_PHASE',
            'REFUSED_R3_CONTINUITY_BEFORE_PHASE', 'INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY'})
        self.need(type(terminal.get('exitCode')) is int or (
            terminal['status'] == 'INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY'
            and terminal.get('exitCode') is None), 'ORIGINAL_OUTER_TERMINAL_REQUIRED')
        if terminal.get('phaseStarted') is False:
            self.need(terminal['status'].startswith('REFUSED_') and terminal['exitCode'] == 2,
                      'EXACT_PRE_CHILD_REFUSAL_REQUIRED')
            return True
        self.need(terminal.get('phaseStarted') is True, 'CHILD_START_OUTCOME_REQUIRED')
        leaf = ('retained22-' if key == ORIGINAL_WRITER else 'retained23-') + phase + '-child-cleanup.json'
        raw = c.read(self.private(key) / 'results' / leaf)
        public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
        cleanup = c.strict(raw)
        self.need(cleanup == c.strict(public) and cleanup.get('requestKey') == key
                  and cleanup.get('connectionCleanup') in (
                      'CLOSED', 'NOT_OPENED', 'REAPED_EXCLUSIVE_PROCESS')
                  and all(cleanup.get(k) is True for k in (
                      'childReaped', 'descendantsReaped',
                      'originalInputMetadataRestored', 'scratchEmpty')),
                  'ORIGINAL_CHILD_CONNECTION_AND_INPUT_CLEANUP_REQUIRED')
        # REAPED_EXCLUSIVE_PROCESS describes only the exact process cleanup.
        # Original-key verification and preservation may follow; it proves
        # neither the server transaction outcome nor an acknowledged DB close.
        return True

    def frozen(self, phase, job, private):
        c, p = self.core, self.policy
        rule = p['jobs'][phase]
        now = time.time_ns() // 1000000
        self.need(p['startsAt'] <= now < p['expiresAt'], 'FINITE_POLICY_EXPIRED')
        self.need(private == self.private(JOBS[phase])
                  and job.get('script') == rule['script'] and job.get('taskId') == 'T45'
                  and job.get('grantId') == c.GRANT and job.get('scope') == self.cfg['scope']
                  and type(job.get('timeoutSeconds')) is int
                  and job['timeoutSeconds'] == rule['timeoutSeconds']
                  and c.pack(c.strict(c.read(private / 'request.json'))) == c.pack(job)
                  and not os.path.lexists(private / 'r3-outer-terminal.json'),
                  'EXACT_FROZEN_JOB_REQUIRED')
        raw = c.read(private / 'bundle/bundle-manifest.json')
        manifest = c.strict(raw)
        rows = manifest.get('files', [])
        self.need(c.sha(raw) == job.get('manifestSha256')
                  and set(manifest) == {'taskId', 'jobId', 'files'}
                  and manifest['taskId'] == 'T45' and manifest['jobId'] == JOBS[phase]
                  and type(rows) is list and 2 <= len(rows) <= 128
                  and all(type(row) is dict and set(row) == {'name', 'bytes', 'sha256'}
                          and type(row['name']) is str and c.MEMBER.fullmatch(row['name'])
                          and type(row['bytes']) is int and 0 <= row['bytes'] <= 4 * 1024**2
                          and c.digest(row['sha256']) for row in rows)
                  and len({row['name'] for row in rows}) == len(rows)
                  and {row['name'] for row in rows} ==
                  set(rule['bundlePins']) | {rule['authorityLeaf']},
                  'EXACT_FROZEN_MANIFEST_REQUIRED')
        authority, authority_pin = None, None
        for row in rows:
            content = c.read(private / 'bundle' / row['name'], maximum=4 * 1024**2)
            pin = c.sha(content)
            self.need(len(content) == row['bytes'] and pin == row['sha256']
                      and (row['name'] == rule['authorityLeaf']
                           or pin == rule['bundlePins'][row['name']]),
                      'EXACT_FROZEN_MEMBER_REQUIRED')
            if row['name'] == rule['authorityLeaf']:
                authority, authority_pin = c.strict(content), pin
        self.need(type(authority) is dict and authority.get('requestKey') == JOBS[phase]
                  and job.get('args') == [authority_pin]
                  and type(authority.get('startsAt')) is int
                  and type(authority.get('expiresAt')) is int
                  and p['startsAt'] <= authority['startsAt'] <= now
                  and now + rule['timeoutSeconds'] * 1000 < authority['expiresAt'] <= p['expiresAt'],
                  'EXACT_FINITE_AUTHORITY_REQUIRED')
        return authority

    def submitted(self, phase):
        path = self.private(JOBS[phase]) / 'request.json'
        if not os.path.lexists(path):
            return False
        value = self.core.strict(self.core.read(path))
        self.need(value.get('jobId') == JOBS[phase] and value.get('taskId') == 'T45'
                  and value.get('grantId') == self.core.GRANT
                  and value.get('scope') == self.cfg['scope'], 'EXACT_SUBMITTED_PREDECESSOR_REQUIRED')
        return True

    def successful(self, phase):
        _, terminal = self.old.preservation_terminal(JOBS[phase], {'COMPLETED'})
        self.need(terminal.get('exitCode') == 0, 'SUCCESSFUL_PREDECESSOR_REQUIRED')

    def current_batch_settled_or_absent(self, phase):
        key = JOBS[phase]
        c = self.core
        if self.submitted(phase):
            _, terminal = self.old.preservation_terminal(key, {
                'COMPLETED', 'FAILED', 'REFUSED_D0_INTERLOCK_BEFORE_PHASE',
                'REFUSED_R3_CONTINUITY_BEFORE_PHASE', 'INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY'})
            self.need(terminal.get('finishedAtUTC') is not None
                      and terminal.get('phaseStarted') in (True, False),
                      'CURRENT_BATCH_TERMINAL_REQUIRED')
        else:
            for grant in (c.GRANT, '5cc58239751e4e2a'):
                control = Path(self.cfg['control']).with_name('grant-' + grant)
                worker = Path(self.cfg['private']).with_name('grant-' + grant)
                self.need(not any(os.path.lexists(p) for p in (
                    control / 'requests' / (key + '.json'), control / 'requests' / (key + '.tmp'),
                    control / 'jobs' / key, control / 'results' / (key + '.json'), worker / 'jobs' / key)),
                    'CURRENT_BATCH_NOT_PROVEN_UNSUBMITTED')
        q = subprocess.run(['/usr/bin/systemctl', 'is-active',
                            'naijue-erp-op-' + c.GRANT[:8] + '-' + c.sha(key.encode())[:12] + '.service'],
                           capture_output=True, timeout=5)
        self.need(q.returncode in (3, 4) and q.stdout.strip() in (b'inactive', b'unknown')
                  and not q.stderr, 'CURRENT_BATCH_UNIT_ACTIVE_OR_UNKNOWN')

    def admit(self, job, private):
        phase = next((name for name, key in JOBS.items() if job.get('jobId') == key), None)
        if phase is None:
            return self.readonly.admit(job, private)
        authority = self.frozen(phase, job, private)
        self.original_basis()
        if phase in ('materialize', 'apply', 'start'):
            self.core.stopped_generation(self.old.service)
        if phase == 'apply':
            self.successful('materialize')
        elif phase == 'start':
            self.successful('materialize')
            self.successful('apply')
        elif phase in ('install', 'writer'):
            self.current_service(authority.get('service'))
            if phase == 'writer':
                self.successful('install')
        elif phase == 'stop':
            self.need(self.submitted('start'), 'START_SUBMISSION_REQUIRED')
            self.need(self.child_settled(ORIGINAL_WRITER, 'writer'), 'ORIGINAL_WRITER_NOT_SETTLED')
            self.current_batch_settled_or_absent('install')
            self.current_batch_settled_or_absent('writer')
        elif phase == 'restore':
            self.need(self.submitted('apply'), 'APPLY_SUBMISSION_REQUIRED')
            if self.submitted('start'):
                if authority.get('service') is None and authority.get('stopRequestKey') == JOBS['start']:
                    pin, terminal = self.old.preservation_terminal(JOBS['start'], {'FAILED'})
                    self.need(terminal.get('exitCode') == 2
                              and authority.get('stopTerminalSha256') == pin
                              and all(self.core.digest(authority.get(k)) for k in
                                      ('stopResultSha256', 'stopCleanupSha256')),
                              'EXACT_FAILED_START_CLEANUP_BINDING_REQUIRED')
                    self.core.stopped_generation(self.old.service)
                else:
                    self.successful('stop')
            else:
                self.core.stopped_generation(self.old.service)
        return 'direct28-batched-' + phase

    def finish(self, phase):
        if phase in {'direct28-batched-' + name for name in JOBS}:
            return None
        return self.readonly.finish(phase)
