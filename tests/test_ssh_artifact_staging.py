"""Offline only: execute receiver functions on temp files, never SSH or sudo."""
import ast
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
BASE_COMMIT='4176d19f0ed9045358e28fd582558412eb381313'
BASE_SHA256='678c77e9e1ded6f7daeeeaaa355d8884a73b537b9c0e008651d02d85f983793d'

class StagingTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name).resolve()
  with patch.dict(os.environ,{'ERP_RELEASE_CONNECTION_REF':str(self.root/'release-connection.json')}):
   spec=importlib.util.spec_from_file_location('artifact_client',ROOT/'scripts/release/ssh-control.py');self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
  self.m.HERE=self.root;self.m.dispatch=lambda *args,**kwargs:{'status':'READY'}
  self.cfg={'scope':'ERP_EXISTING_TASKS_THROUGH_T51','expiresAtEpoch':time.time()+3600,'grantId':'a'*16,'control':'/home/naijue/erp-release-20261006-01-control/grant-'+'a'*16}
  self.data=b'\x00ordinary\xffarchive\x80';now=int(time.time()*1000)
  self.a={'format':'T45_ORDINARY_ARTIFACT_STAGING_V1','decision':'AUTHORIZE_EXACT_ORDINARY_ARTIFACT_STAGING','taskId':'T45','grantId':'a'*16,'artifactKey':'fixture-one','sourceSetSha256':'b'*64,'archiveSha256':hashlib.sha256(self.data).hexdigest(),'archiveBytes':len(self.data),'targetDirectory':self.cfg['control']+'/artifacts/fixture-one','startsAt':now-10000,'expiresAt':now+60000,'decisionReference':'offline synthetic external-authority fixture only','kind':'ORDINARY_SOURCE_AND_TOOLS'}
  self.raw=json.dumps(self.a).encode();self.sha=hashlib.sha256(self.raw).hexdigest()
  self.auth=self.root/'approval.json';self.auth.write_bytes(self.raw);self.archive=self.root/'payload.bin';self.archive.write_bytes(self.data)
  self.args=types.SimpleNamespace(action='artifact-stage',authorization_file=str(self.auth),authorization_sha256=self.sha,archive=str(self.archive))
 def receiver(self):
  ns={'__name__':'offline'};exec(compile(self.m.ARTIFACT_REMOTE.replace('CONTEXT_LITERAL',repr({'authoritySha256':self.sha,'authority':self.a,'grantId':'a'*16,'control':self.cfg['control']}),1),'offline_receiver','exec'),ns)
  a=dict(self.a);control=self.root/'control';control.mkdir();a['targetDirectory']=str(control/'artifacts/fixture-one');return ns,a
 def test_valid_closed_authority(self):
  self.assertEqual(self.m.artifact_authority(self.raw,self.cfg),self.a)
 def test_invalid_authority_refuses_each_scope(self):
  for change in [{'decision':'PASS'},{'taskId':'T44'},{'grantId':'c'*16},{'kind':'PRIVATE_DATA'},{'targetDirectory':'/srv/production'},{'archiveBytes':True},{'archiveBytes':0},{'sourceSetSha256':'bad'},{'archiveSha256':'bad'},{'artifactKey':'../bad'},{'expiresAt':self.a['startsAt']-1},{'unexpected':1},{'decisionReference':''}]:
   with self.subTest(change=change),self.assertRaises(ValueError):self.m.artifact_authority(json.dumps({**self.a,**change}),self.cfg)
 def test_duplicate_and_expired_authority(self):
  with self.assertRaises(ValueError):self.m.artifact_authority(self.raw[:-1]+b',"taskId":"T45"}',self.cfg)
  a={**self.a,'startsAt':1,'expiresAt':2}
  with self.assertRaises(ValueError):self.m.artifact_authority(json.dumps(a),self.cfg)
  self.assertEqual(self.m.artifact_authority(json.dumps(a),self.cfg,True),a)
 def test_local_missing_approval_no_channel(self):
  self.auth.unlink()
  with patch.object(self.m,'remote',side_effect=AssertionError('network forbidden')),self.assertRaises(FileNotFoundError):self.m.artifact_stage(self.cfg,self.args)
 def test_local_bad_file_and_symlink_no_channel(self):
  self.archive.write_bytes(b'bad')
  with patch.object(self.m,'remote',side_effect=AssertionError('network forbidden')),self.assertRaises(ValueError):self.m.artifact_stage(self.cfg,self.args)
  self.archive.unlink();self.archive.symlink_to(self.auth)
  with patch.object(self.m,'remote',side_effect=AssertionError('network forbidden')),self.assertRaises(ValueError):self.m.artifact_stage(self.cfg,self.args)
 def test_binary_ready_and_status_readonly(self):
  ns,a=self.receiver();self.assertEqual(ns['snapshot'](a),{'status':'ABSENT'})
  result=ns['upload'](a,io.BytesIO(self.data));self.assertEqual(result['status'],'READY');target=Path(a['targetDirectory']);self.assertEqual((target/'archive.bin').read_bytes(),self.data)
  names=sorted(str(p) for p in self.root.rglob('*'));self.assertEqual(ns['snapshot'](a)['status'],'READY');self.assertEqual(names,sorted(str(p) for p in self.root.rglob('*')))
  with self.assertRaises(FileExistsError):ns['upload'](a,io.BytesIO(self.data))
  self.assertEqual((target/'archive.bin').read_bytes(),self.data)
 def test_short_extra_hash_failure_never_ready(self):
  for data in [self.data[:-1],self.data+b'x',b'x'*len(self.data)]:
   with self.subTest(data=data):
    ns,a=self.receiver()
    with self.assertRaises(ValueError):ns['upload'](a,io.BytesIO(data))
    self.assertEqual(ns['snapshot'](a)['status'],'PARTIAL_OR_UNKNOWN_NO_REPLAY')
    # Distinct disposable test root, never a protocol retry.
    self.root=self.root/'next';self.root.mkdir()
 def test_expiry_and_symlink_receiver_refused(self):
  ns,a=self.receiver();a['expiresAt']=1
  with self.assertRaises(ValueError):ns['upload'](a,io.BytesIO(self.data))
  a['expiresAt']=int(time.time()*1000)+60000;parent=Path(a['targetDirectory']).parent;parent.symlink_to(self.root)
  with self.assertRaises(ValueError):ns['upload'](a,io.BytesIO(self.data))
 def test_archive_change_status_is_not_ready(self):
  ns,a=self.receiver();ns['upload'](a,io.BytesIO(self.data));Path(a['targetDirectory'],'archive.bin').write_bytes(b'changed')
  self.assertEqual(ns['snapshot'](a)['status'],'PARTIAL_OR_UNKNOWN_NO_REPLAY')
 def test_client_timeout_attempt_never_reuploads(self):
  uploads=[]
  def call(cfg,a,sha,action,data=None):
   if action=='status':return {'status':'ABSENT'}
   uploads.append(data);raise subprocess.TimeoutExpired('offline',40)
  with patch.object(self.m,'artifact_channel',side_effect=call):
   with self.assertRaises(subprocess.TimeoutExpired):self.m.artifact_stage(self.cfg,self.args)
   with patch('builtins.print'):self.m.artifact_stage(self.cfg,self.args)
  self.assertEqual(uploads,[self.data]);self.assertTrue((self.root/'artifact-staging-attempt-fixture-one.json').is_file())
 def test_partial_status_prevents_upload(self):
  calls=[]
  def call(cfg,a,sha,action,data=None):calls.append(action);return {'status':'PARTIAL_OR_UNKNOWN_NO_REPLAY'}
  with patch.object(self.m,'artifact_channel',side_effect=call),patch('builtins.print'):self.m.artifact_stage(self.cfg,self.args)
  self.assertEqual(calls,['status']);self.assertFalse((self.root/'artifact-staging-attempt-fixture-one.json').exists())
 def test_status_never_reads_archive_or_writes_attempt(self):
  self.args.action='artifact-status';self.archive.unlink();before=sorted(str(x) for x in self.root.rglob('*'))
  with patch.object(self.m,'artifact_channel',return_value={'status':'ABSENT'}) as call,patch('builtins.print'):self.m.artifact_stage(self.cfg,self.args)
  self.assertEqual(call.call_args.args[-1],'status');self.assertEqual(before,sorted(str(x) for x in self.root.rglob('*')))
 def test_remote_authority_missing_or_mismatched_refused(self):
  ns,a=self.receiver()
  with patch('pathlib.Path.lstat',side_effect=PermissionError('offline denied')),self.assertRaises(PermissionError):ns['authority']()
  meta=types.SimpleNamespace(st_uid=0,st_mode=0o100644)
  with patch('pathlib.Path.lstat',return_value=meta):
   ns['read_regular']=lambda *args:b'{}'
   with self.assertRaisesRegex(ValueError,'EXTERNAL_AUTHORITY_DIFFERS'):ns['authority']()
 def test_revoked_existing_grant_no_staging(self):
  with patch.object(self.m,'dispatch',return_value={'status':'CLOSED'}),patch.object(self.m,'artifact_channel',side_effect=AssertionError('staging forbidden')),self.assertRaisesRegex(ValueError,'GRANT_NOT_READY'):self.m.artifact_stage(self.cfg,self.args)
 def test_authority_cannot_outlive_or_expand_existing_grant(self):
  for cfg in [{**self.cfg,'scope':'OTHER'},{**self.cfg,'expiresAtEpoch':1}]:
   with self.assertRaisesRegex(ValueError,'GRANT_BOUNDARY'):self.m.artifact_authority(self.raw,cfg)
 def test_cli_requires_all_approval_inputs_before_state_or_channel(self):
  with patch.object(self.m.sys,'argv',['ssh-control.py','artifact-stage','--archive',str(self.archive)]),patch.object(self.m,'state',side_effect=AssertionError('state forbidden')),patch('sys.stderr',io.StringIO()),self.assertRaises(SystemExit):self.m.main()
 def test_root_owned_matching_authority_is_required_and_sufficient_for_binding(self):
  ns,a=self.receiver();meta=types.SimpleNamespace(st_uid=0,st_mode=0o100644)
  with patch('pathlib.Path.lstat',return_value=meta):
   ns['read_regular']=lambda *args:self.raw
   self.assertEqual(ns['authority'](),self.a)
  with patch('pathlib.Path.lstat',return_value=types.SimpleNamespace(st_uid=501,st_mode=0o100644)),self.assertRaisesRegex(ValueError,'ROOT_AUTHORITY_REQUIRED'):ns['authority']()
 def test_original_functions_and_remote_timeout_unchanged(self):
  baseline=subprocess.check_output(['git','show',BASE_COMMIT+':candidate0448/scripts/release/ssh-control.py'],cwd=ROOT);self.assertEqual(hashlib.sha256(baseline).hexdigest(),BASE_SHA256)
  old=ast.parse(baseline);new=ast.parse((ROOT/'scripts/release/ssh-control.py').read_text());a={n.name:ast.dump(n) for n in old.body if isinstance(n,ast.FunctionDef)};b={n.name:ast.dump(n) for n in new.body if isinstance(n,ast.FunctionDef)}
  for name in a:
   if name!='main':self.assertEqual(a[name],b[name],name)
  # Existing capacity data/code and the only40-second SSH timeout are untouched.
  oldassign={n.targets[0].id:ast.dump(n) for n in old.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name)}
  newassign={n.targets[0].id:ast.dump(n) for n in new.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name)}
  for name in oldassign:self.assertEqual(oldassign[name],newassign[name],name)


 def private_authority(self,index=1):
  a={k:v for k,v in self.a.items() if k!='sourceSetSha256'}
  a.update(format='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1',decision='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING',kind='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT',manifestSha256=self.m.PRIVATE_STANDARD_DATA_MANIFEST,targetDirectory=self.cfg['control']+'/private-standard-import-data/'+a['artifactKey'])
  offset,size,digest=self.m.PRIVATE_STANDARD_DATA_PARTS[index-1]
  a.update(fragmentIndex=index,fragmentOffset=offset,archiveBytes=size,archiveSha256=digest)
  return a
 def test_private_exact_45_metadata_bindings_client_and_receiver(self):
  ns,_=self.receiver()
  self.assertEqual(len(self.m.PRIVATE_STANDARD_DATA_PARTS),45)
  self.assertEqual(ns['PRIVATE_STANDARD_DATA_PARTS'],self.m.PRIVATE_STANDARD_DATA_PARTS)
  for index in range(1,46):
   a=self.private_authority(index)
   self.assertEqual(self.m.artifact_authority(json.dumps(a).encode(),self.cfg),a)
   ns['private_standard_data_authority'](a,self.cfg['control'],self.cfg['grantId'])
  self.assertEqual(sum(x[1] for x in self.m.PRIVATE_STANDARD_DATA_PARTS),93508914)
 def test_private_bad_manifest_part_offset_hash_kind_or_extra_rejected(self):
  ns,_=self.receiver();a=self.private_authority()
  for change in [{'manifestSha256':'c'*64},{'fragmentIndex':0},{'fragmentIndex':46},{'fragmentIndex':True},{'fragmentOffset':True},{'fragmentOffset':1},{'archiveBytes':True},{'archiveBytes':a['archiveBytes']+1},{'archiveSha256':'c'*64},{'kind':'PRIVATE_DATA'},{'sourceSetSha256':self.a['sourceSetSha256']},{'targetDirectory':self.a['targetDirectory']},{'format':self.a['format']},{'decision':self.a['decision']}]:
   with self.subTest(change=change):
    bad={**a,**change}
    with self.assertRaises(ValueError):self.m.artifact_authority(json.dumps(bad).encode(),self.cfg)
    with self.assertRaises(ValueError):ns['private_standard_data_authority'](bad,self.cfg['control'],self.cfg['grantId'])
 def test_private_full_is_exact_and_network_stage_refused(self):
  a=self.private_authority();a.pop('fragmentIndex');a.pop('fragmentOffset');a.update(kind='PRIVATE_STANDARD_IMPORT_DATA',archiveBytes=self.m.PRIVATE_STANDARD_DATA_BYTES,archiveSha256=self.m.PRIVATE_STANDARD_DATA_ARCHIVE)
  self.assertEqual(self.m.artifact_authority(json.dumps(a).encode(),self.cfg),a)
  raw=json.dumps(a).encode();self.auth.write_bytes(raw);self.args.authorization_sha256=hashlib.sha256(raw).hexdigest();self.archive.unlink()
  with patch.object(self.m,'remote',side_effect=AssertionError('network forbidden')),self.assertRaisesRegex(ValueError,'SERVER_LOCAL_RECEIVER_ONLY'):self.m.artifact_stage(self.cfg,self.args)
  for change in [{'archiveSha256':'c'*64},{'archiveBytes':93508913},{'fragmentIndex':1}]:
   with self.assertRaises(ValueError):self.m.artifact_authority(json.dumps({**a,**change}).encode(),self.cfg)
 def test_private_authority_requires_actual_root_leaf_and_existing_window(self):
  a=self.private_authority();raw=json.dumps(a).encode();context={'authoritySha256':hashlib.sha256(raw).hexdigest(),'authority':a,'grantId':self.cfg['grantId'],'control':self.cfg['control']}
  ns={'__name__':'offline'};exec(compile(self.m.ARTIFACT_REMOTE.replace('CONTEXT_LITERAL',repr(context),1),'offline','exec'),ns)
  with patch('pathlib.Path.lstat',return_value=types.SimpleNamespace(st_uid=0,st_mode=0o100444)):
   ns['read_regular']=lambda *args:raw
   self.assertEqual(ns['authority'](),a)
   ns['read_regular']=lambda *args:b'{}'
   with self.assertRaisesRegex(ValueError,'EXTERNAL_AUTHORITY_DIFFERS'):ns['authority']()
  for change in [{'expiresAt':1},{'expiresAt':int((self.cfg['expiresAtEpoch']+1)*1000)}]:
   with self.assertRaises(ValueError):self.m.artifact_authority(json.dumps({**a,**change}).encode(),self.cfg)
 def test_private_synthetic_binary_receiver_receipt_and_no_replay(self):
  # Exercise raw transfer mechanics with synthetic bytes, never real archive data.
  ns,a=self.receiver();a.pop('sourceSetSha256');a.update(kind='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT',manifestSha256=self.m.PRIVATE_STANDARD_DATA_MANIFEST,fragmentIndex=1,fragmentOffset=0)
  result=ns['upload'](a,io.BytesIO(self.data));r=result['receipt'];self.assertNotIn('sourceSetSha256',r);self.assertEqual(r['manifestSha256'],self.m.PRIVATE_STANDARD_DATA_MANIFEST);self.assertEqual(r['fragmentIndex'],1)
  target=Path(a['targetDirectory']);self.assertEqual(target.stat().st_mode&0o777,0o700);self.assertEqual((target/'archive.bin').stat().st_mode&0o777,0o600)
  self.assertEqual(ns['snapshot'](a)['status'],'READY')
  with self.assertRaises(FileExistsError):ns['upload'](a,io.BytesIO(self.data))
  a['fragmentOffset']=2;self.assertEqual(ns['snapshot'](a)['status'],'PARTIAL_OR_UNKNOWN_NO_REPLAY')
 def test_private_existing_readable_parent_is_refused_not_chmodded(self):
  ns,a=self.receiver();a['kind']='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT';parent=Path(a['targetDirectory']).parent;parent.mkdir(mode=0o755);parent.chmod(0o755)
  with self.assertRaisesRegex(ValueError,'PRIVATE_STANDARD_DATA_DIRECTORY_REQUIRED'):ns['upload'](a,io.BytesIO(self.data))
  self.assertEqual(parent.stat().st_mode&0o777,0o755);self.assertFalse(Path(a['targetDirectory']).exists())
 def test_private_fragment_status_no_payload_read(self):
  a=self.private_authority();raw=json.dumps(a).encode();self.auth.write_bytes(raw);self.args.authorization_sha256=hashlib.sha256(raw).hexdigest();self.args.action='artifact-status';self.archive.unlink()
  with patch.object(self.m,'artifact_channel',return_value={'status':'ABSENT'}) as call,patch('builtins.print'):self.m.artifact_stage(self.cfg,self.args)
  self.assertEqual(call.call_args.args[-1],'status');self.assertFalse((self.root/('artifact-staging-attempt-'+a['artifactKey']+'.json')).exists())


class StandardDataAssemblyTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(dir=ROOT.parent);self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name).resolve()
  spec=importlib.util.spec_from_file_location('standard_assembly',ROOT.parent/'assemble_standard_data.py');self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
 def test_unbound_assembly_refuses_before_job_or_process(self):
  with patch.object(self.m.subprocess,'run',side_effect=AssertionError('process forbidden')),self.assertRaisesRegex(ValueError,'C_PRIVATE_DATA_BINDINGS_REQUIRED'):self.m.main()
 def fixture(self):
  m=self.m;m.ASSEMBLY_JOB='offline-one-shot';m.JOB_ROOT=self.root/'jobs';job=m.JOB_ROOT/m.ASSEMBLY_JOB;(job/'bundle').mkdir(parents=True);(job/'results').mkdir();m.CONTROL=self.root/'control';m.CONTROL.mkdir(mode=0o700);(m.CONTROL/'private-standard-import-data').mkdir(mode=0o700)
  m.PART_KEYS=tuple('fixture-part-'+str(i+1) for i in range(45));m.PART_AUTHORITY_SHAS=tuple(hashlib.sha256(('authority'+str(i)).encode()).hexdigest() for i in range(45));m.FINAL_KEY='fixture-full'
  chunks=[('synthetic-%02d'%i).encode() for i in range(45)];m.FULL_BYTES=sum(map(len,chunks));m.FULL_SHA=hashlib.sha256(b''.join(chunks)).hexdigest();parts=[];offset=0
  def write(p,b):
   p.write_bytes(b);p.chmod(0o600)
  for i,b in enumerate(chunks):
   digest=hashlib.sha256(b).hexdigest();parts.append((offset,len(b),digest));d=m.CONTROL/'private-standard-import-data'/m.PART_KEYS[i];d.mkdir(mode=0o700);write(d/'archive.bin',b);z=(d/'archive.bin').stat()
   r={'status':'READY','artifactKey':m.PART_KEYS[i],'manifestSha256':m.MANIFEST,'archiveSha256':digest,'archiveBytes':len(b),'authoritySha256':m.PART_AUTHORITY_SHAS[i],'fileIdentity':m.identity(z),'fragmentIndex':i+1,'fragmentOffset':offset};write(d/'ready.json',json.dumps(r).encode());offset+=len(b)
  m.PARTS=tuple(parts);receiver=(ROOT.parent/'artifact-receiver.private-candidate.py').read_bytes();write(job/'bundle/artifact-receiver.standard.py',receiver);self.assertEqual(hashlib.sha256(receiver).hexdigest(),m.RECEIVER_SHA)
  now=int(time.time()*1000);final={'format':'T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1','decision':'AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING','taskId':'T45','grantId':m.GRANT,'kind':'PRIVATE_STANDARD_IMPORT_DATA','manifestSha256':m.MANIFEST,'artifactKey':m.FINAL_KEY,'archiveBytes':m.FULL_BYTES,'archiveSha256':m.FULL_SHA,'targetDirectory':str(m.CONTROL/'private-standard-import-data'/m.FINAL_KEY),'startsAt':now-1000,'expiresAt':now+60000,'decisionReference':'isolated synthetic external-authority fixture only'};raw=json.dumps(final).encode();m.FINAL_AUTHORITY_SHA=hashlib.sha256(raw).hexdigest();write(job/'bundle/final-stage-authorization.json',raw)
  oldsmall=m.small
  def small(path,uid):
   if str(path).startswith('/usr/local/lib/naijue-erp-night/'):return raw
   return oldsmall(path,uid)
  oldfstat=os.fstat
  def meta(z,uid=0,gid=0):
   return types.SimpleNamespace(**{k:getattr(z,k) for k in ['st_dev','st_ino','st_size','st_mtime_ns','st_ctime_ns','st_mode','st_nlink']},st_uid=uid,st_gid=gid)
  oldopen=m.fixed_open
  def fixed(path,uid,maximum,exact=None):
   fd,z=oldopen(path,0,maximum,exact);return fd,meta(z,uid,1000 if uid==1000 else 0)
  def receive(args,**kw):
   self.assertEqual(kw['timeout'],40);self.assertEqual(kw['user'],1000);self.assertEqual(kw['group'],1000);self.assertEqual(kw['extra_groups'],[]);self.assertEqual(os.read(kw['stdin'],m.FULL_BYTES+1),b''.join(chunks))
   receipt={'artifactKey':m.FINAL_KEY,'manifestSha256':m.MANIFEST,'archiveSha256':m.FULL_SHA,'archiveBytes':m.FULL_BYTES,'authoritySha256':m.FINAL_AUTHORITY_SHA}
   return types.SimpleNamespace(returncode=0,stdout=json.dumps({'status':'READY','receipt':receipt}).encode())
  stack=__import__('contextlib').ExitStack();self.addCleanup(stack.close);stack.enter_context(patch.dict(os.environ,{'ERP_SHARED_TASK_ID':'T45','ERP_SHARED_JOB_DIR':str(job)}));stack.enter_context(patch.object(m.os,'getuid',return_value=0));stack.enter_context(patch.object(m.os,'geteuid',return_value=0));stack.enter_context(patch.object(m.os,'fstat',side_effect=lambda fd:meta(oldfstat(fd))));stack.enter_context(patch.object(m,'fixed_open',side_effect=fixed));stack.enter_context(patch.object(m,'small',side_effect=small));call=stack.enter_context(patch.object(m.subprocess,'run',side_effect=receive));return job,chunks,call
 def test_45_synthetic_parts_stream_exactly_once_and_receiver_owns_ready(self):
  job,chunks,call=self.fixture();self.m.main();self.assertEqual(call.call_count,1);self.assertEqual((job/'standard-import-data.tar.gz').read_bytes(),b''.join(chunks));r=json.loads((job/'results/standard-data-assembly.json').read_bytes());self.assertFalse(r['readyManuallyWritten']);self.assertEqual(r['partCount'],45);self.assertFalse((self.m.CONTROL/'private-standard-import-data'/self.m.FINAL_KEY).exists())
  with self.assertRaises(FileExistsError):self.m.main()
  self.assertEqual(call.call_count,1)
 def test_changed_fragment_never_reaches_receiver(self):
  job,chunks,call=self.fixture();p=self.m.CONTROL/'private-standard-import-data'/self.m.PART_KEYS[17]/'archive.bin';p.write_bytes(b'x'*len(chunks[17]))
  with self.assertRaisesRegex(ValueError,'PRIVATE_FRAGMENT_IDENTITY_DIFFERS'):self.m.main()
  self.assertEqual(call.call_count,0);self.assertFalse((job/'results/standard-data-assembly.json').exists())


 def test_fragment_growth_is_refused_before_extra_bytes_are_written(self):
  job,chunks,call=self.fixture();m=self.m;part=m.CONTROL/'private-standard-import-data'/m.PART_KEYS[0]/'archive.bin';oldread=os.read;grown=False
  def read(fd,n):
   nonlocal grown
   b=oldread(fd,n)
   if not grown and b==chunks[0]:
    with part.open('ab') as f:f.write(b'EXTRA_GROWTH')
    grown=True
   return b
  with patch.object(m.os,'read',side_effect=read),self.assertRaises(ValueError) as error:m.main()
  self.assertTrue(grown);self.assertEqual((job/'standard-import-data.tar.gz').read_bytes(),chunks[0]);self.assertEqual(str(error.exception),'EXACT_FRAGMENT_EXTRA_STREAM');self.assertEqual(call.call_count,0);self.assertFalse((job/'results/standard-data-assembly.json').exists())
 def test_expiry_after_fragment_read_refuses_write(self):
  job,chunks,call=self.fixture();m=self.m;final=json.loads((job/'bundle/final-stage-authorization.json').read_bytes());oldread=os.read;now=time.time();expired=False
  def read(fd,n):
   nonlocal expired
   b=oldread(fd,n)
   if b==chunks[0]:expired=True
   return b
  def clock():return final['expiresAt']/1000+0.001 if expired else now
  with patch.object(m.os,'read',side_effect=read),patch.object(m.time,'time',side_effect=clock),self.assertRaises(ValueError) as error:m.main()
  self.assertTrue(expired);self.assertEqual((job/'standard-import-data.tar.gz').stat().st_size,0);self.assertEqual(str(error.exception),'PRIVATE_STANDARD_DATA_ASSEMBLY_DEADLINE_EXPIRED');self.assertEqual(call.call_count,0);self.assertFalse((job/'results/standard-data-assembly.json').exists())

if __name__=='__main__':unittest.main()
