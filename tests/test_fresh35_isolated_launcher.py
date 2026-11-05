"""Offline only: no credentials, subprocess execution, network, root writes or PG."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import json
import io

PATH=Path(__file__).resolve().parents[1]/'scripts/release/unified-install/launch-fresh35-isolated-v1.py'
spec=importlib.util.spec_from_file_location('fresh35_launcher',PATH)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=1793851200000

def authority():
    p={'database':'synthetic_fresh35_20261105_r91','host':'127.0.0.1','port':57639,'workspaceDirectory':str(m.PARENT/'cloud-pg-fresh35-20261105-r91')}
    p.update({role:'fresh35_'+role+'_20261105_r91' for role in ['admin','owner','controller','runtime']})
    return {'format':'FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1','decision':'AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT','deploymentManifestSha256':'a'*64,'sourceSetSha256':'b'*64,'proposal':p,'postgresUid':992,'postgresGid':992,'startsAt':NOW,'expiresAt':NOW+1200000,'independentSafetyReviewSha256':'c'*64,'authorizationReference':'OFFLINE_FIXTURE_NOT_PERMISSION'}

class Tests(unittest.TestCase):
    def test_input_is_consistency_only(self):
        a=authority();self.assertIs(m.validate_authorization(a,NOW),a)
        self.assertFalse(hasattr(m,'issue_authorization'))
    def test_bad_target_and_authority(self):
        changes=[lambda a:a.update(decision='AUTHORIZE_EXACT_NEW35_TCP_BOOTSTRAP_AND_CLEANUP'),lambda a:a.update(extra=True),lambda a:a.update(decision='allow'),lambda a:a.update(postgresUid=0),lambda a:a.update(postgresUid=True),lambda a:a.update(expiresAt=NOW+1200001),lambda a:a['proposal'].update(host='localhost'),lambda a:a['proposal'].update(port=57628),lambda a:a['proposal'].update(workspaceDirectory='/tmp/old'),lambda a:a['proposal'].update(owner='postgres')]
        for change in changes:
            a=authority();change(a)
            with self.subTest(a=a),self.assertRaises(RuntimeError):m.validate_authorization(a,NOW)
    def test_window_does_not_restart(self):
        for now in [NOW-1,NOW+1200000-89999]:
            with self.assertRaises(RuntimeError):m.validate_authorization(authority(),now)
    def test_duplicate_keys_fail(self):
        with self.assertRaises(RuntimeError):m.strict_json('{"x":1,"x":2}')
    def test_hba_only_admin_owner_and_exact_controller_database(self):
        p=authority()['proposal'];h=m.hba_text(p)
        self.assertEqual(len(h.splitlines()),6);self.assertNotIn(p['runtime'],h)
        self.assertIn(f"host {p['database']} {p['controller']} 127.0.0.1/32 scram-sha-256",h)
        self.assertIn('local all all reject',h);self.assertIn('host all all ::/0 reject',h)
        self.assertNotIn('trust',h)
    def test_server_loopback_no_socket(self):
        args=m.server_args(authority()['proposal'])
        self.assertEqual(args[args.index('-h')+1],'127.0.0.1');self.assertEqual(args[args.index('-k')+1],'')
        self.assertIn('fsync=on',args);self.assertIn('log_min_error_statement=panic',args)
    def test_bootstrap_grants_only_exact_control_function(self):
        a=authority();p=a['proposal'];fake={p[k]:'0'*64 for k in ['owner','admin','controller','runtime']}
        roles,db,acl=m.bootstrap_sql(a,fake)
        self.assertEqual(roles.count('CREATE ROLE'),6);self.assertEqual(roles.count('WITH ADMIN FALSE, INHERIT FALSE, SET TRUE'),3)
        self.assertIn(f"GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO {p['owner']},{p['controller']};",acl)
        self.assertNotIn('schema_migration',acl) # exact column grant belongs to atomic owner install
        for text in ['pg_monitor','pg_read_all_data','SUPERUSER;', 'DROP ', 'TRUNCATE']:
            self.assertNotIn(text,roles+db+acl)
        self.assertEqual(db,f"CREATE DATABASE {p['database']} OWNER {p['owner']};\n")
    def test_inherited_secret_env_not_forwarded(self):
        with patch.dict(m.os.environ,{'PGPASSWORD':'OFFLINE_PLACEHOLDER','NODE_OPTIONS':'--import untrusted','LD_PRELOAD':'untrusted'}):
            env=m.clean_env(Path('/fixture'))
        self.assertEqual(set(env),{'PATH','LC_ALL','HOME','TZ'})
    def test_failed_revoke_still_stops_and_clears(self):
        class Child:
            done=False
            def poll(self):return 0 if self.done else None
            def send_signal(self,s):self.done=True
            def wait(self,timeout):return 0
        child=Child();a=authority();events=[]
        with patch.object(m,'owned_listener',return_value=True),patch.object(m,'same_process',return_value=True),patch.object(m,'psql',side_effect=RuntimeError('DENIED')),patch.object(m,'clear_credentials',side_effect=lambda *x:events.append('clear') or True),patch.object(m,'port_absent',return_value=True),patch.object(m.subprocess,'run',side_effect=RuntimeError('NO_CONTROL')):
            result=m.cleanup_owned_server(a,child,{'pid':999},'999',m.time.monotonic()+20)
        self.assertEqual(events,['clear']);self.assertTrue(child.done);self.assertFalse(result['loginsRevoked']);self.assertFalse(result['cleanupComplete'])
    def test_replaced_pid_never_signalled(self):
        class Child:
            def poll(self):return None
            def send_signal(self,s):raise AssertionError('MUST_NOT_SIGNAL')
        a=authority()
        with patch.object(m,'owned_listener',return_value=False),patch.object(m,'same_process',return_value=False),patch.object(m,'clear_credentials',return_value=True),patch.object(m,'port_absent',return_value=False):
            result=m.cleanup_owned_server(a,Child(),{'pid':999},'999',m.time.monotonic()+20)
        self.assertFalse(result['cleanupComplete']);self.assertIn({'phase':'stop','type':'OWNERSHIP_CHANGED'},result['errors'])
    def test_signal_failure_still_clears(self):
        class Child:
            def poll(self):return None
            def send_signal(self,s):raise PermissionError()
        events=[]
        with patch.object(m,'owned_listener',return_value=False),patch.object(m,'same_process',return_value=True),patch.object(m,'clear_credentials',side_effect=lambda *x:events.append('clear') or True),patch.object(m,'port_absent',return_value=False):
            result=m.cleanup_owned_server(authority(),Child(),{'pid':999},'999',m.time.monotonic()+20)
        self.assertEqual(events,['clear']);self.assertFalse(result['cleanupComplete'])
    def test_launcher_never_creates_install_authority_or_records(self):
        source=PATH.read_text()
        self.assertIn("read_private(INSTALL_AUTH)",source)
        self.assertNotIn('write_new(INSTALL_AUTH',source)
        self.assertNotIn('publishFresh35CombinedRecord',source)
        self.assertIn('NO_STALE_INSTALL_AUTHORIZATION',source)
        self.assertIn('ONLY_LIVE_CREATING_CONTROLLER',source)
        self.assertIn("json_new(root/'guardian-started.json'",source)
        self.assertNotIn('os.killpg',source)
        self.assertNotIn('shutil.rmtree',source)

class InitializationModelTests(unittest.TestCase):
    def model(self, events=None, status=None, descendants=None, cleanup=None, subreaper_error=False,time_step=0,signal_after_launch=False):
        log=[]; events=list(events or [None]); statuses=list(status or [0]); children=list(descendants or [])
        class IO:
            clock=1
            def now(self):self.clock+=time_step;return self.clock
            def parent_event(self, timeout):
                log.append('parent_event');return events.pop(0) if events else None
            def stop_requested(self):return signal_after_launch and 'launch' in log
            def enable_subreaper(self):
                log.append('subreaper')
                if subreaper_error:raise RuntimeError('SUBREAPER_FAILED')
            def launch(self):log.append('launch')
            def poll_initializer(self):return statuses.pop(0) if statuses else 0
            def children(self):return children
            def stop_and_reap(self):
                log.append('stop_and_reap');return cleanup or {'initializerReaped':True,'descendantsReaped':True,'errors':[]}
        result=m.drive_initializer(IO(),1000)
        return result,log
    def test_parent_eof_before_launch_never_spawns(self):
        result,log=self.model(events=['EOF'])
        self.assertFalse(result['initialized']);self.assertNotIn('launch',log)
    def test_parent_eof_during_initdb_reaps_before_failure(self):
        result,log=self.model(events=[None,'EOF'],status=[None])
        self.assertFalse(result['initialized']);self.assertEqual(result['stopReason'],'PARENT_EOF')
        self.assertTrue(result['initializerReaped']);self.assertTrue(result['descendantsReaped']);self.assertEqual(log[-1],'stop_and_reap')
    def test_eof_wins_over_simultaneous_success(self):
        result,_=self.model(events=[None,'EOF'],status=[0]);self.assertFalse(result['initialized']);self.assertEqual(result['stopReason'],'PARENT_EOF')
    def test_deadline_and_signal_attempt_reap(self):
        for options,reason in [({'time_step':100},'INITIALIZER_DEADLINE'),({'signal_after_launch':True},'GUARDIAN_SIGNAL')]:
            result,log=self.model(**options);self.assertFalse(result['initialized']);self.assertEqual(result['stopReason'],reason);self.assertEqual(log[-1],'stop_and_reap')
    def test_nonzero_exit_never_acknowledged(self):
        result,log=self.model(status=[1]);self.assertFalse(result['initialized']);self.assertEqual(result['stopReason'],'INITIALIZER_FAILED');self.assertIn('stop_and_reap',log)
    def test_success_waits_for_no_descendants(self):
        result,log=self.model(status=[0])
        self.assertTrue(result['initialized']);self.assertLess(log.index('subreaper'),log.index('launch'))
    def test_initdb_exit_does_not_hide_boot_postgres(self):
        result,log=self.model(status=[0],descendants=[{'pid':123}])
        self.assertFalse(result['initialized']);self.assertEqual(result['stopReason'],'INITIALIZER_DESCENDANTS_REMAINED');self.assertIn('stop_and_reap',log)
    def test_subreaper_failure_never_launches(self):
        result,log=self.model(subreaper_error=True)
        self.assertFalse(result['initialized']);self.assertNotIn('launch',log)
    def test_stop_failure_never_reports_complete(self):
        result,_=self.model(events=[None,'EOF'],cleanup={'initializerReaped':False,'descendantsReaped':False,'errors':['UNCONFIRMED']})
        self.assertFalse(result['initialized']);self.assertFalse(result['initializerReaped']);self.assertFalse(result['descendantsReaped'])

class InitializationAdapterTests(unittest.TestCase):
    class Exited:
        pid=111
        def poll(self):return 0
        def send_signal(self,s):raise AssertionError('EXITED_LEADER_MUST_NOT_SIGNAL')
    def test_two_generations_and_zombie_reaped_only_by_exact_pid(self):
        calls=[]
        with patch.object(m,'direct_child_pids',side_effect=[[222],[333],[]]),patch.object(m,'owned_initialization_child',return_value={}),patch.object(m.os,'waitpid',side_effect=[(0,0),(222,0),(333,0)]),patch.object(m.os,'kill',side_effect=lambda pid,sig:calls.append((pid,sig))):
            result=m.stop_and_reap_initialization(self.Exited(),authority(),m.time.monotonic()+20)
        self.assertEqual(calls,[(222,m.signal.SIGTERM)])
        self.assertTrue(result['initializerReaped']);self.assertTrue(result['descendantsReaped']);self.assertEqual(result['errors'],[])
    def test_foreign_identity_never_signalled_or_waited(self):
        with patch.object(m,'direct_child_pids',return_value=[222]),patch.object(m,'owned_initialization_child',side_effect=RuntimeError('DIFFERS')),patch.object(m.os,'kill') as kill,patch.object(m.os,'waitpid') as wait:
            result=m.stop_and_reap_initialization(self.Exited(),authority(),m.time.monotonic()+20)
        kill.assert_not_called();wait.assert_not_called();self.assertFalse(result['descendantsReaped'])
    def test_wait_failure_is_not_disappearance_or_signal_permission(self):
        with patch.object(m,'direct_child_pids',return_value=[222]),patch.object(m,'owned_initialization_child',return_value={}),patch.object(m.os,'waitpid',side_effect=ChildProcessError()),patch.object(m.os,'kill') as kill:
            result=m.stop_and_reap_initialization(self.Exited(),authority(),m.time.monotonic()+20)
        kill.assert_not_called();self.assertFalse(result['descendantsReaped']);self.assertIn('ChildProcessError',result['errors'])
    def test_signal_failure_is_not_disappearance(self):
        with patch.object(m,'direct_child_pids',return_value=[222]),patch.object(m,'owned_initialization_child',return_value={}),patch.object(m.os,'waitpid',return_value=(0,0)),patch.object(m.os,'kill',side_effect=PermissionError()):
            result=m.stop_and_reap_initialization(self.Exited(),authority(),m.time.monotonic()+20)
        self.assertFalse(result['descendantsReaped']);self.assertIn('PermissionError',result['errors'])
    def child_identity(self,changes=None,state='S',exe=None,uid=992):
        fields=['0']*20;fields[0]=state;fields[1]='700';fields[2]='111';fields[3]='111';fields[19]='999'
        for k,v in (changes or {}).items():fields[k]=str(v)
        def read(path,*args,**kwargs):
            return '222 (postgres) '+' '.join(fields) if path.name=='stat' else f'Uid: {uid} {uid} {uid} {uid}\n'
        with patch.object(m.os,'getpid',return_value=700),patch.object(m.Path,'read_text',read),patch.object(m.os,'readlink',return_value=exe or str(m.BIN/'postgres')) as link:
            value=m.owned_initialization_child(222,111,992)
        return value,link
    def test_zombie_without_exe_is_reapable(self):
        value,link=self.child_identity(state='Z');self.assertEqual(value['state'],'Z');link.assert_not_called()
    def test_wrong_parent_session_group_and_exe_rejected(self):
        for changes in [{1:701},{2:999},{3:999}]:
            with self.assertRaises(RuntimeError):self.child_identity(changes=changes)
        with self.assertRaises(RuntimeError):self.child_identity(exe='/unrelated/process')
        with self.assertRaises(RuntimeError):self.child_identity(uid=993)
    def test_files_clear_cannot_mask_unreaped_initializer(self):
        result=m.include_initialization_cleanup({'cleanupComplete':True,'credentialsRemoved':True},{'initializerReaped':False,'descendantsReaped':False,'errors':['STOP_DENIED']})
        self.assertFalse(result['cleanupComplete']);self.assertTrue(result['credentialsRemoved'])
    def test_parent_never_clears_while_guardian_alive(self):
        calls=[]
        class Watch:
            def __init__(self,code):self.code=code
            def poll(self):return self.code
        self.assertFalse(m.retry_parent_credential_cleanup(Watch(None),lambda:calls.append('clear') or True));self.assertEqual(calls,[])
        self.assertTrue(m.retry_parent_credential_cleanup(Watch(1),lambda:calls.append('clear') or True));self.assertEqual(calls,['clear'])
    def test_guardian_stops_before_clear_and_never_acks_failed_init(self):
        events=[];written={};output=io.StringIO()
        initialization={'initialized':False,'initializerReaped':False,'descendantsReaped':False,'stopReason':'PARENT_EOF','errors':['STOP_DENIED']}
        class Selector:
            def register(self,*args):pass
            def select(self,timeout):return [True]
        def initialize(*args):events.append('stop_reap_attempt');return initialization
        def cleanup(*args):events.append('clear_attempt');return {'cleanupComplete':True,'credentialsRemoved':True}
        with patch.object(m.signal,'signal'),patch.object(m.selectors,'DefaultSelector',return_value=Selector()),patch.object(m.sys,'stdin',io.StringIO('INITIALIZE\n')),patch.object(m.sys,'stdout',output),patch.object(m.time,'time',return_value=NOW/1000),patch.object(m,'supervise_initializer',side_effect=initialize),patch.object(m,'cleanup_owned_server',side_effect=cleanup),patch.object(m,'json_new',side_effect=lambda path,value:written.update({path.name:value})),patch.object(m.subprocess,'Popen') as spawn:
            code=m.supervise(authority())
        self.assertEqual(code,1);self.assertEqual(events,['stop_reap_attempt','clear_attempt']);spawn.assert_not_called()
        self.assertNotIn('INITIALIZED',output.getvalue());self.assertNotIn('SERVER_STARTED',output.getvalue())
        self.assertFalse(written['cleanup.json']['cleanupComplete']);self.assertTrue(written['cleanup.json']['credentialsRemoved'])
    def test_initializer_signal_failure_records_not_reaped(self):
        class Alive:
            pid=111
            def poll(self):return None
            def send_signal(self,signal):raise PermissionError()
        with patch.object(m,'direct_child_pids') as children:
            result=m.stop_and_reap_initialization(Alive(),authority(),m.time.monotonic()+20)
        self.assertFalse(result['initializerReaped']);self.assertFalse(result['descendantsReaped']);children.assert_not_called()
    def test_controller_does_not_spawn_initdb(self):
        source=PATH.read_text();main=source.split('def main():',1)[1]
        self.assertNotIn("str(BIN/'initdb')",main)
        self.assertIn("watch.stdin.write('INITIALIZE\\n')",main)

if __name__=='__main__':unittest.main()
