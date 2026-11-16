from pathlib import Path
import ast,hashlib,json,runpy,tarfile,io
D=Path(__file__).resolve().parent;R=D.parent
BASE=R/'INPUT-RECEPTION-01/ssh-control-final33.py';NEW=D/'ssh-control-recovery-input.py';sha=lambda b:hashlib.sha256(b).hexdigest()
old=ast.parse(BASE.read_bytes());new=ast.parse(NEW.read_bytes())
def functions(t):return {n.name:n for n in t.body if isinstance(n,ast.FunctionDef)}
def remote(t):return ast.literal_eval(next(n.value for n in t.body if isinstance(n,ast.Assign) and any(isinstance(a,ast.Name) and a.id=='ARTIFACT_REMOTE' for a in n.targets)))
def compare(base,new):
 before,after=functions(base),functions(new)
 for name,node in before.items():
  if name=='private_standard_data_authority':
   candidate=ast.FunctionDef(**{**after[name].__dict__,'body':after[name].body[1:]});assert ast.dump(node)==ast.dump(candidate),name
  else:assert ast.dump(node)==ast.dump(after[name]),name
 return len(before)
for p in D.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
counts={'localOriginalMethodsUnchanged':compare(old,new),'remoteOriginalMethodsUnchanged':compare(ast.parse(remote(old)),ast.parse(remote(new)))}
for name in ('recovery_private_scope','recovery_private_authority'):
 assert ast.dump(functions(new)[name])==ast.dump(functions(ast.parse(remote(new)))[name])==ast.dump(functions(ast.parse((D/'recovery_scope.py').read_bytes()))[name])
profile=json.loads((D/'PROFILE.UNISSUED.json').read_bytes());input_file=Path(profile['localArchive']);raw=input_file.read_bytes();loader=runpy.run_path(str(D/'recovery_input_artifact.py'));bodies=loader['unpack'](raw)
assert set(bodies)==set(profile['members'])
for name,body in bodies.items():assert sha(body)==profile['members'][name]['sha256'] and len(body)==profile['members'][name]['bytes']
# Reference is deliberately not signed. This must fail before probing any server path.
ref={'artifactKey':profile['fixedScope']['artifactKey'],'archiveSha256':profile['archiveSha256'],'archiveBytes':profile['archiveBytes'],'readySha256':None,'authoritySha256':None}
try:loader['members'](ref)
except ValueError as e:assert str(e)=='RECOVERY_EXACT_SIGNED_PRIVATE_REFERENCE_REQUIRED'
else:raise AssertionError('UNISSUED_INPUT_WAS_ACCEPTED')
# Receiver's READY producer is read verbatim: stable exact field contract, no fixture READY.
rfunctions=functions(ast.parse(remote(new)));upload=rfunctions['upload'];ready_assign=next(n for n in upload.body if isinstance(n,ast.Assign) and any(isinstance(a,ast.Name) and a.id=='r' for a in n.targets))
assert set(ast.literal_eval(k) for k in ready_assign.value.keys)=={'status','artifactKey','archiveSha256','archiveBytes','authoritySha256','fileIdentity'}
assert "r['manifestSha256']=a['manifestSha256']" in remote(new) and "['fragmentIndex','fragmentOffset']" in remote(new)
# Metadata producer remains the original 5-field inode/size/timestamps vector.
identity=functions(ast.parse(remote(new)))['identity'];assert ast.dump(identity)==ast.dump(functions(ast.parse(remote(old)))['identity'])
out={'state':'LOCAL_FIXED_PRIVATE_ARTIFACT_SOURCE_PAIRING_ONLY','checks':counts,'clientAndRemoteSameNewScope':True,'realLocalTarThreeMembersMatched':True,'unissuedReadyAndAuthorityRejectedBeforeFilesystem':True,'actualReceiverReadyProducerContractMatched':True,'privateDataBodiesCopiedToOutputs':False,'dataBodiesPrinted':False,'serverReady':None,'authorityIssued':False,'stateOrNetworkOrUploadOrServerCalls':0,'PGConnections':0,'clockOrIssuerCalled':False}
(D/'LOCAL-CHECKS.json').write_text(json.dumps(out,sort_keys=True,indent=2)+'\n');print(json.dumps(out))
