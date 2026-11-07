"""Own one fixed Node directory-open/close child. No chmod, SQL, or PG startup.

Inert on import. The external C-bound carrier supplies the fixed source and
scope through stdin after the original access owner has prepared its ledger.
"""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

KEY = 't45-r4-real-inspect-20261107-01'
REAL = Path('/var/lib/naijue-erp/fresh35-production/real-r3')
LEDGER = REAL/'nonroot-access'/KEY
NODE = '/opt/naijue-erp/fresh35-combined-v1/runtime/node/bin/node'
NODE_SOURCE_SHA = '4f62342a5bde0ccd823a6be60adb6ea34e604c21339b3dcf1282e5b1904c127e'


def need(value, code):
    if not value:
        raise ValueError(code)


def save_once(path, value):
    raw = (json.dumps(value, sort_keys=True)+'\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(raw)
            stream.flush()
        os.fsync(fd)
    finally:
        os.close(fd)


def main():
    need(os.getuid() == os.geteuid() == 0 and sys.flags.isolated and sys.flags.no_site, 'FIXED_ROOT_ISOLATED_OWNER_REQUIRED')
    raw = sys.stdin.buffer.readline(65537)
    need(0 < len(raw) <= 65536, 'BOUNDED_PACKET_REQUIRED')
    packet = json.loads(raw)
    need(set(packet) == {'phase', 'scopeRaw', 'scopeSha256', 'nodeSource'}, 'FIXED_PACKET_REQUIRED')
    phase = packet['phase']
    need(phase in ['0710', '0750'], 'FIXED_PHASE_REQUIRED')
    scope_raw = packet['scopeRaw'].encode()
    need(hashlib.sha256(scope_raw).hexdigest() == packet['scopeSha256'], 'EXACT_C_SCOPE_BYTES_REQUIRED')
    scope = json.loads(scope_raw)
    now = int(time.time()*1000)
    need(scope['requestKey'] == KEY and type(scope['startsAt']) is int and type(scope['expiresAt']) is int and
         scope['startsAt'] <= now and now+8000 < scope['expiresAt'] <= scope['startsAt']+180000,
         'NEW_FINITE_SCOPE_REQUIRED')
    source = packet['nodeSource'].encode()
    need(hashlib.sha256(source).hexdigest() == NODE_SOURCE_SHA, 'FIXED_NODE_SOURCE_REQUIRED')
    need(LEDGER.is_dir() and not LEDGER.is_symlink() and LEDGER.lstat().st_uid == 0, 'ORIGINAL_PROTECTED_LEDGER_REQUIRED')
    ancestor = REAL.lstat()
    need(ancestor.st_uid == 0 and ancestor.st_gid == 61035 and stat.S_IMODE(ancestor.st_mode) == 0o710 and
         ancestor.st_dev == 66304 and ancestor.st_ino == 14555466, 'ORIGINAL_ANCESTOR_TRAVERSAL_REQUIRED')
    for path, inode in [(REAL/'package', 14308365), (REAL/'package/tables', 14308374)]:
        value = path.lstat()
        need(stat.S_ISDIR(value.st_mode) and not stat.S_ISLNK(value.st_mode) and value.st_uid == 0 and
             value.st_gid == 61035 and stat.S_IMODE(value.st_mode) == int(phase, 8) and
             value.st_dev == 66304 and value.st_ino == inode, 'EXACT_DIRECTORY_METADATA_REQUIRED')
    work = REAL.parent/'production-fresh35-20261107-r4'
    boot = REAL/'retained-boot-20261107-05'
    cleanup = json.loads((boot/'cleanup.json').read_bytes())
    need(all(cleanup.get(key) is True for key in ['cleanShutdown','cleanupComplete','dataPreserved','directChildReaped','ownedPidAbsent','portAbsent']) and cleanup.get('errors')==[], 'ORIGINAL_PG_CLEAN_STOP_REQUIRED')
    for name in ['owned-process.json','controller-process.json']:
        identity = json.loads((boot/name).read_bytes())
        process = Path('/proc')/str(identity['pid'])
        try:
            matches = process.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]==identity['starttime'] and os.readlink(process/'exe')==identity['exe']
        except FileNotFoundError:
            matches = False
        need(not matches, 'ORIGINAL_PG_OR_GUARDIAN_STILL_ACTIVE')
    need(not (work/'data/postmaster.pid').exists(), 'ORIGINAL_POSTMASTER_PID_FILE_PRESENT')
    save_once(LEDGER/('probe-'+phase+'-child-intent.json'), {
        'scopeSha256': packet['scopeSha256'], 'nodeSourceSha256': NODE_SOURCE_SHA,
        'phase': phase, 'attempted': True, 'user': 61035, 'group': 61035, 'extraGroups': [],
        'maximumChildSeconds': 5, 'SQL': False, 'PGStartup': False,
    })
    child = None
    reap_deadline = None
    result = {'phase': phase, 'scopeSha256': packet['scopeSha256'], 'nodeSourceSha256': NODE_SOURCE_SHA,
              'state': 'UNKNOWN', 'childAttempted': True, 'childReaped': False,
              'SQL': False, 'PGStartup': False, 'pgAndGuardianStoppedBeforeChild': True, 'automaticRetry': False}
    try:
        code = packet['nodeSource']+'\nconst output=await directoryOpenClose('+json.dumps(phase)+');process.stdout.write(JSON.stringify(output)+"\\n");\n'
        need(int(time.time()*1000)+8000<scope['expiresAt'], 'CHILD_BUDGET_EXCEEDS_SCOPE')
        child = subprocess.Popen([NODE, '--no-global-search-paths', '--max-old-space-size=64',
                                  '--input-type=module', '-e', code],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 cwd='/tmp', env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TZ': 'UTC'},
                                 user=61035, group=61035, extra_groups=[], start_new_session=True)
        result['ownedDirectChildPid'] = child.pid
        try:
            stdout, _ = child.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            result['state'] = 'CHILD_TIMEOUT'
            reap_deadline = time.monotonic()+3
            child.kill()
            stdout = b''
        result['childReaped'] = child.poll() is not None
        result['exitCode'] = child.returncode
        if stdout and child.returncode == 0:
            need(len(stdout) <= 4096, 'BOUNDED_DIRECTORY_OBSERVATION_REQUIRED')
            observed = json.loads(stdout)
            need(observed['phase'] == phase and observed['identity']['uid'] == observed['identity']['gid'] == 61035 and
                 observed['identity']['nodeVersion'] == 'v24.21.0' and
                 set(observed['identity']['groups']) <= {61035} and
                 [value['slot'] for value in observed['observations']] == ['PACKAGE_ROOT', 'TABLES_DIRECTORY'] and
                 observed['readCalled'] is False and observed['iterationStarted'] is False and observed['payloadRead'] is False,
                 'FIXED_ORDINARY_NODE_OBSERVATION_REQUIRED')
            result['observation'] = observed
            result['state'] = observed['state']
    except BaseException as error:
        result['exceptionClass'] = type(error).__name__ if type(error).__name__ in ['ValueError', 'OSError', 'TimeoutExpired', 'JSONDecodeError'] else 'OTHER_EXCEPTION'
    finally:
        if child is not None and child.poll() is None:
            if reap_deadline is None:
                reap_deadline = time.monotonic()+3
            child.kill()  # Only this still-unreaped Popen child; never a discovered PID.
            remaining = max(0,reap_deadline-time.monotonic())
            if remaining>0:
                try:
                    child.wait(timeout=remaining)
                except subprocess.TimeoutExpired:
                    result['state'] = 'OWN_CHILD_REAP_UNKNOWN'
            else:
                result['state'] = 'OWN_CHILD_REAP_UNKNOWN'
        if child is not None:
            result['childReaped'] = child.poll() is not None
            result['exitCode'] = child.returncode
        result['checkedAtEpochMs'] = int(time.time()*1000)
        save_once(LEDGER/('probe-'+phase+'-result.json'), result)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
