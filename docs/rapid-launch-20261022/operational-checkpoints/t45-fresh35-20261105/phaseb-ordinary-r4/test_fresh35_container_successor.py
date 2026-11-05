"""Offline model only. No Docker/HTTP/SSH/PG or privileged filesystem action."""
import importlib.util,io,json,hashlib,os,stat,subprocess,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch

FILE=Path(__file__).with_name('fresh35-container-successor.py')
class Tests(unittest.TestCase):
 def setUp(self):
  sp=importlib.util.spec_from_file_location('successor',FILE);self.m=importlib.util.module_from_spec(sp);sp.loader.exec_module(self.m);self.m.SOURCE='a'*64;self.m.KEY='synthetic-model-app';self.m.ARCHIVE_SHA='b'*64;self.m.ARCHIVE_BYTES=10;self.m.FILE_COUNT=2;self.m.MANIFEST_SHA='d'*64
  self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup);self.tmp=Path(self.t.name).resolve();self.m.ROOT=self.tmp/'new-root';self.plan={'operationId':'synthetic-model','imagePreparationExpiresAt':int(time.time()*1000)+120000,'stagingAuthoritySha256':'c'*64}
  self.block=patch.object(self.m,'run',side_effect=AssertionError('EXTERNAL_COMMAND_FORBIDDEN'));self.block.start();self.addCleanup(self.block.stop)
 def setup_root(self):
  self.m.ROOT.mkdir();return self.m.ROOT
 def info(self):
  m=self.m
  return {'id':'d'*64,'name':'/'+m.NAME,'image':self.m.ENV_IMAGE,'running':True,'labels':{'t45.operation':self.plan['operationId'],'t45.source':m.SOURCE},'network':'none','ports':{},'user':'0:0','readonly':True,'pidMode':'','ipcMode':'private','usernsMode':'','memory':3*1024**3,'swap':3*1024**3,'cpu':2000000000,'pids':256,'caps':['CHOWN','DAC_OVERRIDE','SETUID','SETGID','KILL','SYS_PTRACE'],'capDrop':['ALL'],'security':['no-new-privileges'],'privileged':False,'devices':[],'restart':'no','shm':64*1024**2,'tmpfs':{'/tmp':'rw,noexec,nosuid,nodev,size=64m'},'mounts':[{'Type':'bind','Source':str(m.ROOT/n),'Destination':dst,'RW':rw} for n,dst,rw in [('deploy',m.DEPLOY,False),('authority','/etc/naijue-erp',True),('state',m.STATE,True),('deploy/runtime/node/bin/node','/usr/local/bin/node',False),('state/capacity/owner-profile.json',m.CAPACITY_PROFILE,False)]]}
 def receipt(self):return {'cid':'d'*64,'image':self.m.ENV_IMAGE,'operationId':self.plan['operationId'],'expiresAt':int(time.time()*1000)+120000}
 def test_import_inert_and_command_scope(self):
  a=self.m.common(self.m.ENV_IMAGE,100,self.plan['operationId']);self.assertIn('--network',a);self.assertIn('none',a);self.assertNotIn('--privileged',a);self.assertNotIn('--init',a);self.assertNotIn('--rm',a);self.assertNotIn('--publish',a);self.assertEqual(a[-5:],['--signal=TERM','--kill-after=3s','100','/usr/bin/sleep','infinity'])
  with self.assertRaisesRegex(ValueError,'WINDOW_TOO_SHORT'):self.m.common(self.m.ENV_IMAGE,90,'op')
 def test_owned_exact_and_mutated_cases(self):
  good=self.info();self.m.owned(good,self.receipt(),self.plan)
  for field,bad in [('id','x'),('image','sha256:x'),('network','host'),('ports',{'5432/tcp':[]}),('user','999:999'),('memory',1),('pidMode','host'),('caps',['ALL']),('privileged',True),('tmpfs',{}),('security',['seccomp=unconfined'])]:
   with self.subTest(field=field),self.assertRaises(ValueError):self.m.owned({**good,field:bad},self.receipt(),self.plan)
 def test_configuration_not_generated_and_missing_execute_refuses(self):
  with patch('sys.argv',['successor','--phase','materialize-app','--plan','/no-plan','--plan-sha256','a'*64]),self.assertRaisesRegex(ValueError,'EXECUTION_NOT_REQUESTED'):self.m.main()
 def test_external_inputs_only_original_job_bundle(self):
  with patch.dict(os.environ,{'ERP_SHARED_JOB_DIR':str(self.tmp/'job')}):
   self.assertEqual(self.m.job_input(self.tmp/'job/bundle/provision.json'),self.tmp/'job/bundle/provision.json')
   for p in [self.tmp/'outside.json',Path('/etc/shadow')]:
    with self.assertRaisesRegex(ValueError,'EXACT_JOB_INPUT'):self.m.job_input(p)
 def test_materialization_regular_files_and_traversable_authority(self):
  files={'deploy/code.py':b'public','metadata/deployment-manifest.json':b'{}'};modes={x:0o644 for x in files}
  with patch.object(self.m,'archive_files',return_value=(files,modes,{'packages':[]})),patch.object(self.m,'trusted',side_effect=lambda p,*a:Path(p)):
   self.m.materialize(self.plan,b'model')
  self.assertEqual((self.m.ROOT/'deploy/code.py').read_bytes(),b'public');self.assertEqual(stat.S_IMODE((self.m.ROOT/'authority').stat().st_mode),0o711);self.assertEqual(stat.S_IMODE((self.m.ROOT/'authority/fresh35-isolated-deployment-v1.json').stat().st_mode),0o400)
  with patch.object(self.m,'archive_files',return_value=(files,modes,{})),patch.object(self.m,'trusted',side_effect=lambda p,*a:Path(p)),self.assertRaises(FileExistsError):self.m.materialize(self.plan,b'model')
 def test_new_file_exclusive_and_modes_survive_umask(self):
  old=os.umask(0o077)
  try:self.m.new_file(self.tmp/'public',b'x',0o644)
  finally:os.umask(old)
  self.assertEqual(stat.S_IMODE((self.tmp/'public').stat().st_mode),0o644)
  with self.assertRaises(FileExistsError):self.m.new_file(self.tmp/'public',b'y')
  self.assertEqual((self.tmp/'public').read_bytes(),b'x')
 def fake_state(self,source_result=None):
  root=self.setup_root();(root/'state'/self.m.WORK).mkdir(parents=True);r=self.receipt();(root/'container-receipt.json').write_text(json.dumps(r))
  if source_result is not None:(root/'state'/self.m.WORK/'result.json').write_text(json.dumps(source_result))
  return r
 def read_local(self,p,*a,**k):return Path(p).read_bytes()
 def test_live_pending_observe_no_stop_or_pass(self):
  self.fake_state()
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value=self.info()):r=self.m.observation(self.plan,wait=False)
  self.assertEqual(r['status'],'WAITING_ORIGINAL_LAUNCHER');self.assertFalse(r['containerStopped'])
 def test_failed_result_owned_stop_does_not_mean_clean(self):
  self.fake_state({'state':'FAILED_OR_CLEANUP_UNCONFIRMED','cleanup':{'cleanupComplete':False}});info=self.info()
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',side_effect=[info,{**info,'running':False}]),patch.object(self.m,'run',return_value=b'') as call:r=self.m.observation(self.plan,wait=False)
  self.assertEqual(call.call_args.args[0],['docker','stop','--time','3','d'*64]);self.assertEqual(r['status'],'FAILED_OR_UNKNOWN_PRESERVED_NO_REPLAY');self.assertTrue(r['containerStopped']);self.assertFalse(r['sourceResult']['cleanup']['cleanupComplete'])
 def test_wrong_owned_cid_never_stopped(self):
  self.fake_state({'state':'UNKNOWN'});info={**self.info(),'id':'wrong'}
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value=info),self.assertRaisesRegex(ValueError,'OWNERSHIP_DIFFERS'):self.m.observation(self.plan,wait=False)
 def test_actual_source_success_and_stopped_required_for_scoped_pass(self):
  self.fake_state({'state':'ISOLATED_INSTALL_HOST_AND_SYNTHETIC_IMPORT_VERIFIED_AND_STOPPED','syntheticImportVerified':True,'independentSnapshotsVerified':True,'ordinaryBusinessVerified':True,'productionVerified':False,'recordPublished':True,'businessVerified':False,'cleanup':{'cleanupComplete':True}})
  work=self.m.ROOT/'state'/self.m.WORK;program={'sourceSetSha256':self.m.SOURCE,'programSha256':'b'*64,'targetSha256':'c'*64}
  (work/'program-description.json').write_text(json.dumps(program));(work/'ordinary-result.json').write_text(json.dumps({**program,'state':'FRESH35_ORDINARY_RUNNER_COMPLETED','connectionCleanup':'CLOSED','syntheticOnly':True}));(work/'ordinary-child-cleanup.json').write_text('{"childReaped":true}')
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value={**self.info(),'running':False}):r=self.m.observation(self.plan,wait=False)
  self.assertEqual(r['status'],'PASS_SCOPED_SYNTHETIC_AND_CLEANUP')
  (work/'ordinary-result.json').write_text(json.dumps({**program,'sourceSetSha256':'f'*64,'state':'FRESH35_ORDINARY_RUNNER_COMPLETED','connectionCleanup':'CLOSED','syntheticOnly':True}))
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value={**self.info(),'running':False}):r=self.m.observation(self.plan,wait=False)
  self.assertEqual(r['status'],'FAILED_OR_UNKNOWN_PRESERVED_NO_REPLAY')
 def test_provision_wrong_target_and_expired_rejected(self):
  now=int(time.time()*1000);good={'format':'FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1','decision':'AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT','proposal':self.m.PROPOSAL,'sourceSetSha256':self.m.SOURCE,'deploymentManifestSha256':self.m.MANIFEST_SHA,'postgresUid':61035,'postgresGid':61035,'independentSafetyReviewSha256':'a'*64,'authorizationReference':'offline fixture','startsAt':now-1000,'expiresAt':now+600000}
  for change in [{'proposal':{'database':'erp_prod'}},{'postgresUid':0},{'expiresAt':now-1},{'expiresAt':now+1200001}]:
   b=json.dumps({**good,**change}).encode()
   with patch.object(self.m,'job_input',side_effect=lambda p:p),patch.object(self.m,'read_file',return_value=b),self.assertRaises(ValueError):self.m.provision_input('fixture',hashlib.sha256(b).hexdigest())
 def fixture_archive(self,mutate=None,manifest_bytes=None,empty_member=False):
  import tarfile
  m=self.m;files={'deploy/code.py':b'public','deploy/extra.txt':b'' if empty_member else b'text'};manifest={'format':'FRESH35_ISOLATED_DEPLOYMENT_V1','files':[{'path':k.removeprefix('deploy/'),'sha256':hashlib.sha256(v).hexdigest()} for k,v in files.items()]};raw=json.dumps(manifest).encode();raw=raw+b' '*max(0,(manifest_bytes or len(raw))-len(raw));lock=b'{"packages":[]}'
  files.update({'metadata/deployment-manifest.json':raw,'metadata/source-descriptor.json':json.dumps({'sourceSetSha256':m.SOURCE}).encode(),'metadata/base-image-registry-result.json':json.dumps({'immutableBase':m.BASE}).encode(),'metadata/debian-runtime-dependency-lock.json':lock});m.MANIFEST_SHA=hashlib.sha256(raw).hexdigest();m.LOCK_SHA=hashlib.sha256(lock).hexdigest();m.FILE_COUNT=2
  stream=io.BytesIO()
  with tarfile.open(fileobj=stream,mode='w:gz') as t:
   for k,v in files.items():
    x=tarfile.TarInfo(k);x.size=len(v);x.mode=0o644
    if mutate:mutate(x)
    t.addfile(x,io.BytesIO(v))
  return stream.getvalue(),files

 def environment_fixture(self):
  m=self.m;receipt={'image':m.ENV_IMAGE,'base':m.BASE,'operationId':m.ENV_OPERATION,'sourceSet':m.ENV_SOURCE,'archive':m.ENV_ARCHIVE_SHA,'standardAPTAndLddBuildExitZero':True,'offlineArchive':'19739f1489ea6a3a4bb8ce7a8529e422235c306b6593904ce56f54aa4d200342','localOCIContext':True,'exactFiveDowngrades':True}
  raw=json.dumps(receipt).encode();recipe=b'synthetic exact-five recipe';m.ENV_RECEIPT_SHA=hashlib.sha256(raw).hexdigest();m.ENV_RECIPE_SHA=hashlib.sha256(recipe).hexdigest()
  def read(path,*args,**kwargs):return raw if path.name=='image-receipt.json' else recipe
  return receipt,read
 def test_environment_receipt_keeps_old_source_but_app_uses_current(self):
  m=self.m;receipt,read=self.environment_fixture()
  self.assertNotEqual(m.ENV_SOURCE,m.SOURCE);self.assertNotEqual(m.ENV_OPERATION,self.plan['operationId'])
  actual={'id':m.ENV_IMAGE,'os':'linux','arch':'amd64'}
  with patch.object(m,'read_file',side_effect=read),patch.object(m,'run',return_value=json.dumps(actual).encode()) as run:
   self.assertEqual(m.environment_image(),receipt)
  self.assertEqual(run.call_count,1);self.assertEqual(run.call_args.args[0][:3],['docker','image','inspect']);self.assertEqual(run.call_args.args[0][-1],m.ENV_IMAGE)
  self.assertEqual(m.application_receipt(self.plan)['sourceSet'],m.SOURCE);self.assertEqual(m.application_receipt(self.plan)['environmentImage'],m.ENV_IMAGE)
 def test_wrong_environment_receipt_recipe_or_actual_image_refused(self):
  m=self.m;receipt,read=self.environment_fixture()
  with patch.object(m,'read_file',return_value=b'changed'),self.assertRaisesRegex(ValueError,'ENVIRONMENT_RECEIPT_DIFFERS'):m.environment_image()
  with patch.object(m,'read_file',side_effect=lambda p,*a,**k:read(p) if p.name=='image-receipt.json' else b'changed'),self.assertRaisesRegex(ValueError,'ENVIRONMENT_RECIPE_DIFFERS'):m.environment_image()
  for actual in [{'id':'sha256:'+'f'*64,'os':'linux','arch':'amd64'},{'id':m.ENV_IMAGE,'os':'linux','arch':'arm64'}]:
   with patch.object(m,'read_file',side_effect=read),patch.object(m,'run',return_value=json.dumps(actual).encode()),self.assertRaisesRegex(ValueError,'ACTUAL_ENVIRONMENT_IMAGE_DIFFERS'):m.environment_image()
 def test_unfrozen_final_app_refuses_before_root_or_command(self):
  for name in ['SOURCE','ARCHIVE_SHA','MANIFEST_SHA','ARCHIVE_BYTES','FILE_COUNT','KEY']:
   with patch.object(self.m,name,None),self.assertRaisesRegex(ValueError,'FINAL_APPLICATION_NOT_FROZEN'):self.m.materialize_application(self.plan)
  self.assertFalse(self.m.ROOT.exists())
 def test_readonly_mount_new_app_path_and_no_image_build_or_load_commands(self):
  m=self.m;a=m.common(m.ENV_IMAGE,100,self.plan['operationId']);joined=' '.join(a)
  self.assertIn('src='+str(m.ROOT/'deploy')+',dst='+m.DEPLOY+',readonly',joined);self.assertIn('t45.source='+m.SOURCE,joined)
  self.assertNotIn(str(m.ENV_ROOT/'deploy'),joined);self.assertNotIn('node_modules',joined)
  with self.assertRaisesRegex(ValueError,'ENVIRONMENT_IMAGE_DIFFERS'):m.common('sha256:'+'e'*64,100,self.plan['operationId'])
  self.assertFalse(hasattr(m,'prepare_image'));self.assertFalse(hasattr(m,'offline_load_image'));self.assertFalse(hasattr(m,'build_exact_five_downgrades'))
 def test_materialize_preserves_env_and_rejects_modified_current_closure(self):
  m=self.m;archive,files=self.fixture_archive()
  m.ARCHIVE_SHA=hashlib.sha256(archive).hexdigest();m.ARCHIVE_BYTES=len(archive)
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)),patch.object(m,'read_file',side_effect=self.read_local):
   m.materialize(self.plan,archive);m.verify_materialized_application(self.plan)
   self.assertEqual(json.loads((m.ROOT/'prepare-started.json').read_text()),m.application_receipt(self.plan))
   (m.ROOT/'deploy/code.py').write_bytes(b'modified')
   with self.assertRaisesRegex(ValueError,'CURRENT_APPLICATION_CLOSURE_DIFFERS'):m.verify_materialized_application(self.plan)
  self.assertFalse((m.ROOT/'image-context').exists());self.assertFalse((m.ROOT/'image-receipt.json').exists())
 def test_manifest_current_size_and_two_mib_boundary(self):
  m=self.m
  for size in [1084128,2*1024*1024]:
   with self.subTest(bytes=size):
    m.ROOT=self.tmp/str(size);archive,_=self.fixture_archive(manifest_bytes=size)
    self.assertEqual(len(m.archive_files(archive)[0]['metadata/deployment-manifest.json']),size)
    with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
     m.materialize(self.plan,archive);m.verify_materialized_application(self.plan)
 def test_manifest_over_two_mib_rejected_for_both_copies(self):
  m=self.m
  for copy in ['metadata/deployment-manifest.json','authority/fresh35-isolated-deployment-v1.json']:
   with self.subTest(copy=copy):
    m.ROOT=self.tmp/copy.split('/')[0];archive,_=self.fixture_archive(manifest_bytes=1084128)
    with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
     m.materialize(self.plan,archive)
     path=m.ROOT/copy;path.chmod(0o600);path.write_bytes(path.read_bytes()+b' '*(2*1024*1024+1-path.stat().st_size))
     with self.assertRaisesRegex(ValueError,'BOUNDED_REGULAR_FILE_REQUIRED'):m.verify_materialized_application(self.plan)
 def test_large_manifest_digest_mismatch_still_rejected(self):
  m=self.m;archive,_=self.fixture_archive(manifest_bytes=1084128)
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
   m.materialize(self.plan,archive);path=m.ROOT/'metadata/deployment-manifest.json';path.write_bytes(path.read_bytes()+b' ')
   with self.assertRaisesRegex(ValueError,'CURRENT_APPLICATION_MANIFEST_DIFFERS'):m.verify_materialized_application(self.plan)
 def test_large_manifest_format_mismatch_still_rejected(self):
  m=self.m;archive,_=self.fixture_archive(manifest_bytes=1084128)
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
   m.materialize(self.plan,archive);path=m.ROOT/'metadata/deployment-manifest.json';raw=path.read_bytes().replace(b'FRESH35_ISOLATED_DEPLOYMENT_V1',b'WRONG_FORMAT');path.write_bytes(raw);m.MANIFEST_SHA=hashlib.sha256(raw).hexdigest()
   (m.ROOT/'prepare-started.json').write_text(json.dumps(m.application_receipt(self.plan)))
   with self.assertRaisesRegex(ValueError,'CURRENT_APPLICATION_MANIFEST_FORMAT'):m.verify_materialized_application(self.plan)
 def empty_materialization(self):
  archive,_=self.fixture_archive(empty_member=True)
  self.m.materialize(self.plan,archive)
  return self.m.ROOT/'deploy/extra.txt'
 def test_manifest_registered_empty_member_final_verification(self):
  m=self.m
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
   self.empty_materialization();m.verify_materialized_application(self.plan)
 def test_empty_member_nonempty_content_still_rejected(self):
  m=self.m
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
   p=self.empty_materialization();p.write_bytes(b'x')
   with self.assertRaisesRegex(ValueError,'CURRENT_APPLICATION_CLOSURE_DIFFERS'):m.verify_materialized_application(self.plan)
 def test_empty_member_wrong_mode_or_links_rejected(self):
  m=self.m
  for kind in ['mode','hardlink','symlink']:
   with self.subTest(kind=kind):
    m.ROOT=self.tmp/kind
    with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
     p=self.empty_materialization()
     if kind=='mode':p.chmod(0o755)
     elif kind=='hardlink':os.link(p,self.tmp/'extra-link')
     else:p.unlink();p.symlink_to(self.tmp/'empty-target');(self.tmp/'empty-target').write_bytes(b'')
     with self.assertRaises((ValueError,OSError)):m.verify_materialized_application(self.plan)
 def test_empty_reader_rejects_unregistered_and_private_paths(self):
  m=self.m
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
   p=self.empty_materialization()
   with self.assertRaisesRegex(ValueError,'EMPTY_APPLICATION_MEMBER_NOT_REGISTERED'):m.read_application_member(p,{})
   private=m.ROOT/'private.json';private.write_bytes(b'')
   with self.assertRaisesRegex(ValueError,'APPLICATION_MEMBER_SCOPE_REQUIRED'):m.read_application_member(private,{'private.json':hashlib.sha256(b'').hexdigest()})
   with self.assertRaisesRegex(ValueError,'BOUNDED_REGULAR_FILE_REQUIRED'):m.read_file(private,65536,True)
 def test_empty_reader_path_replacement_rejected(self):
  m=self.m
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
   p=self.empty_materialization();original=os.read
   def changed(fd,n):
    out=original(fd,n);replacement=p.with_name('replacement');replacement.write_bytes(b'');replacement.chmod(0o644);os.replace(replacement,p);return out
   with patch.object(m.os,'read',side_effect=changed),self.assertRaisesRegex(ValueError,'APPLICATION_MEMBER_CHANGED'):m.read_application_member(p,{'extra.txt':hashlib.sha256(b'').hexdigest()})
 def partial_materialization(self):
  m=self.m;archive,_=self.fixture_archive(empty_member=True);write=m.new_file
  def interrupted(path,data,mode=0o600):
   if path==m.ROOT/'deploy/extra.txt':raise InterruptedError('synthetic interruption')
   return write(path,data,mode)
  with patch.object(m,'new_file',side_effect=interrupted),self.assertRaises(InterruptedError):m.materialize(self.plan,archive)
  return archive
 def test_remaining_materialization_only_writes_missing_and_final_verifies(self):
  m=self.m
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
   archive=self.partial_materialization();existing=m.ROOT/'deploy/code.py';marker=m.ROOT/'prepare-started.json';before=(existing.stat().st_ino,existing.read_bytes(),marker.stat().st_ino,marker.read_bytes())
   verify=m.verify_materialized_application
   with patch.object(m,'new_file',wraps=m.new_file) as write,patch.object(m,'verify_materialized_application',wraps=verify) as checked:result=m.materialize_remaining(self.plan,archive)
   self.assertEqual(result['existingExactFilesReused'],2);self.assertEqual(result['missingFilesWritten'],7);self.assertEqual(result['existingFilesOverwritten'],0);self.assertEqual(checked.call_count,1)
   self.assertNotIn(existing,[x.args[0] for x in write.call_args_list]);self.assertNotIn(marker,[x.args[0] for x in write.call_args_list]);self.assertEqual(before,(existing.stat().st_ino,existing.read_bytes(),marker.stat().st_ino,marker.read_bytes()))
 def test_remaining_rejects_existing_mismatch_before_any_write(self):
  m=self.m
  for kind in ['content','mode','hardlink','unexpected-file','unexpected-directory','marker']:
   with self.subTest(kind=kind):
    m.ROOT=self.tmp/kind
    with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
     archive=self.partial_materialization();p=m.ROOT/'deploy/code.py'
     if kind=='content':p.write_bytes(b'unknown content')
     elif kind=='mode':p.chmod(0o600)
     elif kind=='hardlink':os.link(p,self.tmp/'hardlink-outside')
     elif kind=='unexpected-file':(m.ROOT/'deploy/unexpected').write_bytes(b'x')
     elif kind=='unexpected-directory':(m.ROOT/'deploy/unexpected').mkdir()
     else:(m.ROOT/'prepare-started.json').write_text('{}')
     with patch.object(m,'new_file',wraps=m.new_file) as write,self.assertRaises(ValueError):m.materialize_remaining(self.plan,archive)
     self.assertEqual(write.call_count,0);self.assertFalse((m.ROOT/'metadata').exists())
 def test_remaining_reuses_exact_authority_and_empty_profile_inode(self):
  m=self.m;archive,_=self.fixture_archive(empty_member=True)
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
   m.materialize(self.plan,archive);profile=m.ROOT/'state/capacity/owner-profile.json';authority=m.ROOT/'authority/fresh35-isolated-deployment-v1.json';before=(profile.stat().st_ino,authority.stat().st_ino)
   with patch.object(m,'new_file',wraps=m.new_file) as write:r=m.materialize_remaining(self.plan,archive)
   self.assertEqual(write.call_count,0);self.assertEqual(r['missingFilesWritten'],0);self.assertEqual(before,(profile.stat().st_ino,authority.stat().st_ino))
   profile.write_bytes(b'used profile')
   with patch.object(m,'new_file',wraps=m.new_file) as write,self.assertRaisesRegex(ValueError,'EXACT_PARTIAL_MEMBER_METADATA_REQUIRED'):m.materialize_remaining(self.plan,archive)
   self.assertEqual(write.call_count,0)
 def test_remaining_missing_file_race_is_exclusive_not_overwritten(self):
  m=self.m
  with patch.object(m,'trusted',side_effect=lambda p,*args:Path(p)):
   archive=self.partial_materialization();write=m.new_file;target=m.ROOT/'deploy/extra.txt'
   def raced(path,data,mode=0o600):
    if path==target:target.write_bytes(b'concurrent unknown')
    return write(path,data,mode)
   with patch.object(m,'new_file',side_effect=raced),self.assertRaises(FileExistsError):m.materialize_remaining(self.plan,archive)
   self.assertEqual(target.read_bytes(),b'concurrent unknown')
 def test_remaining_expired_scope_refuses_before_external_command(self):
  with self.assertRaisesRegex(ValueError,'PREPARATION_DEADLINE_EXPIRED'):self.m.materialize_remaining_application({**self.plan,'imagePreparationExpiresAt':0})
 def test_archive_links_and_cohort_rejected(self):
  m=self.m
  archive,files=self.fixture_archive();self.assertEqual(set(m.archive_files(archive)[0]),set(files))
  import tarfile
  for mutate in [lambda member:setattr(member,'type',tarfile.SYMTYPE),lambda member:setattr(member,'name','../escape')]:
   archive,_=self.fixture_archive(mutate)
   with self.assertRaises(ValueError):m.archive_files(archive)
 def test_old_pass_without_independent_snapshots_cannot_pass(self):
  self.fake_state({'state':'ISOLATED_INSTALL_HOST_AND_SYNTHETIC_IMPORT_VERIFIED_AND_STOPPED','syntheticImportVerified':True,'recordPublished':True,'businessVerified':False,'cleanup':{'cleanupComplete':True}})
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value={**self.info(),'running':False}):r=self.m.observation(self.plan,wait=False)
  self.assertEqual(r['status'],'FAILED_OR_UNKNOWN_PRESERVED_NO_REPLAY')
 def test_exact_node_and_profile_readonly_mounts_and_wrong_mount_refused(self):
  m=self.m;a=m.common(m.ENV_IMAGE,100,self.plan['operationId']);mounts=[a[i+1] for i,x in enumerate(a) if x=='--mount']
  self.assertIn('type=bind,src='+str(m.ROOT/'deploy/runtime/node/bin/node')+',dst=/usr/local/bin/node,readonly',mounts)
  self.assertIn('type=bind,src='+str(m.ROOT/'state/capacity/owner-profile.json')+',dst='+m.CAPACITY_PROFILE+',readonly',mounts)
  self.assertEqual(len(mounts),5);m.owned(self.info(),self.receipt(),self.plan)
  for change in ['rw','wrong-source','missing']:
   info=self.info()
   if change=='rw':info['mounts'][-1]['RW']=True
   elif change=='wrong-source':info['mounts'][-2]['Source']='/some/other/node'
   else:info['mounts'].pop()
   with self.assertRaisesRegex(ValueError,'EXACT_MOUNTS_REQUIRED'):m.owned(info,self.receipt(),self.plan)
 def test_capacity_empty_inode_reserved_without_values_or_replacement(self):
  files={'deploy/code.py':b'public','metadata/deployment-manifest.json':b'{}'};modes={x:0o644 for x in files}
  with patch.object(self.m,'archive_files',return_value=(files,modes,{'packages':[]})),patch.object(self.m,'trusted',side_effect=lambda p,*a:Path(p)):self.m.materialize(self.plan,b'model')
  profile=self.m.ROOT/'state/capacity/owner-profile.json';before=profile.stat()
  self.assertEqual(profile.read_bytes(),b'');self.assertEqual(stat.S_IMODE(before.st_mode),0o644);self.assertEqual(before.st_nlink,1)
  self.assertFalse((self.m.ROOT/'state/capacity/authority.json').exists())
  with self.assertRaises(FileExistsError):self.m.new_file(profile,b'fabricated',0o644)
  self.assertEqual(profile.stat().st_ino,before.st_ino);self.assertEqual(profile.read_bytes(),b'')
 def test_early_launcher_exit_returned_without_waiting_or_claiming_cleanup(self):
  self.fake_state();(self.m.ROOT/'state/launcher-exit-code').write_bytes(b'2\n');info=self.info()
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',side_effect=[info,{**info,'running':False}]),patch.object(self.m,'run',return_value=b'') as run:r=self.m.observation(self.plan,wait=False)
  self.assertEqual(r['launcherExitCode'],2);self.assertEqual(r['status'],'FAILED_OR_UNKNOWN_PRESERVED_NO_REPLAY');self.assertTrue(r['containerStopped']);self.assertFalse(r['sourceResult']['cleanup']['cleanupComplete']);self.assertEqual(run.call_args.args[0][:2],['docker','stop'])
 def test_exit_receipt_never_stops_a_potentially_live_guardian(self):
  self.fake_state();(self.m.ROOT/'state/launcher-exit-code').write_bytes(b'137\n');(self.m.ROOT/'state'/self.m.WORK/'controller-process.json').write_bytes(b'{"pid":123}')
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value=self.info()):r=self.m.observation(self.plan,wait=False)
  self.assertEqual(r['launcherExitCode'],137);self.assertEqual(r['status'],'WAITING_ORIGINAL_LAUNCHER');self.assertFalse(r['containerStopped'])

if __name__=='__main__':unittest.main()
