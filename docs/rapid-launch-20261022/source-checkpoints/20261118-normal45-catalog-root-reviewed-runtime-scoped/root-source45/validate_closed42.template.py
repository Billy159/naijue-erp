def validate_closed42(core,need):
 x=HISTORY['closed42']
 def fixed(path,pin):
  raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL_CLOSED42_RECEIPT_CHANGED');return core.strict(raw)
 def done(phase,leaf):
  r=x[phase];job=B/'jobs'/r['key'];t=fixed(job/'r3-outer-terminal.json',r['terminalSha256'])
  need((t['jobId'],t['status'],t['exitCode'])==(r['key'],'COMPLETED',0),'ACTUAL_CLOSED42_SUCCESS_REQUIRED')
  result=fixed(job/'results'/leaf,r['rootResultSha256']);need(result==r['value'],'ACTUAL_CLOSED42_RESULT_REQUIRED');return result
 service=HISTORY['priorService'];proof=HOST/'authority/fresh35-current-production-service-v2-service-42.json';z=proof.lstat()
 need(proof.resolve()==proof and stat.S_ISREG(z.st_mode)and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o444 and z.st_nlink==1,'ACTUAL42_PUBLIC_PROOF_REQUIRED')
 p=fixed(proof,service['proofSha256']);work=p['sharedPostgresNamespace']['serviceLeaseExpiresAt'];boot=HOST/'state/native-services'/service['serviceKey']
 ack=core.strict(core.read(boot/'retained-ack.json'));outer=core.strict(core.read(boot/'service-start-authorization.json'))['serviceLeaseExpiresAt']
 need(ack==dict(requestKey=service['serviceKey'],proofSha256=service['proofSha256'],serviceLeaseExpiresAt=work)and outer-work==35000 and p['requestKey']==service['serviceKey']and p['physical']['postmasterStart']==service['postmasterStart'],'ACTUAL42_RETAINED_ACK_AND_WORK_OUTER_REQUIRED')
 u=done('upgrade','batched161-command-update-result.json')
 need(u['businessImported']is False and u['commitOutcomeUnknown']is False and u['connectionCleanup']=='CLOSED'and all(u[k]is True for k in('commitAcknowledged','postCommitReadback','roleRestoreAcknowledged','innerAuthorityRemoved','childReaped','descendantsReaped'))and u['batchedCatalog']==HISTORY['installedAfter42Catalog']and u['sqlSha256']=='daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184','ACTUAL42_COMMITTED_AFTER_ADA_REQUIRED')
 capture=HOST/'state'/HOST.name/u['captureDirectoryLeaf']
 c=fixed(capture/'completion.json',u['completionSha256']);need(c['requestKey']==u['requestKey']and c['service']==u['service']and c['programSha256']==u['programSha256']and c['batchedCatalog']==u['batchedCatalog']and c['commitAcknowledged']is True and c['postCommitReadback']is True,'ACTUAL42_COMPLETION_REQUIRED')
 commit=core.strict(core.read(capture/'commit.json'));need(commit==dict(requestKey=u['requestKey'],programSha256=u['programSha256'],commitAcknowledged=True),'ACTUAL42_COMMIT_ACK_REQUIRED')
 stop=done('stop','normal05-preserve-stop-result.json');service=u['service']
 need(stop['service']==service and stop['pgStopped']is True,'ACTUAL42_STOP_REQUIRED')
 clean=fixed(HOST/'state/native-services'/service['serviceKey']/'cleanup.json',x['stop']['cleanupSha256'])
 need(clean['requestKey']==service['serviceKey']and clean['reason']=='EXACT_GUARDIAN_STOP_REQUESTED'and all(clean['cleanup'][k]is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),'ACTUAL42_GUARDIAN_STOP_REQUIRED')
 restored=done('restore','maintenance-auth-result.json');inner=restored['result']
 fixed(B/'jobs'/x['restore']['key']/'results/maintenance-auth-cleanup.json',x['restore']['cleanupSha256'])
 safe=fixed(HOST/'state/native-services/ordinary42-auth-20261117-01/restored.json',x['restore']['safeReceiptSha256'])
 need(safe==inner and inner['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inner['naturalExpiryCountedAsRestoration']is False and inner['databaseStillStopped']is True and inner['runtimeAuthChanged']is False and inner['membershipsOrRoleAttributesChanged']is False,'ACTUAL42_ORIGINAL_AUTH_RESTORED_REQUIRED')
 for kind,cid,exit_code in(('service42',service['containerId'],143),('restoreOwn42',x['restore']['ownContainer']['id'],0)):
  expected=x['exactClosedContainers'][kind];state=expected['state']
  need(expected['id']==cid and state['Running']is False and state['Pid']==0 and state['ExitCode']==exit_code and state['OOMKilled']is False and state['Error']==''and state['Status']=='exited','ACTUAL42_CAPTURED_LIFECYCLE_REQUIRED')
  if kind=='service42':need(expected['operation']==service['serviceKey']and state['StartedAt']==service['containerStartedAt'],'ACTUAL42_CAPTURED_SERVICE_BIRTH_REQUIRED')
  else:need(expected['operation']==x['restore']['key'],'ACTUAL42_CAPTURED_RESTORE_ID_REQUIRED')
  fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"operation":{{json (index .Config.Labels "t45.operation")}},"state":{"Running":{{json .State.Running}},"Pid":{{json .State.Pid}},"ExitCode":{{json .State.ExitCode}},"OOMKilled":{{json .State.OOMKilled}},"Error":{{json .State.Error}},"StartedAt":{{json .State.StartedAt}},"FinishedAt":{{json .State.FinishedAt}},"Status":{{json .State.Status}}}}'
  q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,cid],capture_output=True,timeout=5)
  need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=16384,'ACTUAL42_STOPPED_CONTAINER_STATE_REQUIRED')
  need(core.strict(q.stdout)==expected,'ACTUAL42_EXACT_CLOSED_LIFECYCLE_REQUIRED')
