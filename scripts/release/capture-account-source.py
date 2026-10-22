"""Private read-only old account export and one stable HMAC key; no credential values exported."""
import csv,datetime,hashlib,io,json,os,pathlib,re,secrets,socket,subprocess
J=pathlib.Path(os.environ['ERP_SHARED_JOB_DIR']);B=J/'bundle';P=json.loads((B/'PLAN.json').read_text());O=J/'results';V={'format':'rapid-launch-private-account-capture-v1','jobId':P['jobId'],'status':'STARTED','oldDatabaseWrites':False,'newAccountsInserted':0,'credentialValuesExported':False}
def need(v,c):
 if not v:raise ValueError(c)
def ident(s):
 need(re.fullmatch(r'[a-z_][a-z0-9_]{0,62}',s),'EXACT_IDENTIFIER');return '"'+s+'"'
def query(sql):
 p=subprocess.run(['docker','exec','--user','999:999','-i','naijue-prod-db-1','psql','--no-password','--no-psqlrc','-q','-U',USER,'-d','erp_prod','-At','-v','ON_ERROR_STOP=1'],input=sql.encode(),capture_output=True,timeout=40)
 if p.returncode:raise ValueError('PRIVATE_ACCOUNT_READ_FAILED')
 need(len(p.stdout)<=2*1024*1024,'BOUNDED_PRIVATE_ACCOUNT_SOURCE');return p.stdout
def write_private(p,bytes):
 fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(bytes);f.flush();os.fsync(f.fileno())
def main():
 global USER
 need(os.geteuid()==0 and socket.gethostname()=='naijue-server' and J.name==P['jobId'],'EXACT_ACCOUNT_CAPTURE_SCOPE')
 p=subprocess.run(['docker','inspect','naijue-prod-db-1','naijue-prod-app-1'],capture_output=True,check=True,timeout=15);db,app=json.loads(p.stdout)
 USER=dict(v.split('=',1) for v in db['Config']['Env'])['POSTGRES_USER'];ident(USER);env=dict(v.split('=',1) for v in app['Config']['Env'])
 need(env['POSTGRES_DB']=='erp_prod' and env['POSTGRES_AUTH_SCHEMA']=='erp_prod_auth' and env['POSTGRES_SOURCE_SCHEMA']=='erp_prod_source','EXACT_OLD_SOURCE_NAMES')
 batch=P['oldSourceBatchId'];need(batch=='TPLUS-20260922-A2' and P['oldSourceManifestSha256']=='3f247e36c1a1e3c5ee5c38451ed1c70f61aff9d45e46423ba985f22f239446c4','EXACT_OBSERVED_COMMITTED_SOURCE')
 q="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT count(*) FROM erp_prod_source.tplus_import_run WHERE batch_id='"+batch+"' AND status='COMMITTED' AND manifest_sha256='"+P['oldSourceManifestSha256']+"'; COMMIT;"
 need(query(q).strip()==b'1','SOURCE_BATCH_PROVENANCE_CHANGED')
 sql=(B/'account-source-export.sql').read_text();need(hashlib.sha256(sql.encode()).hexdigest()==P['exportSqlSha256'],'FIXED_READONLY_EXPORT_SQL')
 sql=sql.replace(':"source_auth_schema"',ident('erp_prod_auth')).replace(':"source_business_schema"',ident('erp_prod_source')).replace(":'old_source_batch_id'","'"+batch+"'")
 need(sql.count('TO STDOUT;')==1,'EXACT_COPY_SHAPE');sql=sql.replace('TO STDOUT;',"TO STDOUT WITH (FORMAT CSV);")
 raw=query(sql);rows=[]
 for cols in csv.reader(io.StringIO(raw.decode())):
  need(len(cols)==1,'PRIVATE_EXPORT_ROW_SHAPE');rows.append(json.loads(cols[0]))
 need(len(rows)==49 and len({x['sourceAccountId'] for x in rows})==49,'ACCOUNT_SET_CHANGED')
 folder=pathlib.Path('/srv/naijue-erp/rapid-launch-20261022/private/account-capture-20261022-11');need(not folder.exists(),'PRIVATE_CAPTURE_EXISTS_NO_REPLAY');folder.mkdir(parents=True,mode=0o700)
 data=(json.dumps({'format':'PRIVATE_OLD_ACCOUNT_SOURCE_CAPTURE_V1','oldSourceBatchId':batch,'oldSourceManifestSha256':P['oldSourceManifestSha256'],'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':rows},ensure_ascii=False,indent=2)+'\n').encode()
 target=folder/'old-accounts.json';write_private(target,data)
 linked=sum(x.get('sourceEmployeeNativeId') is not None for x in rows);supported=0
 for row in rows:
  salt=row.get('credentialSalt');value=row.get('credentialHash')
  if isinstance(salt,str) and (re.fullmatch(r'[a-f0-9]{48}',salt) or re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',salt)) and isinstance(value,str) and (re.fullmatch(r'pbkdf2-sha256:600000:[a-f0-9]{64}',value) or re.fullmatch(r'[a-f0-9]{64}',value)):supported+=1
 keypath=pathlib.Path('/srv/naijue-erp/rapid-launch-20261022/private/credential-request-tag-v1.key')
 if keypath.exists():
  st=keypath.lstat();need(keypath.is_file() and not keypath.is_symlink() and st.st_mode&0o077==0 and st.st_size==32,'EXACT_EXISTING_TAG_KEY');key_action='REUSED_EXACT_PRIVATE_KEY_REFERENCE'
 else:write_private(keypath,secrets.token_bytes(32));key_action='CREATED_ONCE_PRIVATE_32_BYTES'
 V.update(status='PASS_PRIVATE_OLD_ACCOUNTS_CAPTURED_NO_NEW_ACCOUNTS',rows=len(rows),exactOldEmployeeLinks=linked,unlinkedRows=len(rows)-linked,supportedLegacyEnvelopeRows=supported,unsupportedLegacyRows=len(rows)-supported,privateCaptureReference=str(target),privateCaptureBytes=len(data),privateCaptureSha256=hashlib.sha256(data).hexdigest(),oldSourceBatchId=batch,oldSourceManifestSha256=P['oldSourceManifestSha256'],tagKeyReference=str(keypath),tagKeyAction=key_action,remaining='Private exact STAFF source identity map and new trusted account bootstrap; unlinked rows need explicit original relationship, no name matching.')
try:main()
except Exception as e:V.update(status='FAILED_PRIVATE_PARTIAL_PRESERVE_NO_REPLAY',failureCode=str(e) if isinstance(e,ValueError) else type(e).__name__)
finally:V['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(O/'account-source-capture.json').write_text(json.dumps(V,indent=2)+'\n')
raise SystemExit(0 if V['status'].startswith('PASS') else 2)
