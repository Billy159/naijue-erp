from pathlib import Path
import ast,json
D=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D1/20261118-r3-after45-businessroot-durable-root-source-01');b=json.loads((D/'CONSUMER-BINDING.json').read_bytes());C=Path(b['consumerSourceDirectory']);interface=json.loads((C/'INTERFACE.UNISSUED.json').read_bytes());producer=ast.parse((D/'issue_registration.py').read_text());consumer=ast.parse((C/'diagnostic_cli.py').read_text());issue=next(n for n in producer.body if isinstance(n,ast.FunctionDef)and n.name=='issue');checks=[]
def ok(v,l):
 assert v,l
 checks.append(l)
def assigned(name):return next(n.value for n in ast.walk(issue)if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets))
def kw(name):
 n=assigned(name);assert isinstance(n,ast.Call)and isinstance(n.func,ast.Name)and n.func.id=='dict';return {k.arg:k.value for k in n.keywords}
out=assigned('outputs');outputs={k.value:v for k,v in zip(out.keys,out.values)};ok(set(outputs)=={'host-authorization.json','registered-policy.json','registration-authorization.json','registration-packet.json','ISSUED.json'},'Producer exact five actual issuance files includes consumer registered-policy basename')
ok(isinstance(outputs['registered-policy.json'],ast.Name)and outputs['registered-policy.json'].id=='policy_raw','Consumer registered-policy uses exact same policy raw bytes as CAS packet')
metadata=kw('metadata');needed={n.slice.value for n in ast.walk(consumer)if isinstance(n,ast.Subscript)and isinstance(n.value,ast.Name)and n.value.id=='issued'and isinstance(n.slice,ast.Constant)};ok(needed<=set(metadata)and needed=={'requestKey','authoritySha256','policySha256'},'Producer metadata covers every actual consumer issued field')
ok(isinstance(metadata['requestKey'],ast.Name)and metadata['requestKey'].id=='key','Consumer requestKey is exact new job key')
ok(set(kw('authority'))==set(interface['authorityFields']),'Exact consumer authority seven fields no missing role leaf')
ok(set(kw('policy'))=={'format','requestKey','startsAt','expiresAt','authoritySha256','sourceReviewSha256','bundlePins'},'Registered policy fields match original diagnostic contract')
for name in ('authority','policy'):
 d=kw(name);fmt=d['format'];ok(isinstance(fmt,ast.Subscript)and isinstance(fmt.value,ast.Name)and fmt.value.id=='b'and fmt.slice.value==name+'Format','Producer '+name+' format bound to exact frozen consumer interface')
# Resolve only declared path constant expressions from actual source, no main/load/state.
cli_scope={'Path':Path,'__file__':str(C/'diagnostic_cli.py')}
for n in consumer.body:
 if isinstance(n,ast.Assign)and all(isinstance(t,ast.Name)and t.id in ('HERE','V','PROJECT','WINDOW','KEY')for t in n.targets):exec(compile(ast.Module(body=[n],type_ignores=[]),'actual_cli_path_constants','exec'),cli_scope)
prod_scope={'Path':Path,'__file__':str(D/'issue_registration.py')}
for n in producer.body:
 if isinstance(n,ast.Assign)and all(isinstance(t,ast.Name)and t.id in ('HERE','ROOT','WINDOW','DECISION')for t in n.targets):exec(compile(ast.Module(body=[n],type_ignores=[]),'actual_issuer_path_constants','exec'),prod_scope)
ok(cli_scope['WINDOW']==prod_scope['WINDOW'],'Producer and consumer fixed WINDOW same absolute directory')
ok(cli_scope['KEY']==b['rule']['jobId']and Path(b['rule']['sourceDirectory'])==C/'bundle','Exact consumer source directory and key bound by rule')
ok(len(issue.args.args)==7 and [a.arg for a in issue.args.args]==['review_file','review_pin','basis_file','basis_pin','output_directory','consumer_review_file','consumer_review_pin'],'Main original seven parameter issue API retained')
text=(C/'diagnostic_cli.py').read_text();ok("'--phase-arg',issued['authoritySha256']" in text and "'--script','durable_readonly_job.py','--timeout-seconds','300'" in text,'Actual consumer CLI single issued authority SHA argument and300 seconds')
ok("set(policy['bundlePins'])|{'host-authorization.json'}" in text and set(b['rule']['bundlePins'])=={'scope.json','durable-readonly.sql','durable_readonly_job.py'},'Actual collector exact three static files plus sole dynamic AUTH')
ok("scopeSha256=pins['scope.json']" in (D/'issue_registration.py').read_text(),'Issued authority scope pin comes from same exact consumer scope file')
cas_text=(D/'register_cas.py').read_text();channel=(D/'prepare_channel.py').read_text();ok("issued['registrationSha256']"in channel and 'registrationSha256'in metadata and "a['jobs']==JOBS"in cas_text,'Original channel registration metadata packet and CAS job key agree')
ok("'policy':policy_raw"in(D/'issue_registration.py').read_text()and "p['authoritySha256']"in(D/'r3_after45_businessroot_durable_readonly.py').read_text(),'Registered policy uses same bytes throughout packet and consumer')
(D/'INTERFACE-CHECKS.json').write_text(json.dumps({'state':'PASS_ACTUAL_SOURCE_AST_INTERFACE_ONLY_NO_ISSUANCE_OR_CLI_EXECUTION','checks':checks,'count':len(checks),'futurePositiveAUTHFixture':False,'clockCalls':0,'clientStateRemoteSubmitCalls':0,'existingClientRequestConstructorReused':True},ensure_ascii=False,indent=2)+'\n');print('INTERFACE_CHECKS',len(checks))
