"""Exact R4 independent parameters/input projection and existing-controller expiry CAS.
No new role/password/grant, no business import, no old record/window rewrite.
Execute once only after C binds this source and parameters; unknown => original key.
"""
import sys,os,json,hashlib,importlib.util,re,time
from pathlib import Path
sys.dont_write_bytecode=True
OPS_SHA='18569bacc3f5d85a3b0ec69c4588e4c4a65fa76ee77183a6f2d57dba595fc90b'
PLAN_SHA='6174199cf7d33bfaade9710b3c53915d8e4c20815848d0650af0e25190a031d1'
KEY='t45-r4-independent-real-inputs-20261107-02'
def main():
 job=Path(os.environ['ERP_SHARED_JOB_DIR']);assert os.getuid()==0 and os.environ['ERP_SHARED_TASK_ID']=='T45' and job.name==KEY
 assert len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1])
 leaf=job/'bundle/fresh35-production-carrier.py';assert hashlib.sha256(leaf.read_bytes()).hexdigest()==OPS_SHA
 spec=importlib.util.spec_from_file_location('reviewed_real_ops',leaf);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 plan=m.load_production_plan(str(job/'bundle/production-plan.json'),PLAN_SHA);facts=m.production_facts(plan)
 assert facts['status']=='DURABLE_PRODUCTION_SHARED_NAMESPACE_FACTS_NOT_DEPLOYMENT_APPROVAL' and facts['cid']=='5d8eb16163d22593513a01ad3d7ddb600fd2fce482e9a98886aade33d2b3fb06'
 raw=m.read_file(job/'bundle/input-plan.json',65536,True);assert m.sha(raw)==sys.argv[1];d=m.strict(raw)
 assert set(d)=={'format','requestKey','parametersSha256','startsAt','expiresAt','authorizationReference'} and d['format']=='T45_EXACT_R4_INDEPENDENT_REAL_INPUTS_V1' and d['requestKey']==KEY and re.fullmatch('[a-f0-9]{64}',d['parametersSha256'])
 assert type(d['startsAt']) is int and type(d['expiresAt']) is int and d['startsAt']<=int(time.time()*1000)<d['expiresAt']<=d['startsAt']+1200000
 parameters=m.read_file(job/'bundle/operation-parameters.json',65536,True);assert m.sha(parameters)==d['parametersSha256']
 code=r'''import os,sys,json,hashlib,runpy,stat,subprocess,re,datetime,time
from pathlib import Path
packet=json.loads(sys.stdin.buffer.readline());assert hashlib.sha256(packet['source'].encode()).hexdigest()==packet['sourceSha256'];g={'__name__':'inert_exact_ops','__file__':'<reviewed-real-ops>'};exec(compile(packet['source'],g['__file__'],'exec'),g)
p=json.loads(packet['parameters']);d=packet['description'];assert p['authorizationReference']==d['authorizationReference'] and d['startsAt']<=int(time.time()*1000)<d['expiresAt']
dep=Path('/opt/naijue-erp/fresh35-combined-v1');work=Path('/var/lib/naijue-erp/fresh35-production/production-fresh35-20261107-r4');real=Path('/var/lib/naijue-erp/fresh35-production/real-r3');operation=real/'independent-real-inputs-20261107-02'
a=json.loads(Path('/etc/naijue-erp/fresh35-production-provision-v2.json').read_bytes());assert a['proposal']['database']=='erp_native35_20261107_r4' and a['proposal']['controller']=='erp35_controller_20261107_r4' and a['proposal']['admin']=='erp35_admin_20261107_r4' and a['proposal']['port']==18654
f=runpy.run_path(str(dep/'scripts/release/unified-install/launch-fresh35-production-v2.py'));core=f['load_primitives'](a)
recordPath=Path('/etc/naijue-erp/fresh35-combined-installation-v1.json');record=g['read_file'](recordPath,1048576);assert g['sha'](record)=='a7d12f1f21f730c0e0c19dd6136c501c74d43e0e866e62d2f51aa908ea4f970f'
program=g['strict'](g['read_file'](work/'program-description.json',1048576,True));target=g['strict'](g['read_file'](work/'target-binding.json',1048576,True));installation=g['strict'](g['read_file'](work/'installation-result.json',65536,True));f['assert_retention'](a,target,program,installation,record)
owned=g['strict'](g['read_file'](work/'owned-process.json',65536,True));assert core.same_process(owned)
service=g['read_file'](work/'service-retained.json',1048576,True);assert p['serviceReceipt']=={'path':'/etc/naijue-erp/fresh35-retained-service-v1.json','sha256':g['sha'](service)}
validator="import fs from 'node:fs';import{validateInstalledRealWindow as validate}from '"+g['REAL_OPERATION_ROOT']+"/scripts/release/unified-install/fresh35-installed-real-window-v1.mjs';let v=JSON.parse(fs.readFileSync(0,'utf8'));validate(v.p,v.record,v.recordSha,v.current,v.service);console.log(JSON.stringify({valid:true}));"
checked=subprocess.run([str(dep/'runtime/node/bin/node'),'--no-global-search-paths','--input-type=module','-e',validator],input=json.dumps({'p':p,'record':json.loads(record),'recordSha':g['sha'](record),'current':g['REAL_OPERATION_SOURCE'],'service':json.loads(service)}).encode(),capture_output=True,timeout=15)
assert checked.returncode==0 and json.loads(checked.stdout)=={'valid':True}
credential=real/'maintenance-recovery-20261107-01/admin.pgpass';z=credential.lstat();assert stat.S_ISREG(z.st_mode) and z.st_uid==z.st_gid==0 and z.st_nlink==1 and stat.S_IMODE(z.st_mode)==0o600
connection=g['strict'](g['read_file'](real/'controller-connection.json',65536,True));assert set(connection)=={'host','port','database','user','password'} and {k:v for k,v in connection.items() if k!='password'}=={'host':'127.0.0.1','port':18654,'database':'erp_native35_20261107_r4','user':'erp35_controller_20261107_r4'} and type(connection['password']) is str and re.fullmatch('[a-f0-9]{64}',connection['password']);del connection
env=core.clean_env(work,a['proposal']['admin']);env['PGPASSFILE']=str(credential)
def sql(query):
 r=subprocess.run([str(core.BIN/'psql'),'-X','-qAt','--no-password','--host','127.0.0.1','--port','18654','--dbname','erp_native35_20261107_r4','--username','erp35_admin_20261107_r4','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate'],input=query.encode(),capture_output=True,env=env,timeout=12)
 if r.returncode:
  codes=re.findall(rb'(?:ERROR|FATAL):\s+([0-9A-Z]{5})(?:\s|$)',r.stderr);raise ValueError('PSQL_SQLSTATE_'+codes[-1].decode() if codes else 'PSQL_FAILED')
 return r.stdout.decode()
query="BEGIN READ ONLY; SET LOCAL statement_timeout='5000ms'; SELECT json_build_object('database',current_database(),'actor',session_user,'sid',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'oid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),'birth',pg_postmaster_start_time()::text,'adminValidUntil',(SELECT rolvaliduntil::text FROM pg_catalog.pg_roles WHERE rolname=session_user),'controller',(SELECT json_build_object('oid',oid::text,'name',rolname,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRls',rolbypassrls,'limit',rolconnlimit,'config',rolconfig,'until',rolvaliduntil::text,'memberships',(SELECT coalesce(json_agg(json_build_object('roleid',roleid::text,'member',member::text,'grantor',grantor::text,'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY roleid,member,grantor),'[]'::json) FROM pg_catalog.pg_auth_members WHERE member=r.oid OR roleid=r.oid)) FROM pg_catalog.pg_roles r WHERE rolname='erp35_controller_20261107_r4'))::text; COMMIT;"
before=json.loads(sql(query));assert before['database']=='erp_native35_20261107_r4' and before['actor']=='erp35_admin_20261107_r4' and before['sid']=='7705224458832691236' and before['oid']=='16393' and before['birth']=='2026-11-07 00:46:12.566314+00' and before['adminValidUntil']=='2026-11-07 03:29:02+00' and before['controller']['until']=='2026-11-07 01:04:39+00'
until=datetime.datetime.fromisoformat(p['controllerLoginValidUntil'].replace('Z','+00:00'));assert until.tzinfo is not None and until.timestamp()*1000==p['expiresAt'] and p['expiresAt']<=1794022142000
canonical=until.astimezone(datetime.timezone.utc).isoformat();assert re.fullmatch(r'[0-9T:.+\-]+',canonical)
assert not operation.exists();operation.mkdir(mode=0o700);g['new_json'](operation/'intent.json',{'description':d,'parametersSha256':g['sha'](packet['parameters'].encode()),'state':'NO_REPLAY_INTENT_BEFORE_PUBLIC_PROJECTIONS_AND_ROLE_CAS'})
servicePath=Path(p['serviceReceipt']['path']);paramsPath=Path('/etc/naijue-erp/fresh35-installed-real-window-v1.json');targetPath=real/'target.json'
assert not servicePath.exists() and not paramsPath.exists() and not targetPath.exists()
g['new_file'](servicePath,service,0o444);g['new_file'](paramsPath,packet['parameters'].encode(),0o600)
cliTarget={'protocol':'STANDARD_IMPORT_SQL_V1','system_identifier':'7705224458832691236','database_oid':'16393','database_name':'erp_native35_20261107_r4','catalog_sha256':json.loads(record)['catalogSha256']};g['new_json'](targetPath,cliTarget)
g['real_operation_parameters']({'operationParametersSha256':d['parametersSha256'],'startsAt':d['startsAt'],'expiresAt':d['expiresAt']},a,work,program,record)
assert core.same_process(owned) and int(time.time()*1000)<min(d['expiresAt'],p['expiresAt'])-15000
change="BEGIN; SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='5000ms'; DO $r4$ BEGIN IF session_user <> 'erp35_admin_20261107_r4' OR current_database() <> 'erp_native35_20261107_r4' OR (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) <> '7705224458832691236' OR (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) <> '16393' OR pg_postmaster_start_time() <> TIMESTAMPTZ '2026-11-07 00:46:12.566314+00' OR (SELECT rolvaliduntil FROM pg_catalog.pg_roles WHERE rolname=session_user) IS DISTINCT FROM TIMESTAMPTZ '2026-11-07 03:29:02+00' OR (SELECT rolvaliduntil FROM pg_catalog.pg_roles WHERE rolname='erp35_controller_20261107_r4') IS DISTINCT FROM TIMESTAMPTZ '2026-11-07 01:04:39+00' OR clock_timestamp() >= TIMESTAMPTZ '"+canonical+"' THEN RAISE EXCEPTION 'EXACT_R4_CONTROLLER_EXPIRY_CAS_DIFFERS'; END IF; END $r4$; ALTER ROLE erp35_controller_20261107_r4 VALID UNTIL '"+canonical+"'; COMMIT;"
sql(change);g['new_json'](operation/'commit-ack.json',{'state':'EXISTING_CONTROLLER_EXPIRY_COMMIT_ACK','until':canonical,'parametersSha256':d['parametersSha256']})
after=json.loads(sql(query));assert {k:v for k,v in before.items() if k!='controller'}=={k:v for k,v in after.items() if k!='controller'} and {k:v for k,v in before['controller'].items() if k!='until'}=={k:v for k,v in after['controller'].items() if k!='until'} and datetime.datetime.fromisoformat(after['controller']['until']).timestamp()*1000==p['expiresAt'] and core.same_process(owned)
assert g['read_file'](recordPath,1048576)==record and g['read_file'](servicePath,1048576)==service and g['read_file'](paramsPath,65536,True)==packet['parameters'].encode()
result={'status':'EXACT_R4_INDEPENDENT_REAL_INPUTS_AND_EXISTING_CONTROLLER_FINITE_EXPIRY_READY','requestKey':d['requestKey'],'parametersSha256':d['parametersSha256'],'currentSourceSetSha256':g['REAL_OPERATION_SOURCE'],'before':before,'after':after,'serviceReceiptSha256':g['sha'](service),'targetFileSha256':g['sha'](targetPath.read_bytes()),'newPasswordRoleGrant':False,'oldRecordWindowChanged':False,'REALModeExecuted':False,'businessDatabaseWrites':False,'automaticRetry':False};g['new_json'](operation/'result.json',result);print(json.dumps(result),flush=True)
'''
 packet={'source':leaf.read_text(),'sourceSha256':OPS_SHA,'parameters':parameters.decode(),'description':d}
 result=m.strict(m.run(['docker','exec','-i','--user','0:0',facts['cid'],'/usr/bin/python3','-I','-S','-c',code],data=(json.dumps(packet)+'\n').encode(),seconds=65))
 latest=m.production_facts(plan);assert latest['carrier']==facts['carrier'] and latest['pgProcess']==facts['pgProcess']
 m.new_json(job/'results/independent-real-inputs-result.json',result)
if __name__=='__main__':
 try:main()
 except Exception as e:
  print(json.dumps({'status':'STOP_OR_UNKNOWN_ORIGINAL_KEY_ONLY','code':str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]+',str(e)) else type(e).__name__,'automaticRetry':False}));raise SystemExit(2)
