"""Finite five-step maintenance successor; source rendering only, never runtime."""
from pathlib import Path
import ast,hashlib,json
HERE=Path(__file__).resolve().parent;V=HERE.parent;BASE=V/'NORMAL39-SOURCE-SUCCESSOR-02';HOST=V/'SETTLEMENT24-UPGRADE-HOST-SOURCE-02'
sha=lambda b:hashlib.sha256(b).hexdigest()
OLD='t45-first-r3-native-service-start-20261116-39';NEW='t45-first-r3-native-service-start-20261117-40'
J=json.loads((HERE/'INTERFACE.WIP.json').read_bytes())['jobs']
def save(path,raw):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw if isinstance(raw,bytes)else raw.encode())
def sourcefn(text,name):return ast.get_source_segment(text,next(n for n in ast.parse(text).body if isinstance(n,ast.FunctionDef)and n.name==name))
def assignment(text,name,value):
 node=next(n for n in ast.parse(text).body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id==name for x in n.targets));return text.replace(ast.get_source_segment(text,node),name+' = '+repr(value),1)
def main():
 manifest=json.loads((BASE/'SOURCE-PINS.json').read_bytes())
 # Copy only original frozen static members, never read issued authorities.
 for phase in ('apply','start','stop','restore'):
  for leaf,row in manifest['files'].items():
   if not leaf.startswith(phase+'/bundle/')or leaf.endswith(('authorization.json','preserve-stop-input.json')):continue
   raw=(BASE/leaf).read_bytes();assert sha(raw)==row['sha256'];save(HERE/leaf,raw)
 for p in (HOST/'bundle').iterdir():save(HERE/'upgrade/bundle'/p.name,p.read_bytes())
 # Exact maintenance identities only. Runtime CID/epoch/times/credentials remain absent.
 for phase in ('apply','start','stop','restore'):
  for p in (HERE/phase/'bundle').iterdir():
   if p.suffix!='.py' or p.name in ('fresh35-production-carrier.py','normal_service04.py','normal_service04_proof.py','root06_material.py','root07_material.py','source_lineage.py'):continue
   text=p.read_text().replace(OLD,NEW).replace('t45-fresh35-first-production-20261110-r3-service-39','t45-fresh35-first-production-20261110-r3-service-40').replace('fresh35-current-production-service-v2-service-39.json','fresh35-current-production-service-v2-service-40.json').replace('ordinary39-auth-20261116-01','ordinary40-auth-20261117-01')
   for phase0 in ('apply','stop','restore'):
    old='t45-r3-ordinary39-'+('preserve-stop'if phase0=='stop'else'auth-'+phase0)+'-20261116-01';text=text.replace(old,J[phase0]['jobId'])
   p.write_text(text)
 # C01: only the current40 capture, never historical39 custody references.
 for phase in ('apply','restore'):
  p=HERE/phase/'bundle/ordinary05_roles.py';t=p.read_text();a="CAPTURE = WORK / 'ordinary39-auth-capture-20261116-01'";assert t.count(a)==1;p.write_text(t.replace(a,"CAPTURE = WORK / 'ordinary40-auth-capture-20261117-01'",1))
  p=HERE/phase/'bundle/ordinary05_roles_job.py';t=p.read_text();a="ROOT/'state/fresh35-first-production-20261110-r3/ordinary39-auth-capture-20261116-01'";assert t.count(a)==1;p.write_text(t.replace(a,"ROOT/'state/fresh35-first-production-20261110-r3/ordinary40-auth-capture-20261117-01'",1))
 # Prior successful39 and restored auth, replacing the obsolete never-submitted38 witness.
 prior=(HERE/'prior_preserved39.py').read_text()
 for phase in ('apply','start','restore'):
  p=HERE/phase/'bundle/prior_preserved38.py';p.write_text(prior)
 # Existing role authority retains exactly controller/admin; known previous generation advances38->39.
 for phase in ('apply','restore'):
  p=HERE/phase/'bundle/ordinary05_roles.py';text=p.read_text().replace('t45-first-r3-native-service-start-20261116-38',OLD);p.write_text(text)
 p=HERE/'start/bundle/normal_service05_after08_proof.py';text=p.read_text().replace('t45-first-r3-native-service-start-20261116-38',OLD).replace('t45-r3-ordinary38-preserve-stop-20261116-01','t45-r3-ordinary39-preserve-stop-20261116-01').replace('t45-r3-ordinary38-auth-restore-20261116-01','t45-r3-ordinary39-auth-restore-20261116-01').replace('2026-11-17 02:16:23.493239+00','2026-11-17 05:39:40.169724+00');p.write_text(text)
 # Reuse the approved native; bind only known static job/service/inner leaf.
 p=HERE/'upgrade/bundle/catalog-successor-run.mjs';text=p.read_text().replace('const REQUEST=null;',"const REQUEST="+repr(J['upgrade']['jobId'])+';').replace('const START=null;','const START='+repr(NEW)+';').replace('const INNER=null;',"const INNER='/etc/naijue-erp/fresh35-settlement24-three-routine-40-v1.json';");p.write_text(text)
 save(HERE/'start/bundle/catalog-successor-run.mjs',p.read_bytes())
 # Host02 H01 predicate remains unchanged, as do driver/SQL/CHILD.
 p=HERE/'upgrade/bundle/batched161_command_update_host.py';text=p.read_text()
 fixed={'KEY':J['upgrade']['jobId'],'START':NEW,'SERVICE_PROOF':'fresh35-current-production-service-v2-service-40.json','ADMIN':'erp35_admin_20261110_r3','APPLY_KEY':J['apply']['jobId'],'ADMIN_CONFIG':'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/erp35_admin_20261110_r3.json','POLICY':'/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct40-batched-real.json','INNER_LEAF':'fresh35-settlement24-three-routine-40-v1.json','ROOT08_MARKER_SHA256':'5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c'}
 for k,value in fixed.items():text=assignment(text,k,value)
 text=text.replace("['jobs']['catalog_update']","['jobs']['upgrade']");p.write_text(text)
 p=HERE/'upgrade/bundle/catalog_transport.py';text=p.read_text()
 for k,value in {'KEY':J['upgrade']['jobId'],'START':NEW,'SERVICE_PROOF':fixed['SERVICE_PROOF']}.items():text=assignment(text,k,value)
 p.write_text(text)
 # Describe bridge uses only the exact maintenance descriptor, no business admin/provision body.
 p=HERE/'start/bundle/start_owned_describe.py';text=p.read_text().replace("ROOT/'state/installed-real-operation-batched-root07-20261117-01/source-materialization.json'","ROOT/'state/installed-real-operation-batched-root08-20261117-01/source-materialization.json'")
 text=assignment(text,'RUNNER_SHA',sha((HERE/'start/bundle/catalog-successor-run.mjs').read_bytes()));text=assignment(text,'MATERIAL_SHA',fixed['ROOT08_MARKER_SHA256']);text=assignment(text,'SOURCE_SHA','ac85caa5b8edc5768ffb8bd0f0668b0b9778b3c4be05c5498bbcd5ce45b1bbc3');text=text.replace("BOOT/'batched161-run.mjs'","BOOT/'catalog-successor-run.mjs'")
 a=text.index('    jobs=worker.parent\n',text.index('def run('));b=text.index("    need(type(admin_until) is int",a);text=text[:a]+"    request={'service':service,'backupAdminValidUntil':admin_until}\n"+text[b:]
 text=text.replace("d['format']=='FRESH35_BATCHED161_COMMAND_SUCCESSOR_PROGRAM_V1'","d['format']=='FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1'")
 p.write_text(text)
 # Retain startup lifecycle and readonly/runtime readiness; only its staged describe runner changes.
 p=HERE/'start/bundle/normal_service05_after08.py';text=p.read_text();needle="('batched161-run.mjs','0f45396df7aec8bac9651591c685b30f7d318066feffb0f7f4e98df592855af6')";assert text.count(needle)==1;text=text.replace(needle,"('catalog-successor-run.mjs',"+repr(sha((HERE/'start/bundle/catalog-successor-run.mjs').read_bytes()))+")");p.write_text(text)
 # Stop is still the original exact guardian closure, now also waits for this upgrade key settled/absent.
 p=HERE/'stop/bundle/normal05_preserve_stop.py';text=p.read_text();n=next(n for n in ast.parse(text).body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='CURRENT_BATCH_OPERATIONS'for x in n.targets));keys=ast.literal_eval(n.value);text=assignment(text,'CURRENT_BATCH_OPERATIONS',keys+(J['upgrade']['jobId'],));p.write_text(text)
 # Regenerate only dependency hashes whose exact static leaves changed; no imports/clock/runtime.
 oldpins={}
 for phase in ('apply','start','stop','restore'):
  for p in(HERE/phase/'bundle').iterdir():
   original=BASE/phase/'bundle'/p.name
   if p.suffix=='.py'and original.exists():oldpins[sha(original.read_bytes())]=p
 # Iteration over explicit dependency edge values, never self-hash; frozen source after convergence.
 for _ in range(12):
  changed=False
  for phase in ('apply','start','stop','restore'):
   for p in(HERE/phase/'bundle').glob('*.py'):
    if p.name not in ('ordinary05_roles_job.py','normal_service05_after08.py','normal_service05_after08_proof.py','normal05_preserve_stop.py'):continue
    text=p.read_text();rendered=text
    for oldpin,dep in list(oldpins.items()):
     if dep.name==p.name:continue
     rendered=rendered.replace(oldpin,sha(dep.read_bytes()))
    if rendered!=text:
     oldpins[sha(text.encode())]=p;p.write_text(rendered);changed=True
  if not changed:break
 # PINS and source tuples must be derived after all producer changes; regenerated separately below.
 p=HERE/'upgrade/bundle/batched161_command_update_host.py';text=p.read_text();oldpins0=json.loads((HOST/'SOURCE-PINS.json').read_bytes())['files'];pins={q.name:sha(q.read_bytes())for q in(HERE/'upgrade/bundle').iterdir()if q.name!=p.name};text=assignment(text,'PINS',pins);p.write_text(text)
 for phase in ('apply','start','restore','stop'):
  for p in(HERE/phase/'bundle').glob('*.py'):ast.parse(p.read_bytes())
 print(json.dumps({'state':'NORMAL40_STATIC_CONSUMER_RENDERED_NOT_FROZEN','serverCalls':0,'issuerOrClockCalls':0}))
if __name__=='__main__':main()
