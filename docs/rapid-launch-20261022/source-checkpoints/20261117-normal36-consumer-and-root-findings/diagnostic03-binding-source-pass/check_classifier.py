"""Pure fixed stderr classification cases; no CLI/main/reader/guard execution."""
from pathlib import Path
import hashlib,json,runpy,ast
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def main():
 m=runpy.run_path(str(HERE/'diagnose_cli.py'),run_name='classifier_only')
 p=ROOT/'outputs/D1/20261117-r3-normal36-root-source-03'
 cas=(p/'register_cas.py').read_bytes();reader=(p/'read_registration_basis.py').read_bytes()
 assert hashlib.sha256(cas).hexdigest()==m['CAS_SHA'] and hashlib.sha256(reader).hexdigest()==m['READER_SHA']
 schema=m['metadata'](cas,reader);assert len(schema['basis'])==254 and len(schema['custody'])==12
 argv=m['original_argv']();assert argv==['/usr/bin/python3','-I','-S',str(m['CODE']/'read_registration_basis.py'),str(m['CODE']/'register_cas.py'),m['CAS_SHA']]
 classify=lambda text:m['classify'](text.encode(),schema,1)
 marker='PRIVATE_MESSAGE_SQL_PASSWORD';cases=0
 def safe(result):
  wire=json.dumps(result);assert marker not in wire and '/root/' not in wire and '/srv/' not in wire
  assert not any(k in result for k in ('message','stack','path','stderr','stderrHash','actualHash'))
  return result
 r=safe(classify('Traceback (most recent call last):\n  File "'+str(m['CODE']/'read_registration_basis.py')+'", line 10, in read_basis\nBlockingIOError: [Errno 11] '+marker+'\n'));assert r['errorClass']=='BlockingIOError' and r['errno']==11 and r['frame']=={'source':'READER','line':10,'function':'read_basis'};cases+=1
 r=safe(classify("FileNotFoundError: [Errno 2] "+marker+": "+repr(schema['basis'][0])+"\n"));assert r['basisIndex']==0 and r['errno']==2;cases+=1
 r=safe(classify("PermissionError: [Errno 13] "+repr(schema['custody'][0])+"\n"));assert r['custodyMetadataIndex']==0 and r['basisIndex'] is None;cases+=1
 original_need=next(n for n in ast.parse(cas).body if isinstance(n,ast.FunctionDef) and n.name=='need')
 ns={};exec(compile(ast.Module(body=[original_need],type_ignores=[]),'original_fixed_need','exec'),ns)
 code=None
 try:ns['need'](False,'ACTUAL_BASELINE_PIN_CHANGED')
 except ValueError as error:code=str(error)
 assert code=='NORMAL34_REGISTRATION_ACTUAL_BASELINE_PIN_CHANGED'
 r=safe(classify('ValueError: '+code+'\n'));assert r['guardCode']==code;cases+=1
 r=safe(classify('ValueError: '+marker+'\n'));assert r['guardCode']=='UNKNOWN';cases+=1
 r=safe(classify('UnknownSecretError: '+marker+'\n'));assert r['errorClass']=='UNKNOWN';cases+=1
 for path,line,fn in [('/secret/arbitrary.py',10,'read_basis'),(str(m['CODE']/'read_registration_basis.py'),999999,'read_basis'),(str(m['CODE']/'read_registration_basis.py'),10,marker)]:
  r=safe(classify('  File "'+path+'", line '+str(line)+', in '+fn+'\nTypeError: '+marker+'\n'));assert r['frame']['source']=='UNKNOWN';cases+=1
 r=safe(classify('FileNotFoundError: [Errno 2] '+repr(schema['basis'][0])+'\nDuring handling of the above exception, another exception occurred:\nValueError: '+code+'\n'));assert r['errorClass']=='ValueError' and r['errno'] is None and r['basisIndex'] is None;cases+=1
 r=safe(classify('FileNotFoundError: [Errno 999] '+marker+'\n'));assert r['errno'] is None;cases+=1
 r=safe(classify('KeyError: '+repr(marker)+'\n'));assert r['errorClass']=='KeyError' and r['guardCode']=='UNKNOWN';cases+=1
 first='Traceback (most recent call last):\n  File "'+str(m['CODE']/'read_registration_basis.py')+'", line 10, in read_basis\nValueError: '+code+'\n'
 for final in ('Traceback (most recent call last):\n  File "/unapproved/external.py", line 1, in external\nRuntimeError: '+marker+'\n','Traceback (most recent call last):\n  File "/unapproved/external.py", line 1, in external\nUnknownFinalError: '+marker+'\n','UnknownFinalError: '+marker+'\n'):
  r=safe(classify(first+'During handling of the above exception, another exception occurred:\n'+final));assert r['frame']['source']=='UNKNOWN' and r['guardCode']=='UNKNOWN' and r['errno'] is None and r['errorClass']==('RuntimeError' if 'RuntimeError:' in final else 'UNKNOWN');cases+=1
 r=safe(classify('FileNotFoundError: [Errno 2] '+repr(schema['basis'][0])+' '+repr(schema['custody'][0])+'\n'));assert r['basisIndex'] is r['custodyMetadataIndex'] is None;cases+=1
 r=safe(classify('ValueError: ACTUAL_BASELINE_PIN_CHANGED\n'));assert r['guardCode']=='UNKNOWN';cases+=1
 t=ast.parse((HERE/'diagnose_cli.py').read_text());calls=[n for n in ast.walk(t) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='subprocess' and n.func.attr=='run'];assert len(calls)==1
 assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ('mkdir','write_bytes','write_text','unlink','replace') for n in ast.walk(t))
 report=dict(closedFindings=['N36-D01','N36-D02','N36-D03'],originalNeedCalledWithFixedLiteralOnly=True,state='PASS_PURE_FIXED_CLASSIFIER_AND_ORIGINAL_CLI_PAIR_ONLY',cases=cases,exactOriginalCLIArgumentsMatched=True,actualOriginalSourcePinsMatched=True,baselineSlots=254,custodyMetadataSlots=12,oneSubprocessCallNoRetryLoop=True,noRemoteFileMutationInSource=True,mainOrReaderOrCASCalled=False,serverActions=0,PGConnections=0,clockIssued=False,authorityOrFutureFixtureConstructed=False)
 (HERE/'LOCAL-CHECKS.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
