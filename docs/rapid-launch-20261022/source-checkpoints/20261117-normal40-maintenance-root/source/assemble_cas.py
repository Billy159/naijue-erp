"""Reuse the accepted root CAS/lock/publish mechanism for exactly five maintenance keys."""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent
BASE=HERE.with_name('20261117-r3-root08-source-admission-02')/'register_exact.py'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def main():
 raw=BASE.read_bytes();assert sha(raw)=='2055852dbde81425066f5d35839f95d8bdd6104c78d39c208c542ab2237647f6'
 h=json.loads((HERE/'HISTORY-INPUTS.json').read_bytes());text=raw.decode()
 edits={
 "KEY='t45-r3-batched-root08-source-delta-20261117-01'":'JOBS='+repr(h['jobs'])+'\nKEYS=tuple(JOBS.values())\nEXPECTED_RULES='+repr(h['expectedRules']),
 'r3-root08-source-registration-source-20261117-01':'r3-normal40-registration-source-20261117-01',
 'r3-root08-source-registration-cas-20261117-01':'r3-normal40-registration-cas-20261117-01',
 "/register_exact.py'":"/register_cas.py'",
 "NEW_MODULE=P/'r3_root08_source_admission.py'":"NEW_MODULE=P/'r3_normal40_continuation.py'",
 "NEW_POLICY=H/'root08-source-only-20261117-01.json'":"NEW_POLICY=H/'direct40-batched-real.json'",
 '.root08-source-dispatcher.pending':'.normal40-dispatcher.pending',
 "OLD='b4013f9a04e35bfae287742a7d91b9c2a9daf1d06b0768262db01b8de40926de'":"OLD='7cab381f7cd7aa402a0087a14ecb2571460dd11274b00cee0dbd62938fb8b814'",
 'module.Root08SourceAdmission(core,prior,cfg,sha(policy_raw))':'module.Normal40Continuation(core,prior,cfg,sha(policy_raw))',
 'ROOT08_SOURCE_POLICY_SHA256':'NORMAL40_POLICY_SHA256',
 'T45_ROOT08_SOURCE_REGISTRATION_ONLY_V1':'T45_NORMAL40_REGISTRATION_CAS_V1',
 'EXACT_ROOT08_SOURCE_KEY_REGISTERED_NO_MATERIALIZATION_OR_SQL':'EXACT_NORMAL40_FIVE_PHASE_ROOT_REGISTERED_NO_PHASE_OR_SQL_EXECUTED',
 'old109AndThreeGuardsPreserved':'old110AndThreeGuardsPreserved',
 "'materializationSubmitted':False":"'maintenanceSubmitted':False",
 }
 for a,b in edits.items():assert a in text,a;text=text.replace(a,b)
 old="    need(not any(os.path.lexists(grant/rel)for rel in ('jobs/'+KEY,'requests/'+KEY+'.json','requests/'+KEY+'.tmp','results/'+KEY+'.json')),'ROOT08_KEY_PRESENT_NO_REPLAY')"
 new="    for key in KEYS:need(not any(os.path.lexists(grant/rel)for rel in ('jobs/'+key,'requests/'+key+'.json','requests/'+key+'.tmp','results/'+key+'.json')),'NORMAL40_KEY_PRESENT_NO_REPLAY')"
 assert text.count(old)==1;text=text.replace(old,new,1)
 text=text.replace("{'format','requestKey','sourceSha256'","{'format','jobs','sourceSha256'",1)
 text=text.replace("a['requestKey']==KEY","a['jobs']==JOBS",1)
 old=" policy=json.loads(files['policy']);need(policy['requestKey']==KEY and policy['sourceReviewSha256']==a['independentReviewSha256'],'SAME_REVIEW_REQUIRED')"
 assert text.count(old)==1;text=text.replace(old," policy=json.loads(files['policy']);validate_policy_delta(policy)",1)
 line=" need(set(policy['diagnosticClosedPins'])=={'terminalSha256','resultSha256','cleanupSha256'}and all(type(pin)is str and re.fullmatch('[a-f0-9]{64}',pin)for pin in policy['diagnosticClosedPins'].values()),'ACTUAL_DIAGNOSTIC02_CLOSURE_PINS_REQUIRED')\n"
 assert text.count(line)==1;text=text.replace(line,'',1).replace("quiet(policy['diagnosticClosedPins'])",'quiet()')
 # The same already-observed diagnostic pins are fixed in diagnostic_closed;
 # no future C/epoch/policy is added to the five-field normal policy.
 start=text.index('sha=lambda raw:')
 root='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3'
 preserve={
  "str(B/'jobs/t45-r3-ordinary39-auth-restore-20261116-01/r3-outer-terminal.json')":h['original39Restore']['terminalSha256'],
  "str(B/'jobs/t45-r3-ordinary39-auth-restore-20261116-01/results/maintenance-auth-result.json')":h['original39Restore']['rootResultSha256'],
  "str(P/'r3_root08_source_admission.py')":h['actualRootPins']['root08Module'],
  "str(H/'root08-source-only-20261117-01.json')":h['actualRootPins']['root08Policy'],
  "str(B/'jobs/t45-r3-batched-root08-source-delta-20261117-01/r3-outer-terminal.json')":h['root08']['terminalSha256'],
  "str(B/'jobs/t45-r3-batched-root08-source-delta-20261117-01/results/batched-source-materialization.json')":h['root08']['rootResultSha256'],
  "str(Path('"+root+"/state/installed-real-operation-batched-root08-20261117-01/source-materialization.json'))":h['root08']['markerSha256'],
  "str(Path('"+root+'/'+h['retainedAck39']['relativePath']+"'))":h['retainedAck39']['expectedRawSha256'],
 }
 text=text[:start]+'PRESERVE.update({'+','.join(k+':'+repr(v)for k,v in preserve.items())+'})\n'+text[start:]
 text=text.replace("a['expiresAt']<=a['startsAt']+300000","a['expiresAt']<=a['startsAt']+600000",1)
 validator='''def validate_policy_delta(p):
 need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_NORMAL40_BATCHED_REAL_V1'and p['grantId']=='b16447fbc81f4d64','EXACT_NORMAL40_POLICY_REQUIRED')
 need(type(p['startsAt'])is type(p['expiresAt'])is int and p['startsAt']<p['expiresAt']<=p['startsAt']+5100000 and set(p['jobs'])==set(JOBS),'FIVE_PHASE_5100S_POLICY_REQUIRED')
 role_pins=[]
 for phase,rule in p['jobs'].items():
  item=dict(rule);pins=dict(item['bundlePins'])
  if phase in ('apply','restore'):role_pins.append(pins.pop('roles-authorization.json',None))
  item['bundlePins']=pins;need(item==EXPECTED_RULES[phase],'EXACT_NORMAL40_CONSUMER_RULE_REQUIRED')
 need(len(role_pins)==2 and role_pins[0]==role_pins[1]and type(role_pins[0])is str and re.fullmatch('[a-f0-9]{64}',role_pins[0]),'SAME_NEW_ROLE_PIN_REQUIRED')

'''
 anchor='def consumer(dispatcher,cfg,module_raw,policy_raw):';assert text.count(anchor)==1;text=text.replace(anchor,validator+anchor,1)
 (HERE/'register_cas.py').write_text(text)
 print('Rendered exact five-key CAS source with inherited lock/publish; no runtime calls.')
if __name__=='__main__':main()
