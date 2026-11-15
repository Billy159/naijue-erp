"""One disposable CORE-step0-only diagnostic with confirmed rollback and no commit. Source preparation only until QB/main authorization."""
import hashlib,json,os,re,shutil,signal,subprocess,sys,threading,time
from pathlib import Path
class SafetyError(Exception):
 pass
base=Path(__file__).resolve().parent
pg,node,modules=(Path(x).resolve() for x in sys.argv[1:4])
config=json.loads((base/'TARGET.json').read_text())
require_paths=(str(pg),str(node),str(modules))
if require_paths!=(config['pgBin'],config['node'],config['modules']):raise SafetyError('fixed_binary_paths_required')
LOG_CAP=2*1024*1024;RAW_CAP=LOG_CAP-16384;SCRATCH_CAP=3*1024**3;WORK_SECONDS=170;TOTAL_SECONDS=180
started=time.monotonic();deadline=started+WORK_SECONDS
env={k:v for k,v in os.environ.items() if not k.startswith(('PG','D2_','D3_')) and k not in ('NODE_OPTIONS','NODE_PATH','NODE_PG_FORCE_NATIVE','NODE_COMPILE_CACHE')};env['PYTHONDONTWRITEBYTECODE']='1'
children=[];raw_log=bytearray();raw_other=0;exported=0;peak=0;fault=None;phase='preflight'
lock=threading.Lock();stop=threading.Event();server=None;threads=[];work=None;success=False
initdb_started=False;initdb_complete=False;pg_stop_confirmed=False
signal_errors=[]
def record_signal_error(role,pid,signum,error):
 signal_errors.append({"phase":phase,"role":role,"pid":pid,"signal":int(signum),"errno":error.errno,"type":"PermissionError"})
def kill_all():
 # Postmaster children may setsid; only the live postmaster owns their shutdown.
 # Never SIGKILL the postmaster or infer descendant exit from its process group.
 if server is not None and server.poll() is None:
  try:os.kill(server.pid,signal.SIGQUIT)
  except ProcessLookupError:pass
  except PermissionError as error:record_signal_error("postmaster",server.pid,signal.SIGQUIT,error)
 for child in list(children):
  if child is not server and child.poll() is None:
   try:os.killpg(child.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   except PermissionError as error:record_signal_error("direct-child-group",child.pid,signal.SIGKILL,error)
def fail(code):
 global fault
 with lock:
  if fault is None:fault=code
 kill_all()
def require(test,code):
 if not test:raise SafetyError(code)
def check():
 require(fault is None,fault or 'guard_failure');require(time.monotonic()<deadline,'work_deadline')
def save(name,value):
 global exported
 data=(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
 with lock:
  require(exported+len(data)+len(raw_log)+raw_other<=LOG_CAP,'safe_output_cap');exported+=len(data)
 fd=os.open(base/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as out:out.write(data)
def spawn(args,**kw):
 global server
 check();p=subprocess.Popen([str(x) for x in args],env=env,start_new_session=True,**kw)
 if str(args[0])==str(pg/'postgres'):server=p
 children.append(p);return p
def drain(pipe,destination=None,lines=None,postgres=False):
 global raw_other
 buf=bytearray();discarding=False
 try:
  while True:
   data=os.read(pipe.fileno(),8192)
   if not data:break
   if discarding:continue
   with lock:
    used=len(raw_log)+raw_other+exported
    if used+len(data)>RAW_CAP:fail_code='raw_log_cap' if postgres else 'process_output_cap'
    else:
     fail_code=None
     if postgres:raw_log.extend(data)
     else:raw_other+=len(data)
   if fail_code:
    fail(fail_code);discarding=True;continue
   if destination is not None:destination.extend(data)
   if lines is not None:
    buf.extend(data)
    while b'\n' in buf:
     line,_,rest=buf.partition(b'\n');buf=bytearray(rest)
     if len(line)>16384:fail('stdout_line_cap');return
     if line.strip():lines.put(bytes(line))
    if len(buf)>16384:fail('stdout_line_cap');return
 except Exception:fail('pipe_reader_failure')
 finally:
  if lines is not None:lines.put(None)
def reader(*args,**kw):
 t=threading.Thread(target=drain,args=args,kwargs=kw,daemon=True);t.start();threads.append(t);return t
def save_install_diagnostic(stderr,exit_code,sql_path):
 # Only the fixed static DB02 install is eligible. Never export LINE/QUERY,
 # statement echoes, bootstrap output, generic stderr, or connection arguments.
 require(sql_path==Path(config['installFix03'])/'source-slices.sql','diagnostic_source_scope')
 text=stderr.decode('utf-8','replace');lines=text.splitlines()
 error=None;source_line=None;context=[];location=None
 for index,line in enumerate(lines):
  match=re.fullmatch(r'psql:'+re.escape(str(sql_path))+r':(\d+): (?:ERROR|FATAL|PANIC):\s+([0-9A-Z]{5}): (.*)',line)
  if match:
   source_line=int(match[1]);error={'sqlState':match[2],'message':match[3].encode()[:1500].decode('utf-8','ignore')}
   # Keep stack frames only; quoted SQL statement contexts are not exported.
   for following in lines[index+1:]:
    if re.match(r'(?:psql:.*: )?(?:ERROR|FATAL|PANIC):',following):break
    frame=re.fullmatch(r'(?:CONTEXT:  )?(PL/pgSQL function [a-zA-Z0-9_.,()\[\] ]+ line \d+ at [a-zA-Z ]+)',following)
    if frame and len(context)<3:context.append(frame[1][:220])
    place=re.fullmatch(r'LOCATION:  ([a-zA-Z0-9_., :/+-]+)',following)
    if place:location=place[1][:250]
   break
 value={'scope':'FIXED_DB02_PLUS_FIX03_STATIC_INSTALL_ONLY','sourceSqlPath':str(sql_path),
  'sourceSqlSha256':hashlib.sha256(sql_path.read_bytes()).hexdigest(),'exitCode':exit_code,
  'firstError':error,'sourceLineNumber':source_line,'contextFrames':context,'serverLocation':location,
  'diagnosticParsed':error is not None,'maxExportBytes':4096,'fullSqlExported':False,'genericLogsExported':False}
 require(len((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())<=4096,'diagnostic_export_cap')
 save('DB02-INSTALL-DIAGNOSTIC.json',value)
def run(args,input_bytes=None,timeout=40,allow_failure=False,diagnostic_sql=None):
 p=spawn(args,stdin=subprocess.PIPE if input_bytes is not None else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 out=bytearray();install_stderr=bytearray() if diagnostic_sql is not None else None
 a=reader(p.stdout,destination=out);b=reader(p.stderr,destination=install_stderr)
 if input_bytes is not None:p.stdin.write(input_bytes);p.stdin.close()
 try:p.wait(timeout=min(timeout,max(.1,deadline-time.monotonic())))
 except subprocess.TimeoutExpired:fail('child_timeout');raise SafetyError('child_timeout')
 a.join(2);b.join(2)
 if diagnostic_sql is not None:save_install_diagnostic(bytes(install_stderr),p.returncode,diagnostic_sql)
 check();require(allow_failure or p.returncode==0,'child_exit_failure');return bytes(out)
def allocated(root):
 total=0;stack=[root]
 while stack:
  for x in os.scandir(stack.pop()):
   try:
    s=x.stat(follow_symlinks=False);total+=s.st_blocks*512
    if x.is_dir(follow_symlinks=False):stack.append(x.path)
   except FileNotFoundError:pass
 return total
def watchdog():
 global peak,permission_fault
 while not stop.wait(.05):
  if time.monotonic()>=deadline:fail('work_deadline');return
  if work is not None:
   try:n=allocated(work)
   except FileNotFoundError:continue
   except PermissionError:
    permission_fault=True;fail('scratch_permission_error');return
   peak=max(peak,n)
   # Stop early with 512MiB headroom; the 3GiB cap is checked again at teardown.
   if n>=SCRATCH_CAP-512*1024**2:fail('scratch_guard');return


permission_fault=False
try:
 for item in json.loads((base/'INPUT-PINS.json').read_text()):
  require(hashlib.sha256(Path(item['path']).read_bytes()).hexdigest()==item['sha256'],'input_pin_mismatch')
 require(not any((base/n).exists() for n in ['ATTEMPT.json','RUN.json','FAILURE.json']),'single_attempt_already_used')
 require((config['database'],config['workRoot'],config['socketPort'])==('demo_8877_d3_core0_diag_20261115_05','/tmp/d3-core0-diag-20261115-05',55495),'fixed_sql_core_identity_required')
 save('ATTEMPT.json',{'singleAttempt':1,'postgresStartedYet':False,'scope':'LOCAL_CORE_STEP0_DIAGNOSTIC_ONLY'})
 candidate_root=Path(config['workRoot'])
 candidate_root.mkdir(mode=0o700)
 work=candidate_root
 (work/'tmp').mkdir(mode=0o700);env['TMPDIR']=str(work/'tmp')
 (work/'empty-pgpass').write_text('');os.chmod(work/'empty-pgpass',0o600);env['PGPASSFILE']=str(work/'empty-pgpass')
 threading.Thread(target=watchdog,daemon=True).start()
 phase='postgres-start';cluster=work/'pg';initdb_started=True
 run([pg/'initdb','-D',cluster,'-U',config['bootstrap'],'-A','trust','--no-locale','-E','UTF8'])
 initdb_complete=True
 settings=['listen_addresses=',f'unix_socket_directories={work}','unix_socket_permissions=0700',
  f"port={config['socketPort']}",'shared_buffers=128MB','max_connections=16',
  'statement_timeout=40000','lock_timeout=5000','logging_collector=off','log_destination=stderr',
  'log_min_error_statement=panic','log_statement=none','log_parameter_max_length=0','log_parameter_max_length_on_error=0']
 args=[pg/'postgres','-D',cluster]
 for setting in settings:args+=['-c',setting]
 server=spawn(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE);reader(server.stdout,postgres=True);reader(server.stderr,postgres=True)
 until=time.monotonic()+10
 while not (work/f".s.PGSQL.{config['socketPort']}").exists() or b'database system is ready to accept connections' not in raw_log:
  check();require(server.poll() is None and time.monotonic()<until,'postgres_start_failure');time.sleep(.02)
 require(int((cluster/'postmaster.pid').read_text().splitlines()[0])==server.pid,'postmaster_pid_mismatch')
 def sql(query,database='postgres'):
  return run([pg/'psql','-XqAt','-h',work,'-p',str(config['socketPort']),'-U',config['bootstrap'],'-d',database,
   '-v','ON_ERROR_STOP=1'],query.encode(),timeout=42).decode().strip()
 physical=json.loads(sql("SELECT jsonb_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'serverVersionNum',current_setting('server_version_num'),'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses'));"))
 require(physical['serverVersionNum']=='170011' and physical['listenAddresses']=='','physical_pg_identity')
 require(Path(physical['dataDirectory']).resolve()==cluster.resolve(),'physical_pg_directory')
 physical['postmasterPid']=server.pid;save('PHYSICAL-IDENTITY.json',physical)
 phase='exact-installation'
 owner=config['owner'];controller=config['controller'];initializer=config['initializer'];importer=config['importer'];runtime=config['runtimeRole'];ordinary=config['ordinary']
 # Exact existing fixture role recipe from D1's LOCAL-SQL-CORE-RECIPE and the
 # reviewed prior full-schema runner. No owner capability goes to controller.
 sql(f'''CREATE ROLE {owner} NOLOGIN;
CREATE ROLE {initializer} NOLOGIN NOINHERIT; CREATE ROLE {importer} NOLOGIN NOINHERIT; CREATE ROLE {runtime} NOLOGIN NOINHERIT;
CREATE ROLE {controller} LOGIN NOINHERIT; CREATE ROLE {ordinary} LOGIN NOINHERIT;
GRANT {initializer},{importer} TO {controller} WITH SET TRUE,INHERIT FALSE,ADMIN FALSE;
GRANT {runtime} TO {ordinary} WITH SET TRUE,INHERIT FALSE,ADMIN FALSE;''')
 database=config['database'];sql(f'CREATE DATABASE {database} OWNER {owner};')
 sql((base/'base-install.sql').read_text(),database)
 parent=Path(config['parent12'])
 for layer in json.loads((parent/'INSTALL-ORDER.json').read_text()):
  data=(parent/layer['file']).read_bytes()
  require(hashlib.sha256(data).hexdigest()==layer['sha256'],'parent_layer_pin_mismatch')
  sql(f'SET ROLE {owner};\n'+data.decode(),database)
 phase='real_parent155_readback'
 parent_packet=json.loads(run([node,base/'catalog-fixture.mjs','parent155'],timeout=42,allow_failure=True))
 if parent_packet.get('code') in ('42501','28000','28P01'):permission_fault=True
 save('PARENT155-INSTALL-READBACK.json',parent_packet);require(parent_packet.get('functions')==155,'parent155_mismatch')
 candidate=Path(config['candidate02'])
 require(hashlib.sha256((candidate/'PINS.json').read_bytes()).hexdigest()==config['candidatePinsSha256'],'candidate02_pin_mismatch')
 install_fix=Path(config['installFix03'])
 require(hashlib.sha256((install_fix/'PINS.json').read_bytes()).hexdigest()==config['installFixPinsSha256'],'install_fix03_pin_mismatch')
 phase='install_db02_fix03_161'
 sql_path=install_fix/'source-slices.sql'
 require(hashlib.sha256(sql_path.read_bytes()).hexdigest()==config['installSqlSha256'],'install_sql_pin_mismatch')
 run([pg/'psql','-XqAt','-h',work,'-p',str(config['socketPort']),'-U',config['bootstrap'],'-d',database,
  '-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',f'SET ROLE {owner};','-f',sql_path],timeout=42,diagnostic_sql=sql_path)
 # Install FIX03; canonical 161 expectations remain explicitly in parent DB02.
 phase='CORE_STEP0_DIAGNOSTIC'
 result=json.loads(run([node,base/'core-step0-diagnostic.mjs'],timeout=170,allow_failure=True))
 failure=result.get('firstFailure') or {}
 if failure.get('sqlState') in ('42501','28000','28P01'):permission_fault=True
 require(len((json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode())<=4096,'core_diagnostic_export_cap')
 save('CORE-STEP0-DIAGNOSTIC.json',result)
 require(result.get('stage')=='CORE_STEP0_DIAGNOSTIC' and result.get('state')=='COMPLETED','core_step0_diagnostic_failed')
 require(result.get('stepAck') is True and result.get('rollbackConfirmed') is True and result.get('commitAttempted') is False,'core_step0_rollback_unconfirmed')
 phase='clean_shutdown'
 os.kill(server.pid,signal.SIGINT);server.wait(timeout=5)
 pg_stop_confirmed=server.returncode==0 and not (cluster/'postmaster.pid').exists()
 for thread in threads:thread.join(timeout=1)
 check();save('RUN.json',{'scope':'LOCAL_CORE_STEP0_DIAGNOSTIC_ONLY','state':'STEP_ACK_ROLLBACK_PENDING_FINAL_CLEANUP',
  'fixtureCompiledRows':162,'commitAttempted':False,'scenarioCases':0,'actual161Verified':True,'serverActions':0,
  'realSourceRowsRead':0,'productionHostTested':False,'rawOutputExported':False})
 success=True
except Exception as error:
 permission_fault=isinstance(error,PermissionError)
 kill_all()
 code=str(error) if isinstance(error,SafetyError) and re.fullmatch('[a-z_]+',str(error)) else type(error).__name__
 try:save('FAILURE.json',{'phase':phase,'code':code,'rawOutputExported':False,'retry':False})
 except Exception:pass
finally:
 work_elapsed=time.monotonic()-started
 if work_elapsed>=WORK_SECONDS and fault is None:fault='work_deadline'
 stop.set();kill_all()
 if server is not None:
  try:server.wait(timeout=5)
  except subprocess.TimeoutExpired:pass
  pg_stop_confirmed=server.poll()==0 and not (work/'pg/postmaster.pid').exists()
 else:pg_stop_confirmed=not initdb_started or initdb_complete
 for child in children:
  if child is not server:
   remaining=started+TOTAL_SECONDS-time.monotonic()
   if remaining<=0:break
   try:child.wait(timeout=min(1,remaining))
   except Exception:pass
 all_reaped=all(child.poll() is not None for child in children)
 if work is not None:
  try:peak=max(peak,allocated(work))
  except FileNotFoundError:pass
 # Resolve every known failure before a destructive cleanup decision.
 if signal_errors or permission_fault or fault is not None or not pg_stop_confirmed or not all_reaped or peak>SCRATCH_CAP or work_elapsed>=WORK_SECONDS or time.monotonic()-started>TOTAL_SECONDS:
  success=False
 if work is not None and success:
  try:shutil.rmtree(work)
  except OSError:success=False
 removed=work is None or not work.exists()
 if signal_errors or permission_fault or fault is not None or not pg_stop_confirmed or not removed or peak>SCRATCH_CAP or time.monotonic()-started>TOTAL_SECONDS or not all_reaped:success=False
 if not success and not (base/'FAILURE.json').exists():
  try:save('FAILURE.json',{'phase':'cleanup','code':'cleanup_unconfirmed','retry':False,'rawOutputExported':False})
  except Exception:pass
 try:save('CLEANUP.json',{'temporaryRoot':str(work),'removed':removed,'allDirectChildrenReaped':all_reaped,
  'postmasterShutdownConfirmed':pg_stop_confirmed,'postmasterExitCode':server.poll() if server is not None else None,
  'directChildExitCodes':[{'pid':child.pid,'kind':Path(child.args[0]).name,'exitCode':child.poll()} for child in children],
  'signalErrors':list(signal_errors),'permissionFault':permission_fault,'rootPreserved':not removed,
  'unconfirmedRootPreserved':not removed and (not pg_stop_confirmed or not all_reaped or bool(signal_errors) or permission_fault),
  'shutdownPolicy':'SIGINT success / SIGQUIT failure; never SIGKILL postmaster','peakAllocatedBytesSampled':peak,
  'scratchCapBytes':SCRATCH_CAP,'scratchEarlyStopBytes':SCRATCH_CAP-512*1024**2,'watchdogPollMs':50,
  'elapsedSeconds':time.monotonic()-started,'workElapsedSeconds':work_elapsed,'totalLimitSeconds':TOTAL_SECONDS,
  'workLimitSeconds':WORK_SECONDS,'withinMeasuredLimits':peak<=SCRATCH_CAP and time.monotonic()-started<=TOTAL_SECONDS,
  'rawPostgresLogBytesHeldInMemory':len(raw_log),'rawOtherBytes':raw_other,'rawOutputExported':False,
  'guardFault':fault,'successful':success})
 except Exception:success=False
try:save('RESULT.json',{'state':'COMPLETED' if success else 'STOPPED','cleanupConfirmed':pg_stop_confirmed and all_reaped and removed and not signal_errors and not permission_fault,'scope':'LOCAL_CORE_STEP0_DIAGNOSTIC_ONLY','productionHostTested':False,'rawOutputExported':False})
except Exception:success=False
print(json.dumps({'state':'COMPLETED' if success else 'STOPPED','rawOutputExported':False}))
sys.exit(0 if success else 1)
