# coding: utf-8
from pathlib import Path
import json,hashlib,runpy,sys
root=Path.cwd();b=root/'outputs/主控/20261115-r3-direct-service24-issuer-local-01';s=b/'SERVICE31-INSTALL-TRANSPORT-02';control=root/'outputs/主控'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
startpath=Path(sys.argv[1]);startpin=sys.argv[2];applypath=Path(sys.argv[3]);applypin=sys.argv[4];matpath=Path(sys.argv[5]);matpin=sys.argv[6]
assert h(startpath)==startpin and h(applypath)==applypin and h(matpath)==matpin
start=json.loads(startpath.read_bytes());material=json.loads(matpath.read_bytes())
assert material['terminal']['jobId']=='t45-r3-batched-root04-source-delta-20261116-01' and (material['terminal']['status'],material['terminal']['exitCode'])==('COMPLETED',0)
assert material['resultObjectsEqual'] is True and material['operatorReadySha256']==material['rootPins']['result']=='8bb064ba27cbdaeb04b64408fee3ac2f2c7c9b28c7a7720761105ca1d7d191e1'
assert material['result']['sourceSetSha256']=='ba6c85d25118972ba81e859a0539a854a6cb39f4360b47ed35914fdbcf183663' and material['result']['sourceFiles']==382
assert start['descriptionSource']=='STORED_START_JOB_OUTPUTS_NO_NODE_RERUN' and start['descriptionRootPublicObjectsMatched'] is True
assert (start['terminal']['status'],start['terminal']['exitCode'])==('COMPLETED',0)
descdir=startpath.with_name(startpath.stem+'-describe');d=descdir/'DESCRIPTOR.json';f=descdir/'LIVE-FACTS.json'
assert json.loads(d.read_bytes())==start['descriptor'];assert json.loads(f.read_bytes())==start['liveFacts']
review=Path(sys.argv[7]);reviewpin=sys.argv[8];assert h(review)==reviewpin
rv=json.loads(review.read_bytes());assert rv['state']=='FINAL_SAME_VERSION_NORMAL_CHAIN_SOURCE_PASS' and rv['normalStartupHoldClosed'] is True and rv['rulesSha256']=='5d0ab4760c08e3614b6b0914e69d09c8e53a37348d2aaa1a8cd31e92335bf2cf'
assert start['service']['serviceKey']=='t45-first-r3-native-service-start-20261116-31'
pins=s/'PINS.json';assert h(pins)=='184e65b96ab721b88853e5028971343fad46134748b110b3910f109f212f07e8'
for name in ('issue_upgrade_authority.py','issue_phase.py'):assert h(s/name)==json.loads(pins.read_bytes())[name]
client=root.parent/'monitor/normal-admission-20261112-01/admin_client-t45-code-transport-v2.py';assert h(client)=='846e3dd51c7607b01c7e73b36f73c6edec03d3be981b2f40bf2bed14db7d2e54'
inner=runpy.run_path(str(s/'issue_upgrade_authority.py'),run_name='local_authority')['issue'](str(d),h(d),str(f),h(f),str(review),h(review),str(control/'20261116-r3-direct-service31-inner-install-window-01'))
print(json.dumps({'inner':inner}),flush=True)
context=dict(apply=json.loads(applypath.read_bytes()),start=start,operatorReadySha256=material['operatorReadySha256'],innerAuthorityPath=inner['path'],innerAuthoritySha256=inner['sha256'])
ctx=control/'20261116-r3-direct-service31-inner-install-window-01/INSTALL-CONTEXT.json'
with ctx.open('x') as x:json.dump(context,x,sort_keys=True,indent=2)
rules=root/'outputs/T45/revisions/20261116-r3-normal31-source-local-01/CANDIDATE-01/PHASES31.UNISSUED.json'
outer=runpy.run_path(str(s/'issue_phase.py'),run_name='local_authority')['issue']('install',str(rules),'5d0ab4760c08e3614b6b0914e69d09c8e53a37348d2aaa1a8cd31e92335bf2cf',str(control/'20261116-r3-direct31-registration-window-01'),str(startpath),startpin,str(ctx),h(ctx))
print(json.dumps({'outer':outer,'contextPath':str(ctx),'contextSha256':h(ctx),'descriptorWindow':dict(startsAt=start['descriptor']['startsAt'],expiresAt=start['descriptor']['expiresAt']),'serverAction':False}))
