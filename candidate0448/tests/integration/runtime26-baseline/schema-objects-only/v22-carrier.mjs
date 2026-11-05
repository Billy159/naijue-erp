import{assertPlan,targetSnapshot,targetGuard,need,literal,identifier,SHA}from'./source-plan.mjs';
export function zeroSentinel(t){t=targetSnapshot(t);return `DO $dot_zero$ BEGIN IF
 EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp' AND has_schema_privilege(${literal(t.sentinel)},oid,'USAGE'))
 OR EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace CROSS JOIN(VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(priv) WHERE n.nspname='naijue_erp' AND r.relkind IN('r','p') AND has_table_privilege(${literal(t.sentinel)},r.oid,p.priv))
 OR EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped CROSS JOIN(VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(priv) WHERE n.nspname='naijue_erp' AND r.relkind IN('r','p') AND has_column_privilege(${literal(t.sentinel)},r.oid,a.attnum,p.priv))
 OR EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace CROSS JOIN(VALUES('SELECT'),('USAGE'),('UPDATE')) p(priv) WHERE n.nspname='naijue_erp' AND r.relkind='S' AND has_sequence_privilege(${literal(t.sentinel)},r.oid,p.priv))
 THEN RAISE EXCEPTION 'DOT_SENTINEL_RELATION_RIGHTS_NOT_ZERO'; END IF; END $dot_zero$;`;}
export function v22Carrier(plan,input){assertPlan(plan);const t=targetSnapshot(input),v=plan.v22;need(v.parents.length===131&&SHA(v.definition)===v.definitionSha256,'EXACT_131_AND_ORIGINAL_MEMBER_REQUIRED');
 const sql=`BEGIN; SET LOCAL search_path=pg_catalog;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';
${targetGuard(t)}\n${zeroSentinel(t)}\nSET LOCAL ROLE ${identifier(t.owner)};
GRANT UPDATE(history_expected_counts,history_payload_hash) ON naijue_erp.import_batch TO ${identifier(t.sentinel)};
DO $dot_parent$ DECLARE expected jsonb:=${literal(JSON.stringify(v.parents))}::jsonb;f jsonb; BEGIN
 IF current_user<>${literal(t.owner)} OR session_user<>${literal(t.admin)} OR (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,26)) OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' AND p.prokind IN('f','p'))<>131 OR NOT has_column_privilege(${literal(t.sentinel)},'naijue_erp.import_batch','history_expected_counts','UPDATE') OR NOT has_column_privilege(${literal(t.sentinel)},'naijue_erp.import_batch','history_payload_hash','UPDATE') THEN RAISE EXCEPTION 'DOT_V22_SCHEMA_131_TWO_CELL_PARENT_REQUIRED'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(expected) LOOP IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f->>'signature') AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=f->>'body' AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f->>'definition') THEN RAISE EXCEPTION 'DOT_V22_ORIGINAL_131_FULL_PARENT_MISMATCH'; END IF;END LOOP;END $dot_parent$;
${v.definition}
REVOKE UPDATE(history_expected_counts,history_payload_hash) ON naijue_erp.import_batch FROM ${identifier(t.sentinel)};
RESET ROLE;\n${zeroSentinel(t)}\n${targetGuard(t)}\nCOMMIT;\n`;
 return Object.freeze({sql,sha256:SHA(sql),originalMemberSha256:v.definitionSha256,sourceFingerprint:plan.sourceFingerprint,scope:'ATOMIC_TWO_NOLOGIN_SENTINEL_CELLS_NOT_RUNTIME_ACL'});
}
