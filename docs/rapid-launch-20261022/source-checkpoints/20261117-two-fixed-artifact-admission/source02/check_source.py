"""Narrow local SOURCE checks on reviewed existing metadata, never a policy/authority invocation."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 issuer=runpy.run_path(str(HERE/'issue_profile.py'),run_name='source_definitions_only')
 source=issuer['existing_inputs']()
 config=json.loads((HERE/'FIXED-PROFILES.json').read_text())
 profiles=config['profiles']
 module=runpy.run_path(str(HERE/'r3_two_fixed_artifact_admission.py'),run_name='source_definitions_only')
 assert profiles==module['PROFILES']
 assert set(profiles)=={'app','private'}and len(module['KEYS'])==4 and len(set(module['KEYS']))==4
 pair=issuer['PAIR'];review=json.loads(issuer['checked'](issuer['PAIR_REVIEW'],issuer['PAIR_REVIEW_SHA']))
 for kind,row in profiles.items():
  fixed=json.loads((pair/kind/'FIXED-SCOPE.json').read_text());assert row['fixedScope']==fixed==review['fixedScopes'][kind]
  for name,pin in row['bundlePins'].items():assert source['files'][kind+'/'+name]==pin and sha((pair/kind/name).read_bytes())==pin
  # Install/restore policy and receiver source is reused byte-exact, no211 aliases or combined scope.
  scope=runpy.run_path(str(pair/kind/'reception_scope.py'),run_name='source_scope_constants_only')
  assert (scope['INSTALL'],scope['RESTORE'],scope['MAX_WINDOW_MS'])==(row['installKey'],row['restoreKey'],row['maximumWindowMs'])
 assert profiles['app']['fixedScope']['archiveSha256']=='14f34cd1dccaf0b3cd40c979620889f728307714fddf1b33896ee7c72882701f'and profiles['app']['fixedScope']['archiveBytes']==7687919
 assert profiles['private']['fixedScope']['archiveSha256']=='244bba744ce2f737bc3d5419ee6ba4179abbd15173b1d532d800fff231e39d4d'and profiles['private']['fixedScope']['archiveBytes']==40960
 for p in HERE.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
 # Preview only on genuine known current37 source. No finite profile or future active SHA.
 baseline=ROOT/'outputs/主控/20261117-r3-normal37-registration-window-01/admin_exec.ISSUED.py';raw=baseline.read_bytes();pin='6f32585ee20edcb0ac9019be4ba9907faad4d637268dea84f1db6cdf747204dd';assert sha(raw)==pin
 patcher=runpy.run_path(str(HERE/'patch_dispatcher.py'),run_name='source_patcher_only');preview=patcher['render'](raw,pin,sha((HERE/'r3_two_fixed_artifact_admission.py').read_bytes()))
 tree=ast.parse(preview);old=ast.parse(raw)
 def assignment(t,name):return next(ast.literal_eval(n.value)for n in t.body if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name)and n.targets[0].id==name)
 assert assignment(tree,'FIXED_ARTIFACT_PROFILE_SHA256')is None
 oldkeys=assignment(old,'R3_ORIGINAL02_ABSENT_KEYS');keys=assignment(tree,'R3_ORIGINAL02_ABSENT_KEYS');assert keys==oldkeys+list(patcher['KEYS'])
 for name in ('R3_ORIGINAL02_ABSENT_POLICY_SHA256','R3_ORIGINAL02_ABSENT_SOURCE_SHA256'):assert assignment(tree,name)==assignment(old,name)
 assert len([n for n in ast.walk(tree)if isinstance(n,ast.Compare)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.comparators)])==3
 # Reject a genuine wrong-key failed03 as a writer. Never fabricate a successful post-writer fixture.
 v=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL37-RUNTIME-01'
 actual_wrong=json.loads((v/'prepare/ACTUAL-PREPARE03-RESULT.json').read_text());stop=json.loads((v/'stop/ACTUAL-STOP37-RESULT.json').read_text());restore=json.loads((v/'restore/ACTUAL-RESTORE37-RESULT.json').read_text());policy=json.loads((baseline.parent/'direct37-batched-real.json').read_text())
 try:issuer['validate_closed_receipts'](policy,actual_wrong,stop,restore)
 except AssertionError:pass
 else:raise AssertionError('Real failed03 must not qualify as completed writer')
 mtext=(HERE/'r3_two_fixed_artifact_admission.py').read_text();assert "writer.get('verification',{}).get('state')=='VERIFIED'"in mtext
 assert not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr in ('flock','connect')for n in ast.walk(ast.parse(mtext)))
 itree=ast.parse((HERE/'issue_profile.py').read_text());assert not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr in ('time','time_ns','now','utcnow','connect')for n in ast.walk(itree))
 (HERE/'KNOWN37-PATCH-PREVIEW.UNREGISTERED.py').write_bytes(preview)
 return dict(state='SOURCE_ONLY_FIXED_PAIR_AND_PATCH_CHECKED_NOT_REGISTERED',pairSourcePinsSha256=issuer['PAIR_SHA'],pairReviewSha256=issuer['PAIR_REVIEW_SHA'],fourKeys=list(patcher['KEYS']),known37OnlyBaselineSha256=pin,known37PrefixRetained=len(oldkeys),previewProtectedKeys=len(keys),profilePinInPreview=None,normalHelperAndPolicyPinsUnchanged=True,threeExistingTerminalGuardsCoverFourKeys=True,reviewedReceiversAndPoliciesUnchanged=True,privatePayloadBodiesExtracted=False,archivesRehashedOrRebuilt=False,actualWrongFailed03Rejected=True,actualPostWriterSuccessProfileValidated=False,futureBaselineOrAuthorityFixtureCreated=False,clockOrIssuerOrPolicyOrReceiverInvoked=False,serverActions=0,PGConnections=0,registrationCAS='NOT_PREPARED_UNTIL_ACTUAL_POST_WRITER_BASELINE',positiveAdmissionOrUploadTest='NOT_RUN')
if __name__=='__main__':
 result=main();(HERE/'LOCAL-CHECKS.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n');print(json.dumps(result,sort_keys=True))
