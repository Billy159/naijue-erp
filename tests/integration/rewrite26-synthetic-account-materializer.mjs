/** Non-secret synthetic account candidates for the one reviewed test target.
 * No file, credentials, independent review, authority or database is created. */
import assert from 'node:assert/strict';
import {buildCurrentRuntime26SalesBlueprint, rewrite26SyntheticIdentityCandidates,
  CURRENT_REWRITE_SYNTHETIC_TARGET, CURRENT_REWRITE_SYNTHETIC_BATCH,
  CURRENT_REWRITE_SYNTHETIC_NAMESPACE} from './current-runtime26-sales-fixture.ts';

export function buildRewrite26IdentityDraft(blueprint) {
  const candidates = rewrite26SyntheticIdentityCandidates(blueprint);
  assert.equal(blueprint.database, CURRENT_REWRITE_SYNTHETIC_TARGET);
  assert.equal(blueprint.batchId, CURRENT_REWRITE_SYNTHETIC_BATCH);
  assert.equal(blueprint.namespace, CURRENT_REWRITE_SYNTHETIC_NAMESPACE);
  // Reconstruct exact synthetic source facts from this blueprint's non-secret
  // pins and timestamp. Never accept a caller-supplied lookalike staff mapping.
  const original = buildCurrentRuntime26SalesBlueprint({database:blueprint.database,
    batchId:blueprint.batchId,now:blueprint.now,pins:blueprint.pins});
  assert.deepEqual(candidates.accounts, original.accountIdentities);
  const staff = blueprint.parties.filter(row => row.source.entityType === 'STAFF');
  const expectedStaff = original.parties.filter(row => row.source.entityType === 'STAFF');
  assert.deepEqual(staff, expectedStaff);
  assert.equal(staff.length,49);
  const sourceIds = new Set(), accountIds = new Set(), staffIds = new Set(), rowIds = new Set(), planKeys = new Set();
  const plan = [];
  const rows = candidates.accounts.map(account => {
    const match = staff.filter(p => p.source.sourceKey === account.staffSourceKey);
    assert.equal(match.length,1);
    const person=match[0], source=person.source, snapshot=person.nativeSnapshot;
    assert.equal(source.batchId,blueprint.batchId);assert.equal(source.entityType,'STAFF');
    assert.equal(source.sourceKey,account.sourceAccountId);assert.equal(snapshot.id,account.nativeStaffId);
    assert.equal(snapshot.role,account.sourceRole);assert.equal(snapshot.hall_id,account.nativeHallId);
    assert.equal(snapshot.employment_status,account.sourceEmploymentStatus);
    assert.equal(source.normalizedFields['所属厅来源编号']||null,account.sourceHallId);
    for(const [set,value] of [[sourceIds,account.sourceAccountId],[accountIds,account.nativeAccountId],
      [staffIds,account.nativeStaffId],[rowIds,source.id]]) {assert.ok(!set.has(value));set.add(value);}
    const direct=account.sourceEmployeeNativeId!==null;
    if(direct) {
      assert.equal(account.sourceEmployeeNativeId,account.sourceAccountId);
      assert.ok(typeof account.sourceEmployeeCode==='string'&&account.sourceEmployeeCode.length>0);
      assert.equal(account.approvedCurrentPerson,undefined);
    } else {
      assert.equal(account.sourceEmployeeCode,null);
      const link=account.approvedCurrentPerson;
      assert.ok(link&&typeof link.currentPersonKey==='string'&&!planKeys.has(link.currentPersonKey));
      assert.ok(Number.isSafeInteger(link.sourcePlanRow)&&link.sourcePlanRow>0);planKeys.add(link.currentPersonKey);
      plan.push({sourceRow:link.sourcePlanRow,currentPersonKey:link.currentPersonKey,
        identityMatchMethod:'NEW_TO_RETAINED_EMPLOYEE_BASELINE',primarySourceEmployeeCode:null,
        plannedPreservedEmployeeId:null,runtimeEmployeeId:null,role:account.sourceRole,
        employmentStatusRequested:account.sourceEmploymentStatus,loginRequestedByUser:account.sourceLoginEnabled});
    }
    return {sourceAccountId:account.sourceAccountId,sourceAccountVersion:account.sourceAccountVersion,
      sourceEmployeeNativeId:account.sourceEmployeeNativeId,sourceEmployeeCode:account.sourceEmployeeCode,
      sourceRole:account.sourceRole,sourceHallId:account.sourceHallId,sourceStoreId:null,
      sourceEmploymentStatus:account.sourceEmploymentStatus,sourceLoginEnabled:account.sourceLoginEnabled,
      sourceEnabled:account.sourceEnabled,nativeAccountId:account.nativeAccountId,nativeStaffId:account.nativeStaffId,
      staffSourceKey:account.staffSourceKey,nativeHallId:account.nativeHallId,
      staffSourceRowId:source.id,staffSourceRowSha256:source.rowSha256,
      planCandidate:direct?null:{currentPersonKey:account.approvedCurrentPerson.currentPersonKey,
        sourcePlanRow:account.approvedCurrentPerson.sourcePlanRow}};
  });
  assert.equal(rows.length,49);assert.equal(rows.filter(row=>row.planCandidate===null).length,45);
  assert.equal(plan.length,4);
  const importer=rows.find(row=>row.nativeAccountId===blueprint.refs.importer.nativeAccountId);
  assert.ok(importer&&importer.sourceRole==='ADMIN'&&importer.sourceAccountId===blueprint.refs.importer.sourceAccountId);
  return {version:'REWRITE26_SYNTHETIC_ACCOUNT_DRAFT_V1',syntheticOnly:true,executionAuthorized:false,
    database:blueprint.database,batchId:blueprint.batchId,fixedSourceNamespace:blueprint.namespace,
    importerCandidate:{sourceAccountId:importer.sourceAccountId,nativeAccountId:importer.nativeAccountId},
    sourceRows:rows,planCandidate:{state:'PENDING_INDEPENDENT_REVIEW',employees:plan},
    missing:['PRIVATE_SOURCE_CAPTURE_WITH_PRIVATE_CREDENTIALS','APPROVED_PLAN_AND_PIN',
      'SAFE_IDENTITY_FACTS_AND_PIN','ACCOUNT_DECISION_AND_PIN','INDEPENDENT_IDENTITY_REVIEW',
      'CORE_SOURCE_DIGEST_AND_EXECUTION_REVIEW']};
}
