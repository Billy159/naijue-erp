"""Apply fixed R1 runtime ACL only on the new database; inspect old auth metadata read-only."""
import datetime,hashlib,json,os,pathlib,re,socket,subprocess
J=pathlib.Path(os.environ['ERP_SHARED_JOB_DIR']);B=J/'bundle';O=J/'results';P=json.loads((B/'PLAN.json').read_text());V={'format':'rapid-launch-r1-acl-and-account-source-metadata-v1','jobId':P['jobId'],'oldDatabaseWrites':False,'credentialValuesReadOrExported':False,'businessRowsInserted':False,'productionSwitch':False}
def need(v,c):
 if not v:raise ValueError(c)
def inspect(name):
 p=subprocess.run(['docker','inspect',name],capture_output=True,check=True,timeout=15);return json.loads(p.stdout)[0]
def query(db,sql):
 p=subprocess.run(['docker','exec','--user','999:999','-i','naijue-prod-db-1','psql','--no-password','--no-psqlrc','-q','-U',USER,'-d',db,'-At','-v','ON_ERROR_STOP=1'],input=sql.encode(),capture_output=True,timeout=45)
 if p.returncode:
  V['failureDigest']={'exitCode':p.returncode,'stderrSha256':hashlib.sha256(p.stderr).hexdigest()};raise ValueError('ACL_OR_METADATA_QUERY_FAILED')
 return p.stdout.decode().strip()
def ident(s):
 need(isinstance(s,str) and re.fullmatch(r'[a-z_][a-z0-9_]{0,62}',s),'VERIFIED_SCHEMA_IDENTIFIER_REQUIRED');return '"'+s+'"'
def main():
 global USER
 need(os.geteuid()==0 and socket.gethostname()=='naijue-server' and J.name==P['jobId'],'EXACT_CURRENT_PROJECT_SCOPE')
 db=inspect('naijue-prod-db-1');env=dict(x.split('=',1) for x in db['Config']['Env']);USER=env['POSTGRES_USER'];ident(USER)
 target='erp_rewrite_20261022_r1';owner='erp_rewrite_owner_20261022';runtime='erp_rewrite_runtime_20261022'
 before=json.loads(query(target,"SELECT json_build_object('database',current_database(),'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),'versions',(SELECT json_agg(version ORDER BY version) FROM naijue_erp.schema_migration),'accounts',(SELECT count(*) FROM naijue_erp.user_account),'postmasterStartedAt',pg_postmaster_start_time()::text);"))
 need(before['database']==target and before['owner']==owner and before['versions']==list(range(1,20)) and before['accounts']==0,'EXACT_EMPTY_NEW_TARGET')
 V['phase']='target_verified_before_acl'
 sql=(B/'R1-SCHEMA19-RUNTIME-ACL.sql').read_text();need(hashlib.sha256(sql.encode()).hexdigest()==P['aclSha256'],'FIXED_ACL_BYTES')
 for key,value in [('target_db',target),('owner_role',owner),('runtime_role',runtime)]:sql=sql.replace(':"'+key+'"',ident(value))
 prior=query(target,"SELECT has_schema_privilege('"+runtime+"','naijue_erp','USAGE') AND has_table_privilege('"+runtime+"','naijue_erp.auth_session','INSERT') AND has_column_privilege('"+runtime+"','naijue_erp.user_account','password_hash','UPDATE');")
 if prior=='t':V['aclAction']='EXISTING_GRANTED_STATE_READBACK_ONLY_AFTER_PRIOR_OBSERVATION_FAILURE'
 else:
  query(target,'BEGIN;\nSET ROLE '+owner+';\n'+sql+'\nCOMMIT;');V['aclAction']='APPLIED_FIXED_R1_ACL'
 V['phase']='acl_role_rights_readback'
 role=json.loads(query(target,"SELECT json_build_object('name',rolname,'superuser',rolsuper,'createDb',rolcreatedb,'createRole',rolcreaterole,'bypassRls',rolbypassrls,'inherit',rolinherit,'memberships',(SELECT count(*) FROM pg_auth_members WHERE member=r.oid)) FROM pg_roles r WHERE rolname='"+runtime+"';"))
 need(not any(role[x] for x in ['superuser','createDb','createRole','bypassRls','inherit']) and role['memberships']==0,'NONPRIVILEGED_RUNTIME_NO_MEMBERSHIPS')
 rights=json.loads(query(target,'BEGIN READ ONLY; SET ROLE '+runtime+"; SELECT json_build_object('currentRole',current_user,'schemaCreate',has_schema_privilege(current_user,'naijue_erp','CREATE'),'accountSelect',has_table_privilege(current_user,'naijue_erp.user_account','SELECT'),'sessionInsert',has_table_privilege(current_user,'naijue_erp.auth_session','INSERT'),'salesInsert',has_table_privilege(current_user,'naijue_erp.sales_header','INSERT'),'sourceInsert',has_table_privilege(current_user,'naijue_erp.import_record','INSERT'),'authPasswordUpdate',has_column_privilege(current_user,'naijue_erp.user_account','password_hash','UPDATE')); COMMIT;").splitlines()[-1])
 need(rights['currentRole']==runtime and rights['accountSelect'] and rights['sessionInsert'] and rights['authPasswordUpdate'] and not rights['schemaCreate'] and not rights['salesInsert'] and not rights['sourceInsert'],'R1_RUNTIME_RIGHTS_SHAPE')
 V['newTarget']={'identity':before,'runtimeRole':role,'rights':rights,'aclSha256':P['aclSha256'],'authQueriesVerified':False,'actualPasswordConnectionVerified':False}
 V['phase']='old_account_source_metadata_readonly'
 app=inspect('naijue-prod-app-1');aenv=dict(x.split('=',1) for x in app['Config']['Env'])
 auth=aenv['POSTGRES_AUTH_SCHEMA'];source=aenv['POSTGRES_SOURCE_SCHEMA'];old=aenv['POSTGRES_DB'];need(old=='erp_prod','OLD_DATABASE_IDENTITY')
 ai=ident(auth);si=ident(source)
 sql="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT json_build_object('database',current_database(),'authSchema','"+auth+"','sourceSchema','"+source+"','accountColumns',(SELECT json_agg(json_build_object('name',column_name,'type',data_type) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='"+auth+"' AND table_name='employee_login'),'sourceEmployeeColumns',(SELECT json_agg(json_build_object('name',column_name,'type',data_type) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='"+source+"' AND table_name='tplus_employee'),'accountCount',(SELECT count(*) FROM "+ai+".employee_login),'credentialPresentCount',(SELECT count(*) FROM "+ai+".employee_login WHERE password_salt IS NOT NULL AND password_hash IS NOT NULL),'sourceBatches',(SELECT json_agg(json_build_object('batchId',r.batch_id,'status',r.status,'manifestSha256',r.manifest_sha256,'committedAt',r.committed_at,'employeeCount',(SELECT count(*) FROM "+si+".tplus_employee e WHERE e.batch_id=r.batch_id),'linkedAccountCount',(SELECT count(*) FROM "+ai+".employee_login a JOIN "+si+".tplus_employee e ON a.id=e.id::text WHERE e.batch_id=r.batch_id))) FROM "+si+".tplus_import_run r WHERE EXISTS(SELECT 1 FROM "+si+".tplus_employee e WHERE e.batch_id=r.batch_id))); COMMIT;"
 V['oldAccountSourceMetadata']=json.loads(query(old,sql))
 V['status']='PASS_NEW_R1_ACL_AND_OLD_SOURCE_METADATA_ONLY'
try:main()
except Exception as e:V.update(status='FAILED_NO_BUSINESS_WRITE_NO_REPLAY',failureCode=str(e) if isinstance(e,ValueError) else type(e).__name__)
finally:V['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(O/'r1-acl-and-account-source-metadata.json').write_text(json.dumps(V,indent=2)+'\n')
raise SystemExit(0 if V['status'].startswith('PASS') else 2)
