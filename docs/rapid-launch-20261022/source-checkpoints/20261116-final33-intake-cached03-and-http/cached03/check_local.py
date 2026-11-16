"""Read-only diagnosis of the original transport; no SSH, sockets or receiver."""
from pathlib import Path
import json,types
from unittest.mock import patch
source=Path(__file__).resolve().parent/'batch_transport.py'
m=types.ModuleType('original_transport');exec(compile(source.read_bytes(),str(source),'exec'),m.__dict__)
class Pipe:
 def fileno(self):return 90
 def close(self):pass
class Child:
 stdin=Pipe();stdout=Pipe()
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def poll(self):return None
 def kill(self):pass
 def wait(self,timeout=None):return 0
class Selector:
 def __init__(self,clock,timeout):self.clock=clock;self.timeout=timeout;self.map={}
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def register(self,p,events,data):self.map[id(p)]=types.SimpleNamespace(data=data)
 def unregister(self,p):self.map.pop(id(p))
 def get_map(self):return self.map
 def select(self,left):
  self.clock[0]+=left if self.timeout else .001
  return [] if self.timeout else [(next(iter(self.map.values())),1)]
def run(total,stall,read_chunks=None):
 clock=[0.0];seen=[];timeout=read_chunks is None
 with patch.object(m.subprocess,'Popen',return_value=Child()),patch.object(m.time,'monotonic',side_effect=lambda:clock[0]),patch.object(m.selectors,'DefaultSelector',side_effect=lambda:Selector(clock,timeout)),patch.object(m.os,'set_blocking'),patch.object(m.os,'read',side_effect=read_chunks or []):
  try:m.stream(['LOCAL_STUB_NO_NETWORK'],b'',total=total,stall=stall,progress=lambda row:seen.append(row)or True)
  except m.Incomplete as e:return {'elapsed':clock[0],'code':str(e),'receipts':len(seen)}
 return {'elapsed':clock[0],'code':'OK','receipts':len(seen)}

a=run(600,90);b=run(2,90);c=run(600,90,[b'{"segment":',b'1}\n{"segment":2}\n{"segment":3}\n',b''])
assert a['elapsed']==90 and a['code']=='IDLE_DURABLE_PROGRESS_TIMEOUT'
assert b['elapsed']==2 and b['code']=='TOTAL_UPLOAD_DEADLINE_EXHAUSTED'
assert c['code']=='OK' and c['receipts']==3
import sys,runpy,subprocess,copy
root=Path(__file__).resolve().parent;sys.path.insert(0,str(root))
for name in ('batch_protocol','batch_transport'):sys.modules.pop(name,None)
cli=runpy.run_path(str(root/'batch_client.py'));bmod=cli['b']
assert (bmod.STALL_SECONDS,bmod.QUERY_SECONDS,bmod.UPLOAD_SECONDS,bmod.CLOSEOUT_RESERVE_SECONDS,bmod.MAX_WINDOW_SECONDS)==(90,15,600,240,1080)
part={'artifactKey':'SYNTHETIC_LOCAL_ONLY','archiveBytes':32,'archiveSha256':'a'*64,'fragmentIndex':1,'fragmentOffset':0,
 'window':{'boundary':{'originalBindingSha256':'b'*64,'originalAuthoritySha256':'e'*64}}}
identity=[7,8];file_id=[7,8,32,1,2];digest='c'*64
receipt={'status':'READY','artifactKey':part['artifactKey'],'manifestSha256':bmod.MANIFEST,'archiveBytes':32,
 'archiveSha256':'a'*64,'authoritySha256':digest,'fileIdentity':file_id,'fragmentIndex':1,'fragmentOffset':0}
observed={'status':'READY','artifactKey':part['artifactKey'],'bytes':32,'nextSegment':None,'prefixSha256':'a'*64,
 'fileIdentity':file_id,'originalBindingSha256':'b'*64,'originalAuthoritySha256':'e'*64,'recoveryAuthoritySha256':digest,
 'receipt':receipt,'ready':{'authoritySha256':digest,'sha256':'d'*64}}
def exercise(snapshot):
 tx=object.__new__(cli['Transfer']);tx.a={};tx.digest=digest;tx.durable_bindings={};events=[];calls=[]
 tx.command=lambda *args:'SYNTHETIC_LOCAL_ONLY'
 def fail(*args,**kw):raise subprocess.TimeoutExpired(['DO_NOT_EXPORT_ARGV_SENTINEL'],15)
 tx.query=fail;tx.status=lambda p:calls.append(p['artifactKey']) or copy.deepcopy(snapshot)
 tx.evidence=lambda name,value:events.append(value)
 with patch.object(bmod,'write_time'):
  try:r=tx.finalize(part,identity);state='RETURNED_READY'
  except subprocess.TimeoutExpired:r=None;state='REJECTED_UNKNOWN_OR_MISMATCH'
 assert calls==[part['artifactKey']]
 assert 'DO_NOT_EXPORT_ARGV_SENTINEL' not in json.dumps(events)
 return state,r
ok,result=exercise(observed);assert ok=='RETURNED_READY' and result['receipt']==receipt
for name,value in [('status','UNKNOWN_NO_REPLAY'),('prefixSha256','0'*64),('originalBindingSha256','0'*64),
 ('originalAuthoritySha256','0'*64),('recoveryAuthoritySha256','0'*64),('fileIdentity',[99,8,32,1,2])]:
 bad=copy.deepcopy(observed);bad[name]=value
 assert exercise(bad)[0]=='REJECTED_UNKNOWN_OR_MISMATCH',name
partial_part=copy.deepcopy(part);partial_part['window']['boundary'].pop('originalAuthoritySha256')
assert cli['Transfer'].strict_ready_recovery(type('Holder',(),{'digest':digest,'durable_bindings':{}})(),partial_part,observed,identity)
bad=copy.deepcopy(observed);bad['receipt']['manifestSha256']='0'*64
assert exercise(bad)[0]=='REJECTED_UNKNOWN_OR_MISMATCH'
out={'state':'LOCAL_PATCH_PROBES_PASS_NOT_LIVE_TRANSFER','scope':'Actual transport local clock/pipes and actual Transfer.finalize with query/status stubs only',
 'idle':a,'total':b,'fragmentedAndCoalesced':c,'readyAfterUnknownReply':'ACCEPTED_WITH_EXACT_ORIGINAL_EVIDENCE',
 'mismatchOrUnknown':'ALL_REJECTED_NO_REPLAY','statusQueriesPerRecovery':1,'argvSentinelLeaked':False,
 'limits':{'stall':90,'query':15,'sharedUpload':600,'closeout':240,'window':1080},'networkCalls':0,'PGCalls':0,'serverCalls':0}
(root/'LOCAL-PROBES.json').write_text(json.dumps(out,sort_keys=True,indent=2)+'\n');print(json.dumps(out))
