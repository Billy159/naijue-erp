def validate_closed44(core,need):
 x=HISTORY['closed44']
 def fixed(path,pin):
  raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL_CLOSED44_RECEIPT_CHANGED');return core.strict(raw)
 def done(key,terminal,result,leaf):
  job=B/'jobs'/key;t=fixed(job/'r3-outer-terminal.json',terminal['sha256'])
  need(t==terminal['value']and(t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'ACTUAL44_SUCCESSFUL_CLOSURE_PHASE_REQUIRED')
  value=fixed(job/'results'/leaf,result['sha256']);need(value==result['value'],'ACTUAL44_EXACT_PHASE_RESULT_REQUIRED');return value
 service=x['service'];start=done(service['serviceKey'],x['startTerminal'],x['startResult'],'normal-service-result.json')
 need(start['cid']==service['containerId']and start['proofSha256']==service['proofSha256']and start['businessWrites']==0 and start['appStarted']is False and start['describe']['state']=='PROGRAM_DESCRIBED_NO_PG_OR_WRITE'and start['describe']['databaseConnections']==start['describe']['mutations']==0 and set(start['describe']['outputs'])=={'descriptor','liveFacts','payload','process'},'ACTUAL44_SUCCESSFUL_START_NOT_WRITER_SUCCESS_REQUIRED')
 boot=HOST/'state/native-services'/service['serviceKey'];path=HOST/'authority/fresh35-current-production-service-v2-service-44.json';z=path.lstat()
 need(path.resolve()==path and stat.S_ISREG(z.st_mode)and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o444 and z.st_nlink==1,'ACTUAL44_PUBLIC_PROOF_METADATA_REQUIRED')
 p=fixed(path,service['proofSha256']);birth=p['sharedPostgresNamespace']['container'];work=p['sharedPostgresNamespace']['serviceLeaseExpiresAt']
 ack=fixed(boot/'retained-ack.json',x['ackSha256'])
 need(p['requestKey']==service['serviceKey']and p['physical']['postmasterStart']==service['postmasterStart']and birth['id']==service['containerId']and birth['startedAt']==service['containerStartedAt']and ack==dict(requestKey=service['serviceKey'],proofSha256=service['proofSha256'],serviceLeaseExpiresAt=work),'ACTUAL44_HISTORICAL_SERVICE_AND_ACK_REQUIRED')
 # Reuse exact historical leaf hashes; do not rerun describe or native work.
 for kind,ref in start['describe']['outputs'].items():
  raw=core.read(boot/ref['leaf']);need(len(raw)==ref['bytes']and core.sha(raw)==ref['sha256'],'ACTUAL44_GENUINE_STORED_LEAF_REQUIRED')
 writer=B/'jobs'/x['writerKey'];t=fixed(writer/'r3-outer-terminal.json',x['writerTerminal']['sha256'])
 need(t==x['writerTerminal']['value']and(t['jobId'],t['status'],t['exitCode'],t['phaseStarted'])==(x['writerKey'],'FAILED',2,True),'ACTUAL44_WRITER_FAILED_NOT_REPLAYABLE_REQUIRED')
 failure=fixed(writer/'results/final33-writer-incomplete.json',x['writerIncomplete']['sha256']);clean=fixed(writer/'results/final33-writer-child-cleanup.json',x['writerCleanup']['sha256'])
 need(failure==x['writerIncomplete']['value']and failure['safeCode']=='BATCHED24_INSTALLED_CATALOG_REQUIRED'and failure['automaticReplay']is False and clean==x['writerCleanup']['value']and clean['requestKey']==x['writerKey']and clean['childStarted']is False and clean['connectionCleanup']=='NOT_OPENED'and clean['childReaped']is True and clean['descendantsReaped']is True and clean['originalInputMetadataChanges']==0,'ACTUAL44_FAILED_BEFORE_CHILD_AND_CONNECTION_REQUIRED')
 stop=done(x['stopKey'],x['stopTerminal'],x['stopResult'],'normal05-preserve-stop-result.json')
 need(stop['service']==service and stop['pgStopped']is True and stop['businessAdvanced']is False and stop['holdRetained']is True and stop['writerTerminalStatus']=='FAILED'and stop['currentBatchTerminals'][x['writerKey']]==dict(state='FAILED',terminalSha256=x['writerTerminal']['sha256'])and stop['cleanupSha256']==x['guardianSha256'],'ACTUAL44_STOP_WITH_FAILED_WRITER_REQUIRED')
 guardian=fixed(boot/'cleanup.json',x['guardianSha256'])
 need(guardian['requestKey']==service['serviceKey']and guardian['reason']=='EXACT_GUARDIAN_STOP_REQUESTED'and guardian['retained']is True and all(guardian['cleanup'][k]is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent'))and guardian['cleanup']['databasePrivilegesChanged']is False,'ACTUAL44_GUARDIAN_CLEAN_STOP_REQUIRED')
 restored=done(x['restoreKey'],x['restoreTerminal'],x['restoreResult'],'maintenance-auth-result.json');inner=restored['result']
 cleanup=fixed(B/'jobs'/x['restoreKey']/'results/maintenance-auth-cleanup.json',x['restoreCleanupSha256'])
 safe=fixed(HOST/'state/native-services/ordinary44-auth-20261118-01/restored.json',x['safeReceiptSha256'])
 need(restored['cleanup']==cleanup and safe==inner and inner['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inner['naturalExpiryCountedAsRestoration']is False and inner['databaseStillStopped']is True and inner['runtimeAuthChanged']is False and inner['membershipsOrRoleAttributesChanged']is False,'ACTUAL44_ORIGINAL_AUTH_RESTORED_REQUIRED')
 for kind,expected in(('service44',x['stoppedService']),('restoreOwn44',x['ownRestoreContainer'])):
  cid=expected['id'];fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"operation":{{json (index .Config.Labels "t45.operation")}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}}}'
  q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,cid],capture_output=True,timeout=5)
  need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=16384,'ACTUAL44_STOPPED_CONTAINER_STATE_REQUIRED');v=core.strict(q.stdout)
  need(all(v[k]==expected[k]for k in('id','name','image','operation','running','pid'))and v['running']is False and v['pid']==0,'ACTUAL44_FIXED_CARRIER_STOPPED_REQUIRED')
  if kind=='service44':need(cid==service['containerId']and v['startedAt']==service['containerStartedAt'],'ACTUAL44_FIXED_SERVICE_BIRTH_REQUIRED')
  else:need(v['exitCode']==expected['exitCode']==0,'ACTUAL44_RESTORE_EXIT_ZERO_REQUIRED')
