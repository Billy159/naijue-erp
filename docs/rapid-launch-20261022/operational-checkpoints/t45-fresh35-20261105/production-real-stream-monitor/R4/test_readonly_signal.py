"""Actual reader function; only finite process/filesystem/signal dependencies."""
from contextlib import ExitStack
import importlib.util,json,signal,time
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch

spec=importlib.util.spec_from_file_location('reader_signal_ops',Path(__file__).with_name('fresh35-production-carrier.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ReaderSignals(unittest.TestCase):
 def check_signal(self,signum):
  now=int(time.time()*1000);source=m.SOURCE;target='b'*64;program='c'*64;record='d'*64
  ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']
  binding={'sourceSetSha256':source,'targetSha256':target,'manifestSha256':m.REAL_MANIFEST,'installationRecordSha256':record,'installProgramSha256':program,'baselineBatchId':ids[0],'documentBatchId':ids[1],'initializerOperationId':ids[2],'initializerRequestKey':'original-key','planSha256':'e'*64,'sourceNamespace':'SYNTHETIC','cutoffAt':'2026-11-07T00:00:00Z'}
  auth={'format':'FRESH35_PRODUCTION_REAL_IMPORT_AUTHORIZATION_V1','decision':'AUTHORIZE_EXACT_REAL_BATCH_IMPORT_AND_READBACK','binding':binding,'startsAt':0,'expiresAt':1,'independentSafetyReviewSha256':'f'*64,'authorizationReference':'SYNTHETIC binding only'};raw=json.dumps(auth).encode()
  d={**{k:binding[k] for k in ['sourceSetSha256','targetSha256','manifestSha256','installationRecordSha256']},'startsAt':now-1000,'expiresAt':now+30000,'requestKey':'readonly-signal-key','originalWriterJobKey':'writer-key','originalImportAuthoritySha256':m.sha(raw),'originalWriterProof':{'process':{'pid':202}}}
  a={'serviceLease':{'expiresAt':now+60000},'proposal':{'database':'SYNTHETIC','runtime':'SYNTHETIC'},'ordinary':{'connectHost':'127.0.0.1','connectPort':18651}}
  child=Mock();child.pid=101;child.stdin=Mock();identity={'pid':101,'starttime':'1','exe':m.DEPLOY+'/runtime/node/bin/node'};handlers={};events=[]
  factory=SimpleNamespace(core=SimpleNamespace(hydrate_ordinary_configuration=lambda a,c:c,process_identity=lambda pid:identity,clean_env=lambda work:{}))
  def register(sig,handler):handlers[sig]=handler
  def spawn(*args,**kwargs):
   self.assertEqual(set(handlers),{signal.SIGTERM,signal.SIGINT,signal.SIGHUP});events.append('SPAWN');return child
  def communicate(*args,**kwargs):events.append('SIGNAL');handlers[signum](signum,None)
  child.communicate.side_effect=communicate
  cleanup=Mock(side_effect=lambda *args:events.append('CLEANUP') or True)
  contexts=[patch.object(m,'read_file',return_value=raw),patch.object(m,'real_process_matches',side_effect=[False,True]),patch.object(m,'trusted',side_effect=lambda p:p),patch.object(m.Path,'mkdir'),patch.object(m,'new_json'),patch.object(m.subprocess,'Popen',side_effect=spawn),patch.object(m,'real_stop_status_child',cleanup),patch.object(signal,'signal',side_effect=register)]
  with ExitStack() as stack:
   for context in contexts:stack.enter_context(context)
   result=m.real_readonly_status_inside(d,a,Path('/MODEL'),{'programSha256':program},b'original-record',factory)
  self.assertEqual(result['status'],'UNKNOWN');self.assertEqual(result['code'],'READONLY_PARENT_INTERRUPTED');self.assertTrue(result['childReaped'])
  self.assertEqual(events,['SPAWN','SIGNAL','CLEANUP']);cleanup.assert_called_once_with(child,identity,m.real_stop_child);child.stdin.close.assert_called_once()
  self.assertFalse(result['originalWriterRollbackInferred'])

 def test_term_routes_to_owned_child_cleanup(self):self.check_signal(signal.SIGTERM)
 def test_int_routes_to_owned_child_cleanup(self):self.check_signal(signal.SIGINT)
 def test_hup_routes_to_owned_child_cleanup(self):self.check_signal(signal.SIGHUP)

if __name__=='__main__':unittest.main(verbosity=2)
