"""Offline only: no credentials, subprocess execution, network, root writes or PG."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import json
import io
import copy
import hashlib
from types import SimpleNamespace
import tempfile

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
        self.assertEqual(len(h.splitlines()),7)
        self.assertIn(f"host {p['database']} {p['runtime']} 127.0.0.1/32 scram-sha-256",h)
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
        self.assertIn(f"GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO {p['owner']},{p['controller']},{p['runtime']};",acl)
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

class SnapshotAndStageTests(unittest.TestCase):
    def setUp(self):
        self.a=authority();p=self.a['proposal']
        self.physical={'databaseOid':'12345','systemIdentifier':'777','serverVersionNum':'170011','postmasterStart':'2026-11-05 00:00:00+00'}
        self.target={'physical':self.physical}
        self.context={'kind':'context','actor':p['admin'],'sessionActor':p['admin'],'database':p['database'],'address':'127.0.0.1','port':p['port'],'dataDirectory':str(Path(p['workspaceDirectory'])/'data'),**self.physical,'readOnly':'on','isolation':'repeatable read','superuser':True,'bypassRls':True,'tables':[{'name':n,'kind':'r','selectAllowed':True,'rlsActive':False,'rlsEnabled':True,'rlsForced':True} for n in m.SNAPSHOT_TABLES],'sequences':['fixture_sequence']}
        self.rows=[self.context]+[{'kind':'table','name':n,'count':'0','sha256':hashlib.sha256(b'').hexdigest()} for n in m.SNAPSHOT_TABLES]+[{'kind':'sequence','name':'fixture_sequence','value':'1','called':False}]
        self.descriptor={'sourceSetSha256':'a'*64,'programSha256':'b'*64,'targetSha256':'c'*64}
        b={'format':'FRESH35_SYNTHETIC_RETENTION25_STAGE_BINDING_V1','sourceSetSha256':'a'*64,'installProgramSha256':'b'*64,'targetSha256':'c'*64,'manifestSha256':'d'*64,'planSha256':'e'*64,'initializerSha256':'f'*64,'stepsSha256':'0'*64}
        encoded='{'+','.join(json.dumps(k)+':s'+json.dumps(b[k]) for k in sorted(b))+'}'
        common={'fixtureBinding':b,'fixtureBindingSha256':hashlib.sha256(encoded.encode()).hexdigest(),'connectionCleanup':'CLOSED','businessVerified':False}
        self.rollback={**common,'state':'FRESH35_SYNTHETIC_ROLLBACK_VERIFIED','stage':'rollback','rollbackVerified':True,'originalBatchAbsent':True,'syntheticImportVerified':False}
        self.commit={**common,'state':'FRESH35_CONTROLLER_HOST_VERIFIED','stage':'commit','ordinaryUid':self.a['postgresUid'],'syntheticImportVerified':True,'importState':'COMMITTED','replayState':'ALREADY_COMMITTED','readbackState':'VERIFIED','settlementRetentionVerified':True,'retainedHeaders':25,'retainedSettlements':27}
    def raw(self,rows=None):return '\n'.join(json.dumps(r) for r in (self.rows if rows is None else rows))+'\n'
    def snapshot(self):return m.validate_snapshot(self.raw(),self.a,self.target)
    def drive(self,rollback=None,commit=None,snapshots=None):
        events=[];writes={};responses=[self.rollback if rollback is None else rollback,self.commit if commit is None else commit];observations=list(snapshots or [self.snapshot()]*3)
        def observer():events.append('observe');return observations.pop(0)
        def child(*flags):events.append(flags);return responses.pop(0)
        with patch.object(m,'json_new',side_effect=lambda path,value:writes.update({path.name:value})):
            result=m.verify_synthetic_stages(self.a,self.target,self.descriptor,Path('/model'),child,observer)
        return result,events,writes
    def test_full_visibility_includes_forced_rls(self):
        r=self.snapshot();self.assertEqual(len(r['snapshot']['tables']),35);self.assertEqual(r['transaction'],'ROLLED_BACK');self.assertEqual(r['connectionCleanup'],'CLOSED');self.assertIsNone(r['sqlstate'])
    def test_wrong_actor_target_readonly_isolation_and_filtered_results_refused(self):
        cases=[('actor','owner'),('sessionActor','other'),('database','production'),('databaseOid','888'),('systemIdentifier','888'),('postmasterStart','later'),('readOnly','off'),('isolation','read committed')]
        for key,value in cases:
            rows=copy.deepcopy(self.rows);rows[0][key]=value
            with self.subTest(key=key),self.assertRaises(RuntimeError):m.validate_snapshot(self.raw(rows),self.a,self.target)
        for change in [lambda c:c.update(superuser=False,bypassRls=False),lambda c:c['tables'][0].update(rlsActive=True),lambda c:c['tables'][0].update(selectAllowed=False),lambda c:c['tables'].pop(),lambda c:c['tables'].append(dict(c['tables'][0])),lambda c:c['tables'][0].update(kind='p')]:
            rows=copy.deepcopy(self.rows);change(rows[0])
            with self.assertRaises(RuntimeError):m.validate_snapshot(self.raw(rows),self.a,self.target)
    def test_missing_duplicate_oversized_or_raw_row_refused(self):
        for change in [lambda r:r.pop(),lambda r:r.append(r[1]),lambda r:r[1].update(count='10001'),lambda r:r[1].update(sha256='invalid'),lambda r:r[1].update(raw={'secret':'DO_NOT_EXPORT'}),lambda r:r[-1].update(called=1),lambda r:r[-1].update(value='-1')]:
            rows=copy.deepcopy(self.rows);change(rows)
            with self.assertRaises(RuntimeError):m.validate_snapshot(self.raw(rows),self.a,self.target)
        with self.assertRaises(RuntimeError):m.validate_snapshot(' '*131073,self.a,self.target)
    def test_observer_uses_only_original_admin_passfile_and_bounded_psql(self):
        response=SimpleNamespace(returncode=0,stdout=self.raw().encode(),stderr=b'')
        with patch.object(m.subprocess,'run',return_value=response) as call:
            m.observe_snapshot(self.a,self.target,12)
        args=call.call_args;argv=args.args[0];self.assertEqual(argv[0],str(m.BIN/'psql'));self.assertIn('--no-password',argv);self.assertEqual(argv[argv.index('--username')+1],self.a['proposal']['admin']);self.assertEqual(args.kwargs['timeout'],12)
        env=args.kwargs['env'];self.assertNotIn('PGPASSWORD',env);self.assertTrue(env['PGPASSFILE'].endswith(self.a['proposal']['admin']+'.pgpass'))
        sql=args.kwargs['input'].decode();self.assertIn('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',sql);self.assertIn('SET LOCAL row_security=off;',sql);self.assertTrue(sql.endswith('ROLLBACK;\n'));self.assertEqual(sql.count('LIMIT 10001'),35);self.assertNotIn('SET ROLE',sql);self.assertNotIn('CREATE ',sql);self.assertNotIn('nextval(',sql);self.assertNotIn('setval(',sql)
    def test_sqlstate_only_no_stderr_or_sql_export(self):
        response=SimpleNamespace(returncode=3,stdout=b'',stderr=b'ERROR:  42501\nDO_NOT_EXPORT_password_query')
        with patch.object(m.subprocess,'run',return_value=response),self.assertRaisesRegex(RuntimeError,'PSQL_SQLSTATE_42501') as raised:
            m.observe_snapshot(self.a,self.target,12)
        self.assertNotIn('DO_NOT_EXPORT',str(raised.exception))
    def test_timeout_propagates_without_retry(self):
        with patch.object(m.subprocess,'run',side_effect=m.subprocess.TimeoutExpired(['psql'],2)) as call,self.assertRaises(m.subprocess.TimeoutExpired):m.observe_snapshot(self.a,self.target,2)
        self.assertEqual(call.call_count,1)
    def test_three_observations_serial_and_two_children_once(self):
        result,events,writes=self.drive()
        self.assertIs(result,self.commit);self.assertEqual(events,['observe',('--verify-host-rollback',),'observe',('--verify-host-commit',self.rollback['fixtureBindingSha256']),'observe']);self.assertEqual(set(writes),{'snapshot-after-install.json','rollback-host-result.json','snapshot-after-rollback.json','host-result.json','snapshot-after-commit.json'})
    def test_changed_table_or_sequence_after_rollback_stops_before_commit(self):
        for change in [lambda s:s['snapshot']['tables']['product'].update(count='1'),lambda s:s['snapshot']['sequences']['fixture_sequence'].update(called=True)]:
            baseline=self.snapshot();after=copy.deepcopy(baseline);change(after);children=[]
            with patch.object(m,'json_new'),self.assertRaisesRegex(RuntimeError,'ROLLBACK_SNAPSHOT_CHANGED'):
                observations=iter([baseline,after]);m.verify_synthetic_stages(self.a,self.target,self.descriptor,Path('/model'),lambda *flags:children.append(flags) or self.rollback,lambda:next(observations))
            self.assertEqual(children,[('--verify-host-rollback',)])
    def test_rollback_cleanup_unknown_flags_and_binding_stop_commit(self):
        for change in [dict(connectionCleanup='UNKNOWN'),dict(state='ROLLED_BACK'),dict(originalBatchAbsent=False),dict(businessVerified=True),dict(fixtureBindingSha256='0'*64)]:
            bad={**self.rollback,**change};children=[]
            with patch.object(m,'json_new'),self.assertRaises(RuntimeError):m.verify_synthetic_stages(self.a,self.target,self.descriptor,Path('/model'),lambda *f:children.append(f) or bad,self.snapshot)
            self.assertEqual(children,[('--verify-host-rollback',)])
    def test_commit_unknown_wrong_count_or_missing_cleanup_never_pass(self):
        for change in [dict(importState='UNKNOWN'),dict(replayState='COMMITTED'),dict(readbackState='UNKNOWN'),dict(connectionCleanup=None),dict(retainedHeaders=26),dict(retainedSettlements=28),dict(ordinaryUid=0),dict(businessVerified=True)]:
            with self.subTest(change=change),self.assertRaises(RuntimeError):self.drive(commit={**self.commit,**change})
    def test_binding_all_pins_and_recomputed_digest(self):
        for key in ['sourceSetSha256','installProgramSha256','targetSha256','manifestSha256','planSha256','initializerSha256','stepsSha256']:
            bad=copy.deepcopy(self.commit);bad['fixtureBinding'][key]='9'*64
            with self.subTest(key=key),self.assertRaises(RuntimeError):self.drive(commit=bad)
        bad=copy.deepcopy(self.commit);bad['fixtureBinding']['extra']='9'*64
        with self.assertRaises(RuntimeError):self.drive(commit=bad)
    def test_failed_child_or_observer_never_replayed(self):
        for phase in ['child','observer']:
            calls=[]
            def child(*args):calls.append(args);raise RuntimeError('OUTCOME_UNKNOWN')
            def observer():raise RuntimeError('SNAPSHOT_FAILED')
            with patch.object(m,'json_new'),self.assertRaises(RuntimeError):m.verify_synthetic_stages(self.a,self.target,self.descriptor,Path('/model'),child,observer if phase=='observer' else self.snapshot)
            self.assertEqual(len(calls),0 if phase=='observer' else 1)
    def test_final_observer_failure_preserves_committed_receipt_without_replay(self):
        calls=[];written={};number=0
        def observer():
            nonlocal number
            number+=1
            if number==3:raise RuntimeError('FINAL_OBSERVER_FAILED')
            return self.snapshot()
        def child(*flags):
            calls.append(flags)
            return self.rollback if len(calls)==1 else self.commit
        with patch.object(m,'json_new',side_effect=lambda path,value:written.update({path.name:value})),self.assertRaisesRegex(RuntimeError,'FINAL_OBSERVER_FAILED'):
            m.verify_synthetic_stages(self.a,self.target,self.descriptor,Path('/model'),child,observer)
        self.assertEqual(len(calls),2);self.assertEqual(written['host-result.json']['importState'],'COMMITTED');self.assertNotIn('snapshot-after-commit.json',written)

class ApplicationCredentialTests(unittest.TestCase):
    def setUp(self):
        self.password='OFFLINE_SYNTHETIC_PASSWORD_ONLY_NO_ACCOUNT'
        self.encoded=('naijue:scrypt:1:32768:8:1:'+'1'*32+':'+'2'*128+'\n').encode()
        self.watch=SimpleNamespace(poll=lambda:None)
        self.response=SimpleNamespace(returncode=0,stdout=self.encoded,stderr=b'')
    def generate(self,response=None,watch=None):
        with patch('secrets.token_urlsafe',return_value=self.password),patch.object(m.subprocess,'run',return_value=self.response if response is None else response) as run,patch.object(m,'write_new') as write:
            value=m.create_synthetic_application_credential(Path('/model'),self.watch if watch is None else watch,12)
        return value,run,write
    def test_codec_input_private_once_fixed_path_and_mode(self):
        value,run,write=self.generate();self.assertEqual(value,self.password);self.assertEqual(run.call_count,1)
        call=run.call_args;argv=call.args[0];self.assertEqual(argv[:4],[str(m.NODE),'--no-global-search-paths','--input-type=module','--eval'])
        self.assertIn('createNodeScryptPasswords()',argv[4]);self.assertIn('codec.verify(password,encoded)',argv[4]);self.assertIn('NODE_SCRYPT_DUMMY_HASH',argv[4])
        self.assertEqual(call.kwargs['input'],self.password.encode());self.assertEqual(call.kwargs['timeout'],12)
        self.assertNotIn(self.password,' '.join(argv));self.assertNotIn(self.password,json.dumps(call.kwargs['env']));self.assertNotIn('PGPASSWORD',call.kwargs['env'])
        write.assert_called_once_with(Path('/model/credentials/synthetic-application-scrypt.txt'),self.encoded,0o600)
    def test_bad_codec_exit_format_and_multiple_lines_do_not_write(self):
        for response in [SimpleNamespace(returncode=1,stdout=b'',stderr=b'PRIVATE_MUST_NOT_EXPORT'),SimpleNamespace(returncode=0,stdout=b'bad\n',stderr=b''),SimpleNamespace(returncode=0,stdout=self.encoded*2,stderr=b'')]:
            with patch('secrets.token_urlsafe',return_value=self.password),patch.object(m.subprocess,'run',return_value=response) as run,patch.object(m,'write_new') as write,self.assertRaisesRegex(RuntimeError,'APPLICATION_CREDENTIAL_GENERATION_FAILED') as error:
                m.create_synthetic_application_credential(Path('/model'),self.watch,12)
            write.assert_not_called();self.assertEqual(run.call_count,1);self.assertNotIn('PRIVATE_MUST_NOT_EXPORT',str(error.exception))
    def test_dead_guardian_or_expired_budget_never_spawns_or_writes(self):
        for watch,seconds in [(SimpleNamespace(poll=lambda:1),12),(self.watch,0)]:
            with patch.object(m.subprocess,'run') as run,patch.object(m,'write_new') as write,self.assertRaisesRegex(RuntimeError,'APPLICATION_CREDENTIAL_WINDOW_OR_GUARDIAN'):
                m.create_synthetic_application_credential(Path('/model'),watch,seconds)
            run.assert_not_called();write.assert_not_called()
    def test_guardian_exit_during_hash_prevents_file_write(self):
        with patch('secrets.token_urlsafe',return_value=self.password),patch.object(m.subprocess,'run',return_value=self.response),patch.object(m,'write_new') as write:
            calls=iter([None,1]);watch=SimpleNamespace(poll=lambda:next(calls))
            with self.assertRaisesRegex(RuntimeError,'GUARDIAN_LOST_BEFORE_APPLICATION_CREDENTIAL_WRITE'):m.create_synthetic_application_credential(Path('/model'),watch,12)
        write.assert_not_called()
    def test_hash_timeout_no_retry_or_partial_file(self):
        with patch('secrets.token_urlsafe',return_value=self.password),patch.object(m.subprocess,'run',side_effect=m.subprocess.TimeoutExpired(['node'],12)) as run,patch.object(m,'write_new') as write,self.assertRaises(m.subprocess.TimeoutExpired):
            m.create_synthetic_application_credential(Path('/model'),self.watch,12)
        self.assertEqual(run.call_count,1);write.assert_not_called()
    def test_runtime_grant_exact_function_and_role_validated(self):
        a=authority();p=a['proposal'];fake={p[k]:'0'*64 for k in ['owner','admin','controller','runtime']}
        _,_,acl=m.bootstrap_sql(a,fake)
        grants=[line for line in acl.splitlines() if 'GRANT EXECUTE' in line]
        self.assertEqual(grants,[f"GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO {p['owner']},{p['controller']},{p['runtime']};"])
        self.assertNotIn('TABLE',acl);self.assertNotIn('pg_read_all_data',acl);self.assertNotIn(' TO PUBLIC',acl)
        for runtime in ['postgres','fresh35_owner_20261105_r91','fresh35_runtime_20261105_r92']:
            bad=copy.deepcopy(a);bad['proposal']['runtime']=runtime
            with self.assertRaisesRegex(RuntimeError,'EXACT_ROLE_NAMES'):m.validate_authorization(bad,NOW)
    def test_runtime_hba_one_loopback_database_only_and_tail_deny(self):
        p=authority()['proposal'];rows=[line.split() for line in m.hba_text(p).splitlines()]
        runtime=[row for row in rows if p['runtime'] in row]
        self.assertEqual(runtime,[['host',p['database'],p['runtime'],'127.0.0.1/32','scram-sha-256']])
        self.assertEqual(rows[-2:],[['host','all','all','0.0.0.0/0','reject'],['host','all','all','::/0','reject']])
        self.assertEqual(rows[0],['local','all','all','reject'])
        for database in ['postgres','other_database','all']:
            self.assertFalse(any(row[0]=='host' and row[1]==database and row[2]==p['runtime'] and row[-1]!='reject' for row in rows))
        self.assertEqual(len(rows),7)
    def test_cleanup_includes_fixed_hash_and_preserves_unknown_files(self):
        with tempfile.TemporaryDirectory() as dirname:
            root=Path(dirname);(root/'credentials').mkdir();(root/'pg-private').mkdir()
            target=root/'credentials'/m.APPLICATION_SCRYPT_NAME;target.write_bytes(b'OFFLINE_SYNTHETIC_FIXTURE')
            original=m.Path.lstat
            def info(path,*args,**kwargs):
                value=original(path,*args,**kwargs)
                return SimpleNamespace(st_mode=value.st_mode,st_uid=0,st_nlink=value.st_nlink)
            with patch.object(m.Path,'lstat',info):self.assertTrue(m.clear_credentials(root,authority()['proposal'],authority()['postgresUid']))
            self.assertFalse(target.exists())
            (root/'credentials'/'unregistered-scenario.json').write_bytes(b'OFFLINE_FIXTURE')
            with patch.object(m.Path,'lstat',info):self.assertFalse(m.clear_credentials(root,authority()['proposal'],authority()['postgresUid']))
            self.assertTrue((root/'credentials'/'unregistered-scenario.json').exists())

class OrdinaryScenarioPreparationTests(unittest.TestCase):
    def scenario(self):
        # File/transport model only; deliberately not actual PG proposals/facts.
        return {'syntheticOnly':True,'login':{'accountId':'fixture-admin','loginName':'fixture-admin','password':'OFFLINE_SYNTHETIC_ONLY'},'salesPositive':{},'salesMixed':{},'transfer':{},'initialInventory':[],'keys':{},'forbidden':{'staffId':'fixture-staff','loginName':'fixture-other','password':'OFFLINE_SYNTHETIC_ONLY','setupRequestKey':'fixture-setup','sales':{},'requestKey':'fixture-denied'}}
    def test_fixed_scenario_only_private_mode_bounded_and_exclusive(self):
        with tempfile.TemporaryDirectory() as dirname:
            root=Path(dirname);(root/'credentials').mkdir();watch=SimpleNamespace(poll=lambda:None)
            with patch.object(m.os,'chown') as chown,patch.object(m.os,'fchown') as fchown:path=m.write_ordinary_scenario(authority(),root,self.scenario(),watch)
            self.assertEqual(path,root/'ordinary-private/fresh35-ordinary-scenario.json');self.assertEqual(path.stat().st_mode&0o777,0o600)
            chown.assert_called_once_with(root/'ordinary-private',authority()['postgresUid'],authority()['postgresGid'],follow_symlinks=False)
            self.assertEqual(fchown.call_args.args[1:],(authority()['postgresUid'],authority()['postgresGid']))
            self.assertEqual((root/'ordinary-private').stat().st_mode&0o777,0o700)
            self.assertEqual(json.loads(path.read_bytes()),self.scenario())
            with self.assertRaises(FileExistsError):m.write_ordinary_scenario(authority(),root,self.scenario(),watch)
    def test_unknown_scenario_guardian_and_oversize_do_not_write(self):
        for change in [lambda s:None,lambda s:{**s,'syntheticOnly':False},lambda s:{**s,'extra':True},lambda s:{**s,'login':{}},lambda s:{**s,'initialInventory':['x'*262144]}]:
            with patch.object(m,'write_new') as write,self.assertRaises(RuntimeError):m.write_ordinary_scenario(authority(),Path('/model'),change(self.scenario()),SimpleNamespace(poll=lambda:None))
            write.assert_not_called()
        with patch.object(m,'write_new') as write,self.assertRaisesRegex(RuntimeError,'GUARDIAN_LOST_BEFORE_ORDINARY_SCENARIO_WRITE'):m.write_ordinary_scenario(authority(),Path('/model'),self.scenario(),SimpleNamespace(poll=lambda:1))
        write.assert_not_called()
    def test_fixed_scenario_symlink_not_followed(self):
        with tempfile.TemporaryDirectory() as dirname:
            root=Path(dirname);(root/'ordinary-private').mkdir();other=root/'other';other.write_bytes(b'RETAINED_FIXTURE')
            (root/'ordinary-private'/m.ORDINARY_SCENARIO_NAME).symlink_to(other)
            with self.assertRaises(FileExistsError):m.write_ordinary_scenario(authority(),root,self.scenario(),SimpleNamespace(poll=lambda:None))
            self.assertEqual(other.read_bytes(),b'RETAINED_FIXTURE')
    def test_guardian_and_parent_cleanup_fixed_scenario_and_hash(self):
        with tempfile.TemporaryDirectory() as dirname:
            root=Path(dirname);(root/'credentials').mkdir();(root/'pg-private').mkdir()
            (root/'credentials'/m.APPLICATION_SCRYPT_NAME).write_bytes(b'OFFLINE_SYNTHETIC_ONLY')
            (root/'ordinary-private').mkdir(mode=0o700);scenario=root/'ordinary-private'/m.ORDINARY_SCENARIO_NAME;scenario.write_bytes(b'OFFLINE_SYNTHETIC_ONLY');scenario.chmod(0o600)
            original=m.Path.lstat
            def info(path,*args,**kwargs):
                value=original(path,*args,**kwargs);return SimpleNamespace(st_mode=value.st_mode,st_uid=0,st_nlink=value.st_nlink)
            with patch.object(m.Path,'lstat',info):self.assertTrue(m.clear_credentials(root,authority()['proposal'],authority()['postgresUid']))
            self.assertEqual(list((root/'credentials').iterdir()),[])
            self.assertFalse((root/'ordinary-private').exists())
    def process_model(self,*,parent='100',exe=None,state='S',start='222',actual_start='222',boot='00000000-0000-4000-8000-000000000001',pid=101,live=True):
        proc=SimpleNamespace(pid=pid,poll=lambda:None if live else 0);fields=['0']*20;fields[0]=state;fields[1]=parent;fields[19]=actual_start
        def read(path,*args,**kwargs):return boot if path.name=='boot_id' else '101 (node) '+' '.join(fields)
        with patch.object(m.os,'getpid',return_value=100),patch.object(m,'process_identity',return_value={'pid':pid,'starttime':start,'exe':exe or str(m.NODE)}),patch.object(m.Path,'read_text',read):return m.ordinary_child_process(proc)
    def test_real_child_identity_never_parent_pid_or_other_executable(self):
        self.assertEqual(self.process_model(),{'pid':101,'linuxStartTicks':'222','linuxBootId':'00000000-0000-4000-8000-000000000001'})
        for change in [dict(parent='99'),dict(exe='/untrusted/node'),dict(state='Z'),dict(actual_start='333'),dict(boot='unknown'),dict(pid=100),dict(live=False)]:
            with self.subTest(change=change),self.assertRaises(RuntimeError):self.process_model(**change)
    def test_fixed_runner_not_arbitrary_module_and_unknown_inputs_rejected(self):
        args=m.ordinary_runner_arguments(authority(),Path('/model'));self.assertEqual(args[:4],[str(m.NODE),'--no-global-search-paths','--input-type=module','--eval'])
        source=args[4];self.assertIn((m.DEPLOY/'tests/integration/live-ledger-balance-pairs.integration.test.ts').as_uri(),source);self.assertIn('runFresh35OrdinaryIntegration({...c,staffCredentialRequestTag:tag})',source)
        self.assertIn('REAL_CHILD_CAPACITY_BINDING_REQUIRED',source);self.assertIn('FIXED_PRIVATE_SCENARIO_REQUIRED',source);self.assertIn('PRIVATE_CONTEXT_UNAVAILABLE',source)
        self.assertIn('c.staffCredentialRequestTag!==null',source);self.assertNotIn('listen(',source);self.assertNotIn('throw Error(error',source);self.assertNotIn('error.message',source)
        self.assertIn('ORDINARY_OS_UID_REQUIRED',source)
        launch=m.ordinary_runner_launch(authority(),Path('/model'));self.assertEqual(launch['user'],authority()['postgresUid']);self.assertEqual(launch['group'],authority()['postgresGid']);self.assertEqual(launch['extra_groups'],[])
    def test_cleanup_preserves_unregistered_ordinary_file_and_wrong_owner(self):
        with tempfile.TemporaryDirectory() as dirname:
            root=Path(dirname);(root/'credentials').mkdir();(root/'pg-private').mkdir();ordinary=root/'ordinary-private';ordinary.mkdir(mode=0o700);unknown=ordinary/'unknown';unknown.write_bytes(b'RETAIN')
            original=m.Path.lstat
            def info(path,*args,**kwargs):
                value=original(path,*args,**kwargs);return SimpleNamespace(st_mode=value.st_mode,st_uid=0,st_nlink=value.st_nlink)
            with patch.object(m.Path,'lstat',info):self.assertFalse(m.clear_credentials(root,authority()['proposal'],authority()['postgresUid']))
            self.assertTrue(unknown.exists())
            def wrong_owner(path,*args,**kwargs):
                value=original(path,*args,**kwargs);return SimpleNamespace(st_mode=value.st_mode,st_uid=99999,st_nlink=value.st_nlink)
            with patch.object(m.Path,'lstat',wrong_owner):self.assertFalse(m.clear_credentials(root,authority()['proposal'],authority()['postgresUid']))
            self.assertTrue(unknown.exists())

class SceneReadbackTests(unittest.TestCase):
    def model(self):
        model=SnapshotAndStageTests();model.setUp();uid=lambda n:'00000000-0000-4000-8000-'+str(n).zfill(12)
        publication={key:uid(i) for i,key in enumerate(['initializerOperationId','baselineBatchId','documentBatchId','baselinePublicationOperationId','documentPublicationOperationId','accountId','adminStaffId'],1)}
        publication.update(sourceHash='d'*64,historyPayloadHash=None,loginName='synthetic-fresh35-admin',loginEnabled=True,adminRole='ADMIN',adminEmployment='在职')
        kinds=['HALL','HALL','WAREHOUSE','WAREHOUSE','CUSTOMER','STAFF','PRODUCT','SKU','SKU_BARCODE','PAYMENT_ACCOUNT','PAYMENT_METHOD']
        refs=[{'kind':kind,'value':{'id':uid(i+10)}} for i,kind in enumerate(kinds)]
        wh=[r['value']['id'] for r in refs if r['kind']=='WAREHOUSE'];sku=next(r['value']['id'] for r in refs if r['kind']=='SKU')
        balances=[{'warehouseId':w,'skuId':sku,'quantity':'0','version':1,'present':True} for w in wh]
        rows=[model.context,{'kind':'publication','rows':[publication]},{'kind':'references','rows':refs},{'kind':'balances','rows':balances}]
        return model,rows
    def observe(self,model,rows):
        raw='\n'.join(json.dumps(r) for r in rows)
        with patch.object(m,'psql',return_value=raw) as query:result=m.observe_scene(model.a,model.target,{'manifestSha256':'d'*64,'planSha256':'e'*64},12)
        return result,query
    def test_three_finite_selects_same_rr_actual_null_preserved(self):
        model,rows=self.model();result,query=self.observe(model,rows)
        self.assertIsNone(result['publication']['historyPayloadHash']);self.assertEqual(len(result['balances']),2)
        query.assert_called_once();args=query.call_args.args;self.assertEqual(args[1],model.a['proposal']['admin']);self.assertEqual(args[-1],12)
        sql=args[3];self.assertTrue(sql.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'));self.assertTrue(sql.endswith('ROLLBACK;\n'))
        self.assertEqual(sql.count("coalesce(json_agg(q),'[]'::json)"),3);self.assertNotIn('$1',sql);self.assertNotIn('$2',sql)
        self.assertIn('synthetic.unified.v1',sql);self.assertIn('FROM scene_published',sql);self.assertNotIn('password_hash',sql);self.assertNotIn('COALESCE(b.quantity',sql)
    def test_missing_duplicate_wrong_batch_or_filtered_role_refused(self):
        for change in [lambda r:r[1]['rows'].clear(),lambda r:r[1]['rows'].append(r[1]['rows'][0]),lambda r:r[1]['rows'][0].update(sourceHash='a'*64),lambda r:r[2]['rows'].pop(),lambda r:r[3]['rows'][0].update(present=False,quantity=None,version=None),lambda r:r[0].update(actor='owner'),lambda r:r[0]['tables'][0].update(rlsActive=True)]:
            model,rows=self.model();change(rows)
            with self.assertRaises(RuntimeError):self.observe(model,rows)
    def test_sql_binding_injection_or_unknown_not_accepted(self):
        for binding in [{},{'manifestSha256':"';select secret;--",'planSha256':'e'*64},{'manifestSha256':'d'*64,'planSha256':None}]:
            with self.assertRaises(RuntimeError):m.scene_readback_sql(binding)

class OrdinaryCapacityPreparationTests(unittest.TestCase):
    def model(self,root):
        a=authority();p=a['proposal'];process={'pid':123,'linuxStartTicks':'456','linuxBootId':'00000000-0000-4000-8000-000000000001'}
        target={'physical':{'databaseOid':'12345','postmasterStart':'MODEL_BIRTH','systemIdentifier':'777','serverVersionNum':'170011'}}
        facts={'process':process,'namespace':'linux:mnt:[MODEL]','volumes':{k:{'path':str(root/k),'namespace':'linux:mnt:[MODEL]','device':'1','filesystemType':'2'} for k in ['postgres','wal','backup','system','media']}}
        scene={'publication':{'sourceHash':'d'*64,'historyPayloadHash':None},'balances':[],'observedAtMillis':NOW+1}
        config={'build':{'sourceCommit':'a'*40},'postgres':{'max':1,'target':{'host':p['host'],'port':p['port'],'database':p['database'],'user':p['runtime'],'password':'MODEL_PRIVATE_DO_NOT_EXPORT'}},'productMedia':{'root':str(root/'media')}}
        return a,target,process,facts,scene,config
    def profile_file(self,root):
        path=root/'capacity/owner-profile.json';path.parent.mkdir();path.write_bytes(b'');path.chmod(0o644);return path
    def prepare(self,root,path,*,change=None,readonly=True):
        a,target,process,facts,scene,config=self.model(root)
        if change:change(a,target,process,facts,scene,config)
        original=m.os.fstat
        def info(fd):
            s=original(fd);return SimpleNamespace(st_mode=s.st_mode,st_uid=0,st_nlink=s.st_nlink,st_size=s.st_size,st_dev=s.st_dev,st_ino=s.st_ino)
        with patch.object(m,'PARENT',root),patch.object(m,'CAPACITY_PROFILE',path),patch.object(m,'trusted'),patch.object(m,'ordinary_child_process',return_value=process),patch.object(m.time,'time',return_value=NOW/1000+2),patch.object(m.os,'fstat',side_effect=info),patch.object(m.os,'statvfs',return_value=SimpleNamespace(f_flag=m.os.ST_RDONLY if readonly else 0)):
            return m.prepare_ordinary_capacity(a,target,{'sourceSetSha256':'b'*64},root,object(),facts,scene,config)
    def test_exact_template_actual_profile_hash_same_inode_and_no_secret(self):
        with tempfile.TemporaryDirectory() as dirname:
            root=Path(dirname);path=self.profile_file(root);before=path.stat();launch=self.prepare(root,path);data=path.read_bytes();profile=json.loads(data)
            self.assertEqual(path.stat().st_ino,before.st_ino);self.assertEqual(launch['producer']['args'],['--profile='+hashlib.sha256(data).hexdigest()]);self.assertEqual(profile['reviewSha256'],m.CAPACITY_REVIEW_SHA)
            self.assertEqual(launch['process']['pid'],123);self.assertEqual(launch['window']['expiresAt'],NOW+1200000);self.assertEqual(launch['budgets']['session']['maxAdmissions'],64);self.assertEqual(launch['budgets']['upload']['maxAdmissions'],1)
            self.assertEqual(set(profile['binding']['physicalVolumes'].values()),{'linux:mnt:[MODEL]:1:2'})
            self.assertTrue(all(isinstance(v,str) for v in launch['minimumFreeBytes'].values()));self.assertNotIn(b'MODEL_PRIVATE_DO_NOT_EXPORT',data);self.assertNotIn(b'availableBytes',data)
            with self.assertRaisesRegex(RuntimeError,'EMPTY_PROFILE_ALIAS_REQUIRED'):self.prepare(root,path)
            self.assertEqual(path.read_bytes(),data)
    def test_unknown_configuration_wrong_role_or_expired_scope_refused(self):
        changes=[lambda a,t,p,f,s,c:c['build'].update(sourceCommit='UNKNOWN'),lambda a,t,p,f,s,c:c['postgres']['target'].update(user='postgres'),lambda a,t,p,f,s,c:c['postgres'].update(max=2),lambda a,t,p,f,s,c:a.update(expiresAt=NOW+30000),lambda a,t,p,f,s,c:f.update(process={**p,'pid':999})]
        for change in changes:
            with tempfile.TemporaryDirectory() as dirname:
                root=Path(dirname);path=self.profile_file(root)
                with self.assertRaises(RuntimeError):self.prepare(root,path,change=change)
                self.assertEqual(path.read_bytes(),b'')
    def test_profile_alias_must_be_readonly(self):
        with tempfile.TemporaryDirectory() as dirname:
            root=Path(dirname);path=self.profile_file(root)
            with self.assertRaisesRegex(RuntimeError,'EMPTY_PROFILE_ALIAS_REQUIRED'):self.prepare(root,path,readonly=False)
            self.assertEqual(path.read_bytes(),b'')

class OrdinaryScenarioConstructionTests(unittest.TestCase):
    def scene(self):
        model,rows=SceneReadbackTests().model();r={k:[] for k in ['HALL','WAREHOUSE','CUSTOMER','STAFF','PRODUCT','SKU','SKU_BARCODE','PAYMENT_ACCOUNT','PAYMENT_METHOD']}
        for row in rows[2]['rows']:r[row['kind']].append(row['value'])
        for values in r.values():
            for value in values:value['enabled']=True
        h=r['HALL'][0];w=r['WAREHOUSE'][0];other=r['WAREHOUSE'][1];customer=r['CUSTOMER'][0];staff=r['STAFF'][0];p=r['PRODUCT'][0];sku=r['SKU'][0];barcode=r['SKU_BARCODE'][0];account=r['PAYMENT_ACCOUNT'][0];method=r['PAYMENT_METHOD'][0]
        h.update(defaultCustomerId=customer['id'],defaultWarehouseId=w['id']);w['hallId']=h['id'];other['hallId']=r['HALL'][1]['id'];staff.update(role='SALESPERSON',employmentStatus='在职',hallId=h['id']);p.update(deletedAt=None,retailPrice='1.00',minimumPrice='0.50');sku['productId']=p['id'];barcode.update(kind='MAIN',skuId=sku['id']);account['methodId']=method['id']
        return {'publication':rows[1]['rows'][0],'references':r,'balances':rows[3]['rows'],'planSha256':'e'*64,'observedAtMillis':NOW}
    def test_proposals_use_actual_refs_price_balances_and_23_new_keys(self):
        scene=self.scene()
        with patch('secrets.token_hex',return_value='1'*24),patch('secrets.token_urlsafe',return_value='MODEL_FORBIDDEN_PASSWORD'):s=m.build_ordinary_scenario(scene,'MODEL_ADMIN_PASSWORD')
        self.assertEqual(s['login']['accountId'],scene['publication']['accountId']);self.assertEqual(s['salesPositive']['lines'][0]['dealPrice'],'1.00');self.assertEqual([line['quantity'] for line in s['salesMixed']['lines']],['2','-1'])
        self.assertEqual(s['initialInventory'],[{k:b[k] for k in ['warehouseId','skuId','quantity','version']} for b in scene['balances']]);self.assertEqual(s['forbidden']['staffId'],scene['references']['STAFF'][0]['id']);self.assertNotEqual(s['forbidden']['sales']['hallId'],s['salesPositive']['hallId'])
        keys=[key for values in s['keys'].values() for key in values.values()]+[s['forbidden']['requestKey'],s['forbidden']['setupRequestKey']];self.assertEqual(len(keys),23);self.assertEqual(len(set(keys)),23)
    def test_unknown_disabled_or_wrong_reference_never_filled(self):
        changes=[lambda s:s['references']['PRODUCT'][0].update(retailPrice=None),lambda s:s['references']['PRODUCT'][0].update(minimumPrice=None),lambda s:s['references']['SKU'][0].update(enabled=False),lambda s:s['references']['SKU_BARCODE'][0].update(kind='ALIAS'),lambda s:s['references']['PAYMENT_ACCOUNT'][0].update(methodId='other'),lambda s:s['references']['STAFF'][0].update(employmentStatus='离职'),lambda s:s['references']['WAREHOUSE'][1].update(hallId=s['references']['HALL'][0]['id'])]
        for change in changes:
            scene=self.scene();change(scene)
            with self.assertRaises(RuntimeError):m.build_ordinary_scenario(scene,'MODEL_ADMIN_PASSWORD')

class OrdinaryBusinessFlowTests(unittest.TestCase):
    def drive(self,*,failure=None,owned=True,watch_alive=True):
        events=[];written={};context={};a=authority();root=Path('/model');process={'pid':123,'linuxStartTicks':'456','linuxBootId':'00000000-0000-4000-8000-000000000001'}
        class Child:
            pid=123;returncode=None
            def poll(self):return self.returncode
            def communicate(self,input,timeout):
                events.append('communicate');context.update(json.loads(input))
                if failure=='timeout':raise m.subprocess.TimeoutExpired(['node'],timeout)
                self.returncode=1 if failure=='result' else 0
                return json.dumps({'state':'FRESH35_ORDINARY_RUNNER_COMPLETED','connectionCleanup':'CLOSED','browserVerified':False,'networkVerified':False,'productionVerified':False}).encode(),b''
            def send_signal(self,signal):events.append('terminate');self.returncode=-signal
            def kill(self):events.append('kill');self.returncode=-9
            def wait(self,timeout=None):events.append('wait');return self.returncode
        child=Child();watch=SimpleNamespace(poll=lambda:None if watch_alive else 1)
        scene={'publication':{'documentBatchId':'MODEL_BATCH','sourceHash':'d'*64,'historyPayloadHash':None},'planSha256':'e'*64};descriptor={'sourceSetSha256':'a'*64,'programSha256':'b'*64,'targetSha256':'c'*64}
        capacity={'window':{'binding':{'candidateFingerprint':'f'*40}},'producer':{'args':['--profile='+'d'*64]}}
        def spawn(**kwargs):events.append('spawn');self.assertEqual(kwargs['user'],a['postgresUid']);return child
        with patch.object(m.time,'monotonic',return_value=10),patch.object(m,'build_ordinary_scenario',return_value={}),patch.object(m,'write_ordinary_scenario',return_value=root/'ordinary-private'/m.ORDINARY_SCENARIO_NAME),patch.object(m,'prepare_ordinary_directories'),patch.object(m,'hydrate_ordinary_configuration',return_value={'postgres':{'target':{'password':'MODEL_PRIVATE_NO_EXPORT'}}}),patch.object(m.subprocess,'Popen',side_effect=spawn),patch.object(m,'ordinary_child_process',return_value=process),patch.object(m,'collect_ordinary_capacity_facts',return_value={}),patch.object(m,'prepare_ordinary_capacity',return_value=capacity),patch.object(m,'same_process',return_value=owned),patch.object(m,'json_new',side_effect=lambda path,value:written.update({path.name:value})):
            try:result=m.run_ordinary_business(a,{},descriptor,root,scene,{},'MODEL_PRIVATE_NO_EXPORT',watch,200);error=None
            except Exception as raised:result=None;error=raised
        return result,error,events,written,context
    def test_actual_flow_sends_private_context_once_and_keeps_null_history(self):
        result,error,events,written,context=self.drive();self.assertIsNone(error);self.assertEqual(events.count('spawn'),1);self.assertEqual(events.count('communicate'),1)
        self.assertIsNone(context['publication']['historyPayloadHash']);self.assertEqual(context['publication']['planSha256'],'e'*64);self.assertIsNone(context['staffCredentialRequestTag'])
        self.assertEqual(result['sourceSetSha256'],'a'*64);self.assertEqual(result['sourceCommit'],'f'*40);self.assertTrue(written['ordinary-child-cleanup.json']['childReaped']);self.assertNotIn('MODEL_PRIVATE_NO_EXPORT',json.dumps(result)+json.dumps(written))
    def test_unknown_result_not_replayed_and_receipt_kept_as_unknown(self):
        result,error,events,written,_=self.drive(failure='result');self.assertIsNone(result);self.assertIsNotNone(error);self.assertEqual(events.count('communicate'),1);self.assertEqual(written['ordinary-failure.json']['state'],'FAILED_OR_OUTCOME_UNKNOWN');self.assertFalse(written['ordinary-failure.json']['automaticRetry'])
    def test_timeout_only_owned_child_stopped_and_reaped(self):
        result,error,events,written,_=self.drive(failure='timeout');self.assertIsNone(result);self.assertIsInstance(error,m.subprocess.TimeoutExpired);self.assertEqual(events.count('spawn'),1);self.assertIn('terminate',events);self.assertTrue(written['ordinary-child-cleanup.json']['childReaped'])
    def test_unowned_live_child_not_signalled_or_reported_clean(self):
        _,error,events,written,_=self.drive(failure='timeout',owned=False);self.assertIn('ORDINARY_NODE_CLEANUP_UNCONFIRMED',str(error));self.assertNotIn('terminate',events);self.assertNotIn('kill',events);self.assertFalse(written['ordinary-child-cleanup.json']['childReaped'])
    def test_dead_guardian_no_child_or_business(self):
        result,error,events,_,_=self.drive(watch_alive=False);self.assertIsNone(result);self.assertIsNotNone(error);self.assertNotIn('spawn',events);self.assertNotIn('communicate',events)

class OrdinaryRuntimeTemplateTests(unittest.TestCase):
    def template(self):return json.loads((PATH.parents[3]/'deploy/runtime/fresh35-ordinary-runtime-v1.json').read_text())
    def read_model(self,change=None,web=True):
        a=authority();p=a['proposal'];config=self.template()
        with tempfile.TemporaryDirectory() as dirname:
            root=Path(dirname);(root/'web').mkdir()
            if web:(root/'web/index.html').write_bytes(b'MODEL_WEB_NOT_RELEASE_EVIDENCE')
            config['assets']={'root':str(root/'web'),'entry':'index.html'}
            config['postgres']['target'].update(host=p['host'],port=p['port'],database=p['database'],user=p['runtime'])
            config['productMedia']['root']=str(Path(p['workspaceDirectory'])/'media');config['staffCredentialRequestKeyFile']=str(Path(p['workspaceDirectory'])/'ordinary-private'/m.ORDINARY_CREDENTIAL_KEY_NAME)
            if change:change(config)
            path=root/'runtime.json';path.write_text(json.dumps(config));original=m.os.fstat
            def info(fd):
                s=original(fd);return SimpleNamespace(st_mode=s.st_mode,st_uid=0,st_nlink=s.st_nlink,st_size=s.st_size,st_dev=s.st_dev,st_ino=s.st_ino,st_mtime_ns=s.st_mtime_ns,st_ctime_ns=s.st_ctime_ns)
            with patch.object(m,'ORDINARY_CONFIGURATION',path),patch.object(m,'DEPLOY',root),patch.object(m,'trusted'),patch.object(m.os,'fstat',side_effect=info):return m.read_ordinary_configuration(a)
    def fixed_build(self,c):c['build'].update(sourceCommit='1'*40,buildId='OFFLINE_MODEL_BUILD')
    def test_null_source_template_refused_before_target_creation(self):
        with self.assertRaisesRegex(RuntimeError,'ISSUANCE_BUILD_NOT_FIXED'):self.read_model()
    def test_issuance_copy_requires_real_shaped_build_and_exact_scope(self):
        config=self.read_model(self.fixed_build);self.assertEqual(config['build']['sourceCommit'],'1'*40);self.assertIsNone(config['postgres']['target']['password'])
        for change in [lambda c:c['postgres']['target'].update(user='postgres'),lambda c:c['postgres']['target'].update(password='MODEL_CREDENTIAL_NOT_ALLOWED_IN_PACKAGE'),lambda c:c.update(publicOrigin='https://other.invalid'),lambda c:c.update(staffCredentialRequestKeyFile='/arbitrary/key')]:
            def apply(c):self.fixed_build(c);change(c)
            with self.assertRaises(RuntimeError):self.read_model(apply)
        with self.assertRaisesRegex(RuntimeError,'EXACT_WEB_ARTIFACT_REQUIRED'):self.read_model(self.fixed_build,web=False)
    def test_private_runtime_passfile_hydrates_copy_not_public_template(self):
        a=authority();p=a['proposal'];config={'postgres':{'target':{'password':None}}};raw=f"127.0.0.1:{p['port']}:*:{p['runtime']}:".encode()+b'a'*64+b'\n'
        with patch.object(m,'read_private',return_value=raw) as read:private=m.hydrate_ordinary_configuration(a,config)
        self.assertIsNone(config['postgres']['target']['password']);self.assertEqual(private['postgres']['target']['password'],'a'*64);read.assert_called_once_with(Path(p['workspaceDirectory'])/'credentials'/(p['runtime']+'.pgpass'))
        for invalid in [b'wrong-role:a\n',raw+b'\n',raw.replace(b'a'*64,b'bad')]:
            with patch.object(m,'read_private',return_value=invalid),self.assertRaisesRegex(RuntimeError,'EXACT_RUNTIME_PASSFILE_REQUIRED'):m.hydrate_ordinary_configuration(a,config)

class LinuxRuntimeLoadTests(unittest.TestCase):
    def test_real_loader_result_is_explicit_linux_and_locked_versions(self):
        expected={'platform':'linux','arch':'x64','fastify':'5.12.5','pg':'8.23.1','sharp':'0.35.5','libvips':'8.18.0'}
        with patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=json.dumps(expected).encode())) as run:self.assertEqual(m.load_linux_runtime_dependencies(Path('/model')),expected)
        call=run.call_args;self.assertEqual(call.args[0][0],str(m.NODE));self.assertIn("createRequire('"+(m.DEPLOY/'package.json').as_uri(),call.args[0][-1]);self.assertIn('sharp.versions?.sharp',call.args[0][-1]);self.assertNotIn("require('sharp/package.json')",call.args[0][-1]);self.assertEqual(call.kwargs['timeout'],20)
    def test_wrong_platform_version_or_native_load_error_refuses(self):
        good={'platform':'linux','arch':'x64','fastify':'5.12.5','pg':'8.23.1','sharp':'0.35.5','libvips':'8.18.0'}
        for change in [dict(platform='darwin'),dict(arch='arm64'),dict(sharp='old'),dict(libvips=None)]:
            with patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=json.dumps({**good,**change}).encode())),self.assertRaises(RuntimeError):m.load_linux_runtime_dependencies(Path('/model'))
        with patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout=b'',stderr=b'PRIVATE_BODY_MUST_NOT_EXPORT')),self.assertRaisesRegex(RuntimeError,'LINUX_RUNTIME_DEPENDENCY_LOAD_FAILED') as error:m.load_linux_runtime_dependencies(Path('/model'))
        self.assertNotIn('PRIVATE_BODY',str(error.exception))

class InstallChildDiagnosticTests(unittest.TestCase):
    def payload(self):
        return {'state':'INSTALL_FAILED_OR_OUTCOME_UNKNOWN','code':'FRESH35_ISOLATED_ENTRY_FAILED','installState':'ROLLBACK_UNCONFIRMED','validationStage':None,'validationCode':None,'automaticRetry':False,'stage':'STEP','step':'physical-empty-target','originalSQLSTATE':'42601','originalInternalCode':None,'rollbackSQLSTATE':None,'rollbackInternalCode':'FRESH35_COMBINED_PROTOCOL_NOT_READY'}
    def capture(self,raw):
        saved={}
        with patch.object(m,'json_new',side_effect=lambda p,v:saved.update({p.name:v})):
            m.persist_install_child_failure(Path('/fixed'),SimpleNamespace(returncode=1,stderr=raw,stdout=b'SECRET_SENTINEL'),{'statements':[{'name':'physical-empty-target'}]})
        return saved['installation-child-failure.json']
    def test_closed_diagnostic_preserves_separate_errors_without_raw(self):
        v=self.payload();r=self.capture(json.dumps(v).encode());self.assertFalse(r['diagnosticUnavailable']);self.assertEqual({k:r[k] for k in v},v);self.assertEqual(r['exitCode'],1);self.assertNotIn('SECRET_SENTINEL',json.dumps(r))
    def test_failed_no_installed_result_is_preserved_without_outcome_inference(self):
        v={**self.payload(),'installState':'FAILED_NO_INSTALLED_RESULT','stage':'BOUND','step':None,'originalSQLSTATE':None,'rollbackInternalCode':None};r=self.capture(json.dumps(v).encode());self.assertFalse(r['diagnosticUnavailable']);self.assertEqual(r['installState'],'FAILED_NO_INSTALLED_RESULT');self.assertEqual(r['state'],'INSTALL_FAILED_OR_OUTCOME_UNKNOWN');self.assertFalse(r['automaticRetry']);self.assertNotIn('commitOutcome',r)
    def test_invalid_or_sensitive_payload_is_not_persisted(self):
        cases=[{**self.payload(),'message':'SECRET_SENTINEL'},{**self.payload(),'stage':'SQL select'},{**self.payload(),'originalSQLSTATE':'SECRET_SENTINEL'},{**self.payload(),'rollbackInternalCode':'PASSWORD_SECRET'},{**self.payload(),'step':'select * from users'},{**self.payload(),'step':'valid-looking-but-not-compiled'},{**self.payload(),'automaticRetry':True},{**self.payload(),'installState':{}},{**self.payload(),'validationCode':'unsafe detail'}]
        for v in cases:
            with self.subTest(v=v):
                r=self.capture(json.dumps(v).encode());self.assertTrue(r['diagnosticUnavailable']);self.assertEqual(set(r),{'state','exitCode','automaticRetry','diagnosticUnavailable'});self.assertNotIn('SECRET_SENTINEL',json.dumps(r))
    def test_duplicate_malformed_and_size_boundary(self):
        raw=json.dumps(self.payload()).encode();exact=raw+b' '*(16384-len(raw));self.assertFalse(self.capture(exact)['diagnosticUnavailable'])
        for raw in [exact+b' ',b'not JSON SECRET_SENTINEL',b'{"state":1,"state":2}',b'\xff',b'',b'[]']:
            with self.subTest(bytes=len(raw)):self.assertTrue(self.capture(raw)['diagnosticUnavailable'])
    def test_source_failure_capture_precedes_original_failure_and_no_retry(self):
        source=PATH.read_text();start=source.index("r=subprocess.run(argv+['--execute']");end=source.index("result=strict_json(r.stdout)",start);part=source[start:end];self.assertLess(part.index('persist_install_child_failure(root,r,descriptor)'),part.index("need(r.returncode==0,'INSTALL_FAILED_OR_OUTCOME_UNKNOWN')"));self.assertEqual(part.count('subprocess.run'),1)

class BootstrapNetworkObservationTests(unittest.TestCase):
    def fixture(self,root):
        a=authority();a['proposal']['workspaceDirectory']=str(root);root.chmod(0o711)
        p=a['proposal'];obs={'systemIdentifier':'7700000000000000001','databaseOid':'16393','serverVersionNum':'170011','postmasterStart':'2026-11-06 00:00:00+00','address':'127.0.0.1','port':p['port'],'actor':p['admin'],'listenAddresses':'127.0.0.1','unixSocketDirectories':'','dataDirectory':str(root/'data'),'hbaFile':str(root/'data/pg_hba.conf')}
        return a,obs
    def test_actual_proof_is_closed_readonly_and_private_modes_unchanged(self):
        import os,stat
        with tempfile.TemporaryDirectory() as d,patch.object(m,'trusted',side_effect=lambda p:Path(p)):
            root=Path(d);a,obs=self.fixture(root);(root/'credentials').mkdir(mode=0o700);m.write_new(root/'credentials/admin.pgpass',b'synthetic-private',0o400);old=os.umask(0o077)
            try:proof=m.persist_bootstrap_network_observation(a,{**obs,'ignoredSecret':'NEVER_COPY'},obs['systemIdentifier'])
            finally:os.umask(old)
            p=root/'bootstrap-network-observation.json';saved=json.loads(p.read_text());self.assertEqual(saved,proof);self.assertEqual(len(saved),13);self.assertNotIn('ignoredSecret',saved);self.assertEqual(saved['sourceSetSha256'],a['sourceSetSha256']);self.assertEqual(saved['unixSocketDirectories'],'');self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o444);self.assertEqual(p.stat().st_nlink,1);self.assertEqual(stat.S_IMODE(root.stat().st_mode),0o711);self.assertEqual(stat.S_IMODE((root/'credentials').stat().st_mode),0o700);self.assertEqual(stat.S_IMODE((root/'credentials/admin.pgpass').stat().st_mode),0o400)
    def test_wrong_actual_tuple_or_network_never_creates_proof(self):
        changes=[{'systemIdentifier':'7700000000000000002'},{'databaseOid':'0'},{'serverVersionNum':'160000'},{'postmasterStart':''},{'address':'0.0.0.0'},{'port':1},{'actor':'wrong-admin'},{'listenAddresses':'*'},{'unixSocketDirectories':'/tmp'},{'dataDirectory':'/other'},{'hbaFile':'/other'}]
        for change in changes:
            with self.subTest(change=change),tempfile.TemporaryDirectory() as d,patch.object(m,'trusted',side_effect=lambda p:Path(p)):
                root=Path(d);a,obs=self.fixture(root)
                with self.assertRaises(RuntimeError):m.persist_bootstrap_network_observation(a,{**obs,**change},obs['systemIdentifier'])
                self.assertFalse((root/'bootstrap-network-observation.json').exists())
    def test_same_path_is_exclusive_and_existing_proof_not_rewritten(self):
        with tempfile.TemporaryDirectory() as d,patch.object(m,'trusted',side_effect=lambda p:Path(p)):
            root=Path(d);a,obs=self.fixture(root);m.persist_bootstrap_network_observation(a,obs,obs['systemIdentifier']);p=root/'bootstrap-network-observation.json';before=(p.stat().st_ino,p.read_bytes())
            with self.assertRaises(FileExistsError):m.persist_bootstrap_network_observation(a,obs,obs['systemIdentifier'])
            self.assertEqual(before,(p.stat().st_ino,p.read_bytes()))
    def test_parent_traversal_and_original_json_default_mode_remain_exact(self):
        import stat
        with tempfile.TemporaryDirectory() as d,patch.object(m,'trusted',side_effect=lambda p:Path(p)):
            root=Path(d);a,obs=self.fixture(root);root.chmod(0o700)
            with self.assertRaisesRegex(RuntimeError,'NETWORK_OBSERVATION_PARENT_MODE'):m.persist_bootstrap_network_observation(a,obs,obs['systemIdentifier'])
            m.json_new(root/'original-private.json',{'fixed':True});self.assertEqual(stat.S_IMODE((root/'original-private.json').stat().st_mode),0o400)

if __name__=='__main__':unittest.main()
