"""Offline original177 native launch contract. No root/database/install actions."""
import os,runpy,stat,sys,io
from contextlib import redirect_stderr
from unittest.mock import patch
scope=runpy.run_path(sys.argv[1],run_name='original_launch_contract')
main=scope['main'];g=main.__globals__;seen=[]
for platform in ['linux','darwin']:
    g['ROOT'],g['NODE'],g['PSQL'],g['ETC']=g['deployment_layout'](platform)
    g['SELF']=g['ROOT']+'/scripts/release/unified-install/launch-whole-sales-install-v1.py'
    g['ENTRY']=g['ROOT']+'/scripts/release/unified-install/install-whole-sales-record-v1.mjs'
    g['PRELOAD']=g['ROOT']+'/scripts/release/unified-install/preload-whole-sales-install-v1.mjs'
    g['__file__']=g['SELF'];seen.clear()
    def check(path,tree=False): seen.append(path)
    def execute(path,argv,env):
        assert argv==[g['NODE'],'--no-global-search-paths','--import',g['PRELOAD'],g['ROOT']+'/scripts/release/unified-install/record-whole-installation.mjs','--install-reviewed-local-config',g['ETC']+'/whole-original-install-config-v1.json']
        assert os.read(3,128)==b'WHOLE_SALES_TRUSTED_LAUNCH_V1\n'
        assert os.read(3,1)==b''
        assert env=={'PATH':'/usr/bin:/bin','LC_ALL':'C','HOME':'/var/root' if platform=='darwin' else '/root'}
        os.close(3)
        seen.append('EXECUTED')
    g['trusted']=check
    warning=io.StringIO()
    with redirect_stderr(warning),patch.dict(os.environ,{'NODE_OPTIONS':'untrusted','NODE_PATH':'untrusted','PGHOST':'untrusted','LD_PRELOAD':'untrusted'}),patch.object(sys,'platform',platform),patch.object(sys,'argv',[g['SELF'],'--install-reviewed-original-local-v1']),patch.object(os,'getuid',return_value=0),patch.object(os,'geteuid',return_value=0),patch.object(os,'lstat',return_value=type('Info',(),{'st_mode':stat.S_IFREG|0o600,'st_uid':0,'st_nlink':1,'st_size':100})()),patch.object(os,'chdir'),patch.object(os,'execve',side_effect=execute):
        main()
    assert 'ORIGINAL_INSTALL_MULTISTAGE_NO_ATOMIC_ROLLBACK' in warning.getvalue()
    assert 'failed stage or record publication can follow committed earlier stages' in warning.getvalue()
    assert seen[-1]=='EXECUTED'
    assert g['ETC']+'/whole-original-install-config-v1.json' in seen
    assert g['ETC']+'/whole-installation.json' not in seen
    assert g['ETC']+'/whole-sales-install-config-v1.json' not in seen
print('original177 launch mappings passed with mocked OS; original installer retains guarded stage semantics; OS was mocked')
