"""Method source for the next module; actual27 closure, no future service liveness."""


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
