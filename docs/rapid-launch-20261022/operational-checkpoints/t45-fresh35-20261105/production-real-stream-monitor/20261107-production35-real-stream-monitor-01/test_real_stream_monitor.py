"""Local process/measurement tests only. No Docker, PG, server, or business input."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('registered_real_ops',HERE/'fresh35-production-carrier.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)

class RealStreamMonitor(unittest.TestCase):
 def description(self):
  return {'expiresAt':2_000_000_000_000,'volumes':{k:{} for k in ops.REAL_VOLUME_NAMES}}

 def watch(self,polls,measurement=None,alive=True,identity=True):
  child=Mock();child.poll.side_effect=polls;child.returncode=0
  measurement=measurement or {k:9_000_000_000 for k in ops.REAL_VOLUME_NAMES}
  with patch.object(ops,'real_process_matches',return_value=identity),patch.object(ops,'real_volume_sample',side_effect=measurement if isinstance(measurement,Exception) else None,return_value=measurement),patch.object(ops,'real_stop_child',return_value=True) as stop,patch.object(ops,'real_stop_controller',return_value={'cleanupComplete':True,'transactionRollbackProven':False}) as controller,patch.object(ops.time,'sleep'):
   result=ops.real_watch(child,{'pid':123},self.description(),{'pid':321},Path('/unused'),lambda:alive)
  return result,child,stop,controller

 def test_normal_reaps_without_stopping_original_controller(self):
  result,child,stop,controller=self.watch([None,0])
  self.assertEqual(result['guard'],'COMPLETED');self.assertTrue(result['childReaped'])
  child.wait.assert_called_once();stop.assert_not_called();controller.assert_not_called()
  self.assertFalse(result['transactionRollbackProven'])

 def test_low_space_terminates_only_owned_child_and_original_controller(self):
  result,_,stop,controller=self.watch([None],ValueError('REAL_SPACE_FLOOR_REACHED'))
  self.assertEqual(result['guard'],'STOPPED_OUTCOME_UNKNOWN');self.assertEqual(result['reason'],'REAL_SPACE_FLOOR_REACHED')
  stop.assert_called_once();controller.assert_called_once();self.assertFalse(result['transactionRollbackProven'])

 def test_measurement_failure_stops_and_never_means_rollback(self):
  result,_,stop,controller=self.watch([None],OSError('private filesystem diagnostic'))
  self.assertEqual(result['reason'],'OSError');self.assertNotIn('private',json.dumps(result))
  self.assertEqual(result['guard'],'STOPPED_OUTCOME_UNKNOWN');stop.assert_called_once();controller.assert_called_once()

 def test_mapping_change_is_terminal(self):
  result,_,stop,_=self.watch([None],ValueError('REAL_MOUNT_MAPPING_CHANGED'))
  self.assertEqual(result['reason'],'REAL_MOUNT_MAPPING_CHANGED');stop.assert_called_once()

 def test_parent_eof_stops_hung_child(self):
  result,_,stop,_=self.watch([None],alive=False)
  self.assertEqual(result['reason'],'REAL_ORIGINAL_CALLER_LOST');stop.assert_called_once()

 def test_controller_disappears(self):
  result,_,stop,_=self.watch([None],identity=False)
  self.assertEqual(result['reason'],'REAL_ORIGINAL_CONTROLLER_LOST');stop.assert_called_once()

 def test_expired_window_stops_hung_child(self):
  with patch.object(ops.time,'time',return_value=2_000_000_000):
   result,_,stop,_=self.watch([None])
  self.assertEqual(result['reason'],'REAL_ORIGINAL_WINDOW_EXPIRED');stop.assert_called_once()

 def test_late_measurement_stops_before_success(self):
  with patch.object(ops.time,'monotonic',side_effect=[0,.1,.1,.4]):
   result,_,stop,_=self.watch([0])
  self.assertEqual(result['reason'],'REAL_SPACE_SAMPLE_LATE');stop.assert_called_once()

 def test_child_identity_change_stops(self):
  child=Mock();child.poll.return_value=None
  with patch.object(ops,'real_process_matches',side_effect=[True,False]),patch.object(ops,'real_volume_sample',return_value={}),patch.object(ops,'real_stop_child',return_value=False),patch.object(ops,'real_stop_controller',return_value={'cleanupComplete':False}):
   result=ops.real_watch(child,{},self.description(),{},Path('/unused'),lambda:True)
  self.assertEqual(result['reason'],'REAL_STREAM_CHILD_IDENTITY_CHANGED');self.assertFalse(result['childReaped'])

 def test_term_then_bounded_kill_and_reap(self):
  child=Mock();child.poll.side_effect=[None,-9];child.wait.side_effect=[subprocess.TimeoutExpired('owned',3),-9]
  with patch.object(ops,'real_process_matches',return_value=True):self.assertTrue(ops.real_stop_child(child,{'pid':123}))
  child.send_signal.assert_called_once();child.kill.assert_called_once()
  self.assertEqual(child.wait.call_args_list[0].kwargs,{'timeout':3});self.assertEqual(child.wait.call_args_list[1].kwargs,{'timeout':3})

 def test_changed_identity_is_never_signalled(self):
  child=Mock();child.poll.return_value=None
  with patch.object(ops,'real_process_matches',return_value=False):self.assertFalse(ops.real_stop_child(child,{'pid':123}))
  child.send_signal.assert_not_called();child.kill.assert_not_called()

 def test_unreapable_child_stays_unknown(self):
  child=Mock();child.poll.return_value=None;child.wait.side_effect=subprocess.TimeoutExpired('owned',3)
  with patch.object(ops,'real_process_matches',return_value=True):self.assertFalse(ops.real_stop_child(child,{'pid':123}))

 def test_actual_owned_local_child_is_killed_and_reaped_when_term_ignored(self):
  child=subprocess.Popen([sys.executable,'-c','import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);print("ready",flush=True);time.sleep(30)'],stdout=subprocess.PIPE)
  try:
   self.assertEqual(child.stdout.readline(),b'ready\n')
   with patch.object(ops,'real_process_matches',side_effect=lambda identity:identity['pid']==child.pid and child.poll() is None):
    self.assertTrue(ops.real_stop_child(child,{'pid':child.pid}))
   self.assertIsNotNone(child.returncode)
  finally:
   if child.poll() is None:child.kill();child.wait(timeout=3)
   child.stdout.close()

 def test_empty_or_bad_output_stays_unknown(self):
  for raw in [b'',b'{"password":"DO_NOT_OUTPUT"}',b'broken']:
   result=ops.real_safe_cli_result(raw);self.assertEqual(result['state'],'UNKNOWN');self.assertNotIn('DO_NOT_OUTPUT',json.dumps(result))

 def test_commit_ack_preserved_when_readback_unknown(self):
  result=ops.real_safe_cli_result(b'{"state":"COMMITTED","verification":{"state":"VERIFICATION_UNKNOWN"},"connection_cleanup":"FAILED","source_counts":{"private":"DO_NOT_OUTPUT"}}')
  self.assertEqual(result['state'],'COMMITTED');self.assertEqual(result['verification'],'VERIFICATION_UNKNOWN');self.assertNotIn('DO_NOT_OUTPUT',json.dumps(result))

 def test_prepared_binding_is_whitelisted_without_business_bodies(self):
  binding={k:'a'*64 for k in ['installationRecordSha256','installProgramSha256','sourceSetSha256','targetSha256','catalogSha256','manifestSha256','planSha256','initializerSha256','stepsSha256']}
  binding.update({k:'original-key' for k in ['sourceNamespace','cutoffAt','baselineBatchId','documentBatchId','initializerOperationId','initializerRequestKey']});binding.update(format='FRESH35_PRODUCTION_REAL_IMPORT_BINDING_V1',stepCount=1)
  result=ops.real_safe_cli_result(json.dumps({'state':'PRODUCTION_REAL_IMPORT_PREPARED','binding':binding,'connection_cleanup':'CLOSED','business_database_writes':False,'verification':{'state':'NOT_RUN'},'rows':['DO_NOT_OUTPUT']}).encode())
  self.assertEqual(result['binding'],binding);self.assertNotIn('DO_NOT_OUTPUT',json.dumps(result))

 def test_native_preflight_exclusive_report_is_not_precreated(self):
  # Fixed native arguments, no preflight skipping, legacy index reuse or SQL.
  d={'prepareOnly':True,'registrationSha256':None,'approvals':{}}
  command=ops.real_cli_command(d,Path('/outer/stream'))
  self.assertIn('stream-import',command);self.assertIn('--prepare-only',command)
  self.assertEqual(command[command.index('--report')+1],'/outer/stream')
  self.assertEqual(command[command.index('--target-profile')+1],'FRESH35_PRODUCTION_REAL_IMPORT_V1')
  self.assertNotIn('--inspect-only',command);self.assertNotIn('--allow-synthetic',command)

 def volume_fixture(self,tmp):
  p=Path(tmp);s=p.stat();namespace=Path('/proc/self/ns/mnt').stat()
  return {k:{'path':str(p),'device':s.st_dev,'directoryInode':s.st_ino,'namespace':{'device':namespace.st_dev,'inode':namespace.st_ino},'mount':ops.real_mount(str(p)),'physicalVolume':'actual-local-device'} for k in ops.REAL_VOLUME_NAMES}

 def test_sample_floor_device_mapping_and_measurement_failures(self):
  # Local directory FDs and identities are real. Only Linux namespace/mount
  # metadata and statvfs numbers are injected; no server is queried.
  original_stat=Path.stat;namespace=types.SimpleNamespace(st_dev=4,st_ino=55)
  mount={'mountId':'8','deviceNumber':'1:2','mountRoot':'/','mountPoint':'/','fsType':'test','mountSource':'test-device'}
  def stat(path,*args,**kwargs):return namespace if str(path)=='/proc/self/ns/mnt' else original_stat(path,*args,**kwargs)
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);s=p.stat();v={k:{'path':str(p),'device':s.st_dev,'directoryInode':s.st_ino,'namespace':{'device':4,'inode':55},'mount':dict(mount),'physicalVolume':'one'} for k in ops.REAL_VOLUME_NAMES}
   with patch.object(ops.Path,'stat',autospec=True,side_effect=stat),patch.object(ops,'trusted',side_effect=lambda p,root=False:Path(p)),patch.object(ops,'real_mount',return_value=mount),patch.object(ops.os,'fstatvfs',create=True,return_value=types.SimpleNamespace(f_bavail=9_000_000_000,f_frsize=1)) as measure:
    self.assertEqual(set(ops.real_volume_sample(v,starting=True)),ops.REAL_VOLUME_NAMES)
    measure.return_value.f_bavail=ops.REAL_START_MINIMUM-1
    with self.assertRaisesRegex(ValueError,'REAL_START_SPACE_INSUFFICIENT'):ops.real_volume_sample(v,starting=True)
    measure.return_value.f_bavail=ops.REAL_STOP_FLOOR-1
    with self.assertRaisesRegex(ValueError,'REAL_SPACE_FLOOR_REACHED'):ops.real_volume_sample(v)
    measure.return_value.f_bavail=9_000_000_000;v['wal']['device']+=1
    with self.assertRaisesRegex(ValueError,'REAL_VOLUME_DIRECTORY_CHANGED'):ops.real_volume_sample(v)
    v['wal']['device']-=1;v['wal']['mount']['mountId']='changed'
    with self.assertRaisesRegex(ValueError,'REAL_MOUNT_MAPPING_CHANGED'):ops.real_volume_sample(v)
    v['wal']['mount']['mountId']='8';measure.side_effect=OSError('measurement unavailable')
    with self.assertRaises(OSError):ops.real_volume_sample(v)

 @unittest.skipUnless(Path('/proc/self/mountinfo').exists(),'Linux measurement fixture only; no server fallback')
 def test_actual_local_statvfs_and_device_change(self):
  with tempfile.TemporaryDirectory() as tmp:
   v=self.volume_fixture(tmp)
   with patch.object(ops,'trusted',side_effect=lambda p,root=False:Path(p)),patch.object(ops,'REAL_START_MINIMUM',0),patch.object(ops,'REAL_STOP_FLOOR',0):
    self.assertEqual(set(ops.real_volume_sample(v,starting=True)),ops.REAL_VOLUME_NAMES)
    v['wal']['device']+=1
    with self.assertRaisesRegex(ValueError,'REAL_VOLUME_DIRECTORY_CHANGED'):ops.real_volume_sample(v)

if __name__=='__main__':unittest.main(verbosity=2)
