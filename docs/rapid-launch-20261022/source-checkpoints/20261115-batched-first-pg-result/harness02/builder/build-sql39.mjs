import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source');
const imports = name => import(new URL(`/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/scripts/release/unified-install/${name}.mjs`, import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const baseline = await imports('fresh35-baseline-scope-candidate');
const expectedPatch = 'b61b31b6116b3f0891dc4cd1f9182aa438d22ad987e29ac2ec73c04f72f5d0ba';
const { routines } = await baseline.loadFresh35BaselineScopePredecessors(root);
const source = baseline.generateFresh35BaselineScopePatch(routines);
assert.equal(sha(source.patchSql), expectedPatch);

function change(name, expected, replacements, predecessor) {
  const previous = routines.find(row => row.signature.includes(`.${name}(`));
  const sql38 = source.specs.find(row => row.signature === previous.signature);
  function apply(body, edits) {
    for (const [from, to, count = 1] of edits) {
      assert.equal(body.split(from).length - 1, count);
      body = body.replaceAll(from, () => to);
    }
    return body;
  }
  const before = predecessor ?? (sql38 ? apply(previous.body, sql38.replacements.map(({before, after}) => [before, after])) : previous.body);
  assert.equal(sha(before), expected);
  const after = apply(before, replacements);
  return { signature: previous.signature, beforeSha256: expected, afterSha256: sha(after), after, replacements };
}

const sameTransaction = 'xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint';
const hasWhole = `EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.${sameTransaction})`;
const checkpoints = `SELECT * FROM naijue_erp.audit_change WHERE object_type='IMPORT'\n      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND ${sameTransaction}`;
const key = "object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1";
const originalCheckpoint = checkpoints.replace('SELECT * FROM', 'SELECT * INTO STRICT a FROM') +
  `\n      AND (NOT ${hasWhole} OR (${key}));`;
const revisedCheckpoint = `SELECT * INTO STRICT a FROM (\n      ${checkpoints}\n      AND ${key} AND ${hasWhole}\n      UNION ALL\n      ${checkpoints}\n      AND NOT ${hasWhole}\n    ) AS matching_checkpoint;`;

const initLookup = "SELECT a.after_values->'request' INTO STRICT initial_request FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';";
const useValidatedInit = `SELECT a.operation_id INTO STRICT baseline_initialize_operation FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  initial_request:=whole_context->'request';
  IF baseline_initialize_operation IS DISTINCT FROM root_operation
   OR (initial_request->>'batch_id')::uuid IS DISTINCT FROM baseline.id
   OR ((command_phase='DOCUMENTS' OR b.inventory_mode='DOCUMENT_CONVERSION')
      AND (initial_request->'payload'->>'document_batch_id')::uuid IS DISTINCT FROM batch)
  THEN RAISE EXCEPTION 'WHOLE_REQUEST_BINDING_INVALID' USING ERRCODE='23514'; END IF;`;
const changes = [
  change('guard_import_accounting_publication', '06d8c74d5571d3e7093e0845b7dccd17184b5a302a196c0d4af7bb654c538ea6', [
    [originalCheckpoint, revisedCheckpoint],
  ]),
  change('standard_whole_package_command_v2', '4b31ea7398b4aae5fa6c91a9af2276258493cdccc9f72bfabe4aa12313b62c09', [
    ['whole_context jsonb; whole_marker jsonb;', 'whole_context jsonb; baseline_initialize_operation uuid; whole_marker jsonb;'],
    [initLookup, useValidatedInit, 2],
  ]),
];

function renderPatch(changes, label, afterRoutines = '') {
  const specs = changes.map(({ after, ...spec }) => spec);
  return `-- ${label}
BEGIN;
DO $sql39$
DECLARE specs jsonb := $body_specs$${JSON.stringify(specs)}$body_specs$;
  spec jsonb; edit jsonb; routine regprocedure; definition text; body text; anchor text;
  before_meta jsonb; after_meta jsonb;
BEGIN
  FOR spec IN SELECT value FROM jsonb_array_elements(specs) LOOP
    routine:=to_regprocedure(spec->>'signature');
    SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO STRICT body,before_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
    IF encode(sha256(convert_to(body,'UTF8')),'hex') IS DISTINCT FROM spec->>'beforeSha256'
       OR (before_meta->>'proowner')::oid IS DISTINCT FROM current_user::regrole::oid
    THEN RAISE EXCEPTION 'SQL39_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
    definition:=pg_get_functiondef(routine);
    FOR edit IN SELECT value FROM jsonb_array_elements(spec->'replacements') LOOP
      anchor:=edit->>0;
      IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>coalesce((edit->>2)::integer,1)
      THEN RAISE EXCEPTION 'SQL39_FUNCTION_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
      definition:=replace(definition,anchor,edit->>1);
    END LOOP;
    EXECUTE definition;
    SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO STRICT body,after_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
    IF before_meta IS DISTINCT FROM after_meta
       OR encode(sha256(convert_to(body,'UTF8')),'hex') IS DISTINCT FROM spec->>'afterSha256'
    THEN RAISE EXCEPTION 'SQL39_ROUTINE_OR_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
  END LOOP;
END $sql39$;
${afterRoutines}COMMIT;
`;
}
const patch = renderPatch(changes, 'Offline SQL39 routine-only candidate. Requires the pinned SQL38 predecessor.');

const impact = {
  state: 'LOCAL_SQL39_ROUTINE_ONLY_CANDIDATE', sql38PatchSha256: expectedPatch,
  sql38RecordSha256: 'd18f80cec591b3740f7aeceb14f1148bdea4ce867feba4e5ff3465dbdb8d231e',
  patchSha256: sha(patch), routines: changes.map(({after, replacements, ...effect}) => effect),
  tables: 35, routineCount: 154, indexChanges: [], rolesChanged: false, aclChanges: [],
  constraintChanges: [], triggerChanges: [], columnChanges: [],
};
await writeFile(resolve(directory, 'SQL39-LOCAL-CANDIDATE.sql'), patch);
await writeFile(resolve(directory, 'SQL39-CATALOG-IMPACT.json'), JSON.stringify(impact, null, 2) + '\n');

const rootKey = "after_values->'whole_package_v2'->>'root_operation'";
const ordinalText = "after_values->'whole_package_v2'->>'ordinal'";
const safeOrdinal = `(CASE WHEN ${ordinalText} ~ '^[0-9]{1,10}$' THEN
     CASE WHEN (${ordinalText})::bigint<=2147483647 THEN (${ordinalText})::integer END END)`;
const foreignSource = `SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND ${sameTransaction} AND ${rootKey}`;
const oldForeign = `EXISTS(${foreignSource} IS DISTINCT FROM root_operation::text)`;
const newForeign = `EXISTS(
     ${foreignSource} < root_operation::text
     UNION ALL ${foreignSource} > root_operation::text
     UNION ALL ${foreignSource} IS NULL)`;
const previousOrdinal = line => line.includes(`(${ordinalText})::integer=child_ordinal-1`);
const commandChange = changes[1];
const commandLines = commandChange.after.split('\n');
const priorIndex = commandLines.findIndex(previousOrdinal);
assert.ok(priorIndex > 0);
const originalPrior = commandLines.slice(priorIndex - 1, priorIndex + 1).join('\n');
const indexedPrior = originalPrior.replace(`(${ordinalText})::integer=`, () => `${safeOrdinal}=`);
const usePrior = `  IF EXISTS(SELECT 1 FROM naijue_erp.audit_change
     WHERE ${rootKey}=root_operation::text AND ${safeOrdinal} IS NULL) THEN
${originalPrior.split('\n').map(line => '  '+line).join('\n')}
  ELSE
${indexedPrior.split('\n').map(line => '  '+line).join('\n')}
  END IF;`;
const indexAlternative = change('standard_whole_package_command_v2', commandChange.afterSha256,
  [[oldForeign, newForeign], [originalPrior, usePrior]], commandChange.after);
const index = `CREATE INDEX audit_whole_root_ordinal_sql39 ON naijue_erp.audit_change ((${rootKey}),${safeOrdinal});\n`;
const alternative = renderPatch([indexAlternative], 'Offline optional root/ordinal successor of the two-routine candidate.', index);
await writeFile(resolve(directory, 'SQL39-LOCAL-ORDINAL-OPTION.sql'), alternative);
const { after, replacements, ...ordinalRoutine } = indexAlternative;
await writeFile(resolve(directory, 'SQL39-ORDINAL-OPTION-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_SQL39_ORDINAL_OPTION', predecessorPatchSha256: sha(patch), patchSha256: sha(alternative),
  routines: [ordinalRoutine], indexChanges: [{ action: 'ADD', definition: index.trim() }],
  unchanged: ['root count', 'closed_v2', 'tables', 'roles', 'ACLs', 'constraints', 'triggers', 'columns'],
}, null, 2) + '\n');

const prefixName = 'assert_document_conversion_batch';
const originalPrefix = routines.find(row => row.signature.includes(`.${prefixName}(`)).body;
const prefixStart = originalPrefix.indexOf('    SELECT count(*) INTO actual FROM naijue_erp.import_record source_row JOIN');
const prefixEnd = originalPrefix.indexOf(';', prefixStart) + 1;
const prefix = originalPrefix.slice(prefixStart, prefixEnd);
assert.ok(prefix.includes('source_audit.new_version<=a.new_version') && prefix.includes("source_row.status='IMPORTED'"));
const plannedPrefix = prefix.replace('SELECT count(*) INTO actual', 'SELECT count(*)')
  .replaceAll('next_row.id', '$1').replaceAll('kind', '$2').replaceAll('a.new_version', '$3')
  .replaceAll("a.after_values->'whole_package_v2'->>'root_operation'", '$4').trim().slice(0, -1);
const prefixChange = change(prefixName, '19ed4a99727ed212defe14c80257dd9f3da254b84a6f93c7e7257eeee5ec6706', [
  ['DECLARE kind text; actual bigint;', 'DECLARE kind text; actual bigint; previous_enable_nestloop text;'],
  [prefix, `    -- Different join orders can evaluate a malformed pointer that the old
    -- plan would skip, or skip one the old plan would evaluate. Route any
    -- ambiguous source value back to the original query before replanning.
    IF EXISTS(SELECT 1 FROM naijue_erp.import_record source_row
       WHERE source_row.import_batch_id=next_row.id AND source_row.target_type=kind AND source_row.status='IMPORTED'
         AND CASE WHEN pg_input_is_valid(source_row.decision_reason,'jsonb')
              THEN NOT coalesce(pg_input_is_valid(source_row.decision_reason::jsonb->>'operationId','uuid'),false)
              ELSE true END) THEN
${prefix}
    ELSE
     previous_enable_nestloop:=current_setting('enable_nestloop');
     PERFORM set_config('enable_nestloop','off',true);
     EXECUTE $prefix_count$${plannedPrefix}$prefix_count$ INTO actual
      USING next_row.id,kind,a.new_version,a.after_values->'whole_package_v2'->>'root_operation';
     PERFORM set_config('enable_nestloop',previous_enable_nestloop,true);
    END IF;`],
]);
const prefixPatch = renderPatch([prefixChange], 'Offline single-query planning candidate on original SQL38.');
const { after: prefixAfter, replacements: prefixEdits, ...prefixRoutine } = prefixChange;
await writeFile(resolve(directory, 'SQL39-LOCAL-PREFIX-PLAN.sql'), prefixPatch);
await writeFile(resolve(directory, 'SQL39-PREFIX-PLAN-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_PREFIX_PLAN_ONLY_CANDIDATE', sql38PatchSha256: expectedPatch, patchSha256: sha(prefixPatch),
  routines: [prefixRoutine], indexChanges: [], triggersChanged: false, aclChanged: false,
}, null, 2) + '\n');

const finishName = 'assert_document_migration';
const oldFinish = routines.find(row => row.signature.includes(`.${finishName}(`)).body;
const finish38 = source.specs.find(row => row.signature.includes(`.${finishName}(`));
const exactFinish = finish38.replacements.reduce((body, edit) => body.replace(edit.before, () => edit.after), oldFinish);
const finishStart = exactFinish.lastIndexOf(" IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item WHERE NOT EXISTS");
const finishEnd = exactFinish.indexOf(' END IF;', finishStart) + ' END IF;'.length;
const guard = exactFinish.slice(finishStart, finishEnd);
assert.ok(guard.includes("'migration requires complete stable detail/settlement source mappings'") && guard.length < 2000);
const matchDetail = kind => `SELECT 1 FROM LATERAL (
      SELECT m.import_batch_id,m.status,m.source_entity_type,m.target_type FROM naijue_erp.import_record m
      WHERE m.target_type=${kind} AND m.target_id=(item->>'id')::uuid OFFSET 0
     ) m WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.source_entity_type=m.target_type`;
const sameFinding = "RAISE EXCEPTION 'migration requires complete stable detail/settlement source mappings' USING ERRCODE='23514'; END IF;";
const fasterDetail = ` IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item
           WHERE NOT coalesce(pg_input_is_valid(item->>'id','uuid'),false))
  OR (r.target_type='SALES' AND EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'settlements') item
           WHERE NOT coalesce(pg_input_is_valid(item->>'id','uuid'),false))) THEN
${guard}
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item WHERE NOT EXISTS(
     ${matchDetail("CASE r.target_type WHEN 'SALES' THEN 'SALES_LINE' ELSE 'TRANSFER_LINE' END")}))
    OR (r.target_type='SALES' AND EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'settlements') item WHERE NOT EXISTS(
     ${matchDetail("'SALES_SETTLEMENT'")}))) THEN
   ${sameFinding}
 END IF;`;
const finishChange = change(finishName, finish38.successor_sha256, [[guard, fasterDetail]], exactFinish);
const finishPatch = renderPatch([finishChange], 'Offline FINISH detail point-lookup candidate on original SQL38.');
const { after: finishAfter, replacements: finishEdits, ...finishRoutine } = finishChange;
await writeFile(resolve(directory, 'SQL39-LOCAL-FINISH-DETAIL.sql'), finishPatch);
await writeFile(resolve(directory, 'SQL39-FINISH-DETAIL-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_FINISH_DETAIL_ONLY_CANDIDATE', sql38PatchSha256: expectedPatch, patchSha256: sha(finishPatch),
  routines: [finishRoutine], indexChanges: [], triggersChanged: false, aclChanged: false,
}, null, 2) + '\n');

const pair = renderPatch([prefixChange, finishChange], 'Offline atomic SQL39 candidate. Enables only prefix count planning and FINISH detail lookup.');
await writeFile(resolve(directory, 'SQL39-LOCAL-PREFIX-AND-FINISH.sql'), pair);
await writeFile(resolve(directory, 'SQL39-PREFIX-AND-FINISH-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_ATOMIC_PREFIX_AND_FINISH_CANDIDATE', sql38PatchSha256: expectedPatch,
  patchSha256: sha(pair), routines: [prefixRoutine, finishRoutine], indexChanges: [], triggersChanged: false, aclChanged: false,
  standaloneComparisonPatches: [sha(prefixPatch), sha(finishPatch)],
}, null, 2) + '\n');

const appendName = 'guard_import_record';
const originalAppend = routines.find(row => row.signature.includes(`.${appendName}(`)).body;
const appendStart = originalAppend.indexOf('OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r');
const appendEnd = originalAppend.indexOf(' THEN', appendStart);
const appendProbe = originalAppend.slice(appendStart, appendEnd);
assert.ok(appendProbe.includes("CROSS JOIN LATERAL jsonb_array_elements(a.after_values->'records') item"));
const guardedPointer = "NEW.decision_reason::jsonb->>'operationId'";
const pointProbe = appendProbe
  .replace('FROM naijue_erp.audit_change a JOIN', () => `FROM (
          SELECT ar.*,ar.xmin AS original_xmin FROM naijue_erp.audit_change ar
           WHERE ar.operation_id=(${guardedPointer})::uuid OFFSET 0
        ) a JOIN`)
  .replace("a.xmin::text::bigint", 'a.original_xmin::text::bigint');
const appendChange = change(appendName, '11342296be2355918e0b305801db0c3506c436d0c95600a6c86ab2da2465c4eb', [
  [appendProbe, `OR (CASE WHEN pg_input_is_valid(NEW.decision_reason,'jsonb')
      THEN CASE WHEN pg_input_is_valid(${guardedPointer},'uuid') THEN
       ${pointProbe.slice('OR '.length)} ELSE ${appendProbe.slice('OR '.length)} END
      ELSE ${appendProbe.slice('OR '.length)} END)`],
]);
const appendPatch = renderPatch([appendChange], 'Offline guard_import_record point lookup candidate on original SQL38.');
const { after: appendAfter, replacements: appendEdits, ...appendRoutine } = appendChange;
await writeFile(resolve(directory, 'SQL39-LOCAL-APPEND-POINT.sql'), appendPatch);
await writeFile(resolve(directory, 'SQL39-APPEND-POINT-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_IMPORT_RECORD_POINT_ONLY_CANDIDATE', sql38PatchSha256: expectedPatch,
  patchSha256: sha(appendPatch), routines: [appendRoutine], indexChanges: [], triggersChanged: false, aclChanged: false,
}, null, 2) + '\n');

const milestone = renderPatch([prefixChange, finishChange, appendChange], 'Offline atomic SQL39 milestone on original SQL38: publication, FINISH, and append.');
await writeFile(resolve(directory, 'SQL39-LOCAL-THREE-ROUTINE.sql'), milestone);
await writeFile(resolve(directory, 'SQL39-THREE-ROUTINE-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_ATOMIC_THREE_ROUTINE_MILESTONE', sql38PatchSha256: expectedPatch, patchSha256: sha(milestone),
  routines: [prefixRoutine, finishRoutine, appendRoutine], indexChanges: [], triggersChanged: false, aclChanged: false,
  standaloneComparisonPatches: [sha(prefixPatch), sha(finishPatch), sha(appendPatch)],
}, null, 2) + '\n');

const checkpointRoutines = [
  ['guard_header_native_reference_publication', '917f5a7fcc48a0da093da9cc36ea7fa3d58bb6d0524c1da2373c6d69f7ed5fbf'],
  ['guard_history_publication', '06d8c74d5571d3e7093e0845b7dccd17184b5a302a196c0d4af7bb654c538ea6'],
  ['guard_history_typed_publication', '6907bdc9cbe683e5a3f839a5ab7a6456824bc04ec3d2f5fb84768f1cd9f6ce38'],
  ['guard_import_accounting_publication', '06d8c74d5571d3e7093e0845b7dccd17184b5a302a196c0d4af7bb654c538ea6'],
  ['guard_native_catalogue_publication', '917f5a7fcc48a0da093da9cc36ea7fa3d58bb6d0524c1da2373c6d69f7ed5fbf'],
  ['guard_native_payment_publication', '917f5a7fcc48a0da093da9cc36ea7fa3d58bb6d0524c1da2373c6d69f7ed5fbf'],
  ['guard_successor_publication26', 'f14a1b571542a6d13e31b8b86fee4bc1a4a1988cdf08cb91b1ba0a59e96d23d0'],
];
const originalSequence = "(NEW.checkpoint->>'sequence')::integer";
const supportedSequence = `CASE WHEN pg_input_is_valid(NEW.checkpoint->>'sequence','integer')
      THEN ${originalSequence}<2147483647 ELSE false END`;
const checkpointEffects = checkpointRoutines.map(([name, before]) => change(name, before, [[originalCheckpoint,
   `IF (${supportedSequence}) THEN
    ${revisedCheckpoint}
    ELSE
    ${originalCheckpoint}
    END IF;`]]));
const checkpointPatch = renderPatch(checkpointEffects, 'Offline seven checkpoint lookups on original SQL38.');
await writeFile(resolve(directory, 'SQL39-LOCAL-CHECKPOINT-LOOKUP.sql'), checkpointPatch);
await writeFile(resolve(directory, 'SQL39-CHECKPOINT-LOOKUP-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_CHECKPOINT_LOOKUP_ONLY_CANDIDATE', sql38PatchSha256: expectedPatch, patchSha256: sha(checkpointPatch),
  routines: checkpointEffects.map(({after, replacements, ...effect}) => effect), indexChanges: [], triggersChanged: false, aclChanged: false,
}, null, 2) + '\n');

const tenRoutines = [prefixChange, finishChange, appendChange, ...checkpointEffects];
const combinedPatch = renderPatch(tenRoutines, 'Offline atomic SQL39 ten-routine candidate on original SQL38.');
await writeFile(resolve(directory, 'SQL39-LOCAL-TEN-ROUTINE.sql'), combinedPatch);
await writeFile(resolve(directory, 'SQL39-TEN-ROUTINE-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_ATOMIC_TEN_ROUTINE_CANDIDATE', sql38PatchSha256: expectedPatch,
  patchSha256: sha(combinedPatch), routines: tenRoutines.map(({after, replacements, ...effect}) => effect),
  indexes: 111, indexChanges: [], triggersChanged: false, aclChanged: false,
  standaloneComparisonPatches: [sha(milestone), sha(checkpointPatch)],
}, null, 2) + '\n');

const frozen38 = baseline.compileFresh35BaselineScopeCandidate(routines, source.patchSql);
const localBodies = new Map(routines.map(entry => [entry.signature, entry.body]));
for (const entry of frozen38.changedBodies) localBodies.set(entry.signature, entry.body);
for (const entry of tenRoutines) localBodies.set(entry.signature, entry.after);
const contextName = 'standard_whole_package_context_v2';
const contextInventory = [...localBodies].flatMap(([signature, body]) => {
  const calls = body.split('\n').map((line, i) => ({line: i + 1, text: line.trim()}))
    .filter(line => line.text.includes(`${contextName}(`))
    .map(line => ({...line, use: line.text.includes(`PERFORM naijue_erp.${contextName}(`) ? 'AUTHORITY_ONLY' : 'VALUE_CONSUMED'}));
  return calls.length ? [{signature, bodySha256: sha(body), calls}] : [];
});
await writeFile(resolve(directory, 'CONTEXT-V2-CALLERS.json'),
  JSON.stringify({tenPatchSha256: sha(combinedPatch), routines: contextInventory}, null, 2) + '\n');

const authorityName = 'standard_whole_package_authority_probe';
const authorityCalls = contextInventory.filter(row => row.calls.every(call => call.use === 'AUTHORITY_ONLY'));
assert.equal(authorityCalls.length, 14);
assert.equal(contextInventory.length, 15);
const authorityEdits = authorityCalls.map(({ signature, bodySha256, calls }) => {
  const name = signature.slice('naijue_erp.'.length, signature.indexOf('('));
  return change(name, bodySha256, [[`PERFORM naijue_erp.${contextName}(`,
    `PERFORM naijue_erp.${authorityName}(`, calls.length]], localBodies.get(signature));
});
const authorityCallerBody = localBodies.get(`naijue_erp.${contextName}(uuid)`);
const authorityExpected = " RETURN jsonb_build_object('actor',r.actor_account_id,'request',a.after_values->'request','marker',marker);";
assert.equal(authorityCallerBody.split(authorityExpected).length, 2);
const authorityBody = authorityCallerBody.replace(authorityExpected, ' RETURN;');
const authorityDdl = `CREATE FUNCTION naijue_erp.${authorityName}(root_operation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC'
AS $authority_body$${authorityBody}$authority_body$;
REVOKE ALL ON FUNCTION naijue_erp.${authorityName}(uuid) FROM PUBLIC;
`;
const baseAuthorityPatch = renderPatch(authorityEdits, 'Disposable authority-only comparison on the exact SQL39 ten-function carrier.');
const authorityPatch = baseAuthorityPatch.replace('BEGIN;\nDO $sql39$', () => `BEGIN;\n${authorityDdl}DO $sql39$`);
await writeFile(resolve(directory, 'SQL39-LOCAL-CONTEXT-AUTHORITY-PROBE.sql'), authorityPatch);
await writeFile(resolve(directory, 'CONTEXT-AUTHORITY-PROBE-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_DISPOSABLE_CONTEXT_AUTHORITY_PROBE', patchSha256: sha(authorityPatch),
  parentTenPatch: sha(combinedPatch), oldContextBody: sha(authorityCallerBody), probeAuthorityBody: sha(authorityBody),
  callSites: authorityEdits.map(({after, replacements, ...effect}) => effect),
}, null, 2) + '\n');

const compactKey = 'wholeRootAuthorityV1';
const compactName = 'd2_whole_root_authority';
const compactMarker = `jsonb_build_object('root_operation',root_operation,'ordinal',0,
   'full_xid',pg_current_xact_id()::text,'backend_pid',pg_backend_pid(),'controller',session_user)`;
const splitAt = ' SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=root_operation;';
const capabilityPrefix = authorityCallerBody.slice(0, authorityCallerBody.indexOf(splitAt))
  .replace(' marker jsonb;', ' proof jsonb; audit_id uuid; audit_actor uuid; audit_target uuid; audit_time timestamptz;');
assert.ok(capabilityPrefix.includes('WHOLE_TWO_CAPABILITIES_REQUIRED'));
const compactBody = `${capabilityPrefix}
 -- Preserve missing-row priority: original audit lookup precedes receipt.
 SELECT id,actor_account_id,object_id,occurred_at INTO STRICT audit_id,audit_actor,audit_target,audit_time
   FROM naijue_erp.audit_change WHERE operation_id=root_operation;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 IF NOT (r.result_data ? '${compactKey}') THEN
  PERFORM naijue_erp.standard_whole_package_context_v2(root_operation);
  RETURN;
 END IF;
 proof:=r.result_data->'${compactKey}';
 IF proof IS DISTINCT FROM jsonb_build_object('v',1,'marker',${compactMarker},
       'request_operation',root_operation,'request_actor',r.actor_account_id,'request_hash',r.request_hash)
  OR r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR r.target_type IS DISTINCT FROM 'IMPORT'
  OR r.actor_account_id IS DISTINCT FROM audit_actor OR r.target_id IS DISTINCT FROM audit_target
  OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR audit_time IS DISTINCT FROM r.completed_at
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=r.id AND x.${sameTransaction})
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change x WHERE x.id=audit_id AND x.${sameTransaction})
 THEN RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='42501'; END IF;
 RETURN;
END `;
const compactCallChanges = authorityCalls.map(({signature,bodySha256,calls}) => {
  const name = signature.slice('naijue_erp.'.length,signature.indexOf('('));
  const edits = [[`PERFORM naijue_erp.${contextName}(`,`PERFORM naijue_erp.${compactName}(`,calls.length]];
  if (name==='assert_standard_import_operation') {
    const point = "  IF operation=(a.after_values->'whole_package_v2'->>'root_operation')::uuid THEN";
    edits.push([point,`${point}
   IF r.result_data ? '${compactKey}' AND
     r.result_data->'${compactKey}' IS DISTINCT FROM jsonb_build_object(
      'v',1,'marker',a.after_values->'whole_package_v2',
      'request_operation',a.after_values->'request'->>'operation_id',
      'request_actor',a.after_values->'request'->'payload'->'admin'->>'account_id',
      'request_hash',r.request_hash)
   THEN RAISE EXCEPTION 'WHOLE_ROOT_AUTHORITY_AUDIT_DIFFERS' USING ERRCODE='23514'; END IF;`]);
  }
  return change(name,bodySha256,edits,localBodies.get(signature));
});
const commandName = 'standard_whole_package_command_v2';
const commandBody = localBodies.get(`naijue_erp.${commandName}(jsonb,text,text,uuid,integer)`);
const commandEdit = change(commandName,sha(commandBody),[
  ["'COMMITTED',result,transaction_timestamp());",`'COMMITTED',
    CASE WHEN command_phase='INITIALIZE' THEN result||jsonb_build_object('${compactKey}',jsonb_build_object(
      'v',1,'marker',${compactMarker},'request_operation',request->>'operation_id',
      'request_actor',payload->'admin'->>'account_id','request_hash',fingerprint))
    ELSE result END,transaction_timestamp());`],
],commandBody);
const constraintGuard = `DO $receipt_shape$
DECLARE original text; next_shape text; needle constant text := $needle$- 'historicalHallTargetCapturesSha256'::text) = '{}'::jsonb$needle$;
BEGIN
 SELECT pg_get_constraintdef(oid,false) INTO STRICT original FROM pg_constraint
 WHERE conrelid='naijue_erp.operation_receipt'::regclass AND conname='receipt_result_by_kind';
 IF encode(sha256(convert_to(original,'UTF8')),'hex') <>
    '5fdd40b5fbb91274b469d196ed344a2c3141f2f7bed390cd2fc8cc469354c7be'
 THEN RAISE EXCEPTION 'ROOT_AUTHORITY_RECEIPT_PARENT_DIFFERS' USING ERRCODE='55000'; END IF;
 next_shape:=replace(original,needle,$shape$- 'historicalHallTargetCapturesSha256'::text - '${compactKey}'::text) = '{}'::jsonb$shape$);
 IF next_shape=original THEN RAISE EXCEPTION 'ROOT_AUTHORITY_RECEIPT_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE 'ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind';
 EXECUTE 'ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind '||next_shape;
END $receipt_shape$;
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT d2_whole_root_authority_shape CHECK (
 NOT (result_data ? '${compactKey}') OR (
  target_type='IMPORT' AND action='IMPORT_INITIALIZE_CURRENT_ADMIN' AND result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
  AND result_data->>'phase'='INITIALIZE' AND jsonb_typeof(result_data->'${compactKey}')='object'
  AND (result_data->'${compactKey}')-ARRAY['v','marker','request_operation','request_actor','request_hash']='{}'
  AND result_data->'${compactKey}'->'v'='1'::jsonb
  AND result_data->'${compactKey}'->'request_operation'=to_jsonb(id)
  AND result_data->'${compactKey}'->'request_actor'=to_jsonb(actor_account_id)
  AND result_data->'${compactKey}'->'request_hash'=to_jsonb(request_hash)
  AND jsonb_typeof(result_data->'${compactKey}'->'marker')='object'
  AND (result_data->'${compactKey}'->'marker')-ARRAY['root_operation','ordinal','full_xid','backend_pid','controller']='{}'
  AND result_data->'${compactKey}'->'marker'->'root_operation'=to_jsonb(id)
  AND result_data->'${compactKey}'->'marker'->'ordinal'='0'::jsonb
  AND jsonb_typeof(result_data->'${compactKey}'->'marker'->'full_xid')='string'
  AND result_data->'${compactKey}'->'marker'->>'full_xid' ~ '^[0-9]{1,20}$'
  AND jsonb_typeof(result_data->'${compactKey}'->'marker'->'backend_pid')='number'
  AND result_data->'${compactKey}'->'marker'->>'backend_pid' ~ '^[1-9][0-9]{0,9}$'
  AND jsonb_typeof(result_data->'${compactKey}'->'marker'->'controller')='string'
  AND octet_length(result_data->'${compactKey}'->'marker'->>'controller') BETWEEN 1 AND 63
 ) IS TRUE);
CREATE FUNCTION naijue_erp.d2_guard_whole_root_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $guard$
BEGIN
 IF current_user::regrole::oid IS DISTINCT FROM (SELECT relowner FROM pg_class WHERE oid=TG_RELID)
 THEN RAISE EXCEPTION 'WHOLE_ROOT_RECEIPT_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION naijue_erp.d2_guard_whole_root_receipt() FROM PUBLIC;
CREATE TRIGGER d2_guard_whole_root_receipt BEFORE INSERT ON naijue_erp.operation_receipt FOR EACH ROW
 WHEN ((NEW.target_type='IMPORT' AND NEW.action='IMPORT_INITIALIZE_CURRENT_ADMIN') OR NEW.result_data ? '${compactKey}')
 EXECUTE FUNCTION naijue_erp.d2_guard_whole_root_receipt();
CREATE FUNCTION naijue_erp.${compactName}(root_operation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC'
AS $authority_body$${compactBody}$authority_body$;
REVOKE ALL ON FUNCTION naijue_erp.${compactName}(uuid) FROM PUBLIC;
`;
const compactChanges = [...compactCallChanges,commandEdit];
const compactPatch = renderPatch(compactChanges,'Disposable compact root receipt prototype on exact ten-routine carrier.')
  .replace('BEGIN;\nDO $sql39$',()=>`BEGIN;\n${constraintGuard}DO $sql39$`);
await writeFile(resolve(directory,'SQL39-LOCAL-COMPACT-RECEIPT-PROBE.sql'),compactPatch);
await writeFile(resolve(directory,'COMPACT-RECEIPT-PROBE-IMPACT.json'),JSON.stringify({
  parentTenPatch:sha(combinedPatch),patchSha256:sha(compactPatch), newRoutines:[compactName,'d2_guard_whole_root_receipt'],
  existingRoutines:compactChanges.map(({signature,beforeSha256,afterSha256})=>({signature,beforeSha256,afterSha256})),
  existingConstraint:'receipt_result_by_kind',newConstraint:'d2_whole_root_authority_shape',
  newTrigger:'d2_guard_whole_root_receipt',
},null,2)+'\n');

// Index only canonical UUIDs. Malformed or unbounded historical text has a
// fixed-width NULL key, and the original text comparisons remain in the SQL.
const boundedRoot = `(CASE WHEN octet_length(${rootKey})=36 AND
  (${rootKey}) COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (${rootKey})::uuid END)`;
const boundedOrdinal = `(CASE WHEN ${boundedRoot} IS NOT NULL THEN ${safeOrdinal} END)`;
const rootPredicate = `${rootKey}=root_operation::text`;
const indexedRootPredicate = `${boundedRoot}=root_operation AND ${rootPredicate}`;
const countSource = `(SELECT count(*) FROM naijue_erp.audit_change WHERE ${rootPredicate})`;
const foreignBase = `SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
       AND ${sameTransaction} AND ${rootKey} IS DISTINCT FROM root_operation::text`;
const indexedForeign = `EXISTS(
      ${foreignBase} AND ${boundedRoot}<root_operation
      UNION ALL ${foreignBase} AND ${boundedRoot}>root_operation
      UNION ALL ${foreignBase} AND ${boundedRoot} IS NULL AND ${boundedOrdinal} IS NULL)`;
const rankedPrior = originalPrior.replace(rootPredicate, () => indexedRootPredicate)
  .replace(`(${ordinalText})::integer=`, () => `${boundedOrdinal}=`);
const compatiblePrior = `  IF EXISTS(SELECT 1 FROM naijue_erp.audit_change
     WHERE ${indexedRootPredicate} AND ${boundedOrdinal} IS NULL) THEN
${originalPrior.split('\n').map(line => '  '+line).join('\n')}
  ELSE
${rankedPrior.split('\n').map(line => '  '+line).join('\n')}
  END IF;`;
const boundedCommand = change('standard_whole_package_command_v2',
  '4b31ea7398b4aae5fa6c91a9af2276258493cdccc9f72bfabe4aa12313b62c09', [
    [countSource, countSource.replace(rootPredicate, () => indexedRootPredicate)],
    [oldForeign, indexedForeign],
    [originalPrior, compatiblePrior],
  ]);
const boundedIndex = `CREATE INDEX audit_whole_bounded_root_ordinal_probe ON naijue_erp.audit_change
  (${boundedRoot},${boundedOrdinal},object_type);\n`;
const boundedPatch = renderPatch([boundedCommand], 'Offline bounded root/ordinal probe on exact ten-routine carrier.', boundedIndex);
await writeFile(resolve(directory, 'SQL39-LOCAL-BOUNDED-ROOT-PROBE.sql'), boundedPatch);
const { after: boundedAfter, replacements: boundedEdits, ...boundedRoutine } = boundedCommand;
await writeFile(resolve(directory, 'SQL39-BOUNDED-ROOT-PROBE-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_ONLY_BOUNDED_ROOT_ORDINAL_PROBE', predecessorPatchSha256: sha(combinedPatch),
  patchSha256: sha(boundedPatch), routines: [boundedRoutine],
  indexChanges: [{ action: 'ADD', definition: boundedIndex.trim() }],
  probes: { boundedRoot, boundedOrdinal, rootPredicate, indexedRootPredicate, countSource, oldForeign, indexedForeign, originalPrior, compatiblePrior },
}, null, 2) + '\n');

const priorOnly = change('standard_whole_package_command_v2', boundedCommand.beforeSha256, [
  [originalPrior, compatiblePrior],
]);
const priorIndexDdl = `CREATE INDEX audit_whole_prior_probe ON naijue_erp.audit_change
  (${boundedRoot},${boundedOrdinal}) WHERE ${boundedRoot} IS NOT NULL;\n`;
const priorPatch = renderPatch([priorOnly], 'Offline prior-only probe on exact ten-routine carrier.', priorIndexDdl);
await writeFile(resolve(directory, 'SQL39-LOCAL-PRIOR-ONLY-PROBE.sql'), priorPatch);
const { after: priorAfter, replacements: priorEdits, ...priorRoutine } = priorOnly;
await writeFile(resolve(directory, 'SQL39-PRIOR-ONLY-PROBE-IMPACT.json'), JSON.stringify({
  state: 'LOCAL_ONLY_PRIOR_PROBE', predecessorPatchSha256: sha(combinedPatch), patchSha256: sha(priorPatch),
  routines: [priorRoutine], indexChanges: [{action: 'ADD', definition: priorIndexDdl.trim()}],
}, null, 2) + '\n');

if (process.argv[2] === '--synthetic-install') {
  const paths = await imports('fresh35-combined-source-v1');
  const ref = await paths.resolveFresh35ReferenceInputPaths(resolve(process.argv[3]));
  const base = await paths.loadFresh35CombinedSource(root, ref);
  const rendered = paths.renderFresh35CombinedSchema(base, {
    owner: 'fresh35_owner_20261105_r1', controller: 'fresh35_controller_20261105_r1',
  });
  const admin = await imports('fresh35-admin-provision-candidate');
  const adminPatch = (await admin.loadFresh35AdminProvisionCandidate(root)).patchSql;
  const sql38 = await readFile(resolve(root, 'adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql'), 'utf8');
  assert.equal(sha(sql38), expectedPatch);
  await writeFile(resolve(process.argv[4]), [
    'BEGIN;', rendered.schemaSql, 'SET ROLE fresh35_owner_20261105_r1;',
    'GRANT EXECUTE ON FUNCTION naijue_erp.is_native_party_import_insert(text,jsonb) TO PUBLIC;',
    rendered.lineageSql,
    'GRANT SELECT (version, description) ON TABLE naijue_erp.schema_migration TO fresh35_controller_20261105_r1;',
    'GRANT INSERT (id, staff_id, login_name, password_hash, login_enabled, auth_version, version, created_at, updated_at) ON TABLE naijue_erp.user_account TO erp_unified27_runtime_2393dbc6db9581c2;',
    'GRANT UPDATE (login_name, login_enabled, auth_version, version, updated_at, password_hash) ON TABLE naijue_erp.user_account TO erp_unified27_runtime_2393dbc6db9581c2;',
    ...rendered.patchBodies.map(({sql}) => sql), 'COMMIT;', adminPatch, sql38, 'RESET ROLE;',
  ].join('\n'));
}
