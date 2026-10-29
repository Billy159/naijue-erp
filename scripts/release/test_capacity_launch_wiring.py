"""Capacity release guard/mount increment only. No server, Docker or PG."""
import copy, hashlib, json, pathlib, tempfile, time, types, unittest
from unittest.mock import patch
HERE = pathlib.Path(__file__).parent

def load(name):
    m = types.ModuleType(name); m.__file__ = str(HERE / (name + '.py'))
    exec(compile(pathlib.Path(m.__file__).read_bytes(), m.__file__, 'exec'), m.__dict__)
    return m
D = load('deploy-candidate')
B = load('boot-entry')
V = D.CAPACITY_VOLUMES

class CapacityWiring(unittest.TestCase):
    def fixture(self, root):
        now = int(time.time() * 1000)
        binding = dict(candidateFingerprint='a'*40, targetFingerprint='target', writerTopologyFingerprint='one', inventoryFingerprint='inventory',
                       processInstanceId='00000000-0000-0000-0000-000000000000:1:123', restartGeneration=0, writerCount=1, physicalVolumes={k:'volume' for k in V})
        target = dict(host='qa-db', port=5432, database='isolated', role='qa-role', databaseOid='123', postmasterStart='known-start')
        window = dict(approved=True, token='synthetic-window', inventoryObservedAt=now-100, startsAt=now-50, expiresAt=now+60000, binding=binding)
        mappings = {k:dict(path='/visible/'+k, physicalVolume='volume', namespace='linux:mnt:[123]') for k in V}
        profile = dict(schemaVersion=1, profile='OWNER_FIXED_STATFS_V1', reviewSha256='b'*64, target=target, binding=binding, windowToken=window['token'],
                       startsAt=window['startsAt'], expiresAt=window['expiresAt'], maxAgeMillis=1000, namespace='linux:mnt:[123]',
                       volumes={k:dict(**mappings[k], device='1', filesystemType='2') for k in V})
        source = root/'collector.mjs'; source.write_text('#!/usr/local/bin/node\n// fixed test-only artifact\n'); source.chmod(0o755)
        profile_path = root/'profile.json'; profile_path.write_text(json.dumps(profile)); profile_path.chmod(0o600)
        artifact = lambda p,dst: dict(hostFile=str(p), containerFile=dst, sha256=hashlib.sha256(p.read_bytes()).hexdigest())
        host = dict(collector=artifact(source,D.CAPACITY_COLLECTOR), profile=artifact(profile_path,D.CAPACITY_PROFILE),
                    interpreter=dict(containerFile='/usr/local/bin/node',sha256='c'*64,imageId='sha256:'+'d'*64), reviewSha256='b'*64)
        p = dict(sourceCommit='a'*40, capacityHost=host, images={'node':{'id':'sha256:'+'d'*64}}, limits={'app':{'user':f'{source.stat().st_uid}:10001'}})
        zero = {k:'0' for k in V}; demand={k:'1' for k in V}
        cap = dict(schemaVersion=1,profile='OWNER_REVIEWED_CAPACITY_EXEC_V1',target=target,window=window,
                   process=dict(pid=1,linuxStartTicks='123',linuxBootId='00000000-0000-0000-0000-000000000000'),
                   budgets={k:dict(maxAdmissions=2,maxInFlight=1,worstCaseBytes=demand) for k in ('session','upload')},
                   minimumFreeBytes=zero,safetyBytes=zero,probeTtlMillis=1000,probeTimeoutMillis=500,maxProbeWaiters=1,retryAfterSeconds=1,
                   producer=dict(executable=D.CAPACITY_COLLECTOR,sha256=host['collector']['sha256'],args=['--profile='+host['profile']['sha256']],timeoutMillis=200,maxOutputBytes=65536,reviewSha256='b'*64,volumes=mappings))
        runtime=dict(postgres={'target':dict(host='qa-db',port=5432,database='isolated',user='qa-role')},capacityLaunch=cap,unknownBusiness='must remain closed')
        return p,runtime

    def test_complete_validation_before_strip_and_preserve_business(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp).resolve();root.chmod(0o755)
            with patch.object(D,'ROOT',root):
                p,r=self.fixture(root); original=copy.deepcopy(r)
                result=D.capacity_runtime_configuration(p,r)
                self.assertNotIn('capacityLaunch',result);self.assertEqual(result['unknownBusiness'],'must remain closed');self.assertEqual(r,original)
                # Successful capacity validation does not delete/relax unknown business fields.
                with patch.object(D,'exact26_full',return_value=False),patch.object(D,'reference',return_value={}):
                    p['runtime26']={'upgradeReceipt':{}}
                    with self.assertRaises(D.Refused):D.validate_runtime26(p,{}, {},r)
                with patch.object(D,'runtime_references',return_value={}):
                    with self.assertRaises(D.Refused):D.validate_full_metadata(p,r,{}, {},{})

    def test_invalid_closed_shapes_and_no_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp).resolve();root.chmod(0o755)
            with patch.object(D,'ROOT',root):
                p,r=self.fixture(root)
                edits=[lambda c:c.update(extra=True),lambda c:c.update(probeTtlMillis=30001),lambda c:c['window'].update(approved=False),
                       lambda c:c['window'].update(expiresAt=1),lambda c:c['target'].update(role='wrong'),lambda c:c['process'].update(pid=2),
                       lambda c:c['budgets']['session'].update(maxAdmissions=True),lambda c:c['minimumFreeBytes'].update(postgres=-1),
                       lambda c:c['producer'].update(args=[]),lambda c:c['producer'].update(executable='/bin/sh'),
                       lambda c:c['producer']['volumes']['wal'].update(path='/other'),lambda c:c['window']['binding'].update(writerCount=2)]
                for edit in edits:
                    bad=copy.deepcopy(r);edit(bad['capacityLaunch'])
                    with self.subTest(edit=edit),self.assertRaises(D.Refused):D.capacity_runtime_configuration(p,bad)
                with self.assertRaises(D.Refused):D.capacity_runtime_configuration(p,{'postgres':r['postgres']})
                for full in (False,True):
                    with patch.object(D,'exact26_full',return_value=full),self.assertRaises(D.Refused):D.validate_runtime26(p,{}, {},{})

    def test_profile_is_separate_owner_artifact_and_mounts_readonly(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp).resolve();root.chmod(0o755)
            with patch.object(D,'ROOT',root):
                p,r=self.fixture(root)
                with patch.object(D,'exact26_selected',return_value=False),patch.object(D,'exact26_full',return_value=False):
                    args=D.runtime_mount_arguments(p)
                self.assertEqual(len(args),4)
                self.assertTrue(all(a.endswith(',readonly') for a in args[1::2]))
                self.assertEqual(D.runtime_entry_arguments(p),['/run/naijue-rewrite/runtime.json'])
                pathlib.Path(p['capacityHost']['profile']['hostFile']).write_text('{}')
                with self.assertRaises(D.Refused):D.capacity_runtime_configuration(p,r)
                with self.assertRaises(D.Refused):D.create_app(p,object())

    def test_no_direct_cli_bypass_until_original_f02_is_integrated(self):
        with patch.object(D,'capacity_host_binding',return_value={}):
            with self.assertRaisesRegex(D.Refused,'BOUNDED_CONTROLLER'):D.create_app({},object())

    def test_same_inode_runtime_fill_and_cas(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp).resolve();file=root/'runtime.json';file.write_bytes(b'{}');file.chmod(0o600)
            before=D.file_identity(file);after=D.same_inode_runtime_write(str(file),before,b'{"synthetic":true}')
            self.assertEqual(before['inode'],after['inode']);self.assertEqual(file.read_bytes(),b'{"synthetic":true}')
            with self.assertRaises(D.Refused):D.same_inode_runtime_write(str(file),before,b'{}')

    def test_fixed_shell_argument_positions_and_no_init_or_child_shell(self):
        gate={'shell':{'containerFile':'/bin/sh'},'nonce':'a'*64}
        p={'images':{'node':{'id':'image'}}}
        with patch.object(D,'capacity_gate_binding',return_value=gate),patch.object(D,'runtime_entry_arguments',return_value=['--exact26-full','/run/naijue-rewrite/runtime.json']):
            args=D.capacity_gate_arguments(p)
        self.assertEqual(args[:4],['--entrypoint','/bin/sh','image','-c'])
        self.assertEqual(args[5:8],['naijue-capacity-gate','a'*64,'/usr/local/bin/node'])
        self.assertIn('shift; exec "$@"',args[4]);self.assertNotIn('--init',args)

    def test_fifo_release_real_nonblocking_channel_and_failure_stop(self):
        import os,threading
        class Docker:
            def __init__(self,p):self.p=p;self.running=True;self.stops=[]
            def inspect(self,cid,seconds=3):
                return {'Id':cid,'State':{'Running':self.running},'HostConfig':{'RestartPolicy':{'Name':'no','MaximumRetryCount':0}},
                        'Config':{'Labels':{'naijue.rapid-launch.created-by':self.p['operationId']}}}
            def run(self,args,timeout):self.stops.append(args);self.running=False;return b''
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp).resolve();root.chmod(0o700)
            with patch.object(D,'ROOT',root),patch.object(D,'assert_own'):
                p,r=self.fixture(root);p['operationId']='synthetic';p['limits']['app']['user']=f'{os.getuid()}:{os.getgid()}'
                file=root/'runtime.json';file.write_text(json.dumps(r));file.chmod(0o600);identity=D.file_identity(file);p['runtimeConfiguration']={'path':str(file),'identity':identity}
                private=root/'private';private.mkdir(mode=0o700);fifo=private/'gate';os.mkfifo(fifo,0o600)
                p['capacityGate']={'hostFifo':str(fifo),'identity':D.capacity_fifo_identity(fifo),'nonce':'d'*64,'deadlineAt':int(time.time()*1000)+1000,
                    'shell':{'containerFile':'/bin/sh','sha256':'e'*64,'imageId':p['images']['node']['id']}}
                received=[]
                def read():
                    with fifo.open('r') as f:received.append(f.readline())
                thread=threading.Thread(target=read,daemon=True);thread.start();docker=Docker(p)
                result=D.release_capacity_fifo(p,docker,'owned',r['capacityLaunch']['process'],identity,lambda *args:True)
                thread.join(1);self.assertFalse(thread.is_alive());self.assertEqual(received,['d'*64+'\n']);self.assertTrue(result['released']);self.assertEqual(docker.stops,[])
                # No reader: ENXIO is retried only to the absolute finite deadline, then only owned CID stops.
                p['capacityGate']['deadlineAt']=int(time.time()*1000)+40;docker=Docker(p)
                with self.assertRaises(D.Refused):D.release_capacity_fifo(p,docker,'owned',r['capacityLaunch']['process'],identity,lambda *args:True)
                self.assertEqual(docker.stops,[['stop','--time','5','owned']]);self.assertFalse(docker.running)
                p['capacityGate']['deadlineAt']=int(time.time()*1000)+1000;docker=Docker(p)
                with self.assertRaises(D.Refused):D.release_capacity_fifo(p,docker,'owned',r['capacityLaunch']['process'],identity,lambda *args:False)
                self.assertFalse(docker.running)

    def test_final_controller_missing_input_never_allocates_or_leaves_gate(self):
        with patch.object(D,'capacity_gate_binding',return_value={}),patch.object(D,'file_identity',return_value={}),patch.object(D,'create_capacity_gate_app') as create:
            with self.assertRaises(D.Refused):D.run_capacity_gate_controller({'runtimeConfiguration':{'path':'private','identity':{}}},object(),object())
            create.assert_not_called()

    def test_actual_local_fifo_shell_exec_keeps_pid_and_rejects_bad_nonce_eof(self):
        import os,subprocess
        node='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node'
        with tempfile.TemporaryDirectory() as tmp:
            fifo=pathlib.Path(tmp).resolve()/'gate';os.mkfifo(fifo,0o600)
            body=D.CAPACITY_GATE_BODY.replace(D.CAPACITY_GATE_PATH,str(fifo))
            for decision,expected in [('a'*64+'\n',0),('wrong\n',1),('',1)]:
                child=subprocess.Popen(['/bin/sh','-c',body,'naijue-capacity-gate','a'*64,node,'-e','process.stdout.write(String(process.pid))'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                fd=None;deadline=time.monotonic()+2
                try:
                    while fd is None:
                        try:fd=os.open(fifo,os.O_WRONLY|os.O_NONBLOCK)
                        except OSError:
                            self.assertLess(time.monotonic(),deadline);time.sleep(.005)
                    os.write(fd,decision.encode());os.close(fd);fd=None
                    out,err=child.communicate(timeout=2);self.assertEqual(child.returncode,expected);self.assertEqual(err,b'')
                    if expected==0:self.assertEqual(int(out),child.pid)
                    else:self.assertEqual(out,b'')
                finally:
                    if fd is not None:os.close(fd)
                    if child.poll() is None:child.kill();child.wait(timeout=2)

    def test_single_controller_keeps_final_plan_and_cleans_only_own_gate_on_failure(self):
        process={'pid':1,'linuxStartTicks':'10','linuxBootId':'a'*36}
        p={'runtimeConfiguration':{'path':'private','identity':{'inode':1}},'capacityFinalInput':{'path':'private-final','authority':{'path':'authority','sha256':'a'*64}},'limits':{'app':{'user':'10001:10001'}},'capacityHost':{'profile':{'hostFile':'profile'}}}
        gate={'hostFifo':'fifo','deadlineAt':int(time.time()*1000)+1000}
        spec={'Id':'own','Config':{'Entrypoint':['/bin/sh'],'Cmd':['-c','body'],'User':'10001:10001'},'HostConfig':{'Init':False},'Mounts':[{'Source':'fifo','Destination':D.CAPACITY_GATE_PATH,'RW':False}]}
        class Docker:
            def inspect(self,cid,seconds=3):return spec
            def run(self,args,timeout):return b''
        with patch.object(D,'capacity_gate_binding',return_value=gate),patch.object(D,'file_identity',return_value={'inode':1}),patch.object(D,'reference',return_value={}),patch.object(D,'create_capacity_gate_app',return_value='own'),patch.object(D,'capacity_gate_arguments',return_value=['entry','shell','image','-c','body']),patch.object(D,'capacity_process_tuple',return_value=process),patch.object(D,'wait_capacity_owner_final',side_effect=D.Refused('OWNER_DEADLINE')),patch.object(D,'capacity_gate_stop') as stop:
            # The controller does not return a detached provisional receipt on a missing/late approval.
            with self.assertRaises(D.Refused):D.run_capacity_gate_controller(p,Docker(),type('Journal',(),{'event':lambda *a,**k:None})())
            stop.assert_called_once_with(p,unittest.mock.ANY,'own')

    def test_actual_gate_container_builder_uses_only_fixed_bridge_and_readonly_inputs(self):
        p={'names':{'app':'app'},'networks':{'front':{'id':'front'},'data':{'id':'data'}},'limits':{'app':{'user':'10001:10001'}},
           'releaseDirectory':'/release','runtimeConfiguration':{'path':'/private/runtime'},'images':{'node':{'id':'image'}}}
        gate={'hostFifo':'/private/gate','shell':{'containerFile':'/bin/sh'},'nonce':'a'*64}
        class Docker:
            def __init__(self):self.calls=[]
            def run(self,args):self.calls.append(args);return ('f'*64).encode()
        docker=Docker()
        with patch.object(D,'capacity_host_binding'),patch.object(D,'capacity_gate_binding',return_value=gate),patch.object(D,'limits_args',return_value=[]),patch.object(D,'labels',return_value=[]),patch.object(D,'runtime_mount_arguments',return_value=['--mount','type=bind,src=/collector,dst=/collector,readonly']),patch.object(D,'runtime_entry_arguments',return_value=['--exact26-full','/run/naijue-rewrite/runtime.json']):
            cid=D.create_capacity_gate_app(p,docker)
        args=docker.calls[0];self.assertEqual(cid,'f'*64);self.assertNotIn('--init',args);self.assertEqual(args[args.index('--entrypoint')+1],'/bin/sh')
        for source in ('src=/release/payload','src=/private/runtime','src=/private/gate','src=/collector'):
            self.assertTrue(any(source in arg and arg.endswith(',readonly') for arg in args))
        self.assertEqual(docker.calls[1],['network','connect','data',cid]);self.assertNotIn(['start',cid],docker.calls)

    def test_selected_boot_hash_pins_exact_new_deploy(self):
        digest=hashlib.sha256((HERE/'deploy-candidate.py').read_bytes()).hexdigest()
        self.assertEqual(B.DEPLOYMENT_CAPACITY_SHA256,digest)

if __name__=='__main__':unittest.main()
