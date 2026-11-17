
def recovery_facts(a):
    # Existing bounded metadata receipts only. No live PG, query or payload read.
    def evidence(name):
        raw=read(JOB/'bundle'/name)
        need(sha(raw)==PINS[name],'SETTLEMENT24_FIXED_RECOVERY_EVIDENCE_REQUIRED')
        return json.loads(raw)
    diagnostic=evidence('diagnostic02-readback.json')
    decision=evidence('main-recovery-decision.json')
    writer=evidence('historical-writer39-failed.json')
    catalog=evidence('historical-catalog35.json')
    need(PINS['diagnostic02-readback.json']==DIAGNOSTIC_READBACK_SHA256
        and PINS['main-recovery-decision.json']==MAIN_DECISION_SHA256
        and decision['actualDiagnosticReadbackSha256']==DIAGNOSTIC_READBACK_SHA256
        and decision['SQLUpgradeAlreadyPerformed']is False
        and decision['sourceInputOrIdentityAlterationAuthorized']is False
        and decision['truncateDeleteOrRebuildAuthorized']is False
        and decision['originalFailedWriterPermanentlyConsumed']is True,
        'SETTLEMENT24_MAIN_FACTUAL_RECOVERY_REQUIRED')
    def receipt(key,terminal_pin,result_leaf,result_pin,result_value):
        raw=read(JOBS/key/'r3-outer-terminal.json')
        need(sha(raw)==terminal_pin and raw==read(CONTROL/'results'/(key+'.json'),owner=1000),
            'SETTLEMENT24_ORIGINAL_TERMINAL_REQUIRED')
        terminal=json.loads(raw);need(terminal['jobId']==key,'SETTLEMENT24_ORIGINAL_KEY_REQUIRED')
        raw=read(JOBS/key/'results'/result_leaf)
        need(sha(raw)==result_pin and json.loads(raw)==result_value
            and json.loads(read(CONTROL/'jobs'/key/'results'/result_leaf,owner=1000))==result_value,
            'SETTLEMENT24_ORIGINAL_RESULT_REQUIRED')
        return terminal
    term=receipt(DIAGNOSTIC_KEY,'68ef74f754d803b13788fe420517900570cd4f5c714e264a16b204182d7f65a6',
        'durable-readonly-result.json','67e2ba34665b3f86123bdc6f49cdec697defb3a51091389cf95d60b36a481fd4',diagnostic['result'])
    need((term['status'],term['exitCode'])==('COMPLETED',0),'SETTLEMENT24_DIAGNOSTIC_COMPLETE_REQUIRED')
    raw=read(JOBS/DIAGNOSTIC_KEY/'results/durable-readonly-cleanup.json')
    cleanup=diagnostic['cleanup']
    need(sha(raw)=='efa0d88a847a8bf83f1beb2decb5dd3c90918d28155616cef1db338426b3e45a'
        and json.loads(raw)==cleanup
        and json.loads(read(CONTROL/'jobs'/DIAGNOSTIC_KEY/'results/durable-readonly-cleanup.json',owner=1000))==cleanup
        and all(cleanup[k]is True for k in ('ownContainerStopped','ownedPidAbsent','pgdataPidAbsent','originalPortAbsent','dataPreserved')),
        'SETTLEMENT24_DIAGNOSTIC_OWN_CLEANUP_REQUIRED')
    snapshot=diagnostic['result']['snapshot'];facts=snapshot['evidence']
    need(snapshot['status']=='FIXED_DURABLE_READONLY_SNAPSHOT_OBSERVED'
        and snapshot['transactionEnd']=='ROLLBACK' and facts['transactionReadOnly']is True
        and all(snapshot['cleanup'][k]is True for k in ('childReaped','cleanClusterAfterRead','descendantsAbsent'))
        and facts['rootOperation']=={'committedCount':0,'count':0,'hasBatchedMarker':False,'otherStatusCount':0}
        and facts['failedSubBatch']=={'committedCount':0,'receiptCount':0}
        and facts['namespace']==decision['observedNamespace']
        and facts['tableCounts']==decision['tableCounts']
        and facts['functionBodySha256']==decision['observedThreeBeforeBodyHashes']
        and list(facts['functionBodySha256'].values())==[r['beforeBodySha256']for r in ROUTINE_PINS]
        and decision['observedFunctionDefinitions']is None and decision['prosrcObservationIsNotDefinitionProof']is True,
        'SETTLEMENT24_EXACT_DURABLE_FACTS_REQUIRED')
    # Definitions/owner/all remaining pg_proc metadata are still checked live by
    # the retained native before observation; this receipt proves prosrc only.
    key='t45-r3-batched-real-execute-20261115-01'
    term=receipt(key,'00132d00459328530dd4656d9a9e853b81abfbc92a73076fcde733d080cbdb35',
        'final33-writer-result.json','ad8746e056c391d9f9b7bd63728f53fecccb7a550c867cd47b0a443bfff70fb1',writer['result'])
    w=writer['result']
    need((term['status'],term['exitCode'])==('FAILED',2) and w['state']=='ROLLED_BACK'
        and w['nativeConnectionCleanup']=='CLOSED' and w['lifecycleConfirmed']is True
        and all(w['processCleanup'][k]is True for k in ('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty')),
        'SETTLEMENT24_CONSUMED_FAILED_WRITER_CLEANUP_REQUIRED')
    key='t45-r3-batched161-command-successor-20261116-01'
    term=receipt(key,'515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb',
        'batched161-command-update-result.json','a474d758af30d53a4154f90081066213df351a33cb1226f976d6231ed7fdb020',catalog['result'])
    before=catalog['result']
    need((term['status'],term['exitCode'])==('COMPLETED',0) and before['batchedCatalog']==BEFORE_CATALOG
        and before['commitAcknowledged']is True and before['commitOutcomeUnknown']is False
        and before['postCommitReadback']is True and before['connectionCleanup']=='CLOSED'
        and before['completionSha256']=='fe89ee20df99555feec98782c7542730a199a9edffeb9e43b2c4f98388aa2207',
        'SETTLEMENT24_HISTORICAL_COMMAND_CATALOG_REQUIRED')
