#!/usr/bin/python3
"""Invoke via /usr/bin/python3 -I -S at the fixed root-owned deployment path.
Checks happen before Node or project imports. Never installs permissions itself.
OS Python/stdlib and privileged deployment are the trust root, not an argv token.
"""
import os
import stat
import sys
import subprocess
import re

def deployment_layout(platform):
    if platform == 'linux':
        return ('/opt/naijue-erp/whole-sales-v1', '/usr/bin/node', '/usr/lib/postgresql/17/bin/psql', '/etc/naijue-erp')
    if platform == 'darwin':
        return ('/Library/Application Support/NaijueERP/whole-sales-v1', '/usr/local/bin/node', '/Library/PostgreSQL/17/bin/psql', '/private/etc/naijue-erp')
    raise RuntimeError('SALES_LAUNCH_PLATFORM_UNSUPPORTED')

ROOT, NODE, PSQL, ETC = deployment_layout(sys.platform)
SELF = ROOT + '/scripts/release/unified-install/launch-whole-sales-install-v1.py'
ENTRY = ROOT + '/scripts/release/unified-install/install-whole-sales-record-v1.mjs'
PRELOAD = ROOT + '/scripts/release/unified-install/preload-whole-sales-install-v1.mjs'


def assert_mac_acl_listing_safe(output):
    if not isinstance(output, str) or len(output) > 65536:
        raise RuntimeError('SALES_LAUNCH_EXTENDED_ACL_UNTRUSTED')
    lines = output[:-1].split('\n') if output.endswith('\n') else output.split('\n')
    if len(lines) != 1 or not re.match(r'^[d-][rwxstST-]{9}@?\s', lines[0]) or '\r' in lines[0]:
        raise RuntimeError('SALES_LAUNCH_EXTENDED_ACL_UNTRUSTED')


def mac_acl(path):
    if '\n' in path or '\r' in path:
        raise RuntimeError('SALES_LAUNCH_EXTENDED_ACL_UNTRUSTED')
    try:
        result = subprocess.run(['/bin/ls', '-lde', path], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=5, env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'}, check=True)
        if result.stderr:
            raise RuntimeError('SALES_LAUNCH_EXTENDED_ACL_UNTRUSTED')
        assert_mac_acl_listing_safe(result.stdout)
    except Exception:
        raise RuntimeError('SALES_LAUNCH_EXTENDED_ACL_UNTRUSTED')


def trusted(path, tree=False, seen=None):
    if seen is None:
        seen = set()
    if not path.startswith('/') or os.path.normpath(path) != path:
        raise RuntimeError('SALES_LAUNCH_ABSOLUTE_PATH_REQUIRED')
    current = '/'
    for part in [''] + path.split('/')[1:]:
        if part:
            current = os.path.join(current, part)
        info = os.lstat(current)
        if info.st_uid != 0 or info.st_mode & 0o022 or stat.S_ISLNK(info.st_mode) or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
            raise RuntimeError('SALES_LAUNCH_PATH_UNTRUSTED')
        if sys.platform == 'darwin' and current not in seen:
            mac_acl(current)
            seen.add(current)
    if tree and stat.S_ISDIR(os.lstat(path).st_mode):
        for entry in os.scandir(path):
            trusted(entry.path, True, seen)


def main():
    if not sys.flags.isolated or not sys.flags.no_site:
        raise RuntimeError('SALES_LAUNCH_ISOLATED_PYTHON_REQUIRED')
    if sys.platform not in ('linux', 'darwin') or os.getuid() != 0 or os.geteuid() != 0:
        raise RuntimeError('SALES_LAUNCH_NATIVE_ROOT_REQUIRED')
    if len(sys.argv) != 2 or sys.argv[1] not in ('--install-reviewed-sales-v1', '--install-reviewed-original-local-v1') or os.path.abspath(__file__) != SELF:
        raise RuntimeError('SALES_LAUNCH_FIXED_ENTRY_REQUIRED')
    original = sys.argv[1] == '--install-reviewed-original-local-v1'
    entry = ROOT + '/scripts/release/unified-install/record-whole-installation.mjs' if original else ENTRY
    config = ETC + ('/whole-original-install-config-v1.json' if original else '/whole-sales-install-config-v1.json')
    arguments = ['--install-reviewed-local-config', config] if original else ['--install-reviewed-sales-v1']
    trusted(ROOT, True)
    for path in [NODE, PSQL, ETC, config] + ([] if original else [ETC + '/whole-installation.json']):
        trusted(path)
    config_stat = os.lstat(config)
    if not stat.S_ISREG(config_stat.st_mode) or config_stat.st_uid != 0 or config_stat.st_nlink != 1 or config_stat.st_mode & 0o077 or not 0 < config_stat.st_size <= 16384:
        raise RuntimeError('SALES_LAUNCH_PRIVATE_CONFIG_REQUIRED')
    for path in [NODE, PSQL, entry, PRELOAD]:
        if not stat.S_ISREG(os.lstat(path).st_mode):
            raise RuntimeError('SALES_LAUNCH_EXECUTABLE_REQUIRED')
    os.chdir(ROOT)
    read_fd, write_fd = os.pipe()
    os.write(write_fd, b'WHOLE_SALES_TRUSTED_LAUNCH_V1\n')
    os.close(write_fd)
    if read_fd != 3:
        os.dup2(read_fd, 3)
        os.close(read_fd)
    os.set_inheritable(3, True)
    if original:
        sys.stderr.write('ORIGINAL_INSTALL_MULTISTAGE_NO_ATOMIC_ROLLBACK: a failed stage or record publication can follow committed earlier stages; inspect before any retry.\n')
        sys.stderr.flush()
    os.execve(NODE, [NODE, '--no-global-search-paths', '--import', PRELOAD, entry] + arguments, {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'HOME': '/var/root' if sys.platform == 'darwin' else '/root'})


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error)
        sys.stderr.write((code if code.startswith('SALES_') else 'SALES_LAUNCH_FAILED') + '\n')
        sys.exit(1)
