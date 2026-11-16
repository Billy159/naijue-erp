"""Project exact native withdrawn snapshots onto the original approved chunk plan."""
from pathlib import Path
import hashlib,json,runpy,sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
BASE=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/INPUT-RECEPTION-01/CACHED-02'
sys.path.insert(0,str(BASE));b=runpy.run_path(str(BASE/'batch_protocol.py'))
def build(result_file,result_pin,authority_file,authority_pin,manifest_file,manifest_pin,output_directory):
 result_raw=Path(result_file).read_bytes();assert b['sha'](result_raw)==result_pin;r=json.loads(result_raw)
 assert r['finalPolicyAbsent'] and r['finalPolicy']['state']=='ENOENT' and r['restored']['status']=='COMPLETED' and r['restored']['exitCode']==0
 old_raw=Path(authority_file).read_bytes();old_manifest=Path(manifest_file).read_bytes();assert b['sha'](old_raw)==authority_pin and b['sha'](old_manifest)==manifest_pin
 a,parts=b['bind'](old_raw,authority_pin,old_manifest);receiver=(BASE/'artifact-receiver.d3-chunk.py').read_bytes();assert b['sha'](receiver)==a['codeSha256']['artifact-receiver.d3-chunk.py']
 expected=[p['artifactKey']for p in parts];assert set(r['originalKeys'])==set(expected)
 original_immutable=b['pack']([{**part,'window':{**part['window'],'boundary':None}}for part in parts])
 immutable=[];facts=[]
 for part in parts:
  state=r['originalKeys'][part['artifactKey']];assert state['basis']=='EXACT_WITHDRAWN_BATCH_READONLY'
  assert state['status']in ('ABSENT','READY','EXACT_PREFIX_READBACK_ONLY','FULL_FRAGMENT_AWAITING_FINALIZE')
  _,g,_=b['part_api'](receiver,a,part,authority_pin)
  part['window']['boundary']=None if state['status']=='ABSENT' else g['recovery_snapshot'](state)
  b['part_api'](receiver,a,part,authority_pin)
  immutable.append({**part,'window':{**part['window'],'boundary':None}})
  facts.append({'artifactKey':part['artifactKey'],'state':state['status'],'bytes':state.get('bytes',0),'nextSegment':state.get('nextSegment')})
 assert b['pack'](immutable)==original_immutable
 raw=b['pack'](parts);out=Path(output_directory).resolve();assert out.is_relative_to(HERE);out.mkdir(mode=0o700)
 (out/'batch-manifest.json').write_bytes(raw)
 fixed={key:value for key,value in a.items()if key not in ('startsAt','expiresAt','decisionReference')};fixed['batchManifestSha256']=b['sha'](raw)
 (out/'AUTHORITY-FIELDS.UNISSUED.json').write_text(json.dumps({'fixed':fixed,'issuerAdds':['startsAt','expiresAt','decisionReference'],'alreadyIssued':False},indent=2)+'\n')
 evidence={'state':'EXACT_WITHDRAWN_NATIVE_BOUNDARY_PROJECTED_NO_AUTHORITY_ISSUED','oldAuthoritySha256':authority_pin,'oldManifestSha256':manifest_pin,'readbackSha256':result_pin,'recoveryManifestSha256':b['sha'](raw),'normalizedManifestSha256':b['sha'](b['pack'](immutable)),'parts':facts,'serverActions':0}
 (out/'BOUNDARY-PROJECTION.json').write_text(json.dumps(evidence,indent=2)+'\n');return evidence
if __name__=='__main__':print(json.dumps(build(*sys.argv[1:])))
