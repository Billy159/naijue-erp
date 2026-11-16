"""One exact original CLI call. Fixed stderr metadata only; no reader/CAS modification."""
from pathlib import Path
import ast,hashlib,json,os,re,stat,subprocess,sys
CODE=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal36-readonly-basis-source-20261117-01')
CAS_SHA='e22846fa9ef6043b7f88be587b70a3d53ca4f4bc82a5c68dbae4d44d68ebbc11'
READER_SHA='de8fa0a9f4473fb06dd6196b28ca34f76e57e48f62406db7afc6a21848746dbd'
CLASSES=('OSError','PermissionError','FileNotFoundError','BlockingIOError','NotADirectoryError','IsADirectoryError','ValueError','AssertionError','KeyError','NameError','TypeError','ImportError','ModuleNotFoundError','SyntaxError','RuntimeError','TimeoutExpired','JSONDecodeError','RecursionError','MemoryError','OverflowError')
ERRNOS=(1,2,5,11,13,16,20,21,22,24,30,40,110)

def metadata(cas,reader):
 trees={'CAS':ast.parse(cas),'READER':ast.parse(reader)};guards=set();frames={}
 for label,tree in trees.items():
  funcs={'<module>','<dictcomp>','<listcomp>','<genexpr>','<lambda>'}
  for n in ast.walk(tree):
   if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)):funcs.add(n.name)
   if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='need' and len(n.args)>1 and isinstance(n.args[1],ast.Constant) and type(n.args[1].value)is str:guards.add(n.args[1].value)
  frames[str(CODE/('register_cas.py' if label=='CAS' else 'read_registration_basis.py'))]=(label,funcs,len((cas if label=='CAS' else reader).splitlines()))
 tree=trees['CAS'];assign=lambda name:next(n.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in n.targets))
 basis=assign('BASIS');assert isinstance(basis,ast.DictComp)
 pins=ast.literal_eval(basis.generators[0].iter.func.value)
 custody=ast.literal_eval(assign('CUSTODY_FILES'))
 return {'guards':guards,'frames':frames,'basis':list(pins),'custody':custody}

def classify(stderr,schema,exit_code):
 # Parse in memory, never return exception text or arbitrary property values.
 text=stderr.decode('utf-8',errors='replace')
 found=list(re.finditer(r'^('+ '|'.join(CLASSES)+r')(?::[^\r\n]*)?\r?$',text,re.M))
 final_line=found[-1].group(0) if found else ''
 error_class=found[-1].group(1) if found else 'UNKNOWN'
 numbers=re.findall(r'\[Errno ([0-9]{1,3})\]',final_line)
 errno=int(numbers[-1]) if error_class in ('OSError','PermissionError','FileNotFoundError','BlockingIOError','NotADirectoryError','IsADirectoryError') and numbers and int(numbers[-1]) in ERRNOS else None
 codes=re.findall(r'^(?:ValueError|AssertionError): ([A-Z][A-Z0-9_]{0,159})\r?$',final_line,re.M)
 guard=codes[-1] if codes and codes[-1] in schema['guards'] else 'UNKNOWN'
 frame={'source':'UNKNOWN','line':None,'function':'UNKNOWN'}
 for path,line,function in re.findall(r'^  File "([^"\r\n]+)", line ([0-9]{1,6}), in ([^\r\n]+)\r?$',text,re.M):
  fixed=schema['frames'].get(path)
  if fixed and function in fixed[1] and 1<=int(line)<=fixed[2]:frame={'source':fixed[0],'line':int(line),'function':function}
 def slots(paths):
  hits=[i for i,p in enumerate(paths) if repr(p) in final_line or json.dumps(p) in final_line]
  return hits[0] if len(hits)==1 else None
 return {'state':'READONLY_NORMAL36_CLI_DIAGNOSTIC_REFUSED','readerExitCode':exit_code,'errorClass':error_class,'errno':errno,'guardCode':guard,'frame':frame,'basisIndex':slots(schema['basis']),'custodyMetadataIndex':slots(schema['custody']),'automaticReplay':False,'basisProduced':False}

def source_file(leaf,pin):
 p=CODE/leaf
 if p.resolve()!=p:raise ValueError('DIAGNOSTIC_SOURCE_INPUT_REFUSED')
 for parent in (*reversed(CODE.parents),CODE):
  s=parent.lstat()
  if not(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022):raise ValueError('DIAGNOSTIC_SOURCE_INPUT_REFUSED')
  if parent==CODE and (s.st_gid!=0 or stat.S_IMODE(s.st_mode)!=0o700):raise ValueError('DIAGNOSTIC_SOURCE_INPUT_REFUSED')
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
  s=os.fstat(f.fileno())
  if not(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and 0<s.st_size<=262144):raise ValueError('DIAGNOSTIC_SOURCE_INPUT_REFUSED')
  raw=f.read(262145)
  after=os.fstat(f.fileno())
 if len(raw)!=s.st_size or (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) or hashlib.sha256(raw).hexdigest()!=pin:raise ValueError('DIAGNOSTIC_SOURCE_INPUT_REFUSED')
 return raw

def original_argv():
 return ['/usr/bin/python3','-I','-S',str(CODE/'read_registration_basis.py'),str(CODE/'register_cas.py'),CAS_SHA]

def main():
 try:
  cas=source_file('register_cas.py',CAS_SHA);reader=source_file('read_registration_basis.py',READER_SHA);schema=metadata(cas,reader)
 except BaseException as e:
  label=type(e).__name__;print(json.dumps({'state':'READONLY_NORMAL36_DIAGNOSTIC_SOURCE_REFUSED','errorClass':label if label in CLASSES else 'UNKNOWN','guardCode':'DIAGNOSTIC_SOURCE_INPUT_REFUSED','automaticReplay':False,'basisProduced':False},sort_keys=True));return 2
 try:
  # Same exact original isolated CLI; no directory creation or source writes.
  q=subprocess.run(original_argv(),capture_output=True,timeout=560)
 except subprocess.TimeoutExpired:
  print(json.dumps({'state':'READONLY_NORMAL36_DIAGNOSTIC_TRANSPORT_TIMEOUT','errorClass':'TimeoutExpired','automaticReplay':False,'basisProduced':False},sort_keys=True));return 2
 except BaseException as error:
  label=type(error).__name__;number=error.errno if type(error) in (OSError,PermissionError,FileNotFoundError,BlockingIOError,NotADirectoryError,IsADirectoryError) else None
  print(json.dumps({'state':'READONLY_NORMAL36_DIAGNOSTIC_TRANSPORT_REFUSED','errorClass':label if label in CLASSES else 'UNKNOWN','errno':number if type(number)is int and number in ERRNOS else None,'automaticReplay':False,'basisProduced':False},sort_keys=True));return 2
 if q.returncode==0:
  # Preserve the original reader's exact basis bytes for main's verification.
  sys.stdout.buffer.write(q.stdout);return 0
 print(json.dumps(classify(q.stderr,schema,q.returncode),sort_keys=True));return 2
if __name__=='__main__':raise SystemExit(main())
