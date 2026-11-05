/** Fresh-empty35 retained-trigger specialization. Source generation only: no DB
 * connection, execution, registration or populated-target migration. Historical
 * lanes fail closed; retained standard imports and native business keep proofs. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadWholeCatalogSpec } from './whole-catalog-gate.mjs';
import { LEGACY_ROWTYPE_EXPECTED_TABLES } from './fresh27-legacy-rowtypes.mjs';
import { LEGACY_RETIREMENT_CANDIDATE_TABLES } from './legacy-dependency-source-report.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const need = (value, code) => { if (!value) throw Error(code); };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const FRESH35_CORE_GUARD_SOURCES = freeze([
  {
    "path": "adapters/postgres/patches/0027_standard_known_balance_runtime_v2.sql",
    "sha256": "0bf30934472cca7a11e1f321b530e925da84c336f706424dc9c150fe8476ff92"
  },
  {
    "path": "adapters/postgres/migrations/0027_unified_business_documents.sql",
    "sha256": "d42954acf56445b803ae126b364b1b2a7b0cfe70a98accaeef5cc13a9082c317"
  },
  {
    "path": "adapters/postgres/migrations/0015_native_import_record_accounting.sql",
    "sha256": "0cadbcc3dbd76a1e3546e6db983adac7d2b129ad76fcb99eba43cfaf0068794a"
  },
  {
    "path": "adapters/postgres/patches/0026-history-revision-set-guards-successor.sql",
    "sha256": "0eb5785c7e050c0b1eac5fe0fd8949dfd126f466130c841cef098247ef62cb38"
  },
  {
    "path": "adapters/postgres/patches/0026-history-revision-current-base.sql",
    "sha256": "5fb5953364c1b82349ea2f1fc28ebb9b451a4144f9278d9cf6ed00e9b5eef56e"
  },
  {
    "path": "adapters/postgres/patches/0027_unified_live_history_dispatch_successor.sql",
    "sha256": "15b400196725446d04757e431f27d815ed586a08b8c95ab73438ea1f1ead726f"
  },
  {
    "path": "adapters/postgres/patches/0027_standard_import_initialization.sql",
    "sha256": "680fdac8120d35122f8414924ed40fb175c1533a7cfd6b656077cec7242332f1"
  }
]);
export const FRESH35_CORE_GUARD_REPLACEMENTS = freeze([
  {
    "name": "validate_sparse_balance_commit",
    "signature": "naijue_erp.validate_sparse_balance_commit()",
    "source": "adapters/postgres/patches/0027_standard_known_balance_runtime_v2.sql",
    "before_sha256": "c071e1159a52b192e9526645c02febaaccd9c390cbe63c7850cdf2be4440077d",
    "after_sha256": "b4fcf066b75f334152e997080ce3157c578731bea4fd98366bd93e5e1ff88d64"
  },
  {
    "name": "validate_import_accounting_checkpoint_commit",
    "signature": "naijue_erp.validate_import_accounting_checkpoint_commit()",
    "source": "adapters/postgres/migrations/0027_unified_business_documents.sql",
    "before_sha256": "aa964dee26415bd96e86154068b3ff076fb285d8144523ec2afc84264ab69fc3",
    "after_sha256": "b6e35be539a377241faedf36c616fe941e26b4b132baf822b9fa35e9d7ffbe3d"
  },
  {
    "name": "validate_import_accounting_baseline_commit",
    "signature": "naijue_erp.validate_import_accounting_baseline_commit()",
    "source": "adapters/postgres/migrations/0015_native_import_record_accounting.sql",
    "before_sha256": "678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51",
    "after_sha256": "fa29bffe3a186de0f6d6fec85f23352afb57e9d8fe8ca6d92c948afff60025e1"
  },
  {
    "name": "validate_import_accounting_final_record_commit",
    "signature": "naijue_erp.validate_import_accounting_final_record_commit()",
    "source": "adapters/postgres/migrations/0015_native_import_record_accounting.sql",
    "before_sha256": "f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312",
    "after_sha256": "5bd65ec325d3158d9f56e4366eb0222464bc109b40aa13efe0c09c3a67f2ad92"
  },
  {
    "name": "guard_history_numeric_ledger",
    "signature": "naijue_erp.guard_history_numeric_ledger()",
    "source": "adapters/postgres/patches/0026-history-revision-set-guards-successor.sql",
    "before_sha256": "014f98557c5fc57e5e6f0ba3d21483be5e7eb3e3adbc86c9162dcd120df40797",
    "after_sha256": "32d766968972c01675d0aad91d554d7f726086f88a3fcee7d168e2d6ab09bb8e"
  },
  {
    "name": "validate_history_numeric_receipt_commit",
    "signature": "naijue_erp.validate_history_numeric_receipt_commit()",
    "source": "adapters/postgres/patches/0026-history-revision-current-base.sql",
    "before_sha256": "e69f92651dc7a8313e354d47bd4f1ffc1c97fb30aa5c56dcfc49f69511a1d7d6",
    "after_sha256": "62ac483bf4cae3d87b5268574b3797533c27ef9e802bd7e1af7618a02e0963d1"
  },
  {
    "name": "validate_history_numeric_balance_commit",
    "signature": "naijue_erp.validate_history_numeric_balance_commit()",
    "source": "adapters/postgres/patches/0026-history-revision-current-base.sql",
    "before_sha256": "fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837",
    "after_sha256": "6766a0a3d31ceaecd363f01d13f1c749769303ff53eb8ff62d86aacc853e2d0a"
  },
  {
    "name": "history_numeric_ledger_set_guard",
    "signature": "naijue_erp.history_numeric_ledger_set_guard()",
    "source": "adapters/postgres/patches/0027_unified_live_history_dispatch_successor.sql",
    "before_sha256": "f94e8788203bc83f35ebf872d7569faf59acc5d1fe1967a9889badf092fc8f16",
    "after_sha256": "661cd72f1df3a14d2fafa67ce1b1912657942ce9d670d0f8b1ea55f46200cd87"
  },
  {
    "name": "validate_import_batch_commit",
    "signature": "naijue_erp.validate_import_batch_commit()",
    "source": "adapters/postgres/patches/0027_standard_import_initialization.sql",
    "before_sha256": "0975bb6321f78cbd1c6158145c4f458fe609d273d63bbe344be4ac2a5316ab9f",
    "after_sha256": "b6e35be539a377241faedf36c616fe941e26b4b132baf822b9fa35e9d7ffbe3d"
  },
  {
    "name": "validate_import_operation",
    "signature": "naijue_erp.validate_import_operation()",
    "source": "adapters/postgres/patches/0027_standard_import_initialization.sql",
    "before_sha256": "e500e06a4630bf0ae1fb38a40fb868d0c0df0a5ebb025beeed2314cf62fe388e",
    "after_sha256": "4f5f0c85675b2505cf8f86c17d43a7082e4cf1e0be990c4840e452cdaa03fae6"
  }
]);

const preserved = {
  validate_sparse_balance_commit: ['Byte-identical explicit-zero, unknown-key, native receipt/audit, cumulative effect and baseline checks.'],
  validate_import_accounting_checkpoint_commit: ['Exact standard checkpoint transition, receipt/audit/counter/source/effect closure.', 'Exact document-conversion transition and no-rebaseline validator.'],
  validate_import_accounting_baseline_commit: ['One exact retained standard inventory-key proof, ledger identity, quantity and current receipt timestamp.'],
  validate_import_accounting_final_record_commit: ['Retained standard source proof, original namespace binding or final approval identity and publication receipt.'],
  guard_history_numeric_ledger: ['Nonhistorical rows continue to all existing native ledger/source/receipt validators.', 'Historical event and all three historical foreign-key fields are rejected.'],
  validate_history_numeric_receipt_commit: ['Nonhistorical receipts continue to existing audit/receipt/business closure.', 'Historical target or action is rejected.'],
  validate_history_numeric_balance_commit: ['Strict referenced receipt existence before dispatch.', 'Nonhistorical balances retain the separate native delta/version validators.'],
  history_numeric_ledger_set_guard: ['Every statement transition row is checked, including mixed event sets.', 'Nonhistorical sets retain native per-row and deferred validators.'],
  validate_import_batch_commit: ['Byte-identical standard checkpoint transition and complete operation closure.', 'Byte-identical document-conversion branch.'],
  validate_import_operation: ['Byte-identical STANDARD_IMPORT_SQL_V1 operation closure branch, including standard document conversion.'],
};
const retired = {
  validate_sparse_balance_commit: ['Historical revision balance dispatch is replaced by an explicit rejection.'],
  validate_import_accounting_checkpoint_commit: ['Legacy V2 accounting claims, old core/bootstrap and barcode initialization are unsupported.'],
  validate_import_accounting_baseline_commit: ['Legacy V2 accounting-claim linkage is rejected rather than faked.'],
  validate_import_accounting_final_record_commit: ['Legacy V2 publication claims are replaced by retained standard source/receipt evidence.'],
  guard_history_numeric_ledger: ['Historical revision reads and write acceptance are retired.'],
  validate_history_numeric_receipt_commit: ['Historical revision receipt acceptance is retired.'],
  validate_history_numeric_balance_commit: ['Historical revision rowtype, reads and cumulative historical adjustment lane are retired.'],
  history_numeric_ledger_set_guard: ['Historical revision effect expansion is retired; any historical row now rejects its entire statement.'],
  validate_import_batch_commit: ['Legacy initializer helpers and legacy four-counter cutoff fallback are rejected.'],
  validate_import_operation: ['Legacy initializer helpers and nonstandard import operation fallback are rejected.'],
};
const historicalLedgerBody = `
BEGIN
  IF NEW.event_kind='HISTORY_REVISION' OR NEW.source_history_revision_id IS NOT NULL
    OR NEW.source_history_sales_line_id IS NOT NULL OR NEW.source_history_transfer_line_id IS NOT NULL THEN
    RAISE EXCEPTION 'FRESH35_HISTORICAL_LEDGER_RETIRED' USING ERRCODE='23514';
  END IF;
  -- Native ledger identity, quantity, source, receipt and effect validators remain attached.
  RETURN NEW;
END;
`;
const historicalReceiptBody = `
BEGIN
  IF NEW.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') OR NEW.action='HISTORY_REVISE' THEN
    RAISE EXCEPTION 'FRESH35_HISTORICAL_RECEIPT_RETIRED' USING ERRCODE='23514';
  END IF;
  -- Native receipt/audit reciprocity and business validators remain attached.
  RETURN NULL;
END;
`;
const historicalBalanceBody = `
DECLARE r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.last_operation_id;
  IF r.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') OR r.action='HISTORY_REVISE' THEN
    RAISE EXCEPTION 'FRESH35_HISTORICAL_BALANCE_RETIRED' USING ERRCODE='23514';
  END IF;
  -- Native sparse, sales, transfer and recorded-live balance validators remain attached.
  RETURN NULL;
END;
`;
const historicalLedgerSetBody = `
BEGIN
  IF EXISTS(SELECT 1 FROM history_new WHERE event_kind='HISTORY_REVISION'
    OR source_history_revision_id IS NOT NULL OR source_history_sales_line_id IS NOT NULL
    OR source_history_transfer_line_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FRESH35_HISTORICAL_LEDGER_SET_RETIRED' USING ERRCODE='23514';
  END IF;
  -- Checking the entire transition set also rejects mixed native/historical statements.
  RETURN NULL;
END;
`;
const baselineBody = `
DECLARE b naijue_erp.import_batch%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.operation_id;
  IF NEW.event_kind IS DISTINCT FROM 'CUTOFF_BASELINE'
    OR b.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
    OR b.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
    OR r.target_type IS DISTINCT FROM 'IMPORT' OR r.target_id IS DISTINCT FROM b.id
    OR r.action IS DISTINCT FROM 'IMPORT_CHUNK' OR r.status IS DISTINCT FROM 'COMMITTED'
    OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR r.result_data->>'phase' IS DISTINCT FROM 'KEYS' OR r.completed_at IS DISTINCT FROM NEW.posted_at
    OR (SELECT count(*) FROM naijue_erp.import_record s
      CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
      WHERE s.import_batch_id=b.id AND s.target_type='INVENTORY_KEY' AND s.status='IMPORTED'
        AND s.target_id=naijue_erp.standard_inventory_key_id(NEW.warehouse_id,NEW.sku_id)
        AND proof->>'ledger_entry_id'=NEW.id::text AND proof->>'operation_id'=NEW.operation_id::text
        AND proof->'fields'->>'warehouse_id'=NEW.warehouse_id::text AND proof->'fields'->>'sku_id'=NEW.sku_id::text
        AND (proof->'fields'->>'quantity')::bigint=NEW.quantity_delta) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FRESH35_STANDARD_BASELINE_PROOF_REQUIRED' USING ERRCODE='23514';
  END IF;
  -- Mandatory receipt and batch triggers retain complete operation/effect-set closure.
  RETURN NULL;
END;
`;
const finalRecordBody = `
DECLARE b naijue_erp.import_batch%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; proof jsonb;
BEGIN
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id;
  IF NEW.target_type IS DISTINCT FROM 'IMPORT_BATCH' OR NEW.target_id IS DISTINCT FROM b.id
    OR ((b.inventory_mode='CUTOFF_STOCK_BASELINE' AND b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1')
      OR (b.inventory_mode='DOCUMENT_CONVERSION' AND b.mapping_version='DOCUMENT_CONVERSION_V1')) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FRESH35_STANDARD_FINAL_PROOF_REQUIRED' USING ERRCODE='23514';
  END IF;
  proof:=naijue_erp.standard_import_record_proof(NEW.id);
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=(proof->>'operation_id')::uuid;
  IF r.target_type IS DISTINCT FROM 'IMPORT' OR r.target_id IS DISTINCT FROM b.id
    OR r.status IS DISTINCT FROM 'COMMITTED' OR r.completed_at IS DISTINCT FROM NEW.reviewed_at
    OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR proof->>'target_type' IS DISTINCT FROM 'IMPORT_BATCH'
    OR proof->>'batch_id' IS DISTINCT FROM b.id::text OR proof->>'target_id' IS DISTINCT FROM b.id::text
    OR proof->>'entity_type' IS DISTINCT FROM NEW.source_entity_type THEN
    RAISE EXCEPTION 'FRESH35_STANDARD_FINAL_PROOF_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF NEW.source_entity_type='BATCH_NAMESPACE_BINDING' THEN
    IF b.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE' OR NEW.source_key IS DISTINCT FROM b.id::text
      OR proof->'fields'->>'batch_id' IS DISTINCT FROM b.id::text
      OR proof->'fields'->>'source_system' IS DISTINCT FROM b.source_name
      OR proof->'fields'->>'manifest_sha256' IS DISTINCT FROM b.source_hash THEN
      RAISE EXCEPTION 'FRESH35_STANDARD_NAMESPACE_PROOF_REQUIRED' USING ERRCODE='23514';
    END IF;
  ELSE
    IF r.action IS DISTINCT FROM 'IMPORT_PUBLISH' OR b.status IS DISTINCT FROM 'IMPORTED'
      OR b.completed_at IS DISTINCT FROM r.completed_at
      OR NEW.source_entity_type IS DISTINCT FROM CASE b.inventory_mode WHEN 'CUTOFF_STOCK_BASELINE' THEN 'STANDARD_BASELINE_APPROVAL' ELSE 'DOCUMENT_CONVERSION_APPROVAL' END
      OR NEW.source_key IS DISTINCT FROM CASE b.inventory_mode WHEN 'CUTOFF_STOCK_BASELINE' THEN 'FINAL_EXPLICIT_KEYS' ELSE 'FINAL_DOCUMENT_CONVERSION' END
      OR r.result_data->>'phase' IS DISTINCT FROM CASE b.inventory_mode WHEN 'CUTOFF_STOCK_BASELINE' THEN 'BASELINE_SEAL' ELSE 'DOCUMENT_PUBLISH' END THEN
      RAISE EXCEPTION 'FRESH35_STANDARD_FINAL_PROOF_REQUIRED' USING ERRCODE='23514';
    END IF;
  END IF;
  -- Full current-actor, source/effect, publication and counter checks remain mandatory.
  RETURN NULL;
END;
`;
function extractBody(sql, spec) {
  const expression = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION naijue_erp\\.${spec.name}\\(\\)[\\s\\S]*?\\bAS\\s+(\\$(?:[A-Za-z_][A-Za-z0-9_]*)?\\$)([\\s\\S]*?)\\1;`, 'g');
  const matches = [...sql.matchAll(expression)];
  need(matches.length === 1 && hash(matches[0][2]) === spec.before_sha256, 'FRESH35_CORE_EXACT_PREDECESSOR_REQUIRED:' + spec.name);
  return matches[0][2];
}
function batchBody(before) {
  const marker = "  IF TG_OP='UPDATE' THEN";
  need(before.split(marker).length === 2, 'FRESH35_CORE_BATCH_BOUNDARY_DIFFERS');
  const prefix = before.slice(0, before.indexOf(marker));
  need(prefix.includes('assert_standard_import_operation(core_operation)') && prefix.includes('assert_document_conversion_batch('), 'FRESH35_CORE_BATCH_PROOFS_MISSING');
  return prefix + "  RAISE EXCEPTION 'FRESH35_LEGACY_IMPORT_BATCH_RETIRED' USING ERRCODE='23514';\nEND;\n";
}
function specialize(spec, before, originals) {
  switch (spec.name) {
    case 'validate_sparse_balance_commit': {
      const start = before.indexOf("  IF r.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN");
      const end = before.indexOf("  IF TG_OP = 'UPDATE' THEN", start);
      need(start > 0 && end > start && before.slice(start, end).includes('naijue_erp.history_revision'), 'FRESH35_CORE_SPARSE_BOUNDARY_DIFFERS');
      return before.slice(0, start) + "  IF r.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN\n    RAISE EXCEPTION 'FRESH35_HISTORICAL_BALANCE_RETIRED' USING ERRCODE='23514';\n  END IF;\n" + before.slice(end);
    }
    case 'validate_import_accounting_checkpoint_commit':
    case 'validate_import_batch_commit': return batchBody(originals.get('validate_import_batch_commit'));
    case 'validate_import_accounting_baseline_commit': return baselineBody;
    case 'validate_import_accounting_final_record_commit': return finalRecordBody;
    case 'guard_history_numeric_ledger': return historicalLedgerBody;
    case 'validate_history_numeric_receipt_commit': return historicalReceiptBody;
    case 'validate_history_numeric_balance_commit': return historicalBalanceBody;
    case 'history_numeric_ledger_set_guard': return historicalLedgerSetBody;
    case 'validate_import_operation': {
      const marker = "  IF NEW.action='IMPORT_INITIALIZE_BARCODE_SCHEMES' THEN";
      need(before.split(marker).length === 2, 'FRESH35_CORE_OPERATION_BOUNDARY_DIFFERS');
      return before.slice(0, before.indexOf(marker)) + "  RAISE EXCEPTION 'FRESH35_LEGACY_IMPORT_OPERATION_RETIRED' USING ERRCODE='23514';\nEND;\n";
    }
    default: throw Error('FRESH35_CORE_UNKNOWN_SPECIALIZATION');
  }
}
export function specializeFresh35CoreGuardSources(sources) {
  need(Array.isArray(sources) && sources.length === FRESH35_CORE_GUARD_SOURCES.length, 'FRESH35_CORE_EXACT_SOURCE_SET_REQUIRED');
  sources.forEach((source, i) => need(source?.path === FRESH35_CORE_GUARD_SOURCES[i].path && typeof source.sql === 'string'
    && hash(source.sql) === FRESH35_CORE_GUARD_SOURCES[i].sha256, 'FRESH35_CORE_SOURCE_PIN_DIFFERS'));
  const originals = new Map(FRESH35_CORE_GUARD_REPLACEMENTS.map(spec => [spec.name, extractBody(sources.find(source => source.path === spec.source).sql, spec)]));
  return freeze(FRESH35_CORE_GUARD_REPLACEMENTS.map(spec => {
    const before_body = originals.get(spec.name), body = specialize(spec, before_body, originals);
    for (const table of LEGACY_RETIREMENT_CANDIDATE_TABLES) need(!new RegExp('\\bnaijue_erp\\.' + table + '\\b').test(body), 'FRESH35_CORE_LEGACY_REFERENCE_REMAINS');
    need(!/naijue_erp\.(?:assert_core_initialization_v14|assert_barcode_scheme_initialization_v19|assert_native_bootstrap_accounts)\s*\(/.test(body), 'FRESH35_CORE_LEGACY_HELPER_REMAINS');
    need(hash(body) === spec.after_sha256, 'FRESH35_CORE_SUCCESSOR_PIN_DIFFERS:' + spec.name);
    return { ...spec, before_body, body, return_type: 'trigger',
      disposition: 'RETAIN_CORE_TRIGGER_FAIL_CLOSED_RETIRED_LANE', preservedChecks: preserved[spec.name], retiredChecks: retired[spec.name] };
  }));
}
export async function loadFresh35CoreGuardPlan(root) {
  const sources = await Promise.all(FRESH35_CORE_GUARD_SOURCES.map(async source => ({ path: source.path, sql: await readFile(resolve(root, source.path), 'utf8') })));
  const plan = specializeFresh35CoreGuardSources(sources), spec = await loadWholeCatalogSpec(root);
  for (const item of plan) need(spec.pins.some(pin => pin.signature === item.signature && pin.sha256 === item.before_sha256), 'FRESH35_CORE_CURRENT_PREDECESSOR_DIFFERS:' + item.name);
  return plan;
}

/** The retirement composer consumes the plan directly. This separately guarded
 * source artifact cannot authorize a live or populated-target installation. */
export async function renderFresh35CoreGuards(root) {
  const plan = await loadFresh35CoreGuardPlan(root);
  const payload = plan.map(({ signature, before_sha256, after_sha256, body }) => ({ signature, before_sha256, after_sha256, body }));
  const tableSql = LEGACY_ROWTYPE_EXPECTED_TABLES.map(table => `'${table}'`).join(',');
  return `-- GENERATED CORE-GUARD REVIEW ARTIFACT. STANDALONE EXECUTION ALWAYS REFUSED.
-- The final35 composer consumes the pinned plan, not this partial migration.
-- This artifact cannot establish the complete predecessor catalogue or ACL.
-- Exact full-cohort admission and an exclusive reviewed schema-writer window are required.
-- Specializes ten retained trigger functions only. No tables or triggers are removed.
-- Existing populated/history databases are outside this profile. Native business,
-- source identity, explicit zero/unknown, audit/receipt and exact import checks remain.
-- A separate reviewed catalogue/ACL and physical-retirement composition are required.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
SET LOCAL row_security=off;
DO $core_guards$
DECLARE patches constant jsonb := $patches$${JSON.stringify(payload)}$patches$::jsonb;
 expected_tables constant text[] := ARRAY[${tableSql}];
 ns oid; owner_oid oid; item jsonb; relation record; before_routine record; after_routine record;
 definition text; changed text; populated boolean; before_triggers jsonb; before_metadata jsonb; after_metadata jsonb;
BEGIN
 RAISE EXCEPTION 'FRESH35_CORE_COMPOSED_CATALOGUE_REQUIRED' USING ERRCODE='55000';
 SELECT oid,nspowner INTO STRICT ns,owner_oid FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp';
 IF owner_oid IS DISTINCT FROM current_user::regrole::oid
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=owner_oid AND (rolsuper OR rolbypassrls OR rolreplication))
   OR current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
   OR current_setting('transaction_read_only') IS DISTINCT FROM 'off'
   OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger) THEN
   RAISE EXCEPTION 'FRESH35_CORE_ORDINARY_OWNER_READ_COMMITTED_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF (SELECT pg_catalog.array_agg(relname::text ORDER BY relname::text COLLATE "C") FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind IN('r','p','f')) IS DISTINCT FROM expected_tables
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind IN('r','p','f') AND (relkind<>'r' OR relpersistence<>'p' OR relispartition))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i JOIN pg_catalog.pg_class c ON c.oid IN(i.inhrelid,i.inhparent) WHERE c.relnamespace=ns) THEN
   RAISE EXCEPTION 'FRESH35_CORE_EXACT_TABLE_COHORT_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- Every lock is acquired before any data observation, so a concurrent commit
 -- while waiting for a lock is visible under the required isolation level.
 FOR relation IN SELECT * FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind='r' ORDER BY relname LOOP
   IF relation.relowner IS DISTINCT FROM owner_oid OR relation.relforcerowsecurity THEN
     RAISE EXCEPTION 'FRESH35_CORE_VISIBLE_OWNER_TABLE_REQUIRED' USING ERRCODE='42501';
   END IF;
   EXECUTE pg_catalog.format('LOCK TABLE naijue_erp.%I IN ACCESS EXCLUSIVE MODE',relation.relname);
 END LOOP;
 FOR relation IN SELECT * FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind='r' AND relname<>'schema_migration' ORDER BY relname LOOP
   EXECUTE pg_catalog.format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I LIMIT 1)',relation.relname) INTO populated;
   IF populated IS DISTINCT FROM false THEN
     RAISE EXCEPTION 'FRESH35_CORE_FRESH_EMPTY_TARGET_REQUIRED: %',relation.relname USING ERRCODE='23514';
   END IF;
 END LOOP;
 IF (SELECT pg_catalog.array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT pg_catalog.generate_series(1,27))
   OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace=ns)<>178
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE connamespace=ns AND NOT convalidated)
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns) AND tgenabled<>'O') THEN
   RAISE EXCEPTION 'FRESH35_CORE_PREDECESSOR_GUARDS_DIFFER' USING ERRCODE='23514';
 END IF;
 SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.oid) INTO before_triggers FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=ns;
 SELECT pg_catalog.jsonb_agg(CASE WHEN p.oid IN(SELECT (value->>'signature')::regprocedure FROM pg_catalog.jsonb_array_elements(patches))
   THEN pg_catalog.to_jsonb(p)-'prosrc' ELSE pg_catalog.to_jsonb(p) END ORDER BY p.oid) INTO before_metadata FROM pg_catalog.pg_proc p WHERE p.pronamespace=ns;
 -- Validate all predecessors before any replacement. Preserve every metadata
 -- field, including owner, ACL, OID, volatility, security and search path.
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(patches) LOOP
   SELECT * INTO STRICT before_routine FROM pg_catalog.pg_proc WHERE oid=(item->>'signature')::regprocedure;
   IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_routine.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'before_sha256'
     OR before_routine.proowner IS DISTINCT FROM owner_oid OR before_routine.prosecdef
     OR before_routine.prokind<>'f' OR before_routine.provolatile<>'v'
     OR before_routine.proisstrict OR before_routine.proretset OR before_routine.proleakproof OR before_routine.proparallel<>'u'
     OR before_routine.prorettype IS DISTINCT FROM 'pg_catalog.trigger'::regtype::oid
     OR before_routine.prolang IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
     OR before_routine.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp'] THEN
     RAISE EXCEPTION 'FRESH35_CORE_PREDECESSOR_DIFFERS: %',item->>'signature' USING ERRCODE='23514';
   END IF;
 END LOOP;
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(patches) LOOP
   SELECT * INTO STRICT before_routine FROM pg_catalog.pg_proc WHERE oid=(item->>'signature')::regprocedure;
   IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_routine.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'before_sha256' THEN
     RAISE EXCEPTION 'FRESH35_CORE_PREDECESSOR_CHANGED' USING ERRCODE='23514';
   END IF;
   definition:=pg_catalog.pg_get_functiondef(before_routine.oid);
   IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,before_routine.prosrc,'')))
      IS DISTINCT FROM pg_catalog.length(before_routine.prosrc) THEN
     RAISE EXCEPTION 'FRESH35_CORE_BODY_OCCURRENCE_DIFFERS' USING ERRCODE='23514';
   END IF;
   changed:=pg_catalog.replace(definition,before_routine.prosrc,item->>'body');
   EXECUTE changed;
   SELECT * INTO STRICT after_routine FROM pg_catalog.pg_proc WHERE oid=before_routine.oid;
   IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_routine.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'after_sha256'
     OR (pg_catalog.to_jsonb(after_routine)-'prosrc') IS DISTINCT FROM (pg_catalog.to_jsonb(before_routine)-'prosrc') THEN
     RAISE EXCEPTION 'FRESH35_CORE_UNEXPECTED_CHANGE' USING ERRCODE='23514';
   END IF;
 END LOOP;
 SELECT pg_catalog.jsonb_agg(CASE WHEN p.oid IN(SELECT (value->>'signature')::regprocedure FROM pg_catalog.jsonb_array_elements(patches))
   THEN pg_catalog.to_jsonb(p)-'prosrc' ELSE pg_catalog.to_jsonb(p) END ORDER BY p.oid) INTO after_metadata FROM pg_catalog.pg_proc p WHERE p.pronamespace=ns;
 IF after_metadata IS DISTINCT FROM before_metadata OR (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=ns) IS DISTINCT FROM before_triggers THEN
   RAISE EXCEPTION 'FRESH35_CORE_CATALOG_CHANGED' USING ERRCODE='23514';
 END IF;
END $core_guards$;
COMMIT;
`;
}
