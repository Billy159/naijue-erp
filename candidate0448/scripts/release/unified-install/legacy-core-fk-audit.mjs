/** Read-only FK inventory for the final isolated PostgreSQL acceptance.
 * No connection, transaction management, schema changes or catalogue admission.
 * Caller owns an existing read-only REPEATABLE READ transaction and credentials.
 * The result proves only these seven edges/checks, not complete retirement. */
import { LEGACY_RETIREMENT_CANDIDATE_TABLES } from './legacy-dependency-source-report.mjs';
export const CORE_HISTORY_EDGES = Object.freeze([{"table":"operation_receipt","column":"target_history_sales_id","target":"history_sales_header","fk":"operation_receipt_target_history_sales_id_fkey","check":"ordinary_only_target_history_sales_id","deferred":true,"generated":"s"},{"table":"operation_receipt","column":"target_history_transfer_id","target":"history_transfer_header","fk":"operation_receipt_target_history_transfer_id_fkey","check":"ordinary_only_target_history_transfer_id","deferred":true,"generated":"s"},{"table":"audit_change","column":"object_history_sales_id","target":"history_sales_header","fk":"audit_change_object_history_sales_id_fkey","check":"ordinary_only_object_history_sales_id","deferred":true,"generated":"s"},{"table":"audit_change","column":"object_history_transfer_id","target":"history_transfer_header","fk":"audit_change_object_history_transfer_id_fkey","check":"ordinary_only_object_history_transfer_id","deferred":true,"generated":"s"},{"table":"inventory_ledger","column":"source_history_revision_id","target":"history_revision","fk":"inventory_ledger_source_history_revision_id_fkey","check":"ordinary_only_source_history_revision_id","deferred":true,"generated":""},{"table":"inventory_ledger","column":"source_history_sales_line_id","target":"history_sales_line","fk":"inventory_ledger_source_history_sales_line_id_fkey","check":"ordinary_only_source_history_sales_line_id","deferred":false,"generated":""},{"table":"inventory_ledger","column":"source_history_transfer_line_id","target":"history_transfer_line","fk":"inventory_ledger_source_history_transfer_line_id_fkey","check":"ordinary_only_source_history_transfer_line_id","deferred":false,"generated":""}].map(Object.freeze));
const expectedGeneratedExpression = edge => {
  const prefix = edge.table === 'operation_receipt' ? 'target' : 'object';
  const kind = edge.target === 'history_sales_header' ? 'HISTORY_SALES' : 'HISTORY_TRANSFER';
  return `CASE WHEN (${prefix}_type = '${kind}'::text) THEN ${prefix}_id ELSE NULL::uuid END`;
};
const need = (condition, code) => { if (!condition) throw new Error(code); };
const core = ['operation_receipt', 'audit_change', 'inventory_ledger'];
const usage = core.map(table => `SELECT '${table}' AS table_name, pg_catalog.count(*)::pg_catalog.text AS row_count, (${
  CORE_HISTORY_EDGES.filter(edge => edge.table === table)
    .map(edge => `pg_catalog.count(*) FILTER (WHERE ${edge.column} IS NOT NULL)`).join('+')
})::pg_catalog.text AS history_value_count FROM naijue_erp.${table}`).join(' UNION ALL ');
export const CORE_HISTORY_FK_QUERY = `WITH ns AS (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp'),
 rels AS (SELECT c.* FROM pg_catalog.pg_class c WHERE c.relnamespace=(SELECT oid FROM ns)),
 core AS (SELECT c.* FROM rels c WHERE c.relname=ANY($2::pg_catalog.text[])),
 fk_rows AS (SELECT c.conname::pg_catalog.text AS name,s.relname::pg_catalog.text AS table_name,t.relname::pg_catalog.text AS target,
   ARRAY(SELECT a.attname::pg_catalog.text FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,
   ARRAY(SELECT a.attname::pg_catalog.text FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.o) AS target_columns,
   c.convalidated AS validated,c.condeferrable AS deferrable,c.condeferred AS deferred,
   c.confupdtype::pg_catalog.text AS on_update,c.confdeltype::pg_catalog.text AS on_delete,c.confmatchtype::pg_catalog.text AS match,
   c.conislocal AS local,c.coninhcount AS inherited,c.conparentid::pg_catalog.text AS parent,
   (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('enabled',tr.tgenabled::pg_catalog.text,
      'internal',tr.tgisinternal,'function',pr.proname::pg_catalog.text,'schema',pn.nspname::pg_catalog.text,
      'table_name',CASE WHEN tr.tgrelid=c.conrelid THEN s.relname::pg_catalog.text
        WHEN tr.tgrelid=c.confrelid THEN t.relname::pg_catalog.text ELSE NULL END,
      'type',tr.tgtype,'deferrable',tr.tgdeferrable,'deferred',tr.tginitdeferred,
      'parent',tr.tgparentid::pg_catalog.text) ORDER BY pr.proname)
    FROM pg_catalog.pg_trigger tr JOIN pg_catalog.pg_proc pr ON pr.oid=tr.tgfoid
    JOIN pg_catalog.pg_namespace pn ON pn.oid=pr.pronamespace WHERE tr.tgconstraint=c.oid) AS ri_triggers
   FROM pg_catalog.pg_constraint c JOIN rels s ON s.oid=c.conrelid JOIN rels t ON t.oid=c.confrelid
   WHERE c.contype='f' AND NOT(s.relname=ANY($1::pg_catalog.text[])) AND t.relname=ANY($1::pg_catalog.text[])),
 checks AS (SELECT c.conname::pg_catalog.text AS name,t.relname::pg_catalog.text AS table_name,c.convalidated AS validated,
   c.contype::pg_catalog.text AS type,c.connoinherit AS no_inherit,pg_catalog.pg_get_expr(c.conbin,c.conrelid) AS expression,
   c.conislocal AS local,c.coninhcount AS inherited,c.conparentid::pg_catalog.text AS parent
   FROM pg_catalog.pg_constraint c JOIN rels t ON t.oid=c.conrelid WHERE c.conname=ANY($3::pg_catalog.text[])),
 columns AS (SELECT t.relname::pg_catalog.text AS table_name,a.attname::pg_catalog.text AS name,a.atttypid::pg_catalog.regtype::pg_catalog.text AS type,
   a.attnotnull AS not_null,a.attgenerated::pg_catalog.text AS generated,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS expression
   FROM core t JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE NOT a.attisdropped AND a.attname=ANY($4::pg_catalog.text[])),
 usage AS (${usage})
 SELECT pg_catalog.jsonb_build_object('format','CORE_HISTORY_FK_INVENTORY_V1',
  'context',pg_catalog.jsonb_build_object('database',pg_catalog.current_database(),'read_only',pg_catalog.current_setting('transaction_read_only'),
    'search_path',pg_catalog.current_setting('search_path'),
    'isolation',pg_catalog.current_setting('transaction_isolation'),'replication_role',pg_catalog.current_setting('session_replication_role'),
    'core_table_count',(SELECT pg_catalog.count(*) FROM core),
    'core_relation_shape_ok',(SELECT COALESCE(pg_catalog.bool_and(relkind='r' AND relpersistence='p' AND NOT relispartition
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE core.oid IN(i.inhrelid,i.inhparent))),false) FROM core),
    'row_security_active',(SELECT COALESCE(pg_catalog.bool_or(pg_catalog.row_security_active(oid)),true) FROM core)),
  'foreign_keys',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.table_name,f.name) FROM fk_rows f),'[]'::pg_catalog.jsonb),
  'replacement_checks',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY c.table_name,c.name) FROM checks c),'[]'::pg_catalog.jsonb),
  'columns',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY c.table_name,c.name) FROM columns c),'[]'::pg_catalog.jsonb),
  'usage',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(u) ORDER BY u.table_name) FROM usage u),'[]'::pg_catalog.jsonb)) AS packet`;

export function verifyCoreHistoryFkPacket(packet, profile) {
  need(['PREDECESSOR_WITH_HISTORY_FKS', 'FRESH_ORDINARY_NULL_ONLY'].includes(profile), 'CORE_HISTORY_FK_PROFILE_REQUIRED');
  need(packet?.format === 'CORE_HISTORY_FK_INVENTORY_V1', 'CORE_HISTORY_FK_PACKET_REQUIRED');
  const context = packet.context;
  need(context?.search_path === 'pg_catalog, naijue_erp, pg_temp' && context.read_only === 'on' && context.isolation === 'repeatable read' && context.replication_role === 'origin'
    && context.core_table_count === 3 && context.core_relation_shape_ok === true && context.row_security_active === false
    && typeof context.database === 'string' && context.database.length > 0, 'CORE_HISTORY_FK_READ_ONLY_VISIBLE_SNAPSHOT_REQUIRED');
  for (const name of ['foreign_keys', 'replacement_checks', 'columns', 'usage']) need(Array.isArray(packet[name]), 'CORE_HISTORY_FK_ARRAY_REQUIRED');
  need(packet.columns.length === 7, 'CORE_HISTORY_FK_COLUMNS_DIFFER');
  for (const edge of CORE_HISTORY_EDGES) {
    const columns = packet.columns.filter(c => c.table_name === edge.table && c.name === edge.column);
    need(columns.length === 1 && columns[0].type === 'uuid' && columns[0].not_null === false
      && columns[0].generated === edge.generated, 'CORE_HISTORY_FK_COLUMNS_DIFFER');
    // Fail closed on any expression change. Whitespace alone is ignored because
    // pg_get_expr emits line breaks; no SQL rewrite or arbitrary parser is used.
    need(edge.generated ? typeof columns[0].expression === 'string'
      && columns[0].expression.replace(/\s+/g, ' ').trim() === expectedGeneratedExpression(edge)
      : columns[0].expression === null,
      'CORE_HISTORY_FK_COLUMNS_DIFFER');
  }
  need(packet.usage.length === 3 && core.every(table => packet.usage.filter(u => u.table_name === table).length === 1), 'CORE_HISTORY_FK_USAGE_DIFFERS');
  for (const item of packet.usage) {
    need(typeof item.row_count === 'string' && /^(0|[1-9][0-9]*)$/.test(item.row_count)
      && (typeof item.history_value_count === 'string' || Number.isSafeInteger(item.history_value_count))
      && /^(0|[1-9][0-9]*)$/.test(String(item.history_value_count)), 'CORE_HISTORY_FK_USAGE_DIFFERS');
  }
  if (profile === 'PREDECESSOR_WITH_HISTORY_FKS') {
    need(packet.foreign_keys.length === 7 && packet.replacement_checks.length === 0, 'CORE_HISTORY_FK_PREDECESSOR_EDGES_DIFFER');
    for (const edge of CORE_HISTORY_EDGES) {
      const found = packet.foreign_keys.filter(f => f.table_name === edge.table && f.name === edge.fk);
      need(found.length === 1, 'CORE_HISTORY_FK_PREDECESSOR_EDGES_DIFFER');
      const f = found[0];
      need(f.target === edge.target && JSON.stringify(f.columns) === JSON.stringify([edge.column])
        && JSON.stringify(f.target_columns) === '["id"]' && f.validated === true
        && f.deferrable === edge.deferred && f.deferred === edge.deferred && f.on_update === 'a'
        && f.on_delete === 'a' && f.match === 's' && f.local === true && f.inherited === 0 && f.parent === '0',
      'CORE_HISTORY_FK_PREDECESSOR_EDGES_DIFFER');
      need(Array.isArray(f.ri_triggers) && f.ri_triggers.length === 4, 'CORE_HISTORY_FK_RI_GUARANTEES_DIFFER');
      for (const [name, table, type] of [['RI_FKey_check_ins', edge.table, 5], ['RI_FKey_check_upd', edge.table, 17],
        ['RI_FKey_noaction_del', edge.target, 9], ['RI_FKey_noaction_upd', edge.target, 17]]) {
        const triggers = f.ri_triggers.filter(t => t.function === name);
        need(triggers.length === 1 && triggers[0].enabled === 'O' && triggers[0].internal === true
          && triggers[0].schema === 'pg_catalog' && triggers[0].table_name === table && triggers[0].type === type
          && triggers[0].deferrable === edge.deferred && triggers[0].deferred === edge.deferred
          && triggers[0].parent === '0', 'CORE_HISTORY_FK_RI_GUARANTEES_DIFFER');
      }
    }
  } else {
    need(packet.foreign_keys.length === 0 && packet.replacement_checks.length === 7, 'CORE_HISTORY_FK_SUCCESSOR_EDGES_DIFFER');
    for (const edge of CORE_HISTORY_EDGES) {
      const found = packet.replacement_checks.filter(c => c.table_name === edge.table && c.name === edge.check);
      need(found.length === 1 && found[0].type === 'c' && found[0].validated === true
        && found[0].expression === `(${edge.column} IS NULL)` && found[0].local === true
        && found[0].inherited === 0 && found[0].parent === '0' && found[0].no_inherit === false, 'CORE_HISTORY_FK_SUCCESSOR_EDGES_DIFFER');
    }
    need(packet.usage.every(u => String(u.history_value_count) === '0'), 'CORE_HISTORY_FK_LEGACY_VALUE_PRESENT');
  }
  return Object.freeze({ profile, direct_core_history_fk_count: packet.foreign_keys.length,
    null_only_check_count: packet.replacement_checks.length, database: context.database,
    complete_retirement_proof: false, installation_or_drop_authority: false });
}

export const CORE_HISTORY_FK_CONTEXT_QUERY = `SELECT pg_catalog.current_setting('search_path') AS search_path,
  pg_catalog.current_setting('transaction_read_only') AS read_only,
  pg_catalog.current_setting('transaction_isolation') AS isolation,
  pg_catalog.current_setting('session_replication_role') AS replication_role`;
export async function collectCoreHistoryFkInventory(client, profile) {
  // No SET/BEGIN/COMMIT/ROLLBACK and no fallback connection. Caller supplies the
  // transaction and does not expose credentials or row data to this helper.
  // Check settings using only explicitly qualified built-ins before any catalog
  // query whose operators resolve under the ambient search path. The caller
  // must keep this same client exclusive throughout the observation.
  const setup = await client.query(CORE_HISTORY_FK_CONTEXT_QUERY);
  const setupAck = setup && Object.getOwnPropertyDescriptor(setup, 'command');
  need(setupAck && Object.hasOwn(setupAck, 'value') && setupAck.value === 'SELECT' && setup.rows?.length === 1,
    'CORE_HISTORY_FK_CONTEXT_NOT_ACKNOWLEDGED');
  const context = setup.rows[0];
  need(context.search_path === 'pg_catalog, naijue_erp, pg_temp' && context.read_only === 'on'
    && context.isolation === 'repeatable read' && context.replication_role === 'origin',
    'CORE_HISTORY_FK_READ_ONLY_VISIBLE_SNAPSHOT_REQUIRED');
  const result = await client.query(CORE_HISTORY_FK_QUERY, [LEGACY_RETIREMENT_CANDIDATE_TABLES,
    core, CORE_HISTORY_EDGES.map(e => e.check), CORE_HISTORY_EDGES.map(e => e.column)]);
  const ack = result && Object.getOwnPropertyDescriptor(result, 'command');
  need(ack && Object.hasOwn(ack, 'value') && ack.value === 'SELECT' && result.rows?.length === 1,
    'CORE_HISTORY_FK_QUERY_NOT_ACKNOWLEDGED');
  const packet = result.rows[0].packet;
  return { packet, result: verifyCoreHistoryFkPacket(packet, profile) };
}
