/** Fresh-empty-target source specialization only. Never connects or installs.
 * Existing-data/history installations are deliberately outside this profile. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const hash = text => createHash('sha256').update(text).digest('hex');
const need = (value, code) => { if (!value) throw Error(code); };
export const PUBLICATION_ISOLATION_SOURCES = Object.freeze([
  Object.freeze({ path: 'adapters/postgres/patches/0027_standard_import_whole_package_guards_v2.sql', sha256: 'ed96bc73a7f8bf2919f3015542e87628ee6d402f2992ddc5ad5c5f275361177f' }),
  Object.freeze({ path: 'adapters/postgres/patches/0027_standard_import_initialization.sql', sha256: '680fdac8120d35122f8414924ed40fb175c1533a7cfd6b656077cec7242332f1' }),
]);
export const PUBLICATION_GUARDS = Object.freeze([
  'guard_history_publication', 'guard_header_native_reference_publication',
  'guard_native_catalogue_publication', 'guard_native_payment_publication',
  'guard_history_typed_publication', 'guard_import_accounting_publication',
  'guard_successor_publication26',
]);
const marker = ' -- STANDARD27_BRANCH_END';
const baselineTail = `
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
`;
const customerBody = `
DECLARE source_id uuid; matches bigint; proof jsonb;
BEGIN
 IF target IS NULL OR target NOT IN ('2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid) THEN RETURN false; END IF;
 -- These retained IDs are never silently promoted. On a fresh target they
 -- must have a complete standard source/receipt/audit proof, or fail closed.
 SELECT count(*),min(s.id::text)::uuid INTO matches,source_id
 FROM naijue_erp.import_record s JOIN naijue_erp.import_batch b ON b.id=s.import_batch_id
 WHERE s.target_type='CUSTOMER' AND s.source_entity_type='CUSTOMER' AND s.target_id=target
   AND s.status='IMPORTED' AND b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   AND b.inventory_mode='CUTOFF_STOCK_BASELINE' AND b.status IN ('STAGED','VALIDATING','IMPORTED');
 IF matches IS DISTINCT FROM 1 THEN
   RAISE EXCEPTION 'FRESH27_PINNED_CUSTOMER_STANDARD_PROOF_REQUIRED' USING ERRCODE='23514';
 END IF;
 proof:=naijue_erp.standard_import_record_proof(source_id);
 IF proof->>'target_type' IS DISTINCT FROM 'CUSTOMER' OR proof->>'entity_type' IS DISTINCT FROM 'CUSTOMER'
   OR proof->>'target_id' IS DISTINCT FROM target::text OR proof->'fields'->>'id' IS DISTINCT FROM target::text
   OR jsonb_typeof(proof->'source_refs') IS DISTINCT FROM 'array'
   OR jsonb_array_length(proof->'source_refs')<1 THEN
   RAISE EXCEPTION 'FRESH27_PINNED_CUSTOMER_STANDARD_PROOF_INVALID' USING ERRCODE='23514';
 END IF;
 RETURN false;
END;
`;
function routine(sql, name) {
  const matches = [...sql.matchAll(new RegExp(`CREATE OR REPLACE FUNCTION naijue_erp\\.${name}\\(([^)]*)\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`, 'g'))];
  need(matches.length === 1, 'PUBLICATION_ISOLATION_EXACT_ROUTINE_REQUIRED:' + name);
  const [, args, body] = matches[0];
  const types = args.trim() ? args.split(',').map(a => 'pg_catalog.' + a.trim().split(/\s+/).at(-1)).join(',') : '';
  return { signature: `naijue_erp.${name}(${types})`, body };
}
export function specializePublicationSources(sources) {
  need(Array.isArray(sources) && sources.length === PUBLICATION_ISOLATION_SOURCES.length, 'PUBLICATION_ISOLATION_SOURCE_SET_REQUIRED');
  sources.forEach((source, i) => need(source.path === PUBLICATION_ISOLATION_SOURCES[i].path && hash(source.sql) === PUBLICATION_ISOLATION_SOURCES[i].sha256, 'PUBLICATION_ISOLATION_SOURCE_CHANGED'));
  const plan = [];
  for (const name of ['is_native_party_import_insert', ...PUBLICATION_GUARDS, 'is_exact_historical_customer_only']) {
    const source = sources[name === 'is_exact_historical_customer_only' ? 1 : 0];
    const prior = routine(source.sql, name);
    let body;
    if (name === 'is_exact_historical_customer_only') body = customerBody;
    else {
      need(prior.body.split(marker).length === 2, 'PUBLICATION_ISOLATION_BRANCH_MARKER_DIFFERS');
      const standard = prior.body.slice(0, prior.body.indexOf(marker) + marker.length);
      body = standard + (name === 'is_native_party_import_insert'
        ? '\n -- Fresh-only: no legacy creation intent can authorize an ordinary INSERT.\n -- False runs the caller\'s original live receipt/actor/time checks.\n RETURN false;\nEND;\n'
        : baselineTail);
    }
    need(!/naijue_erp\.(?:history_[a-z_]+|import_source_row|native_party_import_evidence|import_header_native_reference|import_native_[a-z_]+|import_record_accounting_claim|import_stock_contributor|import_sku_alias)\b/.test(body), 'PUBLICATION_ISOLATION_LEGACY_REFERENCE_REMAINS');
    plan.push(Object.freeze({ name, signature: prior.signature, source: source.path,
      before_sha256: hash(prior.body), after_sha256: hash(body), body,
      security_definer: !PUBLICATION_GUARDS.includes(name),
      volatility: name === 'is_exact_historical_customer_only' ? 's' : 'v',
      return_type: PUBLICATION_GUARDS.includes(name) ? 'trigger' : 'bool' }));
  }
  return Object.freeze(plan);
}
export async function loadPublicationIsolationPlan(root) {
  const sources = await Promise.all(PUBLICATION_ISOLATION_SOURCES.map(async source => ({ ...source, sql: await readFile(resolve(root, source.path), 'utf8') })));
  return specializePublicationSources(sources);
}
export async function renderPublicationIsolation(root) {
  const plan = await loadPublicationIsolationPlan(root);
  const payload = plan.map(({ name, source, ...item }) => item);
  return `-- SOURCE-ONLY FRESH EMPTY TARGET CANDIDATE. NOT REGISTERED OR ENGINE TESTED.
-- NOT an upgrade for a populated installation, and NOT a physical table removal.
-- No table, trigger, role, privilege, actor, timestamp or historical fact is changed.
-- Requires exclusive reviewed schema installation and a separate successor
-- catalog/profile. Old-profile body pins MUST continue rejecting these bodies.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
SET LOCAL row_security=off;
DO $specialize$
DECLARE item jsonb; relation record; populated boolean; before_routine record;
 after_routine record; definition text; changed text; before_triggers jsonb; after_triggers jsonb;
 patches constant jsonb := $bodies$${JSON.stringify(payload)}$bodies$::jsonb;
BEGIN
 IF current_user::regrole::oid IS DISTINCT FROM (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
   OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=current_user::regrole::oid AND (rolsuper OR rolbypassrls OR rolreplication)) THEN
   RAISE EXCEPTION 'PUBLICATION_ISOLATION_ORDINARY_OWNER_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Refuse unknown relation shapes and lock every table before checking emptiness.
 -- The selected predecessor has 56 tables. This candidate itself removes none.
 IF (SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='r')<>56
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind IN ('p','f')) THEN
   RAISE EXCEPTION 'PUBLICATION_ISOLATION_PREDECESSOR_RELATIONS_DIFFER' USING ERRCODE='23514';
 END IF;
 FOR relation IN SELECT * FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='r' ORDER BY oid LOOP
   IF relation.relowner IS DISTINCT FROM current_user::regrole::oid THEN
     RAISE EXCEPTION 'PUBLICATION_ISOLATION_RELATION_OWNER_DIFFERS' USING ERRCODE='42501';
   END IF;
   EXECUTE format('LOCK TABLE naijue_erp.%I IN ACCESS EXCLUSIVE MODE',relation.relname);
 END LOOP;
 FOR relation IN SELECT * FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='r' AND relname<>'schema_migration' ORDER BY oid LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',relation.relname) INTO populated;
   IF populated IS DISTINCT FROM false THEN
     RAISE EXCEPTION 'PUBLICATION_ISOLATION_FRESH_EMPTY_TARGET_REQUIRED: %',relation.relname USING ERRCODE='23514';
   END IF;
 END LOOP;
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,27)) THEN
   RAISE EXCEPTION 'PUBLICATION_ISOLATION_SCHEMA_CHAIN_DIFFERS' USING ERRCODE='23514';
 END IF;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) INTO before_triggers FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='naijue_erp'::regnamespace;
 -- Validate all nine predecessors before changing any body. ACL preservation
 -- does not certify an ACL; exact external catalog admission remains mandatory.
 FOR item IN SELECT value FROM jsonb_array_elements(patches) LOOP
   SELECT * INTO STRICT before_routine FROM pg_catalog.pg_proc WHERE oid=(item->>'signature')::regprocedure;
   IF encode(sha256(convert_to(before_routine.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'before_sha256'
     OR before_routine.proowner IS DISTINCT FROM current_user::regrole::oid
     OR before_routine.prosecdef IS DISTINCT FROM (item->>'security_definer')::boolean
     OR before_routine.provolatile::text IS DISTINCT FROM item->>'volatility'
     OR before_routine.prokind<>'f' OR before_routine.proisstrict OR before_routine.proretset OR before_routine.proleakproof
     OR before_routine.proparallel<>'u'
     OR before_routine.prorettype IS DISTINCT FROM ('pg_catalog.'||(item->>'return_type'))::regtype::oid
     OR before_routine.prolang IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
     OR before_routine.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp'] THEN
     RAISE EXCEPTION 'PUBLICATION_ISOLATION_PREDECESSOR_DIFFERS: %',item->>'signature' USING ERRCODE='23514';
   END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(patches) LOOP
   SELECT * INTO STRICT before_routine FROM pg_catalog.pg_proc WHERE oid=(item->>'signature')::regprocedure;
   IF encode(sha256(convert_to(before_routine.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'before_sha256' THEN
     RAISE EXCEPTION 'PUBLICATION_ISOLATION_PREDECESSOR_CHANGED' USING ERRCODE='23514';
   END IF;
   definition:=pg_catalog.pg_get_functiondef(before_routine.oid);
   IF (length(definition)-length(replace(definition,before_routine.prosrc,''))) IS DISTINCT FROM length(before_routine.prosrc) THEN
     RAISE EXCEPTION 'PUBLICATION_ISOLATION_BODY_OCCURRENCE_DIFFERS' USING ERRCODE='23514';
   END IF;
   changed:=replace(definition,before_routine.prosrc,item->>'body');
   EXECUTE changed;
   SELECT * INTO STRICT after_routine FROM pg_catalog.pg_proc WHERE oid=before_routine.oid;
   IF encode(sha256(convert_to(after_routine.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'after_sha256'
     OR (to_jsonb(after_routine)-'prosrc') IS DISTINCT FROM (to_jsonb(before_routine)-'prosrc') THEN
     RAISE EXCEPTION 'PUBLICATION_ISOLATION_UNEXPECTED_CHANGE' USING ERRCODE='23514';
   END IF;
 END LOOP;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) INTO after_triggers FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='naijue_erp'::regnamespace;
 IF after_triggers IS DISTINCT FROM before_triggers THEN
   RAISE EXCEPTION 'PUBLICATION_ISOLATION_TRIGGERS_CHANGED' USING ERRCODE='23514';
 END IF;
END $specialize$;
COMMIT;
`;
}
