"""Original channel adapter SOURCE. No implicit stage/read/issuer/CAS action."""
from pathlib import Path
import ast,base64,contextlib,hashlib,io,json,os,runpy,shlex
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
TARGET=V/'NORMAL43-ROOT-EXECUTION-PREPARATION-01'
STAGE='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal43-registration-source-20261118-01'
LOADER=V/'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def prepare_local():
 # Called only on the final reviewed root-source version. Writes local T45
 # preparation files, never changes this frozen source or existing T45 WIP.
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw)
 assert source['state']=='NORMAL43_ROOT_SOURCE_READY_UNISSUED_NOT_REGISTERED'
 code={name:(HERE/name).read_bytes()for name in ('register_cas.py','read_registration_basis.py','r3_normal43_continuation.py')}
 assert all(sha(raw)==source['files'][name]['sha256']for name,raw in code.items())
 template=V/'DURABLE-READONLY-EXECUTION-PREPARATION-02/STAGE-ROOT-SOURCE.py'
 assert sha(template.read_bytes())=='3cecf232aa5ed6949ffe6256643058daf38d83baa87d720878adca7b70934622'
 text=template.read_text();tree=ast.parse(text)
 changes={}
 for node in tree.body:
  if isinstance(node,ast.Assign):
   names=[n.id for n in node.targets if isinstance(n,ast.Name)]
   if names==['STAGE']:changes[ast.get_source_segment(text,node)]='STAGE=Path('+repr(STAGE)+')'
   if names==['PINS']:changes[ast.get_source_segment(text,node)]='PINS='+repr({k:sha(v)for k,v in code.items()})
 assert len(changes)==2
 for old,new in changes.items():assert text.count(old)==1;text=text.replace(old,new,1)
 stage=text.encode();ast.parse(stage)
 read=r'''
from pathlib import Path
import hashlib,json,os,runpy,signal,stat
STAGE=Path(STAGE_LITERAL)
PINS=PINS_LITERAL
assert os.getuid()==os.geteuid()==0
def timeout(*_):raise TimeoutError()
signal.signal(signal.SIGALRM,timeout);signal.alarm(45)
for name,pin in PINS.items():
 path=STAGE/name;s=path.lstat()
 assert path.resolve()==path and stat.S_ISREG(s.st_mode)and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400
 assert hashlib.sha256(path.read_bytes()).hexdigest()==pin
out=runpy.run_path(str(STAGE/'read_registration_basis.py'),run_name='root08_original_private_paired_read')['main']()
signal.alarm(0)
print(json.dumps(out,sort_keys=True))
'''.replace('STAGE_LITERAL',repr(STAGE)).replace('PINS_LITERAL',repr({k:sha(v)for k,v in code.items()})).encode()
 ast.parse(read)
 packet=(json.dumps({k:base64.b64encode(v).decode()for k,v in code.items()},sort_keys=True)+'\n').encode()
 TARGET.mkdir(mode=0o700,exist_ok=False)
 files={'STAGE-ROOT-SOURCE.py':stage,'READ-PAIRED-BASIS.py':read,'CODE-STAGE-PACKET.json':packet}
 for name,raw in files.items():
  with(TARGET/name).open('xb')as f:os.fchmod(f.fileno(),0o600);f.write(raw)
 report={'state':'LOCAL_ORIGINAL_CHANNEL_PREPARED_NOT_EXECUTED','sourcePinsSha256':sha(source_raw),'stagedRootDirectory':STAGE,
  'preparedProgramPins':{k:sha(v)for k,v in files.items()},'codePins':{k:sha(v)for k,v in code.items()},'serverActions':0,'actualFreshBasis':None}
 (TARGET/'PREPARED-CHANNEL.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n');return report
def stage_and_read(review_file,review_pin):
 # Requires Main's explicit post-PASS stage/read instruction. No issuer/CAS.
 prepared=json.loads((TARGET/'PREPARED-CHANNEL.json').read_bytes())
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();assert sha(source_raw)==prepared['sourcePinsSha256']
 raw=Path(review_file).read_bytes();assert sha(raw)==review_pin;review=json.loads(raw)
 assert review['sourceOnly']is True and review['findings']==[]and review['sourcePinsSha256']==sha(source_raw)and review['rootPairReviewComplete']is True
 fresh=TARGET/'fresh';fresh.mkdir(mode=0o700,exist_ok=False)
 (fresh/'READ-ONCE-INTENT.json').write_text(json.dumps({'reviewSha256':review_pin,'automaticReplay':False},sort_keys=True)+'\n')
 assert sha(LOADER.read_bytes())=='42943d8124fa43c217ffa5b7e85d27684290d3938bb18212e1589253fc6886f8'
 client=runpy.run_path(str(LOADER))['load_client']();cfg=client['state']()
 data={k:(TARGET/k).read_bytes()for k in prepared['preparedProgramPins']}
 assert all(sha(raw)==prepared['preparedProgramPins'][k]for k,raw in data.items())
 command=lambda code:shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',code.decode()])
 with contextlib.redirect_stderr(io.StringIO()):
  staged=client['remote'](cfg,command(data['STAGE-ROOT-SOURCE.py']),data['CODE-STAGE-PACKET.json'])
  (fresh/'ACTUAL-CODE-STAGE.json').write_bytes(staged)
  raw=client['remote'](cfg,command(data['READ-PAIRED-BASIS.py']))
 result=json.loads(raw);assert result['state']=='READONLY_NORMAL43_REGISTRATION_BASIS'
 result={'basis':result}
 out=[]
 for key in ('basis',):
  value=result[key];assert value['PGConnections']==value['mutations']==0
  raw=(json.dumps(value,sort_keys=True)+'\n').encode();path=fresh/('ACTUAL-'+key.upper()+'-BASIS.json')
  with path.open('xb')as f:os.fchmod(f.fileno(),0o600);f.write(raw);f.flush();os.fsync(f.fileno())
  out.append({'path':str(path),'sha256':sha(raw),'checkedAtUTC':value['checkedAtUTC']})
 return out

def register_once(registration_directory):
 # Separate explicit Main/T45 action after real paired fresh and Main issuance.
 # Defining this interface performs no remote action.
 window=Path(registration_directory).resolve();assert window.parent==ROOT/'outputs/主控'
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();prepared=json.loads((TARGET/'PREPARED-CHANNEL.json').read_bytes())
 issued=json.loads((window/'ISSUED.json').read_bytes())
 assert issued['sourcePinsSha256']==prepared['sourcePinsSha256']==sha(source_raw)
 packet_raw=(window/'registration-packet.json').read_bytes();packet=json.loads(packet_raw)
 authority=base64.b64decode(packet['authorization'],validate=True)
 assert sha(authority)==issued['registrationSha256']
 a=json.loads(authority)
 assert a['jobs']==json.loads((HERE/'HISTORY-INPUTS.json').read_bytes())['jobs']
 assert a['sourceSha256']==prepared['codePins']['register_cas.py']
 cas=TARGET/'cas';cas.mkdir(mode=0o700,exist_ok=False)
 (cas/'SUBMIT-CAS-ONCE-INTENT.json').write_text(json.dumps({'jobs':a['jobs'],'automaticReplay':False},sort_keys=True)+'\n')
 assert sha(LOADER.read_bytes())=='42943d8124fa43c217ffa5b7e85d27684290d3938bb18212e1589253fc6886f8'
 client=runpy.run_path(str(LOADER))['load_client']();cfg=client['state']()
 command=shlex.join(['sudo','-n','/usr/bin/python3','-I','-S',STAGE+'/register_cas.py',issued['registrationSha256']])
 with contextlib.redirect_stderr(io.StringIO()):raw=client['remote'](cfg,command,packet_raw)
 (cas/'ACTUAL-CAS-RESULT.json').write_bytes(raw)
 result=json.loads(raw)
 assert result['status']=='EXACT_NORMAL43_FIVE_PHASE_ROOT_REGISTERED_NO_PHASE_OR_SQL_EXECUTED'and result['old127AndThreeGuardsPreserved']is True
 assert result['PGStarted']is False and result['maintenanceSubmitted']is False
 return {'path':str(cas/'ACTUAL-CAS-RESULT.json'),'sha256':sha(raw),'result':result}
