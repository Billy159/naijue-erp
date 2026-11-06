"""Actual new functions with finite FS/process/clock inputs; no Node/PG/server.
Reproduces QB's two timing findings, rather than redoing the 19 old cases.
"""
import importlib.util
from contextlib import ExitStack
import json
from pathlib import Path
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import patch,Mock

spec=importlib.util.spec_from_file_location('real_ops_r2',Path(__file__).with_name('fresh35-production-carrier.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class StartupAndDeadline(unittest.TestCase):
 def inside(self,identity_delay=0,spawn_delay=0,record_delay=0,expiry=1000,record_error=False,early_exit=False):
  clock=[0.0];events=[];sample_times=[];root=Path('/MODEL_REAL');work=Path('/MODEL_WORK')
  paths={'data':work/'data','wal':work/'data/pg_wal','reportIndex':root/'reports','tmp':root/'tmp','sqliteScratch':root/'sqlite-scratch'}
  description={'prepareOnly':False,'requestKey':'ONLY_MODEL_KEY','registrationSha256':None,'approvals':{},'expiresAt':int(expiry*1000),'sourceSetSha256':m.SOURCE,'targetSha256':'b'*64,'installationRecordSha256':'c'*64,'volumes':{k:{'path':str(v)} for k,v in paths.items()}}
  cli=json.dumps({'state':'COMMITTED','verification':{'state':'VERIFIED'},'connection_cleanup':'CLOSED'}).encode()
  class Child:
   returncode=0;pid=101
   def __init__(self):self.first=not early_exit;events.append(('SPAWN',clock[0]));clock[0]+=spawn_delay
   def poll(self):
    if self.first:self.first=False;return None
    return 0
   def wait(self,timeout=None):events.append(('REAP',clock[0]));return 0
  def identity(pid):clock[0]+=identity_delay;return {'pid':pid,'starttime':'1','exe':m.DEPLOY+'/runtime/node/bin/node'}
  factory=SimpleNamespace(core=SimpleNamespace(clean_env=lambda work:{},process_identity=identity))
  hashes=iter([m.REAL_MANIFEST,m.REAL_ADMIN_SHA])
  def sample(v,starting=False):sample_times.append(clock[0]);return {k:9_000_000_000 for k in m.REAL_VOLUME_NAMES}
  def write(path,value):
   if path.name=='stream-process.json':
    events.append(('PROCESS_RECORD',clock[0]));clock[0]+=record_delay
    if record_error:raise OSError('model write failed')
  def stop(child,identity):events.append(('STOP_AND_REAP',clock[0]));return True
  contexts=[patch.object(m,'REAL_ROOT',root),patch.object(m,'read_file',side_effect=lambda path,*a,**k:cli if path.name=='stream.stdout' else b'MODEL'),patch.object(m,'sha',side_effect=lambda raw:next(hashes)),patch.object(m,'trusted',side_effect=lambda p,root=True:p),patch.object(m.Path,'lstat',return_value=SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_nlink=1,st_size=len(cli))),patch.object(m.Path,'stat',return_value=SimpleNamespace(st_size=len(cli))),patch.object(m.Path,'mkdir'),patch.object(m,'syncdir'),patch.object(m,'new_json',side_effect=write),patch.object(m.os,'open',return_value=100),patch.object(m.os,'close'),patch.object(m.subprocess,'Popen',side_effect=lambda *a,**k:Child()),patch.object(m,'real_process_matches',return_value=True),patch.object(m,'real_volume_sample',side_effect=sample),patch.object(m,'real_report_sample'),patch.object(m,'real_stop_child',side_effect=stop),patch.object(m,'real_stop_controller',return_value={'cleanupComplete':True,'transactionRollbackProven':False}),patch.object(m.time,'monotonic',side_effect=lambda:clock[0]),patch.object(m.time,'time',side_effect=lambda:clock[0]),patch.object(m.time,'sleep'),patch('select.select',return_value=([],[],[])),patch('signal.signal')]
  with ExitStack() as stack:
   for context in contexts:stack.enter_context(context)
   result=m.real_inside_run(description,work,{'pid':202},factory)
  return result,events,sample_times

 def test_qb_one_second_process_record_io_occurs_only_after_reap(self):
  result,events,samples=self.inside(record_delay=1)
  self.assertEqual(result['status'],'REAL_COMMITTED_AND_READBACK_VERIFIED')
  self.assertEqual(samples,[0,0]);self.assertLess([x[0] for x in events].index('REAP'),[x[0] for x in events].index('PROCESS_RECORD'))
  self.assertEqual(result['guard']['maxSampleGapSeconds'],0)

 def test_slow_startup_identity_is_counted_and_refused(self):
  result,events,_=self.inside(identity_delay=1)
  self.assertEqual(result['status'],'STOPPED_OUTCOME_UNKNOWN');self.assertEqual(result['guard']['reason'],'REAL_SPACE_SAMPLE_LATE')
  self.assertEqual(result['guard']['maxSampleGapSeconds'],1);self.assertIn('STOP_AND_REAP',[x[0] for x in events])
  self.assertEqual(result['cli']['state'],'COMMITTED');self.assertFalse(result['transactionOutcomeInferredFromCleanup'])

 def test_slow_popen_is_counted_in_first_gap(self):
  result,_,_=self.inside(spawn_delay=1)
  self.assertEqual(result['guard']['reason'],'REAL_SPACE_SAMPLE_LATE');self.assertEqual(result['status'],'STOPPED_OUTCOME_UNKNOWN')

 def test_fast_exit_cannot_hide_slow_startup(self):
  result,_,_=self.inside(spawn_delay=1,early_exit=True)
  self.assertEqual(result['guard']['reason'],'REAL_SPACE_SAMPLE_LATE');self.assertEqual(result['status'],'STOPPED_OUTCOME_UNKNOWN')

 def test_post_watch_record_io_crossing_deadline_preserves_ack_but_not_pass(self):
  result,_,_=self.inside(record_delay=1,expiry=.5)
  self.assertEqual(result['status'],'STOPPED_OUTCOME_UNKNOWN');self.assertEqual(result['guard']['reason'],'REAL_RESULT_AFTER_ORIGINAL_WINDOW')
  self.assertEqual(result['cli']['state'],'COMMITTED');self.assertFalse(result['transactionOutcomeInferredFromCleanup'])

 def test_post_watch_record_failure_preserves_ack(self):
  result,_,_=self.inside(record_error=True)
  self.assertEqual(result['status'],'STOPPED_OUTCOME_UNKNOWN');self.assertEqual(result['cli']['state'],'COMMITTED')

 def watch_deadline(self,wait_delay=0):
  clock=[0.0];child=Mock();child.returncode=0;child.poll.return_value=0
  def sample(v):clock[0]+=.15 if not wait_delay else .01;return {}
  def wait():clock[0]+=wait_delay
  child.wait.side_effect=wait
  with patch.object(m,'real_process_matches',return_value=True),patch.object(m,'real_volume_sample',side_effect=sample),patch.object(m,'real_stop_child',return_value=True) as stop,patch.object(m,'real_stop_controller',return_value={'cleanupComplete':True}),patch.object(m.time,'monotonic',side_effect=lambda:clock[0]),patch.object(m.time,'time',side_effect=lambda:clock[0]):
   result=m.real_watch(child,{}, {'expiresAt':100,'volumes':{}},{},Path('/MODEL'),lambda:True)
  return result,stop

 def test_qb_sample_crosses_deadline_within_250ms_and_child_exits(self):
  result,stop=self.watch_deadline()
  self.assertEqual(result['guard'],'STOPPED_OUTCOME_UNKNOWN');self.assertEqual(result['reason'],'REAL_ORIGINAL_WINDOW_EXPIRED')
  self.assertAlmostEqual(result['maxSampleGapSeconds'],.15);stop.assert_called_once()

 def test_reap_crosses_deadline(self):
  result,stop=self.watch_deadline(wait_delay=.15)
  self.assertEqual(result['guard'],'STOPPED_OUTCOME_UNKNOWN');self.assertEqual(result['reason'],'REAL_ORIGINAL_WINDOW_EXPIRED');stop.assert_called_once()

if __name__=='__main__':unittest.main(verbosity=2)
