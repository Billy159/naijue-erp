"""Future fixed original-client entry; no issuer, CAS or arbitrary job/SQL API."""
from pathlib import Path
import ast,hashlib,json,os,runpy,sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
PREPARATION=V/'ROOT08-EXECUTION-PREPARATION-01'
WINDOW=ROOT/'outputs/主控/20261117-r3-root08-source-materialization-window-01'
LOADER=V/'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py'
CLIENT=ROOT.parent/'monitor/normal-admission-20261112-01/admin_client-t45-code-transport-v3.py'
KEY='t45-r3-batched-root08-source-delta-20261117-01'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def prepare(cas_result_file):
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw)
 issued=json.loads((WINDOW/'ISSUED.json').read_bytes());assert issued['sourcePinsSha256']==sha(source_raw)and issued['requestKey']==KEY
 authority=(WINDOW/'materialize-authorization.json').read_bytes();policy=(WINDOW/'registered-policy.json').read_bytes()
 assert sha(authority)==issued['authoritySha256']and sha(policy)==issued['policySha256']
 registration=json.loads(Path(cas_result_file).read_bytes())
 assert registration['status']=='EXACT_ROOT08_SOURCE_KEY_REGISTERED_NO_MATERIALIZATION_OR_SQL'and registration['old109AndThreeGuardsPreserved']is True
 assert registration['moduleSha256']==source['files']['r3_root08_source_admission.py']['sha256']and registration['policySha256']==issued['policySha256']
 template=(HERE/'admin_exec.ROOT08-UNREGISTERED.py').read_bytes()
 needle=b'ROOT08_SOURCE_POLICY_SHA256 = None';assert template.count(needle)==1
 expected=template.replace(needle,('ROOT08_SOURCE_POLICY_SHA256 = '+repr(sha(policy))).encode())
 assert sha(expected)==registration['dispatcherSha256']
 bundle=PREPARATION/'job-bundle';bundle.mkdir(mode=0o700,exist_ok=False)
 for file in sorted((HERE/'transport').iterdir()):
  row=source['files']['transport/'+file.name];raw=file.read_bytes()
  assert len(raw)==row['bytes']and sha(raw)==row['sha256']
  with(bundle/file.name).open('xb')as f:os.fchmod(f.fileno(),0o600);f.write(raw)
 with(bundle/'materialize-authorization.json').open('xb')as f:os.fchmod(f.fileno(),0o600);f.write(authority)
 assert sha(LOADER.read_bytes())=='42943d8124fa43c217ffa5b7e85d27684290d3938bb18212e1589253fc6886f8'
 assert sha(CLIENT.read_bytes())=='08954fa485ba3ec179a25bd69524da5353c9deb01f6890bb6230955adf404e6f'
 client=runpy.run_path(str(LOADER))['load_client']()
 argv=['run','--task','T45','--job-id',KEY,'--source-dir',str(bundle),'--script','materialize-batched-source.py','--timeout-seconds','300','--output-dir',str(PREPARATION/'runtime'),'--phase-arg',issued['authoritySha256']]
 tree=ast.parse(CLIENT.read_bytes());main=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='main')
 at=next(i for i,n in enumerate(main.body)if isinstance(n,ast.Assign)and isinstance(n.value,ast.Call)and isinstance(n.value.func,ast.Attribute)and n.value.func.attr=='parse_args')
 scope={'argparse':client['argparse']};exec(compile(ast.Module(body=main.body[:at],type_ignores=[]),'originalclient-parser-only','exec'),scope)
 args=scope['parser'].parse_args(argv)
 files=client['collect_bundle_files']({'grantId':'b16447fbc81f4d64','private':'/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64'},args,bundle,KEY)
 static=json.loads((HERE/'STATIC-INPUTS.json').read_bytes())
 assert set(files)==set(static['bundle'])|{'materialize-authorization.json'}and sha(files['materialize-authorization.json'])==issued['authoritySha256']
 assert all(sha(files[k])==v['sha256']for k,v in static['bundle'].items())
 return client,argv
def run_once(cas_result_file):
 # Invoke only with Main's explicit post-CAS source-materialization instruction.
 client,argv=prepare(cas_result_file)
 output=PREPARATION/'runtime';output.mkdir(mode=0o700,exist_ok=False)
 (output/'SUBMIT-ONCE-INTENT.json').write_text(json.dumps({'requestKey':KEY,'automaticReplay':False},sort_keys=True)+'\n')
 previous=sys.argv
 try:sys.argv=[str(CLIENT),*argv];client['main']()
 finally:sys.argv=previous
