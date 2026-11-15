"""Prepare service24 from exact service23 sources; no issuer or remote calls."""
from pathlib import Path
import ast,difflib,hashlib,json,re
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'20261114-r3-service23-original06-readonly-actual-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
changes=[]
mapping={
 't45-first-r3-native-service-start-20261114-23':'t45-first-r3-native-service-start-20261115-24',
 't45-first-r3-native-service-start-20261114-22':'t45-first-r3-native-service-start-20261114-23',
 't45-fresh35-first-production-20261110-r3-service-23':'t45-fresh35-first-production-20261110-r3-service-24',
 't45-fresh35-first-production-20261110-r3-service-22':'t45-fresh35-first-production-20261110-r3-service-23',
 'fresh35-current-production-service-v2-service-23.json':'fresh35-current-production-service-v2-service-24.json',
 'fresh35-current-production-service-v2-service-22.json':'fresh35-current-production-service-v2-service-23.json',
 'ordinary23-auth-20261114-01':'ordinary24-auth-20261115-01',
 'ordinary23-auth-capture-20261114-01':'ordinary24-auth-capture-20261115-01',
 'ordinary22-auth-20261114-01':'ordinary23-auth-20261114-01',
 't45-r3-ordinary23-auth-apply-20261114-01':'t45-r3-ordinary24-auth-apply-20261115-01',
 't45-r3-ordinary23-auth-restore-20261114-01':'t45-r3-ordinary24-auth-restore-20261115-01',
 't45-r3-ordinary22-auth-apply-20261114-01':'t45-r3-ordinary23-auth-apply-20261114-01',
 't45-r3-ordinary22-auth-restore-20261114-01':'t45-r3-ordinary23-auth-restore-20261114-01',
 't45-r3-ordinary22-preserve-stop-20261114-01':'t45-r3-ordinary23-preserve-stop-20261114-01',
 't45-r3-ordinary23-preserve-stop-20261114-01':'t45-r3-ordinary24-preserve-stop-20261115-01',
 'r3-service-23-worker-proof':'r3-service-24-worker-proof',
 '2026-11-14 04:17:03.806731+00':'2026-11-14 07:25:28.193494+00',
 '2026-11-14T04:17:02.413303865Z':'2026-11-14T07:25:26.863753801Z',
 '036e8221eaafb4fb473b5f9a5e7a61142d57e8dcd8ea76374916cbbe80f2ded8':'d1681401ab5a303734bd2e2c991e1ffc6f8ca51faf2475723d8b03259afbac6f',
 # Actual service23 stopped/restore root receipts, retained in the original output.
 '78d2922382cedce0d840003e8b6967b24d64c638c9fb3dbc4c5f494b5fb6101c':'a4ec77706cb5f4768971f4ccd0e9f8fe5cda1d3ff59dff9bd06c7617f478678c',
 'a70d218148c8cbd791619633a4d58f4c452e6b4ae1a315d5a470435cb4dbb80e':'08b1341f3c82e4d37a2103dbb8a48773fccdf2b7e6557b50ca3995ceaf0f96de',
 '5dfcffc05a1b77b9aace7f481266ff01de014b34c511e96459a922a3c9078d5d':'d52169a605d803fd7a82d94c6f64ab22db88d80a1f600fecd9b2d8da59f4f997',
 '9e668ec5999ca8e6e4fd8558a0de1cb5b8f4cb56487b0237a2a61c825bf705ce':'29a6293fca781fd95859644cc2b818f81b1485d701ca1201dc7d17c68cc067db',
 '2b35fcb2dadbf1858aec46c58dad65b5dd891434e0475e68d030ebba18d4e609':'37be662f5d42a7def840b86e5f6d271b91a2473a05b15d5929fb3531cfaa5606',
}
pattern=re.compile('|'.join(re.escape(k) for k in sorted(mapping,key=len,reverse=True)))

def write_from(phase,name,extra=None):
 origin=OLD/phase/'bundle'/name;raw=origin.read_bytes();text=raw.decode()
 new=pattern.sub(lambda m:mapping[m.group()],text)
 if extra:
  for a,b in extra.items():
   assert a in new,(name,a)
   new=new.replace(a,b)
 target=HERE/phase/'bundle'/name;target.parent.mkdir(parents=True,exist_ok=True)
 with target.open('wb') as f:f.write(new.encode())
 if target.suffix=='.py':ast.parse(new,filename=str(target))
 changes.append({'phase':phase,'name':name,'origin':str(origin),'beforeSha256':sha(raw),'sha256':sha(new.encode()),'changed':new!=text})
 if new!=text:
  diff=HERE/'diffs'/phase/(name+'.diff');diff.parent.mkdir(parents=True,exist_ok=True)
  diff.write_text(''.join(difflib.unified_diff(text.splitlines(True),new.splitlines(True),fromfile='service23/'+name,tofile='service24/'+name)))
 return sha(new.encode())

# Keep the exact same initial SQL38 read-only startup and finite maintenance boundary.
runtime_sha=write_from('start','r3_05_runtime.py')
readonly_sha=write_from('start','r3_05_readonly.py')
proof_sha=write_from('start','normal_service05_after08_proof.py')
service_sha=write_from('start','normal_service05_after08.py',{
 '7743c36bf22640e71f88deaec085a038ec166b5399dd81406ae611bb627b90f5':runtime_sha,
 '573b0f201e3179fd6c039588bd9f0496a04dbfff1ef5833577adcd9a7c7be1a0':readonly_sha})
for p in sorted((OLD/'start/bundle').iterdir()):
 if p.name in {'r3_05_runtime.py','r3_05_readonly.py','normal_service05_after08_proof.py','normal_service05_after08.py','service-start-authorization.json','bundle-manifest.json'}:continue
 write_from('start',p.name)
role_sha=write_from('apply','ordinary05_roles.py')
wrapper_sha=write_from('apply','ordinary05_roles_job.py',{
 '1d11e87d6183f298413069b58cc259531277130dfbf514f382a6621cdd83d1b7':service_sha,
 'b412a27ab94db67733b44cb06afb7537192a334fec5ad9a7eec801a17aa13dc0':proof_sha})
for name in ['fresh35-production-carrier.py','normal_service04.py','normal_service04_proof.py']:
 write_from('apply',name)
for p in sorted((HERE/'apply/bundle').iterdir()):
 target=HERE/'restore/bundle'/p.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(p.read_bytes())
receipt={'state':'UNISSUED_SERVICE24_SUCCESSOR_SOURCE_ONLY','oldService':'t45-first-r3-native-service-start-20261114-23',
 'newService':'t45-first-r3-native-service-start-20261115-24','sameDataInode':13502421,'sameImage':'sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769',
 'startupScope':'ORIGINAL_READONLY_SQL38_READY_BEFORE_SEPARATE_DB05_INSTALL_NOT_APP_OR_WRITER',
 'newSource':service_sha,'newProofSource':proof_sha,'newRuntimeWiring':runtime_sha,'rolesSource':role_sha,'roleWrapperSource':wrapper_sha,
 'mutationsInThisPreparation':0,'serverCalls':0,'authorityCreated':False,'sourceChanges':changes,
 'pending':['current dispatcher CAS/finite registration from external issuer','bounded stop successor with the exact selected new writer key','separate DB05 install/capture consumer','D3 retained index to batched plan and genuine caller','current C epoch and exact extended authority']}
(HERE/'PREPARED.json').write_text(json.dumps(receipt,sort_keys=True,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='sourceChanges'},sort_keys=True))
