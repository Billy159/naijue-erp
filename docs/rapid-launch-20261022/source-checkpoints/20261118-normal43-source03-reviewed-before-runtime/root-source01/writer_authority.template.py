def retained_prepare05(w, evidence):
    old=w['prepare05']
    assert evidence['requestKey']==old['key']
    assert evidence['state']=='ACTUAL_PREPARE05_COMPLETED_NATIVE_BINDING_MATCHED_CLEANED_WRITER_NOT_SUBMITTED'
    t=evidence['terminal']
    assert(t['jobId'],t['status'],t['exitCode'],t['phaseStarted'])==(old['key'],'COMPLETED',0,True)
    assert evidence['rootPins']==dict(terminal=old['terminalSha256'],result=old['rootResultSha256'])
    assert evidence['nativeConnectionCleanup']=='CLOSED' and all(evidence['processCleanup'][k]is True for k in('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty'))
    assert evidence['preparedBinding']==old['preparedBinding']and evidence['executionBinding']==old['executionBinding']
    return old['preparedBinding'],old['executionBinding']

def retained_execution_binding(w, binding, service):
    original=w['prepare05']['preparedBinding'];old_execution=w['prepare05']['executionBinding']
    assert type(binding)is dict and set(binding)==set(original)|{'preparedBindingSha256'}
    changed={'currentServiceSha256','postmasterStart','batchedSourceSetSha256','batchedCatalogSpecSha256','batchedModelSha256'}
    assert all(binding[k]==v for k,v in original.items()if k not in changed)
    assert binding['preparedBindingSha256']==old_execution['preparedBindingSha256']
    assert binding['currentServiceSha256']==service['proofSha256']and binding['postmasterStart']==service['postmasterStart']
    assert all(binding[k]==w['installedAfter42Catalog'][v]for k,v in [('batchedSourceSetSha256','sourceSetSha256'),('batchedCatalogSpecSha256','catalogSpecSha256'),('batchedModelSha256','modelSha256')])
    assert binding['transactionMode']=='BATCHED_V1'and binding['stepCount']==44910
    return binding

def execution_description(w, context, roles, service):
    start=context['start'];e=context['executionDescription']
    assert set(e)=={'descriptor','liveFacts','payload','process','outputs'}
    captured=start['result']['describe']
    assert start['descriptionSource']=='STORED_START_JOB_OUTPUTS_NO_NODE_RERUN'and start['descriptionRootPublicObjectsMatched']is True
    assert captured['state']=='PROGRAM_DESCRIBED_NO_PG_OR_WRITE'and captured['databaseConnections']==captured['mutations']==0
    assert set(captured['outputs'])==set(e['outputs'])=={'payload','descriptor','liveFacts','process'}
    for kind,ref in captured['outputs'].items():
        row=e['outputs'][kind];raw=row['text'].encode('utf8')
        assert {k:row[k]for k in ('leaf','bytes','sha256')}==ref
        assert len(raw)==ref['bytes']and sha(raw)==ref['sha256']and json.loads(raw)==e[kind]
        stored=start['describeStoredOutputs'][kind]
        assert row['text']==stored['text']and all(row[k]==stored[k]for k in ('leaf','bytes','sha256'))
    d=e['descriptor'];f=e['liveFacts'];p=e['payload'];binding=d['expectedBinding']
    assert d['format']=='FRESH35_FINAL_R3_EXECUTION_DESCRIPTION_V1'and d['requestKey']==f['requestKey']==w['jobs']['writer']
    assert d['service']==f['service']==service and d['currentServiceSha256']==f['currentServiceSha256']==service['proofSha256']
    assert d['postmasterStart']==f['postmasterStart']==service['postmasterStart']
    assert d['sourceSetSha256']==f['sourceSetSha256']==w['root08']['value']['sourceSetSha256']
    assert d['batchedCatalog']==f['batchedCatalog']==w['installedAfter42Catalog']and f['expectedBinding']==binding
    assert d['originalPreparedBindingSha256']==w['prepare05']['executionBinding']['preparedBindingSha256']
    assert d['historicalNativeResultSha256']==w['prepare05']['nativeResultSha256']
    assert f['physical']==start['physical']and f['backupAdminValidUntil']==roles['backupAdminValidUntil']
    assert f['actualSharedServiceWorkDeadline']==start['actualSharedServiceWorkDeadline']
    assert f['runnerConservativeWorkDeadline']==f['actualSharedServiceWorkDeadline']-35000
    assert p==dict(service=service,backupAdminValidUntil=roles['backupAdminValidUntil'])
    process=e['process'];assert process['reason']is None and process['exitCode']==0 and process['childReaped']is True and process['descendantsReaped']is True
    return binding

def writer_authority(w, rule, context, predecessor, roles, policy, manifest, now):
    assert set(context)=={'apply','start','operatorReadySha256','executionDescription','planCustody'}
    host,fields=normal_common('writer',w,rule,context,roles,policy,manifest,now)
    old_binding,old_execution=retained_prepare05(w,predecessor)
    binding=execution_description(w,context,roles,fields['service'])
    # Preserve the exact typed digest from the original native execution witness.
    assert old_execution['preparedBindingSha256']==binding['preparedBindingSha256']
    retained_execution_binding(w,binding,fields['service'])
    assert context['planCustody']=={k:manifest['planCustodyStat9'][k]for k in manifest['planCustodyStat9']}
    expiry=roles['controllerValidUntil']
    deadline=min(context['start']['actualSharedServiceWorkDeadline'],context['start']['outerAuthorityLeaseExpiresAt'],roles['restorationDeadline'],policy['expiresAt'])
    assert expiry+120000<=deadline and now+rule['timeoutSeconds']*1000<expiry
    inner=dict(format='FRESH35_COMPACT_ZERO_EXECUTION_AUTHORIZATION_V2',decision='AUTHORIZE_EXACT_FIRST_REAL_BUSINESS_IMPORT_AND_READBACK',binding=binding,startsAt=now,expiresAt=expiry,authorizationReference=fields['authorizationReference'],independentSafetyReviewSha256=manifest['independentReviewSha256'])
    raw=host['encode'](inner);cli=api(Path(w['phaseDirectories']['writer'])/'r3_05_cli.py',rule)
    cli['require_execute_authority'](raw,sha(raw),binding,now,expiry,json.loads)
    h=w['writerHistoricalPins']
    authority=dict(host['scope'](),**fields,expiresAt=expiry,nativeAuthoritySha256=sha(raw),nativeAuthorityBase64=base64.b64encode(raw).decode(),expectedBinding=binding,prepareTerminalSha256=w['prepare05']['terminalSha256'],prepareResultSha256=w['prepare05']['rootResultSha256'],originalPreparedBinding=old_binding,originalExecutionBinding=old_execution,planCustody=context['planCustody'],**h)
    host['validate'](authority,now);return authority
