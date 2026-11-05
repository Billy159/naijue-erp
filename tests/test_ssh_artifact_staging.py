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

if __name__=='__main__':unittest.main()
