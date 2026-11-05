"""Offline launcher contract with mocked privilege/filesystem; no install or DB."""
import os
import runpy
import stat
import sys
from unittest.mock import patch

scope = runpy.run_path(sys.argv[1], run_name='launcher_contract')
main = scope['main']
g = main.__globals__
g['__file__'] = g['SELF']
seen = []

def check(path, tree=False):
    seen.append(('check', path, tree))

def execute(path, argv, env):
    seen.append(('exec', path))
    assert argv == [g['NODE'], '--no-global-search-paths', '--import', g['PRELOAD'], g['ENTRY'], '--install-reviewed-sales-v1']
    assert env == {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'HOME': '/var/root' if sys.platform == 'darwin' else '/root'}
    assert os.read(3, 128) == b'WHOLE_SALES_TRUSTED_LAUNCH_V1\n'
    assert os.get_inheritable(3)
    os.close(3)

g['trusted'] = check
with patch.object(sys, 'argv', [g['SELF'], '--install-reviewed-sales-v1']), patch.object(os, 'getuid', return_value=0), patch.object(os, 'geteuid', return_value=0), patch.object(os, 'lstat', return_value=type('Info', (), {'st_mode': stat.S_IFREG | 0o600, 'st_uid': 0, 'st_nlink': 1, 'st_size': 100})()), patch.object(os, 'chdir'), patch.object(os, 'execve', side_effect=execute):
    main()
assert seen[0] == ('check', g['ROOT'], True)
assert seen[-1] == ('exec', g['NODE'])
assert ('check', g['NODE'], False) in seen
assert ('check', g['PSQL'], False) in seen
seen.clear()
def deny(path, tree=False):
    raise RuntimeError('SALES_LAUNCH_PATH_UNTRUSTED')
g['trusted'] = deny
with patch.object(sys, 'argv', [g['SELF'], '--install-reviewed-sales-v1']), patch.object(os, 'getuid', return_value=0), patch.object(os, 'geteuid', return_value=0), patch.object(os, 'execve', side_effect=AssertionError('must not launch')):
    try:
        main()
        raise AssertionError('must fail')
    except RuntimeError as error:
        assert str(error) == 'SALES_LAUNCH_PATH_UNTRUSTED'
# Same entry contract on native Mac paths, without asserting a Mac was accessed.
g['ROOT'], g['NODE'], g['PSQL'], g['ETC'] = g['deployment_layout']('darwin')
g['SELF'] = g['ROOT'] + '/scripts/release/unified-install/launch-whole-sales-install-v1.py'
g['ENTRY'] = g['ROOT'] + '/scripts/release/unified-install/install-whole-sales-record-v1.mjs'
g['PRELOAD'] = g['ROOT'] + '/scripts/release/unified-install/preload-whole-sales-install-v1.mjs'
g['__file__'] = g['SELF']
g['trusted'] = check
seen.clear()
with patch.object(sys, 'platform', 'darwin'), patch.object(sys, 'argv', [g['SELF'], '--install-reviewed-sales-v1']), patch.object(os, 'getuid', return_value=0), patch.object(os, 'geteuid', return_value=0), patch.object(os, 'lstat', return_value=type('Info', (), {'st_mode': stat.S_IFREG | 0o600, 'st_uid': 0, 'st_nlink': 1, 'st_size': 100})()), patch.object(os, 'chdir'), patch.object(os, 'execve', side_effect=execute):
    main()
assert seen[0] == ('check', '/Library/Application Support/NaijueERP/whole-sales-v1', True)
assert ('check', '/private/etc/naijue-erp', False) in seen
assert ('check', '/Library/PostgreSQL/17/bin/psql', False) in seen
assert seen[-1] == ('exec', '/usr/local/bin/node')
for uid, euid in [(1000, 0), (0, 1000)]:
    with patch.object(sys, 'platform', 'darwin'), patch.object(os, 'getuid', return_value=uid), patch.object(os, 'geteuid', return_value=euid), patch.object(os, 'execve', side_effect=AssertionError('must not launch')):
        try:
            main()
            raise AssertionError('must reject mismatched privilege')
        except RuntimeError as error:
            assert str(error) == 'SALES_LAUNCH_NATIVE_ROOT_REQUIRED'
# Exercise actual Mac ACL parser and ancestor walk with mocked OS listings.
acl_safe = g['assert_mac_acl_listing_safe']
acl_safe('-rw-r--r-- 1 root wheel 10 Nov 4 12:00 /safe\n')
for listing in ['', '-rw-r--r--+ 1 root wheel 10 Nov 4 12:00 /safe\n', '-rw-r--r--@ 1 root wheel 10 Nov 4 12:00 /safe\n 0: user:attacker allow write\n']:
    try:
        acl_safe(listing)
        raise AssertionError('extended ACL must fail')
    except RuntimeError as error:
        assert str(error) == 'SALES_LAUNCH_EXTENDED_ACL_UNTRUSTED'
# Reload to retain the real trusted() implementation, without running main.
real = runpy.run_path(sys.argv[1], run_name='launcher_acl_contract')
paths = []
def ls_result(args, **kwargs):
    paths.append(args[-1])
    assert args[:2] == ['/bin/ls', '-lde']
    assert kwargs['env'] == {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'}
    line = 'drwxr-xr-x 1 root wheel 10 Nov 4 12:00 ' + args[-1] + '\n'
    if args[-1].endswith('whole-sales-install-config-v1.json'):
        line += ' 0: user:attacker allow write\n'
    return type('Result', (), {'stdout': line, 'stderr': ''})()
with patch.object(sys, 'platform', 'darwin'), patch.object(os, 'lstat', return_value=type('Info', (), {'st_uid': 0, 'st_mode': stat.S_IFDIR | 0o755})()), patch('subprocess.run', side_effect=ls_result):
    try:
        real['trusted']('/private/etc/naijue-erp/whole-sales-install-config-v1.json')
        raise AssertionError('unsafe config ACL must fail')
    except RuntimeError as error:
        assert str(error) == 'SALES_LAUNCH_EXTENDED_ACL_UNTRUSTED'
assert paths == ['/', '/private', '/private/etc', '/private/etc/naijue-erp', '/private/etc/naijue-erp/whole-sales-install-config-v1.json']
print('launcher contract passed on Linux/Mac mappings and ACL ancestors; privilege/filesystem were mocked')
# The legacy finalizer is not a supported mode, even for a root-shaped caller.
# It must never be used to recognize an already-installed catalog after the fact.
for argument in ['--finalize-reviewed-batch-closure-v1', '/tmp/finalize-whole-batch-closure-v1.mjs', '--entry=/tmp/arbitrary.mjs']:
    with patch.object(sys, 'platform', 'darwin'), patch.object(sys, 'argv', [g['SELF'], argument]), patch.object(os, 'getuid', return_value=0), patch.object(os, 'geteuid', return_value=0), patch.object(os, 'execve', side_effect=AssertionError('must not launch arbitrary/finalizer entry')):
        try:
            main()
            raise AssertionError('unsupported root mode must fail')
        except RuntimeError as error:
            assert str(error) == 'SALES_LAUNCH_FIXED_ENTRY_REQUIRED'
# Fixed argv does not make a user-writable checkout an approved root launcher.
old_file = g['__file__']
g['__file__'] = '/tmp/arbitrary-checkout/launch-whole-sales-install-v1.py'
try:
    with patch.object(sys, 'platform', 'darwin'), patch.object(sys, 'argv', [g['SELF'], '--install-reviewed-sales-v1']), patch.object(os, 'getuid', return_value=0), patch.object(os, 'geteuid', return_value=0), patch.object(os, 'execve', side_effect=AssertionError('must not launch arbitrary checkout')):
        try:
            main()
            raise AssertionError('arbitrary source path must fail')
        except RuntimeError as error:
            assert str(error) == 'SALES_LAUNCH_FIXED_ENTRY_REQUIRED'
finally:
    g['__file__'] = old_file
print('legacy finalizer modes and arbitrary checkout rejected before Node (mocked root)')
