from pathlib import Path
import ast,hashlib,json,runpy
D=Path(__file__).resolve().parent;OLD=D.with_name('20261117-r3-ordinary41-root-source-01')
sha=lambda b:hashlib.sha256(b).hexdigest()
def assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def main():
 h=json.loads((D/'HISTORY-INPUTS.json').read_bytes());s=(OLD/'r3_normal41_continuation.py').read_text();s=assignment(s,'HISTORY',h);s=assignment(s,'EXPECTED_RULES',h['expectedRules'])
 for a,b in [('Normal41Continuation','Normal42Continuation'),('R3_CONTINUITY_NORMAL41_','R3_CONTINUITY_NORMAL42_'),('v2-service-41.json','v2-service-42.json'),('direct41-batched-real.json','direct42-batched-real.json'),('T45_R3_NORMAL41_BATCHED_REAL_V1','T45_R3_NORMAL42_BATCHED_REAL_V1')]:s=s.replace(a,b)
 guard='''def validate_latest41(core,need):
 x=HISTORY['rollback02'];job=B/'jobs'/x['key']
 def fixed(path,pin):
  raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL_ROLLBACK02_CHANGED');return core.strict(raw)
 v=HISTORY['priorService'];pins=HISTORY['predecessor']['bindings'];old=B/'jobs'/v['serviceKey']
 t=fixed(old/'r3-outer-terminal.json',pins['previousTerminalSha256']);need((t['jobId'],t['status'],t['exitCode'])==(v['serviceKey'],'COMPLETED',0),'ACTUAL41_SUCCESSFUL_START_REQUIRED')
 start=fixed(old/'results/normal-service-result.json',pins['previousResultSha256'])
 proof=HOST/'authority/fresh35-current-production-service-v2-service-41.json';z=proof.lstat()
 need(proof.resolve()==proof and stat.S_ISREG(z.st_mode)and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o444 and z.st_nlink==1,'ACTUAL41_PUBLIC_PROOF_METADATA_REQUIRED')
 p=fixed(proof,pins['previousCurrentProofSha256']);boot=HOST/'state/native-services'/v['serviceKey']
 ack=fixed(boot/'retained-ack.json',pins['previousRetainedAckSha256']);outer=core.strict(core.read(boot/'service-start-authorization.json'))['serviceLeaseExpiresAt'];work=p['sharedPostgresNamespace']['serviceLeaseExpiresAt']
 need(p['requestKey']==v['serviceKey']and p['physical']['postmasterStart']==v['postmasterStart']and start['cid']==v['containerId']and start['proofSha256']==v['proofSha256']and ack==dict(requestKey=v['serviceKey'],proofSha256=v['proofSha256'],serviceLeaseExpiresAt=work)and start['serviceLeaseExpiresAt']==work and outer-work==35000,'ACTUAL41_WORK_OUTER_AND_ACK_REQUIRED')
 clean=fixed(boot/'cleanup.json',pins['previousCleanupSha256'])
 need(clean['requestKey']==v['serviceKey']and clean['reason']=='NORMAL_FINITE_SERVICE_OR_CAPACITY_EXPIRED'and clean['retained']is True and all(clean['cleanup'][k]is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),'REAL41_GUARDIAN_CLOSURE_REQUIRED')
 t=fixed(job/'r3-outer-terminal.json',x['terminalSha256'])
 r=fixed(job/'results/maintenance-auth-result.json',x['rootResultSha256'])
 c=fixed(job/'results/maintenance-auth-cleanup.json',x['cleanupSha256'])
 need((t['jobId'],t['status'],t['exitCode'])==(x['key'],'COMPLETED',0)and r==x['value']and r['cleanup']==c,'REAL_ROLLBACK02_SUCCESS_REQUIRED')
 inside=r['result'];need(inside['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inside['naturalExpiryCountedAsRestoration']is False,'ORIGINAL_AUTH_RESTORED_NOT_NATURAL_EXPIRY_REQUIRED')
 fixed(HOST/'state/native-services/ordinary41-auth-20261117-01/original-auth-rollback-restored.json',x['safeRestorationReceiptSha256'])
 need(all(c[k]is True for k in('confirmed','ownContainerStopped','ownedPidAbsent','sourceDataPreserved')),'ROLLBACK_OWN_CONTAINER_CLOSED_REQUIRED')
 q=subprocess.run(['/usr/bin/docker','inspect','--format','{{json .State}}',c['cid']],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=16384,'ROLLBACK_OWN_CONTAINER_STATE_REQUIRED')
 state=core.strict(q.stdout);need(state['Running']is False and state['Pid']==0 and state['ExitCode']==0,'ROLLBACK_CONTAINER_STILL_STOPPED_REQUIRED')
'''
 s=s.replace('class Normal42Continuation:',guard+'\nclass Normal42Continuation:',1)
 s=s.replace("def original_basis(self):\n  validate_history(self.core,self.need,HISTORY['custodyStat9']);validate_closed40(self.core,self.need)","def original_basis(self):\n  validate_history(self.core,self.need,HISTORY['custodyStat9']);validate_latest41(self.core,self.need)")
 # Distinct tags prevent these maintenance phases from entering legacy finish.
 t=ast.parse(s);cls=next(n for n in t.body if isinstance(n,ast.ClassDef)and n.name=='Normal42Continuation');admit=next(n for n in cls.body if isinstance(n,ast.FunctionDef)and n.name=='admit');text=ast.get_source_segment(s,admit);assert text.rstrip().endswith("return 'normal40-'+phase");s=s.replace(text,text.rstrip()[:-len("return 'normal40-'+phase")]+"return 'normal42-'+phase",1)
 s=s.replace("if phase in {'normal40-'+name for name in JOBS}:return None", "if phase in {'normal42-'+name for name in JOBS}:return None")
 compile(s,'normal42_admission','exec');(D/'r3_normal42_continuation.py').write_text(s)
 jobs={p:h['jobs'][p]for p in ['apply','start','upgrade','stop','restore']};render=runpy.run_path(str(D/'patch_dispatcher.py'))['render'];raw=render((D/'ACTUAL122-DISPATCHER.py').read_bytes(),sha(s.encode()),jobs);(D/'admin_exec.NORMAL42-UNREGISTERED.py').write_bytes(raw)
 print('Rendered five-phase42 source with dedicated finish; no runtime calls.')
if __name__=='__main__':main()
