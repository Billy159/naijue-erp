"""Only read the original registration attempt; never invoke its entry again."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,runpy,shlex
HERE=Path(__file__).resolve().parent
program=r'''
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,stat,subprocess
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
P=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
H=B/'r3-05-write-continuity'
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
sha=lambda b:hashlib.sha256(b).hexdigest()
out={'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'databaseConnections':0,'mutations':0,'originalEntryReplayed':False}
paths={'stage':B/'r3-direct31-start-describe-registration-source-20261116-01','audit':B/'r3-direct31-start-describe-registration-cas-20261116-01',
 'module':P/'r3_direct31_batched.py','policy':H/'direct31-batched-real.json','dispatcher':P/'admin_exec.py',
 'pending':P/'.direct27-fullchain-dispatcher.pending',
 'preservedOldDispatcher':B/'r3-direct31-start-describe-registration-cas-20261116-01/old-dispatcher.bin',
 'preserved30Policy':H/'direct30-batched-real.json',
 'preserved30Module':P/'r3_direct30_batched.py'}
facts={}
for name,p in paths.items():
 row={'path':str(p),'present':os.path.lexists(p)}
 if row['present']:
  s=p.lstat();assert not p.is_symlink()
  row.update(uid=s.st_uid,gid=s.st_gid,mode=stat.S_IMODE(s.st_mode),inode=s.st_ino,bytes=s.st_size)
  if stat.S_ISREG(s.st_mode):assert s.st_size<524288;row['sha256']=sha(p.read_bytes())
  if stat.S_ISDIR(s.st_mode):row['children']=sorted(x.name for x in p.iterdir())
 facts[name]=row
out['paths']=facts
for leaf in ['entry-result.json']:
 p=paths['stage']/leaf
 if p.is_file():raw=p.read_bytes();assert len(raw)<65536;out[leaf]={'sha256':sha(raw),'value':json.loads(raw)}
for leaf in ['result.json','publish-intent.json']:
 p=paths['audit']/leaf
 if p.is_file():raw=p.read_bytes();assert len(raw)<65536;out['audit-'+leaf]={'sha256':sha(raw),'value':json.loads(raw)}
units=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,check=True,timeout=5)
out['activeOperationUnits']=[x.split()[0] for x in units.stdout.decode().splitlines() if x.strip()]
out['postmasterPidAbsent']=not os.path.lexists(R/'state'/R.name/'data/postmaster.pid')
print(json.dumps(out,sort_keys=True))
'''
def main():
    HERE=Path(__file__).resolve().parent
    client=HERE.parents[3].parent/'monitor/normal-admission-20261112-01/admin_client.py'
    assert hashlib.sha256(client.read_bytes()).hexdigest()=='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
    m=runpy.run_path(str(client));cfg=m['state']()
    raw=m['remote'](cfg,shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',program]))
    p=HERE/('REGISTRATION31-READBACK-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
    with p.open('xb') as f:f.write(raw)
    v=json.loads(raw);print(json.dumps({'receipt':str(p),'sha256':hashlib.sha256(raw).hexdigest(),**v},sort_keys=True))

if __name__=='__main__':main()
