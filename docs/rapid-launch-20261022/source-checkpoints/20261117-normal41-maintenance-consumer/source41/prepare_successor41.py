"""Owner's exact Source40->41 identity/proof-path delta, no runtime calls."""
from pathlib import Path
import ast,hashlib,json
HERE=Path(__file__).resolve().parent;V=HERE.parent;OLD=V/'NORMAL40-THREE-ROUTINE-MAINTENANCE-SOURCE-02'
sha=lambda b:hashlib.sha256(b).hexdigest()
def assign(text,name,value):
 n=next(n for n in ast.parse(text).body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id==name for x in n.targets));return text.replace(ast.get_source_segment(text,n),name+' = '+repr(value),1)
def main():
 before=json.loads((OLD/'INTERFACE.UNISSUED.json').read_bytes());after=json.loads((HERE/'INTERFACE.WIP.json').read_bytes());oldpins={}
 # Exact current operation identifiers, not a global generation-string rewrite.
 ids={before['jobs'][ph]['jobId']:r['jobId']for ph,r in after['jobs'].items()}
 current_literals={**ids,'t45-fresh35-first-production-20261110-r3-service-40':'t45-fresh35-first-production-20261110-r3-service-41','fresh35-current-production-service-v2-service-40.json':'fresh35-current-production-service-v2-service-41.json','ordinary40-auth-20261117-01':'ordinary41-auth-20261117-01','ordinary40-auth-capture-20261117-01':'ordinary41-auth-capture-20261117-01','direct40-batched-real.json':'direct41-batched-real.json','fresh35-settlement24-three-routine-40-v1.json':'fresh35-settlement24-three-routine-41-v1.json'}
 for phase in ('apply','start','upgrade','stop','restore'):
  folder=HERE/phase/'bundle'
  for original in(OLD/phase/'bundle').iterdir():
   raw=original.read_bytes();target=folder/original.name
   # Historical receipts and actual39 helper are immutable provenance.
   if original.suffix in('.py','.mjs')and original.name not in ('prior_preserved38.py','fresh35-production-carrier.py','normal_service04.py','normal_service04_proof.py','root06_material.py','root07_material.py','source_lineage.py','catalog-pg-driver.mjs'):
    text=raw.decode()
    for old,new in current_literals.items():text=text.replace(old,new)
    raw=text.encode()
   target.write_bytes(raw);oldpins[sha(original.read_bytes())]=target
 # First-exclusive-mkdir cause: own41 host projection, keep exclusion strict.
 p=HERE/'start/bundle/r3_05_runtime.py';text=p.read_text();a="PROOF_PROJECTION = HOST_ROOT/'authority/r3-service-39-worker-proof'";assert text.count(a)==1;p.write_text(text.replace(a,"PROOF_PROJECTION = HOST_ROOT/'authority/r3-service-41-worker-proof'",1))
 # Preserve successful39 separately from failed40/restored40. Wrapper checks
 # closed40 facts but never invents a successful40 C/epoch.
 closed=(HERE/'prior_closed40.py').read_bytes()
 for phase in('apply','start','restore'):
  folder=HERE/phase/'bundle';(folder/'successful39_history.py').write_bytes((OLD/'prior_preserved39.py').read_bytes());(folder/'prior_preserved38.py').write_bytes(closed)
 # Refresh changed dependency edges only; never rewrite historical39 hashes.
 for _ in range(12):
  changed=False
  for phase in('apply','start','restore','stop'):
   for p in(HERE/phase/'bundle').glob('*.py'):
    if p.name not in('ordinary05_roles_job.py','normal_service05_after08.py','normal_service05_after08_proof.py','normal05_preserve_stop.py','start_owned_describe.py'):continue
    text=p.read_text();rendered=text
    for pin,dependency in list(oldpins.items()):
     if dependency.name!=p.name:rendered=rendered.replace(pin,sha(dependency.read_bytes()))
    if rendered!=text:oldpins[sha(text.encode())]=p;p.write_text(rendered);changed=True
  if not changed:break
 p=HERE/'upgrade/bundle/batched161_command_update_host.py';text=p.read_text();pins={q.name:sha(q.read_bytes())for q in p.parent.iterdir()if q.name!=p.name};p.write_text(assign(text,'PINS',pins))
 # Same driver/CHILD/SQL and H01 predicate; native changes static IDs only.
 cli=(OLD/'phase_cli.py').read_text().replace('PHASES40.UNISSUED.json','PHASES41.UNISSUED.json');(HERE/'phase_cli.py').write_text(cli)
 observer=(OLD/'read_phase.py').read_text();(HERE/'read_phase.py').write_text(observer)
 print(json.dumps({'state':'SOURCE41_RENDERED_CURRENT_IDENTITIES_AND_EXCLUSIVE_PROJECTION_ONLY','serverCalls':0,'clockCalls':0}))
if __name__=='__main__':main()
