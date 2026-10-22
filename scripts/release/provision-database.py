"""Provision only a new isolated rewrite database after fixed current preservation."""
import hashlib,json,os,pathlib,re,secrets,socket,subprocess,datetime
J=pathlib.Path(os.environ['ERP_SHARED_JOB_DIR']);B=J/'bundle';P=json.loads((B/'PLAN.json').read_text());O=J/'results';V={'format':'rapid-launch-new-database-v1','jobId':P['jobId'],'status':'STARTED','oldDatabaseModified':False,'businessRowsInserted':False,'productionSwitched':False,'credentialsExported':False}
def need(v,c):
 if not v:raise ValueError(c)
def query(db,sql):
 p=subprocess.run(['docker','exec','--user','999:999','-i','naijue-prod-db-1','psql','--no-password','--no-psqlrc','-U',USER,'-d',db,'-At','-v','ON_ERROR_STOP=1'],input=sql.encode(),capture_output=True,timeout=120)
 if p.returncode:
  V['failureDigest']={'exitCode':p.returncode,'stderrSha256':hashlib.sha256(p.stderr).hexdigest()};raise ValueError('NEW_DATABASE_SQL_FAILED')
 return p.stdout.decode().strip()
def main():
 global USER
 need(os.geteuid()==0 and socket.gethostname()=='naijue-server' and J.name==P['jobId'] and os.environ['ERP_SHARED_TASK_ID']=='T45','EXACT_NEW_DATABASE_SCOPE')
 need(P['database']=='erp_rewrite_20261022_r1' and P['ownerRole']=='erp_rewrite_owner_20261022' and P['runtimeRole']=='erp_rewrite_runtime_20261022','EXACT_TARGET_NAMES')
 backup=pathlib.Path(P['backupReceipt']);raw=backup.read_bytes();need(hashlib.sha256(raw).hexdigest()==P['backupReceiptSha256'],'EXACT_FRESH_PRESERVATION_REQUIRED');receipt=json.loads(raw)
 need(receipt['status']=='PASS_FRESH_CURRENT_APP_DB_WAL_MEDIA_CONFIG_PRESERVED','COMPLETE_CURRENT_PRESERVATION_REQUIRED')
 p=subprocess.run(['docker','inspect','naijue-prod-db-1'],capture_output=True,check=True,timeout=15);info=json.loads(p.stdout)[0]
 need(info['Image']==receipt['services']['naijue-prod-db-1']['imageId'] and info['State']['StartedAt']==receipt['services']['naijue-prod-db-1']['startedAt'],'CURRENT_DB_CONTAINER_IDENTITY')
 env=dict(v.split('=',1) for v in info['Config']['Env']);USER=env.get('POSTGRES_USER','');need(re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]{0,62}',USER),'EXPLICIT_CURRENT_BOOTSTRAP_ROLE')
 status=json.loads(query('postgres',"SELECT json_build_object('superuser',rolsuper,'canCreateDb',rolcreatedb,'canCreateRole',rolcreaterole,'existingDb',(SELECT count(*) FROM pg_database WHERE datname='"+P['database']+"'),'existingRoles',(SELECT count(*) FROM pg_roles WHERE rolname IN ('"+P['ownerRole']+"','"+P['runtimeRole']+"'))) FROM pg_roles WHERE rolname=current_user;"))
 need(status['superuser'] and status['existingDb']==0 and status['existingRoles']==0,'FRESH_TARGET_AND_EXISTING_ADMIN_REQUIRED_NO_OVERWRITE')
 target=pathlib.Path('/srv/naijue-erp/rapid-launch-20261022/databases')/P['database'];need(not target.exists(),'TARGET_DIRECTORY_EXISTS_NO_REPLAY');target.mkdir(parents=True,mode=0o700)
 password=secrets.token_urlsafe(48)
 cfg={'database':P['database'],'user':P['runtimeRole'],'password':password,'ownerRole':P['ownerRole'],'host':'naijue-prod-db-1','port':5432,'ssl':False}
 fd=os.open(target/'runtime-database.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
 with os.fdopen(fd,'w') as f:json.dump(cfg,f);f.write('\n')
 query('postgres','CREATE ROLE '+P['ownerRole']+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;\nCREATE ROLE '+P['runtimeRole']+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '"+password+"';\nCREATE DATABASE "+P['database']+' OWNER '+P['ownerRole']+" TEMPLATE template0 ENCODING 'UTF8';\nREVOKE ALL ON DATABASE "+P['database']+' FROM PUBLIC;\nGRANT CONNECT ON DATABASE '+P['database']+' TO '+P['runtimeRole']+';')
 V['databaseCreated']=True;V['rolesCreated']=[P['ownerRole'],P['runtimeRole']];V['appliedMigrations']=[]
 for row in P['migrations']:
  path=B/row['name'];data=path.read_bytes();need(hashlib.sha256(data).hexdigest()==row['sha256'],'FROZEN_MIGRATION_BYTES_CHANGED')
  need(1<=row['version']<=19 and not re.search(rb'(?m)^\\',data),'EXACT19_SQL_ONLY')
  query(P['database'],'SET ROLE '+P['ownerRole']+';\n'+data.decode());V['appliedMigrations'].append({'version':row['version'],'sha256':row['sha256']})
 actual=json.loads(query(P['database'],"SELECT json_build_object('database',current_database(),'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),'versions',(SELECT json_agg(version ORDER BY version) FROM naijue_erp.schema_migration),'tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='naijue_erp' AND table_type='BASE TABLE'),'businessAccounts',(SELECT count(*) FROM naijue_erp.user_account),'postmasterStartedAt',pg_postmaster_start_time()::text);"))
 need(actual['database']==P['database'] and actual['versions']==list(range(1,20)) and actual['businessAccounts']==0,'EXACT_EMPTY_SCHEMA19_TARGET_READBACK')
 V.update(status='PASS_NEW_DATABASE_SCHEMA19_ONLY_NOT_IMPORT_NOT_AUTH',actual=actual,runtimeConfigurationReference=str(target/'runtime-database.json'),runtimeRoleGrantedBusinessTablePrivileges=False,remaining=['D1 least-privilege R1 ACL contract','real account/credential initialization','real source authority and import','query/browser/HTTPS acceptance'])
 (target/'provisioning.json').write_text(json.dumps(V,indent=2)+'\n');os.chmod(target/'provisioning.json',0o400)
try:main()
except Exception as e:V.update(status='FAILED_PARTIAL_NEW_TARGET_PRESERVED_NO_REPLAY',failureCode=str(e) if isinstance(e,ValueError) else type(e).__name__)
finally:V['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(O/'new-database-provisioning.json').write_text(json.dumps(V,indent=2)+'\n')
raise SystemExit(0 if V['status'].startswith('PASS') else 2)

