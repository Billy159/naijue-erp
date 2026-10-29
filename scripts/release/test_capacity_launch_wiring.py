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


# SOURCE943 transport/F01 increment only. Running this class does not replay the
# previously accepted FIFO or collector cases and never reads the real connection.
class CapacityTransportIncrement(unittest.TestCase):
    def setUp(self):
        import os
        self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name).resolve();self.root.chmod(0o700)
        ref=self.root/'release-connection.json'
        source=HERE/'ssh-control.py';self.C=types.ModuleType('synthetic_capacity_client');self.C.__file__=str(source)
        with patch.dict(os.environ,{'ERP_RELEASE_CONNECTION_REF':str(ref)}):exec(compile(source.read_bytes(),str(source),'exec'),self.C.__dict__)
        self.job='t45-synthetic-capacity-client';self.cfg={'grantId':'1'*16,'private':'/fixed-original-private','control':'/fixed-original-control','installed':'INSTALLED'}
        self.scope={'jobId':self.job,'taskId':'T45','grantId':'1'*16,'containerId':'c'*64,'sourceCommit':'a'*40,'helperSha256':'d'*64,
          'authority':{'path':'/fixed-original-private/jobs/'+self.job+'/bundle/capacity-input-authority.json','sha256':'e'*64},
          'deadlineAt':int(time.time()*1000)+60000,'process':{'pid':1,'linuxStartTicks':'123','linuxBootId':'0'*8+'-'+'0'*4+'-'+'0'*4+'-'+'0'*4+'-'+'0'*12},
          'targetFingerprint':'f'*64,'producerReviewSha256':'b'*64}
        self.jobs=self.root/'jobs';self.dir=self.jobs/self.job;self.dir.mkdir(parents=True,mode=0o700)
        self.C.JOB_ROOT=self.jobs;self.C.CONTROL=self.root
        history=self.root/'history.json';history.write_text(json.dumps({self.job:{'grantId':'1'*16,'request':{'taskId':'T45'}}}));self.C.HISTORY=history
        self.binding=self.dir/'binding.json';self.private_write(self.binding,{'format':'CAPACITY_FINAL_CLIENT_BINDING_V1','scope':self.scope})
        self.args=type('Args',(),dict(task='T45',job_id=self.job,binding=str(self.binding),action='capacity-final-deliver',phase='CONTENT',input=str(self.dir/'input.json')))()
    def tearDown(self):self.temp.cleanup()
    def private_write(self,path,value):
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(self.C.cap_json(value));path.chmod(0o600)
    def payload(self):
        root=self.root/'fixture';root.mkdir(mode=0o700)
        with patch.object(D,'ROOT',root):p,r=CapacityWiring().fixture(root)
        c=r['capacityLaunch'];profile=json.loads((root/'profile.json').read_text())
        fingerprint=hashlib.sha256(self.C.cap_json(c['target'])).hexdigest();self.scope['targetFingerprint']=fingerprint
        c['window']['binding']['targetFingerprint']=fingerprint;profile['binding']['targetFingerprint']=fingerprint
        c['window']['expiresAt']=self.scope['deadlineAt'];profile['expiresAt']=self.scope['deadlineAt']
        c['producer']['args']=['--profile='+hashlib.sha256(self.C.cap_json(profile)).hexdigest()]
        self.private_write(self.binding,{'format':'CAPACITY_FINAL_CLIENT_BINDING_V1','scope':self.scope})
        return {'capacityLaunch':c,'ownerProfile':profile}
    def status(self,ready=None):
        receipts={'gate-ready.json':{'scope':self.scope}}
        value={'jobId':self.job,'jobState':'RUNNING','status':'ORIGINAL_CAPACITY_CHANNEL_STATUS','receipts':receipts,'receiptSha256':{}}
        if ready:
            receipts['content-ready.json']=ready;value['receiptSha256']['content-ready.json']='9'*64
        return value
    def test_content_client_constructs_only_fixed_nonsecret_files_no_dispatch(self):
        from contextlib import redirect_stdout
        import io
        self.private_write(pathlib.Path(self.args.input),self.payload());calls=[]
        def channel(cfg,scope,action,phase=None,packet=None,content_ready_sha=None):
            self.assertEqual(scope,self.scope);calls.append((action,phase,packet));return self.status() if action=='status' else {'jobId':self.job,'status':'STAGED_FOR_ORIGINAL_ROOT_CONTROLLER_NOT_AUTHORIZED_OR_RELEASED'}
        with patch.object(self.C,'capacity_channel',side_effect=channel),patch.object(self.C,'dispatch',side_effect=AssertionError('no dispatcher')),patch.object(self.C,'remote',side_effect=AssertionError('no network')),redirect_stdout(io.StringIO()):self.C.capacity_final(self.cfg,self.args)
        packet=calls[1][2];self.assertEqual(set(packet['files']),set(self.C.CAPACITY_PHASE_FILES['CONTENT']));self.assertEqual(calls[0][0],'status')
        self.assertNotIn('postgres',json.loads(packet['files']['capacity-launch.json']['text']))
    def test_no_approval_without_actual_content_ready_or_external_c_reference(self):
        from contextlib import redirect_stdout
        import io
        self.args.phase='APPROVAL';self.private_write(pathlib.Path(self.args.input),{'approved':True})
        with patch.object(self.C,'capacity_channel',return_value=self.status()) as channel,redirect_stdout(io.StringIO()):
            with self.assertRaises(ValueError):self.C.capacity_final(self.cfg,self.args)
            self.assertEqual(channel.call_count,1)
    def test_existing_c_decision_must_bind_exact_ready_plan_and_identities(self):
        from contextlib import redirect_stdout
        import io
        self.args.phase='APPROVAL';identity={'device':1,'inode':1,'uid':1,'gid':1,'mode':0o600,'bytes':1,'mtimeNs':1,'ctimeNs':1}
        ready={'scope':self.scope,'finalPlanSha256':'8'*64,'finalRuntimeIdentity':identity,'finalProfileIdentity':identity}
        decision={'format':'C_APPROVED_CAPACITY_FINAL_PLAN_V1','scope':self.scope,'contentReadySha256':'9'*64,'finalPlanSha256':'8'*64,
                  'finalRuntimeIdentity':identity,'finalProfileIdentity':identity,'authority':self.scope['authority']}
        file=self.root/'reports/controller/rapid-launch-20261022/synthetic/C-CAPACITY-FINAL-APPROVAL.json';self.private_write(file,decision)
        self.private_write(pathlib.Path(self.args.input),{'decisionReference':{'sourcePath':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}})
        result=self.status(ready);calls=[]
        def channel(cfg,scope,action,phase=None,packet=None,content_ready_sha=None):
            calls.append((action,packet));return result if action=='status' else {'jobId':self.job,'status':'STAGED_ONLY'}
        with patch.object(self.C,'capacity_channel',side_effect=channel),redirect_stdout(io.StringIO()):self.C.capacity_final(self.cfg,self.args)
        self.assertEqual(set(calls[1][1]['files']),set(self.C.CAPACITY_PHASE_FILES['APPROVAL']))
        decision['finalPlanSha256']='7'*64;self.private_write(file,decision)
        self.private_write(pathlib.Path(self.args.input),{'decisionReference':{'sourcePath':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}})
        with patch.object(self.C,'capacity_channel',return_value=result) as channel,redirect_stdout(io.StringIO()):
            with self.assertRaises(ValueError):self.C.capacity_final(self.cfg,self.args)
            self.assertEqual(channel.call_count,1)
    def test_foreign_scope_expiry_paths_link_secret_and_unknown_result_refuse(self):
        import os,io
        from contextlib import redirect_stdout
        for change in [lambda x:x.update(jobId='foreign'),lambda x:x.update(containerId='bad'),lambda x:x.update(deadlineAt=1),lambda x:x['authority'].update(path='/arbitrary')]:
            v=copy.deepcopy(self.scope);change(v)
            with self.assertRaises(ValueError):self.C.cap_scope(v,self.cfg,self.job)
        payload=self.payload();payload['capacityLaunch']['target']['password']='do-not-upload'
        with self.assertRaises(ValueError):self.C.cap_content(payload,self.scope)
        with self.assertRaises(ValueError):self.C.cap_json_read(b'{"x":1,"x":2}')
        with self.assertRaises(ValueError):self.C.cap_json_read(b'{"x":NaN}')
        with self.assertRaises(ValueError):self.C.capacity_packet('CONTENT',self.scope,{'arbitrary-path':b'{}'})
        linked=self.dir/'link';linked.symlink_to(self.binding)
        with self.assertRaises(ValueError):self.C.cap_local_file(linked,self.job)
        hard=self.dir/'hard';os.link(self.binding,hard)
        with self.assertRaises(ValueError):self.C.cap_local_file(hard,self.job)
        hard.unlink()
        with patch.object(self.C,'capacity_channel',return_value={'jobId':self.job,'jobState':'UNKNOWN','status':'READ_ORIGINAL_RECEIPT_NO_DELIVERY'}) as channel,redirect_stdout(io.StringIO()):
            self.C.capacity_final(self.cfg,self.args);self.assertEqual(channel.call_count,1)
    def test_boot_consumes_three_final_stage_fields_and_exact_relocation(self):
        ref={'path':'/original/final-plan.json','sha256':'a'*64};dp={'runtimeConfiguration':{'identity':{'inode':1}},'capacityHost':{'profile':'owner'}}
        stage={'capacityFinalPlan':ref,'capacityFinalRuntimeIdentity':{'inode':1},'capacityProducer':{'profile':'owner'}};p={'deploymentPlan':ref}
        self.assertTrue(B.capacity_stage_binding(p,dp,stage))
        for key in stage:
            bad=copy.deepcopy(stage);bad[key]={}
            with self.assertRaises(B.Refused):B.capacity_stage_binding(p,dp,bad)
            bad=copy.deepcopy(stage);del bad[key]
            with self.assertRaises(B.Refused):B.capacity_stage_binding(p,dp,bad)
        installed={'deploymentPlan':{'path':'/owner/deployment-plan.json','sha256':'a'*64},'originalReferences':{'deploymentPlan':ref}}
        with patch.object(B,'owner_root',return_value=pathlib.Path('/owner')):
            self.assertTrue(B.capacity_stage_binding(installed,dp,stage))
            installed['deploymentPlan']['path']='/wrong/copy'
            with self.assertRaises(B.Refused):B.capacity_stage_binding(installed,dp,stage)
    def test_submitted_document_is_not_a_trusted_final_approval(self):
        scope=self.scope;identity={'inode':1};ready={'finalPlanSha256':'a'*64,'finalRuntimeIdentity':identity,'finalProfileIdentity':identity}
        decision={'format':'C_APPROVED_CAPACITY_FINAL_PLAN_V1','scope':scope,'contentReadySha256':'b'*64,'finalPlanSha256':'a'*64,
                  'finalRuntimeIdentity':identity,'finalProfileIdentity':identity,'authority':scope['authority']}
        reference={'sourcePath':'/local/C-CAPACITY-FINAL-APPROVAL.json','sha256':D.digest(D.encoded(decision))}
        approval={'format':'CAPACITY_APPROVED_DELIVERY_V1','scope':scope,'decisionReference':reference,'decision':decision,'contentReadySha256':'b'*64,'finalPlanSha256':'a'*64}
        with self.assertRaisesRegex(D.Refused,'ORIGINAL_FINAL_INPUT_AUTHORITY'):D.capacity_verify_final_decision({},scope,ready,'b'*64,approval)
        self.assertTrue(D.capacity_verify_final_decision({},scope,ready,'b'*64,approval,D._CAPACITY_ORIGINAL_OWNER_PROOF))
        approval['decision']['finalPlanSha256']='c'*64
        with self.assertRaises(D.Refused):D.capacity_verify_final_decision({},scope,ready,'b'*64,approval,D._CAPACITY_ORIGINAL_OWNER_PROOF)

    def test_actual_client_packet_consumed_once_by_original_bounded_reader(self):
        payload=self.payload();files=self.C.cap_content(payload,self.scope)
        files['content-manifest.json']=self.C.cap_json({'format':'CAPACITY_CONTENT_MANIFEST_V1','scope':self.scope,
            'files':{n:{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()} for n,raw in files.items()}})
        packet=self.C.capacity_packet('CONTENT',self.scope,files);directory=self.root/'control';directory.mkdir(mode=0o700)
        for name,raw in files.items():self.private_write(directory/name,self.C.cap_json_read(raw))
        marker=directory/'content.complete';marker.write_bytes(packet['requestSha256'].encode());marker.chmod(0o600)
        class Docker:
            def inspect(self,cid,seconds=3):return {'Id':cid,'State':{'Running':True}}
        import os
        observed,sha=D.capacity_wait_control_packet({},Docker(),self.scope['containerId'],directory,os.getuid(),'CONTENT',self.scope,time.monotonic()+1)
        self.assertEqual(observed,files);self.assertEqual(sha,packet['requestSha256'])
        marker.write_bytes(b'0'*64)
        with self.assertRaises(D.Refused):D.capacity_wait_control_packet({},Docker(),self.scope['containerId'],directory,os.getuid(),'CONTENT',self.scope,time.monotonic()+1)
        compile(self.C.CAPACITY_REMOTE.replace('CONTEXT_LITERAL',repr({'scope':self.scope,'control':'/fixed','action':'status'}),1),'fixed-remote-program','exec')

    def test_content_root_copy_preserves_private_runtime_and_inodes_without_exporting_credentials(self):
        root=self.root/'rootphase';root.mkdir(mode=0o700)
        with patch.object(D,'ROOT',root):
            p,r=CapacityWiring().fixture(root);c=r['capacityLaunch'];profile=json.loads((root/'profile.json').read_text())
            fingerprint=D.digest(D.encoded(c['target']));c['window']['binding']['targetFingerprint']=fingerprint;profile['binding']['targetFingerprint']=fingerprint
            c['producer']['args']=['--profile='+D.digest(D.encoded(profile))]
            path=root/'runtime.json';original={'postgres':r['postgres'],'authentication':{'password':'synthetic-private-only'}}
            path.write_bytes(D.encoded(original));path.chmod(0o600);before=D.file_identity(path);profile_before=D.file_identity(root/'profile.json')
            p['runtimeConfiguration']={'path':str(path),'identity':before};private=root/'inputs-private';private.mkdir(mode=0o700)
            scope={'process':c['process'],'targetFingerprint':fingerprint,'sourceCommit':p['sourceCommit'],'deadlineAt':c['window']['expiresAt']}
            final,ref=D.capacity_install_content(p,scope,{'capacity-launch.json':D.encoded(c),'owner-profile.json':D.encoded(profile)},before,profile_before,private)
            after=D.json_file(path,private=True);self.assertEqual(after['authentication'],original['authentication']);self.assertEqual(before['inode'],D.file_identity(path)['inode'])
            self.assertEqual(profile_before['inode'],D.file_identity(root/'profile.json')['inode']);self.assertEqual(final['runtimeConfiguration']['identity'],D.file_identity(path))
            self.assertNotIn(b'synthetic-private-only',pathlib.Path(ref['path']).read_bytes())
            self.assertNotIn('authentication',final)

    def test_existing_root_grant_frozen_manifest_and_control_owner_are_actual_authority(self):
        import os
        base=self.root/'existing-authority';grant_id=self.cfg['grantId'];job_id=self.job
        private=base/'private'/('grant-'+grant_id)/'jobs'/job_id;control=base/'control'/('grant-'+grant_id)/'jobs'/job_id
        for f in [private,private/'bundle',control,control/'capacity-final']:f.mkdir(parents=True,exist_ok=True,mode=0o700);f.chmod(0o700)
        target={'host':'isolated','port':5432,'database':'isolated','role':'runtime','databaseOid':'1','postmasterStart':'actual-synthetic'}
        authority={'format':'OWNER_CAPACITY_FINAL_INPUT_AUTHORITY_V1','jobId':job_id,'operationId':'one','buildId':'fixed','sourceCommit':'a'*40,
                   'archiveSha256':'2'*64,'target':target,'deadlineAt':self.scope['deadlineAt'],'controlOwnerUid':0,'action':'ONE_FINAL_CAPACITY_PLAN_ONLY'}
        authority_file=private/'bundle/capacity-input-authority.json';self.private_write(authority_file,authority)
        ref={'path':str(authority_file),'sha256':D.digest(authority_file.read_bytes())}
        scope=copy.deepcopy(self.scope);scope.update(authority=ref,targetFingerprint=D.digest(D.encoded(target)),helperSha256=D.file_hash(pathlib.Path(D.__file__)))
        helper=private/'bundle/deploy-candidate.py';helper.write_bytes(pathlib.Path(D.__file__).read_bytes());helper.chmod(0o600)
        manifest={'jobId':job_id,'taskId':'T45','files':[{'name':'capacity-input-authority.json','sha256':ref['sha256']},{'name':'deploy-candidate.py','sha256':scope['helperSha256']}]}
        self.private_write(private/'bundle/bundle-manifest.json',manifest)
        self.private_write(private/'request.json',{'jobId':job_id,'taskId':'T45','grantId':grant_id,'scope':'ERP_EXISTING_TASKS_THROUGH_T51','manifestSha256':D.digest((private/'bundle/bundle-manifest.json').read_bytes())})
        self.private_write(control.parent.parent/'results'/(job_id+'.json'),{'status':'RUNNING','jobId':job_id,'taskId':'T45','grantId':grant_id})
        grant_file=base/'grant.json';grant={'grantId':grant_id,'scope':'ERP_EXISTING_TASKS_THROUGH_T51','revoked':False,'expiresAtEpoch':time.time()+120,
            'private':str(private.parent.parent),'control':str(control.parent.parent),'user':'synthetic-original-owner','humanAuthorization':{'sourceChat':'01a0f6f9-0e2f-7be0-b410-2001c6f81356'}}
        self.private_write(grant_file,grant);original_canonical=D.canonical;original_stat=pathlib.Path.stat
        def canonical(value,*args,**kwargs):
            if str(value).startswith('/usr/local/lib/naijue-erp-night/'):return grant_file
            return original_canonical(value,*args,**kwargs)
        def metadata(path,*args,**kwargs):
            value=original_stat(path,*args,**kwargs)
            if path==grant_file or path==private or path.is_relative_to(private):
                fields=list(value);fields[4]=0;return os.stat_result(fields)
            return value
        account=type('Account',(),{'pw_uid':os.getuid(),'pw_gid':os.getgid()})()
        plan={'operationId':'one','buildId':'fixed'}
        with patch.dict(os.environ,{'ERP_SHARED_TASK_ID':'T45','ERP_SHARED_JOB_DIR':str(private),'ERP_SHARED_CONTROL_DIR':str(control)}),patch.object(D.os,'geteuid',return_value=0),patch.object(D,'canonical',side_effect=canonical),patch.object(pathlib.Path,'stat',metadata),patch.object(D.pwd,'getpwnam',return_value=account):
            proof=D.capacity_original_owner_authority(plan,scope,control/'capacity-final',authority,ref)
            self.assertIs(proof,D._CAPACITY_ORIGINAL_OWNER_PROOF)
            grant['revoked']=True;self.private_write(grant_file,grant)
            with self.assertRaisesRegex(D.Refused,'ACTIVE_HUMAN_GRANT'):D.capacity_original_owner_authority(plan,scope,control/'capacity-final',authority,ref)
            grant['revoked']=False;self.private_write(grant_file,grant)
            bad=copy.deepcopy(scope);bad['helperSha256']='0'*64
            with self.assertRaises(D.Refused):D.capacity_original_owner_authority(plan,bad,control/'capacity-final',authority,ref)

if __name__=='__main__':unittest.main()
