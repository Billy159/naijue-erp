"""Wait locally for the real approved startsAt, then invoke the fixed original receive client once."""
from pathlib import Path
import argparse,hashlib,json,os,runpy,subprocess,sys,time
ROOT=Path(__file__).resolve().parent.parent
CLIENT=ROOT/'INPUT-RECEPTION-01/CACHED-02/batch_client.py'
CLIENT_SHA='258733835fbe3180abadc43cb9d4d5cea9dc47e89dd05455f5a0d4f7d8a0bd58'
def main():
 p=argparse.ArgumentParser();p.add_argument('--authorization',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--sha256',required=True);a=p.parse_args()
 if hashlib.sha256(CLIENT.read_bytes()).hexdigest()!=CLIENT_SHA:raise ValueError('FIXED_RECEIVE_CLIENT_DIFFERS')
 sys.path.insert(0,str(CLIENT.parent));n=runpy.run_path(str(CLIENT));raw=n['exact_local'](a.authorization,65536);manifest=n['exact_local'](a.manifest,32768);approved,_=n['b'].bind(raw,a.sha256,manifest)
 if approved['codeSha256']['batch_client.py']!=CLIENT_SHA:raise ValueError('APPROVED_CLIENT_PIN_DIFFERS')
 for leaf,pin in approved['codeSha256'].items():
  if hashlib.sha256((CLIENT.parent/leaf).read_bytes()).hexdigest()!=pin:raise ValueError('APPROVED_STATIC_CODE_DIFFERS')
 note=CLIENT.parent/('launch-'+a.sha256+'.json');fd=os.open(note,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump({'state':'LOCAL_LAUNCH_RECORDED_NO_REMOTE_REQUEST_YET','authoritySha256':a.sha256,'startsAt':approved['startsAt'],'expiresAt':approved['expiresAt'],'clientSha256':CLIENT_SHA,'recordedAtMs':time.time_ns()//1000000},f,sort_keys=True);f.flush();os.fsync(f.fileno())
 print(json.dumps({'state':'WAITING_LOCALLY_FOR_ACTUAL_APPROVED_START','authoritySha256':a.sha256,'startsAt':approved['startsAt'],'expiresAt':approved['expiresAt'],'sourceOrAuthorityModified':False}),flush=True)
 while True:
  remaining=(approved['startsAt']-time.time_ns()//1000000)/1000
  if remaining<=0:break
  time.sleep(min(1,remaining))
 print(json.dumps({'state':'INVOKING_FIXED_ORIGINAL_CLIENT_ONCE','atMs':time.time_ns()//1000000}),flush=True)
 return subprocess.run([sys.executable,'-u',str(CLIENT),'--authorization',str(a.authorization),'--manifest',str(a.manifest),'--sha256',a.sha256],check=False).returncode
if __name__=='__main__':raise SystemExit(main())
