"""Finite exact final-input reception within the retained original R3 hold."""
from pathlib import Path
from types import ModuleType
import os
import re
import subprocess
import time

POLICY_NAME = 'final33-input-reception-recovery.json'
FORMAT = 'T45_R3_FINAL33_INPUT_CONTINUATION_V1'
MANIFEST = '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
KEY = re.compile(r't45-r3-final33-stage-(install|restore)-20261116-([a-f0-9]{24})\Z')


class Final33InputContinuation:
    def __init__(self, core, prior, cfg, policy_sha256):
        self.core, self.prior, self.cfg = core, prior, cfg
        self.root = prior.root
        raw = core.read(self.root / POLICY_NAME)
        self.need(core.sha(raw) == policy_sha256, 'REGISTERED_POLICY_DIFFERS')
        p = self.policy = core.strict(raw)
        self.need(set(p) == {'format', 'grantId', 'startsAt', 'expiresAt', 'manifestSha256',
                            'codeSha256', 'groupManifestSha256', 'evidencePins', 'stoppedService'},
                  'EXACT_POLICY_FIELDS_REQUIRED')
        self.need(p['format'] == FORMAT and p['grantId'] == cfg['grantId'] == core.GRANT
                  and p['manifestSha256'] == MANIFEST
                  and type(p['startsAt']) is type(p['expiresAt']) is int
                  and 0 < p['startsAt'] < p['expiresAt'] <= p['startsAt'] + 86_400_000
                  and p['expiresAt'] <= int(cfg['expiresAtEpoch'] * 1000)
                  and type(p['groupManifestSha256']) is list
                  and len(p['groupManifestSha256']) == len(set(p['groupManifestSha256'])) == 54
                  and all(core.digest(pin) for pin in p['groupManifestSha256']), 'FINITE_EXACT_POLICY_REQUIRED')

    def __getattr__(self, name):
        return getattr(self.prior, name)

    def need(self, ok, code):
        self.core.need(ok, 'R3_CONTINUITY_FINAL33_INPUT_' + code)

    def stopped_basis(self):
        for path, pin in self.policy['evidencePins'].items():
            self.need(self.core.sha(self.core.read(Path(path))) == pin, 'ORIGINAL_EVIDENCE_DIFFERS')
        self.need(not os.path.lexists(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3') /
                  'state/fresh35-first-production-20261110-r3/data/postmaster.pid'), 'PGDATA_NOT_STOPPED')
        service = self.policy['stoppedService']
        observed = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
            '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            service['containerId']], capture_output=True, timeout=5, check=True)
        self.need(not observed.stderr and 0 < len(observed.stdout) <= 4096
                  and self.core.strict(observed.stdout) == {
                      'id': service['containerId'], 'startedAt': service['containerStartedAt'],
                      'running': False, 'pid': 0, 'operation': service['serviceKey']},
                  'ACTUAL32_STOPPED_GENERATION_REQUIRED')

    def admit(self, job, private):
        match = KEY.fullmatch(job.get('jobId', ''))
        if match is None:
            return self.prior.admit(job, private)
        c, p = self.core, self.policy
        at = time.time_ns() // 1_000_000
        self.need(p['startsAt'] <= at < p['expiresAt'], 'FINITE_POLICY_EXPIRED')
        self.need(private == Path(self.cfg['private']) / 'jobs' / job['jobId'], 'EXACT_PRIVATE_JOB_REQUIRED')
        self.need(c.strict(c.read(private / 'request.json')) == job, 'FROZEN_REQUEST_DIFFERS')
        pins = p['codeSha256']
        names = set(pins) | {'stage-authorization.json', 'batch-manifest.json'}
        manifest_raw = c.read(private / 'bundle/bundle-manifest.json')
        outer = c.strict(manifest_raw)
        self.need(c.sha(manifest_raw) == job.get('manifestSha256')
                  and c.strict(c.read(private / 'manifest.json')) == outer
                  and outer.get('jobId') == job['jobId'] and outer.get('taskId') == 'T45'
                  and len(outer.get('files', [])) == len(names)
                  and {r.get('name') for r in outer['files']} == names, 'FROZEN_BUNDLE_DIFFERS')
        buffers = {name: c.read(private / 'bundle' / name, maximum=131072) for name in names}
        for row in outer['files']:
            raw = buffers[row['name']]
            self.need(row.get('bytes') == len(raw) and row.get('sha256') == c.sha(raw), 'FROZEN_MEMBER_DIFFERS')
        self.need(all(c.sha(buffers[name]) == pin for name, pin in pins.items()), 'EXACT_CODE_REQUIRED')
        module = ModuleType('fixed_final33_batch_protocol')
        exec(compile(buffers['batch_protocol.py'], 'fixed_final33_batch_protocol', 'exec'), module.__dict__)
        raw, plan = buffers['stage-authorization.json'], buffers['batch-manifest.json']
        digest = c.sha(raw)
        authority, parts = module.bind(raw, digest, plan)
        self.need(authority['codeSha256'] == pins and authority['manifestSha256'] == MANIFEST
                  and c.sha(module.pack([{**part, 'window':{**part['window'], 'boundary':None}}
                                          for part in parts])) in p['groupManifestSha256']
                  and p['startsAt'] <= authority['startsAt'] < authority['expiresAt'] <= p['expiresAt'] - 300000
                  and authority['expiresAt'] - authority['startsAt'] == 1080000,
                  'EXACT_GROUP_OR_WINDOW_REQUIRED')
        install, restore = module.jobs(digest)
        self.need(job.get('taskId') == 'T45' and job.get('grantId') == self.cfg['grantId']
                  and job.get('scope') == self.cfg['scope'] and job.get('script') == 'batch_policy.py'
                  and job.get('args') == [digest] and job.get('timeoutSeconds') == 35
                  and job['jobId'] == (install if match[1] == 'install' else restore)
                  and match[2] == digest[:24], 'EXACT_JOB_REQUIRED')
        for part in parts:
            module.part_api(buffers['artifact-receiver.d3-chunk.py'], authority, part, digest)
        self.stopped_basis()
        if match[1] == 'install':
            self.need(authority['startsAt'] <= at and authority['expiresAt'] - at > 840000,
                      'FULL_UPLOAD_AND_CLOSEOUT_BUDGET_REQUIRED')
        else:
            original = Path(self.cfg['private']) / 'jobs' / install
            self.need(c.read(original / 'bundle/stage-authorization.json') == raw
                      and c.read(original / 'bundle/batch-manifest.json') == plan,
                      'ORIGINAL_INSTALL_REQUIRED')
        # The unchanged native batch_policy performs exclusive policy installation or
        # exact withdrawal. Neither operation advances the original business hold.
        return None

    def finish(self, phase):
        return self.prior.finish(phase)
