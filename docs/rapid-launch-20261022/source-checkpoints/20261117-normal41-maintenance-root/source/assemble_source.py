"""Source-only successor from reviewed40; never invokes consumers or finite APIs."""
from pathlib import Path
import ast,hashlib,json,re,runpy
HERE=Path(__file__).resolve().parent;OLD=HERE.with_name('20261117-r3-ordinary40-root-source-01');ROOT=HERE.parents[2]
V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
CONSUMER=V/'NORMAL41-THREE-ROUTINE-MAINTENANCE-SOURCE-01'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def checked(p,pin):
 raw=p.read_bytes();assert sha(raw)==pin,p;return raw
def put(name,value):
 raw=value if isinstance(value,bytes)else value.encode()if isinstance(value,str)else(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode();(HERE/name).write_bytes(raw)
def assignment(s,name,value):
 t=ast.parse(s);n=next(n for n in t.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id==name for x in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def main():
 oldsource=json.loads((HERE/'PREDECESSOR-SOURCE-PINS.json').read_bytes())
 for name,row in oldsource['files'].items():assert len(checked(OLD/name,row['sha256']))==row['bytes']
 interface=json.loads(checked(CONSUMER/'INTERFACE.UNISSUED.json','7a362dbefcfc363d9dcdc7e4e379179b1119fd49c668ec958bff0b38a9a99454'))
 checked(CONSUMER/'SOURCE-PINS.json','44e1b0d0a2089adf825c1352ab68c6d681b4bc12df1592600d87eebc9e095199');checked(CONSUMER/'PHASES41.UNISSUED.json','e0c5749cb235681cc176b669166f4421d5d62cec30cfa44500d5ee4ea31b9763')
 h=json.loads((OLD/'HISTORY-INPUTS.json').read_bytes());order=['apply','start','upgrade','stop','restore'];assert interface['phaseOrder']==order
 fields={'jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField'};rules={p:{k:interface['jobs'][p][k]for k in fields}for p in order};jobs={p:rules[p]['jobId']for p in order}
 for phase,rule in rules.items():
  for leaf,pin in rule['bundlePins'].items():checked(Path(interface['jobs'][phase]['sourceDirectory'])/leaf,pin)
 actual=checked(ROOT/'outputs/主控/20261117-r3-normal40-registration-window-01/admin_exec.ISSUED.py','0864546416726e3290f571f86344bf0f7288c54e80e3fce86fd2426d7f38edff');put('ACTUAL115-DISPATCHER.py',actual)
 cas_path=V/'NORMAL40-ROOT-EXECUTION-PREPARATION-01/cas/ACTUAL-CAS-RESULT.json';cas=json.loads(checked(cas_path,'6bc2fe7c6364bc166a5fb215c220a6e79c72eeceb7a963106bd68d65e19cd935'))
 start_path=V/'NORMAL40-MAINTENANCE-EXECUTION-PREPARATION-02/runtime/start/ACTUAL-START40-TERMINAL-RESULT.json';start=json.loads(checked(start_path,'029ac2c84001d4ea28275e4c4c85d25415864f19330ec81447e71b4735606d84'))
 restore_path=V/'NORMAL40-MAINTENANCE-EXECUTION-PREPARATION-02/runtime/restore/ACTUAL-RESTORE40-TERMINAL-RESULT.json';restore=json.loads(checked(restore_path,'18da0908ca69461ce8a008339948c28b41cacddf0f3e706b8c6c7becee94401f'))
 assert(start['terminal']['status'],start['terminal']['exitCode'],start['incomplete']['cid'],start['incomplete']['createAttempted'])==('FAILED',2,None,False)
 assert(restore['terminal']['status'],restore['terminal']['exitCode'])==('COMPLETED',0)and restore['result']['result']['naturalExpiryCountedAsRestoration']is False
 closed=dict(startKey=start['requestKey'],restoreKey=restore['requestKey'],startPins=start['rootPins'],restorePins=restore['rootPins'],safeReceiptSha256=restore['privateRestorationReceiptSha256'],restoreContainer=restore['cleanup']['cid'],custodyMetadata6=restore['privateRestorationReceiptPresent']and restore['privateRestorationReceiptMatched']and restore['privateRestorationReceiptSha256'],actualFullStat9=None,service=None,epoch=None)
 helper=(CONSUMER/'prior_closed40.py').read_text();metadata=ast.literal_eval(next(n.value for n in ast.parse(helper).body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='CUSTODY40_METADATA'for x in n.targets)))
 closed['custodyMetadata6']={str(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01')/leaf):{k:r[k]for k in('device','inode','uid','gid','mode','bytes')}for leaf,r in metadata.items()}
 h.update(state='ACTUAL115_AND_CLOSED_FAILED40_WITH_FROZEN41_CONSUMER',actualRootPins={**h['actualRootPins'],'dispatcher':cas['dispatcherSha256'],'normal40Module':cas['moduleSha256'],'normal40Policy':cas['policySha256']},jobs=jobs,policyName=interface['rootPolicyLeaf'],policyFormat=interface['rootPolicyFormat'],consumerDirectory=str(CONSUMER),consumerSourcePinsSha256='44e1b0d0a2089adf825c1352ab68c6d681b4bc12df1592600d87eebc9e095199',consumerInterfaceSha256='7a362dbefcfc363d9dcdc7e4e379179b1119fd49c668ec958bff0b38a9a99454',consumerFrozenInterfaceSha256='7a362dbefcfc363d9dcdc7e4e379179b1119fd49c668ec958bff0b38a9a99454',consumerRulesSha256='e0c5749cb235681cc176b669166f4421d5d62cec30cfa44500d5ee4ea31b9763',phaseDirectories={p:interface['jobs'][p]['sourceDirectory']for p in order},expectedRules=rules,oldKeys=115,newKeys=5,candidateKeys=120,closedFailed40=closed)
 h['actualInputs'] += [{'path':str(p),'sha256':pin}for p,pin in [(cas_path,'6bc2fe7c6364bc166a5fb215c220a6e79c72eeceb7a963106bd68d65e19cd935'),(start_path,'029ac2c84001d4ea28275e4c4c85d25415864f19330ec81447e71b4735606d84'),(restore_path,'18da0908ca69461ce8a008339948c28b41cacddf0f3e706b8c6c7becee94401f')]]
 put('HISTORY-INPUTS.json',h)
 w=json.loads((OLD/'FIVE-PHASES.UNISSUED.json').read_bytes());w.update(h);w.update(consumerSourceDirectory=str(CONSUMER),consumerReviewSha256='b441bbea7dbd71a32ebadbeeadde98424b44a56a9184204f6f2d7836ba4f2370');put('FIVE-PHASES.UNISSUED.json',w)
 # Keep successful39 as the genuine last service; failed40 has no C or epoch.
 module=(OLD/'r3_normal40_continuation.py').read_text()
 module=assignment(module,'HISTORY',h);module=assignment(module,'EXPECTED_RULES',rules)
 for a,b in [('direct40-batched-real.json','direct41-batched-real.json'),('T45_R3_NORMAL40_BATCHED_REAL_V1','T45_R3_NORMAL41_BATCHED_REAL_V1'),('Normal40Continuation','Normal41Continuation'),('R3_CONTINUITY_NORMAL40_','R3_CONTINUITY_NORMAL41_'),('v2-service-40.json','v2-service-41.json')]:module=module.replace(a,b)
 guard='''def validate_closed40(core,need):
 f=HISTORY['closedFailed40']
 def fixed(path,pin):
  raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL_CLOSED40_RECEIPT_CHANGED');return core.strict(raw)
 start=B/'jobs'/f['startKey'];restore=B/'jobs'/f['restoreKey']
 terminal=fixed(start/'r3-outer-terminal.json',f['startPins']['terminal'])
 failure=fixed(start/'results/normal-service-incomplete.json',f['startPins']['incomplete'])
 fixed(start/'results/normal-service-result.json',f['startPins']['result'])
 need((terminal['status'],terminal['exitCode'])==('FAILED',2)and failure['format']=='T45_R3_PRECONTAINER_FAILURE_V1'and failure['cid']is None and failure['createAttempted']is False and failure['confirmed']is True,'ACTUAL_FAILED40_NO_C_REQUIRED')
 terminal=fixed(restore/'r3-outer-terminal.json',f['restorePins']['terminal'])
 result=fixed(restore/'results/maintenance-auth-result.json',f['restorePins']['result'])
 cleanup=fixed(restore/'results/maintenance-auth-cleanup.json',f['restorePins']['cleanup'])
 inside=result['result'];need(fixed(HOST/'state/native-services/ordinary40-auth-20261117-01/restored.json',f['safeReceiptSha256'])==inside,'ACTUAL40_SAFE_RESTORATION_RECEIPT_REQUIRED');need((terminal['status'],terminal['exitCode'])==('COMPLETED',0)and result['cleanup']==cleanup and inside['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inside['naturalExpiryCountedAsRestoration']is False and inside['databaseStillStopped']is True,'ACTUAL_RESTORED40_REQUIRED')
 for name,expected in f['custodyMetadata6'].items():
  s=Path(name).lstat();need(Path(name).resolve()==Path(name)and stat.S_ISREG(s.st_mode)and s.st_nlink==1 and dict(device=s.st_dev,inode=s.st_ino,uid=s.st_uid,gid=s.st_gid,mode=stat.S_IMODE(s.st_mode),bytes=s.st_size)==expected,'ACTUAL40_SNAPSHOT_METADATA_CHANGED')
 # Full stat9 is collected only at future fresh and bound by CAS; not invented here.

'''
 module=module.replace('class Normal41Continuation:',guard+'class Normal41Continuation:',1).replace("def original_basis(self):return validate_history(self.core,self.need,HISTORY['custodyStat9'])","def original_basis(self):\n  validate_history(self.core,self.need,HISTORY['custodyStat9']);validate_closed40(self.core,self.need)")
 put('r3_normal41_continuation.py',module)
 patch=(OLD/'patch_dispatcher.py').read_text().replace('7cab381f7cd7aa402a0087a14ecb2571460dd11274b00cee0dbd62938fb8b814',cas['dispatcherSha256']).replace('len(keys)==110','len(keys)==115').replace('NORMAL40','NORMAL41').replace('normal40','normal41').replace('Normal40Continuation','Normal41Continuation').replace('actual110','actual115')
 put('patch_dispatcher.py',patch);render=runpy.run_path(str(HERE/'patch_dispatcher.py'))['render'];put('admin_exec.NORMAL41-UNREGISTERED.py',render(actual,sha(module.encode()),jobs))
 # Change only successor assignments and labels; all old PRESERVE rows remain.
 text=(OLD/'register_cas.py').read_text();text=assignment(text,'JOBS',jobs);text=assignment(text,'EXPECTED_RULES',rules);text=assignment(text,'OLD',cas['dispatcherSha256'])
 for a,b in [('normal40-registration','normal41-registration'),('r3_normal40_continuation.py','r3_normal41_continuation.py'),('direct40-batched-real.json','direct41-batched-real.json'),('.normal40-dispatcher.pending','.normal41-dispatcher.pending'),('Normal40Continuation','Normal41Continuation'),('NORMAL40','NORMAL41'),('old110AndThreeGuardsPreserved','old115AndThreeGuardsPreserved')]:text=text.replace(a,b)
 # PRESERVE admin uses OLD; add the actually registered40 module/policy and receipts.
 preserved={"str(P/'r3_normal40_continuation.py')":cas['moduleSha256'],"str(H/'direct40-batched-real.json')":cas['policySha256']}
 for key,pins,leaves in [(closed['startKey'],closed['startPins'],{'terminal':'r3-outer-terminal.json','result':'results/normal-service-result.json','incomplete':'results/normal-service-incomplete.json'}),(closed['restoreKey'],closed['restorePins'],{'terminal':'r3-outer-terminal.json','result':'results/maintenance-auth-result.json','cleanup':'results/maintenance-auth-cleanup.json'})]:
  for k,leaf in leaves.items():preserved["str(B/'jobs/"+key+'/'+leaf+"')"]=pins[k]
 inject='PRESERVE.update({'+','.join(k+':'+repr(v)for k,v in preserved.items())+'})\nCUSTODY.extend(Path(path)for path in '+repr(list(closed['custodyMetadata6']))+')\n'
 text=text.replace('sha=lambda raw:',inject+'sha=lambda raw:',1);put('register_cas.py',text)
 for name in ['issue_registration.py','issue_phase.py','read_registration_basis.py','prepare_channel.py']:
  text=(OLD/name).read_text()
  for a,b in [('PHASES40.UNISSUED.json','PHASES41.UNISSUED.json'),('ordinary40 exact five-step','ordinary41 exact five-step'),('service40 after actual closed39','service41 after actual failed40 and restored40'),('main40_','main41_'),('r3_normal40_continuation','r3_normal41_continuation'),('NORMAL40','NORMAL41'),('normal40','normal41'),('direct40-batched-real.json','direct41-batched-real.json'),('ordinary40-auth-capture-20261117-01','ordinary41-auth-capture-20261117-01'),('old110AndThreeGuardsPreserved','old115AndThreeGuardsPreserved')]:text=text.replace(a,b)
  if name=='issue_registration.py':
   text=text.replace("==w['custodyStat9']","=={**w['custodyStat9'],**{path:basis['oldIdentities'][path]for path in w['closedFailed40']['custodyMetadata6']}}")
   text=text.replace("assert basis['oldIdentities']['executionLock']==list(cas['LOCK_ID'])","assert basis['oldIdentities']['executionLock']==list(cas['LOCK_ID'])\n for path,expected in w['closedFailed40']['custodyMetadata6'].items():\n  ident=basis['oldIdentities'][path];assert len(ident)==9 and ident[5]==1 and dict(device=ident[0],inode=ident[1],uid=ident[2],gid=ident[3],mode=ident[4],bytes=ident[6])==expected")
  if name=='read_registration_basis.py':text=text.replace("module.require_current_stopped(a['need'])","module.validate_closed40(core,a['need']);module.require_current_stopped(a['need'])")
  if name=='read_registration_basis.py':text=text.replace("actual39StoppedAndOriginalAuthRestored=True,","actual39StoppedAndOriginalAuthRestored=True,actualFailed40ClosedAndOriginalAuthRestored=True,")
  if name=='issue_registration.py':text=text.replace("assert basis['PGConnections']","assert basis['actualFailed40ClosedAndOriginalAuthRestored']is True\n assert basis['PGConnections']")
  put(name,text)
 print(json.dumps({'state':h['state'],'oldKeys':115,'newKeys':5,'consumer':h['consumerSourcePinsSha256'],'futureC':None,'futureStat9For40':None}))
if __name__=='__main__':main()
