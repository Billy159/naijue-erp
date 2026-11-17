def validate_closed43(core,need):
 x=HISTORY['closed43']
 def fixed(path,pin):
  raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL_CLOSED43_RECEIPT_CHANGED');return core.strict(raw)
 start=B/'jobs'/x['startKey'];boot=HOST/'state/native-services'/x['startKey']
 t=fixed(start/'r3-outer-terminal.json',x['startPins']['terminal'])
 r=fixed(start/'results/normal-service-result.json',x['startPins']['result'])
 f=fixed(start/'results/normal-service-incomplete.json',x['startPins']['incomplete'])
 c=fixed(boot/'failed-start-cleanup.json',x['startPins']['cleanup'])
 process=fixed(start/'results/genuine-describe-process.json',x['describeProcessSha256'])
 need(t==x['terminal']and(t['jobId'],t['status'],t['exitCode'],t['phaseStarted'])==(x['startKey'],'FAILED',2,True)and r==x['result']and f==x['incomplete']and c==x['cleanup']and process==x['describeProcess'],'ACTUAL43_FAILED_START_RECEIPTS_REQUIRED')
 need(f['requestKey']==c['requestKey']==x['startKey']and f['confirmed']is True and f['originalKeyOnly']is True and f['automaticRetry']is False and f['createAttempted']is True and f['successfulResultHandoff']is False and f['runtimeMaterialPreserved']is True and f['containerStopped']is True and f['pid']==0,'ACTUAL43_TYPED_FAILED_HANDOFF_REQUIRED')
 need(c['status']=='NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED'and c['originalPGDATAAndCleanStateVerified']is True and c['runtimeMaterialPreserved']is True and c['dataDirectoryIdentity']==dict(device=66304,inode=13502421,uid=61035,gid=61035,mode=0o700)and f['cleanStop']==dict(c,cleanupLeaf='failed-start-cleanup.json',cleanupSha256=x['startPins']['cleanup']),'ACTUAL43_FAILED_START_CLEAN_DATA_REQUIRED')
 need(process['exitCode']==2 and process['reason']is None and all(process[k]is True for k in('childReaped','descendantsReaped','ownedProcessGroupReaped')),'ACTUAL43_DESCRIBE_CHILD_SETTLED_REQUIRED')
 proof=HOST/'authority/fresh35-current-production-service-v2-service-43.json';z=proof.lstat()
 need(proof.resolve()==proof and stat.S_ISREG(z.st_mode)and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o444 and z.st_nlink==1,'ACTUAL43_PUBLIC_PROOF_METADATA_REQUIRED')
 p=fixed(proof,x['proofSha256']);shared=p['sharedPostgresNamespace'];birth=shared['container']
 ack=fixed(boot/'retained-ack.json',x['ackSha256']);outer=core.strict(core.read(boot/'service-start-authorization.json'))['serviceLeaseExpiresAt']
 need(p['requestKey']==shared['creationOperationId']==x['startKey']and birth['id']==f['cid']and f['currentProofSha256']==x['proofSha256']and ack==dict(requestKey=x['startKey'],proofSha256=x['proofSha256'],serviceLeaseExpiresAt=shared['serviceLeaseExpiresAt'])and outer-shared['serviceLeaseExpiresAt']==35000 and f['retainedAckValidated']is True and f['retainedAckSha256']==x['ackSha256'],'ACTUAL43_PUBLISHED_HISTORICAL_C_ACK_REQUIRED')
 def completed(key,terminal,result_rows):
  job=B/'jobs'/key;t=fixed(job/'r3-outer-terminal.json',terminal['sha256'])
  need(t==terminal['value']and(t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'ACTUAL43_ROLE_PHASE_COMPLETED_REQUIRED')
  rows={leaf:fixed(job/'results'/leaf,row['rootSha256'])for leaf,row in result_rows.items()}
  need(all(rows[leaf]==row['value']for leaf,row in result_rows.items())and rows['maintenance-auth-result.json']['cleanup']==rows['maintenance-auth-cleanup.json'],'ACTUAL43_ROLE_RESULT_CLEANUP_REQUIRED')
  return rows['maintenance-auth-result.json']
 completed(x['applyKey'],x['applyTerminal'],x['applyResults'])
 restored=completed(x['restoreKey'],x['restoreTerminal'],x['restoreResults']);inner=restored['result']
 safe=fixed(HOST/'state/native-services/ordinary43-auth-20261118-01/restored.json',x['safeReceiptSha256'])
 need(safe==inner and inner['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inner['naturalExpiryCountedAsRestoration']is False and inner['databaseStillStopped']is True and inner['runtimeAuthChanged']is False and inner['membershipsOrRoleAttributesChanged']is False,'ACTUAL43_ORIGINAL_AUTH_RESTORED_REQUIRED')
 for kind,cid in(('service43',f['cid']),('restoreOwn43',x['ownRestoreContainer']['id'])):
  fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"operation":{{json (index .Config.Labels "t45.operation")}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}}}'
  q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,cid],capture_output=True,timeout=5)
  need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=16384,'ACTUAL43_STOPPED_CONTAINER_STATE_REQUIRED');v=core.strict(q.stdout)
  need(v['id']==cid and v['running']is False and v['pid']==0,'ACTUAL43_CONTAINER_STILL_STOPPED_REQUIRED')
  if kind=='service43':need(v['name']=='/'+birth['name']and v['image']==birth['imageId']and v['operation']==x['startKey']and v['startedAt']==birth['startedAt'],'ACTUAL43_FIXED_SERVICE_BIRTH_REQUIRED')
  else:
   expected=x['ownRestoreContainer'];need(all(v[k]==expected[k]for k in('id','name','image','operation','running','pid','exitCode'))and v['exitCode']==0,'ACTUAL43_FIXED_RESTORE_CONTAINER_REQUIRED')
 # Failed43 is historical only. Its writer was never submitted; never replay it.
 for worker,control in((B,C),(B.with_name('grant-5cc58239751e4e2a'),C.with_name('grant-5cc58239751e4e2a'))):
  key=x['writerKey'];need(not any(os.path.lexists(path)for path in(worker/'jobs'/key,control/'jobs'/key,control/'requests'/(key+'.json'),control/'requests'/(key+'.tmp'),control/'results'/(key+'.json'))),'ACTUAL43_WRITER_MUST_REMAIN_UNSUBMITTED')
