"""Render the minimal CAS successor over the accepted durable CAS implementation."""
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
BASE=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/DURABLE-READONLY-SOURCE-03'
def main():
 text=(BASE/'register_exact.py').read_text()
 replacements={
  "KEY='t45-r3-core0-durable-readonly-20261117-02'":"KEY='t45-r3-batched-root08-source-delta-20261117-01'",
  'r3-core0-durable-registration-source-20261117-02':'r3-root08-source-registration-source-20261117-01',
  'r3-core0-durable-registration-cas-20261117-02':'r3-root08-source-registration-cas-20261117-01',
  "NEW_MODULE=P/'r3_core0_durable_readonly_02.py'":"NEW_MODULE=P/'r3_root08_source_admission.py'",
  "NEW_POLICY=H/'core0-durable-readonly-20261117-02.json'":"NEW_POLICY=H/'root08-source-only-20261117-01.json'",
  '.core0-durable02-dispatcher.pending':'.root08-source-dispatcher.pending',
  "OLD='45914df73ffcf2840df3e9d264654f64154ebb3a9d42805b74998caee812041f'":"OLD='b4013f9a04e35bfae287742a7d91b9c2a9daf1d06b0768262db01b8de40926de'",
  'module.DurableReadonly02Continuation(core,prior,cfg,sha(policy_raw))':'module.Root08SourceAdmission(core,prior,cfg,sha(policy_raw))',
  'T45_R3_CORE0_DURABLE_REGISTRATION_ONLY_V1':'T45_ROOT08_SOURCE_REGISTRATION_ONLY_V1',
  'DURABLE_CORE0_02_POLICY_SHA256':'ROOT08_SOURCE_POLICY_SHA256',
  'EXACT_ONE_READONLY_KEY_REGISTERED_NO_PG_OR_JOB':'EXACT_ROOT08_SOURCE_KEY_REGISTERED_NO_MATERIALIZATION_OR_SQL',
  'DIAGNOSTIC_KEY_PRESENT_NO_REPLAY':'ROOT08_KEY_PRESENT_NO_REPLAY',
  "'diagnosticSubmitted':False":"'materializationSubmitted':False",
  'old108AndThreeGuardsPreserved':'old109AndThreeGuardsPreserved',
 }
 for old,new in replacements.items():assert old in text,old;text=text.replace(old,new)
 anchor='sha=lambda raw:'
 preserve="PRESERVE.update({str(P/'r3_core0_durable_readonly_02.py'):'f6aca8ef0f69f606a8166264c634c5ae44d6e0070c17851a87d02bc1405e3257',str(H/'core0-durable-readonly-20261117-02.json'):'4b9e9042efe499a2aff77b93360493d3e00ab505b81f58712410c2e019e50cc5',str(P/'r3_direct38_aux_prepare.py'):'3b7ebfcb95df010fdbd585b5551851cba6cd65953e54352ab25ee01bb3ec368d',str(H/'direct38-batched-real.json'):'51da8cb64ce60386c60340126f95bb85a99a01d0275845a048dc600e092d949e'})\n"
 assert text.count(anchor)==1;text=text.replace(anchor,preserve+anchor,1)
 text=text.replace("sha=lambda raw:","CUSTODY=[Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary39-auth-20261116-01')/name for name in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json')]\nsha=lambda raw:",1)
 anchor=" need(identity(LOCK.lstat())==LOCK_ID,'ORIGINAL_LOCK_DIFFERS');out['executionLock']=list(LOCK_ID)"
 assert text.count(anchor)==1
 text=text.replace(anchor," for path in CUSTODY:\n  s=path.lstat();need(path.resolve()==path and stat.S_ISREG(s.st_mode)and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400,'ORIGINAL_SNAPSHOT_STAT_ONLY_REQUIRED');out[str(path)]=list(identity(s))\n"+anchor,1)
 text=text.replace("set(PRESERVE)|{'executionLock'}","set(PRESERVE)|{str(path)for path in CUSTODY}|{'executionLock'}",1)
 anchor=" need(identity(LOCK.lstat())==LOCK_ID==tuple(old['executionLock']),'ORIGINAL_LOCK_CHANGED')"
 assert text.count(anchor)==1
 text=text.replace(anchor," for path in CUSTODY:need(list(identity(path.lstat()))==old[str(path)],'ORIGINAL_SNAPSHOT_STAT_CHANGED')\n"+anchor,1)
 text=text.replace('def quiet():','def quiet(expected_diagnostic=None):',1)
 helper=(HERE/'closure.template.py').read_text();anchor='def quiet(expected_diagnostic=None):'
 assert text.count(anchor)==1;text=text.replace(anchor,helper+anchor,1)
 anchor='def consumer(dispatcher,cfg,module_raw,policy_raw):'
 assert text.count(anchor)==1;text=text.replace(anchor," closure=diagnostic_closed()\n if expected_diagnostic is not None:need({k:closure[k]for k in ('terminalSha256','resultSha256','cleanupSha256')}==expected_diagnostic,'ACTUAL_DIAGNOSTIC02_FRESH_CLOSURE_CHANGED')\n return closure\n"+anchor,1)
 start=text.index('def register(')
 tail=text[start:];assert tail.count('quiet()')==4
 tail=tail.replace('quiet()',"quiet(policy['diagnosticClosedPins'])")
 anchor=" cfg=json.loads(read(P/'grant.json')[0]);"
 assert tail.count(anchor)==1
 tail=tail.replace(anchor," need(set(policy['diagnosticClosedPins'])=={'terminalSha256','resultSha256','cleanupSha256'}and all(type(pin)is str and re.fullmatch('[a-f0-9]{64}',pin)for pin in policy['diagnosticClosedPins'].values()),'ACTUAL_DIAGNOSTIC02_CLOSURE_PINS_REQUIRED')\n"+anchor,1)
 text=text[:start]+tail
 # No actual authority, source registration or old root mutation is performed.
 (HERE/'register_exact.py').write_text(text)
 print('Rendered source-only Root08 CAS successor; no execution.')
if __name__=='__main__':main()
